import { describe, it, expect } from 'vitest';
import {
  ProviderRegistry, permitted, policyFromEnv, alignByPosition,
  ProviderUnavailableError, OcrProvider, OcrResult,
} from '../../src/lib/ocr/providers';

function fake(
  name: string,
  opts: Partial<OcrProvider> & { text?: string; fail?: string; words?: string[] } = {},
): OcrProvider {
  return {
    name,
    kind: opts.kind ?? 'LOCAL',
    supportsHandwriting: opts.supportsHandwriting ?? false,
    sendsDataExternally: opts.sendsDataExternally ?? false,
    available: opts.available ?? (async () => true),
    recognise: async (): Promise<OcrResult> => {
      if (opts.fail) throw new Error(opts.fail);
      const words = (opts.words ?? (opts.text ?? 'hello').split(' '))
        .map((t) => ({ text: t, confidence: 0.9 }));
      return {
        provider: name, modelVersion: 'v1',
        text: opts.text ?? words.map((w) => w.text).join(' '),
        words, confidence: 0.9, durationMs: 1,
      };
    },
  };
}

const policy = (over: Partial<ReturnType<typeof policyFromEnv>> = {}) => ({
  enabled: ['tesseract'], externalProcessingAccepted: false, disabled: false, ...over,
});

describe('policyFromEnv', () => {
  it('defaults to tesseract only', () => {
    expect(policyFromEnv({} as NodeJS.ProcessEnv).enabled).toEqual(['tesseract']);
  });

  it('does NOT accept external processing by default', () => {
    expect(policyFromEnv({} as NodeJS.ProcessEnv).externalProcessingAccepted).toBe(false);
  });

  it('treats anything but the exact word as a no', () => {
    // A typo must fail closed. "true", "1" and "YES" are all not-yes here,
    // because the consequence of a false positive is a patient's consent form
    // arriving at a third party.
    for (const value of ['true', '1', 'Yes', 'YES', 'accepted']) {
      expect(policyFromEnv({ OCR_EXTERNAL_PROCESSING_ACCEPTED: value } as NodeJS.ProcessEnv)
        .externalProcessingAccepted).toBe(false);
    }
    expect(policyFromEnv({ OCR_EXTERNAL_PROCESSING_ACCEPTED: 'yes' } as NodeJS.ProcessEnv)
      .externalProcessingAccepted).toBe(true);
  });
});

describe('permitted — the gate that keeps documents in the hospital', () => {
  const cloud = fake('azure', { kind: 'CLOUD', sendsDataExternally: true });

  it('refuses a cloud provider even when it is enabled', () => {
    const verdict = permitted(cloud, policy({ enabled: ['azure'] }));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/outside the hospital/i);
  });

  it('allows it once external processing has been accepted', () => {
    const verdict = permitted(cloud, policy({ enabled: ['azure'], externalProcessingAccepted: true }));
    expect(verdict.ok).toBe(true);
  });

  it('still refuses a cloud provider that was never enabled', () => {
    const verdict = permitted(cloud, policy({ enabled: [], externalProcessingAccepted: true }));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/not been enabled/i);
  });

  it('the kill switch beats everything', () => {
    const verdict = permitted(fake('tesseract'), policy({ disabled: true, enabled: ['tesseract'] }));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/switched off/i);
  });

  it('allows a local provider that was enabled', () => {
    expect(permitted(fake('tesseract'), policy()).ok).toBe(true);
  });
});

describe('ProviderRegistry', () => {
  it('runs the enabled provider', async () => {
    const registry = new ProviderRegistry().register(fake('tesseract', { text: 'a page' }));
    const result = await registry.recognise(Buffer.from('x'), 'image/jpeg', policy());
    expect(result.text).toBe('a page');
  });

  it('falls back when the first provider throws', async () => {
    const registry = new ProviderRegistry()
      .register(fake('paddleocr', { fail: 'python missing' }))
      .register(fake('tesseract', { text: 'fallback read' }));
    const result = await registry.recognise(Buffer.from('x'), 'image/jpeg',
      policy({ enabled: ['paddleocr', 'tesseract'] }));
    expect(result.text).toBe('fallback read');
  });

  it('honours the administrator ordering, not its own preference', async () => {
    const registry = new ProviderRegistry()
      .register(fake('paddleocr', { text: 'paddle' }))
      .register(fake('tesseract', { text: 'tesseract' }));
    const first = await registry.recognise(Buffer.from('x'), 'image/jpeg',
      policy({ enabled: ['paddleocr', 'tesseract'] }));
    const second = await registry.recognise(Buffer.from('x'), 'image/jpeg',
      policy({ enabled: ['tesseract', 'paddleocr'] }));
    expect(first.text).toBe('paddle');
    expect(second.text).toBe('tesseract');
  });

  it('skips a provider that is not available on this machine', async () => {
    const registry = new ProviderRegistry()
      .register(fake('paddleocr', { available: async () => false, text: 'paddle' }))
      .register(fake('tesseract', { text: 'tesseract' }));
    const result = await registry.recognise(Buffer.from('x'), 'image/jpeg',
      policy({ enabled: ['paddleocr', 'tesseract'] }));
    expect(result.text).toBe('tesseract');
  });

  it('says what each provider said when they all fail', async () => {
    // Three faults in this project were prolonged by handlers that replaced the
    // cause with a guess. "Everything failed" must name the reasons.
    const registry = new ProviderRegistry()
      .register(fake('paddleocr', { fail: 'python missing' }))
      .register(fake('tesseract', { fail: 'wasm core absent' }));
    await expect(
      registry.recognise(Buffer.from('x'), 'image/jpeg', policy({ enabled: ['paddleocr', 'tesseract'] })),
    ).rejects.toThrow(/python missing.*wasm core absent|wasm core absent.*python missing/);
  });

  it('explains why nothing could run', async () => {
    const registry = new ProviderRegistry()
      .register(fake('azure', { kind: 'CLOUD', sendsDataExternally: true }));
    await expect(
      registry.recognise(Buffer.from('x'), 'image/jpeg', policy({ enabled: ['azure'] })),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('NEVER runs a cloud provider without acceptance, even as a fallback', async () => {
    // The failure that matters: the local engine dies and a patient's document
    // quietly goes to a third party to rescue the request.
    let cloudRan = false;
    const cloud: OcrProvider = {
      ...fake('azure', { kind: 'CLOUD', sendsDataExternally: true }),
      recognise: async () => { cloudRan = true; throw new Error('should never run'); },
    };
    const registry = new ProviderRegistry()
      .register(fake('tesseract', { fail: 'engine died' }))
      .register(cloud);
    await expect(
      registry.recognise(Buffer.from('x'), 'image/jpeg', policy({ enabled: ['tesseract', 'azure'] })),
    ).rejects.toThrow();
    expect(cloudRan).toBe(false);
  });

  it('recogniseAll returns every result including the failures', async () => {
    const registry = new ProviderRegistry()
      .register(fake('paddleocr', { text: 'paddle read' }))
      .register(fake('tesseract', { fail: 'broken' }));
    const all = await registry.recogniseAll(Buffer.from('x'), 'image/jpeg',
      policy({ enabled: ['paddleocr', 'tesseract'] }));
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.provider === 'paddleocr')?.result?.text).toBe('paddle read');
    expect(all.find((r) => r.provider === 'tesseract')?.error).toMatch(/broken/);
  });
});

describe('alignByPosition', () => {
  const make = (name: string, words: string[]): OcrResult => ({
    provider: name, modelVersion: null, text: words.join(' '),
    words: words.map((t) => ({ text: t, confidence: 0.9 })),
    confidence: 0.9, durationMs: 1,
  });

  it('reports no alternatives when engines agree', () => {
    const aligned = alignByPosition([
      make('a', ['give', '5', 'mg']), make('b', ['give', '5', 'mg']),
    ]);
    expect(aligned.every((w) => w.alternatives.length === 0)).toBe(true);
  });

  it('surfaces a disagreement on a dose', () => {
    const aligned = alignByPosition([
      make('a', ['give', '5', 'mg']), make('b', ['give', '15', 'mg']),
    ]);
    expect(aligned[1].text).toBe('5');
    expect(aligned[1].alternatives).toContain('15');
  });

  it('ignores a difference of case only', () => {
    const aligned = alignByPosition([make('a', ['Stable']), make('b', ['stable'])]);
    expect(aligned[0].alternatives).toHaveLength(0);
  });

  it('does not drop words the primary engine missed', () => {
    // A shorter primary must not silently truncate what another engine found.
    const aligned = alignByPosition([make('a', ['give']), make('b', ['give', '5', 'mg'])]);
    expect(aligned).toHaveLength(3);
    expect(aligned[1].alternatives).toContain('5');
  });

  it('is empty for no results rather than throwing', () => {
    expect(alignByPosition([])).toEqual([]);
  });
});
