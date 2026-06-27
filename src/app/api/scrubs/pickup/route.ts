import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Daily scrub pickup ledger.
 *
 * Records the exact top + pants (+ footwear) serial codes a scrub-care provider
 * hands to a staff member at the counter.
 *
 * GET  ?date=YYYY-MM-DD  -> pickups for that day (defaults to today)
 *      ?staffCode=XXX    -> recent pickups for a staff member
 * POST { staffCode, topSerial, pantsSerial, footwearSerial?, ... } -> record one
 */

function colorForRole(role?: string | null): string {
  switch (role) {
    case 'SURGEON':
      return 'GREEN';
    case 'ANAESTHETIST':
    case 'CONSULTANT_ANAESTHETIST':
      return 'BLUE';
    case 'SCRUB_NURSE':
    case 'RECOVERY_ROOM_NURSE':
      return 'MAROON';
    case 'ANAESTHETIC_TECHNICIAN':
      return 'TEAL';
    case 'PORTER':
    case 'CLEANER':
      return 'GREY';
    default:
      return 'BLACK';
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const staffCode = searchParams.get('staffCode');

    const where: any = {};
    if (staffCode) {
      where.staffCode = staffCode.trim().toUpperCase();
    } else {
      // Default: today's pickups.
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.pickedUpAt = { gte: start, lt: end };
    }

    const pickups = await prisma.scrubPickup.findMany({
      where,
      orderBy: { pickedUpAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ pickups });
  } catch (error) {
    console.error('GET /api/scrubs/pickup error:', error);
    return NextResponse.json(
      { error: 'Failed to load pickups' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const staffCode = String(body.staffCode || '').trim().toUpperCase();
    const topSerial = String(body.topSerial || '').trim().toUpperCase() || null;
    const pantsSerial =
      String(body.pantsSerial || '').trim().toUpperCase() || null;
    const footwearSerial =
      String(body.footwearSerial || '').trim().toUpperCase() || null;

    if (!staffCode) {
      return NextResponse.json(
        { error: 'Staff code is required' },
        { status: 400 },
      );
    }
    if (!topSerial && !pantsSerial) {
      return NextResponse.json(
        { error: 'Enter at least a top or pants serial code' },
        { status: 400 },
      );
    }

    // Resolve profile (sizes) + user (name/role) snapshots.
    const [profile, user] = await Promise.all([
      prisma.staffScrubProfile.findUnique({ where: { staffCode } }),
      prisma.user.findFirst({
        where: { staffCode },
        select: { fullName: true, role: true },
      }),
    ]);

    const role = profile?.role || user?.role || null;

    const pickup = await prisma.scrubPickup.create({
      data: {
        staffCode,
        fullName: profile?.fullName || user?.fullName || null,
        role,
        color: colorForRole(role),
        topSerial,
        pantsSerial,
        footwearSerial,
        topSize: profile?.topSize || profile?.scrubSize || null,
        pantsSize: profile?.pantsSize || profile?.scrubSize || null,
        footwearSize: profile?.footwearSize || null,
        pickedUpById: (session.user as any)?.id || null,
        pickedUpByName: (session.user as any)?.name || null,
      },
    });

    return NextResponse.json({ success: true, pickup });
  } catch (error) {
    console.error('POST /api/scrubs/pickup error:', error);
    return NextResponse.json(
      { error: 'Failed to record pickup' },
      { status: 500 },
    );
  }
}
