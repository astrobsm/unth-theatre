import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * The perimeter presence is measured against.
 *
 * A row rather than a constant, because the boundary has to be set once by
 * somebody standing at the hospital and adjusted when the estate changes —
 * neither of which should need a deployment. Until it is set, every presence
 * check answers "cannot say", which is the correct answer and is reported as
 * such rather than as absence.
 */

const MAY_SET = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'WORKS_SUPERVISOR', 'CHIEF_MEDICAL_DIRECTOR',
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fence = await prisma.facilityGeofence.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({
      geofence: fence,
      canSet: MAY_SET.includes((session.user.role ?? '').toUpperCase()),
    });
  } catch (error) {
    return apiError('presence/geofence GET', error);
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_SET.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'The facility perimeter is set by theatre management, works or an administrator.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radiusMetres = Math.round(Number(body.radiusMetres ?? 400));
    const name = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : 'Hospital perimeter';

    const valid = Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      && !(latitude === 0 && longitude === 0);

    if (!valid) {
      return NextResponse.json({
        // 0,0 is the Gulf of Guinea and is what a failed fix reports. Accepting
        // it would put the perimeter in the sea and mark the whole hospital as
        // off site.
        error: 'That is not a usable position. Stand at the hospital and use "Use where I am now", or type the coordinates from a map.',
      }, { status: 400 });
    }

    if (!Number.isFinite(radiusMetres) || radiusMetres < 50 || radiusMetres > 5000) {
      return NextResponse.json({
        error: 'The radius must be between 50 m and 5 km. Drawn too tightly it reports the staff room as off site; drawn too widely it reports nothing at all.',
      }, { status: 400 });
    }

    // One active perimeter. Two would have the nodes disagreeing about who is
    // on site, which is worse than having none.
    await prisma.facilityGeofence.updateMany({
      where: { active: true },
      data: { active: false },
    });

    const fence = await prisma.facilityGeofence.create({
      data: { name, latitude, longitude, radiusMetres, active: true, createdById: session.user.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'FACILITY_PERIMETER_SET',
        tableName: 'facility_geofences',
        recordId: fence.id,
        changes: JSON.stringify({ name, latitude, longitude, radiusMetres }),
      },
    }).catch(() => { /* the perimeter stands even if the log does not */ });

    return NextResponse.json({ geofence: fence });
  } catch (error) {
    return apiError('presence/geofence POST', error);
  }
}
