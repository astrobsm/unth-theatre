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

    // Only managers, chairmen, and admins can resolve alerts
    if (session.user.role !== 'THEATRE_MANAGER' && session.user.role !== 'THEATRE_CHAIRMAN' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Only Theatre Managers, Chairmen, and Admins can resolve alerts' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const { resolutionNotes } = body;

    if (!resolutionNotes || resolutionNotes.trim().length === 0) {
      return NextResponse.json({ error: 'Resolution notes are required' }, { status: 400 });
    }

    const alert = await prisma.equipmentFaultAlert.findUnique({
      where: { id },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Fault alert not found' }, { status: 404 });
    }

    if (alert.status === 'RESOLVED') {
      return NextResponse.json({ error: 'Alert has already been resolved' }, { status: 400 });
    }

    const updatedAlert = await prisma.equipmentFaultAlert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: session.user.name || 'Unknown',
        resolutionNotes,
      },
    });

    return NextResponse.json({ alert: updatedAlert });
  } catch (error) {
    console.error('Error resolving fault alert:', error);
    return NextResponse.json({ error: 'Failed to resolve fault alert' }, { status: 500 });
  }
}
