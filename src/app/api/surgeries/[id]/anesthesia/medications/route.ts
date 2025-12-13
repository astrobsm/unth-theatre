import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const medicationSchema = z.object({
  medicationType: z.string(),
  medicationName: z.string(),
  dosage: z.string().optional(),
  concentration: z.string().optional(),
  route: z.string(),
  site: z.string().optional(),
  eventPhase: z.string().optional(),
  
  // IV Fluid fields
  fluidType: z.string().optional(),
  volumeML: z.number().optional(),
  rateMLPerHour: z.number().optional(),
  
  // Blood Product fields
  bloodProductType: z.string().optional(),
  bloodUnits: z.number().optional(),
  bloodBatchNumber: z.string().optional(),
  bloodGroupRh: z.string().optional(),
  transfusionStartTime: z.string().optional(),
  transfusionRateMLPerHour: z.number().optional(),
  crossMatchDone: z.boolean().optional(),
  
  // Continuous Infusion
  isContinuousInfusion: z.boolean().optional(),
  infusionStartTime: z.string().optional(),
  
  // Other
  indication: z.string().optional(),
  administeredBy: z.string().optional(),
  notes: z.string().optional(),
});

// POST - Record medication administration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = medicationSchema.parse(body);

    // Find anesthesia record
    const anesthesiaRecord = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id }
    });

    if (!anesthesiaRecord) {
      return NextResponse.json(
        { error: 'Anesthesia record not found' },
        { status: 404 }
      );
    }

    // Calculate minutes from start if induction time available
    let minutesFromStart;
    if (anesthesiaRecord.inductionTime) {
      const now = new Date();
      minutesFromStart = Math.floor((now.getTime() - anesthesiaRecord.inductionTime.getTime()) / 60000);
    }

    // Create medication record
    const medicationRecord = await prisma.anesthesiaMedicationRecord.create({
      data: {
        anesthesiaRecordId: anesthesiaRecord.id,
        medicationType: validatedData.medicationType,
        medicationName: validatedData.medicationName,
        dosage: validatedData.dosage,
        concentration: validatedData.concentration,
        route: validatedData.route,
        site: validatedData.site,
        eventPhase: validatedData.eventPhase,
        minutesFromStart,
        
        fluidType: validatedData.fluidType,
        volumeML: validatedData.volumeML,
        rateMLPerHour: validatedData.rateMLPerHour,
        
        bloodProductType: validatedData.bloodProductType,
        bloodUnits: validatedData.bloodUnits,
        bloodBatchNumber: validatedData.bloodBatchNumber,
        bloodGroupRh: validatedData.bloodGroupRh,
        transfusionStartTime: validatedData.transfusionStartTime ? new Date(validatedData.transfusionStartTime) : undefined,
        transfusionRateMLPerHour: validatedData.transfusionRateMLPerHour,
        crossMatchDone: validatedData.crossMatchDone,
        
        isContinuousInfusion: validatedData.isContinuousInfusion,
        infusionStartTime: validatedData.infusionStartTime ? new Date(validatedData.infusionStartTime) : undefined,
        
        indication: validatedData.indication,
        administeredBy: validatedData.administeredBy || session.user.name,
        notes: validatedData.notes,
      }
    });

    return NextResponse.json(medicationRecord, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error recording medication:', error);
    return NextResponse.json(
      { error: 'Failed to record medication' },
      { status: 500 }
    );
  }
}

// GET - Fetch all medication records for a surgery
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const anesthesiaRecord = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id },
      include: {
        medicationRecords: {
          orderBy: { administeredAt: 'asc' }
        }
      }
    });

    if (!anesthesiaRecord) {
      return NextResponse.json(
        { error: 'Anesthesia record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(anesthesiaRecord.medicationRecords);

  } catch (error) {
    console.error('Error fetching medication records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch medication records' },
      { status: 500 }
    );
  }
}
