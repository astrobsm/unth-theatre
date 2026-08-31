// ============================================================
// "I am here and I cannot start."
// ------------------------------------------------------------
// The commonest thing that goes wrong in a theatre suite has never had a place
// to be written down. An anaesthetist arrives for a nine o'clock case, and the
// scrub nurse is in another room, or the surgeon is unreachable, or the patient
// was never sent for. So he waits. Nobody outside that room learns anything,
// the delay is invisible until somebody adds it up at the end of the month, and
// the reason — which is the only part that could be fixed — is never recorded
// at all.
//
// This gives that moment a button.
//
// WHEN IT OPENS, AND WHY THOSE NUMBERS
//
// ELECTIVE: five minutes after the scheduled start. Not at the start time
// itself — a theatre that is three minutes late is a theatre, not an incident,
// and a prompt that fires on every case teaches people to dismiss it. Five
// minutes past is long enough to mean something.
//
// EMERGENCY: immediately, and prompted an hour after booking. An emergency has
// no scheduled start to be late against; what it has is an expectation that it
// gets going. If it has not started an hour after it was booked, somebody
// should have said why.
//
// A case that is finished or cancelled cannot be blocked, so reporting closes.
// ============================================================

/** Elective grace after the scheduled start before reporting opens. */
export const ELECTIVE_GRACE_MINUTES = 5;

/** How long after booking an emergency should have started. */
export const EMERGENCY_PROMPT_MINUTES = 60;

/**
 * Why a case has not started.
 *
 * A fixed list, because free text cannot be counted, and the whole value of
 * recording this is being able to say "eleven cases last month, same reason".
 * `OTHER` exists and takes a note — but if OTHER is the top reason after a
 * month, the list is wrong and should be changed.
 */
export const BLOCKER_REASONS = [
  { code: 'TEAM_ABSENT', label: 'Team members not on ground' },
  { code: 'TEAM_UNREACHABLE', label: 'Team members unreachable' },
  { code: 'NO_ANAESTHETIST', label: 'No anaesthetist available' },
  { code: 'NO_SURGEON', label: 'Surgeon not available' },
  { code: 'NO_NURSE', label: 'Scrub or circulating nurse not available' },
  { code: 'PATIENT_NOT_SENT', label: 'Patient not sent for / not arrived' },
  { code: 'PATIENT_NOT_READY', label: 'Patient not ready (fasting, consent, prep)' },
  { code: 'NO_CONSENT', label: 'Consent not available' },
  { code: 'THEATRE_NOT_READY', label: 'Theatre not ready or not cleaned' },
  { code: 'EQUIPMENT_MISSING', label: 'Equipment missing or faulty' },
  { code: 'PACK_MISSING', label: 'Consumable or drug pack not available' },
  { code: 'NO_BLOOD', label: 'Blood not available' },
  { code: 'POWER_OR_UTILITY', label: 'Power, oxygen or water failure' },
  { code: 'PREVIOUS_CASE_OVERRAN', label: 'Previous case overran' },
  { code: 'OTHER', label: 'Other (say what)' },
] as const;

export type BlockerReason = (typeof BLOCKER_REASONS)[number]['code'];

/** What the reporter says happened to the case in the end. */
export const CASE_OUTCOMES = [
  { code: 'PENDING', label: 'Still waiting — not resolved yet' },
  { code: 'COMPLETED', label: 'Went ahead and completed' },
  { code: 'RESCHEDULED', label: 'Rescheduled' },
  { code: 'CANCELLED', label: 'Cancelled' },
] as const;

export type CaseOutcome = (typeof CASE_OUTCOMES)[number]['code'];

export const isBlockerReason = (v: unknown): v is BlockerReason =>
  BLOCKER_REASONS.some((r) => r.code === v);

export const isCaseOutcome = (v: unknown): v is CaseOutcome =>
  CASE_OUTCOMES.some((o) => o.code === v);

export interface WindowInput {
  surgeryType: string;
  /** Scheduled start as a real instant. Null for an emergency with no slot. */
  scheduledStart: Date | null;
  /** When the case was booked. Used for emergencies. */
  bookedAt: Date;
  /** Current surgery status. */
  status: string;
  now?: Date;
}

export interface ReportingWindow {
  /** May a blocker be reported at all? */
  open: boolean;
  /** Should the app actively ask? Open and overdue. */
  prompt: boolean;
  /** Minutes late, where that is meaningful. Negative before the start. */
  minutesLate: number | null;
  /** Plain sentence for the screen. */
  message: string;
}

const MIN = 60 * 1000;

export function reportingWindow(input: WindowInput): ReportingWindow {
  const now = input.now ?? new Date();
  const closed = ['COMPLETED', 'CANCELLED'].includes(input.status);

  if (closed) {
    return {
      open: false,
      prompt: false,
      minutesLate: null,
      message: 'This case is closed. There is nothing left to report.',
    };
  }

  if (input.surgeryType === 'EMERGENCY') {
    const since = Math.floor((now.getTime() - input.bookedAt.getTime()) / MIN);
    const overdue = since >= EMERGENCY_PROMPT_MINUTES;
    return {
      open: true,
      prompt: overdue,
      minutesLate: since,
      message: overdue
        ? `Booked ${since} minutes ago and not started. If something is stopping it, say what.`
        : 'Report anything stopping this case from going ahead.',
    };
  }

  if (!input.scheduledStart) {
    return {
      open: true,
      prompt: false,
      minutesLate: null,
      message: 'Report anything stopping this case from going ahead.',
    };
  }

  const late = Math.floor((now.getTime() - input.scheduledStart.getTime()) / MIN);
  const open = late >= ELECTIVE_GRACE_MINUTES;

  return {
    open,
    prompt: open,
    minutesLate: late,
    message: open
      ? `${late} minutes past the scheduled start. If something is stopping it, say what.`
      : late >= 0
        ? `Due to start. Reporting opens ${ELECTIVE_GRACE_MINUTES - late} minute(s) from now if it has not begun.`
        : `Scheduled to start in ${Math.abs(late)} minute(s).`,
  };
}

/**
 * A one-line summary for a board or a report.
 *
 * Deliberately names the person. A delay reason with nobody attached is a
 * statistic; with a name it is something a manager can follow up, and the
 * person who took the trouble to report it gets the credit for doing so.
 */
export function describeBlocker(b: {
  reason: string;
  detail?: string | null;
  reportedByName?: string | null;
  minutesLate?: number | null;
}): string {
  const label = BLOCKER_REASONS.find((r) => r.code === b.reason)?.label ?? b.reason;
  const who = b.reportedByName ? ` — reported by ${b.reportedByName}` : '';
  const late =
    typeof b.minutesLate === 'number' && b.minutesLate > 0 ? ` (${b.minutesLate} min late)` : '';
  const note = b.detail ? `: ${b.detail}` : '';
  return `${label}${note}${late}${who}`;
}
