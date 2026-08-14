/**
 * OCR providers, and the rules about which one may run.
 *
 * The measured reason this exists: tesseract, the engine in production, reads
 * 4.7% of numbers and drug names correctly on real African clinical
 * handwriting, with 21 order-of-magnitude errors across 62 documents. It is
 * adequate on printed text and useless on the document type this module was
 * built for. So a second engine is not an architectural nicety, it is the
 * feature.
 *
 * The safety rules are enforced HERE rather than by whoever calls it, because
 * the one that matters most — never sending a patient's document to a third
 * party by accident — must not depend on a caller remembering.
 */

export type ProviderKind = 'LOCAL' | 'CLOUD';

export interface OcrWord {
  text: string;
  /** 0-1. Null when the engine does not report one. */
  confidence: number | null;
  bbox?: { x: number; y: number; width: number; height: number };
  isHandwritten?: boolean;
}

export interface OcrResult {
  provider: string;
  modelVersion: string | null;
  text: string;
  words: OcrWord[];
  /** 0-1, or null when unknown. Never invented from nothing. */
  confidence: number | null;
  durationMs: number;
}

export interface OcrProvider {
  readonly name: string;
  readonly kind: ProviderKind;
  readonly supportsHandwriting: boolean;
  /**
   * True when using this provider transmits the document off the hospital's
   * own machines. Drives the consent gate below; a provider that lies here
   * defeats the whole control, so it is a required field rather than optional.
   */
  readonly sendsDataExternally: boolean;
  /** Whether it can run right now on this node. */
  available(): Promise<boolean>;
  recognise(image: Buffer, mimeType: string): Promise<OcrResult>;
}

export class ProviderUnavailableError extends Error {}
export class ProviderNotPermittedError extends Error {}

// ---------------------------------------------------------------------------
// The consent gate
// ---------------------------------------------------------------------------

export interface ProviderPolicy {
  /** Names of providers an administrator has deliberately enabled. */
  enabled: string[];
  /**
   * Set only when the hospital has accepted a data-processing arrangement.
   * Without it, no provider that transmits documents may run — not for a
   * benchmark, not "just to test", not for one page.
   */
  externalProcessingAccepted: boolean;
  /** Stops everything, like the communications kill switch. */
  disabled?: boolean;
}

export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderPolicy {
  return {
    enabled: (env.OCR_PROVIDERS ?? 'tesseract')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // Anything other than the exact word is a no. A typo must fail closed.
    externalProcessingAccepted: env.OCR_EXTERNAL_PROCESSING_ACCEPTED === 'yes',
    disabled: env.OCR_DISABLED === 'true',
  };
}

/**
 * May this provider run, and if not, why in words a person can act on.
 *
 * Order matters: the kill switch is checked first so it cannot be argued with,
 * then the external-processing gate, then whether it was enabled at all.
 */
export function permitted(
  provider: OcrProvider,
  policy: ProviderPolicy,
): { ok: boolean; reason: string } {
  if (policy.disabled) {
    return { ok: false, reason: 'Text recognition is switched off.' };
  }
  if (provider.sendsDataExternally && !policy.externalProcessingAccepted) {
    return {
      ok: false,
      reason: `${provider.name} sends documents outside the hospital. It stays off until `
        + 'UNTH has accepted a data-processing arrangement '
        + '(OCR_EXTERNAL_PROCESSING_ACCEPTED=yes).',
    };
  }
  if (!policy.enabled.includes(provider.name.toLowerCase())) {
    return { ok: false, reason: `${provider.name} has not been enabled by an administrator.` };
  }
  return { ok: true, reason: 'Permitted.' };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private readonly providers = new Map<string, OcrProvider>();

  register(provider: OcrProvider): this {
    this.providers.set(provider.name.toLowerCase(), provider);
    return this;
  }

  get(name: string): OcrProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  all(): OcrProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Providers that may run, in the order the policy lists them.
   *
   * The order is the administrator's preference, not a ranking this code
   * invents — which engine is best is a measured question and the answer
   * belongs in configuration, not in a hard-coded list.
   */
  async usable(policy: ProviderPolicy): Promise<OcrProvider[]> {
    const out: OcrProvider[] = [];
    for (const name of policy.enabled) {
      const provider = this.providers.get(name);
      if (!provider) continue;
      if (!permitted(provider, policy).ok) continue;
      if (!(await provider.available())) continue;
      out.push(provider);
    }
    return out;
  }

  /**
   * Run the first provider that works, falling back through the rest.
   *
   * Every failure is collected and reported together. An earlier fault in this
   * project was prolonged three times by error handling that replaced the cause
   * with a guess, so "all providers failed" must say what each one said.
   */
  async recognise(
    image: Buffer,
    mimeType: string,
    policy: ProviderPolicy,
  ): Promise<OcrResult> {
    const usable = await this.usable(policy);
    if (usable.length === 0) {
      const reasons = policy.enabled.map((name) => {
        const provider = this.providers.get(name);
        if (!provider) return `${name}: not registered`;
        return `${name}: ${permitted(provider, policy).ok ? 'not available on this machine' : permitted(provider, policy).reason}`;
      });
      throw new ProviderUnavailableError(
        `No text recogniser can run. ${reasons.join('; ') || 'None configured.'}`,
      );
    }

    const failures: string[] = [];
    for (const provider of usable) {
      try {
        return await provider.recognise(image, mimeType);
      } catch (err) {
        failures.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new ProviderUnavailableError(`Every recogniser failed. ${failures.join('; ')}`);
  }

  /**
   * Run several providers on the same image, for the ensemble of §10.
   *
   * Returns every result, including none. Consensus is NOT computed here:
   * agreement between engines is a confidence signal, never clinical truth, and
   * the decision about what a clinician must check belongs in confidence.ts
   * where it can be reasoned about on its own.
   */
  async recogniseAll(
    image: Buffer,
    mimeType: string,
    policy: ProviderPolicy,
  ): Promise<Array<{ provider: string; result: OcrResult | null; error: string | null }>> {
    const usable = await this.usable(policy);
    return Promise.all(usable.map(async (provider) => {
      try {
        return { provider: provider.name, result: await provider.recognise(image, mimeType), error: null };
      } catch (err) {
        return {
          provider: provider.name,
          result: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }));
  }
}

/**
 * Line up words from several engines by position, so disagreements can be
 * shown to a clinician.
 *
 * Naive index alignment on purpose: engines that segment differently produce
 * offset lists, and a clever alignment that silently paired the wrong words
 * would manufacture disagreements or, worse, hide real ones. Where the lists
 * differ in length the surplus is reported as its own position rather than
 * dropped.
 */
export function alignByPosition(results: OcrResult[]): Array<{ text: string; alternatives: string[] }> {
  if (results.length === 0) return [];
  const primary = results[0];
  const others = results.slice(1);
  const longest = Math.max(...results.map((r) => r.words.length));

  const out: Array<{ text: string; alternatives: string[] }> = [];
  for (let i = 0; i < longest; i++) {
    const text = primary.words[i]?.text ?? '';
    const alternatives = others
      .map((r) => r.words[i]?.text ?? '')
      .filter((t) => t && t.toLowerCase() !== text.toLowerCase());
    if (!text && alternatives.length === 0) continue;
    out.push({ text, alternatives });
  }
  return out;
}
