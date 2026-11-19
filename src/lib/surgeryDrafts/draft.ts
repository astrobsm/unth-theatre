// ============================================================
// A unit's tentative case, and what it takes to turn it into a booking
// ------------------------------------------------------------
// Pure functions. No Prisma, no fetch, no React — so the rules about what a
// plan needs before it can become a case are testable on their own, and the
// page and the API cannot each have their own opinion about it.
//
// THE ONE DESIGN DECISION WORTH STATING. Publishing does NOT write a surgery
// here, and no route in this module writes one either. It builds the body for
// POST /api/surgeries and that endpoint creates the case, exactly as it does
// for a booking typed in by hand.
//
// The alternative — a publish route that calls prisma.surgery.create itself —
// was rejected deliberately. That route does far more than insert a row: it
// attaches the magnitude bundle, resolves special needs to rows, records the
// on-duty team, enforces the booking cut-off, quotes the deposit and audits
// the lot. A second creation path would have reproduced some of that and
// quietly diverged from the rest, and the half it got wrong would be invisible
// until a published case reached theatre with no pack.
// ============================================================

import { isClockTime } from '@/lib/theatreOps/clock';

export const DRAFT_STATUSES = ['DRAFT', 'PUBLISHED', 'WITHDRAWN'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export type DraftPriority = (typeof DRAFT_PRIORITIES)[number];

export interface ScheduleDraft {
  id: string;
  unit: string;
  subspecialty: string;
  patientId?: string | null;
  patientName?: string | null;
  patientFolderNumber?: string | null;
  surgeonId?: string | null;
  surgeonName?: string | null;
  procedureName: string;
  additionalProcedures?: string | null;
  indication?: string | null;
  magnitude?: string | null;
  surgeryType?: string | null;
  anesthesiaType?: string | null;
  estimatedDuration?: number | null;
  targetDate?: string | Date | null;
  preferredTime?: string | null;

  /** What the unit says the case will need. Requests, not findings. */
  needBloodTransfusion?: boolean | null;
  /** Units expected. Null means the unit did not say, not nought. */
  bloodUnits?: number | null;
  needDiathermy?: boolean | null;
  needStereo?: boolean | null;
  needMontrellMattress?: boolean | null;
  otherSpecialNeeds?: string | null;
  isDayCase?: boolean | null;
  postOpDestination?: string | null;
  location?: string | null;
  priority?: string | null;
  notes?: string | null;
  status: string;
  publishedSurgeryId?: string | null;
  publishedAt?: string | Date | null;
  publishedForDate?: string | Date | null;
  createdByName?: string | null;
  createdAt?: string | Date | null;
}

/** What the person still has to supply, in the words they would use. */
export interface Missing {
  field: string;
  say: string;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Everything POST /api/surgeries insists on that a draft is allowed to omit.
 *
 * Deliberately NOT a copy of that endpoint's whole schema. These are the
 * fields a plan may legitimately not have yet; the rest (procedure, unit,
 * subspecialty) cannot be missing because a draft cannot be saved without
 * them. Anything this list misses is caught by the endpoint itself, which is
 * the authority — this exists to say so BEFORE the person presses the button,
 * not instead of the check.
 */
export function missingForPublish(draft: ScheduleDraft): Missing[] {
  const out: Missing[] = [];
  if (!text(draft.patientId)) {
    out.push({
      field: 'patientId',
      say: text(draft.patientName)
        ? `${text(draft.patientName)} is written here as a name. Find them in Patients, or register them, so the case attaches to the right folder.`
        : 'No patient yet. A case cannot be booked against a name alone.',
    });
  }
  if (!text(draft.surgeonName)) {
    out.push({ field: 'surgeonName', say: 'No surgeon named.' });
  }
  if (!text(draft.indication)) {
    out.push({ field: 'indication', say: 'No indication given — the clinical reason for operating.' });
  }
  if (!text(draft.procedureName)) {
    out.push({ field: 'procedureName', say: 'No procedure named.' });
  }
  return out;
}

export function canPublish(draft: ScheduleDraft): boolean {
  return draft.status === 'DRAFT' && missingForPublish(draft).length === 0;
}

/** A date as the date input wants it, in local terms rather than UTC. */
export function asDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The date and time the Publish box opens on.
 *
 * The tentative date is the answer most of the time — a unit that wrote
 * "Thursday" meant Thursday — so it is filled in and the person confirms it.
 * Offering an empty box instead would make them type what they already said.
 */
export function publishDefaults(draft: ScheduleDraft): { date: string; time: string } {
  return {
    date: asDateInput(draft.targetDate),
    time: isClockTime(draft.preferredTime) ? text(draft.preferredTime) : '',
  };
}

export interface PublishChoice {
  scheduledDate: string;
  scheduledTime: string;
}

/**
 * Publishing is idempotent, keyed on the draft.
 *
 * Two presses, a double tap, or a retry after the network dropped between the
 * surgery being created and the draft being marked, must not put the same
 * patient on the list twice. POST /api/surgeries honours X-Idempotency-Key
 * (lib/idempotency), so keying on the draft id makes the second attempt replay
 * the first response instead of booking a second case.
 *
 * The date is part of the key on purpose: republishing a withdrawn draft to a
 * DIFFERENT date is a new booking and should be allowed to make one.
 */
export function publishIdempotencyKey(draftId: string, scheduledDate: string): string {
  return `draft-publish:${draftId}:${scheduledDate}`;
}

/**
 * The body for POST /api/surgeries.
 *
 * Only the fields a draft actually carries. Everything else — the labs, the
 * consent, the on-duty team, the pack — is left to the booking route and the
 * screens that own it. A draft that invented values for those would be
 * recording as fact things nobody checked.
 */
export function publishPayload(draft: ScheduleDraft, choice: PublishChoice): Record<string, unknown> {
  return {
    patientId: text(draft.patientId),
    surgeonId: text(draft.surgeonId) || null,
    surgeonName: text(draft.surgeonName),
    unit: draft.unit,
    subspecialty: draft.subspecialty,
    indication: text(draft.indication),
    procedureName: text(draft.procedureName),
    additionalProcedures: text(draft.additionalProcedures) || null,
    scheduledDate: choice.scheduledDate,
    scheduledTime: choice.scheduledTime,
    estimatedDuration: draft.estimatedDuration && draft.estimatedDuration > 0 ? draft.estimatedDuration : 60,
    surgeryType: text(draft.surgeryType) || 'ELECTIVE',
    magnitude: text(draft.magnitude) || null,
    anesthesiaType: text(draft.anesthesiaType) || null,
    // The unit's own planning note travels with the case. It is the one piece
    // of the draft that would otherwise be lost, and it is usually the reason
    // the case was planned the way it was.
    remarks: text(draft.notes) || null,

    // WHAT THE CASE NEEDS, CARRIED RATHER THAN RE-ASKED.
    //
    // These used to be absent from the plan, so publishing left them for
    // somebody to enter afterwards in the booking screens — at the moment
    // they are trying to get a case onto a list, which is the moment they are
    // least likely to stop and fill in a pack request. The unit stated them a
    // fortnight ago; the booking route is told what the unit said.
    //
    // Still NOT sent: the labs, the consent, the risk scores and the team.
    // The plan does not hold those, and inventing them here would be
    // recording as fact things nobody has checked.
    location: text(draft.location) || null,
    needBloodTransfusion: Boolean(draft.needBloodTransfusion),
    // Carried through so the unit is not asked the same question twice, and
    // so the pack the plan implied is the pack the booking raises.
    bloodUnits:
      draft.needBloodTransfusion && typeof draft.bloodUnits === 'number'
        ? draft.bloodUnits
        : null,
    needDiathermy: Boolean(draft.needDiathermy),
    needStereo: Boolean(draft.needStereo),
    needMontrellMattress: Boolean(draft.needMontrellMattress),
    otherSpecialNeeds: text(draft.otherSpecialNeeds) || null,
    isDayCase: Boolean(draft.isDayCase),
    postOpDestination: text(draft.postOpDestination) || null,
  };
}

/** Is this choice of date and time usable at all? */
export function validatePublishChoice(choice: PublishChoice): string | null {
  if (!choice.scheduledDate) return 'Choose the date the case is to be done.';
  const d = new Date(`${choice.scheduledDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'That date cannot be read.';
  if (!isClockTime(choice.scheduledTime)) {
    return 'Give the start time as HH:MM on a 24-hour clock, for example 09:00.';
  }
  return null;
}
