/**
 * What one person needs to see when they log in.
 *
 * Not a feed of everything that happened. The point of a personal board is that
 * a scrub nurse opening ORM at 07:30 sees the four things she must do, not
 * ninety notifications about other people's theatres. Anything that is not
 * hers, or not actionable, does not belong here.
 *
 * Ordering is deliberate: a query with a deadline outranks a routine reminder,
 * and both outrank an informational notice. Somebody reading only the top of
 * the list must still see the thing that matters most.
 */

export type BoardItemKind =
  | 'QUERY'          // a disciplinary query awaiting this person's response
  | 'TASK'           // something they must do today
  | 'REMINDER'       // a standing duty for their role
  | 'WARNING'        // something has gone wrong and concerns them
  | 'NOTICE';        // informational

export type BoardSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export interface BoardItem {
  id: string;
  kind: BoardItemKind;
  severity: BoardSeverity;
  title: string;
  detail?: string;
  /** Where to go to deal with it. A board item with nothing to do is noise. */
  actionUrl?: string;
  actionLabel?: string;
  dueAt?: Date | null;
  /** True when the person cannot dismiss it — it stays until it is done. */
  compulsory?: boolean;
}

/**
 * Queries raised before this date are not shown.
 *
 * The instruction was to start clean: historical queries stay in the record and
 * on the disciplinary pages, but they do not populate anybody's new personal
 * board. Without a cutoff the first person to log in would meet months of
 * accumulated queries, conclude the board is a backlog rather than a to-do
 * list, and stop reading it — which would defeat the feature on its first day.
 *
 * Deliberately a constant rather than "today", so the boundary does not move
 * and everyone sees the same history whenever they first log in.
 */
export const QUERY_CUTOFF = new Date('2026-08-17T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Standing duties by role
// ---------------------------------------------------------------------------

export interface RoleDuty {
  id: string;
  roles: string[];
  title: string;
  detail: string;
  actionUrl: string;
  actionLabel: string;
  /** Compulsory duties cannot be dismissed and are shown every day. */
  compulsory: boolean;
}

/**
 * The duties people forget, stated as duties rather than as complaints after
 * the fact.
 *
 * Each one exists because the record is incomplete without it: a patient who
 * arrived with no recorded porter cannot be traced if something went missing on
 * the way, and an anaesthetic given without its drugs charted leaves the next
 * anaesthetist guessing.
 */
export const ROLE_DUTIES: RoleDuty[] = [
  {
    id: 'scrub-reception',
    roles: ['SCRUB_NURSE', 'THEATRE_NURSE', 'NURSE'],
    title: 'Receive patients through Theatre Reception',
    detail: 'Every patient must be received in the Theatre Reception module, and the '
      + 'transporting porter recorded. A patient with no recorded porter cannot be traced.',
    actionUrl: '/dashboard/theatre-reception',
    actionLabel: 'Open Theatre Reception',
    compulsory: true,
  },
  {
    id: 'recovery-escort',
    roles: ['RECOVERY_NURSE', 'NURSE_ANAESTHETIST', 'PACU_NURSE'],
    title: 'Record the ward escort log',
    detail: 'Every patient leaving recovery needs the escort log completed and the '
      + 'transporting porter recorded before they go.',
    actionUrl: '/dashboard/pacu',
    actionLabel: 'Open Recovery',
    compulsory: true,
  },
  {
    id: 'anaesthetist-review',
    roles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'],
    title: 'Review your patients on the app',
    detail: 'Pre-operative review, prescriptions including consumables, and anaesthesia '
      + 'monitoring all belong on the app. A chart on paper is not in the record.',
    actionUrl: '/dashboard/anaesthesia',
    actionLabel: 'Open Anaesthesia',
    compulsory: true,
  },
  {
    id: 'anaesthetist-charting',
    roles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'NURSE_ANAESTHETIST'],
    title: 'Start monitoring and chart medications',
    detail: 'Initialise anaesthesia monitoring at induction and chart every drug as it is '
      + 'given. Charting afterwards from memory is how doses get lost.',
    actionUrl: '/dashboard/anaesthesia/monitoring',
    actionLabel: 'Open Monitoring',
    compulsory: true,
  },
  {
    id: 'surgeon-notes',
    roles: ['SURGEON', 'CONSULTANT_SURGEON', 'REGISTRAR'],
    title: 'Write your operative notes on the app',
    detail: 'Operative notes recorded on the app are available to the ward, to recovery '
      + 'and to whoever sees the patient next.',
    actionUrl: '/dashboard/surgeries',
    actionLabel: 'Open Surgeries',
    compulsory: false,
  },
];

export function dutiesForRole(role: string): RoleDuty[] {
  const normalised = (role ?? '').toUpperCase();
  return ROLE_DUTIES.filter((d) => d.roles.includes(normalised));
}

// ---------------------------------------------------------------------------
// Assembling the board
// ---------------------------------------------------------------------------

export interface QueryInput {
  id: string;
  referenceNumber: string;
  subject: string;
  description?: string | null;
  status: string;
  deadlineTime: Date | string;
  createdAt: Date | string;
  recipientResponse?: string | null;
}

export interface TaskInput {
  id: string;
  title: string;
  detail?: string;
  actionUrl?: string;
  dueAt?: Date | string | null;
  severity?: BoardSeverity;
}

export interface BoardInput {
  role: string;
  now: Date;
  queries: QueryInput[];
  tasks: TaskInput[];
  warnings?: TaskInput[];
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * A query still needing this person to do something.
 *
 * The closed set is the real DisciplinaryQueryStatus enum, checked against the
 * schema. An earlier version listed CLOSED and WITHDRAWN, which do not exist,
 * and omitted DISMISSED, which does — so a dismissed query would have sat on
 * somebody's board indefinitely with nothing they could do about it.
 *
 * ESCALATED is deliberately still open: it means the deadline passed and the
 * matter went upward, which is precisely when the recipient most needs to see
 * it.
 */
const CLOSED_STATUSES = ['RESPONDED', 'RESOLVED', 'DISMISSED'];

function isOpen(status: string): boolean {
  return !CLOSED_STATUSES.includes((status ?? '').toUpperCase());
}

export function buildPersonalBoard(input: BoardInput): BoardItem[] {
  const items: BoardItem[] = [];
  const { now } = input;

  // ---- Queries -----------------------------------------------------------
  for (const q of input.queries) {
    const raised = asDate(q.createdAt);
    // Historical queries stay in the record and off this board.
    if (!raised || raised < QUERY_CUTOFF) continue;
    if (!isOpen(q.status)) continue;

    const due = asDate(q.deadlineTime);
    const overdue = due !== null && due < now;

    items.push({
      id: `query:${q.id}`,
      kind: 'QUERY',
      // An overdue query is critical because the consequence escalates without
      // further warning; a pending one is merely urgent.
      severity: overdue ? 'CRITICAL' : 'HIGH',
      title: overdue
        ? `Query ${q.referenceNumber} — response OVERDUE`
        : `Query ${q.referenceNumber} — response required`,
      detail: q.subject,
      actionUrl: `/dashboard/queries/${q.id}`,
      actionLabel: 'Read and respond',
      dueAt: due,
      compulsory: true,
    });
  }

  // ---- Warnings ----------------------------------------------------------
  for (const w of input.warnings ?? []) {
    items.push({
      id: `warning:${w.id}`,
      kind: 'WARNING',
      severity: w.severity ?? 'HIGH',
      title: w.title,
      detail: w.detail,
      actionUrl: w.actionUrl,
      actionLabel: w.actionUrl ? 'Open' : undefined,
      dueAt: asDate(w.dueAt),
    });
  }

  // ---- Today's tasks -----------------------------------------------------
  for (const t of input.tasks) {
    const due = asDate(t.dueAt);
    const overdue = due !== null && due < now;
    items.push({
      id: `task:${t.id}`,
      kind: 'TASK',
      severity: overdue ? 'HIGH' : (t.severity ?? 'NORMAL'),
      title: t.title,
      detail: t.detail,
      actionUrl: t.actionUrl,
      actionLabel: t.actionUrl ? 'Open' : undefined,
      dueAt: due,
    });
  }

  // ---- Standing duties ---------------------------------------------------
  for (const duty of dutiesForRole(input.role)) {
    items.push({
      id: `duty:${duty.id}`,
      kind: 'REMINDER',
      severity: duty.compulsory ? 'NORMAL' : 'LOW',
      title: duty.title,
      detail: duty.detail,
      actionUrl: duty.actionUrl,
      actionLabel: duty.actionLabel,
      compulsory: duty.compulsory,
    });
  }

  return sortBoard(items);
}

const SEVERITY_RANK: Record<BoardSeverity, number> = {
  CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3,
};
const KIND_RANK: Record<BoardItemKind, number> = {
  QUERY: 0, WARNING: 1, TASK: 2, REMINDER: 3, NOTICE: 4,
};

/**
 * Severity first, then kind, then the nearest deadline.
 *
 * Severity outranks kind so an overdue task is not buried under a routine
 * query, and kind breaks the tie so two equally severe items appear in an order
 * that reads sensibly rather than at random.
 */
export function sortBoard(items: BoardItem[]): BoardItem[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    const aDue = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });
}

/** One line for the top of the page. */
export function boardSummary(items: BoardItem[]): string {
  const queries = items.filter((i) => i.kind === 'QUERY').length;
  const overdue = items.filter((i) => i.severity === 'CRITICAL').length;
  const tasks = items.filter((i) => i.kind === 'TASK').length;

  if (overdue > 0) {
    return `${overdue} item${overdue === 1 ? '' : 's'} overdue and needing you now.`;
  }
  if (queries > 0) {
    return `${queries} quer${queries === 1 ? 'y' : 'ies'} awaiting your response.`;
  }
  if (tasks > 0) {
    return `${tasks} task${tasks === 1 ? '' : 's'} for today.`;
  }
  return 'Nothing outstanding. Your standing duties are listed below.';
}
