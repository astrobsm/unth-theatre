import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get specific holding area assessment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assessment = await prisma.holdingAreaAssessment.findUnique({
      where: { id: params.id },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            },
            anesthetist: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        },
        redAlerts: {
          orderBy: {
            triggeredAt: 'desc'
          }
        }
      }
    });

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error fetching holding area assessment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}

// PUT - Update holding area assessment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only holding area nurses can update
    if (session.user.role !== 'SCRUB_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Calculate if all safety checks are complete
    const allChecksComplete = 
      body.patientIdentityConfirmed === true &&
      body.surgicalSiteConfirmed === true &&
      body.consentFormSigned === true &&
      body.allergyStatusChecked === true &&
      body.fastingCompliant === true &&
      body.vitalSignsNormal === true &&
      body.allDocumentationComplete === true &&
      body.ivAccessEstablished === true;

    // Check for discrepancies that should trigger alerts
    const hasDiscrepancies = 
      body.patientIdentityConfirmed === false ||
      body.surgicalSiteConfirmed === false ||
      body.consentFormSigned === false ||
      body.fastingCompliant === false ||
      body.vitalSignsNormal === false ||
      body.allDocumentationComplete === false;

    const updateData: any = { ...body };

    // Auto-update status based on checks
    if (hasDiscrepancies && !body.redAlertTriggered) {
      updateData.discrepancyDetected = true;
      updateData.status = 'DISCREPANCY_FOUND';
    } else if (allChecksComplete && !body.clearedForTheatre) {
      // If all checks pass, mark as verification in progress
      updateData.status = 'VERIFICATION_IN_PROGRESS';
      updateData.discrepancyDetected = false;
    }

    // Manual clearance for theatre
    if (body.clearedForTheatre === true) {
      if (!allChecksComplete) {
        return NextResponse.json(
          { error: 'Cannot clear for theatre - not all safety checks are complete' },
          { status: 400 }
        );
      }
      updateData.status = 'CLEARED_FOR_THEATRE';
      updateData.clearanceTime = new Date();
      
      // Update surgery status
      const currentAssessment = await prisma.holdingAreaAssessment.findUnique({
        where: { id: params.id },
        select: { surgeryId: true }
      });
      
      if (currentAssessment) {
        await prisma.surgery.update({
          where: { id: currentAssessment.surgeryId },
          data: { status: 'READY_FOR_THEATRE' }
        });
      }
    }

    // Transfer to theatre
    if (body.transferredToTheatre === true) {
      updateData.status = 'TRANSFERRED_TO_THEATRE';
      updateData.transferTime = new Date();
      
      // Update surgery status
      const currentAssessment = await prisma.holdingAreaAssessment.findUnique({
        where: { id: params.id },
        select: { surgeryId: true }
      });
      
      if (currentAssessment) {
        await prisma.surgery.update({
          where: { id: currentAssessment.surgeryId },
          data: { status: 'IN_PROGRESS' }
        });
      }
    }

    const assessment = await prisma.holdingAreaAssessment.update({
      where: { id: params.id },
      data: updateData,
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            },
            anesthetist: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        },
        redAlerts: true
      }
    });

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error updating holding area assessment:', error);
    return NextResponse.json(
      { error: 'Failed to update assessment' },
      { status: 500 }
    );
  }
}

// DELETE - Delete holding area assessment (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.holdingAreaAssessment.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ message: 'Assessment deleted successfully' });
  } catch (error) {
    console.error('Error deleting holding area assessment:', error);
    return NextResponse.json(
      { error: 'Failed to delete assessment' },
      { status: 500 }
    );
  }
}
