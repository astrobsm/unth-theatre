// ============================================================
// The same prescription, sent twice, because the first one looked like it failed
// ------------------------------------------------------------
// WHAT HAPPENED. The pharmacy board on 28 September showed one patient with
// thirteen identical post-operative prescriptions — same drugs, same doses,
// same prescriber — at 18:52, 18:53, 18:53, 18:53, 19:20, 19:22, 19:25, 19:30
// and 19:48. Another patient had two, ninety seconds apart.
//
// Nobody was clicking carelessly. sendRxToPharmacy already disables its button
// while a request is in flight and already tells the surgeon it succeeded. The
// problem is what it says when the request does not come BACK:
//
//     catch { alert('Failed to send prescription to pharmacy.'); }
//
// On this hospital's link a request routinely reaches the server, is acted on,
// and the response never returns — the same dropped connection that wedged the
// sync queue for three days this month. The server had created the
// prescription. The surgeon was told it had failed. So they sent it again, and
// again, for nearly an hour.
//
// THE CLIENT CANNOT FIX THIS ALONE. A caller whose connection dies mid-request
// genuinely does not know whether the work happened; that is the nature of the
// failure, not a bug in the page. Retrying is the correct thing for it to do.
// So the server has to be able to recognise the retry.
//
// AN IDEMPOTENCY KEY IS THE FIRST ANSWER and the route already looks for one —
// but no client has ever sent one, so idempotencyKeyFrom() has always returned
// null and the guard has been decorative. That is fixed alongside this.
//
// THIS IS THE BACKSTOP, and it does not depend on the client at all.
//
// ── WHY NOT A TIME WINDOW ───────────────────────────────────────────────────
//
// The obvious rule is "identical within N minutes". The retries above spanned
// fifty-six minutes, so N would have to be about an hour — and an hour is long
// enough to swallow a genuine second prescription.
//
// The better question is not how long ago, but WHETHER THE FIRST ONE HAS BEEN
// ACTED ON. An identical prescription while the first is still sitting unopened
// in the pharmacy queue is a retry: nothing has consumed it, and a second copy
// adds nothing but the risk of dispensing twice. An identical prescription
// after pharmacy has started packing is plausibly a real repeat request, and is
// allowed through.
//
// That rule needs no arbitrary constant and gets the observed case right.
// ============================================================

/** Statuses meaning nobody in pharmacy has acted on it yet. */
export const UNTOUCHED_STATUSES = ['DRAFT', 'SENT_TO_PHARMACY'];

export interface MedicationLine {
  drugName?: string | null;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: number | null;
}

/**
 * A stable fingerprint of what was prescribed.
 *
 * Order-insensitive, because a form that rebuilds its rows can legitimately
 * serialise the same five drugs in a different order, and that is the same
 * prescription. Whitespace and case are normalised for the same reason —
 * "Ceftriaxone 1g IV" and "ceftriaxone 1g iv " are not two different drugs.
 *
 * Quantity IS included. Five ampoules and fifty are different prescriptions
 * even if every other field matches, and treating them as one would silently
 * discard a correction.
 */
export function fingerprint(meds: MedicationLine[]): string {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const lines = meds
    // A row with no drug name is not a medication, whatever else is on it.
    //
    // Filtering on "the joined line has some characters" does not work: the
    // quantity defaults to 1, so a blank row renders as "|||||1" and counts as
    // present. Two blank prescriptions would then fingerprint identically and
    // the guard would suppress a real send as a duplicate of nothing.
    .filter((m) => norm(m.drugName).length > 0)
    .map((m) => [
      norm(m.drugName), norm(m.dosage), norm(m.route),
      norm(m.frequency), norm(m.duration), String(m.quantity ?? 1),
    ].join('|'))
    .sort();
  return lines.join('~');
}

export interface ExistingPrescription {
  id: string;
  status: string;
  medications: string;
  prescribedById: string;
  prescribedAt: Date | string;
}

export interface DuplicateVerdict {
  /** The prescription this one repeats, if any. */
  duplicateOf: string | null;
  reason: string | null;
}

/**
 * Is this submission a repeat of one already sitting in the queue?
 *
 * Compared against the SAME surgery and the SAME prescriber only. Two
 * different surgeons prescribing identically for one patient is not a retry —
 * it is two people who both need to be recorded, and collapsing them would
 * erase one of them from the record.
 *
 * Pure, so the rule can be exercised without a database. The caller supplies
 * the candidates.
 */
export function findDuplicate(
  incoming: { medications: MedicationLine[]; prescribedById: string },
  existing: ExistingPrescription[],
): DuplicateVerdict {
  const incomingPrint = fingerprint(incoming.medications);
  if (!incomingPrint) return { duplicateOf: null, reason: null };

  for (const e of existing) {
    if (e.prescribedById !== incoming.prescribedById) continue;
    if (UNTOUCHED_STATUSES.indexOf(e.status) === -1) continue;

    let meds: MedicationLine[];
    try {
      const parsed = JSON.parse(e.medications);
      meds = Array.isArray(parsed) ? parsed : [];
    } catch {
      // An unparseable payload cannot be compared, and guessing that it
      // matches would discard a real prescription. Treated as different.
      continue;
    }

    if (fingerprint(meds) === incomingPrint) {
      return {
        duplicateOf: e.id,
        reason: 'An identical prescription from you is already waiting in the pharmacy '
          + 'queue and has not been opened yet. This looks like the same one sent again '
          + 'after a dropped connection, so the original stands rather than a second copy '
          + 'being added.',
      };
    }
  }

  return { duplicateOf: null, reason: null };
}
