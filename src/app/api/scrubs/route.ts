import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Scrub inventory endpoint.
 *
 * GET  -> scrub sets (optionally filtered by owner/status/color) + summary
 *         stats and the list of theatre staff who can be allocated sets.
 * POST -> register a new color-coded, serial-numbered scrub set and (optionally)
 *         allocate it to an owner.
 */

// Default scrub colour for a staff role. Surgeons → green, anaesthetists →
// blue, nurses → maroon, technicians → teal, support → grey, everyone else
// → black. Used as a hint when registering sets.
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

// Roles that wear scrubs and can therefore be allocated sets.
const SCRUB_WEARING_ROLES = [
  'SURGEON',
  'ANAESTHETIST',
  'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
  'ANAESTHETIC_TECHNICIAN',
  'THEATRE_STORE_KEEPER',
  'PORTER',
  'CLEANER',
];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('ownerId');
    const status = searchParams.get('status');
    const color = searchParams.get('color');

    const where: any = {};
    if (ownerId) where.ownerId = ownerId;
    if (status) where.status = status;
    if (color) where.color = color;

    const [sets, staff, allSets] = await Promise.all([
      prisma.scrubSet.findMany({
        where,
        orderBy: [{ color: 'asc' }, { serialNumber: 'asc' }],
      }),
      prisma.user.findMany({
        where: { role: { in: SCRUB_WEARING_ROLES as any } },
        select: { id: true, fullName: true, role: true, staffCode: true },
        orderBy: { fullName: 'asc' },
      }),
      prisma.scrubSet.findMany({ select: { status: true, color: true } }),
    ]);

    const stats = {
      total: allSets.length,
      inUse: allSets.filter((s) => s.status === 'IN_USE').length,
      inCleaning: allSets.filter((s) => s.status === 'IN_CLEANING').length,
      reserve: allSets.filter((s) => s.status === 'RESERVE').length,
      available: allSets.filter((s) => s.status === 'AVAILABLE').length,
      missing: allSets.filter((s) => s.status === 'MISSING').length,
      retired: allSets.filter((s) => s.status === 'RETIRED').length,
    };

    return NextResponse.json({ sets, staff, stats });
  } catch (error) {
    console.error('GET /api/scrubs error:', error);
    return NextResponse.json(
      { error: 'Failed to load scrub inventory' },
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
    const serialNumber = (body.serialNumber || '').trim();
    if (!serialNumber) {
      return NextResponse.json(
        { error: 'Serial number is required' },
        { status: 400 },
      );
    }

    const existing = await prisma.scrubSet.findUnique({
      where: { serialNumber },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Serial number "${serialNumber}" already exists` },
        { status: 409 },
      );
    }

    let ownerName: string | null = null;
    let ownerRole: string | null = null;
    if (body.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: body.ownerId },
        select: { fullName: true, role: true },
      });
      if (owner) {
        ownerName = owner.fullName;
        ownerRole = owner.role;
      }
    }

    const color =
      body.color || colorForRole(ownerRole) || 'BLACK';

    const garment = ['TOP', 'PANTS', 'SET'].includes(body.garment)
      ? body.garment
      : 'SET';

    const set = await prisma.scrubSet.create({
      data: {
        serialNumber,
        garment,
        color,
        size: body.size || 'M',
        status: body.ownerId ? 'RESERVE' : 'AVAILABLE',
        ownerId: body.ownerId || null,
        ownerName,
        ownerRole,
      },
    });

    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    console.error('POST /api/scrubs error:', error);
    return NextResponse.json(
      { error: 'Failed to register scrub set' },
      { status: 500 },
    );
  }
}
