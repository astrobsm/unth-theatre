// ============================================================
// Multidisciplinary team check-in
// ------------------------------------------------------------
// GET  — today's cases with their team and who has answered.
// POST — my answer for a case.
//
// Two rules worth stating because both were deliberate:
//
// A person may only check IN FOR THEMSELVES. There is no userId in the request
// body; it comes from the session. Attendance somebody else recorded on your
// behalf is not attendance, and the moment one person can mark another
// present, the record stops meaning anything.
//
// The position is checked and thrown away. The request may carry a fix; what
// is stored is the verdict and a coarse distance. See lib/theatreOps/geofence.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { scheduledInstant } from '@/lib/theatreOps/clock';
import { assessFix } from '@/lib/theatreOps/geofence';
import {
  isCheckInStatus,
  readiness,
  requiresReason,
  requiresReplacement,
  summarise,
  type CheckInStatus,
  type TeamMemberState,
} from '@/lib/theatreOps/checkIn';

export const dynamic = 'force-dynamic';

/** The named slots on a case, in the order a theatre would read them. */
function slotsOf(s: {
  surgeonId: string | null; surgeonName: string | null; surgeon: { fullName: string } | null;
  assistantSurgeonId: string | null; assistantSurgeon: { fullName: string } | null;
  anesthetistId: string | null; anesthetist: { fullName: string } | null;
  scrubNurseId: string | null; theatreTechnicianId: string | null;
  supervisingConsultantId: string | null; supervisingConsultantName: string | null;
  teamMembers: { userId: string | null; memberName: string | null; role: string }[];
}): { userId: string; name: string | null; roleOnCase: string }[] {
  const raw = [
    { userId: s.surgeonId, name: s.surgeon?.fullName ?? s.surgeonName, roleOnCase: 'Surgeon' },
    { userId: s.assistantSurgeonId, name: s.assistantSurgeon?.fullName ?? null, roleOnCase: 'Assistant Surgeon' },
    { userId: s.anesthetistId, name: s.anesthetist?.fullName ?? null, roleOnCase: 'Anaesthetist' },
    { userId: s.scrubNurseId, name: null, roleOnCase: 'Scrub Nurse' },
    { userId: s.theatreTechnicianId, name: null, roleOnCase: 'Anaesthetic Technician' },
    { userId: s.supervisingConsultantId, name: s.supervisingConsultantName, roleOnCase: 'Supervising Consultant' },
    ...s.teamMembers.map((m) => ({
      userId: m.userId,
      name: m.memberName,
      roleOnCase: m.role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    })),
  ];

  const seen = new Set<string>();
  const out: { userId: string; name: string | null; roleOnCase: string }[] = [];
  for (const r of raw) {
    if (!r.userId || seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push({ userId: r.userId, name: r.name ?? null, roleOnCase: r.roleOnCase });
  }
  return out;
}

const CASE_SELECT = {
  id: true,
  procedureName: true,
  scheduledDate: true,
  scheduledTime: true,
  status: true,
  surgeryType: true,
  unit: true,
  location: true,
  surgeonId: true,
  surgeonName: true,
  assistantSurgeonId: true,
  anesthetistId: true,
  scrubNurseId: true,
  theatreTechnicianId: true,
  supervisingConsultantId: true,
  supervisingConsultantName: true,
  surgeon: { select: { fullName: true } },
  assistantSurgeon: { select: { fullName: true } },
  anesthetist: { select: { fullName: true } },
  teamMembers: { select: { userId: true, memberName: true, role: true } },
  patient: { select: { name: true, ward: true } },
  teamCheckIns: {
    select: {
      userId: true, userName: true, roleOnCase: true, status: true, reason: true,
      replacementName: true, fixVerdict: true, distanceM: true, etaMinutes: true,
      deviceLabel: true, checkedInAt: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// GET — the day's cases and where each team stands
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string } | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const dayStart = sp.get('date') ? new Date(`${sp.get('date')}T00:00:00.000Z`) : new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

  try {
    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['CANCELLED'] },
      },
      select: CASE_SELECT,
      orderBy: { scheduledTime: 'asc' },
      take: 100,
    });

    const cases = surgeries.map((s) => {
      const slots = slotsOf(s);
      const byUser = new Map(s.teamCheckIns.map((c) => [c.userId, c]));

      const team = slots.map((slot) => {
        const c = byUser.get(slot.userId);
        return {
          ...slot,
          status: (c?.status as CheckInStatus | undefined) ?? null,
          reason: c?.reason ?? null,
          replacementName: c?.replacementName ?? null,
          fixVerdict: c?.fixVerdict ?? null,
          distanceM: c?.distanceM ?? null,
          etaMinutes: c?.etaMinutes ?? null,
          checkedInAt: c?.checkedInAt ?? null,
          isMe: slot.userId === me.id,
        };
      });

      const state: TeamMemberState[] = team.map((t) => ({
        userId: t.userId,
        name: t.name,
        roleOnCase: t.roleOnCase,
        status: t.status,
      }));
      const r = readiness(state);

      return {
        id: s.id,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        scheduledStart: scheduledInstant(s.scheduledDate, s.scheduledTime),
        status: s.status,
        surgeryType: s.surgeryType,
        unit: s.unit,
        theatre: s.location,
        patientName: s.patient?.name ?? null,
        ward: s.patient?.ward ?? null,
        team,
        readiness: r,
        summary: summarise(r),
        // The one thing a person opening this page wants to know.
        myRole: team.find((t) => t.isMe)?.roleOnCase ?? null,
        myStatus: team.find((t) => t.isMe)?.status ?? null,
      };
    });

    return NextResponse.json({
      date: dayStart.toISOString().slice(0, 10),
      cases,
      mine: cases.filter((c) => c.myRole),
    });
  } catch (error) {
    console.error('[theatre-ops] check-in board failed:', error);
    return NextResponse.json({ error: 'Failed to load the check-in board' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — my answer
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; fullName?: string; name?: string } | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  let body: {
    surgeryId?: string;
    status?: string;
    reason?: string;
    replacementName?: string;
    etaMinutes?: number;
    deviceLabel?: string;
    latitude?: number;
    longitude?: number;
    accuracyM?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.surgeryId || !isCheckInStatus(body.status)) {
    return NextResponse.json({ error: 'A case and a status are required.' }, { status: 400 });
  }
  const status = body.status;

  const reason = body.reason?.trim() || null;
  if (requiresReason(status) && (!reason || reason.length < 3)) {
    return NextResponse.json(
      { error: 'Say briefly why — "delayed" with no reason reads the same as no answer at all.' },
      { status: 400 }
    );
  }
  const replacementName = body.replacementName?.trim() || null;
  if (requiresReplacement(status) && !replacementName) {
    return NextResponse.json({ error: 'Name who is covering the case instead.' }, { status: 400 });
  }

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: body.surgeryId },
      select: CASE_SELECT,
    });
    if (!surgery) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    // Only someone assigned to the case may check in for it. Not a security
    // measure so much as a correctness one: a check-in from someone who is not
    // on the team tells a coordinator nothing and clutters the board.
    const slot = slotsOf(surgery).find((s) => s.userId === me.id);
    if (!slot) {
      return NextResponse.json(
        { error: 'You are not on the team for this case.' },
        { status: 403 }
      );
    }

    // Checked, then discarded. The stored answer is a verdict and a radius.
    const fix = assessFix({
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyM: body.accuracyM,
    });

    const data = {
      userName: me.fullName ?? me.name ?? null,
      roleOnCase: slot.roleOnCase,
      status,
      reason,
      replacementName,
      etaMinutes: status === 'EN_ROUTE' && typeof body.etaMinutes === 'number' ? body.etaMinutes : null,
      deviceLabel: body.deviceLabel?.slice(0, 120) ?? null,
      fixVerdict: fix.verdict,
      distanceM: fix.distanceM,
      theatre: surgery.location,
      checkedInAt: new Date(),
    };

    const record = await prisma.surgeryTeamCheckIn.upsert({
      where: { surgeryId_userId: { surgeryId: surgery.id, userId: me.id } },
      create: { surgeryId: surgery.id, userId: me.id, ...data },
      update: data,
    });

    return NextResponse.json({ checkIn: record, fix, success: true });
  } catch (error) {
    console.error('[theatre-ops] check-in failed:', error);
    return NextResponse.json({ error: 'Failed to record your check-in' }, { status: 500 });
  }
}
