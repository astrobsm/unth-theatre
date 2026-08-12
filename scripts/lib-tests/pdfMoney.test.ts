import { describe, it, expect } from 'vitest';
import { pdfMoney } from '../../src/lib/institutionalPdf';
import { formatNaira } from '../../src/lib/estimates/calculate';

// Two money formatters exist on purpose and the difference matters, so it is
// pinned here rather than left to be "tidied up" by a later reader.
//
//   formatNaira  screen  uses the naira sign
//   pdfMoney     PDF     uses "NGN", because jsPDF's built-in fonts are
//                        WinAnsi and U+20A6 has no slot there. An out-of-set
//                        character does not just fail to print — it corrupts
//                        the whole string it appears in.

describe('pdfMoney', () => {
  it('never emits the naira sign', () => {
    // The one assertion that must never be "simplified away".
    expect(pdfMoney(150_000)).not.toContain('₦');
  });

  it('formats kobo as NGN with two decimal places', () => {
    expect(pdfMoney(150_000)).toBe('NGN 1,500.00');
    expect(pdfMoney(0)).toBe('NGN 0.00');
    expect(pdfMoney(1)).toBe('NGN 0.01');
    expect(pdfMoney(1_234_567)).toBe('NGN 12,345.67');
  });

  it('groups thousands on a large figure', () => {
    // A theatre estimate runs to millions of kobo, and ungrouped digits are
    // misread by exactly the factor that matters.
    expect(pdfMoney(15_000_000)).toBe('NGN 150,000.00');   // 150 thousand naira
    expect(pdfMoney(150_000_000)).toBe('NGN 1,500,000.00'); // 1.5 million naira
  });

  it('pads a single-kobo remainder', () => {
    expect(pdfMoney(100_005)).toBe('NGN 1,000.05');
  });

  it('keeps the screen formatter using the naira sign', () => {
    // If this ever fails, someone has "unified" the two and the PDFs are now
    // corrupt again.
    expect(formatNaira(150_000)).toBe('₦1,500.00');
  });

  it('agrees with the screen formatter on the numeric part', () => {
    for (const kobo of [0, 1, 99, 100, 150_000, 1_234_567, 9_999_999_99]) {
      expect(pdfMoney(kobo).replace('NGN ', '')).toBe(
        formatNaira(kobo).replace('₦', ''));
    }
  });
});
