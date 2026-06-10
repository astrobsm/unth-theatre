import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Returns the theatre the logged-in anaesthetic technician is assigned to set up today.
 * Resolution order:
 *   1. TheatreAllocation for today where anaestheticTechnicianId = current user.
 *   2. Roster for today where the user is rostered as an ANAESTHETIC_TECHNICIANS with a theatre.
 * Falls back to null when no assignment exists.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Today's date window (local server date) as a date-only range.
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // 1. Theatre allocation (most specific)
    const allocation = await prisma.theatreAllocation.findFirst({
      where: {
        anaestheticTechnicianId: session.user.id,
        date: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { startTime: 'asc' },
      include: { theatre: { select: { id: true, name: true } } },
    });

    if (allocation?.theatre) {
      return NextResponse.json({
        assigned: true,
        source: 'ALLOCATION',
        allocationId: allocation.id,
        theatreId: allocation.theatre.id,
        theatreName: allocation.theatre.name,
        shift: allocation.shift,
      });
    }

    // 2. Roster fallback
    const roster = await prisma.roster.findFirst({
      where: {
        userId: session.user.id,
        staffCategory: 'ANAESTHETIC_TECHNICIANS',
        date: { gte: startOfDay, lt: endOfDay },
        theatreId: { not: null },
      },
      orderBy: { shift: 'asc' },
      include: { theatre: { select: { id: true, name: true } } },
    });

    if (roster?.theatre) {
      return NextResponse.json({
        assigned: true,
        source: 'ROSTER',
        allocationId: null,
        theatreId: roster.theatre.id,
        theatreName: roster.theatre.name,
        shift: roster.shift,
      });
    }

    return NextResponse.json({ assigned: false });
  } catch (error) {
    console.error('Error fetching technician assignment:', error);
    return NextResponse.json({ error: 'Failed to fetch assignment' }, { status: 500 });
  }
}
