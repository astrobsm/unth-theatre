import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  planUpload,
  withinTarget,
  estimateBase64Bytes,
  formatBytes,
  compressionSummary,
  CONSENT_TARGET_BYTES,
  CONSENT_TARGET_LABEL,
  CONSENT_ABSOLUTE_MAX_BYTES,
  COMPRESSION_LADDER,
  LEGIBILITY_FLOOR,
  FLOOR_REACHED_MESSAGE,
} from '../../src/lib/consentCompression';

/**
 * A signed consent is a legal record of what a patient agreed to, uploaded as a
 * phone photograph of the paper form. Phones produce 4–12 MB per shot, the form
 * accepted 8 MB, and it was posted base64 — which costs a third on top. So
 * anything much over 3 MB was refused by the platform before any code ran and
 * the upload simply failed.
 *
 * The floor matters more than the ceiling here: compression that hits the size
 * target by making a signature illegible has destroyed the record while
 * appearing to save it.
 */
const MB = 1024 * 1024;

describe('what happens to a chosen file', () => {
  it('leaves a small photograph alone', () => {
    expect(planUpload(1.2 * MB, 'image/jpeg')).toEqual({ action: 'PASS' });
  });

  it('compresses a photograph over the limit', () => {
    expect(planUpload(9 * MB, 'image/jpeg')).toEqual({ action: 'COMPRESS' });
    expect(planUpload(5 * MB, 'image/heic')).toEqual({ action: 'COMPRESS' });
    expect(planUpload(4 * MB, 'image/png')).toEqual({ action: 'COMPRESS' });
  });

  it('accepts a PDF that is already small enough', () => {
    expect(planUpload(900 * 1024, 'application/pdf')).toEqual({ action: 'PASS' });
  });

  it('refuses a large PDF rather than rasterising it', () => {
    // Re-encoding a PDF in the browser turns selectable text into a picture of
    // text — a worse record than the one that came in.
    const p = planUpload(6 * MB, 'application/pdf');
    expect(p.action).toBe('REJECT');
    if (p.action === 'REJECT') {
      expect(p.reason).toContain('picture');
      expect(p.reason).toContain(CONSENT_TARGET_LABEL);
    }
  });

  it('refuses a format that is not a consent document', () => {
    for (const t of ['video/mp4', 'application/zip', 'text/plain', '']) {
      expect(planUpload(1 * MB, t).action, t).toBe('REJECT');
    }
  });

  it('refuses something absurdly large before reading it from disk', () => {
    const p = planUpload(CONSENT_ABSOLUTE_MAX_BYTES + 1, 'image/jpeg');
    expect(p.action).toBe('REJECT');
    if (p.action === 'REJECT') expect(p.reason).toContain('photograph the form again');
  });
});

describe('the target leaves room for what travels with it', () => {
  it('is under 3 MB, not exactly 3 MB', () => {
    // The file goes base64 inside a JSON body that also carries the form fields
    // and the captured signatures. A true 3 MB becomes ~4 MB encoded and leaves
    // almost nothing for the rest.
    expect(CONSENT_TARGET_BYTES).toBeLessThan(3 * MB);
    expect(estimateBase64Bytes(CONSENT_TARGET_BYTES)).toBeLessThan(4 * MB);
  });

  it('knows what base64 costs', () => {
    expect(estimateBase64Bytes(3)).toBe(4);
    expect(estimateBase64Bytes(900)).toBe(1200);
  });

  it('judges the boundary exactly', () => {
    expect(withinTarget(CONSENT_TARGET_BYTES)).toBe(true);
    expect(withinTarget(CONSENT_TARGET_BYTES + 1)).toBe(false);
  });
});

describe('the ladder gives up quality before resolution', () => {
  it('never raises quality as it descends', () => {
    for (let i = 1; i < COMPRESSION_LADDER.length; i += 1) {
      expect(COMPRESSION_LADDER[i].quality).toBeLessThanOrEqual(COMPRESSION_LADDER[i - 1].quality);
    }
  });

  it('never enlarges as it descends', () => {
    for (let i = 1; i < COMPRESSION_LADDER.length; i += 1) {
      expect(COMPRESSION_LADDER[i].maxEdge).toBeLessThanOrEqual(COMPRESSION_LADDER[i - 1].maxEdge);
    }
  });

  it('starts gently, so a file barely over the limit keeps its quality', () => {
    expect(COMPRESSION_LADDER[0].quality).toBeGreaterThanOrEqual(0.8);
    expect(COMPRESSION_LADDER[0].maxEdge).toBeGreaterThanOrEqual(2400);
  });

  it('stops at a floor a signature is still readable at', () => {
    // ~180 dpi across an A4 sheet. Below this nobody should be asked to read
    // handwriting, and a consent form nobody can read is not a consent form.
    expect(LEGIBILITY_FLOOR.maxEdge).toBeGreaterThanOrEqual(1500);
    expect(LEGIBILITY_FLOOR.quality).toBeGreaterThanOrEqual(0.5);
  });

  it('tells the person what to do when even the floor is too big', () => {
    expect(FLOOR_REACHED_MESSAGE).toMatch(/take the photograph again/i);
    expect(FLOOR_REACHED_MESSAGE).toMatch(/readable|read/i);
  });
});

describe('what the person is told', () => {
  it('reads sizes the way a person would say them', () => {
    expect(formatBytes(1.5 * MB)).toBe('1.5 MB');
    expect(formatBytes(400 * 1024)).toBe('400 KB');
  });

  it('says what the compression actually did', () => {
    expect(compressionSummary(8 * MB, 1.9 * MB)).toBe(
      'Compressed from 8.0 MB to 1.9 MB so it can be stored with the case.',
    );
  });
});

describe('the browser is not the boundary', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src/app/api/surgeries/[id]/consent-form/route.ts'),
    'utf8',
  );

  it('the server refuses an oversized consent too', () => {
    // A stale tab or a queued offline submission can still arrive oversized.
    expect(api).toContain('CONSENT_TARGET_BYTES');
    expect(api).toContain('413');
  });

  it('and says how to put it right', () => {
    expect(api).toContain('compressed automatically');
  });
});
