import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Acknowledge alert
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; type: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type } = params;

    if (type === 'holding') {
      const alert = await prisma.holdingAreaRedAlert.update({
        where: { id: params.id },
        data: {
          acknowledged: true,
          acknowledgedBy: session.user.id,
          acknowledgedAt: new Date()
        }
      });
      return NextResponse.json(alert);
    } else if (type === 'pacu') {
      const alert = await prisma.pACURedAlert.update({
        where: { id: params.id },
        data: {
          acknowledged: true,
          acknowledgedBy: session.user.id,
          acknowledgedAt: new Date()
        }
      });
      return NextResponse.json(alert);
    } else {
      return NextResponse.json({ error: 'Invalid alert type' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge alert' },
      { status: 500 }
    );
  }
}
