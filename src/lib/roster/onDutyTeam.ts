// ============================================================
// Who is on duty, resolved once and used by everything that asks
// ------------------------------------------------------------
// This was the body of /api/roster/on-duty, and nothing else could reach it.
// Moved here unchanged on 6 November so the emergency team chase can ask the
// same question the booking card asks and get the same answer.
//
// WHY THAT MATTERS MORE THAN IT SOUNDS. The card names the on-call team; the
// chase has to reach the people the card names. Two copies of "who is on
// call" would mean a screen listing one anaesthetist and a WhatsApp going to
// another, and the first time that happens in the night nobody trusts either
// of them again.
//
// The behaviour below is the route's, including the parts that look odd and
// are not: the emergency purpose never answers with the MORNING roster, the
// anaesthetists are de-duplicated before first and second are picked, and
// the disciplines that keep no duty roster fall back to the first approved
// holder of the role, marked `source: 'role'` so a screen can say "on-call"
// rather than implying a published roster that does not exist.
// ============================================================

import prisma from '@/lib/prisma';
import { shiftForPurpose } from '@/lib/rosterOnDutyShift';

export type OnDutyShift = 'MORNING' | 'CALL' | 'NIGHT';
export type OnDutyPurpose = 'emergency' | 'elective';

export type StaffEntry = {
  id: string;
  userId: string;
  name: string;
  role: string;
  staffCode: string | null;
  phoneNumber: string | null;
  extension: string | null;
  availabilityStatus: string | null;
  currentLocation: string | null;
  seniorityLevel: string | null;
  subRole: string | null;
  theatreId: string | null;
  shift: string;
  /** roster = rostered on duty; role = on-call by role (fallback contact). */
  source?: 'roster' | 'role';
};

export interface OnDutyTeam {
  anaesthetist: StaffEntry | null;
  anaesthetist2: StaffEntry | null;
  anaestheticTechnician: StaffEntry | null;
  scrubNurse: StaffEntry | null;
  circulatingNurse: StaffEntry | null;
  supervisors: StaffEntry[];
  recoveryNurse: StaffEntry | null;
  cleaner: StaffEntry | null;
  porter: StaffEntry | null;
  pharmacist: StaffEntry | null;
  theatreManager: StaffEntry | null;
  bloodBank: StaffEntry | null;
  cssd: StaffEntry | null;
  biomedicalEngineer: StaffEntry | null;
}

export interface OnDutyResult {
  date: string;
  shift: OnDutyShift;
  purpose: OnDutyPurpose;
  theatreId: string | null;
  team: OnDutyTeam;
  candidates: {
    anaesthetists: StaffEntry[];
    anaestheticTechnicians: StaffEntry[];
    nurses: StaffEntry[];
    recoveryNurses: StaffEntry[];
    cleaners: StaffEntry[];
    porters: StaffEntry[];
    pharmacists: StaffEntry[];
  };
  rostersFound: number;
}

/** CONSULTANT > SENIOR_REGISTRAR > REGISTRAR > anything else. */
const seniorityRank = (s: string | null) => {
  switch (s) {
    case 'CONSULTANT': return 0;
    case 'SENIOR_REGISTRAR': return 1;
    case 'REGISTRAR': return 2;
    default: return 3;
  }
};

export async function resolveOnDutyTeam(opts: {
  date: Date;
  shift?: OnDutyShift | null;
  purpose?: OnDutyPurpose;
  theatreId?: string | null;
}): Promise<OnDutyResult> {
  const parsed = opts.date;

  // WHAT IS BEING ASKED changes which shift answers.
  //
  // "Who is on duty at 10:00?" for an elective list is the MORNING roster.
  // For an EMERGENCY it is the on-call team, and never the morning one:
  // MORNING is the elective roster — the anaesthetists label that shift
  // "ELECTIVES" — so answering an emergency with it names people who are
  // committed to their own lists and are not the ones to ring.
  const purpose: OnDutyPurpose = opts.purpose === 'emergency' ? 'emergency' : 'elective';
  const shift = opts.shift || shiftForPurpose(parsed, purpose);

  // Roster.date is a Prisma @db.Date — strip the time so equality matches.
  const dateOnly = new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  );

  const where: {
    date: Date;
    shift: OnDutyShift;
    theatreId?: string;
    status: string;
  } = {
    date: dateOnly,
    shift,
    status: 'PUBLISHED', // only published rosters are "on duty"; drafts are excluded
  };

  const theatreFilter = opts.theatreId?.trim();
  if (theatreFilter && theatreFilter !== 'any' && theatreFilter !== 'all') {
    where.theatreId = theatreFilter;
  }

  const rosters = await prisma.roster.findMany({
    where,
    include: {
      user: {
        select: {
          id: true, fullName: true, role: true, staffCode: true,
          phoneNumber: true, extension: true,
          availabilityStatus: true, currentLocation: true,
        },
      },
    },
    orderBy: [
      // CONSULTANT first, then SENIOR_REGISTRAR, then REGISTRAR, then nulls.
      { seniorityLevel: 'asc' },
      { uploadedAt: 'desc' },
    ],
  });

  const toEntry = (r: (typeof rosters)[number]): StaffEntry => ({
    id: r.id,
    userId: r.user.id,
    name: r.user.fullName,
    role: r.user.role,
    staffCode: r.user.staffCode,
    phoneNumber: r.user.phoneNumber,
    extension: r.user.extension ?? null,
    availabilityStatus: r.user.availabilityStatus ?? null,
    currentLocation: r.user.currentLocation ?? null,
    seniorityLevel: r.seniorityLevel ?? null,
    subRole: r.subRole ?? null,
    theatreId: r.theatreId ?? null,
    shift: r.shift,
    source: 'roster',
  });

  const candidates: OnDutyResult['candidates'] = {
    anaesthetists: [],
    anaestheticTechnicians: [],
    nurses: [],
    recoveryNurses: [],
    cleaners: [],
    porters: [],
    pharmacists: [],
  };

  for (const r of rosters) {
    const entry = toEntry(r);
    switch (r.staffCategory) {
      case 'ANAESTHETISTS': candidates.anaesthetists.push(entry); break;
      case 'ANAESTHETIC_TECHNICIANS': candidates.anaestheticTechnicians.push(entry); break;
      case 'NURSES': candidates.nurses.push(entry); break;
      case 'RECOVERY_NURSES': candidates.recoveryNurses.push(entry); break;
      case 'CLEANERS': candidates.cleaners.push(entry); break;
      case 'PORTERS': candidates.porters.push(entry); break;
      case 'PHARMACISTS': candidates.pharmacists.push(entry); break;
      default: break;
    }
  }

  // DE-DUPLICATED BY PERSON FIRST. The same anaesthetist can hold more than
  // one row for a shift — on 3 September both on-call consultants had two
  // apiece, one carrying "ALL EMERGENCIES (on-call)" and one carrying no
  // assignment — and without this the first and second anaesthetist slots
  // fill with the same name, which reads as a team of two and is a team of
  // one.
  const uniqueAnaesthetists = Array.from(
    new Map(candidates.anaesthetists.map((a) => [a.userId, a])).values(),
  );
  const sortedAnaesthetists = uniqueAnaesthetists.sort(
    (a, b) => seniorityRank(a.seniorityLevel) - seniorityRank(b.seniorityLevel),
  );

  // Nurses: split by subRole where recorded; otherwise fall back to order.
  const bySub = (want: string) =>
    candidates.nurses.filter((n) => (n.subRole ?? '').toUpperCase() === want);
  const scrub = bySub('SCRUB');
  const circ = bySub('CIRCULATING');
  const supervisors = bySub('SUPERVISING');
  const plainNurses = candidates.nurses.filter(
    (n) => !['SCRUB', 'CIRCULATING', 'SUPERVISING', 'HOLDING_AREA']
      .includes((n.subRole ?? '').toUpperCase()),
  );
  const scrubNurse = scrub[0] ?? plainNurses[0] ?? candidates.nurses[0] ?? null;
  const circulatingNurse =
    circ[0]
    ?? plainNurses.find((n) => n.userId !== scrubNurse?.userId)
    ?? candidates.nurses.find((n) => n.userId !== scrubNurse?.userId)
    ?? null;

  // Role-based fallback contacts for disciplines that are not part of the
  // standing duty roster (theatre manager, blood bank, CSSD, biomed).
  // "On-call by role" — the first APPROVED user of the role. Advisory contact.
  const ROLE_CONTACTS: Array<[string, string[]]> = [
    ['theatreManager', ['THEATRE_MANAGER']],
    ['bloodBank', ['BLOODBANK_STAFF']],
    ['cssd', ['CSSD_STAFF', 'CSSD_SUPERVISOR']],
    ['biomedicalEngineer', ['BIOMEDICAL_ENGINEER']],
  ];
  const roleContacts: Record<string, StaffEntry | null> = {};
  await Promise.all(
    ROLE_CONTACTS.map(async ([key, roles]) => {
      const u = await prisma.user.findFirst({
        where: { role: { in: roles as never }, status: 'APPROVED' as never },
        select: {
          id: true, fullName: true, role: true, staffCode: true, phoneNumber: true,
          extension: true, availabilityStatus: true, currentLocation: true,
        },
        orderBy: { fullName: 'asc' },
      });
      roleContacts[key] = u
        ? {
          id: u.id, userId: u.id, name: u.fullName, role: u.role, staffCode: u.staffCode,
          phoneNumber: u.phoneNumber, extension: u.extension ?? null,
          availabilityStatus: u.availabilityStatus ?? null,
          currentLocation: u.currentLocation ?? null,
          seniorityLevel: null, subRole: null, theatreId: null, shift, source: 'role',
        }
        : null;
    }),
  );

  // Recovery nurse: prefer a rostered RECOVERY_NURSES entry, else by role.
  let recoveryNurse: StaffEntry | null = candidates.recoveryNurses[0] ?? null;
  if (!recoveryNurse) {
    const u = await prisma.user.findFirst({
      where: { role: 'RECOVERY_ROOM_NURSE' as never, status: 'APPROVED' as never },
      select: {
        id: true, fullName: true, role: true, staffCode: true, phoneNumber: true,
        extension: true, availabilityStatus: true, currentLocation: true,
      },
    });
    if (u) {
      recoveryNurse = {
        id: u.id, userId: u.id, name: u.fullName, role: u.role, staffCode: u.staffCode,
        phoneNumber: u.phoneNumber, extension: u.extension ?? null,
        availabilityStatus: u.availabilityStatus ?? null,
        currentLocation: u.currentLocation ?? null,
        seniorityLevel: null, subRole: null, theatreId: null, shift, source: 'role',
      };
    }
  }

  const team: OnDutyTeam = {
    anaesthetist: sortedAnaesthetists[0] ?? null,
    // Second/emergency anaesthetist for cover.
    anaesthetist2: sortedAnaesthetists[1] ?? null,
    anaestheticTechnician: candidates.anaestheticTechnicians[0] ?? null,
    scrubNurse,
    circulatingNurse,
    supervisors,
    recoveryNurse,
    cleaner: candidates.cleaners[0] ?? null,
    porter: candidates.porters[0] ?? null,
    pharmacist: candidates.pharmacists[0] ?? null,
    theatreManager: roleContacts.theatreManager ?? null,
    bloodBank: roleContacts.bloodBank ?? null,
    cssd: roleContacts.cssd ?? null,
    biomedicalEngineer: roleContacts.biomedicalEngineer ?? null,
  };

  return {
    date: dateOnly.toISOString().slice(0, 10),
    shift,
    purpose,
    theatreId: where.theatreId ?? null,
    team,
    candidates,
    rostersFound: rosters.length,
  };
}
