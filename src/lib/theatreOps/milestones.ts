// ============================================================
// Recording what actually happened, as it happens
// ------------------------------------------------------------
// Two patient movements were recorded in fourteen days, across a hospital
// running full lists every day. Everything downstream depends on these
// timestamps — punctuality, turnover, utilisation, the delay detector, the
// performance dashboard, whether a case can ever be marked finished — and all
// of it has been empty since it was built.
//
// The cause is not unwillingness. Recording a milestone meant navigating to a
// particular surgery's page and finding the right control, several taps deep,
// while scrubbed or holding a patient. Nobody does that eleven times a case.
//
// So this module describes the milestones as a nurse experiences them: an
// ordered sequence, with one obvious next step, recordable in a single tap
// from a list of today's cases. The rules below exist to make that tap safe —
// forgiving of a missed step, honest about a late entry, and impossible to
// double-record by accident.
// ============================================================

export type Phase =
  | 'WARD'
  | 'PORTER_DISPATCHED'
  | 'HOLDING_AREA'
  | 'INSIDE_THEATRE'
  | 'ANAESTHESIA_STARTED'
  | 'WHO_TIMEOUT_COMPLETED'
  | 'SURGERY_STARTED'
  | 'SURGERY_ENDED'
  | 'DRESSING_COMPLETED'
  | 'RECOVERY_ROOM'
  | 'RETURNED_TO_WARD';

/** The journey in order. Index is the only ordering anything should rely on. */
export const PHASE_ORDER: Phase[] = [
  'WARD',
  'PORTER_DISPATCHED',
  'HOLDING_AREA',
  'INSIDE_THEATRE',
  'ANAESTHESIA_STARTED',
  'WHO_TIMEOUT_COMPLETED',
  'SURGERY_STARTED',
  'SURGERY_ENDED',
  'DRESSING_COMPLETED',
  'RECOVERY_ROOM',
  'RETURNED_TO_WARD',
];

export interface PhaseMeta {
  /** What the button says. Short enough to read at a glance, at arm's length. */
  label: string;
  /** What it means, for the one person who has not done this before. */
  hint: string;
  /** Who normally records it. Advisory — anyone in the room may. */
  by: string;
  /** Milestones the timing calculations cannot work without. */
  essential: boolean;
}

export const PHASE_META: Record<Phase, PhaseMeta> = {
  WARD: { label: 'On the ward', hint: 'Patient confirmed ready on the ward', by: 'Ward nurse', essential: false },
  PORTER_DISPATCHED: { label: 'Sent for', hint: 'Porter dispatched to collect the patient', by: 'Ward / porter', essential: true },
  HOLDING_AREA: { label: 'In holding', hint: 'Patient arrived in the holding area', by: 'Holding area nurse', essential: false },
  INSIDE_THEATRE: { label: 'In theatre', hint: 'Patient is in the operating room', by: 'Scrub / circulating nurse', essential: true },
  ANAESTHESIA_STARTED: { label: 'Anaesthesia', hint: 'Induction commenced', by: 'Anaesthetist', essential: true },
  WHO_TIMEOUT_COMPLETED: { label: 'Time-out', hint: 'WHO surgical safety time-out completed', by: 'Scrub nurse', essential: false },
  SURGERY_STARTED: { label: 'Knife to skin', hint: 'Incision made — the case has started', by: 'Scrub nurse', essential: true },
  SURGERY_ENDED: { label: 'Surgery ended', hint: 'Procedure complete', by: 'Scrub nurse', essential: true },
  DRESSING_COMPLETED: { label: 'Dressing done', hint: 'Dressing complete; theatre not yet free', by: 'Scrub nurse', essential: false },
  RECOVERY_ROOM: { label: 'To recovery', hint: 'Patient handed over to recovery', by: 'Recovery nurse', essential: true },
  RETURNED_TO_WARD: { label: 'Back to ward', hint: 'Patient returned to the ward', by: 'Recovery / ward nurse', essential: false },
};

export const isPhase = (v: unknown): v is Phase =>
  typeof v === 'string' && (PHASE_ORDER as string[]).includes(v);

export interface RecordedPhase {
  phase: Phase;
  timestamp: Date;
}

/** Position in the journey. -1 for anything unrecognised. */
export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * The milestone to offer as the single obvious next tap.
 *
 * The furthest point reached, plus one — NOT the first gap. A theatre that
 * forgot the holding area should be offered "anaesthesia", not sent back to
 * fill in a step that has already passed. The gap can be corrected later; the
 * case in front of them cannot wait.
 *
 * Null once the journey is complete.
 */
export function nextPhase(recorded: RecordedPhase[]): Phase | null {
  if (recorded.length === 0) return PHASE_ORDER[0];
  const furthest = Math.max(...recorded.map((r) => phaseIndex(r.phase)));
  const next = furthest + 1;
  return next < PHASE_ORDER.length ? PHASE_ORDER[next] : null;
}

/** Milestones skipped before the furthest point reached. */
export function missedPhases(recorded: RecordedPhase[]): Phase[] {
  if (recorded.length === 0) return [];
  const seen = new Set(recorded.map((r) => r.phase));
  const furthest = Math.max(...recorded.map((r) => phaseIndex(r.phase)));
  return PHASE_ORDER.slice(0, furthest).filter((p) => !seen.has(p));
}

/** Has this exact milestone already been recorded? */
export function isRecorded(recorded: RecordedPhase[], phase: Phase): boolean {
  return recorded.some((r) => r.phase === phase);
}

export type CaseState = 'NOT_STARTED' | 'ON_THE_WAY' | 'IN_THEATRE' | 'OPERATING' | 'FINISHING' | 'COMPLETE';

/**
 * Where the case is, in words a coordinator can scan down a list.
 *
 * Derived from the furthest milestone rather than the surgery's status field,
 * because the status is set by people and the milestones are set by events.
 */
export function caseState(recorded: RecordedPhase[]): CaseState {
  if (recorded.length === 0) return 'NOT_STARTED';
  const furthest = Math.max(...recorded.map((r) => phaseIndex(r.phase)));
  if (furthest >= phaseIndex('RECOVERY_ROOM')) return 'COMPLETE';
  if (furthest >= phaseIndex('SURGERY_ENDED')) return 'FINISHING';
  if (furthest >= phaseIndex('SURGERY_STARTED')) return 'OPERATING';
  if (furthest >= phaseIndex('INSIDE_THEATRE')) return 'IN_THEATRE';
  return 'ON_THE_WAY';
}

export const STATE_LABEL: Record<CaseState, string> = {
  NOT_STARTED: 'Not started',
  ON_THE_WAY: 'On the way',
  IN_THEATRE: 'In theatre',
  OPERATING: 'Operating',
  FINISHING: 'Finishing',
  COMPLETE: 'Complete',
};

/**
 * How complete this case's record is, as a percentage of the essential
 * milestones — the ones without which nothing can be measured.
 *
 * Deliberately scored against the essential five rather than all eleven, so a
 * theatre that records what matters reads as complete instead of being marked
 * down for skipping "on the ward".
 */
export function recordCompleteness(recorded: RecordedPhase[]): { recorded: number; essential: number; percent: number } {
  const essential = PHASE_ORDER.filter((p) => PHASE_META[p].essential);
  const done = essential.filter((p) => isRecorded(recorded, p)).length;
  return {
    recorded: done,
    essential: essential.length,
    percent: essential.length === 0 ? 0 : Math.round((done / essential.length) * 100),
  };
}

/** How far back a milestone may be back-dated when it was missed at the time. */
export const MAX_BACKDATE_MINUTES = 12 * 60;

export interface TimeCheck {
  ok: boolean;
  error?: string;
}

/**
 * Validate a time typed in for a milestone that was missed live.
 *
 * A theatre catching up at the end of a list must be able to enter the real
 * time — a record stamped when somebody remembered is worse than no record,
 * because it looks precise and is not. But an unbounded time field invites a
 * typo that lands a case in 1970 and quietly poisons every average built on
 * it.
 */
export function checkBackdate(when: Date, now: Date = new Date()): TimeCheck {
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
    return { ok: false, error: 'That is not a readable time.' };
  }
  const diffMinutes = (now.getTime() - when.getTime()) / 60_000;
  if (diffMinutes < -5) {
    return { ok: false, error: 'That time is in the future.' };
  }
  if (diffMinutes > MAX_BACKDATE_MINUTES) {
    return { ok: false, error: 'That is more than twelve hours ago — record it on the case itself instead.' };
  }
  return { ok: true };
}

/**
 * Would recording this phase contradict what is already there?
 *
 * Out-of-order recording is ALLOWED — theatres skip steps and catch up — but
 * a milestone timed before one that precedes it is a mistake worth catching,
 * because the durations built on it would come out negative.
 */
export function checkSequence(recorded: RecordedPhase[], phase: Phase, when: Date): TimeCheck {
  const idx = phaseIndex(phase);
  for (const r of recorded) {
    const rIdx = phaseIndex(r.phase);
    if (rIdx < idx && r.timestamp.getTime() > when.getTime()) {
      return {
        ok: false,
        error: `${PHASE_META[phase].label} cannot be before ${PHASE_META[r.phase].label}.`,
      };
    }
    if (rIdx > idx && r.timestamp.getTime() < when.getTime()) {
      return {
        ok: false,
        error: `${PHASE_META[phase].label} cannot be after ${PHASE_META[r.phase].label}.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Order today's list so the case needing a tap is first.
 *
 * Live cases (in theatre, operating, finishing) above waiting ones, completed
 * ones last. Within a group, by scheduled time.
 */
export function captureOrder<T extends { state: CaseState; scheduledTime: string }>(cases: T[]): T[] {
  const rank: Record<CaseState, number> = {
    OPERATING: 0,
    IN_THEATRE: 1,
    FINISHING: 2,
    ON_THE_WAY: 3,
    NOT_STARTED: 4,
    COMPLETE: 5,
  };
  return [...cases].sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    return a.scheduledTime.localeCompare(b.scheduledTime);
  });
}
