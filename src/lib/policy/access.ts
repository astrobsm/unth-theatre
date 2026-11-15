// ============================================================
// Who may do what in a policy review
// ------------------------------------------------------------
// Three capabilities, deliberately kept apart, because they fail differently:
//
//   OWNER     imports the draft, opens and closes the round, invites members,
//             sees individual responses, runs the analysis, accepts or rejects
//             each proposed change, generates the final policy.
//   OBSERVER  reads the synthesis once the owner has released it. Nothing else.
//   REVIEWER  answers. Needs no role at all -- a committee member is reached by
//             a token link, because most of them are heads of department who
//             will never have had an ORM account.
//
// WHY THE OWNER LIST IS THIS SHORT
//
// The committee's Chairman is THEATRE_CHAIRMAN, which already exists. The spec
// asks for "named deputies" too, and the temptation is to widen this list --
// add THEATRE_MANAGER, add the clinical heads, and the Chairman's secretary can
// help. That would also hand every head of department the ability to read what
// every other head said about their unit before the committee has met, which is
// precisely what changes what people are willing to write down.
//
// So deputies are granted the module in /dashboard/admin/access instead, one
// person at a time, through the extraModules machinery that already exists. A
// named deputy is a named person, not a role.
//
// This file is the one editable place that division lives, following
// canReleasePatient() in src/lib/ward/nurseInCharge.ts.
// ============================================================

/** Roles that own a policy review outright. */
export const POLICY_OWNER_ROLES = [
  'THEATRE_CHAIRMAN',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
] as const;

/**
 * Roles that may read a RELEASED synthesis and nothing else.
 *
 * Management and the medical advisory committee are the audience for the
 * finished recommendation, not for the raw responses that produced it.
 */
export const POLICY_OBSERVER_ROLES = [
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
] as const;

export type PolicyRole = 'owner' | 'observer' | 'none';

const norm = (role: string | null | undefined): string =>
  (role ?? '').toString().trim().toUpperCase();

/**
 * What this role is, in this module.
 *
 * An owner who is ALSO an observer role resolves to owner: the senior
 * capability wins, so an administrator who happens to be CMAC is not demoted.
 */
export function policyRoleOf(
  role: string | null | undefined,
  extraModules?: readonly string[] | null,
): PolicyRole {
  const r = norm(role);
  if ((POLICY_OWNER_ROLES as readonly string[]).includes(r)) return 'owner';
  // A named deputy: granted the module by an administrator rather than by
  // being given a role that carries other powers with it.
  if ((extraModules ?? []).includes('policy-review')) return 'owner';
  if ((POLICY_OBSERVER_ROLES as readonly string[]).includes(r)) return 'observer';
  return 'none';
}

export const canOwnPolicyReview = (
  role: string | null | undefined,
  extraModules?: readonly string[] | null,
): boolean => policyRoleOf(role, extraModules) === 'owner';

export const canObservePolicyReview = (
  role: string | null | undefined,
  extraModules?: readonly string[] | null,
): boolean => policyRoleOf(role, extraModules) !== 'none';

/** Importing, opening, closing, inviting, analysing, deciding — all owner. */
export const canDecidePolicyChanges = canOwnPolicyReview;
export const canRunPolicyAnalysis = canOwnPolicyReview;
export const canImportPolicy = canOwnPolicyReview;

export type PolicyResultsVisibilityLike =
  | 'OWNER_ONLY'
  | 'RELEASED_ATTRIBUTED'
  | 'RELEASED_BY_ROLE';

/** How much of a contributor's identity this viewer may see. */
export type Attribution = 'full' | 'role-only' | 'none';

/**
 * Whose name goes on a response, for this viewer.
 *
 * The owner always sees who said what -- they cannot reconcile two heads of
 * department disagreeing without knowing which two. Everybody else sees what
 * the owner released, and RELEASED_BY_ROLE exists because "the Head of
 * Anaesthesia objected" is often the useful fact while the name attached to it
 * turns a policy review into a personal dispute.
 */
export function attributionFor(opts: {
  role: string | null | undefined;
  extraModules?: readonly string[] | null;
  visibility: PolicyResultsVisibilityLike;
}): Attribution {
  const who = policyRoleOf(opts.role, opts.extraModules);
  if (who === 'owner') return 'full';
  if (who === 'none') return 'none';
  switch (opts.visibility) {
    case 'RELEASED_ATTRIBUTED':
      return 'full';
    case 'RELEASED_BY_ROLE':
      return 'role-only';
    case 'OWNER_ONLY':
    default:
      return 'none';
  }
}

/**
 * May this viewer see individual responses at all?
 *
 * Note what this is NOT: it is not "may they see the counts". Aggregate
 * participation figures are visible to an observer whatever the setting,
 * because "nine of twelve have answered" discloses nothing about what any one
 * person wrote and is the only thing Management usually wants to know.
 */
export function canSeeIndividualResponses(opts: {
  role: string | null | undefined;
  extraModules?: readonly string[] | null;
  visibility: PolicyResultsVisibilityLike;
}): boolean {
  return attributionFor(opts) !== 'none';
}
