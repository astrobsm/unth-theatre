import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Roles allowed to change the order a unit's cases are listed in.
const ALLOWED = [
  'SURGEON',
  'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
];

// POST /api/surgeries/reorder
// Body: { orders: [{ id: string, listOrder: number }] }
// Persists the manual display order of a group of booked cases (a unit/theatre's
// list for a day). Applied in one transaction so the whole group stays consistent.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ALLOWED.includes((session.user as any).role)) {
      return NextResponse.json(
        { error: 'Only surgeons, perioperative nurses and administrators can reorder the list.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const orders = Array.isArray(body.orders) ? body.orders : [];
    const clean = orders
      .filter((o: any) => o && typeof o.id === 'string' && Number.isFinite(Number(o.listOrder)))
      .map((o: any) => ({ id: o.id, listOrder: Math.round(Number(o.listOrder)) }));

    if (clean.length === 0) {
      return NextResponse.json({ error: 'No valid order entries provided' }, { status: 400 });
    }

    await prisma.$transaction(
      clean.map((o: { id: string; listOrder: number }) =>
        prisma.surgery.update({ where: { id: o.id }, data: { listOrder: o.listOrder } })
      )
    );

    return NextResponse.json({ ok: true, updated: clean.length });
  } catch (error) {
    console.error('Surgery reorder error:', error);
    return NextResponse.json({ error: 'Failed to reorder cases' }, { status: 500 });
  }
}
