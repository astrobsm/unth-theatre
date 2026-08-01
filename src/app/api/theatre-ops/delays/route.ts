// ============================================================
// Recording a delay, and telling the department that can fix it
// ------------------------------------------------------------
// Recording a delay is the GOOD outcome — a theatre saw a problem and said so.
// The route is therefore built to make it easy and to make its consequence
// immediate: the reason is stored, the responsible departments are escalated
// to in the same transaction, and the unexplained flag is suppressed.
//
// GEOFENCE. A coordinate may be sent; it is validated against the hospital
// boundary and then DISCARDED. Only inside/outside is kept. The audit question
// is "was this person actually here?", and that is answerable without building
// a record of where everybody stood all day.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CATEGORY_BY_CODE, notifiedBy } from '@/lib/theatreOps/delays';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

/**
 * The hospital boundary. Coarse on purpose — it answers "on site or not",
 * which is all section 12 asks for, and a tight fence would reject staff in a
 * building whose GPS is poor.
 */
const GEOFENCE = {
  latitude: Number(process.env.HOSPITAL_LATITUDE ?? 6.4213),
  longitude: Number(process.env.HOSPITAL_LONGITUDE ?? 7.5248),
  radiusMetres: Number(process.env.HOSPITAL_GEOFENCE_METRES ?? 2000),
};

/** Metres between two points; enough precision for a campus boundary. */
function metresFrom(lat: number, lon: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - GEOFENCE.latitude);
  const dLon = toRad(lon - GEOFENCE.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(GEOFENCE.latitude)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Validate and DISCARD. Returns only the verdict — the coordinate itself is
 * never returned and never stored.
 */
function insideGeofence(lat?: number | null, lon?: number | null): boolean | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (lat === 0 && lon === 0) return null;
  return metresFrom(lat, lon) <= GEOFENCE.radiusMetres;
}

const CAN_RECORD = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIC_TECHNICIAN',
];

// ---------------------------------------------------------------------------
// GET — delays for a case, or the recent log
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  try {
    const records = await prisma.theatreDelayRecord.findMany({
      where: {
        ...(sp.get('surgeryId') ? { surgeryId: sp.get('surgeryId') as string } : {}),
        ...(sp.get('categoryCode') ? { categoryCode: sp.get('categoryCode') as string } : {}),
        ...(sp.get('from') || sp.get('to')
          ? {
              recordedAt: {
                ...(sp.get('from') ? { gte: new Date(sp.get('from') as string) } : {}),
                ...(sp.get('to') ? { lte: new Date(sp.get('to') as string) } : {}),
              },
            }
          : {}),
      },
      include: {
        escalations: { select: { id: true, notifiedRole: true, status: true, acknowledgedAt: true, resolvedAt: true } },
        surgery: { select: { id: true, procedureName: true, scheduledDate: true, scheduledTime: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(500, Number(sp.get('limit') ?? 200) || 200),
    });

    return NextResponse.json({
      delays: records.map((r) => ({
        ...r,
        categoryLabel: CATEGORY_BY_CODE[r.categoryCode]?.label ?? r.categoryCode,
        avoidable: CATEGORY_BY_CODE[r.categoryCode]?.avoidable ?? false,
        // How many departments have not yet responded — the number that says
        // whether telling them achieved anything.
        openEscalations: r.escalations.filter((e) => e.status === 'OPEN').length,
      })),
    });
  } catch (error) {
    console.error('[theatre-ops] delay list failed:', error);
    return NextResponse.json({ error: 'Failed to load delays' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — record a delay
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string; fullName?: string; name?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!user.role || !CAN_RECORD.includes(user.role)) {
    return NextResponse.json(
      { error: 'Your role does not allow you to record a theatre delay.' },
      { status: 403 }
    );
  }

  let body: {
    surgeryId?: string;
    categoryCode?: string;
    narrative?: string;
    minutesLateAtRecord?: number;
    photoDataUrls?: string[];
    latitude?: number;
    longitude?: number;
    theatreName?: string;
    deviceLabel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { surgeryId, categoryCode } = body;
  const narrative = body.narrative?.trim();

  if (!surgeryId || !categoryCode) {
    return NextResponse.json({ error: 'A case and a reason are required.' }, { status: 400 });
  }
  // A category with no narrative is a tick-box, and a tick-box tells the
  // department nothing they can act on.
  if (!narrative || narrative.length < 10) {
    return NextResponse.json(
      { error: 'Describe what is holding the case up, so the department can act on it (at least 10 characters).' },
      { status: 400 }
    );
  }

  const category = CATEGORY_BY_CODE[categoryCode];
  if (!category) {
    return NextResponse.json({ error: `"${categoryCode}" is not a delay category.` }, { status: 400 });
  }

  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  try {
    const surgery = await prisma.surgery.findUnique({ where: { id: surgeryId }, select: { id: true } });
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    // Validated, then discarded — only the verdict is stored.
    const withinGeofence = insideGeofence(body.latitude, body.longitude);

    const roles = notifiedBy(categoryCode);

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.theatreDelayRecord.create({
        data: {
          surgeryId,
          categoryCode,
          categoryGroup: category.group,
          narrative,
          minutesLateAtRecord: body.minutesLateAtRecord ?? null,
          reportedById: user.id,
          reportedByName: user.fullName ?? user.name ?? null,
          photoDataUrls: Array.isArray(body.photoDataUrls) ? body.photoDataUrls.slice(0, 5) : [],
          withinGeofence,
          theatreName: body.theatreName ?? null,
          deviceLabel: body.deviceLabel ?? null,
        },
      });

      // Told in the same transaction as the record. A delay that was noted but
      // whose department was never informed is the failure this module exists
      // to prevent, so the two cannot land separately.
      await tx.theatreEscalation.createMany({
        data: roles.map((role) => ({
          delayRecordId: record.id,
          surgeryId,
          notifiedRole: role,
        })),
      });

      // Recording a reason suppresses the unexplained flag. If the detector has
      // already raised one, it is withdrawn — the theatre has now explained
      // itself, and leaving the flag standing would punish them for being late
      // to document rather than for being silent.
      await tx.theatreUnexplainedDelay.updateMany({
        where: { surgeryId, reviewStatus: 'PENDING_REVIEW' },
        data: {
          reviewStatus: 'REVIEWED_SYSTEM_ISSUE',
          reviewNotes: `Withdrawn automatically: a reason was recorded (${category.label}).`,
          reviewedAt: new Date(),
        },
      });

      return record;
    });

    const payload = {
      delay: created,
      escalatedTo: roles,
      categoryLabel: category.label,
      success: true,
      message: `Recorded. ${roles.length} department${roles.length === 1 ? '' : 's'} notified.`,
    };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('[theatre-ops] delay record failed:', error);
    return NextResponse.json({ error: 'Failed to record the delay' }, { status: 500 });
  }
}
