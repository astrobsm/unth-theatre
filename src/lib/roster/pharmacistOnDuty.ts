// ============================================================
// Which pharmacist the theatre rings today
// ------------------------------------------------------------
// Asked for on 12 November: the surgery schedule is to name the pharmacist on
// duty for the day and the shift, with a number — and when nobody is rostered,
// to fall back to a standing contact rather than showing an empty row.
//
// WHY A CHAIN AND NOT A LOOKUP. Theatre rings pharmacy because a case is held
// up for drugs. "Nobody is rostered" is a true answer that does not help: the
// drugs are still missing and somebody still has to be rung. So the question
// this file answers is not "who is rostered" but "who does theatre ring", and
// those differ on exactly the days it matters.
//
// The chain, in order, and each step says WHICH it was so the screen can be
// honest about it:
//
//   roster     — rostered PHARMACISTS for this date and shift. The real answer.
//   role       — no roster, so the first approved PHARMACIST. On-call by role;
//                advisory, the same fallback the theatre manager and blood
//                bank already use.
//   standing   — no pharmacist in the system at all, so the named standing
//                contact, resolved from their own user record.
//   none       — there is nobody. Said out loud, with what to do about it.
//
// THE NUMBER IS NEVER WRITTEN DOWN HERE. The standing contact is a NAME; the
// number comes from that person's user record, so it is whatever they last
// set and it changes when they change it. A number pasted into this file
// would be correct until the day they switched SIM, and nothing would say so.
// PHARMACY_FALLBACK_PHONE exists for the case where the standing contact is
// not a user of the system at all.
//
// AMBIGUITY IS NOT RESOLVED BY GUESSING. If the standing name matches several
// people and none of them is a pharmacist, this returns nobody rather than a
// number that rings a stranger at 3 a.m. The band then says the contact could
// not be resolved, which is a problem somebody can fix; a wrong number is not.
// ============================================================

import { watMinutesOfDay, watToday } from '@/lib/watDay';
import { electiveShiftFromMinutes, type DutyShift } from '@/lib/rosterOnDutyShift';

/** Who the theatre rings when nobody is rostered. A NAME, never a number. */
export const STANDING_PHARMACY_CONTACT_NAME =
  (process.env.PHARMACY_FALLBACK_NAME || '').trim() || 'Ayogu';

/**
 * A number for the standing contact when they are not a user of the system.
 *
 * Deliberately an environment variable and not a constant: it is one person's
 * personal line, and the repository is not the place for it.
 */
export const STANDING_PHARMACY_CONTACT_PHONE =
  (process.env.PHARMACY_FALLBACK_PHONE || '').trim() || null;

export type PharmacistSource = 'roster' | 'role' | 'standing' | 'none';

export interface PharmacistLike {
  userId: string;
  name: string;
  phoneNumber: string | null;
  extension?: string | null;
  shift?: string | null;
  role?: string | null;
}

export interface PharmacistOnDuty extends PharmacistLike {
  source: PharmacistSource;
}

export interface PharmacistOnDutyDecision {
  source: PharmacistSource;
  people: PharmacistOnDuty[];
  /** The standing contact's name, so the screen can say who it fell back to. */
  standingName: string;
  /**
   * Set when the standing name matched more than one person and none of them
   * was a pharmacist. The screen says this rather than ringing one at random.
   */
  ambiguous?: boolean;
}

/**
 * Which shift to show for a given day.
 *
 * TODAY is the hospital's today, in WAT, and the shift is the one the floor is
 * actually running at this minute. Any OTHER day has no "now" to read, so the
 * whole day is shown instead — a band that announced the morning pharmacist
 * for a list three days out would be naming somebody who may not be on it.
 *
 * Read from the hospital's clock throughout. The server runs UTC and a laptop
 * runs whatever it was set to; neither may decide which shift the theatre is
 * told about, because at 23:30 WAT they disagree about the DAY as well.
 */
export function shiftForDay(day: string, now: Date = new Date()): DutyShift | null {
  if (day !== watToday(now)) return null;
  return electiveShiftFromMinutes(watMinutesOfDay(now));
}

const norm = (s: string) => s.trim().toLowerCase();

/** Is this person's role a pharmacy one? */
function isPharmacist(role: string | null | undefined): boolean {
  return typeof role === 'string' && role.toUpperCase().includes('PHARMAC');
}

/**
 * Pick the standing contact out of everyone whose name matches.
 *
 * Exported because the ambiguity rule is the part worth testing on its own:
 * it is the difference between "no contact" and "the wrong person's phone".
 */
export function chooseStandingContact(
  matches: PharmacistLike[],
): { person: PharmacistLike | null; ambiguous: boolean } {
  const reachable = matches.filter((m) => (m.phoneNumber || '').trim().length > 0);
  if (reachable.length === 0) return { person: null, ambiguous: false };
  if (reachable.length === 1) return { person: reachable[0], ambiguous: false };

  const pharmacists = reachable.filter((m) => isPharmacist(m.role));
  if (pharmacists.length === 1) return { person: pharmacists[0], ambiguous: false };

  // Several people answer to the name and the role does not separate them.
  return { person: null, ambiguous: true };
}

/**
 * The decision itself: who does theatre ring for this day and shift.
 *
 * A pure function over what the database returned, so the chain can be tested
 * without a database — and so that a step cannot be quietly disabled inside a
 * route handler while a test that reads the source still passes.
 */
export function resolvePharmacistOnDuty(input: {
  /** Rostered PHARMACISTS for the day (and shift, where one applies). */
  rostered: PharmacistLike[];
  /** Approved users holding a pharmacist role. */
  roleHolders: PharmacistLike[];
  /** Approved users whose name matches the standing contact. */
  standingMatches: PharmacistLike[];
  /** A configured number, used only when the standing contact is not a user. */
  configuredPhone?: string | null;
  standingName?: string;
}): PharmacistOnDutyDecision {
  const standingName = input.standingName ?? STANDING_PHARMACY_CONTACT_NAME;

  // A rostered pharmacist with no number on file is still the rostered
  // pharmacist — the band says "no phone on file" and the name is enough to
  // find them on the floor. This is the one step where unreachable still wins,
  // because the alternative is quietly ringing somebody who is not on duty.
  if (input.rostered.length > 0) {
    return {
      source: 'roster',
      people: input.rostered.map((p) => ({ ...p, source: 'roster' as const })),
      standingName,
    };
  }

  const reachableRole = input.roleHolders.filter((p) => (p.phoneNumber || '').trim().length > 0);
  if (reachableRole.length > 0) {
    return {
      source: 'role',
      people: [{ ...reachableRole[0], source: 'role' as const }],
      standingName,
    };
  }

  const { person, ambiguous } = chooseStandingContact(input.standingMatches);
  if (person) {
    return {
      source: 'standing',
      people: [{ ...person, source: 'standing' as const }],
      standingName,
    };
  }

  const configured = (input.configuredPhone || '').trim();
  if (!ambiguous && configured) {
    return {
      source: 'standing',
      people: [{
        userId: 'configured',
        name: standingName,
        phoneNumber: configured,
        source: 'standing' as const,
      }],
      standingName,
    };
  }

  return { source: 'none', people: [], standingName, ambiguous };
}

/** Does the name on a user record answer to the standing contact's name? */
export function matchesStandingName(fullName: string, standingName: string): boolean {
  const n = norm(fullName);
  const target = norm(standingName);
  if (!n || !target) return false;
  return n.split(/[\s,]+/).includes(target) || n.includes(target);
}
