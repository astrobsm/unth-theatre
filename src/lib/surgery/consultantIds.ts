// ============================================================
// Reading Surgery.supervisingConsultantId
// ------------------------------------------------------------
// IT IS A LIST, IN A COLUMN NAMED AS THOUGH IT WERE ONE ID.
//
// The booking form holds supervisingConsultantIds as a string[] -- a unit may
// legitimately have two or four supervising consultants -- and the booking
// route joins them with commas into a single String? column. So on 161 of
// this hospital's 1,264 cases the field holds something like:
//
//   "2b14880f-a236-4afa-9497-770933690842,fb83e182-5bc5-4e99-baa2-084db36ad184"
//
// Code that treats that as one id does one of two things. If it only
// compares, it silently never matches, and a consultant in a two-consultant
// unit never sees his own case. If it WRITES the value somewhere with a
// foreign key -- Notification.userId has one -- the write throws, and the
// user is told "the server could not complete this" forever, because the
// data will never change by itself.
//
// That is what this exists to stop. One place that knows the shape, so the
// knowledge is not re-derived, half-correctly, at each of the dozen call
// sites that read the column.
//
// NOT MERELY SPLIT ON COMMAS. A stale id that no longer names a user is also
// present in this data, so anything that writes a foreign key must check the
// ids exist first -- see realConsultantIds.
// ============================================================

/** A uuid, loosely: enough to reject a name that found its way into the column. */
const LOOKS_LIKE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every consultant id in the field, in the order they were recorded.
 *
 * Accepts the one-id case unchanged, so callers need no special handling.
 * Returns [] for null, empty, or a value holding no id-shaped text at all.
 */
export function consultantIdsOf(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  raw.split(',').forEach((part) => {
    const id = part.trim();
    // A non-uuid is dropped rather than passed on. Some rows hold a name
    // where an id belongs, and handing that to a WHERE clause asks the
    // database a question about a person who does not exist.
    if (!id || !LOOKS_LIKE_ID.test(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

/** The matching names, for rows where both columns hold a list. */
export function consultantNamesOf(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Pair the ids with the names, as far as the two lists agree.
 *
 * They are stored as two independently-joined strings, so they can disagree
 * -- a name containing a comma ("Chigbu, Chibuike O.") splits into two and
 * the lists come out different lengths. When they disagree the id is kept
 * and the name is dropped, because the id is what anything can act on and a
 * misaligned name is worse than none: it would attribute one consultant's
 * case to another by name.
 */
export function consultantsOf(
  rawIds: string | null | undefined,
  rawNames: string | null | undefined,
): { id: string; name: string | null }[] {
  const ids = consultantIdsOf(rawIds);
  const names = consultantNamesOf(rawNames);
  const aligned = ids.length === names.length;
  return ids.map((id, i) => ({ id, name: aligned ? names[i] : null }));
}

/**
 * Whether this person is one of the case's supervising consultants.
 *
 * The replacement for `surgery.supervisingConsultantId === userId`, which is
 * false for every consultant on a shared unit.
 */
export function isSupervisingConsultant(
  raw: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return consultantIdsOf(raw).indexOf(userId) !== -1;
}

/**
 * A Prisma `where` fragment matching cases this person supervises.
 *
 * The replacement for `{ supervisingConsultantId: userId }`, which matches
 * nothing on a shared unit because the stored value is a comma-joined list.
 *
 * WHY NOT `contains: userId`. It would be shorter and almost always right,
 * and "almost always" is not a property to want in an access filter. These
 * four alternatives match only on a comma boundary or the whole field, so a
 * value can never be matched by part of itself.
 *
 * Verified against the live column before being written this way: 711 stored
 * values, none with a space after the comma, none with uppercase hex, none
 * with a stray leading or trailing comma. If that ever stops being true this
 * needs normalising at write time, not loosening here.
 */
export function supervisingConsultantWhere(userId: string) {
  return {
    OR: [
      { supervisingConsultantId: userId },
      { supervisingConsultantId: { startsWith: `${userId},` } },
      { supervisingConsultantId: { endsWith: `,${userId}` } },
      { supervisingConsultantId: { contains: `,${userId},` } },
    ],
  };
}

/**
 * Every user id held by one of a surgery's named-post columns.
 *
 * Only supervisingConsultantId is a list; the rest hold one id. Call sites
 * that iterate POST_FIELDS use this so they do not have to remember which is
 * which, and so the answer changes in one place if another column ever grows
 * the same way.
 */
export function idsOfPostField(field: string, value: string | null | undefined): string[] {
  if (value === null || value === undefined || value === '') return [];
  return field === 'supervisingConsultantId' ? consultantIdsOf(value) : [value];
}
