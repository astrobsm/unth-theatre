import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Record vital signs during anesthesia
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ANESTHETIST' &&
        session.user.role !== 'NURSE_ANAESTHETIST' &&
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();

    // Find the anesthesia record
    const anesthesiaRecord = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id }
    });

    if (!anesthesiaRecord) {
      return NextResponse.json(
        { error: 'Anesthesia record not found. Please initialize anesthesia monitoring first.' },
        { status: 404 }
      );
    }

    // Calculate minutes from start if induction time is available
    let minutesFromStart = body.minutesFromStart;
    if (anesthesiaRecord.inductionTime && body.recordedAt) {
      const recordTime = new Date(body.recordedAt);
      const inductionTime = new Date(anesthesiaRecord.inductionTime);
      minutesFromStart = Math.floor((recordTime.getTime() - inductionTime.getTime()) / 60000);
    }

    // Calculate MAP if systolic and diastolic provided
    let meanArterialPressure = body.meanArterialPressure;
    if (body.systolicBP && body.diastolicBP && !meanArterialPressure) {
      meanArterialPressure = Math.floor((body.systolicBP + 2 * body.diastolicBP) / 3);
    }

    // Create vital signs record
    const vitalSigns = await prisma.anesthesiaVitalSigns.create({
      data: {
        anesthesiaRecord: {
          connect: { id: anesthesiaRecord.id }
        },
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
        minutesFromStart,
        eventPhase: body.eventPhase,
        
        // Cardiovascular
        heartRate: body.heartRate,
        systolicBP: body.systolicBP,
        diastolicBP: body.diastolicBP,
        meanArterialPressure,
        
        // Respiratory
        respiratoryRate: body.respiratoryRate,
        spo2: body.spo2,
        etco2: body.etco2,
        peakAirwayPressure: body.peakAirwayPressure,
        tidalVolume: body.tidalVolume,
        minuteVolume: body.minuteVolume,
        
        // Temperature
        temperature: body.temperature,
        
        // Depth of anesthesia
        bisValue: body.bisValue,
        macValue: body.macValue,
        
        // Other
        cvp: body.cvp,
        urineOutput: body.urineOutput,
        
        // Interventions and notes
        interventions: body.interventions,
        notes: body.notes,
        alertTriggered: body.alertTriggered || false,
        alertType: body.alertType
      }
    });

    // Check for alerts based on vital signs
    const alerts = [];
    
    if (body.systolicBP && body.systolicBP < 90) {
      alerts.push('HYPOTENSION');
    }
    if (body.systolicBP && body.systolicBP > 180) {
      alerts.push('HYPERTENSION');
    }
    if (body.heartRate && body.heartRate < 50) {
      alerts.push('BRADYCARDIA');
    }
    if (body.heartRate && body.heartRate > 120) {
      alerts.push('TACHYCARDIA');
    }
    if (body.spo2 && body.spo2 < 90) {
      alerts.push('DESATURATION');
    }
    
    // Update alert status if needed
    if (alerts.length > 0 && !body.alertTriggered) {
      await prisma.anesthesiaVitalSigns.update({
        where: { id: vitalSigns.id },
        data: {
          alertTriggered: true,
          alertType: alerts.join(', ')
        }
      });
    }

    return NextResponse.json(vitalSigns, { status: 201 });
  } catch (error: any) {
    console.error('Error recording vital signs:', error);
    return NextResponse.json(
      { error: 'Failed to record vital signs', details: error.message },
      { status: 500 }
    );
  }
}

// GET - Get all vital signs for a surgery's anesthesia record
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const anesthesiaRecord = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id },
      select: { id: true }
    });

    if (!anesthesiaRecord) {
      return NextResponse.json({ error: 'Anesthesia record not found' }, { status: 404 });
    }

    const vitalSigns = await prisma.anesthesiaVitalSigns.findMany({
      where: {
        anesthesiaRecordId: anesthesiaRecord.id
      },
      orderBy: {
        recordedAt: 'asc'
      }
    });

    return NextResponse.json(vitalSigns);
  } catch (error) {
    console.error('Error fetching vital signs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vital signs' },
      { status: 500 }
    );
  }
}
