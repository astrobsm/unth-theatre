import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/emergency-booking/assign-theatre   { bookingId, theatreId }
 *
 * One action, three meanings — which is the point, because in a real emergency
 * nobody performs three separate administrative steps:
 *
 *   1. the theatre is assigned
 *   2. the booking is ACKNOWLEDGED — somebody in theatre has seen it and owns it
 *   3. it goes out on the radio, so the team hears it rather than having to be
 *      watching a screen
 *
 * The acknowledgement is the part that was missing. A surgeon could book a
 * critical case and have no way of knowing whether theatre had noticed. Status
 * THEATRE_ASSIGNED, with a named person against it, answers that.
 */

/** Theatre-side roles. The people who can actually commit a room. */
const ASSIGN_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE_MANAGER',
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ASSIGN_ROLES.includes(user.role ?? '')) {
    return NextResponse.json(
      { error: 'Only theatre staff or the theatre manager can assign an emergency theatre.' },
      { status: 403 });
  }

  let body: {
    bookingId?: string; theatreId?: string; theatreName?: string;
    scrubNurseId?: string | null; circulatingNurseId?: string | null;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  if (!body.bookingId) {
    return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 });
  }
  if (!body.theatreId && !body.theatreName) {
    return NextResponse.json({ error: 'Choose a theatre.' }, { status: 400 });
  }

  const booking = await prisma.emergencySurgeryBooking.findUnique({
    where: { id: body.bookingId },
    select: {
      id: true, status: true, patientName: true, procedureName: true,
      surgeonName: true, surgeryId: true, priority: true,
      theatreName: true, anesthetistName: true,
    },
  });
  if (!booking) return NextResponse.json({ error: 'Emergency booking not found.' }, { status: 404 });

  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    return NextResponse.json({
      error: `This case is ${booking.status.toLowerCase()} — a theatre cannot be assigned to it.`,
    }, { status: 409 });
  }

  // Resolve the name once and store it alongside the id. The board and the radio
  // message must be readable even if the suite is later renamed or removed.
  let theatreName = body.theatreName ?? null;
  if (body.theatreId && !theatreName) {
    const suite = await prisma.theatreSuite.findUnique({
      where: { id: body.theatreId },
      select: { name: true },
    });
    if (!suite) return NextResponse.json({ error: 'Theatre not found.' }, { status: 404 });
    theatreName = suite.name;
  }

  const wasAlreadyAssigned = booking.status === 'THEATRE_ASSIGNED';

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.emergencySurgeryBooking.update({
      where: { id: booking.id },
      data: {
        theatreId: body.theatreId ?? null,
        theatreName,
        status: 'THEATRE_ASSIGNED',
        // Reusing the approval fields as the acknowledgement record: assigning a
        // theatre IS theatre accepting the case, and a second near-identical
        // pair of columns would only drift out of step with these.
        approvedById: user.id ?? null,
        approvedByName: user.name ?? null,
      },
      select: {
        id: true, status: true, theatreName: true,
        approvedByName: true, updatedAt: true,
      },
    });

    // Keep the surgery record in step, or the theatre list and the emergency
    // board disagree about where the case is happening.
    if (booking.surgeryId && body.theatreId) {
      await tx.surgery.update({
        where: { id: booking.surgeryId },
        data: {
          theatreId: body.theatreId,
          ...(body.scrubNurseId !== undefined ? { scrubNurseId: body.scrubNurseId || null } : {}),
        },
      });

      // The nursing team on TheatreAllocation, which is what the theatre
      // readiness page reads. An emergency needs this more than an elective
      // case does: the readiness screen is how the team discovers a room is
      // being turned over for a case nobody planned for.
      if (body.scrubNurseId !== undefined || body.circulatingNurseId !== undefined) {
        const existing = await tx.theatreAllocation.findFirst({
          where: { surgeryId: booking.surgeryId },
          select: { id: true },
        });
        const team = {
          theatreId: body.theatreId,
          scrubNurseId: body.scrubNurseId || null,
          circulatingNurseId: body.circulatingNurseId || null,
          surgeryType: 'EMERGENCY' as const,
        };
        if (existing) {
          await tx.theatreAllocation.update({ where: { id: existing.id }, data: team });
        } else {
          const now = new Date();
          const end = new Date(now.getTime() + 4 * 3600_000);
          await tx.theatreAllocation.create({
            data: {
              ...team,
              surgeryId: booking.surgeryId,
              allocationType: 'EMERGENCY',
              // Starts NOW, not at a session boundary. An emergency is not
              // scheduled into a slot; it takes the room from this moment.
              date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              startTime: now,
              endTime: end,
              allocatedBy: user.name ?? user.id ?? 'theatre',
            },
          });
        }
      }
    }

    // The radio. Written directly rather than by calling /api/radio/announce,
    // which would need this request's cookie forwarded and could fail
    // independently of the assignment — the assignment must not roll back
    // because an announcement did not queue.
    const critical = booking.priority === 'CRITICAL';
    // Named in the announcement, because the point of the radio is that the
    // people concerned hear it without being told individually.
    const scrubName = body.scrubNurseId
      ? (await tx.user.findUnique({
          where: { id: body.scrubNurseId }, select: { fullName: true },
        }))?.fullName ?? null
      : null;
    await tx.radioAnnouncement.create({
      data: {
        category: 'EMERGENCY',
        title: `Emergency theatre assigned — ${theatreName}`,
        // Read aloud, so it is written to be heard once and understood: room
        // first, then who and what, then who accepted it.
        message: [
          `${theatreName} has been assigned for an emergency ${booking.procedureName}.`,
          `Patient ${booking.patientName}.`,
          `Surgeon ${booking.surgeonName}.`,
          booking.anesthetistName ? `Anaesthetist ${booking.anesthetistName}.` : null,
          scrubName ? `Scrub nurse ${scrubName}.` : null,
          `Acknowledged by ${user.name ?? 'theatre'}.`,
        ].filter(Boolean).join(' '),
        priority: critical ? 100 : 90,
        urgency: critical ? 'CRITICAL' : 'HIGH',
        location: theatreName,
        triggerSource: 'AUTO',
      },
    });

    if (user.id) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: wasAlreadyAssigned ? 'EMERGENCY_THEATRE_REASSIGNED' : 'EMERGENCY_THEATRE_ASSIGNED',
          tableName: 'emergency_surgery_bookings',
          recordId: booking.id,
          changes: JSON.stringify({
            from: booking.theatreName ?? null,
            to: theatreName,
            previousStatus: booking.status,
            scrubNurseId: body.scrubNurseId ?? null,
            circulatingNurseId: body.circulatingNurseId ?? null,
            patientName: booking.patientName,
            procedureName: booking.procedureName,
          }),
        },
      });
    }

    return updated;
  });

  return NextResponse.json({
    ok: true,
    booking: result,
    announced: true,
    // Said back to the caller so the button can report what it actually did
    // rather than a generic success.
    message: wasAlreadyAssigned
      ? `Theatre changed to ${theatreName} and announced on the radio.`
      : `${theatreName} assigned, case acknowledged, and announced on the radio.`,
  });
}
