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
