import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';

// GET - Get a specific patient by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id } = params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        surgeries: {
          include: {
            surgeon: {
              select: {
                fullName: true
              }
            },
            anesthetist: {
              select: {
                fullName: true
              }
            }
          },
          orderBy: {
            scheduledDate: 'desc'
          }
        },
        transfers: {
          orderBy: {
            transferTime: 'desc'
          },
          take: 20
        },
        fitnessAssessments: {
          orderBy: {
            assessmentDate: 'desc'
          },
          take: 5
        },
        holdingAreaAssessments: {
          include: {
            surgery: {
              select: {
                procedureName: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        },
        pacuAssessments: {
          include: {
            surgery: {
              select: {
                procedureName: true
              }
            }
          },
          orderBy: {
            admissionTime: 'desc'
          },
          take: 10
        }
      }
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json(patient);
  } catch (error) {
    console.error('Error fetching patient:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patient' },
      { status: 500 }
    );
  }
}

// PUT - Update a patient
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id } = params;
    const body = await request.json();

    const existingPatient = await prisma.patient.findUnique({
      where: { id }
    });

    if (!existingPatient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.age !== undefined) updateData.age = body.age;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.ward !== undefined) updateData.ward = body.ward;
    if (body.ptNumber !== undefined) updateData.ptNumber = body.ptNumber;

    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(updatedPatient);
  } catch (error) {
    console.error('Error updating patient:', error);
    return NextResponse.json(
      { error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a patient (soft delete or complete removal)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    // Only admin and theatre manager can delete patients
    const userRole = session?.user?.role;
    if (userRole !== 'ADMIN' && userRole !== 'THEATRE_MANAGER' && userRole !== 'SYSTEM_ADMINISTRATOR') {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions to delete patients' },
        { status: 403 }
      );
    }

    const { id } = params;

    // Check if patient has any surgeries
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        surgeries: true
      }
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (patient.surgeries.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete patient with existing surgeries' },
        { status: 400 }
      );
    }

    await prisma.patient.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { error: 'Failed to delete patient' },
      { status: 500 }
    );
  }
}
