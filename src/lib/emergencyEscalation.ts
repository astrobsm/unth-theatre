/**
 * An emergency that was booked and never started.
 *
 * The theatre's own rule: once an emergency is booked and a start time set, it
 * starts within the hour. What happened in practice is that cases were booked,
 * the hour passed, and nobody recorded why — so a case could sit for an
 * afternoon with no name against the delay and no trail afterwards.
 *
 * This is the ladder that follows. Each rung fires ONCE and only while the case
 * is still not started:
 *
 *   +1 hour   Everyone named on the case is asked, by name and by their role on
 *             it, to say why it has not started.
 *   +2 hours  A second notice on their dashboards, and the Chief Medical
 *             Director is told.
 *   +3 hours  An invitation to appear before the Theatre Audit Committee is
 *             drafted for every person on the case. An administrator reviews
 *             and sends them.
 *
 * THE LADDER IS DRIVEN BY THE CASE NOT STARTING, not by whether somebody has
 * explained. An explanation is what stage 1 asks for and it is carried into the
 * later stages, so the CMD sees what was said — but a reason recorded does not
 * start the patient's operation, and it does not stop the clock. Silence and an
 * excuse escalate alike; only starting, cancelling or rescheduling stops it.
 */

export interface EscalationStageSpec {
  stage: 1 | 2 | 3;
  afterMinutes: number;
  /** What happens when this rung is reached. */
  summary: string;
}

export const ESCALATION_STAGES: EscalationStageSpec[] = [
  { stage: 1, afterMinutes: 60, summary: 'Everyone named on the case is asked why it has not started.' },
  { stage: 2, afterMinutes: 120, summary: 'A second notice on their dashboards, and the Chief Medical Director is informed.' },
  { stage: 3, afterMinutes: 180, summary: 'An invitation to appear before the Theatre Audit Committee is drafted for each person.' },
];

export const MAX_STAGE = 3;

/** Roles told when a case reaches stage 2. */
export const CMD_ROLES = ['CHIEF_MEDICAL_DIRECTOR'] as const;

/**
 * The Theatre Audit Committee: who may SEE the delayed emergencies.
 *
 * There is no single THEATRE_AUDIT_COMMITTEE role, so the committee is named by
 * the roles that sit on it. Every discipline that can hold a case up is here —
 * a delay is as often oxygen, power, sterile supply or a missing pack as it is
 * a surgeon — and the point of them seeing the board is that the cause is
 * usually theirs to fix.
 *
 * SEEING IS NOT SENDING. Sending an invitation stays with the administrators;
 * see the invitations route. A committee that could summon its own witnesses
 * without an administrator's hand on it is a different thing from a committee.
 */
export const AUDIT_COMMITTEE_ROLES = [
  // Chair and executive
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
  'THEATRE_MANAGER',
  // Clinical heads
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_SURGERY',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_PHARMACY',
  // The services a case waits on. CSSD and oxygen keep their existing HOD
  // roles rather than gaining a second one.
  'CSSD_SUPERVISOR',
  'OXYGEN_UNIT_SUPERVISOR',
  'WORKS_SUPERVISOR',
  'POWER_PLANT_OPERATOR',
  'CONSUMABLE_PACK_PROVIDER',
] as const;

/** Statuses that mean the case is no longer waiting to start. */
export const SETTLED_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export interface EscalationInput {
  /** The time the case was due to start. */
  requiredByTime: Date | string | null | undefined;
  /** Fallback when no start time was set: when it was raised. */
  requestedAt: Date | string;
  /** EmergencyBookingStatus. */
  status: string;
  /** Set once the case actually begins, if known. */
  actualStartTime?: Date | string | null;
  /** The highest rung already fired for this case. */
  stageAlreadyFired?: number | null;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Has this case stopped waiting — started, cancelled or done? */
export function isSettled(input: Pick<EscalationInput, 'status' | 'actualStartTime'>): boolean {
  if (asDate(input.actualStartTime)) return true;
  return (SETTLED_STATUSES as readonly string[]).includes(input.status);
}

/**
 * The clock this ladder runs on: the time the case was due to start.
 *
 * Falls back to when it was raised. A booking with no start time is not exempt
 * — that would make "leave the time blank" the way to avoid being asked.
 */
export function escalationClockFrom(input: Pick<EscalationInput, 'requiredByTime' | 'requestedAt'>): Date | null {
  return asDate(input.requiredByTime) ?? asDate(input.requestedAt);
}

/** Whole minutes late. Negative before the due time. */
export function minutesLate(input: Pick<EscalationInput, 'requiredByTime' | 'requestedAt'>, now: Date): number | null {
  const from = escalationClockFrom(input);
  if (!from) return null;
  return Math.floor((now.getTime() - from.getTime()) / 60000);
}

/**
 * The rung this case has reached, 0 for none.
 *
 * Reached, not "due next": a case first looked at four hours late goes straight
 * to 3 rather than climbing one rung per run. The escalation exists to catch a
 * case nobody is watching, and a system that was itself asleep must not hand
 * out a gentler outcome than one that was awake.
 */
export function reachedStage(input: EscalationInput, now: Date): 0 | 1 | 2 | 3 {
  if (isSettled(input)) return 0;
  const late = minutesLate(input, now);
  if (late === null) return 0;

  let reached: 0 | 1 | 2 | 3 = 0;
  for (const s of ESCALATION_STAGES) {
    if (late >= s.afterMinutes) reached = s.stage;
  }
  return reached;
}

/**
 * The rungs to fire NOW: everything reached that has not already fired.
 *
 * Returns each stage, so a case found four hours late still records that it
 * passed one and two — the trail has to show the ladder, not just its top.
 */
export function stagesToFire(input: EscalationInput, now: Date): (1 | 2 | 3)[] {
  const reached = reachedStage(input, now);
  if (reached === 0) return [];
  const already = input.stageAlreadyFired ?? 0;
  return ESCALATION_STAGES
    .filter((s) => s.stage <= reached && s.stage > already)
    .map((s) => s.stage);
}

/** Minutes until the next rung, or null when there is none left. */
export function minutesToNextStage(input: EscalationInput, now: Date): number | null {
  if (isSettled(input)) return null;
  const late = minutesLate(input, now);
  if (late === null) return null;
  const next = ESCALATION_STAGES.find((s) => late < s.afterMinutes);
  return next ? next.afterMinutes - late : null;
}

/** "2 h 15 m late", for a message a person reads. */
export function describeLateness(mins: number): string {
  const m = Math.max(0, mins);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} minute${r === 1 ? '' : 's'} late`;
  if (r === 0) return `${h} hour${h === 1 ? '' : 's'} late`;
  return `${h} h ${r} m late`;
}
