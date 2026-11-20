// ============================================================
// Which units operate at which site
// ------------------------------------------------------------
// Every other site in the hospital belongs to the units based there: the Eye
// Theatre is Ophthalmology's, the Cardiothoracic Centre is CTU's, and a unit
// list filtered to those is the right list.
//
// A&E IS NOT LIKE THE OTHERS. It is the twenty-four-hour emergency theatre and
// it takes cases from EVERY surgical unit -- general, orthopaedic, urological,
// paediatric, plastic and the rest. The Theatre Users Committee's own position
// (prayer 5 of the conference paper in src/lib/audit/conference.ts) is that all
// emergency surgical cases belong there, with four recorded exceptions, and
// those exceptions send cases AWAY from A&E rather than restricting who may
// come to it.
//
// So filtering the unit list by `unit.location === 'A&E'` asks a question with
// no useful answer: it returns the handful of units whose HOME is recorded as
// A&E, which is nobody's definition of who operates there. On the planned-cases
// form it left the unit dropdown empty, and a form that cannot be completed is
// a case that gets planned on paper.
//
// WHY THIS IS A SHARED MODULE. The booking form already had this rule, as a
// private function inside a 3,000-line page. The planning form did not, which
// is how the two came to disagree about the same hospital. One rule, one place,
// and a test that holds it.
// ============================================================

/** A site where any unit may operate, so the unit list is not narrowed. */
export function isOpenToEveryUnit(site: string | null | undefined): boolean {
  const l = (site ?? '').toLowerCase();
  // Matched loosely on purpose. The canonical label is 'A&E' (see LOCATIONS in
  // src/lib/constants.ts), but the same place is written 'A & E' and 'Accident
  // and Emergency' across seeds, rosters and things people have typed, and a
  // rule that only recognises one spelling is a rule that silently stops
  // applying the first time somebody writes another.
  return l.includes('a&e') || l.includes('a & e') || l.includes('accident');
}

/**
 * Kept under its old name as well, because that is what the booking form calls
 * it and renaming a working rule while moving it is two changes to review as
 * one.
 */
export const isAneLocation = isOpenToEveryUnit;

export interface UnitAtSite {
  location?: string | null;
}

/**
 * The units to offer for a chosen site.
 *
 * No site chosen means every unit, which is the honest answer to "I have not
 * said where yet" and the one the form opens on.
 */
export function unitsForSite<T extends UnitAtSite>(units: T[], site: string | null | undefined): T[] {
  const chosen = (site ?? '').trim();
  if (!chosen) return units;
  if (isOpenToEveryUnit(chosen)) return units;
  return units.filter((u) => (u.location ?? '') === chosen);
}
