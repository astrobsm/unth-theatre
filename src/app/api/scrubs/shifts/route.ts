import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Laundry shift roster.
 *
 * Staffing guidance: a busy morning shift carries ~4–5 laundry staff to serve
 * ~300 theatre staff, while the lighter night shift carries ~2. One manager
 * oversees both. This endpoint stores the per-day MORNING / NIGHT assignments
 * and surfaces the available laundry workforce.
 *
 * GET  -> shifts for a date (+ default staffing targets + laundry staff list).
 * POST -> upsert a shift assignment for a date/shift type.
 */

const TARGETS: Record<string, number> = { MORNING: 5, NIGHT: 2 };
const THEATRE_STAFF_SERVED = 300;
const LAUNDRY_ROLES = ['LAUNDRY_STAFF', 'LAUNDRY_SUPERVISOR'];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const d = dateParam ? new Date(dateParam) : new Date();
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    const [shifts, staff] = await Promise.all([
      prisma.scrubShift.findMany({
        where: { shiftDate: { gte: start, lte: end } },
        orderBy: { shiftType: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: { in: LAUNDRY_ROLES as any } },
        select: { id: true, fullName: true, role: true, staffCode: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    return NextResponse.json({
      shifts,
      staff,
      targets: TARGETS,
      theatreStaffServed: THEATRE_STAFF_SERVED,
    });
  } catch (error) {
    console.error('GET /api/scrubs/shifts error:', error);
    return NextResponse.json(
      { error: 'Failed to load shifts' },
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
    const shiftType = (body.shiftType || 'MORNING') as 'MORNING' | 'NIGHT';
    const d = body.date ? new Date(body.date) : new Date();
    const shiftDate = new Date(d);
    shiftDate.setHours(0, 0, 0, 0);

    const staffIds: string[] = Array.isArray(body.staffIds) ? body.staffIds : [];
    // Resolve names for the chosen staff.
    let staffNames: string[] = [];
    if (staffIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, fullName: true },
      });
      const byId: Record<string, string> = {};
      for (const u of users) byId[u.id] = u.fullName;
      staffNames = staffIds.map((id) => byId[id]).filter(Boolean);
    }

    let managerName: string | null = body.managerName || null;
    if (body.managerId) {
      const mgr = await prisma.user.findUnique({
        where: { id: body.managerId },
        select: { fullName: true },
      });
      managerName = mgr?.fullName || managerName;
    }

    const data = {
      managerId: body.managerId || null,
      managerName,
      staffIds: JSON.stringify(staffIds),
      staffNames: JSON.stringify(staffNames),
      targetStaffCount: TARGETS[shiftType] ?? 0,
      theatreStaffServed: THEATRE_STAFF_SERVED,
      notes: body.notes || null,
    };

    const shift = await prisma.scrubShift.upsert({
      where: { shiftDate_shiftType: { shiftDate, shiftType: shiftType as any } },
      create: { shiftDate, shiftType: shiftType as any, ...data },
      update: data,
    });

    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    console.error('POST /api/scrubs/shifts error:', error);
    return NextResponse.json(
      { error: 'Failed to save shift' },
      { status: 500 },
    );
  }
}
