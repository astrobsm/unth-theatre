// ============================================================
// Identifying a locked-out member of staff by their Staff ID number
// ------------------------------------------------------------
// Asked for on 7 November:
//
//   "modify the recovery of username and password so that users who forget
//    their username and password will be prompted to enter their staff id
//    number, and then reset the password, and the app shows them the username"
//
// THE GAP THIS CLOSES. Recovery used to begin with "username or phone number".
// Somebody who has forgotten their username has, by definition, only the phone
// number left — and the phone number is stored six different ways by six
// different admins, so the one spelling they type is often not the one on
// file. A Staff ID number is the thing every member of staff is carrying: it
// is printed on the hospital card in their pocket. Asking for it is the
// difference between a recovery flow that works and one that works for people
// who did not need it.
//
// WHAT A STAFF ID IS NOT. It is not a secret. It is printed on a card, read
// aloud at duty handover, listed on the staff screen inside this application,
// and typed into the duty-logging board. It therefore IDENTIFIES a person and
// cannot AUTHENTICATE them: on its own it says which account you are claiming,
// not that the account is yours. That is why entering it still leads to the
// one-time code on the registered phone before any password is changed. If a
// Staff ID alone could set a new password, then every person who has seen a
// colleague's ID card — or the staff list on the users screen — could take
// over that colleague's account, consultants and administrators included.
//
// WHY SPELLINGS, NOT ONE STRING. Staff IDs in this database are stored as
// digits, as letters-then-digits, with a slash, with a hyphen, with a space,
// and in both cases. The person typing is reading a card, not the database.
// Matching only the exact bytes they typed fails the people most likely to
// need this. So a small, bounded set of plausible spellings of what they typed
// is matched instead — bounded because this runs on an unauthenticated route.
// ============================================================

/** Shorter than this is a typo, not an identifier worth searching on. */
export const MIN_STAFF_NUMBER_LENGTH = 3;

/** Matches the cap the first-login staff ID field already enforces. */
export const MAX_STAFF_NUMBER_LENGTH = 60;

/** The separators that appear between a letter prefix and the digits. */
const SEPARATORS = ['-', '/', ' '] as const;

/** Every character that staff, cards and spreadsheets use as a separator. */
const SEPARATOR_RE = /[\s\-/\\\._]+/g;

/** Separator runs allowed in one staff number. More than this is prose. */
const MAX_SEPARATOR_RUNS = 2;

/**
 * The comparable form of a staff number: no separators, upper case.
 *
 * Returns null for anything that cannot be a staff number at all, so callers
 * get one negative answer rather than having to repeat the length rules.
 */
export function canonicalStaffNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const typed = String(raw).trim();

  // A staff number has a separator or two in it: UNTH/1234, UNTH/ENU/1234.
  // A sentence has four or five, and "my staff id is 1234" would otherwise
  // canonicalise to MYSTAFFIDIS1234 and be searched for as though it were a
  // number somebody carries on a card.
  if ((typed.match(SEPARATOR_RE) ?? []).length > MAX_SEPARATOR_RUNS) return null;

  const cleaned = typed.replace(SEPARATOR_RE, '').toUpperCase();
  if (cleaned.length < MIN_STAFF_NUMBER_LENGTH) return null;
  if (cleaned.length > MAX_STAFF_NUMBER_LENGTH) return null;
  // A staff number is made of letters and digits. Anything else is somebody
  // pasting a sentence, an email address, or probing the endpoint.
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
}

/** Could this be a staff number at all? */
export const looksLikeStaffNumber = (raw: string | null | undefined): boolean =>
  canonicalStaffNumber(raw) !== null;

/**
 * Split a canonical staff number into its letter prefix and its digits.
 *
 * "UNTH1234" -> { prefix: 'UNTH', digits: '1234' }. Anything that is not
 * letters-then-digits returns null, which is the signal not to bother
 * generating separator variants of it.
 */
function splitPrefix(canonical: string): { prefix: string; digits: string } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(canonical);
  if (!m) return null;
  return { prefix: m[1], digits: m[2] };
}

/**
 * The spellings of a typed staff number that are worth looking for.
 *
 * Deliberately bounded and deliberately small: an unauthenticated caller must
 * not be able to turn one field into a hundred index lookups. The exact text
 * as typed always comes first, so the common case is also the first match.
 */
export function staffNumberSpellings(raw: string | null | undefined): string[] {
  const canonical = canonicalStaffNumber(raw);
  if (!canonical) return [];

  const typed = String(raw).trim();
  const out: string[] = [];
  const add = (s: string) => {
    if (s && s.length <= MAX_STAFF_NUMBER_LENGTH && !out.includes(s)) out.push(s);
  };

  add(typed);
  add(typed.toUpperCase());
  add(typed.toLowerCase());
  add(canonical);
  add(canonical.toLowerCase());

  const parts = splitPrefix(canonical);
  if (parts) {
    for (const sep of SEPARATORS) {
      add(`${parts.prefix}${sep}${parts.digits}`);
      add(`${parts.prefix.toLowerCase()}${sep}${parts.digits}`);
    }
  }

  return out;
}
