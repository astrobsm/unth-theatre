import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PREFIX = 'ANAESTHESIA::';

// GET /api/anaesthesia-packs[?technique=General|Spinal|...][&kind=CONSUMABLE|PHARMACY][&all=true]
// Returns ACTIVE anaesthesia packs (stored in surgical_packs, keyed by the
// ANAESTHESIA:: prefix) with their items. Used by the anaesthesia pack picker on
// the pre-anaesthetic review. Any authenticated user may read.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const technique = searchParams.get('technique')?.trim();
  const kind = searchParams.get('kind')?.trim();
  const includeInactive = searchParams.get('all') === 'true';

  const where: any = {
    subspecialty: technique ? `${PREFIX}${technique}` : { startsWith: PREFIX },
  };
  if (!includeInactive) where.isActive = true;
  if (kind === 'CONSUMABLE' || kind === 'PHARMACY') where.kind = kind;

  const rows = await prisma.surgicalPack.findMany({
    where,
    orderBy: [{ subspecialty: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  // Surface the technique (strip the prefix) so the client can group/filter.
  const packs = rows.map((p) => ({ ...p, technique: p.subspecialty.replace(PREFIX, '') }));
  return NextResponse.json({ packs });
}
