// ============================================================
// The small amount of linear algebra the regressions need
// ------------------------------------------------------------
// Kept separate and pure so it can be tested against matrices whose inverse
// can be worked out by hand. A regression that silently returns nonsense
// because its matrix solver is wrong is indistinguishable, on screen, from a
// regression that worked — which is why this is its own file with its own
// tests rather than twenty lines inside the model fitting.
//
// GAUSS-JORDAN WITH PARTIAL PIVOTING. The matrices here are at most a dozen
// columns, so there is nothing to gain from anything cleverer, and partial
// pivoting is what stops a zero on the diagonal from producing Infinity
// instead of an honest refusal.
// ============================================================

export type Matrix = number[][];

/** A zero matrix of the given shape. */
export const zeros = (rows: number, cols: number): Matrix =>
  Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

/** Transpose. */
export function transpose(a: Matrix): Matrix {
  if (a.length === 0) return [];
  return a[0].map((_, j) => a.map((row) => row[j]));
}

/** Matrix product, or null when the shapes do not meet. */
export function multiply(a: Matrix, b: Matrix): Matrix | null {
  if (a.length === 0 || b.length === 0) return null;
  const inner = a[0].length;
  if (inner !== b.length) return null;
  const out = zeros(a.length, b[0].length);
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < b[0].length; j += 1) out[i][j] += aik * b[k][j];
    }
  }
  return out;
}

/**
 * Inverse of a square matrix, or null when it is singular.
 *
 * NULL, not a matrix of infinities. A singular design matrix means two
 * predictors carry the same information — age in years beside age in months,
 * or a group variable with one empty level — and the honest answer is that
 * the model cannot be fitted, not a set of coefficients with no meaning.
 */
export function invert(a: Matrix): Matrix | null {
  const n = a.length;
  if (n === 0 || a.some((r) => r.length !== n)) return null;

  // Augment with the identity and reduce.
  const m: Matrix = a.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col += 1) {
    // Partial pivot: the largest absolute value in this column, at or below
    // the diagonal. Without it a zero pivot divides by zero and every later
    // row becomes NaN.
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    if (pivot !== col) { const t = m[pivot]; m[pivot] = m[col]; m[col] = t; }

    const d = m[col][col];
    for (let j = 0; j < 2 * n; j += 1) m[col][j] /= d;

    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = m[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) m[r][j] -= f * m[col][j];
    }
  }

  return m.map((row) => row.slice(n));
}

/** The diagonal of a square matrix. */
export const diagonal = (a: Matrix): number[] => a.map((row, i) => row[i]);
