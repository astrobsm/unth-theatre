/**
 * How a patient is named on a list when the record is incomplete.
 *
 * The theatre list showed "Unknown Patient — N/A" for a booked case. That
 * wording is not merely unhelpful, it is FALSE, and dangerously so: on a
 * theatre list an unknown patient means an unidentified patient, which is a
 * real and alarming clinical category. This was nothing of the kind.
 *
 * Surgery.patientId is NOT NULL, and every patient row in the database has a
 * name and an identifier — checked on both nodes. So a surgery whose `patient`
 * object is absent can only mean the details were NOT LOADED: the list renders
 * from an offline cache first (cacheFirstFetch in the surgeries page), and a
 * cached payload written by an older build, or truncated, has the row without
 * its patient.
 *
 * The distinction matters because the two states need opposite responses.
 * "Unknown patient" sends somebody to the ward to identify a patient.
 * "Not loaded" sends them to the refresh button.
 */

export interface PatientLike {
  id?: string | null;
  name?: string | null;
  folderNumber?: string | null;
  ptNumber?: string | null;
  age?: number | null;
  gender?: string | null;
  ward?: string | null;
}

export interface PatientLabel {
  /** What to show where the name goes. */
  name: string;
  /** What to show underneath: folder number, or why it is missing. */
  identifier: string;
  /** True when the record is absent rather than genuinely anonymous. */
  notLoaded: boolean;
}

const clean = (s: string | null | undefined) => (s ?? '').trim();

/**
 * The name and identifier to display for a case.
 *
 * @param patient the joined patient, which may be absent on a cached row.
 */
export function patientLabel(patient: PatientLike | null | undefined): PatientLabel {
  const name = clean(patient?.name);

  if (!patient || !name) {
    return {
      name: 'Patient details not loaded',
      identifier: 'Pull to refresh, or reopen this list',
      notLoaded: true,
    };
  }

  return {
    name,
    // ptNumber is the fallback the rest of the app uses when there is no folder
    // number; showing "N/A" while a PT number exists hides an identifier that
    // is on the wristband.
    identifier: clean(patient.folderNumber) || clean(patient.ptNumber) || 'No folder number recorded',
    notLoaded: false,
  };
}

/** "10y Female", or an empty string when neither is known. */
export function patientAgeSex(patient: PatientLike | null | undefined): string {
  if (!patient) return '';
  const age = patient.age != null ? `${patient.age}y` : '';
  const sex = clean(patient.gender);
  return [age, sex].filter(Boolean).join(' ');
}
