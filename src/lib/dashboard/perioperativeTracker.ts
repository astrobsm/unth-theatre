// ============================================================
// Where each of my patients actually is, right now
// ------------------------------------------------------------
// A surgeon books a case and then loses sight of it. The patient is somewhere
// between the ward and the table, in somebody else's hands at every step, and
// the only way to find out was to telephone the holding area — which is why
// the question is usually asked at the point it has already become a problem.
//
// This composes what already exists rather than restating it: milestones.ts
// knows the journey and who records each step, caseTasks.ts knows what is
// outstanding for the person looking, and fitness.ts knows whether the patient
// may be anaesthetised at all. What is genuinely new here is TIME — how long a
// patient has been standing still, and when that stops being normal.
//
// The alerting rule that matters: a patient who has not moved is not
// necessarily a problem, and saying so on every case would bury the one that
// is. So a phase is only raised once it has exceeded a threshold set for that
// phase, and the thresholds differ because the phases do — an hour in the
// holding area is a Tuesday, an hour between "surgery ended" and "recovery" is
// a patient nobody has moved.
// ============================================================

import {
  PHASE_META, PHASE_ORDER, caseState, phaseIndex,
  type CaseState, type Phase, type RecordedPhase,
} from '../theatreOps/milestones';

export type TrackerSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL';

export interface TrackerAlert {
  id: string;
  severity: TrackerSeverity;
  title: string;
  detail: string;
  /** True when clearing it requires somebody to do something, not just look. */
  actionable: boolean;
}

/**
 * How long a patient may sit in each phase before it is worth saying so.
 *
 * Minutes, and deliberately not one number for the whole journey. These are
 * starting values a theatre should tune; what must not change is that each
 * phase has its own, because the same delay means different things at
 * different points. Null means "no expectation" — nobody is waiting on a
 * patient who has gone back to the ward.
 */
export const PHASE_STALL_MINUTES: Record<Phase, number | null> = {
  WARD: null,
  PORTER_DISPATCHED: 45,        // a porter sent and no arrival is a search
  HOLDING_AREA: 90,             // long waits here are normal; very long ones are not
  INSIDE_THEATRE: 45,           // in the room but no anaesthesia
  ANAESTHESIA_STARTED: 90,      // induced but no incision
  WHO_TIMEOUT_COMPLETED: 45,
  SURGERY_STARTED: null,        // a long operation is an operation, not a delay
  SURGERY_ENDED: 45,            // finished but not dressed
  DRESSING_COMPLETED: 45,       // dressed but not moved to recovery
  RECOVERY_ROOM: 240,           // recovery is measured in hours
  RETURNED_TO_WARD: null,       // journey over
};

export interface TrackerCase {
  id: string;
  procedureName: string;
  patientName: string | null;
  folderNumber: string | null;
  theatreName: string | null;
  scheduledDate: Date | string | null;
  scheduledTime: string | null;
  status: string;
}

export interface TrackerInput {
  surgery: TrackerCase;
  movements: RecordedPhase[];
  now: Date;
  /** From the anaesthetic review, where one exists. */
  fitness?: { decision: 'FIT' | 'NOT_FIT' | null | undefined; outstandingRequirements?: number } | null;
  /** Whether an anaesthetic review has been recorded at all. */
  hasAnaestheticReview?: boolean;
  /** Consent present, by either route. */
  hasConsent?: boolean;
  /** Named pre-operative items still outstanding on the booking. */
  preopOutstanding?: string | null;
}

export interface TrackerRow {
  surgeryId: string;
  procedureName: string;
  patientName: string;
  folderNumber: string | null;
  theatreName: string | null;
  scheduledFor: Date | null;
  /** The furthest milestone reached, or null when nothing is recorded. */
  currentPhase: Phase | null;
  currentLabel: string;
  state: CaseState;
  /** Who normally moves the patient on from here. */
  responsible: string | null;
  /** When the patient entered the phase they are in. */
  since: Date | null;
  minutesInPhase: number | null;
  lastUpdate: Date | null;
  alerts: TrackerAlert[];
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** When the case is due, combining the date with the scheduled time. */
export function dueAt(s: TrackerCase): Date | null {
  const date = asDate(s.scheduledDate);
  if (!date) return null;
  const m = (s.scheduledTime ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return date;
  const due = new Date(date);
  due.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  return due;
}

/**
 * The milestone the patient is currently sitting at.
 *
 * The FURTHEST reached rather than the latest recorded, so a milestone
 * back-filled after the fact does not appear to send the patient backwards
 * through the journey.
 */
export function furthestPhase(movements: RecordedPhase[]): RecordedPhase | null {
  if (movements.length === 0) return null;
  return movements.reduce((a, b) => (phaseIndex(b.phase) > phaseIndex(a.phase) ? b : a));
}

const CLOSED = ['CANCELLED', 'COMPLETED', 'POSTPONED'];

export function trackCase(input: TrackerInput): TrackerRow {
  const { surgery, movements, now } = input;
  const current = furthestPhase(movements);
  const state = caseState(movements);
  const due = dueAt(surgery);
  const closed = CLOSED.includes(String(surgery.status).toUpperCase());

  const since = current?.timestamp ?? null;
  const minutesInPhase = since ? Math.floor((now.getTime() - since.getTime()) / 60_000) : null;
  const lastUpdate = movements.length
    ? movements.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).timestamp
    : null;

  const alerts: TrackerAlert[] = [];
  const patient = surgery.patientName ?? 'This patient';
  const add = (id: string, severity: TrackerSeverity, title: string, detail: string, actionable = true) =>
    alerts.push({ id: `${surgery.id}:${id}`, severity, title, detail, actionable });

  if (!closed) {
    // ---- Fitness ---------------------------------------------------------
    // First, because it is the one that stops the case entirely.
    if (input.fitness?.decision === 'NOT_FIT') {
      const n = input.fitness.outstandingRequirements ?? 0;
      add('not-fit', 'CRITICAL',
        'Patient not fit for the proposed anaesthesia',
        n > 0
          ? `${n} requirement${n === 1 ? '' : 's'} outstanding before ${patient} can proceed.`
          : `The requirements are addressed; an anaesthetist must reassess ${patient} before the case can proceed.`);
    } else if (input.hasAnaestheticReview === false && due) {
      const minutesAway = Math.round((due.getTime() - now.getTime()) / 60_000);
      if (minutesAway <= 24 * 60) {
        add('no-review', minutesAway <= 120 ? 'CRITICAL' : 'HIGH',
          'Anaesthetic review outstanding',
          `${patient} has no recorded pre-operative anaesthetic review, and the case is ${
            minutesAway < 0 ? 'already past its time' : `due in ${minutesAway} minutes`}.`);
      }
    }

    if (input.hasConsent === false) {
      add('consent', 'HIGH', 'Consent not recorded',
        `No informed consent is on file for ${patient}.`);
    }

    if (input.preopOutstanding) {
      add('preop', 'HIGH', 'Pre-operative requirements outstanding',
        `${patient}: ${input.preopOutstanding}.`);
    }

    // ---- Time ------------------------------------------------------------
    if (!current) {
      // Nothing recorded at all. Only worth saying once the case is close —
      // a patient booked for Thursday has not gone missing.
      if (due) {
        const minutesAway = Math.round((due.getTime() - now.getTime()) / 60_000);
        if (minutesAway < 0) {
          add('not-moved', 'CRITICAL', 'Case overdue and patient not sent for',
            `${patient} was due at ${surgery.scheduledTime ?? 'the scheduled time'} and no movement has been recorded.`);
        } else if (minutesAway <= 60) {
          add('not-sent', 'HIGH', 'Patient not sent for',
            `${patient} is due in ${minutesAway} minutes and is still on the ward as far as the record shows.`);
        }
      }
    } else {
      const threshold = PHASE_STALL_MINUTES[current.phase];
      if (threshold !== null && minutesInPhase !== null && minutesInPhase > threshold) {
        const meta = PHASE_META[current.phase];
        add('stalled', minutesInPhase > threshold * 2 ? 'CRITICAL' : 'HIGH',
          `No movement for ${formatMinutes(minutesInPhase)}`,
          `${patient} has been at "${meta.label}" since ${current.timestamp.toISOString().slice(11, 16)}. `
          // Who moves the patient ON, not who recorded this step — the surgeon
          // is asking who they are waiting on, and the person who recorded the
          // last milestone has already done their part. Must agree with the
          // row's `responsible` field or the card contradicts itself.
          + `Normally ${nextResponsible(current.phase)} moves the patient on from here.`);
      }
    }
  }

  return {
    surgeryId: surgery.id,
    procedureName: surgery.procedureName,
    patientName: surgery.patientName ?? 'Unknown patient',
    folderNumber: surgery.folderNumber,
    theatreName: surgery.theatreName,
    scheduledFor: due,
    currentPhase: current?.phase ?? null,
    currentLabel: current ? PHASE_META[current.phase].label : 'Not yet sent for',
    state,
    responsible: current ? nextResponsible(current.phase) : 'Ward nurse',
    since,
    minutesInPhase,
    lastUpdate,
    alerts,
  };
}

/**
 * Who moves the patient on from here — the NEXT step's owner, not this one's.
 *
 * The question a surgeon is asking is "who am I waiting on", and the person
 * who recorded the last milestone has already done their part.
 */
export function nextResponsible(phase: Phase): string {
  const i = phaseIndex(phase);
  const next = i >= 0 && i + 1 < PHASE_ORDER.length ? PHASE_ORDER[i + 1] : null;
  return next ? PHASE_META[next].by : 'Journey complete';
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Most urgent first, then the longest-standing. */
export function sortTracker(rows: TrackerRow[]): TrackerRow[] {
  const worst = (r: TrackerRow) =>
    r.alerts.some((a) => a.severity === 'CRITICAL') ? 0
    : r.alerts.some((a) => a.severity === 'HIGH') ? 1 : 2;
  return [...rows].sort((a, b) => {
    const bySeverity = worst(a) - worst(b);
    if (bySeverity !== 0) return bySeverity;
    const aDue = a.scheduledFor ? a.scheduledFor.getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.scheduledFor ? b.scheduledFor.getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });
}

/** The counters across the top of the tracker. */
export function trackerSummary(rows: TrackerRow[]) {
  return {
    total: rows.length,
    inHolding: rows.filter((r) => r.currentPhase === 'HOLDING_AREA').length,
    inTheatre: rows.filter((r) => r.state === 'IN_THEATRE' || r.state === 'OPERATING').length,
    complete: rows.filter((r) => r.state === 'COMPLETE').length,
    alerts: rows.reduce((n, r) => n + r.alerts.length, 0),
    critical: rows.reduce((n, r) => n + r.alerts.filter((a) => a.severity === 'CRITICAL').length, 0),
  };
}
