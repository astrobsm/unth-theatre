import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/surgical-packs?subspecialty=&kind=CONSUMABLE|PHARMACY[&all=true]
// Booking-facing read: lists ACTIVE packs (optionally filtered) with their items
// so a surgeon can apply one. Any authenticated user may read.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const subspecialty = searchParams.get('subspecialty')?.trim();
  const kind = searchParams.get('kind')?.trim();
  const includeInactive = searchParams.get('all') === 'true';

  const where: any = {};
  if (!includeInactive) where.isActive = true;
  if (subspecialty) where.subspecialty = subspecialty;
  if (kind === 'CONSUMABLE' || kind === 'PHARMACY') where.kind = kind;

  const packs = await prisma.surgicalPack.findMany({
    where,
    orderBy: [{ subspecialty: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json({ packs });
}
