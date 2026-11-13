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
// WHY THE LABEL ALONE IS NOT ENOUGH. "Day case" is a billing and discharge
// term, and read quickly it says something about where the patient GOES
// afterwards. The mistake being prevented is an assumption about where they
// ARE NOW. So the flag carries the consequence in words — not on a ward,
// arrives on the morning — because that is the sentence that stops the walk.
//
// NOT A STATUS. This says nothing about whether the patient has arrived; it
// says the case is one where they will not be on a ward the night before.
// Claiming to know their whereabouts would be worse than saying nothing: an
// anaesthetist who trusted it once and found it stale would stop reading it.
// ============================================================

import { Sun, AlertTriangle } from 'lucide-react';

/**
 * The loud version: a band for a row on a list somebody walks away from.
 *
 * `compact` is for places where the row is already dense — it keeps the
 * colour and the word and drops the sentence.
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

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border-2 border-amber-500 bg-amber-50 px-2.5 py-1.5 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wide text-amber-900">
          Day case
        </p>
        <p className="text-xs text-amber-900">
          Not on a ward. The patient comes in on the morning of surgery — do not
          go looking for a bed.
        </p>
      </div>
    </div>
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
