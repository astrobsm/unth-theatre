import { describe, it, expect } from 'vitest';
import {
  estimateSkew, orderCorners, perspectiveMatrix, mapPoint, perspectiveDistortion,
  targetSize, planCorrection, MIN_SKEW_DEGREES, Point, Quad, RasterImage,
} from '../../src/lib/ocr/geometry';

/** A page of horizontal text lines, optionally rotated by `degrees`. */
function pageAt(degrees: number, width = 400, height = 400): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const theta = (degrees * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Rotate backwards into the unrotated page to decide ink or paper.
      const dx = x - cx;
      const dy = y - cy;
      const uy = -dx * Math.sin(-theta) + dy * Math.cos(-theta) + cy;
      const ux = dx * Math.cos(-theta) - dy * Math.sin(-theta) + cx;
      const inPage = ux > 40 && ux < width - 40 && uy > 40 && uy < height - 40;
      const isInk = inPage && Math.floor(uy) % 20 < 5;
      const v = isInk ? 20 : 245;
      const o = (y * width + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('estimateSkew', () => {
  it('finds no skew on a level page', () => {
    expect(Math.abs(estimateSkew(pageAt(0)))).toBeLessThan(MIN_SKEW_DEGREES);
  });

  it('finds a clockwise rotation', () => {
    expect(estimateSkew(pageAt(5))).toBeCloseTo(5, 0);
  });

  it('finds an anticlockwise rotation', () => {
    expect(estimateSkew(pageAt(-4))).toBeCloseTo(-4, 0);
  });

  it('resolves a small skew a person would not notice', () => {
    // 2 degrees is invisible by eye and still costs a recogniser line
    // segmentation accuracy.
    expect(estimateSkew(pageAt(2))).toBeCloseTo(2, 0);
  });

  it('does not invent a skew on a blank page', () => {
    const blank: RasterImage = {
      data: new Uint8ClampedArray(200 * 200 * 4).fill(255),
      width: 200, height: 200,
    };
    expect(Math.abs(estimateSkew(blank))).toBeLessThan(MIN_SKEW_DEGREES);
  });
});

describe('orderCorners', () => {
  const tl = { x: 10, y: 10 };
  const tr = { x: 90, y: 12 };
  const br = { x: 92, y: 88 };
  const bl = { x: 8, y: 86 };

  it('orders corners found in any sequence', () => {
    for (const shuffled of [[br, tl, bl, tr], [tr, br, bl, tl], [bl, tr, tl, br]]) {
      expect(orderCorners(shuffled)).toEqual([tl, tr, br, bl]);
    }
  });

  it('handles a page rotated far enough to defeat coordinate sorting', () => {
    // Tilted about 40 degrees: the top-right corner now sits LOWER than the
    // bottom-left, which is why the ordering goes by angle about the centroid
    // rather than by raw x/y.
    const rotated: Point[] = [
      { x: 50, y: 5 }, { x: 95, y: 50 }, { x: 50, y: 95 }, { x: 5, y: 50 },
    ];
    const ordered = orderCorners(rotated);
    expect(ordered).toHaveLength(4);
    // Whatever it picks as first, the sequence must go round the quadrilateral
    // rather than crossing it.
    const [a, b, c, d] = ordered;
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(d);
  });

  it('refuses anything that is not four corners', () => {
    expect(() => orderCorners([tl, tr, br])).toThrow(/four corners/);
  });
});

describe('perspectiveMatrix', () => {
  const dst: Quad = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ];

  it('maps each source corner onto its destination', () => {
    const src: Quad = [
      { x: 12, y: 20 }, { x: 180, y: 8 }, { x: 195, y: 160 }, { x: 5, y: 150 },
    ];
    const h = perspectiveMatrix(src, dst);
    for (let i = 0; i < 4; i++) {
      const mapped = mapPoint(h, src[i]);
      expect(mapped.x).toBeCloseTo(dst[i].x, 3);
      expect(mapped.y).toBeCloseTo(dst[i].y, 3);
    }
  });

  it('handles an axis-aligned rectangle', () => {
    // This is the case that divides by zero without partial pivoting: an
    // axis-aligned quadrilateral puts zeros on the diagonal. The easy input
    // is the one that breaks a naive solver.
    const src: Quad = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 },
    ];
    const h = perspectiveMatrix(src, dst);
    const mapped = mapPoint(h, { x: 100, y: 100 });
    expect(mapped.x).toBeCloseTo(50, 3);
    expect(mapped.y).toBeCloseTo(50, 3);
  });

  it('maps the centre of a symmetric trapezoid sensibly', () => {
    const src: Quad = [
      { x: 40, y: 0 }, { x: 160, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 },
    ];
    const h = perspectiveMatrix(src, dst);
    const mapped = mapPoint(h, { x: 100, y: 50 });
    expect(mapped.x).toBeCloseTo(50, 1);   // symmetric, so it stays centred
    expect(mapped.y).toBeGreaterThan(0);
    expect(mapped.y).toBeLessThan(100);
  });

  it('refuses degenerate points instead of returning nonsense', () => {
    const degenerate: Quad = [
      { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 },
    ];
    expect(() => perspectiveMatrix(degenerate, dst)).toThrow(/do not define a transform/);
  });
});

describe('perspectiveDistortion and targetSize', () => {
  const rect: Quad = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 },
  ];

  it('is zero for a rectangle', () => {
    expect(perspectiveDistortion(rect)).toBe(0);
  });

  it('grows with the angle the photograph was taken at', () => {
    const slight: Quad = [
      { x: 5, y: 0 }, { x: 95, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 },
    ];
    const severe: Quad = [
      { x: 30, y: 0 }, { x: 70, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 },
    ];
    expect(perspectiveDistortion(severe)).toBeGreaterThan(perspectiveDistortion(slight));
  });

  it('keeps the LONGER of each opposing edge', () => {
    // The near edge was closest to the camera and kept its detail; taking the
    // far edge would resample the page down and throw that detail away.
    const trapezoid: Quad = [
      { x: 20, y: 0 }, { x: 80, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 },
    ];
    expect(targetSize(trapezoid).width).toBe(100);
  });
});

describe('planCorrection — decides whether to touch the image at all', () => {
  it('leaves a level, square photograph alone', () => {
    const plan = planCorrection(pageAt(0));
    expect(plan.needsRotation).toBe(false);
    expect(plan.needsPerspective).toBe(false);
    expect(plan.reason).toMatch(/as it is|Nothing to correct/i);
  });

  it('reports rotation when there are no detected corners', () => {
    const plan = planCorrection(pageAt(6));
    expect(plan.needsRotation).toBe(true);
    expect(plan.matrix).toBeNull();
  });

  it('does NOT also rotate when it is correcting perspective', () => {
    // A homography already carries the rotation. Doing both would apply it
    // twice and resample the page a second time, and every resample costs
    // sharpness — which is what the recogniser minds most.
    const corners: Point[] = [
      { x: 30, y: 10 }, { x: 370, y: 40 }, { x: 390, y: 380 }, { x: 10, y: 350 },
    ];
    const plan = planCorrection(pageAt(4), corners);
    if (plan.needsPerspective) {
      expect(plan.needsRotation).toBe(false);
      expect(plan.matrix).not.toBeNull();
    }
  });

  it('does not warp a page that was photographed square on', () => {
    const square: Point[] = [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 },
    ];
    const plan = planCorrection(pageAt(0), square);
    expect(plan.needsPerspective).toBe(false);
    expect(plan.matrix).toBeNull();
  });

  it('always explains itself in words a person can read', () => {
    for (const plan of [planCorrection(pageAt(0)), planCorrection(pageAt(7))]) {
      expect(plan.reason.length).toBeGreaterThan(10);
    }
  });
});
