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

    // Whether this is a RE-booking, which the form needs for a different
    // reason than the gate does.
    //
    // A patient booked again months later is very often on a different ward,
    // and a child's age has moved on. Those details were captured once, at the
    // first admission, and are then reprinted on every list, wristband and
    // consent form thereafter — so the second booking silently carries the
    // first admission's ward. The form offers them for correction when it
    // knows there was a previous operation, and this is where it finds out.
    const [previousCount, lastClosed] = await Promise.all([
      prisma.surgery.count({
        where: {
          patientId: params.id,
          status: { in: CLOSED_STATUSES as unknown as never[] },
        },
      }),
      prisma.surgery.findFirst({
        where: {
          patientId: params.id,
          status: { in: CLOSED_STATUSES as unknown as never[] },
        },
        orderBy: { scheduledDate: 'desc' },
        select: { procedureName: true, scheduledDate: true },
      }),
    ]);

    return NextResponse.json({
      cases,
      previous: {
        count: previousCount,
        lastProcedure: lastClosed?.procedureName ?? null,
        lastDate: lastClosed?.scheduledDate ?? null,
      },
    });
  } catch (error) {
    console.error('[patients/open-surgeries] failed:', error);
    // The gate treats an error as "still checking", which keeps the form shut.
    // Opening it because a lookup failed is the one outcome worth avoiding.
    return NextResponse.json({ error: 'Could not check this patient for unfinished operations.' }, { status: 500 });
  }
}
