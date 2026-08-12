import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/estimates/[id]/pdf
 *
 * Returns the STORED estimate, for the client to render. The PDF itself is built
 * in the browser — jsPDF is a browser library, and every other document in this
 * app is produced the same way, so a theatre phone with no connection can still
 * reprint one it has already loaded.
 *
 * Nothing is re-priced here. The figures returned are the ones stored, which is
 * what makes reprinting last month's estimate produce last month's numbers.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const estimate = await prisma.surgeryEstimate.findUnique({
    where: { id: params.id },
    include: {
      lines: { orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] },
    },
  });

  if (!estimate) {
    return NextResponse.json({ error: 'Estimate not found.' }, { status: 404 });
  }

  return NextResponse.json({ estimate });
}
