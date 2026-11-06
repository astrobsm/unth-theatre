// ============================================================
// "Not fit yet" — what the surgeon is told, and what to do about it
// ------------------------------------------------------------
// Asked for on 6 November:
//
//   "at the end of second step, fitness status will be selected and
//    recommendation made on what will be done to make the patient fit, then
//    advice surgeon to optimize and reschedule asap"
//
// WHAT WAS THERE BEFORE. The emergency pre-anaesthetic assessment ended in
// three prose fields — risk assessment, special considerations, and a box
// headed "What needs to be optimised before surgery" whose contents the API
// silently discarded, because the field was never in the schema the route
// parsed. So the one question the rest of the theatre needs answered — may
// this patient have this anaesthetic now — was answered nowhere, and the
// anaesthetist's list of what to fix was answered into a void.
//
// THE DECISION VOCABULARY IS THE ELECTIVE ONE, reused rather than copied:
// lib/anaesthesia/fitness.ts, FIT or NOT_FIT, with the same optimisation
// categories and the same canCompleteReview() gate. A patient is fit for an
// anaesthetic or is not. A second vocabulary for emergencies would mean the
// theatre board had to know which kind of case it was looking at before it
// could read the answer.
//
// WHAT "RESCHEDULE ASAP" MEANS IN AN EMERGENCY, AND WHY THE WORDING IS
// CAREFUL. It does not mean "next week's list". It means: fix these things
// now, and bring the case back the moment they are done — in an emergency
// that is usually the same hour. The message therefore asks for optimisation
// AND re-listing in one breath, gives each requirement an owner and a target
// where the anaesthetist set one, and says plainly what unblocks the case: an
// anaesthetist reassessing the patient. Completing the tasks is evidence for
// a reassessment, never a substitute for one.
//
// IT DOES NOT TELL THE SURGEON THE CASE IS CANCELLED. That is not the
// anaesthetist's decision to communicate, and an emergency whose indication
// is worsening may still have to go unoptimised with both consultants
// agreeing to it. The message states the clinical position and what would
// change it, and leaves the decision where it belongs.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import {
  CATEGORY_LABELS, type FitnessDecision, type OptimisationRequirement,
} from '@/lib/anaesthesia/fitness';

export interface AdviceCase {
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  theatreName?: string | null;
  surgeonName?: string | null;
  /** The anaesthetist who did the review. */
  reviewerName: string;
  /** Their proposed technique, where one was chosen. */
  anaestheticPlan?: string | null;
  /** The free-text summary, where the anaesthetist wrote one. */
  optimisationNeeded?: string | null;
  riskAssessment?: string | null;
  at: Date;
}

const stamp = (at: Date): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Africa/Lagos',
    }).format(at);
  } catch {
    return at.toISOString();
  }
};

/** A target time, as a person reads it. Empty when none was set. */
export function targetLabel(v: Date | string | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Africa/Lagos',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** One requirement, written out as an instruction with an owner. */
export function requirementLine(r: OptimisationRequirement, n: number): string {
  const category = CATEGORY_LABELS[r.category] ?? r.category.replace(/_/g, ' ').toLowerCase();
  const owner = (r.responsible ?? '').trim();
  const by = targetLabel(r.targetCompletion);
  const tail = [
    owner ? `who: ${owner}` : '',
    by ? `by: ${by}` : '',
    r.priority && r.priority !== 'MEDIUM' ? `priority: ${r.priority.toLowerCase()}` : '',
  ].filter(Boolean).join(', ');
  return `${n}. *${category}* — ${r.action.trim()}${tail ? ` (${tail})` : ''}`;
}

/**
 * The message to the surgeon.
 *
 * FIT and NOT_FIT both produce one, because the surgeon is waiting either
 * way and silence is the thing this whole change exists to end. The fit
 * message is four lines; the unfit one carries the list.
 */
export function buildSurgeonFitnessAdvice(input: {
  decision: FitnessDecision;
  requirements: readonly OptimisationRequirement[];
  facts: AdviceCase;
}): string {
  const { decision, requirements, facts } = input;
  const who = `${facts.patientName}${facts.folderNumber ? ` (${facts.folderNumber})` : ''}`;
  const lines: string[] = [];

  if (decision === 'FIT') {
    lines.push('✅ *PRE-ANAESTHETIC REVIEW — PATIENT IS FIT*');
    lines.push('');
    lines.push(`${facts.surgeonName ? `${facts.surgeonName}, ` : ''}${who} — ${facts.procedureName}`);
    lines.push('');
    lines.push(
      `${facts.reviewerName} reviewed this patient at ${stamp(facts.at)} and finds them `
      + `*fit for the proposed anaesthesia*`
      + `${facts.anaestheticPlan ? ` (${facts.anaestheticPlan})` : ''}.`,
    );
    if ((facts.optimisationNeeded ?? '').trim()) {
      lines.push('');
      lines.push(`*Note from the anaesthetist:* ${(facts.optimisationNeeded ?? '').trim()}`);
    }
    lines.push('');
    lines.push(
      '*Nothing is waiting on anaesthesia.* The emergency must still be on the table '
      + 'within the hour of booking.',
    );
    lines.push('');
    lines.push('— UNTH Theatre, Operative Resource Manager');
    return withNetworkNotice(lines.join('\n'));
  }

  lines.push('⛔ *PRE-ANAESTHETIC REVIEW — PATIENT NOT YET FIT*');
  lines.push('');
  lines.push(`${facts.surgeonName ? `${facts.surgeonName}, ` : ''}${who} — ${facts.procedureName}`
    + `${facts.theatreName ? `, ${facts.theatreName}` : ''}`);
  lines.push('');
  lines.push(
    `${facts.reviewerName} reviewed this patient at ${stamp(facts.at)} and finds them `
    + '*not fit for the proposed anaesthesia as they stand*.',
  );
  if ((facts.riskAssessment ?? '').trim()) {
    lines.push('');
    lines.push(`*Why:* ${(facts.riskAssessment ?? '').trim()}`);
  }

  lines.push('');
  lines.push(
    requirements.length === 1
      ? '*What must be done to make this patient fit:*'
      : `*What must be done to make this patient fit (${requirements.length}):*`,
  );
  requirements.forEach((r, i) => lines.push(requirementLine(r, i + 1)));

  if ((facts.optimisationNeeded ?? '').trim()) {
    lines.push('');
    lines.push(`*Also:* ${(facts.optimisationNeeded ?? '').trim()}`);
  }

  lines.push('');
  lines.push(
    '*Please optimise and re-list as soon as this is done.* In an emergency that '
    + 'usually means within the hour, not on another day — the sooner each item is '
    + 'cleared, the sooner this patient can go.',
  );
  lines.push('');
  lines.push(
    '*What unblocks the case:* an anaesthetist re-assessing the patient and recording '
    + 'it. Completing the items above is the evidence for that reassessment, not a '
    + 'substitute for it, so tell the anaesthetist the moment they are done.',
  );
  lines.push('');
  lines.push(
    '_If the indication will not wait for any of this, discuss it with the '
    + 'anaesthetist now and record what you both decide. A case may proceed '
    + 'unoptimised on a shared decision; it must not proceed on silence._',
  );
  lines.push('');
  lines.push('— UNTH Theatre, Operative Resource Manager');

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for the in-app bell. */
export function adviceNotificationLine(
  decision: FitnessDecision,
  requirements: readonly OptimisationRequirement[],
  reviewerName: string,
): string {
  if (decision === 'FIT') {
    return `${reviewerName} finds the patient fit for the proposed anaesthesia. `
      + 'Nothing is waiting on anaesthesia.';
  }
  const n = requirements.length;
  return `${reviewerName} finds the patient NOT fit as they stand. `
    + `${n} thing${n === 1 ? '' : 's'} must be done first. `
    + 'Optimise and re-list as soon as they are done; an anaesthetist must then reassess.';
}
