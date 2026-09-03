import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { CLOSED_STATUSES } from '@/lib/bookingGate';

export const dynamic = 'force-dynamic';

/**
 * Operations this patient has that were never finished.
 *
 * Asked the moment a patient is chosen on the booking form. Booking a second
 * operation while the first is still open puts one person on the theatre list
 * twice, and neither entry can be trusted afterwards — PACU cannot tell which
 * case it is admitting against, and the completed one is whichever somebody
 * eventually guesses.
 *
 * Any signed-in user may ask: whoever can reach the booking form can already
 * see this patient's list, and refusing the question would only mean the form
 * opens on a patient it should not have.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const cases = await prisma.surgery.findMany({
      where: {
        patientId: params.id,
        status: { notIn: CLOSED_STATUSES as unknown as never[] },
      },
      orderBy: { scheduledDate: 'desc' },
      take: 20,
      select: {
        id: true,
        procedureName: true,
        status: true,
        scheduledDate: true,
        scheduledTime: true,
        surgeonName: true,
        unit: true,
      },
    });

    return NextResponse.json({ cases });
  } catch (error) {
    console.error('[patients/open-surgeries] failed:', error);
    // The gate treats an error as "still checking", which keeps the form shut.
    // Opening it because a lookup failed is the one outcome worth avoiding.
    return NextResponse.json({ error: 'Could not check this patient for unfinished operations.' }, { status: 500 });
  }
}
