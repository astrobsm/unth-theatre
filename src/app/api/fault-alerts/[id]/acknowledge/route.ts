import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only managers, chairmen, and admins can acknowledge alerts
    if (session.user.role !== 'THEATRE_MANAGER' && session.user.role !== 'THEATRE_CHAIRMAN' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Only Theatre Managers, Chairmen, and Admins can acknowledge alerts' }, { status: 403 });
    }

    const { id } = params;

    const alert = await prisma.equipmentFaultAlert.findUnique({
      where: { id },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Fault alert not found' }, { status: 404 });
    }

    if (alert.status !== 'REPORTED') {
      return NextResponse.json({ error: 'Alert has already been acknowledged' }, { status: 400 });
    }

    const updatedAlert = await prisma.equipmentFaultAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy: session.user.name || 'Unknown',
      },
    });

    return NextResponse.json({ alert: updatedAlert });
  } catch (error) {
    console.error('Error acknowledging fault alert:', error);
    return NextResponse.json({ error: 'Failed to acknowledge fault alert' }, { status: 500 });
  }
}
