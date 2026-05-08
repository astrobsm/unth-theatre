import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/radio/audit?limit=50
// Returns recent announcements with acknowledgment counts (audit trail).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(
    200,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? '50'))
  );

  const items = await prisma.radioAnnouncement.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      acks: {
        orderBy: { createdAt: 'asc' },
        take: 10,
      },
    },
  });

  return NextResponse.json({ items });
}
