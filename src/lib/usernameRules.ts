/**
 * What makes a valid sign-in name, in one place.
 *
 * The rule is enforced twice — in the browser so the admin is told before they
 * save, and in the API because the browser is not a security boundary. Those
 * two copies must agree, and a comment saying "keep in step" is not a
 * mechanism: three separate faults today came from exactly that shape of
 * duplication (roster shift labels, the upload template header, the anaesthesia
 * technique list).
 *
 * CASE IS THE SUBTLE PART. Sign-in resolves the username case-INSENSITIVELY
 * (findByUsername in @/lib/auth uses mode: "insensitive", so "AstroDouglas" and
 * "astrodouglas" are the same account) but the database's @unique constraint is
 * case-SENSITIVE. The constraint would therefore accept "Tonia" alongside an
 * existing "tonia", after which one login matches two accounts and whichever
 * the query finds first wins. Uniqueness must be checked the way sign-in reads
 * it, never the way the constraint does.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;

/**
 * Deliberately narrow: no spaces, no quotes, nothing needing escaping wherever
 * the name is later displayed, and nothing that is ambiguous read off a screen
 * and typed at a theatre terminal.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export const USERNAME_HELP =
  'Letters, numbers, dots, hyphens and underscores. Capitals do not matter when signing in.';

/**
 * The problem with this username, or null when it is acceptable.
 *
 * Returns a sentence for a person, not a code: it is shown to the admin as-is.
 */
export function validateUsername(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim();
  if (!name) return 'A username is required.';
  if (name.length < USERNAME_MIN) return `A username needs at least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `A username may be at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_PATTERN.test(name)) {
    return 'A username may contain only letters, numbers, dots, hyphens and underscores.';
  }
  return null;
}

/** How the name is stored: trimmed, and otherwise exactly as the admin typed it. */
export function normaliseUsername(raw: string): string {
  return raw.trim();
}

/**
 * The key two usernames are compared on. Sign-in ignores case, so uniqueness
 * must too.
 */
export function usernameKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Would these two names be the same login? */
export function usernamesCollide(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = usernameKey(a);
  return ka !== '' && ka === usernameKey(b);
}
