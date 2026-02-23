import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';

// GET - Get anesthesia monitoring record for a surgery
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requirePermission('anesthesiaMonitoring', 'read');
    if (error) return error;

    const { id } = await params;

    const anesthesiaRecord = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            patient: {
              select: {
                name: true,
                folderNumber: true,
                age: true,
                gender: true
              }
            },
            surgeon: {
              select: {
                fullName: true
              }
            }
          }
        },
        patient: {
          select: {
            name: true,
            age: true,
            gender: true
          }
        },
        vitalSignsRecords: {
          orderBy: {
            recordedAt: 'asc'
          }
        }
      }
    });

    // Return null with 200 when no record exists yet (avoids browser console 404 noise)
    return NextResponse.json(anesthesiaRecord);
  } catch (error) {
    console.error('Error fetching anesthesia record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch anesthesia record' },
      { status: 500 }
    );
  }
}

// POST - Initialize anesthesia monitoring record for a surgery
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requirePermission('anesthesiaMonitoring', 'create');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // Check if anesthesia record already exists
    const existing = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Anesthesia record already exists for this surgery' },
        { status: 400 }
      );
    }

    // Verify surgery and intraoperative record exist
    const surgery = await prisma.surgery.findUnique({
      where: { id },
      include: {
        patient: true,
        intraOperativeRecord: true
      }
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    // Create intraoperative record if it doesn't exist
    let intraOpRecord = surgery.intraOperativeRecord;
    if (!intraOpRecord) {
      intraOpRecord = await prisma.intraOperativeRecord.create({
        data: {
          surgery: { connect: { id } },
          ...(surgery.surgeonId && { primarySurgeonId: surgery.surgeonId }),
          createdBy: session.user.id
        }
      });
    }

    // Create anesthesia monitoring record
    const anesthesiaRecord = await prisma.anesthesiaMonitoringRecord.create({
      data: {
        intraOperativeRecord: {
          connect: { id: intraOpRecord.id }
        },
        surgery: {
          connect: { id }
        },
        patient: {
          connect: { id: surgery.patientId }
        },
        anesthesiaType: body.anesthesiaType,
        anesthesiaTechnique: body.anesthesiaTechnique,
        preOpDiagnosis: body.preOpDiagnosis,
        proposedProcedure: body.proposedProcedure || surgery.procedureName,
        asaClassification: body.asaClassification,
        weightKg: body.weightKg,
        heightCm: body.heightCm,
        
        // Baseline vitals
        baselineHR: body.baselineHR,
        baselineBP: body.baselineBP,
        baselineSpo2: body.baselineSpo2,
        baselineTemp: body.baselineTemp,
        baselineRR: body.baselineRR,
        
        // Monitoring equipment
        ecgMonitored: body.ecgMonitored ?? true,
        nibpMonitored: body.nibpMonitored ?? true,
        spo2Monitored: body.spo2Monitored ?? true,
        etco2Monitored: body.etco2Monitored,
        temperatureMonitored: body.temperatureMonitored,
        
        // Spinal/Epidural specific
        spinalLevel: body.spinalLevel,
        spinalNeedleSize: body.spinalNeedleSize,
        localAnestheticUsed: body.localAnestheticUsed,
        localAnestheticDose: body.localAnestheticDose,
        additives: body.additives,
        
        // General anesthesia specific
        inductionAgents: body.inductionAgents,
        inductionTime: body.inductionTime ? new Date(body.inductionTime) : undefined,
        intubationMethod: body.intubationMethod,
        ettSize: body.ettSize,
        
        anesthetistName: body.anesthetistName || session.user.name,
        nurseAnesthetistName: body.nurseAnesthetistName
      },
      include: {
        surgery: {
          select: {
            procedureName: true,
            patient: { select: { name: true } }
          }
        }
      }
    });

    return NextResponse.json(anesthesiaRecord, { status: 201 });
  } catch (error: any) {
    console.error('Error creating anesthesia record:', error);
    return NextResponse.json(
      { error: 'Failed to create anesthesia record', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update anesthesia monitoring record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requirePermission('anesthesiaMonitoring', 'update');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.anesthesiaMonitoringRecord.findUnique({
      where: { surgeryId: id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Anesthesia record not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};

    // List of updatable fields
    const updateableFields = [
      'anesthesiaType', 'anesthesiaTechnique', 'preOpDiagnosis', 'proposedProcedure',
      'asaClassification', 'weightKg', 'heightCm', 'bmi',
      'spinalLevel', 'spinalNeedleSize', 'localAnestheticUsed', 'localAnestheticDose',
      'additives', 'spinalAttempts', 'spinalSuccessful', 'highestSensoryLevel', 'motorBlock',
      'inductionAgents', 'intubationMethod', 'ettSize', 'ettCuffPressure',
      'intubationAttempts', 'intubationDifficulty', 'airwayGrade', 'maintenanceAgents',
      'ventilationMode', 'tidalVolume', 'respiratoryRate', 'peep', 'fio2',
      'ecgMonitored', 'nibpMonitored', 'spo2Monitored', 'etco2Monitored',
      'temperatureMonitored', 'cvpMonitored', 'arterialLineInserted', 'arterialLineSite',
      'centralLineInserted', 'centralLineSite', 'urinaryCatheterInserted', 'nasogastricTubeInserted',
      'baselineHR', 'baselineBP', 'baselineSpo2', 'baselineTemp', 'baselineRR',
      'ivAccessSites', 'crystalloidsGiven', 'colloidsGiven', 'bloodProductsGiven',
      'totalFluidInput', 'urineOutput', 'estimatedBloodLoss', 'fluidBalance',
      'antibioticProphylaxis', 'muscleRelaxants', 'analgesics', 'vasoactiveDrugs', 'otherMedications',
      'hypotensionOccurred', 'hypotensionManagement', 'hypertensionOccurred', 'hypertensionManagement',
      'bradycardiaOccurred', 'bradycardiaManagement', 'tachycardiaOccurred', 'tachycardiaManagement',
      'desaturationOccurred', 'desaturationManagement', 'difficultAirway', 'difficultAirwayDetails',
      'anaphylaxis', 'anaphylaxisManagement', 'otherComplications',
      'emergenceAgents', 'extubationCondition', 'postOpVentilation',
      'transferToPACU', 'transferToICU', 'anesthetistNotes', 'complications', 'postOpOrders',
      'anesthetistName', 'anesthetistSignature', 'nurseAnesthetistName'
    ];

    updateableFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    // Handle datetime fields
    if (body.inductionTime) {
      updateData.inductionTime = new Date(body.inductionTime);
    }
    if (body.anesthesiaEndTime) {
      updateData.anesthesiaEndTime = new Date(body.anesthesiaEndTime);
    }
    if (body.extubationTime) {
      updateData.extubationTime = new Date(body.extubationTime);
    }

    // Calculate BMI if weight and height provided
    if (body.weightKg && body.heightCm) {
      const heightM = body.heightCm / 100;
      updateData.bmi = body.weightKg / (heightM * heightM);
    }

    // Mark record as completed if provided
    if (body.recordCompletedAt && !existing.recordCompletedAt) {
      updateData.recordCompletedAt = new Date();
    }

    const updated = await prisma.anesthesiaMonitoringRecord.update({
      where: { surgeryId: id },
      data: updateData,
      include: {
        surgery: {
          select: {
            procedureName: true,
            patient: { select: { name: true } }
          }
        },
        vitalSignsRecords: {
          orderBy: { recordedAt: 'desc' },
          take: 10
        }
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating anesthesia record:', error);
    return NextResponse.json(
      { error: 'Failed to update anesthesia record', details: error.message },
      { status: 500 }
    );
  }
}
