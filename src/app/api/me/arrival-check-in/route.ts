// ============================================================
// The cases waiting on an answer from whoever has just signed in
// ------------------------------------------------------------
// Asked for on 6 November: somebody arriving at the hospital and signing in
// is shown a dialogue, if and only if their name is on a case booked for
// today, asking whether they are here.
//
// GET  — the cases this person is on today, both elective and emergency,
//        and whatever they have already said about each.
// POST — one answer, recorded in whichever of the two attendance tables the
//        case belongs to.
//
// WHY A NEW ENDPOINT RATHER THAN THE TWO THAT EXIST. The question "is this
// person on anything today" has never had an owner: the elective check-in
// board answers it for elective lists and the emergency board answers it
// for emergencies, and the dialogue has to ask both before it can decide
// whether to appear at all. Asking two endpoints and merging in the browser
// would put that decision in a component, where it cannot be tested and
// where a slow second request would show a half-populated prompt.
//
// WRITES GO TO THE EXISTING TABLES, unchanged: SurgeryTeamCheckIn for an
// elective case, EmergencyTeamAvailability for an emergency. The two
// vocabularies are mapped in lib/theatreOps/arrivalPrompt.ts. Nothing here
// invents a third place where attendance lives.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { watDayRange, watToday } from '@/lib/watDay';
import { caseTeamSlots, CASE_TEAM_SELECT } from '@/lib/theatreOps/caseTeam';
import { assessFix } from '@/lib/theatreOps/geofence';
import {
  answerProblem, isArrivalAnswer, statusFor, storedReason, unanswered,
  type ArrivalAnswerKey, type MyCase,
} from '@/lib/theatreOps/arrivalPrompt';

export const dynamic = 'force-dynamic';

/** Emergency bookings still waiting to happen. */
const LIVE_EMERGENCY = ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED'] as const;

interface Me { id: string; name?: string | null; fullName?: string | null }

/** The elective cases today with this person on the team. */
async function mySurgeries(me: Me, dayStart: Date, dayEnd: Date): Promise<MyCase[]> {
  const surgeries = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: dayStart, lt: dayEnd },
      status: { notIn: ['CANCELLED'] },
    },
    select: {
      id: true,
      procedureName: true,
      scheduledTime: true,
      location: true,
      ...CASE_TEAM_SELECT,
      patient: { select: { name: true } },
      teamCheckIns: { select: { userId: true, status: true } },
    },
    orderBy: { scheduledTime: 'asc' },
    take: 100,
  });

  const out: MyCase[] = [];
  for (const s of surgeries) {
    const slot = caseTeamSlots(s).find((t) => t.userId === me.id);
    if (!slot) continue;
    const mine = s.teamCheckIns.find((c) => c.userId === me.id);
    out.push({
      kind: 'SURGERY',
      id: s.id,
      label: [
        s.procedureName || 'Case',
        s.scheduledTime ? `at ${s.scheduledTime}` : null,
        s.location ? `in ${s.location}` : null,
      ].filter(Boolean).join(' '),
      myRole: slot.roleOnCase,
      myStatus: (mine?.status as string | undefined) ?? null,
    });
  }
  return out;
}

/**
 * The emergencies this person is NAMED ON.
 *
 * Named on the booking, not resolved from the on-call roster. The roster
 * team is chased by the team chase, which is a deliberate act by somebody
 * who has looked at the case; turning every on-call anaesthetist's sign-in
 * into a dialogue about every emergency on the board would make the prompt
 * noise within a week, and a prompt that is noise is a prompt nobody reads
 * on the morning it matters.
 */
async function myEmergencies(me: Me, dayStart: Date, dayEnd: Date): Promise<MyCase[]> {
  const bookings = await prisma.emergencySurgeryBooking.findMany({
    where: {
      status: { in: LIVE_EMERGENCY as unknown as never },
      // Named on the booking, AND booked for today by whichever time the
      // case is hung on. Two separate OR groups, so they are combined with
      // AND rather than one swallowing the other.
      AND: [
        { OR: [{ surgeonId: me.id }, { anesthetistId: me.id }] },
        {
          OR: [
            { requiredByTime: { gte: dayStart, lt: dayEnd } },
            { requestedAt: { gte: dayStart, lt: dayEnd } },
          ],
        },
      ],
    },
    select: {
      id: true, procedureName: true, patientName: true, theatreName: true,
      requiredByTime: true, surgeonId: true, anesthetistId: true,
      teamAvailability: { select: { userId: true, status: true } },
    },
    orderBy: { requestedAt: 'desc' },
    take: 50,
  });

  return bookings.map((b) => {
    const mine = b.teamAvailability.find((a) => a.userId === me.id);
    return {
      kind: 'EMERGENCY' as const,
      id: b.id,
      label: [
        `EMERGENCY — ${b.procedureName}`,
        b.theatreName ? `in ${b.theatreName}` : null,
      ].filter(Boolean).join(' '),
      myRole: b.surgeonId === me.id ? 'Surgeon' : 'Anaesthetist',
      myStatus: (mine?.status as string | undefined) ?? null,
    };
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as Me | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const day = request.nextUrl.searchParams.get('date') || watToday();
  const { start, end } = watDayRange(day);

  try {
    const [surgeries, emergencies] = await Promise.all([
      mySurgeries(me, start, end),
      myEmergencies(me, start, end),
    ]);
    // Emergencies first: they are the ones where an unanswered name costs
    // somebody the hour.
    const cases = [...emergencies, ...surgeries];
    return NextResponse.json({
      day,
      cases,
      unanswered: unanswered(cases).length,
    });
  } catch (error) {
    // A dialogue that cannot load its cases must not break the dashboard
    // behind it. An empty list simply means no prompt.
    console.error('[arrival-check-in] GET failed:', error);
    return NextResponse.json({ day, cases: [], unanswered: 0 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as Me | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let body: {
    kind?: string;
    id?: string;
    answer?: string;
    reason?: string;
    deviceLabel?: string;
    fix?: {
      latitude?: number | null;
      longitude?: number | null;
      accuracyM?: number | null;
      unavailableReason?: string | null;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const answer = body.answer as ArrivalAnswerKey | undefined;
  if (!body.id || !isArrivalAnswer(answer)) {
    return NextResponse.json({ error: 'A case and an answer are required.' }, { status: 400 });
  }
  const problem = answerProblem(answer, body.reason);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const fix = body.fix ?? null;
  // Assessed here, never taken from the browser: a client that could name
  // its own verdict could claim to be on site from anywhere.
  const verdict = assessFix({
    latitude: fix?.latitude ?? undefined,
    longitude: fix?.longitude ?? undefined,
    accuracyM: fix?.accuracyM ?? undefined,
  });
  const unavailableReason = storedReason(fix);
  const reason = body.reason?.trim() || null;

  try {
    if (body.kind === 'EMERGENCY') {
      const booking = await prisma.emergencySurgeryBooking.findUnique({
        where: { id: body.id },
        select: { id: true, surgeonId: true, anesthetistId: true },
      });
      if (!booking) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

      const isSurgeon = booking.surgeonId === me.id;
      const isAnaesthetist = booking.anesthetistId === me.id;
      if (!isSurgeon && !isAnaesthetist) {
        return NextResponse.json(
          { error: 'You are not named on this emergency.' },
          { status: 403 },
        );
      }

      const data = {
        userName: me.fullName ?? me.name ?? '',
        teamRole: (isSurgeon ? 'SURGEON' : 'ANAESTHETIST') as never,
        status: statusFor(answer, 'EMERGENCY') as never,
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        locationUnavailableReason: unavailableReason,
        locationTimestamp: new Date(),
        notes: reason,
        deviceLabel: body.deviceLabel?.slice(0, 120) ?? null,
        respondedAt: new Date(),
      };
      const record = await prisma.emergencyTeamAvailability.upsert({
        where: { emergencyBookingId_userId: { emergencyBookingId: booking.id, userId: me.id } },
        create: { emergencyBookingId: booking.id, userId: me.id, ...data },
        update: data,
      });
      return NextResponse.json({ success: true, kind: 'EMERGENCY', record, fix: verdict });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: body.id },
      select: { id: true, location: true, ...CASE_TEAM_SELECT },
    });
    if (!surgery) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const slot = caseTeamSlots(surgery).find((s) => s.userId === me.id);
    if (!slot) {
      return NextResponse.json(
        { error: 'You are not on the team for this case.' },
        { status: 403 },
      );
    }

    const data = {
      userName: me.fullName ?? me.name ?? null,
      roleOnCase: slot.roleOnCase,
      status: statusFor(answer, 'SURGERY') as never,
      reason,
      deviceLabel: body.deviceLabel?.slice(0, 120) ?? null,
      fixVerdict: verdict.verdict as never,
      distanceM: verdict.distanceM,
      locationUnavailableReason: unavailableReason,
      theatre: surgery.location,
      checkedInAt: new Date(),
    };
    const record = await prisma.surgeryTeamCheckIn.upsert({
      where: { surgeryId_userId: { surgeryId: surgery.id, userId: me.id } },
      create: { surgeryId: surgery.id, userId: me.id, ...data },
      update: data,
    });
    return NextResponse.json({ success: true, kind: 'SURGERY', record, fix: verdict });
  } catch (error) {
    console.error('[arrival-check-in] POST failed:', error);
    return NextResponse.json({ error: 'Could not record your answer.' }, { status: 500 });
  }
}
