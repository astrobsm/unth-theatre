import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { capturesLocation, isAvailabilityStatus } from '@/lib/staffAvailability';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

// GET /api/staff/availability[?role=&status=&q=]
// The live workforce board — approved staff with their current availability.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const role = sp.get('role')?.trim();
  const status = sp.get('status')?.trim();
  const q = sp.get('q')?.trim();

  const where: any = { status: 'APPROVED' };
  if (role) where.role = role;
  if (status) where.availabilityStatus = status;
  if (q) where.fullName = { contains: q, mode: 'insensitive' };

  const staff = await prisma.user.findMany({
    where,
    select: {
      id: true, fullName: true, role: true, department: true, staffId: true,
      phoneNumber: true, extension: true,
      availabilityStatus: true, availabilityNote: true, currentLocation: true, availabilityUpdatedAt: true,
      // The geo snapshot. Returned so the board can say how far away somebody
      // is and how much that is still worth, rather than only where they typed.
      currentLatitude: true, currentLongitude: true, locationAccuracyM: true,
      locationCapturedAt: true, locationSource: true,
    },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    take: 1000,
  });

  const viewerId = (session.user as any).id;
  const viewerRole = (session.user as any).role;

  // WHO MAY SEE A POSITION.
  //
  // Knowing a colleague is available is one thing; knowing exactly where they
  // are standing is another, and the whole hospital does not need it. So
  // coordinates go only to the offices that coordinate work — managers,
  // administrators and the chairman — plus each person for their own record,
  // since they published it and are entitled to see what was stored.
  //
  // Stripped on the SERVER, not hidden in the UI: a field that reaches the
  // browser has been disclosed, whatever the screen chooses to draw.
  const maySeePositions = ADMIN_ROLES.includes(viewerRole);

  const visible = staff.map((s) =>
    maySeePositions || s.id === viewerId
      ? s
      : {
          ...s,
          // The free-text place ("Theatre 3") is deliberately KEPT. It is what
          // the staff member chose to publish in words, and it is what makes
          // the board useful to everybody without disclosing a coordinate.
          currentLatitude: null,
          currentLongitude: null,
          locationAccuracyM: null,
          locationCapturedAt: null,
          locationSource: null,
        }
  );

  return NextResponse.json({
    staff: visible,
    me: viewerId,
    // So the board can explain the absence rather than looking broken.
    canSeePositions: maySeePositions,
  });
}

const setSchema = z.object({
  status: z.string().refine(isAvailabilityStatus, 'Invalid status'),
  note: z.string().nullish(),
  currentLocation: z.string().nullish(),
  userId: z.string().nullish(), // admins may set another user's status

  // The position, when the browser gave one. Optional throughout: sharing a
  // location is a choice, and refusing must never stop somebody publishing that
  // they are available.
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  accuracyM: z.number().min(0).max(100_000).nullish(),
  locationSource: z.enum(['GPS', 'NETWORK', 'MANUAL']).nullish(),
  // When the DEVICE took the fix. A ping queued offline reaches the server much
  // later, and stamping it with arrival time would make a stale position look
  // fresh — which is exactly the mistake that gets the wrong person called.
  capturedAt: z.string().datetime().nullish(),
});

// POST /api/staff/availability — set MY availability (or, for admins, someone else's).
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = setSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const myId = (session.user as any).id;
  const myRole = (session.user as any).role;
  const targetId = d.userId && d.userId !== myId ? d.userId : myId;
  if (targetId !== myId && !ADMIN_ROLES.includes(myRole)) {
    return NextResponse.json({ error: 'Only an admin/theatre manager can set another staff member’s status' }, { status: 403 });
  }

  // A position is only ever recorded for the person who published it. An admin
  // setting somebody else's status must not be able to attach a location to
  // them — that would be asserting where another person is.
  const settingOwnStatus = targetId === myId;

  // Only an ON-DUTY status may carry a position. Somebody marking themselves
  // Off Duty or On Leave is saying they have gone home, and recording where
  // home is answers no operational question — it is tracking them in their own
  // time. Enforced HERE rather than in the UI, so it holds however the request
  // arrives.
  const statusAllowsLocation = capturesLocation(d.status);

  const hasFix =
    settingOwnStatus &&
    statusAllowsLocation &&
    typeof d.latitude === 'number' &&
    typeof d.longitude === 'number' &&
    // 0,0 is a failed fix, not a staff member in the Gulf of Guinea.
    !(d.latitude === 0 && d.longitude === 0);

  const capturedAt = d.capturedAt ? new Date(d.capturedAt) : new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: {
        availabilityStatus: d.status,
        availabilityNote: d.note ?? null,
        currentLocation: d.currentLocation ?? null,
        availabilityUpdatedAt: new Date(),
        // Overwritten when a fix came with this update; CLEARED when the new
        // status means the person has gone off duty; otherwise left alone —
        // and because the timestamp is left alone too, the board can see that
        // the position is older than the status.
        ...(hasFix
          ? {
              currentLatitude: d.latitude,
              currentLongitude: d.longitude,
              locationAccuracyM: d.accuracyM ?? null,
              locationCapturedAt: capturedAt,
              locationSource: (d.locationSource ?? 'GPS') as never,
            }
          : !statusAllowsLocation
            ? {
                // Somebody who has gone home must not still appear on a map at
                // the spot where they were standing when they left.
                currentLatitude: null,
                currentLongitude: null,
                locationAccuracyM: null,
                locationCapturedAt: null,
                locationSource: null,
              }
            : {}),
      },
    });

    // The trail. Written for every publication, with or without a fix, because
    // "they said they were available at 09:40 and gave no location" is itself
    // worth knowing.
    if (settingOwnStatus) {
      await tx.staffLocationPing.create({
        data: {
          userId: targetId,
          status: d.status,
          locationLabel: d.currentLocation ?? null,
          note: d.note ?? null,
          latitude: hasFix ? d.latitude : null,
          longitude: hasFix ? d.longitude : null,
          accuracyM: hasFix ? (d.accuracyM ?? null) : null,
          source: (hasFix ? (d.locationSource ?? 'GPS') : 'MANUAL') as never,
          capturedAt,
        },
      });
    }
  });

  return NextResponse.json({ ok: true, locationRecorded: hasFix });
}
