import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const checkSchema = z.object({
  type: z.enum(['MORNING', 'EOD']),
});

// POST /api/sub-stores/:id/check
// Records the morning or end-of-day check for a sub-store item.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const body = await request.json();
    const { type } = checkSchema.parse(body);

    const data: any =
      type === 'MORNING'
        ? {
            morningCheckDone: true,
            morningCheckById: userId,
            morningCheckDate: new Date(),
          }
        : {
            endOfDayCheckDone: true,
            endOfDayCheckById: userId,
            endOfDayCheckDate: new Date(),
          };

    const updated = await prisma.theatreSubStore.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ subStore: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    console.error('Error recording sub-store check:', err);
    return NextResponse.json({ error: 'Failed to record check' }, { status: 500 });
  }
}
