// Shared helpers for displaying patient age with its unit (years/months/weeks/days).
// Neonates and infants can be registered as e.g. "2 weeks" or "1 month".

export type AgeUnit = 'YEARS' | 'MONTHS' | 'WEEKS' | 'DAYS';

export const AGE_UNITS: { value: AgeUnit; label: string }[] = [
  { value: 'YEARS', label: 'Years' },
  { value: 'MONTHS', label: 'Months' },
  { value: 'WEEKS', label: 'Weeks' },
  { value: 'DAYS', label: 'Days' },
];

/**
 * Format a patient's age for display, e.g. 2 + WEEKS -> "2 weeks", 45 + YEARS -> "45 years".
 * Falls back to years when no unit is provided (legacy records).
 */
export function formatAge(age: number | null | undefined, ageUnit?: string | null): string {
  if (age === null || age === undefined || Number.isNaN(age)) return '—';
  const unit = (ageUnit || 'YEARS').toUpperCase();
  const singularByUnit: Record<string, string> = {
    YEARS: 'year',
    MONTHS: 'month',
    WEEKS: 'week',
    DAYS: 'day',
  };
  const word = singularByUnit[unit] || 'year';
  return `${age} ${word}${age === 1 ? '' : 's'}`;
}

/**
 * Convert an age + unit into DAYS.
 *
 * ageInYears() floors everything under a year to 0, which is right for a risk
 * calculator and wrong for anything that has to tell a newborn from an
 * eleven-month-old. A baby's safe heart rate is not the same on day two as it
 * is at ten months, so the recovery room needs the resolution that years
 * throw away.
 *
 * A year is 365.25 days and a month 30.4375, so that `1 YEARS` and
 * `12 MONTHS` land on the same day and an age given in years never falls just
 * short of its own band boundary.
 *
 * Returns null when there is no age to convert. Null is not zero: a missing
 * age must not read as a newborn.
 */
export function ageInDays(age: number | null | undefined, ageUnit?: string | null): number | null {
  if (age === null || age === undefined || Number.isNaN(age) || age < 0) return null;
  switch ((ageUnit || 'YEARS').toUpperCase()) {
    case 'MONTHS':
      return age * 30.4375;
    case 'WEEKS':
      return age * 7;
    case 'DAYS':
      return age;
    case 'YEARS':
    default:
      return age * 365.25;
  }
}

/**
 * Convert an age + unit into whole years for numeric risk calculators.
 * Anything below a year resolves to 0 (lowest age bracket).
 */
export function ageInYears(age: number | null | undefined, ageUnit?: string | null): number {
  if (!age || Number.isNaN(age)) return 0;
  switch ((ageUnit || 'YEARS').toUpperCase()) {
    case 'YEARS':
      return age;
    case 'MONTHS':
      return Math.floor(age / 12);
    case 'WEEKS':
      return Math.floor(age / 52);
    case 'DAYS':
      return Math.floor(age / 365);
    default:
      return age;
  }
}
