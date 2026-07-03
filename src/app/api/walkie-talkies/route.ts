import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const CAMPUS_LOCATION = 'UNTH Ituku-Ozalla (Enugu–Port Harcourt Expressway)';

// GET /api/walkie-talkies?status=OUT|RETURNED|ALL
// Returns radio pickup/return logs (most recent first) plus the staff (porters
// & cleaners) available for the pickup dropdown.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    const [logs, staff] = await Promise.all([
      prisma.walkieTalkieLog.findMany({
        where,
        orderBy: [{ status: 'asc' }, { pickupAt: 'desc' }],
        take: 300,
      }),
      prisma.user.findMany({
        where: { role: { in: ['PORTER', 'CLEANER'] }, status: 'APPROVED' },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    // Serials currently out (so the UI can prevent double pickup).
    const out = await prisma.walkieTalkieLog.findMany({
      where: { status: 'OUT' },
      select: { deviceSerial: true },
    });

    return NextResponse.json({
      logs,
      staff,
      serialsOut: out.map((o) => o.deviceSerial),
      location: CAMPUS_LOCATION,
    });
  } catch (error) {
    console.error('Walkie-talkie GET error:', error);
    return NextResponse.json({ error: 'Failed to load radio logs' }, { status: 500 });
  }
}

// POST /api/walkie-talkies  → record a pickup.
// Body: { deviceSerial, staffId?, staffName?, notes? }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const deviceSerial = String(body.deviceSerial || '').trim().toUpperCase();
    if (!deviceSerial) {
      return NextResponse.json({ error: 'A radio serial number is required' }, { status: 400 });
    }

    // Resolve the staff member (porter/cleaner).
    let staffName = String(body.staffName || '').trim();
    let staffRole: string | null = null;
    const staffId = body.staffId ? String(body.staffId) : null;
    if (staffId) {
      const staff = await prisma.user.findUnique({
        where: { id: staffId },
        select: { fullName: true, role: true },
      });
      if (!staff) return NextResponse.json({ error: 'Selected staff not found' }, { status: 404 });
      staffName = staff.fullName;
      staffRole = staff.role;
    }
    if (!staffName) {
      return NextResponse.json({ error: 'Select the porter/cleaner picking up the radio' }, { status: 400 });
    }

    // Reject if this radio is already out.
    const alreadyOut = await prisma.walkieTalkieLog.findFirst({
      where: { deviceSerial, status: 'OUT' },
      select: { id: true, staffName: true },
    });
    if (alreadyOut) {
      return NextResponse.json(
        { error: `Radio ${deviceSerial} is already out with ${alreadyOut.staffName}. It must be returned first.` },
        { status: 400 }
      );
    }

    const log = await prisma.walkieTalkieLog.create({
      data: {
        deviceSerial,
        staffId,
        staffName,
        staffRole,
        location: CAMPUS_LOCATION,
        status: 'OUT',
        pickupAt: new Date(),
        pickupById: (session.user as any).id || null,
        notes: body.notes ? String(body.notes).slice(0, 500) : null,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error('Walkie-talkie POST error:', error);
    return NextResponse.json({ error: 'Failed to record pickup' }, { status: 500 });
  }
}

// PATCH /api/walkie-talkies  → record a return.
// Body: { id } or { deviceSerial }
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    let target: { id: string } | null = null;
    if (body.id) {
      target = { id: String(body.id) };
    } else if (body.deviceSerial) {
      const open = await prisma.walkieTalkieLog.findFirst({
        where: { deviceSerial: String(body.deviceSerial).trim().toUpperCase(), status: 'OUT' },
        select: { id: true },
      });
      if (open) target = { id: open.id };
    }
    if (!target) {
      return NextResponse.json({ error: 'No outstanding pickup found to return' }, { status: 404 });
    }

    const existing = await prisma.walkieTalkieLog.findUnique({ where: target });
    if (!existing) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (existing.status === 'RETURNED') {
      return NextResponse.json({ error: 'This radio has already been returned' }, { status: 400 });
    }

    const log = await prisma.walkieTalkieLog.update({
      where: target,
      data: {
        status: 'RETURNED',
        returnAt: new Date(),
        returnById: (session.user as any).id || null,
      },
    });

    return NextResponse.json(log);
  } catch (error) {
    console.error('Walkie-talkie PATCH error:', error);
    return NextResponse.json({ error: 'Failed to record return' }, { status: 500 });
  }
}
