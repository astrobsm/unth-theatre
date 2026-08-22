import type { TaskInput, BoardSeverity } from './personalBoard';

/**
 * What THIS person still has to do about THIS case.
 *
 * The distinction that makes a personal board worth reading. Being named on a
 * case is not a task — a case where everything is in order needs nothing from
 * anybody, and listing it teaches people the board is noise.
 *
 * The first version of this board did exactly that: it listed every case a
 * surgeon's name appeared on, alongside broadcast notifications meant for the
 * whole hospital, so a surgeon opening ORM met a screen of "Surgery in 24 min"
 * for other people's theatres. A board like that is worse than none, because
 * the one item that did matter would be somewhere in the middle of it.
 *
 * So: an item is emitted only when something is OUTSTANDING, and only to the
 * person who can resolve it. A missing consent belongs to the surgeon who
 * booked the case; an unprepared theatre belongs to the technician assigned to
 * it. Neither belongs to both.
 */

export interface CaseForTasks {
  id: string;
  procedureName: string;
  scheduledDate: Date | string | null;
  scheduledTime: string | null;
  status: string;
  surgeonId: string | null;
  anesthetistId: string | null;
  scrubNurseId: string | null;
  theatreTechnicianId: string | null;
  supervisingConsultantId: string | null;
  theatreId: string | null;
  /**
   * Whether consent exists — not the consent itself.
   *
   * These were the full base64 columns, carried all the way from Postgres to
   * the browser so that one line below could ask whether they were empty.
   * Measured on 22 August over fourteen days of cases: 2,973 kB pulled to
   * answer a question that 213 bytes of consentFileName answers, on a route
   * called 437 times a day.
   */
  hasConsentFile: boolean;
  hasConsentForm: boolean;
  preopOutstanding: string | null;
  patientName: string | null;
  folderNumber: string | null;
}

/** How the person relates to this case. Nobody gets tasks for a case they are not on. */
export type CaseRole =
  | 'SURGEON' | 'CONSULTANT' | 'ANAESTHETIST' | 'SCRUB_NURSE' | 'TECHNICIAN' | null;

export function roleOnCase(surgery: CaseForTasks, userId: string): CaseRole {
  if (surgery.surgeonId === userId) return 'SURGEON';
  if (surgery.supervisingConsultantId === userId) return 'CONSULTANT';
  if (surgery.anesthetistId === userId) return 'ANAESTHETIST';
  if (surgery.scrubNurseId === userId) return 'SCRUB_NURSE';
  if (surgery.theatreTechnicianId === userId) return 'TECHNICIAN';
  return null;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * When the case is due, combining the date with the scheduled time.
 *
 * scheduledDate alone is usually midnight, so measuring urgency from it would
 * report every case in the morning list as hours overdue.
 */
function dueAt(surgery: CaseForTasks): Date | null {
  const date = asDate(surgery.scheduledDate);
  if (!date) return null;
  const time = (surgery.scheduledTime ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!time) return date;
  const due = new Date(date);
  due.setUTCHours(Number(time[1]), Number(time[2]), 0, 0);
  return due;
}

function patientLabel(s: CaseForTasks): string {
  return s.patientName
    ? `${s.patientName}${s.folderNumber ? ` (${s.folderNumber})` : ''}`
    : 'this patient';
}

/** Cases already finished or abandoned have nothing outstanding. */
const CLOSED = ['COMPLETED', 'CANCELLED', 'POSTPONED'];

/** The theatre has physically started; preparation items no longer apply. */
const UNDER_WAY = ['IN_PROGRESS', 'IN_THEATRE', 'RECOVERY', 'COMPLETED'];

/**
 * Outstanding items for one person on one case.
 *
 * Returns an empty array when there is nothing to do, which is the common case
 * and the point.
 */
export function caseTasksFor(
  surgery: CaseForTasks,
  userId: string,
  now: Date,
): TaskInput[] {
  const role = roleOnCase(surgery, userId);
  if (!role) return [];
  if (CLOSED.includes((surgery.status ?? '').toUpperCase())) return [];

  const tasks: TaskInput[] = [];
  const due = dueAt(surgery);
  const minutesAway = due ? Math.round((due.getTime() - now.getTime()) / 60000) : null;
  const overdue = minutesAway !== null && minutesAway < 0;
  const imminent = minutesAway !== null && minutesAway >= 0 && minutesAway <= 120;
  const started = UNDER_WAY.includes((surgery.status ?? '').toUpperCase());
  const patient = patientLabel(surgery);
  const url = `/dashboard/surgeries/${surgery.id}`;

  const add = (id: string, title: string, detail: string, severity: BoardSeverity) => {
    tasks.push({ id: `${surgery.id}:${id}`, title, detail, actionUrl: url, dueAt: due, severity });
  };

  // ---- The surgeon and the supervising consultant own the booking ---------
  if (role === 'SURGEON' || role === 'CONSULTANT') {
    if (!started && !surgery.hasConsentFile && !surgery.hasConsentForm) {
      add('consent',
        `Consent not recorded — ${surgery.procedureName}`,
        `No informed consent is on file for ${patient}. The case cannot proceed until it is uploaded or completed on the app.`,
        imminent || overdue ? 'CRITICAL' : 'HIGH');
    }

    if (!started && surgery.preopOutstanding) {
      add('preop',
        `Pre-operative requirements outstanding — ${surgery.procedureName}`,
        `${patient}: ${surgery.preopOutstanding}. Complete these or record a clinical override before the case starts.`,
        imminent || overdue ? 'CRITICAL' : 'HIGH');
    }

    if (overdue && !started) {
      add('overdue',
        `Case overdue and not started — ${surgery.procedureName}`,
        `${patient} was due at ${surgery.scheduledTime ?? 'the scheduled time'} and the case has not begun. Confirm whether it is proceeding or needs rescheduling.`,
        'CRITICAL');
    }
  }

  // ---- The anaesthetist owns the anaesthetic record -----------------------
  if (role === 'ANAESTHETIST') {
    if (!started && (imminent || overdue)) {
      add('review',
        `Pre-operative review due — ${surgery.procedureName}`,
        `${patient} is due ${overdue ? `and is past the scheduled ${surgery.scheduledTime ?? 'time'}` : `in ${minutesAway} minutes`}. Record your review, prescriptions and consumables on the app.`,
        overdue ? 'CRITICAL' : 'HIGH');
    }
    if (!started && surgery.preopOutstanding) {
      add('anaes-preop',
        `Safety results outstanding — ${surgery.procedureName}`,
        `${patient}: ${surgery.preopOutstanding}. Confirm these before induction.`,
        'HIGH');
    }
  }

  // ---- Scrub nurse: reception and theatre readiness -----------------------
  if (role === 'SCRUB_NURSE') {
    // Only once the case is close. Theatre is no longer chosen at booking —
    // the theatre manager and the nurses allocate it through the team
    // assignment, which happens nearer the day. Raising this the moment a case
    // is booked would put "no theatre allocated" on every case on the list
    // every morning, which is how a board stops being read.
    if (!surgery.theatreId && (imminent || overdue)) {
      add('no-theatre',
        `No theatre assigned — ${surgery.procedureName}`,
        `${patient} has no theatre allocated. Assign one so the team and the porters know where to bring the patient.`,
        overdue ? 'CRITICAL' : 'HIGH');
    }
    if (!started && (imminent || overdue)) {
      add('reception',
        `Receive ${patient} in Theatre Reception`,
        `Due ${overdue ? `since ${surgery.scheduledTime ?? 'the scheduled time'}` : `in ${minutesAway} minutes`}. Record the arrival and the transporting porter.`,
        overdue ? 'CRITICAL' : 'HIGH');
    }
  }

  // ---- Technician: the room itself ---------------------------------------
  if (role === 'TECHNICIAN') {
    // Same reasoning as the scrub nurse above: unallocated is the normal state
    // of a freshly booked case, and only becomes the technician's problem when
    // the case is nearly due and there is still no room to prepare.
    if (!surgery.theatreId && (imminent || overdue)) {
      add('tech-no-theatre',
        `Theatre not allocated — ${surgery.procedureName}`,
        `${patient} has no theatre assigned, so setup cannot be confirmed. Raise this with the theatre manager.`,
        overdue ? 'CRITICAL' : 'HIGH');
    } else if (surgery.theatreId && !started && (imminent || overdue)) {
      add('setup',
        `Confirm theatre setup — ${surgery.procedureName}`,
        `${patient} is due ${overdue ? `and is already past ${surgery.scheduledTime ?? 'the scheduled time'}` : `in ${minutesAway} minutes`}. Confirm the room, equipment and anaesthetic machine are ready.`,
        overdue ? 'CRITICAL' : 'HIGH');
    }
  }

  return tasks;
}

/** Every outstanding item across a person's cases. */
export function personalCaseTasks(
  surgeries: CaseForTasks[],
  userId: string,
  now: Date,
): TaskInput[] {
  return surgeries.flatMap((s) => caseTasksFor(s, userId, now));
}
