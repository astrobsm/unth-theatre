/**
 * Validating a signature before it becomes part of an institutional record.
 *
 * Kept separate from signoff.ts, which imports node:crypto and is therefore
 * server-only. This file is imported by the public signing page as well, so it
 * must stay free of node built-ins: a stray `import crypto` here breaks the
 * client bundle, and the failure appears as a blank page on a committee
 * member's phone.
 *
 * WHAT THIS IS GUARDING AGAINST, in order of how likely it is to happen here.
 *
 * An empty canvas. The member taps "Sign", nothing is drawn, and the record
 * gains a row that says they signed and an image that shows nothing. A blank
 * PNG is also tiny, which is the only reliable way to detect it without
 * reading pixels.
 *
 * Signing as a colleague. Ten staff share eight handsets in this theatre and
 * links arrive in a shared WhatsApp group. If a link opened on somebody else's
 * phone accepts any typed name at all, the endorsement list becomes unusable
 * precisely where it matters. So the typed name has to bear some relation to
 * the person the link was issued to -- without being so strict that "Prof.
 * Okeke" is refused for "Dr Augustine Okeke", which would be the fastest way
 * to make eleven heads of department give up.
 *
 * An oversized image. A canvas at device pixel ratio on a modern phone can
 * produce a surprisingly large PNG, and this column is replicated.
 */

/** A drawn signature over this many bytes is refused. */
export const SIGNATURE_MAX_BYTES = 400 * 1024;

/**
 * Below this, treat the canvas as untouched.
 *
 * A 600x200 PNG of nothing is a few hundred bytes; the same canvas with a
 * single short stroke on it is comfortably over 1 KB. This is a heuristic and
 * it is deliberately generous -- the cost of being wrong in one direction is a
 * member being told to sign again, and in the other it is a blank signature on
 * a document going to Management.
 */
export const SIGNATURE_MIN_BYTES = 1024;

/** Titles and honorifics that carry no identity for matching purposes. */
const TITLES = new Set([
  'dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'mister',
  'sir', 'madam', 'engr', 'barr', 'rev', 'pastor', 'alhaji', 'hajia', 'chief',
  'matron', 'sister', 'nurse', 'consultant', 'snr', 'jnr', 'snr.', 'md', 'mbbs',
]);

/**
 * The parts of a name that actually identify somebody.
 *
 * Lowercased, punctuation dropped, titles removed, and single letters removed
 * because an initial matches far too much: "A. Okeke" and "A. Nwosu" share
 * nothing but the A.
 */
export function nameTokens(name: string): string[] {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s'-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !TITLES.has(t));
}

/** Approximate decoded size of a data URL, without decoding it. */
export function approxBytesOfDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // 4 base64 characters carry 3 bytes; padding overstates by at most 2.
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Why this drawn signature will not do, or null when it is fine.
 */
export function signatureProblem(dataUrl: string | null | undefined): string | null {
  const v = (dataUrl ?? '').trim();
  if (v === '') return 'Please sign in the box above.';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)) {
    return 'That signature could not be read. Please clear the box and sign again.';
  }

  const bytes = approxBytesOfDataUrl(v);
  if (bytes < SIGNATURE_MIN_BYTES) {
    return 'The signature box looks empty. Please sign with your finger or mouse, '
      + 'then press Sign.';
  }
  if (bytes > SIGNATURE_MAX_BYTES) {
    return 'That signature image is too large. Please clear the box and sign again.';
  }
  return null;
}

/**
 * Why this typed name will not do for the person the link was issued to.
 *
 * The rule: at least one identifying part of the name on record must appear in
 * what was typed. That accepts "Prof Okeke" and "Augustine Okeke" for
 * "Dr Augustine Okeke", and refuses an unrelated name -- which on a shared
 * handset is the mistake worth catching.
 */
export function nameMatchProblem(
  typed: string | null | undefined,
  onRecord: string,
): string | null {
  const t = (typed ?? '').trim();
  if (t.length < 3) return 'Please type your full name.';

  const typedTokens = nameTokens(t);
  if (typedTokens.length === 0) {
    return 'Please type your full name, not a title on its own.';
  }

  const recordTokens = nameTokens(onRecord);
  // The record holds NO name at all — an invitation entered as just "Dr".
  // Refusing would be a dead end, because there is no screen for correcting an
  // invitee name and the holder could then never sign.
  //
  // Note the narrowness of this. A record reading "The Registrar" does yield
  // tokens, and nothing can reliably tell a role description from a surname,
  // so that case is still guarded. The shared-handset protection is worth more
  // than the convenience of a badly-entered row.
  if (recordTokens.length === 0) return null;

  const shared = typedTokens.some((tok) => recordTokens.includes(tok));
  if (!shared) {
    return `This link was issued to ${onRecord}. If that is not you, do not sign — `
      + 'ask the Committee Secretariat for your own link.';
  }
  return null;
}

/** Everything that must be true before the Sign button does anything. */
export function signProblem(input: {
  typedName: string | null | undefined;
  signature: string | null | undefined;
  nameOnRecord: string;
  confirmed: boolean;
}): string | null {
  if (!input.confirmed) {
    return 'Please tick the box to confirm you are endorsing this document.';
  }
  return nameMatchProblem(input.typedName, input.nameOnRecord)
    ?? signatureProblem(input.signature);
}
