import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import { resolveSchedule, type CaseOnList, type OtherTheatre } from '@/lib/scheduling/resolve';

export const dynamic = 'force-dynamic';

/**
 * Everything needed to settle a scheduling problem without leaving the form.
 *
 * Asked BEFORE a booking is attempted, and again when one is refused. It
 * returns three things:
 *
 *   the blockers, each naming the cases actually in the way;
 *   the options, each a complete instruction — a time, a theatre, and the list
 *   of other cases that would move;
 *   the theatre's whole day, because the surgeon asked to see it and because
 *   an option is easier to judge against the list it changes.
 *
 * It CHANGES NOTHING. Applying an option is a separate, deliberate call.
 *
 * The patient's own open cases are checked here too. "This patient already has
 * an operation booked that has not happened yet" is a different problem from a
 * busy theatre and needs a different answer — usually adding the procedure to
 * the case that exists rather than booking a second one.
 */

/**
 * The case exists and has not happened yet. These are the real SurgeryStatus
 * values — everything except COMPLETED and CANCELLED.
 */
const OPEN_STATUSES = ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS'] as const;

/**
 * Cases an automatic plan may not move.
 *
 * Wider than "on the table" on purpose. A patient IN_HOLDING_AREA or
 * READY_FOR_THEATRE has been starved since midnight and sent for; moving their
 * time because somebody else wants the slot is a decision a person should make
 * deliberately, not one a booking form should make on their behalf.
 */
const IMMOVABLE_STATUSES = ['IN_PROGRESS', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE'];

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const scheduledDate = String(body.scheduledDate ?? '');
  const scheduledTime = String(body.scheduledTime ?? '');
  const estimatedDuration = Number(body.estimatedDuration) || 60;
  const theatreId = body.theatreId ? String(body.theatreId) : null;
  const unit = body.unit ? String(body.unit) : null;
  const patientId = body.patientId ? String(body.patientId) : null;
  /** The case being rescheduled, excluded from its own conflict check. */
  const ignoreId = body.ignoreId ? String(body.ignoreId) : null;

  const day = new Date(scheduledDate);
  if (Number.isNaN(day.getTime())) {
    return NextResponse.json({ error: 'A date is needed before the list can be checked.' }, { status: 400 });
  }
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

  // ---- Everything on that day, across every theatre ----------------------
  // One query rather than one per room: the alternatives are worth offering,
  // and the whole day in this hospital is a few dozen rows.
  const sameDay = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
    },
    select: {
      id: true, scheduledTime: true, estimatedDuration: true, theatreId: true,
      location: true, unit: true, procedureName: true, surgeonName: true, status: true,
      patient: { select: { name: true, folderNumber: true } },
    },
    orderBy: { scheduledTime: 'asc' },
  });

  const toCase = (s: (typeof sameDay)[number]): CaseOnList => ({
    id: s.id,
    scheduledTime: s.scheduledTime,
    estimatedDuration: s.estimatedDuration || 60,
    patientName: s.patient?.name ?? null,
    procedureName: s.procedureName,
    surgeonName: s.surgeonName,
    theatreId: s.theatreId,
    status: s.status,
    immovable: IMMOVABLE_STATUSES.includes(String(s.status).toUpperCase()),
  });

  // The room being booked. Where no theatre is chosen the unit stands in for
  // one, because a unit cannot run two cases at once either — the same rule the
  // booking endpoint already applies.
  const inScope = sameDay.filter((s) =>
    theatreId ? s.theatreId === theatreId : unit ? s.unit === unit : false);

  const theatres = await prisma.theatreSuite.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  }).catch(() => [] as { id: string; name: string }[]);

  const theatreName = theatres.find((t) => t.id === theatreId)?.name
    ?? (theatreId ? 'This theatre' : unit ?? 'This unit');

  const otherTheatres: OtherTheatre[] = theatres
    .filter((t) => t.id !== theatreId)
    .map((t) => ({
      theatreId: t.id,
      theatreName: t.name,
      cases: sameDay.filter((s) => s.theatreId === t.id).map(toCase),
    }));

  const resolution = resolveSchedule(
    { scheduledTime, estimatedDuration, theatreId, theatreName, ignoreId },
    inScope.map(toCase),
    { otherTheatres },
  );

  // ---- The patient's own unfinished business -----------------------------
  // Deliberately NOT limited to the day being booked. A patient with a case
  // still open from last Tuesday is the situation the surgeon described: the
  // operation has not happened, and a second booking makes two lists expecting
  // the same person.
  let patientCases: Array<Record<string, unknown>> = [];
  if (patientId) {
    const open = await prisma.surgery.findMany({
      where: {
        patientId,
        status: { in: [...OPEN_STATUSES] },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: {
        id: true, scheduledDate: true, scheduledTime: true, procedureName: true,
        status: true, theatreId: true, location: true, unit: true,
        surgeonName: true, readinessStatus: true, bookedByName: true,
      },
      orderBy: { scheduledDate: 'asc' },
      take: 10,
    });
    patientCases = open.map((s) => ({
      ...s,
      sameDay: s.scheduledDate >= dayStart && s.scheduledDate <= dayEnd,
      inThePast: s.scheduledDate < dayStart,
    }));
  }

  return NextResponse.json({
    ...resolution,
    theatreName,
    patientCases,
    // A booking is only clear when the room AND the patient are clear.
    clear: resolution.ok && patientCases.length === 0,
  });
}
