// ============================================================
// Everybody on one emergency, resolved once
// ------------------------------------------------------------
// Extracted from api/emergency-booking/[id]/chase-team on 7 November, when a
// third consumer appeared: the CMAC escalation needs the team's names and
// phone numbers, and the one thing it must not do is resolve a different
// team from the one the board shows. The same mistake was caught and fixed
// in resolveOnDutyTeam a day earlier — a screen listing one anaesthetist
// while the WhatsApp went to another discredits both.
//
// So: one function, three callers (the team chase, the CMAC escalation, and
// the roll-call panel on the card). If the slots change, every consumer
// changes with them.
//
// THE SLOT ORDER IS THE CHASE ORDER, and it is "how close this role is to the
// patient getting on the table". The roll call is deduplicated first-slot-
// wins, so the order also decides which title a person is chased under when
// they fill two — the surgeon who booked the case is often the consultant on
// call, and the title that matters is the one that puts the hour on them.
// ============================================================

import { resolveOnDutyTeam, type StaffEntry } from '@/lib/roster/onDutyTeam';
import { buildRollCall, summariseRollCall, type TeamSlotInput } from './teamChase';

/** What resolveOnDutyTeam hands back, as this file uses it. */
export interface RosterTeam {
  anaesthetist: StaffEntry | null;
  anaesthetist2: StaffEntry | null;
  anaestheticTechnician: StaffEntry | null;
  scrubNurse: StaffEntry | null;
  circulatingNurse: StaffEntry | null;
  supervisors: StaffEntry[];
  recoveryNurse: StaffEntry | null;
  porter: StaffEntry | null;
  cleaner: StaffEntry | null;
  pharmacist: StaffEntry | null;
  theatreManager: StaffEntry | null;
  bloodBank: StaffEntry | null;
  cssd: StaffEntry | null;
  biomedicalEngineer: StaffEntry | null;
}

export const EMPTY_ROSTER_TEAM: RosterTeam = {
  anaesthetist: null, anaesthetist2: null, anaestheticTechnician: null,
  scrubNurse: null, circulatingNurse: null, supervisors: [],
  recoveryNurse: null, porter: null, cleaner: null, pharmacist: null,
  theatreManager: null, bloodBank: null, cssd: null, biomedicalEngineer: null,
};

/** The booking fields the roll call needs. Kept narrow so any loader fits. */
export interface RollCallBooking {
  surgeon: {
    id: string; fullName: string; phoneNumber: string | null; role?: string | null;
  } | null;
  anesthetist: {
    id: string; fullName: string; phoneNumber: string | null; role?: string | null;
  } | null;
  requestedAt: Date | string;
  requiredByTime?: Date | string | null;
  teamAvailability: { userId: string; status: string; respondedAt?: Date | string | null }[];
  preAnaestheticReviews: { reviewerId: string }[];
}

/**
 * The ordered slots, from the people named on the case outwards.
 */
export function slotsFor(booking: RollCallBooking, roster: RosterTeam): TeamSlotInput[] {
  // The account role travels with the person, so a chase can tell a
  // consultant from a registrar. See lib/emergency/consultantTone.
  const fromStaff = (s: StaffEntry | null) => (s
    ? { userId: s.userId, name: s.name, phoneNumber: s.phoneNumber, userRole: s.role }
    : null);

  const slots: TeamSlotInput[] = [
    {
      label: 'Surgeon who booked this case',
      teamRole: 'SURGEON',
      source: 'case',
      person: booking.surgeon
        ? {
          userId: booking.surgeon.id,
          name: booking.surgeon.fullName,
          phoneNumber: booking.surgeon.phoneNumber,
          userRole: booking.surgeon.role ?? null,
        }
        : null,
    },
    {
      label: 'Anaesthetist named on the booking',
      teamRole: 'ANAESTHETIST',
      source: 'case',
      person: booking.anesthetist
        ? {
          userId: booking.anesthetist.id,
          name: booking.anesthetist.fullName,
          phoneNumber: booking.anesthetist.phoneNumber,
          userRole: booking.anesthetist.role ?? null,
        }
        : null,
    },
    { label: 'Anaesthetist (1st on call)', teamRole: 'ANAESTHETIST', source: 'roster', person: fromStaff(roster.anaesthetist) },
    { label: 'Anaesthetist (2nd on call)', teamRole: 'ANAESTHETIST', source: 'roster', person: fromStaff(roster.anaesthetist2) },
    { label: 'Anaesthetic Technician', teamRole: 'ANAESTHETIC_TECHNICIAN', source: 'roster', person: fromStaff(roster.anaestheticTechnician) },
    { label: 'Scrub Nurse', teamRole: 'SCRUB_NURSE', source: 'roster', person: fromStaff(roster.scrubNurse) },
    { label: 'Circulating Nurse', teamRole: 'CIRCULATING_NURSE', source: 'roster', person: fromStaff(roster.circulatingNurse) },
  ];

  roster.supervisors.forEach((sup, i) => {
    slots.push({
      label: `Nurse Supervisor ${i + 1}`,
      teamRole: 'CIRCULATING_NURSE',
      source: 'roster',
      person: fromStaff(sup),
    });
  });

  slots.push(
    { label: 'Recovery Nurse', teamRole: 'RECOVERY_ROOM_NURSE', source: 'roster', person: fromStaff(roster.recoveryNurse) },
    { label: 'Porter', teamRole: 'PORTER', source: 'roster', person: fromStaff(roster.porter) },
    { label: 'Cleaner', teamRole: 'CLEANER', source: 'roster', person: fromStaff(roster.cleaner) },
    { label: 'Pharmacist', teamRole: 'PHARMACIST', source: 'roster', person: fromStaff(roster.pharmacist) },
    { label: 'Blood Bank', teamRole: 'BLOODBANK_STAFF', source: 'role', person: fromStaff(roster.bloodBank) },
    { label: 'Biomedical Engineer', teamRole: 'BIOMEDICAL_ENGINEER', source: 'role', person: fromStaff(roster.biomedicalEngineer) },
    // The availability table has no value for these two, so they are told and
    // not counted as owing a tap. Pretending otherwise would leave the roll
    // call permanently two short of complete.
    { label: 'CSSD', teamRole: null, source: 'role', person: fromStaff(roster.cssd) },
    { label: 'Theatre Manager', teamRole: null, source: 'role', person: fromStaff(roster.theatreManager) },
  );

  return slots;
}

/**
 * The roll call for one booking: who is on it, who has answered, and whether
 * the pre-anaesthetic review is recorded.
 *
 * NO theatreId FILTER, deliberately, and it must stay that way: the booking
 * card asks this same question with the date alone. Narrowing to the assigned
 * theatre would resolve a different and usually smaller team than the card
 * shows — a screen naming one anaesthetist while the WhatsApp went to another,
 * which is the exact failure moving this resolver into a shared lib was meant
 * to prevent. On-call rosters are published against the shift, not a room.
 */
export async function assembleRollCall(booking: RollCallBooking) {
  const when = booking.requiredByTime ?? booking.requestedAt;
  const roster = await resolveOnDutyTeam({
    date: new Date(when),
    purpose: 'emergency',
  }).catch(() => null);

  const members = buildRollCall(
    slotsFor(booking, (roster?.team as RosterTeam | undefined) ?? EMPTY_ROSTER_TEAM),
    booking.teamAvailability.map((a) => ({
      userId: a.userId, status: a.status, respondedAt: a.respondedAt,
    })),
    // A review counts once it exists at all. PENDING means the anaesthetist
    // has opened it and started; that is more than nothing and a chase should
    // not call it nothing. The board shows the status separately.
    booking.preAnaestheticReviews.map((r) => r.reviewerId),
  );

  return { members, summary: summariseRollCall(members), roster };
}
