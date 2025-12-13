import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const equipmentCheckSchema = z.object({
  setupLogId: z.string().min(1, 'Setup log ID is required'),
  equipmentId: z.string().optional(),
  equipmentName: z.string().min(1, 'Equipment name is required'),
  equipmentType: z.string().min(1, 'Equipment type is required'),
  serialNumber: z.string().optional(),
  condition: z.enum(['OPERATIONAL', 'NEEDS_ATTENTION', 'FAULTY', 'NOT_AVAILABLE']),
  isFunctional: z.boolean(),
  malfunctionDescription: z.string().optional(),
  malfunctionSeverity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  requiresImmediateAttention: z.boolean().optional(),
  testParameters: z.string().optional(), // JSON string
  calibrationStatus: z.string().optional(),
  notes: z.string().optional(),
  recommendations: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = equipmentCheckSchema.parse(body);

    // Verify setup log exists
    const setupLog = await prisma.anesthesiaSetupLog.findUnique({
      where: { id: validatedData.setupLogId },
    });

    if (!setupLog) {
      return NextResponse.json(
        { error: 'Setup log not found' },
        { status: 404 }
      );
    }

    // Create equipment check log
    const equipmentCheck = await prisma.equipmentCheckLog.create({
      data: {
        setupLogId: validatedData.setupLogId,
        equipmentId: validatedData.equipmentId,
        equipmentName: validatedData.equipmentName,
        equipmentType: validatedData.equipmentType,
        serialNumber: validatedData.serialNumber,
        condition: validatedData.condition,
        isFunctional: validatedData.isFunctional,
        malfunctionDescription: validatedData.malfunctionDescription,
        malfunctionSeverity: validatedData.malfunctionSeverity,
        requiresImmediateAttention: validatedData.requiresImmediateAttention || false,
        testParameters: validatedData.testParameters,
        calibrationStatus: validatedData.calibrationStatus,
        notes: validatedData.notes,
        recommendations: validatedData.recommendations,
      },
    });

    // If equipment is faulty and requires immediate attention, send alert
    // TODO: Implement alert system when general alert model is added
    if (!validatedData.isFunctional && validatedData.requiresImmediateAttention) {
      // Create alert/notification
      console.log('Equipment malfunction alert:', {
        equipment: validatedData.equipmentName,
        theatre: setupLog.theatreName,
        description: validatedData.malfunctionDescription
      });

      /* Commented out until Alert model is added to schema
      await prisma.alert.create({
        data: {
          title: `CRITICAL: Equipment Malfunction - ${validatedData.equipmentName}`,
          message: `Equipment malfunction reported in ${setupLog.theatreName}. ${validatedData.malfunctionDescription || 'No description provided.'}`,
          severity: validatedData.malfunctionSeverity || 'HIGH',
          category: 'EQUIPMENT_FAILURE',
          relatedEntity: 'EQUIPMENT',
          relatedEntityId: validatedData.equipmentId || equipmentCheck.id,
          triggeredBy: session.user.id,
          isActive: true,
        },
      });
      */

      // Mark alert as sent
      await prisma.equipmentCheckLog.update({
        where: { id: equipmentCheck.id },
        data: {
          alertSent: true,
          alertSentAt: new Date(),
          alertRecipients: JSON.stringify([
            'THEATRE_MANAGER',
            'BIOMEDICAL_ENGINEER',
            'ADMIN',
          ]),
        },
      });
    }

    return NextResponse.json(
      {
        message: 'Equipment check logged successfully',
        equipmentCheck,
        alertSent: !validatedData.isFunctional && validatedData.requiresImmediateAttention,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error logging equipment check:', error);
    return NextResponse.json(
      { error: 'Failed to log equipment check' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve equipment checks for a setup log
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const setupLogId = searchParams.get('setupLogId');

    if (!setupLogId) {
      return NextResponse.json(
        { error: 'Setup log ID is required' },
        { status: 400 }
      );
    }

    const equipmentChecks = await prisma.equipmentCheckLog.findMany({
      where: { setupLogId },
      include: {
        equipment: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
            manufacturer: true,
          },
        },
      },
      orderBy: { checkTime: 'desc' },
    });

    return NextResponse.json({ equipmentChecks });
  } catch (error) {
    console.error('Error fetching equipment checks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch equipment checks' },
      { status: 500 }
    );
  }
}
