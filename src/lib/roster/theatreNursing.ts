// ============================================================
// The nursing posts a theatre day is staffed from
// ------------------------------------------------------------
// Asked for on 7 November:
//
//   "add a section for staffing the main theatre emergency nurses (circulating
//    and scrub nurse) and this will be captured and wired to the emergency
//    bookings so we know who to chase when there is no theatre assignment and
//    acknowledgement ... there will also be a place to add the nurses at the
//    A/E theatre for the morning and night shifts"
//
//   "add a place also to assign nurse supervisors from among the perioperative
//    nurses, whose names and details will appear on the main page of surgery
//    schedule page for each day, and will be fetched by the theatre meal page
//    and duty performance and can be chased alongside the theatre manager"
//
// WHAT WAS ALREADY THERE, AND WHY IT REACHED NOBODY. The emergency chase has
// looked for a scrub nurse, a circulating nurse and nurse supervisors since
// 7 November, and has chased them alongside the theatre manager. It found
// nobody every time, because there has never been a screen on which anybody
// could be named to those posts. This file is the missing half.
//
// WRITTEN INTO THE ROSTER, NOT A TABLE OF ITS OWN -- the same decision the
// holding area made, for the same reason. rosters already carries a person, a
// date, a shift, a location, a nursing sub-role and who put them there, and
// the meal count, the duty sheets and the duty-performance screens already
// read it. A second table would be a second answer to one question, and the
// two would disagree inside a week. Because of that, a name entered here is
// picked up by the theatre meal page and by duty performance without either
// of them being changed.
//
// THE TRAP THIS FILE EXISTS TO CLOSE. An emergency NEVER reads the MORNING
// roster -- that is deliberate and is documented in rosterOnDutyShift: MORNING
// is the elective list, and on 3 September a critical case was shown a team of
// anaesthetists who were committed to their own lists and could not have been
// rung. So a main-theatre emergency nurse recorded against MORNING would be
// recorded and never found. The posts below therefore offer only the shifts
// their own post can actually be found on, and the A/E theatre -- which really
// does run a morning shift -- has its daytime cover resolved from MORNING as
// well as CALL. A shift a screen lets you choose and the system then ignores
// is worse than no screen at all.
// ============================================================

import prisma from '@/lib/prisma';
import {
  electiveShiftFromDate, emergencyShiftFromDate, type DutyShift,
} from '@/lib/rosterOnDutyShift';

export type NursingLocation = 'MAIN_THEATRE' | 'A_AND_E';
export type NursingSubRole = 'SCRUB' | 'CIRCULATING' | 'SUPERVISING';

export type NursingPostKey =
  | 'MAIN_SCRUB'
  | 'MAIN_CIRCULATING'
  | 'AE_SCRUB'
  | 'AE_CIRCULATING'
  | 'SUPERVISOR';

export interface NursingPost {
  key: NursingPostKey;
  /** What the screen calls it. */
  label: string;
  /** Where the post is worked. */
  location: NursingLocation;
  /** The roster sub-role the row carries. */
  subRole: NursingSubRole;
  /** The shifts this post may be staffed on, and nothing else. */
  shifts: readonly DutyShift[];
  /** One line on the screen saying what this post is for. */
  why: string;
}

/**
 * The posts, in the order the screen shows them.
 *
 * The two main-theatre emergency posts carry no MORNING option on purpose:
 * see the header. The A/E posts carry MORNING and NIGHT because that is how
 * the A/E theatre is actually run, and the resolver below knows to read the
 * morning row for a daytime A/E emergency.
 */
export const NURSING_POSTS: readonly NursingPost[] = [
  {
    key: 'MAIN_SCRUB',
    label: 'Main theatre — emergency scrub nurse',
    location: 'MAIN_THEATRE',
    subRole: 'SCRUB',
    shifts: ['CALL', 'NIGHT'],
    why: 'Scrubs for emergencies in the main theatre. Chased when a booked '
      + 'emergency has no theatre and nobody has acknowledged it.',
  },
  {
    key: 'MAIN_CIRCULATING',
    label: 'Main theatre — emergency circulating nurse',
    location: 'MAIN_THEATRE',
    subRole: 'CIRCULATING',
    shifts: ['CALL', 'NIGHT'],
    why: 'Circulates for emergencies in the main theatre, and is one of the '
      + 'people who works the theatre-assignment panel.',
  },
  {
    key: 'AE_SCRUB',
    label: 'A/E theatre — scrub nurse',
    location: 'A_AND_E',
    subRole: 'SCRUB',
    shifts: ['MORNING', 'NIGHT'],
    why: 'Scrubs in the Accident & Emergency theatre. Morning and night, as '
      + 'that theatre is run.',
  },
  {
    key: 'AE_CIRCULATING',
    label: 'A/E theatre — circulating nurse',
    location: 'A_AND_E',
    subRole: 'CIRCULATING',
    shifts: ['MORNING', 'NIGHT'],
    why: 'Circulates in the Accident & Emergency theatre, morning and night.',
  },
  {
    key: 'SUPERVISOR',
    label: 'Nurse supervisor',
    location: 'MAIN_THEATRE',
    subRole: 'SUPERVISING',
    shifts: ['MORNING', 'CALL', 'NIGHT'],
    why: 'Supervises the theatre floor for the shift. Named on the surgery '
      + 'schedule, counted for meals and duty performance, and chased '
      + 'alongside the theatre manager.',
  },
];

/** The post with this key, or null. */
export const postByKey = (key: string | null | undefined): NursingPost | null =>
  NURSING_POSTS.find((p) => p.key === key) ?? null;

/** May this post be staffed on this shift? */
export function postAllowsShift(key: string, shift: string): boolean {
  const post = postByKey(key);
  return !!post && (post.shifts as readonly string[]).includes(shift);
}

/**
 * Who may hold a nursing post here.
 *
 * "From among the perioperative nurses", as asked. These are the three nurse
 * roles in the UserRole enum -- checked against the enum, because a role that
 * is not in it matches nobody while the screen reports success.
 */
export const PERIOPERATIVE_NURSE_ROLES = [
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
  'INFECTION_CONTROL_NURSE',
] as const;

/**
 * Which roster shifts count as cover for an emergency at this moment.
 *
 * MAIN THEATRE follows the rule the rest of the emergency board follows: day
 * call between 08:00 and 18:00, night outside it, and never the morning
 * elective roster.
 *
 * A/E is different, and this is the whole reason this function exists. That
 * theatre is staffed morning and night, so its daytime cover IS the morning
 * team. CALL is read as well, so an A/E nurse recorded on call is still
 * found rather than being silently ignored for having picked the other word.
 */
export function coveringShifts(location: NursingLocation, at: Date): DutyShift[] {
  const emergencyShift = emergencyShiftFromDate(at);
  if (location === 'A_AND_E') {
    return emergencyShift === 'NIGHT' ? ['NIGHT'] : ['MORNING', 'CALL'];
  }
  return [emergencyShift];
}

/**
 * Which roster shifts a nurse supervisor on the floor may be recorded under
 * at this moment.
 *
 * NOT the emergency rule, and the difference matters. A supervisor supervises
 * the FLOOR -- the elective lists as much as the emergencies -- so the person
 * on the floor at 10:00 is the one rostered MORNING. Resolving supervisors
 * with the emergency rule would look for a CALL supervisor at ten in the
 * morning and find nobody, and the screen would say the floor was
 * unsupervised while somebody stood on it.
 *
 * Both rules are read, so a supervisor recorded under either word is found.
 */
export function supervisorShifts(at: Date): DutyShift[] {
  const both = [electiveShiftFromDate(at), emergencyShiftFromDate(at)];
  return Array.from(new Set(both));
}

/** Roster.date is a Prisma @db.Date; equality only matches with no time. */
export function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export interface NursingEntry {
  rosterId: string;
  userId: string;
  name: string;
  role: string;
  phoneNumber: string | null;
  shift: string;
  subRole: NursingSubRole;
  location: NursingLocation;
  notes: string | null;
  /** Who put them there. The record says that too, deliberately. */
  allocatedBy: string | null;
  allocatedAt: Date | null;
}

const ROW_SELECT = {
  id: true,
  userId: true,
  staffName: true,
  shift: true,
  subRole: true,
  location: true,
  notes: true,
  uploadedBy: true,
  uploadedAt: true,
  user: { select: { fullName: true, role: true, phoneNumber: true } },
} as const;

type Row = {
  id: string; userId: string; staffName: string; shift: string;
  subRole: string | null; location: string | null; notes: string | null;
  uploadedBy: string | null; uploadedAt: Date | null;
  user: { fullName: string; role: string; phoneNumber: string | null } | null;
};

const toEntry = (r: Row): NursingEntry => ({
  rosterId: r.id,
  userId: r.userId,
  name: r.user?.fullName ?? r.staffName,
  role: r.user?.role ?? 'SCRUB_NURSE',
  phoneNumber: r.user?.phoneNumber ?? null,
  shift: r.shift,
  subRole: (r.subRole ?? 'SCRUB') as NursingSubRole,
  location: (r.location ?? 'MAIN_THEATRE') as NursingLocation,
  notes: r.notes ?? null,
  allocatedBy: r.uploadedBy ?? null,
  allocatedAt: r.uploadedAt ?? null,
});

export interface EmergencyNursing {
  /** The shifts that were searched, so a screen can say so rather than imply. */
  shiftsSearched: DutyShift[];
  /** The shifts the supervisors were searched on, which are not the same. */
  supervisorShiftsSearched: DutyShift[];
  location: NursingLocation;
  scrub: NursingEntry | null;
  circulating: NursingEntry | null;
  /** Supervisors cover the floor, so they are read whatever the location. */
  supervisors: NursingEntry[];
}

/**
 * The nurses to chase for an emergency.
 *
 * Asked by date, location and the shift the hour implies -- never by theatre
 * id. An emergency with no theatre is exactly the case being chased, so a
 * room-scoped question would return nobody precisely when it matters.
 *
 * Only PUBLISHED rows: a draft roster is somebody's plan, not somebody's duty.
 */
export async function resolveEmergencyNursing(opts: {
  date: Date;
  location?: NursingLocation;
}): Promise<EmergencyNursing> {
  const location: NursingLocation = opts.location ?? 'MAIN_THEATRE';
  const shifts = coveringShifts(location, opts.date);
  const day = dateOnly(opts.date);

  const rows = (await prisma.roster.findMany({
    where: {
      date: day,
      status: 'PUBLISHED',
      staffCategory: 'NURSES' as never,
      OR: [
        // The post holders at this location, on the shift that answers an
        // emergency at this hour.
        {
          location,
          subRole: { in: ['SCRUB', 'CIRCULATING'] },
          shift: { in: shifts as never },
        },
        // Supervisors cover the whole floor, so they are neither scoped to a
        // location nor read on the emergency rule. See supervisorShifts.
        {
          subRole: 'SUPERVISING',
          shift: { in: supervisorShifts(opts.date) as never },
        },
      ],
    },
    select: ROW_SELECT,
    orderBy: [{ shift: 'asc' }, { uploadedAt: 'desc' }],
  }).catch(() => [])) as unknown as Row[];

  const entries = rows.map(toEntry);
  const of = (sub: NursingSubRole) => entries.filter((e) => e.subRole === sub);

  return {
    shiftsSearched: shifts,
    supervisorShiftsSearched: supervisorShifts(opts.date),
    location,
    scrub: of('SCRUB')[0] ?? null,
    circulating: of('CIRCULATING')[0] ?? null,
    supervisors: of('SUPERVISING'),
  };
}

/**
 * Every nursing post holder on a given day, for the staffing screen and for
 * the surgery schedule.
 *
 * Whole day, every shift: the schedule page is a day's work, not a moment.
 */
export async function nursingForDay(date: Date): Promise<NursingEntry[]> {
  const rows = (await prisma.roster.findMany({
    where: {
      date: dateOnly(date),
      status: 'PUBLISHED',
      staffCategory: 'NURSES' as never,
      subRole: { in: ['SCRUB', 'CIRCULATING', 'SUPERVISING'] },
    },
    select: ROW_SELECT,
    orderBy: [{ subRole: 'asc' }, { shift: 'asc' }, { staffName: 'asc' }],
  }).catch(() => [])) as unknown as Row[];
  return rows.map(toEntry);
}

/** The supervisors named for a day, which is what the schedule page shows. */
export async function supervisorsForDay(date: Date): Promise<NursingEntry[]> {
  return (await nursingForDay(date)).filter((e) => e.subRole === 'SUPERVISING');
}

/**
 * Which theatre a case belongs to, read from the theatre's name.
 *
 * There is no column saying whether an emergency is a main-theatre case or an
 * A/E one, and an unassigned emergency has no theatre at all -- which is
 * precisely the case being chased. So: a named A/E suite means the A/E pair,
 * and everything else, including nothing, means the main theatre. Defaulting
 * the other way would chase two A/E nurses about a case in Theatre 3.
 *
 * The suites on file are "A&E Theatre", "A&E North Wing Suite" and "A&E South
 * Wing Suite"; the spellings below also catch "A/E" and "Accident".
 */
export function locationForTheatreName(
  name: string | null | undefined,
): NursingLocation {
  const n = String(name ?? '').toUpperCase();
  if (!n) return 'MAIN_THEATRE';
  if (/\bA\s*[&/]\s*E\b/.test(n)) return 'A_AND_E';
  if (n.includes('ACCIDENT')) return 'A_AND_E';
  return 'MAIN_THEATRE';
}
