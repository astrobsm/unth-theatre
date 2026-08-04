// ============================================================
// Milestone capture
// ------------------------------------------------------------
// GET  — today's cases with what has been recorded so far.
// POST — record one milestone, in one tap.
//
// This exists because recording a milestone previously meant navigating to a
// particular surgery's page and finding the right control. Two movements were
// recorded in fourteen days. Everything downstream — punctuality, turnover,
// the delay detector, whether a case can ever be marked finished — depends on
// timestamps nobody had a practical way to enter.
//
// Nothing here is new data: it writes the same PatientMovement rows the rest
// of the app already reads. No migration, no second timeline.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { scheduledInstant } from '@/lib/theatreOps/clock';
import {
  captureOrder,
  caseState,
  checkBackdate,
  checkSequence,
  isPhase,
  isRecorded,
  missedPhases,
  nextPhase,
  recordCompleteness,
  type Phase,
} from '@/lib/theatreOps/milestones';

export const dynamic = 'force-dynamic';

/**
 * Anyone in the room may record what they saw.
 *
 * Deliberately wide. A milestone recorded by the circulating nurse is worth
 * more than one nobody could enter because the scrub nurse was scrubbed — and
 * the record names who entered it either way.
 */
const CAN_RECORD = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIC_TECHNICIAN',
  'HOUSE_OFFICER', 'PORTER',
];

// ---------------------------------------------------------------------------
// GET — today's cases and where each one has reached
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const dayStart = sp.get('date') ? new Date(`${sp.get('date')}T00:00:00.000Z`) : new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const theatre = sp.get('theatre');

  try {
    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['CANCELLED'] },
        ...(theatre && theatre !== 'all' ? { location: theatre } : {}),
      },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        status: true,
        surgeryType: true,
        unit: true,
        location: true,
        surgeonName: true,
        patient: { select: { name: true, folderNumber: true } },
        movements: { select: { phase: true, timestamp: true, recordedBy: true } },
      },
      orderBy: { scheduledTime: 'asc' },
      take: 100,
    });

    const cases = surgeries.map((s) => {
      const recorded = s.movements
        .filter((m) => isPhase(m.phase))
        .map((m) => ({ phase: m.phase as Phase, timestamp: m.timestamp }));

      return {
        id: s.id,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        scheduledStart: scheduledInstant(s.scheduledDate, s.scheduledTime),
        theatre: s.location,
        unit: s.unit,
        surgeonName: s.surgeonName,
        surgeryType: s.surgeryType,
        patientName: s.patient?.name ?? null,
        folderNumber: s.patient?.folderNumber ?? null,
        recorded: recorded
          .slice()
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
        next: nextPhase(recorded),
        missed: missedPhases(recorded),
        state: caseState(recorded),
        completeness: recordCompleteness(recorded),
      };
    });

    const theatres = Array.from(
      new Set(surgeries.map((s) => s.location).filter((x): x is string => !!x))
    ).sort();

    return NextResponse.json({
      date: dayStart.toISOString().slice(0, 10),
      theatres,
      cases: captureOrder(cases),
    });
  } catch (error) {
    console.error('[theatre-ops] milestone list failed:', error);
    return NextResponse.json({ error: 'Failed to load the list' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — record one milestone
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; role?: string; fullName?: string; name?: string } | undefined;
  if (!me?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!me.role || !CAN_RECORD.includes(me.role)) {
    return NextResponse.json(
      { error: 'Milestones are recorded by the theatre team.' },
      { status: 403 }
    );
  }

  let body: { surgeryId?: string; phase?: string; at?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.surgeryId || !isPhase(body.phase)) {
    return NextResponse.json({ error: 'A case and a milestone are required.' }, { status: 400 });
  }
  const phase = body.phase;

  // Default to now — the whole point is a single tap at the moment it happens.
  const when = body.at ? new Date(body.at) : new Date();
  const backdate = checkBackdate(when);
  if (!backdate.ok) return NextResponse.json({ error: backdate.error }, { status: 400 });

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: body.surgeryId },
      select: {
        id: true,
        status: true,
        movements: { select: { phase: true, timestamp: true } },
      },
    });
    if (!surgery) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const recorded = surgery.movements
      .filter((m) => isPhase(m.phase))
      .map((m) => ({ phase: m.phase as Phase, timestamp: m.timestamp }));

    // Already recorded: succeed quietly rather than creating a second row.
    // A nurse who taps twice because the first tap was not obviously received
    // must not end up with two knife-to-skin times.
    if (isRecorded(recorded, phase)) {
      return NextResponse.json({ alreadyRecorded: true, phase, success: true });
    }

    const sequence = checkSequence(recorded, phase, when);
    if (!sequence.ok) return NextResponse.json({ error: sequence.error }, { status: 400 });

    await prisma.patientMovement.create({
      data: {
        surgeryId: surgery.id,
        phase: phase as never,
        timestamp: when,
        recordedBy: me.fullName ?? me.name ?? me.id,
        notes: body.notes?.trim() || null,
      },
    });

    // Keep the surgery's own status in step with what the theatre reports, so
    // the rest of the app agrees with the timeline. Only ever forwards.
    const statusFor: Partial<Record<Phase, string>> = {
      INSIDE_THEATRE: 'IN_PROGRESS',
      SURGERY_STARTED: 'IN_PROGRESS',
      RECOVERY_ROOM: 'COMPLETED',
    };
    const nextStatus = statusFor[phase];
    if (nextStatus && surgery.status !== 'COMPLETED' && surgery.status !== nextStatus) {
      await prisma.surgery
        .update({ where: { id: surgery.id }, data: { status: nextStatus as never } })
        .catch(() => { /* the milestone is what matters */ });
    }

    const now = [...recorded, { phase, timestamp: when }];
    return NextResponse.json({
      success: true,
      phase,
      at: when,
      next: nextPhase(now),
      state: caseState(now),
      completeness: recordCompleteness(now),
    });
  } catch (error) {
    console.error('[theatre-ops] milestone record failed:', error);
    return NextResponse.json({ error: 'Failed to record the milestone' }, { status: 500 });
  }
}
