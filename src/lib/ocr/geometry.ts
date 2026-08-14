/**
 * Turning a photograph of a page into something shaped like a scan.
 *
 * Two separate problems, often confused:
 *
 *   SKEW        the page is square to the camera but rotated a few degrees.
 *               A rotation fixes it.
 *   PERSPECTIVE the camera was not square to the page, so the rectangle has
 *               become a general quadrilateral and parallel lines converge.
 *               Only a homography fixes it; rotating makes it worse.
 *
 * Both matter to a recogniser, which segments text into horizontal lines and
 * degrades quickly once baselines are not horizontal.
 *
 * Everything here is pure geometry over plain arrays, so it is testable without
 * a canvas. Applying a transform to pixels belongs to the caller — in the
 * browser that is drawImage with a matrix, on the server it is sharp.
 */

export interface Point { x: number; y: number }
export type Quad = [Point, Point, Point, Point];

/** Row-major 3x3 homography. */
export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export interface RasterImage {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Skew
// ---------------------------------------------------------------------------

/**
 * The angle the text lines sit at, by projection profile.
 *
 * Rotate the image through a candidate angle, sum the dark pixels in each row,
 * and measure how much those row sums vary. When the rotation is right, text
 * lines fall into rows and gaps fall into other rows, so the variance peaks.
 * When it is wrong, every row contains a bit of several lines and the profile
 * flattens.
 *
 * Chosen over a Hough transform because it needs no edge detection, no
 * thresholding decisions, and degrades gracefully on faint handwriting — where
 * Hough tends to lock onto the strongest ruled line of a form rather than onto
 * the writing, and confidently deskews to the wrong angle.
 *
 * Positive angles mean the page is rotated clockwise.
 */
export function estimateSkew(
  img: RasterImage,
  { maxDegrees = 15, coarseStep = 1, fineStep = 0.1 } = {},
): number {
  // With no ink there is nothing to align, and every angle scores identically —
  // so the search returned whichever it happened to try first and confidently
  // reported a blank page as rotated 15 degrees. Saying "level" is the honest
  // answer when there is no evidence either way.
  if (projectionVariance(img, 0) <= 0) return 0;

  const best = searchSkew(img, -maxDegrees, maxDegrees, coarseStep);
  // A second pass around the winner: a 0.1 degree sweep across the whole range
  // would cost three hundred projections for no benefit, since the profile
  // variance is smooth at this scale.
  const lo = Math.max(-maxDegrees, best - coarseStep);
  const hi = Math.min(maxDegrees, best + coarseStep);
  return round(searchSkew(img, lo, hi, fineStep), 2);
}

function searchSkew(img: RasterImage, lo: number, hi: number, step: number): number {
  let bestAngle = 0;
  let bestScore = -Infinity;
  for (let a = lo; a <= hi + 1e-9; a += step) {
    const s = projectionVariance(img, a);
    if (s > bestScore) { bestScore = s; bestAngle = a; }
  }
  return bestAngle;
}

/**
 * Variance of the row-sum profile at a given rotation.
 *
 * The image is not actually rotated; each pixel's destination row is computed
 * and accumulated, which is the same measurement at a fraction of the cost.
 */
export function projectionVariance(img: RasterImage, degrees: number): number {
  const { width, height } = img;
  const channels = img.data.length / (width * height);
  const theta = (degrees * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);

  const cx = width / 2;
  const cy = height / 2;
  const rows = new Float64Array(height);

  // Subsampled: a page is far larger than the detail this measure needs, and
  // the full scan made an interactive preview stutter.
  const stepY = Math.max(1, Math.floor(height / 400));
  const stepX = Math.max(1, Math.floor(width / 400));

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const o = (y * width + x) * channels;
      const v = channels >= 3
        ? 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]
        : img.data[o];
      // Ink, not paper: dark pixels are the signal.
      const ink = 255 - v;
      if (ink < 40) continue;

      const ry = Math.round((x - cx) * sin + (y - cy) * cos + cy);
      if (ry >= 0 && ry < height) rows[ry] += ink;
    }
  }

  let mean = 0;
  for (let i = 0; i < height; i++) mean += rows[i];
  mean /= height;
  let variance = 0;
  for (let i = 0; i < height; i++) {
    const d = rows[i] - mean;
    variance += d * d;
  }
  return variance / height;
}

// ---------------------------------------------------------------------------
// Corners
// ---------------------------------------------------------------------------

/**
 * Put four detected corners into top-left, top-right, bottom-right, bottom-left
 * order.
 *
 * Corner detection returns them in whatever order it found them, and every
 * later step assumes a known order. Sorting by angle about the centroid handles
 * a rotated page, which sorting by raw coordinate does not: on a page tilted
 * far enough, the top-right corner can sit lower than the bottom-left.
 */
export function orderCorners(points: Point[]): Quad {
  if (points.length !== 4) {
    throw new Error(`A page has four corners; got ${points.length}.`);
  }
  const cx = points.reduce((a, p) => a + p.x, 0) / 4;
  const cy = points.reduce((a, p) => a + p.y, 0) / 4;

  const byAngle = points
    .map((p) => ({ p, angle: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.angle - b.angle)
    .map((e) => e.p);

  // atan2 puts the smallest angle at "up and left" going clockwise in screen
  // coordinates, where y grows downward. Rotate so the top-left is first.
  const topLeftIndex = byAngle.reduce(
    (best, p, i) => (p.x + p.y < byAngle[best].x + byAngle[best].y ? i : best), 0,
  );
  const ordered = [
    byAngle[topLeftIndex],
    byAngle[(topLeftIndex + 1) % 4],
    byAngle[(topLeftIndex + 2) % 4],
    byAngle[(topLeftIndex + 3) % 4],
  ];
  return ordered as Quad;
}

/**
 * How far from rectangular a detected page is, 0 (perfect) upward.
 *
 * Used to decide whether perspective correction is worth applying at all.
 * Warping a page that was already square introduces resampling blur for no
 * gain, and blur is what the recogniser minds most.
 */
export function perspectiveDistortion(quad: Quad): number {
  const [tl, tr, br, bl] = quad;
  const top = distance(tl, tr);
  const bottom = distance(bl, br);
  const left = distance(tl, bl);
  const right = distance(tr, br);
  const horizontal = Math.abs(top - bottom) / Math.max(top, bottom, 1);
  const vertical = Math.abs(left - right) / Math.max(left, right, 1);
  return round(Math.max(horizontal, vertical), 4);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The rectangle a detected quadrilateral should become. */
export function targetSize(quad: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  // The longer of each opposing pair: the near edge is the one photographed
  // closest to the camera and therefore the one that kept its detail. Taking
  // the shorter would throw that detail away.
  return {
    width: Math.round(Math.max(distance(tl, tr), distance(bl, br))),
    height: Math.round(Math.max(distance(tl, bl), distance(tr, br))),
  };
}

// ---------------------------------------------------------------------------
// Homography
// ---------------------------------------------------------------------------

/**
 * The projective transform taking four source points to four destination
 * points.
 *
 * Solves the standard 8x8 system by Gaussian elimination with partial
 * pivoting. Partial pivoting is not decorative: an axis-aligned quadrilateral
 * produces zeros on the diagonal, and without it the elimination divides by
 * zero on precisely the easy case.
 */
export function perspectiveMatrix(src: Quad, dst: Quad): Matrix3 {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    a.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }

  const h = solve(a, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      throw new Error('Those four points do not define a transform — are any of them the same?');
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }

  // row[i] is the diagonal element after full elimination. An earlier version
  // wrote row[i][i], indexing into a number, so every homography came back NaN
  // and every mapped point was null.
  return m.map((row, i) => row[n] / row[i]);
}

/** Apply a homography to a point. */
export function mapPoint(h: Matrix3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

/**
 * Everything the caller needs to straighten a page, or the reason not to.
 *
 * Deliberately returns a decision rather than always transforming. Every
 * resample costs sharpness, and this system has already lost weeks to
 * preprocessing that degraded images while appearing to improve them.
 */
export interface CorrectionPlan {
  skewDegrees: number;
  needsRotation: boolean;
  distortion: number;
  needsPerspective: boolean;
  matrix: Matrix3 | null;
  target: { width: number; height: number } | null;
  reason: string;
}

/** Below this a rotation costs more in resampling blur than it recovers. */
export const MIN_SKEW_DEGREES = 0.5;
/** Below this the quadrilateral is rectangular enough to leave alone. */
export const MIN_DISTORTION = 0.02;

export function planCorrection(img: RasterImage, corners?: Point[]): CorrectionPlan {
  const skewDegrees = estimateSkew(img);
  const needsRotation = Math.abs(skewDegrees) >= MIN_SKEW_DEGREES;

  if (!corners || corners.length !== 4) {
    return {
      skewDegrees,
      needsRotation,
      distortion: 0,
      needsPerspective: false,
      matrix: null,
      target: null,
      reason: needsRotation
        ? `Page is rotated ${skewDegrees}°; no page corners detected, so rotation only.`
        : 'Page is square enough to use as it is.',
    };
  }

  const quad = orderCorners(corners);
  const distortion = perspectiveDistortion(quad);
  const needsPerspective = distortion >= MIN_DISTORTION;

  if (!needsPerspective) {
    return {
      skewDegrees, needsRotation, distortion, needsPerspective: false,
      matrix: null, target: null,
      reason: needsRotation
        ? `Photographed square on but rotated ${skewDegrees}°; rotation only.`
        : 'Photographed square on and level. Nothing to correct.',
    };
  }

  const target = targetSize(quad);
  const dst: Quad = [
    { x: 0, y: 0 },
    { x: target.width, y: 0 },
    { x: target.width, y: target.height },
    { x: 0, y: target.height },
  ];

  return {
    skewDegrees,
    // A homography carries the rotation too, so rotating as well would apply it
    // twice and resample the page for a second time.
    needsRotation: false,
    distortion,
    needsPerspective: true,
    matrix: perspectiveMatrix(quad, dst),
    target,
    reason: `Photographed at an angle (${Math.round(distortion * 100)}% distortion); correcting perspective.`,
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
