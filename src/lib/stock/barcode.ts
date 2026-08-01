// ============================================================
// Batch codes — what goes on the label
// ------------------------------------------------------------
// Every lot gets a code the moment it is received, because a lot that has no
// code cannot be scanned, and stock that cannot be scanned gets counted by
// hand. The code is generated here rather than typed: a hand-keyed barcode is
// a transcription error waiting to be made.
//
// The scheme is deliberately plain:
//
//     ORM-B-<base32 of a random 40-bit value>
//
// Short enough to print on a small label and read aloud over a phone, long
// enough that a collision is not a practical concern, and using an alphabet
// with no 0/O or 1/I so a code read off a smudged label is unambiguous.
//
// The QR payload is a URL rather than a bare code, so a phone camera that is
// not running this app still lands somewhere useful instead of showing a
// meaningless string.
// ============================================================

/** Crockford-style alphabet: no I, L, O or U, so nothing reads as something else. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A batch code. Uses crypto randomness where available — this runs on the
 * server and in the browser, and Math.random on a busy morning is exactly how
 * two lots end up sharing a label.
 */
export function generateBatchCode(): string {
  const bytes = new Uint8Array(5);
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Only reached in an environment with no WebCrypto at all. Still better
    // than failing to label the stock.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  let out = '';
  for (const b of Array.from(bytes)) {
    out += ALPHABET[b >> 3];
    out += ALPHABET[((b & 0b111) << 2) % ALPHABET.length];
  }
  return `ORM-B-${out.slice(0, 10)}`;
}

/** The QR payload for a batch: a URL, so any camera lands somewhere useful. */
export function qrPayloadFor(batchCode: string, origin?: string): string {
  const base = origin ?? '';
  return `${base}/dashboard/theatre-supply/scan?code=${encodeURIComponent(batchCode)}`;
}

/**
 * Is this plausibly one of our codes?
 *
 * Used to tell a scanned ORM label apart from a manufacturer's barcode on the
 * same box — both are legitimate scans, but only one identifies a lot in this
 * system.
 */
export function isBatchCode(value: string): boolean {
  return /^ORM-B-[0-9A-HJKMNP-TV-Z]{10}$/.test(value.trim());
}

/**
 * Normalise what a scanner typed. Handheld scanners commonly append a newline
 * or carriage return, and some prepend whitespace; none of that is part of the
 * code, and leaving it on turns an exact match into a miss.
 */
export function normaliseScan(raw: string): string {
  return raw.replace(/[\r\n\t]/g, '').trim().toUpperCase();
}
