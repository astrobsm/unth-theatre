// ============================================================
// A patient number, typed six different ways
// ------------------------------------------------------------
// The number is read aloud across a counter, copied off a card, or
// remembered. It arrives as "PT-12345", "PT 12345", "pt12345", "PT12345",
// sometimes with a stray space on the end from a barcode scanner. Stored, it
// is one of those forms and only one.
//
// An exact match therefore fails for a patient who is on file and standing
// there, and the screen says "no surgery found" — which reads as "this
// patient was never booked" and sends somebody to the booking office. That is
// the whole reason this file exists.
//
// WHY IT RETURNS CANDIDATES RATHER THAN ONE NORMAL FORM. The database holds
// what was typed at registration, which is not consistent and cannot be
// migrated without touching every row. Normalising the INPUT does not help if
// the STORED value is the odd one; so the input is expanded into every form it
// could have been stored as, and the query matches any of them.
//
// AND WHY A BARE NUMBER IS HANDLED SEPARATELY. Folder numbers here are bare
// digits — 565979. PT numbers are PT-prefixed. So "12345" might be a folder
// number, or somebody reading the digits off a PT card. Both are searched, and
// if the two land on DIFFERENT patients the caller is told so rather than
// handed one of them: at a pharmacy window, quietly picking the wrong patient
// dispenses the wrong drugs.
// ============================================================

/** Everything that is not a letter or a digit, which is all the noise. */
const SEPARATORS = /[\s\-_/.]+/g;

/** Did the person type a PT prefix, in any of its forms? */
const PT_PREFIXED = /^PT[\s\-_.]*([A-Z0-9]+)$/i;

export interface PatientNumberForms {
  /** What to match against folderNumber / ptNumber, in any order. */
  candidates: string[];
  /** True when the input carried no PT prefix, so it may be either kind. */
  bare: boolean;
}

/**
 * Every way this input might have been written down.
 *
 * Case is left to the query (`mode: 'insensitive'`), so these are produced in
 * upper case and compared case-blind.
 */
export function patientNumberForms(input: string): PatientNumberForms {
  const typed = (input ?? '').trim();
  if (!typed) return { candidates: [], bare: false };

  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (t && !out.some((e) => e.toUpperCase() === t.toUpperCase())) out.push(t);
  };

  // Always try exactly what was typed. If the stored value is something this
  // function never thought of, that is still the best single guess.
  add(typed);
  // And with internal runs of separators collapsed, which covers a double
  // space or a scanner's trailing tab.
  add(typed.replace(/\s+/g, ' '));

  const pt = PT_PREFIXED.exec(typed);
  if (pt) {
    const body = pt[1].toUpperCase();
    // The three forms the user asked for, plus the stripped body — because a
    // PT card number is sometimes registered without its prefix.
    add(`PT-${body}`);
    add(`PT ${body}`);
    add(`PT${body}`);
    add(body);
    return { candidates: out, bare: false };
  }

  // No prefix. Search it as written, and as a PT number, because somebody
  // reading digits off a PT card leaves the letters out.
  const core = typed.replace(SEPARATORS, '').toUpperCase();
  add(core);
  if (/^[0-9]+$/.test(core)) {
    add(`PT-${core}`);
    add(`PT ${core}`);
    add(`PT${core}`);
  }
  return { candidates: out, bare: true };
}

/**
 * Said when one number landed on more than one patient.
 *
 * Names them, because the person at the counter has the patient in front of
 * them and can tell which is which in a second — whereas "ambiguous" alone
 * leaves them with nothing to do but try again and get the same answer.
 */
export function ambiguousNumberMessage(
  typed: string,
  patients: Array<{ name: string | null; folderNumber: string | null; ptNumber: string | null }>,
): string {
  const who = patients
    .map((p) => `${p.name ?? 'unnamed'} (${p.ptNumber ?? p.folderNumber ?? 'no number'})`)
    .join('; ');
  return `"${typed}" matches more than one patient: ${who}. `
    + 'Type the full number exactly as it appears on their card so the right one is used.';
}
