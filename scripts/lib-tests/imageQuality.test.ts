import { describe, it, expect } from 'vitest';
import {
  assessQuality, sharpness, exposure, contrast, glare, toLuma, qualitySummary,
  THRESHOLDS, RasterImage,
} from '../../src/lib/ocr/imageQuality';

/** An RGBA canvas built from a per-pixel function, as the browser would supply. */
function make(width: number, height: number, fn: (x: number, y: number) => number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.max(0, Math.min(255, fn(x, y)));
      const o = (y * width + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

/** A page: white paper with dark horizontal lines of text. */
const sharpPage = (w = 800, h = 800) =>
  make(w, h, (_x, y) => (y % 20 < 6 ? 20 : 240));

/**
 * A real box blur, applied to a real page.
 *
 * The first version of this fixture faked defocus with a sinusoid, which has
 * strong curvature and therefore reads as SHARP to a Laplacian — the fixture
 * was wrong, not the measure. Blur has to be produced by actually averaging
 * neighbouring pixels, which is what a lens out of focus does.
 */
function boxBlur(img: RasterImage, radius: number): RasterImage {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          sum += data[(sy * width + sx) * 4];
          n++;
        }
      }
      const v = sum / n;
      const o = (y * width + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

/** The same page, out of focus. */
const blurredPage = (w = 800, h = 800) => boxBlur(sharpPage(w, h), 6);

const flatGrey = (w = 800, h = 800, v = 128) => make(w, h, () => v);

describe('toLuma', () => {
  it('reads an RGBA buffer', () => {
    const luma = toLuma(make(2, 2, () => 100));
    expect(luma).toHaveLength(4);
    expect(Math.round(luma[0])).toBe(100);
  });

  it('reads a single-channel buffer too', () => {
    // A decoded fixture is not RGBA; both shapes reach this code.
    const luma = toLuma({ data: new Uint8ClampedArray([10, 20, 30, 40]), width: 2, height: 2 });
    expect(Math.round(luma[3])).toBe(40);
  });
});

describe('sharpness', () => {
  it('is high for a page in focus', () => {
    expect(sharpness(sharpPage())).toBeGreaterThan(THRESHOLDS.minSharpness);
  });

  it('collapses for a blurred page', () => {
    expect(sharpness(blurredPage())).toBeLessThan(THRESHOLDS.minSharpness);
  });

  it('is zero for flat grey, which has no detail at all', () => {
    expect(sharpness(flatGrey())).toBeCloseTo(0, 1);
  });

  it('ranks a sharp page above a blurred one', () => {
    expect(sharpness(sharpPage())).toBeGreaterThan(sharpness(blurredPage()));
  });

  it('does not crash on an image too small to have an interior', () => {
    expect(sharpness(make(2, 2, () => 100))).toBe(0);
  });
});

describe('exposure', () => {
  it('is low for a dark photograph', () => {
    expect(exposure(flatGrey(100, 100, 30))).toBeLessThan(THRESHOLDS.minExposure);
  });

  it('is high for a washed-out one', () => {
    expect(exposure(flatGrey(100, 100, 240))).toBeGreaterThan(THRESHOLDS.maxExposure);
  });
});

describe('contrast', () => {
  it('is high for black text on white paper', () => {
    expect(contrast(sharpPage())).toBeGreaterThan(THRESHOLDS.minContrast);
  });

  it('is near zero for a flat field', () => {
    expect(contrast(flatGrey())).toBeLessThan(5);
  });

  it('is not fooled by a single dark stamp on a faint page', () => {
    // A standard deviation would be inflated by the stamp and call this page
    // well contrasted. Percentiles ignore it.
    const faintWithStamp = make(400, 400, (x, y) =>
      (x < 20 && y < 20) ? 0 : (y % 20 < 6 ? 178 : 190));
    expect(contrast(faintWithStamp)).toBeLessThan(THRESHOLDS.minContrast);
  });
});

describe('glare', () => {
  it('is zero for a normally lit page', () => {
    expect(glare(sharpPage())).toBe(0);
  });

  it('measures a blown-out patch', () => {
    // A quarter of the frame burned out by a theatre lamp.
    const withGlare = make(400, 400, (x, y) => (x < 200 && y < 200 ? 255 : 200));
    expect(glare(withGlare)).toBeCloseTo(25, 0);
  });
});

describe('assessQuality — what the person holding the phone is told', () => {
  it('accepts a well-photographed page', () => {
    const r = assessQuality(sharpPage(1000, 1000));
    expect(r.acceptable).toBe(true);
    expect(r.failed).toEqual([]);
    expect(qualitySummary(r)).toBe('Ready to scan');
  });

  it('rejects a page too small and says to move closer', () => {
    const r = assessQuality(sharpPage(300, 300));
    expect(r.failed).toContain('RESOLUTION');
    expect(r.guidance.join(' ')).toMatch(/closer/i);
    expect(r.acceptable).toBe(false);
  });

  it('rejects a blurred page and says to hold steady', () => {
    const r = assessQuality(blurredPage(1000, 1000));
    expect(r.failed).toContain('SHARPNESS');
    expect(r.guidance.join(' ')).toMatch(/steady|focus/i);
  });

  it('rejects a dark page and says to find light', () => {
    const r = assessQuality(make(1000, 1000, (_x, y) => (y % 20 < 6 ? 5 : 40)));
    expect(r.failed).toContain('EXPOSURE_DARK');
    expect(r.guidance.join(' ')).toMatch(/dark|light/i);
  });

  it('rejects a page with a lamp reflection on it', () => {
    // A reflection over part of the form, which is what actually happens in
    // theatre — not a uniformly over-exposed frame. The page around it is
    // normally lit, so glare is the finding and tilting the page is the fix.
    const glared = make(1000, 1000, (x, y) =>
      (x > 300 && x < 550) ? 255 : (y % 20 < 6 ? 20 : 240));
    const r = assessQuality(glared);
    expect(r.failed).toContain('GLARE');
    expect(r.failed).not.toContain('EXPOSURE_BRIGHT');
    expect(r.guidance[0]).toMatch(/glare|tilt/i);
  });

  it('refuses a page that fails a check even when the blended score is decent', () => {
    // The reason acceptable is both conditions and not just the score: this
    // page is sharp and large, and has no readable text under the glare.
    const glared = make(1400, 1400, (x, y) => (x % 30 < 20 ? 255 : (y % 20 < 6 ? 10 : 250)));
    const r = assessQuality(glared);
    if (r.score >= THRESHOLDS.minScore) {
      expect(r.failed.length).toBeGreaterThan(0);
      expect(r.acceptable).toBe(false);
    }
  });

  it('scores a good page above a bad one', () => {
    expect(assessQuality(sharpPage(1200, 1200)).score)
      .toBeGreaterThan(assessQuality(blurredPage(300, 300)).score);
  });

  it('keeps the score inside 0-100 for degenerate input', () => {
    for (const img of [flatGrey(10, 10, 0), flatGrey(10, 10, 255), make(4, 4, () => 128)]) {
      const r = assessQuality(img);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('gives one actionable instruction rather than a number', () => {
    const r = assessQuality(sharpPage(200, 200));
    expect(qualitySummary(r)).not.toMatch(/^\d+$/);
    expect(qualitySummary(r).length).toBeGreaterThan(5);
  });
});

describe('the sharpness gate must stay effective', () => {
  // Guards a real bug: the threshold was originally 8, against measured values
  // of ~9,550 for a page in focus and ~57 for one too blurred to read. Only a
  // blank frame could fail it, so every out-of-focus photograph reached the
  // recogniser. If anyone lowers it again, these fail.
  it('rejects a page blurred past legibility', () => {
    expect(assessQuality(blurredPage(1000, 1000)).failed).toContain('SHARPNESS');
  });

  it('does not reject a page that is merely slightly soft', () => {
    // Over-tightening is the opposite failure: refusing photographs a
    // clinician could read perfectly well.
    const slightlySoft = boxBlur(sharpPage(1000, 1000), 1);
    expect(assessQuality(slightlySoft).failed).not.toContain('SHARPNESS');
  });

  it('does not saturate the score on any detail at all', () => {
    // A linear scale reported every image as perfectly sharp.
    const soft = assessQuality(boxBlur(sharpPage(1000, 1000), 3)).score;
    const crisp = assessQuality(sharpPage(1000, 1000)).score;
    expect(crisp).toBeGreaterThan(soft);
  });
});
