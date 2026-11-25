// ============================================================
// Role groups and inheritance
// ------------------------------------------------------------
// Some roles are a SENIORITY of another role rather than a different job. A
// consultant surgeon does everything a resident surgeon does, plus consultant
// duties. Rather than repeat 'CONSULTANT_SURGEON' next to all ~127 existing
// 'SURGEON' mentions — where one missed line silently locks a consultant out
// of theatre — the senior role INHERITS the junior one, and every central
// access check expands it.
//
// Adding a further seniority split later is then one line here plus the enum.
// ============================================================

/** senior role -> the role(s) whose access it also has. */
export const ROLE_INHERITS: Record<string, string[]> = {
  CONSULTANT_SURGEON: ['SURGEON'],

  // The clinical heads, added 8 November 2026 with the Theatre Research Board.
  //
  // Each head is a consultant in their own discipline who also runs it, so the
  // head role inherits the consultant role and reaches everything a consultant
  // reaches. Without this, creating HEAD_OF_ENT would have produced an account
  // that could chair a research application but could not open a theatre list
  // -- and the ~127 places that name SURGEON would each have needed editing.
  //
  // The three heads that already existed are mapped here too. They were
  // previously listed explicitly wherever they applied, which worked but meant
  // every new screen had to remember to list them.
  HEAD_OF_SURGERY: ['CONSULTANT_SURGEON'],
  HEAD_OF_OBSTETRICS_GYNAECOLOGY: ['CONSULTANT_SURGEON'],
  HEAD_OF_MAXILLOFACIAL: ['CONSULTANT_SURGEON'],
  HEAD_OF_ENT: ['CONSULTANT_SURGEON'],
  HEAD_OF_OPHTHALMOLOGY: ['CONSULTANT_SURGEON'],
  HEAD_OF_ANAESTHESIA: ['CONSULTANT_ANAESTHETIST'],
  HEAD_OF_PHARMACY: ['PHARMACIST'],

  // House officers, 25 November 2026, on instruction: they are to mark cases
  // completed and otherwise have the same access as a surgeon.
  //
  // INHERITANCE RATHER THAN FIFTY-FIVE EDITS. HOUSE_OFFICER was already named
  // in about a dozen role lists and absent from the rest, so a house officer
  // could request imaging and amend a pack but could not close the case they
  // had just scrubbed for. Listing them beside every 'SURGEON' would be the
  // same work again next time, and one missed line is an account that looks
  // right and is locked out of one screen.
  //
  // THIS IS A DIRECTION, NOT A SENIORITY. Everywhere else in this map the
  // junior role is inherited BY the senior one. Here the opposite: the house
  // officer is the most junior grade and is being GIVEN the resident's access,
  // because in this theatre they do the work -- the booking, the consent, the
  // pre-op requirements, the post-op note -- and the system was making a
  // consultant log in to record it.
  //
  // WHAT IT DOES NOT GIVE THEM. Inheritance only answers "may this account
  // open that"; it does not make a house officer a surgeon. They are
  // deliberately NOT in SURGEON_ROLES below, so they are not offered in the
  // operating-surgeon picker, are not recorded as the surgeon on a case they
  // create, and are not counted as a surgeon in the research figures. And
  // nothing here reaches consultant-only ground -- the theatre analytics and
  // the procedure-pack catalogue name CONSULTANT_SURGEON and not SURGEON, so
  // a house officer gets neither, which is exactly surgeon parity.
  HOUSE_OFFICER: ['SURGEON'],
  // NOTE: CONSULTANT_ANAESTHETIST is deliberately NOT mapped to ANAESTHETIST.
  // That pair predates this file and is already listed explicitly wherever it
  // applies; adding inheritance would silently widen consultants' access
  // beyond what was configured. It can be added later as a deliberate change.
};

/**
 * The role plus everything it inherits — what access checks should test.
 *
 *   effectiveRoles('CONSULTANT_SURGEON') -> ['CONSULTANT_SURGEON', 'SURGEON']
 *   effectiveRoles('SCRUB_NURSE')        -> ['SCRUB_NURSE']
 */
export function effectiveRoles(role: string | undefined | null): string[] {
  if (!role) return [];
  const out = [role];
  const seen = new Set(out);
  // Walk the chain so a future three-level split resolves too.
  for (let i = 0; i < out.length; i++) {
    for (const parent of ROLE_INHERITS[out[i]] ?? []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        out.push(parent);
      }
    }
  }
  return out;
}

/**
 * Does this role satisfy `required`, directly or by inheritance?
 * Use in place of `role === 'SURGEON'`.
 */
export function roleSatisfies(role: string | undefined | null, required: string): boolean {
  return effectiveRoles(role).includes(required);
}

/**
 * Does this role appear in an allow-list, directly or by inheritance?
 * Use in place of `ALLOWED.includes(session.user.role)`.
 */
export function roleAllowed(role: string | undefined | null, allowed: readonly string[]): boolean {
  return effectiveRoles(role).some((r) => allowed.includes(r));
}

// ------------------------------------------------------------
// Convenience groups for querying users
// ------------------------------------------------------------

/** Every role that operates as a surgeon — for pickers and `role: { in: … }`. */
export const SURGEON_ROLES = ['SURGEON', 'CONSULTANT_SURGEON'] as const;

/** Every role that operates as an anaesthetist. */
export const ANAESTHETIST_ROLES = ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'] as const;

export function isSurgeonRole(role: string | undefined | null): boolean {
  return !!role && (SURGEON_ROLES as readonly string[]).includes(role);
}

export function isAnaesthetistRole(role: string | undefined | null): boolean {
  return !!role && (ANAESTHETIST_ROLES as readonly string[]).includes(role);
}

/** True for the consultant grade of any clinical role. */
export function isConsultantRole(role: string | undefined | null): boolean {
  return role === 'CONSULTANT_SURGEON' || role === 'CONSULTANT_ANAESTHETIST';
}

/**
 * Seniority label for display next to a name, e.g. "Consultant" / "Resident".
 * Returns null for roles where the distinction does not apply.
 */
export function seniorityLabel(role: string | undefined | null): string | null {
  if (role === 'CONSULTANT_SURGEON' || role === 'CONSULTANT_ANAESTHETIST') return 'Consultant';
  if (role === 'SURGEON' || role === 'ANAESTHETIST') return 'Resident';
  return null;
}
