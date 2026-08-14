/**
 * Is this photograph good enough to read?
 *
 * Most OCR failures in this system have come from acquisition, not from the
 * recogniser. The fault that started this work was `Image too small to scale!!
 * (1x36)` — a preprocessing artefact. Before that, four attempts to improve
 * "OCR quality" changed how the engine loaded and never once looked at what it
 * was being handed.
 *
 * So this module measures the image and tells the person holding the phone what
 * to do about it. It deliberately does NOT alter pixels. An earlier version of
 * the client ran a dozen threshold-and-scale variants hunting for a better
 * result and destroyed the strokes it was meant to sharpen; 171 lines of it
 * were deleted. Enhancement belongs downstream, applied once, and judged by the
 * benchmark rather than by hope.
 *
 * Everything here is a pure function over an ImageData-shaped object, so it
 * runs in the browser during live preview and in Node under test, with no
 * canvas and no DOM.
 */

export interface RasterImage {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
}

export type QualityCheck =
  | 'RESOLUTION' | 'SHARPNESS' | 'EXPOSURE_DARK' | 'EXPOSURE_BRIGHT'
  | 'CONTRAST' | 'GLARE';

export interface QualityReport {
  /** 0-100. A single number for the badge; the checks are what to act on. */
  score: number;
  /** Higher is sharper. Variance of the Laplacian, normalised. */
  sharpness: number;
  /** Mean luminance, 0-255. */
  exposure: number;
  /** Spread of luminance, 0-100. */
  contrast: number;
  /** Percentage of the frame blown out to white. */
  glare: number;
  /** Shortest side in pixels. */
  resolutionPx: number;
  failed: QualityCheck[];
  /** Plain instructions, in the order worth acting on. */
  guidance: string[];
  /**
   * False when the image is bad enough that recognising it wastes the user's
   * time. The UI still offers "Proceed anyway" (§5) — a clinician who knows the
   * page is faint should not be blocked by a threshold — but the choice, and
   * the fact it was made, is recorded.
   */
  acceptable: boolean;
}

/**
 * Thresholds.
 *
 * These are STARTING POINTS, not measurements. They were chosen to be roughly
 * right on the synthetic images in the tests, and they should be recalibrated
 * against docs/ocr-corpus once real theatre photographs exist — the corpus can
 * say what score actually predicts a readable page, which no amount of
 * reasoning here can. Recorded honestly so nobody mistakes them for evidence.
 */
export const THRESHOLDS = {
  /** Below this the page is too small for a recogniser to segment lines. */
  minShortSidePx: 600,
  /**
   * Laplacian variance below this is camera shake or a missed focus.
   *
   * MEASURED, not guessed. On a synthetic page of text at 600x600:
   *
   *   in focus                   9,550   (fine text: 48,871)
   *   slightly soft (r=1)        1,052
   *   soft (r=2)                   382
   *   too blurred to read (r=4)     120
   *   badly blurred (r=6)            57
   *   blank                           0
   *
   * The first version of this threshold was 8, which only a blank frame could
   * fail — the sharpness check was doing nothing at all, and every out-of-focus
   * photograph would have gone to the recogniser. 150 sits between "soft but
   * legible" and "not worth recognising".
   *
   * Still provisional: real photographs carry sensor noise and JPEG artefacts
   * that raise this measure, so it must be rechecked against docs/ocr-corpus.
   */
  minSharpness: 150,
  minExposure: 55,
  maxExposure: 215,
  minContrast: 18,
  /** Percentage of pixels blown to pure white before glare is called. */
  maxGlarePct: 8,
  /** Below this overall score, recognising the page is not worth the wait. */
  minScore: 55,
};

/** Rec. 709 luma. Matches what the greyscale step downstream uses. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** One luminance value per pixel. */
export function toLuma(img: RasterImage): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  // Accepts RGBA (4 bytes) and greyscale (1 byte) buffers, because a live
  // preview frame and a decoded test fixture do not have the same shape.
  const channels = data.length / (width * height);
  for (let i = 0; i < width * height; i++) {
    if (channels >= 3) {
      const o = i * channels;
      out[i] = luminance(data[o], data[o + 1], data[o + 2]);
    } else {
      out[i] = data[i * channels];
    }
  }
  return out;
}

/**
 * Variance of the Laplacian — the standard focus measure.
 *
 * A sharp edge produces a large second derivative; a blurred one does not. The
 * variance across the frame is therefore high for a crisp page and collapses
 * toward zero as focus is lost. Borders are skipped rather than clamped, which
 * would manufacture edges at the frame boundary and make every image look
 * sharper than it is.
 */
export function sharpness(img: RasterImage): number {
  const { width, height } = img;
  if (width < 3 || height < 3) return 0;
  const luma = toLuma(img);

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

export function exposure(img: RasterImage): number {
  const luma = toLuma(img);
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  return luma.length ? sum / luma.length : 0;
}

/**
 * Contrast as the 5th-to-95th percentile spread, scaled to 0-100.
 *
 * Not the standard deviation: one dark stamp or a black border would inflate
 * that and report a washed-out page as well contrasted. Percentiles ignore the
 * extremes and describe the range the text actually occupies.
 */
export function contrast(img: RasterImage): number {
  const luma = toLuma(img);
  if (luma.length === 0) return 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < luma.length; i++) hist[Math.max(0, Math.min(255, Math.round(luma[i])))]++;

  const at = (fraction: number): number => {
    const target = fraction * luma.length;
    let cumulative = 0;
    for (let v = 0; v < 256; v++) {
      cumulative += hist[v];
      if (cumulative >= target) return v;
    }
    return 255;
  };

  return ((at(0.95) - at(0.05)) / 255) * 100;
}

/**
 * Blown-out highlights, as a percentage of the frame.
 *
 * Glare from a theatre light on a glossy form removes the text underneath
 * entirely — no amount of processing recovers it, and the recogniser will
 * happily read whatever is left as words. Better to ask for the photograph
 * again.
 */
export function glare(img: RasterImage): number {
  const luma = toLuma(img);
  if (luma.length === 0) return 0;
  let blown = 0;
  for (let i = 0; i < luma.length; i++) if (luma[i] >= 250) blown++;
  return (blown / luma.length) * 100;
}

/**
 * Score and advice.
 *
 * The score is a weighted blend; the CHECKS are what the interface should show.
 * "Image quality 62/100" tells somebody nothing they can act on, whereas "move
 * closer" and "reduce glare" do.
 */
export function assessQuality(img: RasterImage): QualityReport {
  const resolutionPx = Math.min(img.width, img.height);
  const sharp = sharpness(img);
  const exp = exposure(img);
  const con = contrast(img);
  const gl = glare(img);

  const failed: QualityCheck[] = [];
  const guidance: string[] = [];

  if (resolutionPx < THRESHOLDS.minShortSidePx) {
    failed.push('RESOLUTION');
    guidance.push('Move closer, or use a higher camera resolution.');
  }
  if (sharp < THRESHOLDS.minSharpness) {
    failed.push('SHARPNESS');
    guidance.push('Hold the camera steady and let it focus before capturing.');
  }
  if (exp < THRESHOLDS.minExposure) {
    failed.push('EXPOSURE_DARK');
    guidance.push('Too dark. Move into better light.');
  } else if (exp > THRESHOLDS.maxExposure) {
    failed.push('EXPOSURE_BRIGHT');
    guidance.push('Too bright. Move out of direct light.');
  }
  if (gl > THRESHOLDS.maxGlarePct) {
    failed.push('GLARE');
    guidance.push('Glare on the page. Tilt it away from the theatre lights.');
  }
  // Reported after glare on purpose: a page washed out by a lamp fails both,
  // and "reduce glare" is the instruction that fixes it.
  if (con < THRESHOLDS.minContrast) {
    failed.push('CONTRAST');
    guidance.push('The writing is faint against the paper. Try more even lighting.');
  }

  // Weighted toward sharpness and resolution, because those are the two a
  // recogniser cannot work around at all.
  const scoreOf = (value: number, floor: number, ceiling: number): number =>
    Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));

  // Sharpness spans four orders of magnitude — 0 for a blank frame, tens of
  // thousands for fine text — so it is scored on a log scale. A linear one
  // saturated at the first hint of detail and reported every photograph as
  // perfectly sharp.
  const sharpScore = scoreOf(Math.log10(1 + sharp), Math.log10(1 + 20), Math.log10(10000));

  const score = Math.round(100 * (
    0.35 * sharpScore +
    0.25 * scoreOf(resolutionPx, 200, 1400) +
    0.20 * scoreOf(con, 0, 60) +
    0.12 * (1 - Math.abs(exp - 135) / 135) +
    0.08 * (1 - Math.min(1, gl / 25))
  ));

  return {
    score: Math.max(0, Math.min(100, score)),
    sharpness: Math.round(sharp * 10) / 10,
    exposure: Math.round(exp),
    contrast: Math.round(con),
    glare: Math.round(gl * 10) / 10,
    resolutionPx,
    failed,
    guidance,
    // Both conditions, not either. A page can clear the blended score while
    // failing a check that alone makes it unreadable — a blown-out form scores
    // well on sharpness and resolution and has no text left under the glare.
    acceptable: failed.length === 0 && score >= THRESHOLDS.minScore,
  };
}

/**
 * The live badge text of §5.
 *
 * Deliberately short. Somebody is holding a phone over a patient's notes with
 * one hand.
 */
export function qualitySummary(report: QualityReport): string {
  if (report.acceptable) return 'Ready to scan';
  if (report.guidance.length > 0) return report.guidance[0];
  return 'Image quality too low';
}
