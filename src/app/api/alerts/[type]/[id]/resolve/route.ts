import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Resolve alert
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; type: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { resolutionAction, resolutionNotes } = body;

    if (!resolutionAction) {
      return NextResponse.json(
        { error: 'Resolution action is required' },
        { status: 400 }
      );
    }

    const { type } = params;

    if (type === 'holding') {
      const alert = await prisma.holdingAreaRedAlert.update({
        where: { id: params.id },
        data: {
          resolved: true,
          resolvedBy: session.user.id,
          resolvedAt: new Date(),
          resolutionAction,
          resolutionNotes
        },
        include: {
          assessment: true
        }
      });

      // Update assessment to clear red alert status
      await prisma.holdingAreaAssessment.update({
        where: { id: alert.assessmentId },
        data: {
          redAlertResolvedBy: session.user.id,
          redAlertResolvedAt: new Date(),
          redAlertResolution: resolutionAction,
          status: 'VERIFICATION_IN_PROGRESS'
        }
      });

      return NextResponse.json(alert);

    } else if (type === 'pacu') {
      const alert = await prisma.pACURedAlert.update({
        where: { id: params.id },
        data: {
          resolved: true,
          resolvedBy: session.user.id,
          resolvedAt: new Date(),
          resolutionAction
        },
        include: {
          pacuAssessment: true
        }
      });

      // Update assessment to clear red alert status
      await prisma.pACUAssessment.update({
        where: { id: alert.pacuAssessmentId },
        data: {
          redAlertResolvedBy: session.user.id,
          redAlertResolvedAt: new Date()
        }
      });

      return NextResponse.json(alert);

    } else {
      return NextResponse.json({ error: 'Invalid alert type' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error resolving alert:', error);
    return NextResponse.json(
      { error: 'Failed to resolve alert' },
      { status: 500 }
    );
  }
}
