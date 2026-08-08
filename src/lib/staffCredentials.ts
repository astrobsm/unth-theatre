// ============================================================
// One identity for the app and for the network
// ------------------------------------------------------------
// Staff sign in with their ORM username OR their phone number, and the same
// check backs both the application and the Wi-Fi captive portal. Nobody should
// have to remember two credentials, and a password must exist in exactly one
// place — hashed, in this database. Nothing is ever copied into the router.
//
// WHY PHONE NUMBERS ARE NOT ENOUGH ON THEIR OWN
//
// Measured against the live database in August 2026:
//
//   561 approved users
//    20 have NO phone number recorded         -> can never sign in by phone
//   541 have one, but only 485 are distinct
//    53 numbers belong to more than one approved account, covering 111 users
//   430 are uniquely identified by their phone number
//
// The shared ones are not colleagues sharing a handset. They are DUPLICATE
// ACCOUNTS of the same person — the same full name and role registered twice,
// sometimes differing only in capitalisation. So the ambiguity is a data
// quality problem, not a modelling one, and it should be fixed by merging
// those accounts rather than worked around forever.
//
// Until it is, this module refuses to guess. A phone number that resolves to
// one approved person signs in; one that resolves to several asks for the
// username instead. Guessing would sign somebody into a colleague's record,
// which in a clinical system is not a small mistake.
// ============================================================

/**
 * Reduce a Nigerian phone number to its last ten digits, which is the part
 * that identifies the line regardless of how it was typed.
 *
 * The live data holds two shapes — `08031234567` and `+2348031234567` — and
 * staff type both, plus spaces and dashes. All of them reduce to `8031234567`.
 *
 * Returns null when the input cannot be a phone number, which is how callers
 * tell "this is a username" from "this is a malformed number".
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // +234 803 123 4567  ->  8031234567
  if (digits.length === 13 && digits.startsWith('234')) return digits.slice(3);
  // 08031234567        ->  8031234567
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  // 8031234567 typed without the leading zero
  if (digits.length === 10) return digits;

  return null;
}

/**
 * Does this look like somebody entering a phone number rather than a username?
 *
 * Deliberately based on the CHARACTERS TYPED, not on whether it normalises: a
 * username is not going to be all digits and punctuation, so "07031" is a
 * mistyped phone number rather than a username, and should be reported as one.
 */
export function looksLikePhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = String(raw).trim();
  if (!/^[+0-9 ()-]+$/.test(trimmed)) return false;
  return trimmed.replace(/\D/g, '').length >= 7;
}

export type CredentialFailure =
  | 'MISSING'            // nothing entered
  | 'MALFORMED_PHONE'    // digits, but not a usable Nigerian number
  | 'NOT_FOUND'
  | 'NOT_APPROVED'
  | 'AMBIGUOUS_PHONE'    // several approved accounts share this number
  | 'BAD_PASSWORD';

export interface VerifiedStaff {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email: string | null;
}

export type CredentialResult =
  | { ok: true; user: VerifiedStaff }
  | { ok: false; reason: CredentialFailure };

/** Human wording for each outcome, safe to show on the captive portal. */
export function failureMessage(reason: CredentialFailure): string {
  switch (reason) {
    case 'MISSING':
      return 'Enter your username or phone number, and your password.';
    case 'MALFORMED_PHONE':
      return 'That does not look like a complete phone number. Use the number on your ORM profile, or your username.';
    case 'NOT_FOUND':
      return 'No account found. Check the spelling, or try your username instead of your phone number.';
    case 'NOT_APPROVED':
      return 'This account is still awaiting approval. Ask an administrator to approve it.';
    case 'AMBIGUOUS_PHONE':
      // Says what to do now, and does not blame the person typing.
      return 'That phone number is registered to more than one account. Sign in with your username instead, and ask an administrator to merge the duplicates.';
    case 'BAD_PASSWORD':
      return 'Incorrect password.';
  }
}

/** The minimum the lookup needs; keeps this module free of a Prisma import. */
interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email: string | null;
  password: string;
  status: string;
  phoneNumber: string | null;
}

export interface CredentialDeps {
  /** Case-insensitive exact username lookup. */
  findByUsername(username: string): Promise<UserRow | null>;
  /** Every user whose stored number ends with these ten digits. */
  findByPhoneSuffix(last10: string): Promise<UserRow[]>;
  /** bcrypt.compare, injected so the pure logic stays testable. */
  comparePassword(plain: string, hash: string): Promise<boolean>;
}

/** Never bcrypt more than this many candidates — a guard, not a limit. */
const MAX_PHONE_CANDIDATES = 5;

/**
 * Verify a staff member by username or phone number.
 *
 * Shared by the application's sign-in and the Wi-Fi captive portal so that the
 * two can never drift apart in who they will admit.
 */
export async function verifyStaffCredentials(
  deps: CredentialDeps,
  identifier: string | null | undefined,
  password: string | null | undefined
): Promise<CredentialResult> {
  const id = (identifier ?? '').trim();
  if (!id || !password) return { ok: false, reason: 'MISSING' };

  if (looksLikePhone(id)) {
    const last10 = normalisePhone(id);
    if (!last10) return { ok: false, reason: 'MALFORMED_PHONE' };

    const matches = await deps.findByPhoneSuffix(last10);
    if (matches.length === 0) return { ok: false, reason: 'NOT_FOUND' };

    const approved = matches.filter((u) => u.status === 'APPROVED');
    if (approved.length === 0) return { ok: false, reason: 'NOT_APPROVED' };

    // One approved account behind the number is the ordinary case, even when
    // unapproved duplicates also carry it.
    if (approved.length === 1) {
      return finish(deps, approved[0], password);
    }

    // Several approved accounts share it. These are duplicate registrations of
    // one person, so the password usually matches exactly one of them, and
    // that one is unambiguous enough to admit. If it matches more than one we
    // genuinely cannot tell which record they mean, and picking either could
    // put them in the wrong role.
    const hits: UserRow[] = [];
    for (const candidate of approved.slice(0, MAX_PHONE_CANDIDATES)) {
      if (await deps.comparePassword(password, candidate.password)) hits.push(candidate);
    }
    if (hits.length === 1) return { ok: true, user: publicFields(hits[0]) };
    if (hits.length === 0) return { ok: false, reason: 'BAD_PASSWORD' };
    return { ok: false, reason: 'AMBIGUOUS_PHONE' };
  }

  const user = await deps.findByUsername(id);
  if (!user) return { ok: false, reason: 'NOT_FOUND' };
  if (user.status !== 'APPROVED') return { ok: false, reason: 'NOT_APPROVED' };
  return finish(deps, user, password);
}

async function finish(
  deps: CredentialDeps,
  user: UserRow,
  password: string
): Promise<CredentialResult> {
  const valid = await deps.comparePassword(password, user.password);
  if (!valid) return { ok: false, reason: 'BAD_PASSWORD' };
  return { ok: true, user: publicFields(user) };
}

/** Everything except the hash — so a caller cannot leak it by accident. */
function publicFields(u: UserRow): VerifiedStaff {
  return { id: u.id, username: u.username, fullName: u.fullName, role: u.role, email: u.email };
}
