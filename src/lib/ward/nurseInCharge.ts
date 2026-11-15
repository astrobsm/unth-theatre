/**
 * The Ward Nurse-in-Charge: the ward's own account in the theatre workflow.
 *
 * WHY THE ROLE EXISTS
 *
 * Every theatre case begins and ends on a ward, and until now the ward had no
 * way in. The consequences are visible in the data model rather than in
 * anybody's complaint:
 *
 *   1. PatientCallUp carries `theatrePorterArrivedAtWardTime`,
 *      `theatrePorterDepartedWardTime` and `wardNurseName`, and the schema
 *      comment beside them says plainly how they are collected —
 *      "handwritten by ward nurse on the printout, then transcribed in the
 *      holding area". The person who knows those two times writes them on
 *      paper, and somebody who was not there types them in later.
 *
 *   2. `CallUpStatus.PATIENT_EN_ROUTE` and `PatientCallUp.patientEnRouteAt`
 *      are READ in three places — the patient journey timeline, the PACU
 *      discharge summary, and the holding-area chase — and WRITTEN by nothing
 *      in the application. There is no route that sets them. The row reading
 *      "En route to theatre" on every patient's journey is therefore blank on
 *      every patient, because the only person who can honestly say when the
 *      patient left the ward is the nurse who sent them, and that nurse had no
 *      account.
 *
 * So this role is not new work invented for a new login. It is the missing
 * actor for work the system already expects somebody to do.
 *
 * WHY THE WARD ASSIGNMENT IS NULLABLE, AND WHAT THAT MUST MEAN
 *
 * A ward posting is ONE ward. `User.wardAssignment` holds it for both the
 * nurse-in-charge and the clinical health assistant, and it is nullable
 * because existing rows must migrate and because an admin may create the
 * account before deciding the posting.
 *
 * An unset ward therefore means "nobody has said which ward", and it must
 * resolve to NO cases — never to every ward. The distinction matters because
 * the permissive reading is the convenient one: a desk that silently shows all
 * 1,388 cases when the posting is blank looks like it is working, hands a ward
 * nurse the whole hospital, and nobody finds out until somebody records a
 * handover against a patient two buildings away. `wardScopeOf` returns that
 * unset state explicitly so a caller has to deal with it.
 */

/** The roles, named once. */
export const WARD_NURSE_IN_CHARGE = 'WARD_NURSE_IN_CHARGE';

/**
 * The ward support staff who work under the nurse-in-charge — preparing the
 * patient, getting them ready to move, and being there when the porter
 * arrives. Posted to a ward exactly as the nurse-in-charge is, and sharing
 * the same desk.
 *
 * NOT a nurse, and the difference is load-bearing in one place: see
 * canReleasePatient below.
 */
export const CLINICAL_HEALTH_ASSISTANT = 'CLINICAL_HEALTH_ASSISTANT';

/** Staff-code prefixes. Must stay unique across ONBOARDING_ROLES. */
export const WARD_NURSE_PREFIX = 'WNC';
export const HEALTH_ASSISTANT_PREFIX = 'CHA';

/**
 * Roles whose account is scoped to one ward by `User.wardAssignment`.
 *
 * Everything that narrows by ward tests membership of THIS list rather than
 * naming a role, so that adding a third ward posting later is one line here
 * instead of a hunt through the scoping checks — the mistake that made the
 * clinical heads inherit their consultant role instead of editing 127 places.
 */
export const WARD_POSTED_ROLES = [WARD_NURSE_IN_CHARGE, CLINICAL_HEALTH_ASSISTANT] as const;

export function isWardNurseInCharge(role: string | undefined | null): boolean {
  return role === WARD_NURSE_IN_CHARGE;
}

export function isClinicalHealthAssistant(role: string | undefined | null): boolean {
  return role === CLINICAL_HEALTH_ASSISTANT;
}

/** Is this account posted to a single ward? */
export function isWardPostedRole(role: string | undefined | null): boolean {
  return !!role && (WARD_POSTED_ROLES as readonly string[]).includes(role);
}

/**
 * May this account declare that the patient has been released to theatre?
 *
 * The two porter times are OBSERVATIONS — the porter arrived at 08:12, the
 * patient left at 08:20 — and anybody standing on the ward can record them
 * truthfully. "The patient has gone to theatre" is not an observation. It
 * sets PATIENT_EN_ROUTE, which the theatre reads as "this patient is checked
 * and on the way": identity confirmed, consent signed, notes and films with
 * them. That is a nursing handover, and it is refused to the assistant for
 * the same reason the assistant does not sign the handover on paper.
 *
 * This is a judgement about this hospital's division of labour, not a
 * technical constraint. If the ward wants its assistants to release
 * patients, add CLINICAL_HEALTH_ASSISTANT here and the tests below will say
 * exactly what that changes.
 */
export function canReleasePatient(
  role: string | undefined | null,
): { ok: true } | { ok: false; reason: string } {
  if (isClinicalHealthAssistant(role)) {
    return {
      ok: false,
      reason:
        'Releasing a patient to theatre is the nurse-in-charge' + String.fromCharCode(8217) + 's. '
        + 'You can still record the time the porter arrived and the time the patient left, '
        + 'and the nurse presses the release.',
    };
  }
  return { ok: true };
}

/**
 * Ward names are free text in several tables and typed by hand in others.
 *
 * `Patient.ward` is a String, the booking form offers the WARDS list but also
 * "OTHERS (SPECIFY)", and custom wards are rows in the `wards` table. So the
 * same ward reaches us as "WARD 6B", "Ward 6b" and "ward  6B". Comparing them
 * raw would scope a nurse out of her own patients, which reads as an empty
 * ward rather than as a mismatch.
 *
 * Returns '' for anything with no ward in it, which callers must treat as
 * "unknown", not as a match.
 */
export function normaliseWard(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Do these two ward names refer to the same ward? Blank never matches. */
export function wardsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normaliseWard(a);
  const right = normaliseWard(b);
  if (!left || !right) return false;
  return left === right;
}

export type WardScope =
  | { assigned: true; ward: string }
  | { assigned: false; ward: null; reason: string };

export const WARD_NOT_SET_MESSAGE =
  'Your ward has not been set on your account yet, so there is nothing to show. '
  + 'Ask a theatre administrator to set the ward you are in charge of — until '
  + 'then this desk stays empty rather than showing you other wards.';

/**
 * Which ward this account may see and act on.
 *
 * Deliberately returns the unassigned case rather than null-or-string, so that
 * "no ward" cannot be mistaken for "any ward" at a call site.
 */
export function wardScopeOf(user: {
  role?: string | null;
  wardAssignment?: string | null;
} | null | undefined): WardScope {
  const ward = normaliseWard(user?.wardAssignment);
  if (!ward) return { assigned: false, ward: null, reason: WARD_NOT_SET_MESSAGE };
  return { assigned: true, ward };
}

/**
 * May this account record the ward handover for a case on `caseWard`?
 *
 * A ward-posted account — nurse-in-charge or health assistant — is confined to
 * their own ward. Anyone else who can already reach the holding-area escort
 * log keeps that reach: this function only narrows the two new roles, it
 * does not re-gate the existing ones.
 */
export function canActOnWardCase(
  user: { role?: string | null; wardAssignment?: string | null } | null | undefined,
  caseWard: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!isWardPostedRole(user?.role)) return { ok: true };

  const scope = wardScopeOf(user);
  if (!scope.assigned) return { ok: false, reason: scope.reason };

  if (!normaliseWard(caseWard)) {
    return {
      ok: false,
      reason: 'This case has no ward recorded, so it cannot be confirmed as one of yours.',
    };
  }
  if (!wardsMatch(scope.ward, caseWard)) {
    return {
      ok: false,
      reason: `That patient is on ${normaliseWard(caseWard)}, not ${scope.ward}.`,
    };
  }
  return { ok: true };
}

/**
 * What the role is for, in the words the ward would use.
 *
 * Rendered on the desk itself. A role handed out with no statement of its
 * duties becomes whatever the first holder assumes it is.
 */
export const WARD_DESK_DUTIES: Array<{ id: string; label: string; detail: string }> = [
  {
    id: 'list',
    label: "See your ward's theatre list",
    detail:
      'Which of your patients are booked, for when, in which theatre, and under whom. '
      + 'Only your ward — you are not shown other wards.',
  },
  {
    id: 'sent',
    label: 'Say when the patient left the ward',
    detail:
      'The theatre sends for the patient; you confirm when they actually went. '
      + 'Nothing else in the system records this, so the "en route to theatre" '
      + "line on the patient's journey is blank until you do.",
  },
  {
    id: 'handover',
    label: 'Record the porter handover at the ward',
    detail:
      'The time the porter reached the ward and the time they left with the patient, '
      + 'entered by you rather than written on the printout for somebody in the '
      + 'holding area to copy up afterwards.',
  },
];

/**
 * Statuses of a call-up where the patient has not yet reached the theatre, so
 * the ward still has something to say about it.
 */
export const WARD_ACTIONABLE_CALLUP_STATUSES = ['INVITED', 'PATIENT_EN_ROUTE'] as const;

/** Surgery statuses whose cases are still ahead of the ward. */
export const WARD_ACTIONABLE_SURGERY_STATUSES = [
  'SCHEDULED',
  'IN_HOLDING_AREA',
  'READY_FOR_THEATRE',
] as const;
