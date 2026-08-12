// ============================================================
// Keeping non-Latin characters out of a PDF
// ------------------------------------------------------------
// jsPDF's built-in fonts are encoded with WinAnsi (CP1252). Hand it a
// character outside that set and it does not drop the character — it corrupts
// the WHOLE STRING, interleaving it with stray bytes:
//
//     "Surgeries → new booking"   ->   "&S&u&r&g&e&r&i&e&s& ..."
//
// That is what appeared on the duty flyers. The arrow "→" (U+2192) has no
// WinAnsi slot, and one arrow ruined every line it appeared in while the lines
// without one printed perfectly — which is why it looked random.
//
// Em dashes, curly quotes, bullets and ellipses are all FINE: CP1252 has slots
// for them, which is why "—" printed correctly in the same document. Only
// characters genuinely outside the set need replacing, so the mapping below is
// narrow and everything else is left alone.
//
// Applied by wrapping `text()` on the document rather than at each call site.
// Sixteen files in this project generate PDFs; patching every text call would
// fix today and miss the next one somebody writes.
// ============================================================

/**
 * Characters this project actually uses that CP1252 cannot represent, with a
 * readable stand-in. An arrow becomes an arrow made of ASCII, not a question
 * mark — the reader should not be able to tell anything was substituted.
 */
const REPLACEMENTS: Record<string, string> = {
  // The naira sign, U+20A6, has NO WinAnsi slot — so by the rule above it did
  // not merely fail to print, it corrupted every string it appeared in. Which
  // means every money figure in the analytics PDFs has been arriving mangled,
  // and nobody connected the two because the lines WITHOUT an amount printed
  // perfectly.
  //
  // "NGN" rather than "N": on a financial document handed to a patient or filed
  // by an auditor, an ambiguous currency mark is worse than a verbose one.
  '₦': 'NGN ',
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '↔': '<->',
  '↑': '^',
  '↓': 'v',
  '✓': 'Yes',
  '✔': 'Yes',
  '✗': 'No',
  '✘': 'No',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '×': 'x',
  '⁄': '/',
  '−': '-',      // U+2212 minus, distinct from hyphen
  '‑': '-',      // non-breaking hyphen
  '‒': '-',
  '⋯': '...',
  '·': '·',      // U+00B7 IS in CP1252 — listed so nobody "fixes" it away
  '№': 'No.',
  '℃': 'degC',
  '™': '™',      // CP1252 0x99
  '€': '€',      // CP1252 0x80
};

/** Is this code point representable in WinAnsi / CP1252? */
function isCp1252(code: number): boolean {
  // ASCII, plus Latin-1 supplement, plus the CP1252 additions in 0x80–0x9F.
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return CP1252_HIGH.has(code);
}

/** The characters CP1252 maps into 0x80–0x9F, where Latin-1 has controls. */
const CP1252_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/**
 * Make a string safe to draw.
 *
 * Known characters are transliterated; anything else outside the set is
 * dropped rather than replaced with a question mark, because a stray "?" in a
 * clinical document reads as missing data.
 */
export function toPdfSafe(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  let out = '';
  for (const ch of s) {
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (isCp1252(code)) out += ch;
    else if (code === 0x0a || code === 0x09) out += ch;   // newline, tab
    // else: dropped
  }
  return out;
}

type TextArg = string | string[];

/**
 * Wrap `text()` on a jsPDF document so nothing unencodable can reach it.
 *
 * Also covers jspdf-autotable, which draws its cells through the same method —
 * so tables are protected without touching the table code.
 *
 * Idempotent: wrapping twice is harmless.
 */
export function installPdfTextGuard(pdf: unknown): void {
  const doc = pdf as {
    text: (t: TextArg, x: number, y: number, ...rest: unknown[]) => unknown;
    __textGuarded?: boolean;
  };
  if (!doc || typeof doc.text !== 'function' || doc.__textGuarded) return;

  const original = doc.text.bind(doc);
  doc.text = (t: TextArg, x: number, y: number, ...rest: unknown[]) => {
    const safe = Array.isArray(t) ? t.map((line) => toPdfSafe(line)) : toPdfSafe(t);
    return original(safe as TextArg, x, y, ...rest);
  };

  // splitTextToSize MEASURES text to decide where to wrap. Left unguarded it
  // would measure the original string and the page would be laid out for
  // characters that are never drawn — "→" is one glyph wide but prints as the
  // two of "->". Wrapping both keeps measurement and drawing in agreement.
  const withSplit = doc as unknown as {
    splitTextToSize?: (t: string, w: number, ...rest: unknown[]) => unknown;
  };
  if (typeof withSplit.splitTextToSize === 'function') {
    const originalSplit = withSplit.splitTextToSize.bind(withSplit);
    withSplit.splitTextToSize = (t: string, w: number, ...rest: unknown[]) =>
      originalSplit(toPdfSafe(t), w, ...rest);
  }

  doc.__textGuarded = true;
}
