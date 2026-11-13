'use client';

// ============================================================
// DAY CASE — said loudly, and said with what follows from it
// ------------------------------------------------------------
// Reported on 13 November: an anaesthetist walks the hospital to review a
// patient before a list, works out which ward, gets there, and is told the
// patient is a day case and has not come in yet. The walk is twenty minutes
// across Ituku-Ozalla and it is wasted; worse, it is usually spent at the hour
// when the reviews actually had to be done.
//
// isDayCase was captured at booking and shown on exactly one screen — the
// call-for-patient page, which is read by the holding area, not by the person
// deciding whose bed to walk to. Every screen an anaesthetist works from
// omitted it, so the case looked like any other inpatient on the list.
//
// THE LABEL ALONE, BY DECISION. This used to spell out the consequence in
// prose — not on a ward, comes in on the morning, do not go looking for a
// bed — on the argument that "day case" is a discharge term and reads as a
// statement about where the patient GOES rather than where they ARE.
//
// That argument lost to the table. Three lines of text in a patient cell
// pushed the rows apart and distorted the theatre list, which is read by
// scanning a column; it was reported and the prose was cut. The sentence
// is still on the tooltip for anyone who wants it, and the amber badge is
// loud enough to stop a reader on the row — which was the point.
//
// NOT A STATUS. This says nothing about whether the patient has arrived; it
// says the case is one where they will not be on a ward the night before.
// Claiming to know their whereabouts would be worse than saying nothing: an
// anaesthetist who trusted it once and found it stale would stop reading it.
// ============================================================

import { Sun, AlertTriangle } from 'lucide-react';

/**
 * A one-line amber badge. Both forms say the same two words now that the
 * sentence has gone; they differ only in weight, and the difference is worth
 * keeping because the surfaces are different.
 *
 * Default: bordered, on a pale fill, with a warning triangle — for a list that
 * somebody reads and then walks away from.
 * `compact`: a solid chip — for the anaesthetist's board, where every row
 * already carries several badges and a fourth border is noise.
 */
export default function DayCaseFlag({
  compact = false,
  className = '',
}: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${className}`}
        title="Day case — the patient is not on a ward. They arrive on the morning of surgery."
      >
        <Sun className="h-3 w-3" /> Day case
      </span>
    );
  }

  // ONE LINE, and inline rather than a block.
  //
  // It used to carry the sentence as well: "Not on a ward. The patient
  // comes in on the morning of surgery - do not go looking for a bed."
  // Asked for and removed: three lines of prose in a table cell pushed
  // every row apart and distorted the list. A theatre list is read by
  // scanning a column, and a warning that wrecks the column costs more
  // than the words explain. The words survive in the tooltip.
  //
  // Inline-flex, so the badge cannot set a row
  // height on its own.
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-amber-500 bg-amber-100 px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-900 ${className}`}
      title="Day case — the patient is not on a ward. They come in on the morning of surgery."
    >
      <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-700" />
      Day case
    </span>
  );
}

/**
 * THE OTHER ANSWER, said quietly.
 *
 * Why an inpatient needs a mark at all: a day case used to be indicated by
 * the PRESENCE of the band above and nothing else, so a row with no band
 * meant either "this is an inpatient" or "the flag did not render" or
 * "nobody ever answered the question". Those three look identical, and the
 * third was the truth for every case in the database until the booking form
 * started requiring an answer. A reader could not tell, and said so: "I
 * still cannot find where you indicated day cases."
 *
 * With both answers printed, an unmarked row is visibly a fault rather than
 * a quiet claim about a patient.
 *
 * DELIBERATELY RECESSIVE. The inpatient is the ordinary case and must not
 * compete with the warning: grey text, no border, no icon. The day case is
 * the one that changes what somebody does next.
 */
export function InpatientNote({ className = '' }: { className?: string }) {
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-wide text-gray-400 ${className}`}
      title="Inpatient — admitted to a ward before surgery."
    >
      Inpatient
    </p>
  );
}
