import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Fetch comprehensive discharge data for PDF generation
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

    // Fetch PACU assessment with all related data
    const pacuAssessment = await prisma.pACUAssessment.findUnique({
      where: { id },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: { select: { fullName: true } },
            anesthetist: { select: { fullName: true } },
            intraOperativeRecord: {
              include: {
                anesthesiaRecord: {
                  include: {
                    medicationRecords: {
                      orderBy: { administeredAt: 'asc' }
                    },
                    vitalSignsRecords: {
                      orderBy: { recordedAt: 'asc' }
                    }
                  }
                }
              }
            },
            holdingAreaAssessment: true
          }
        },
        vitalSigns: {
          orderBy: { recordedAt: 'asc' }
        },
        redAlerts: {
          orderBy: { triggeredAt: 'desc' }
        }
      }
    });

    if (!pacuAssessment) {
      return NextResponse.json({ error: 'PACU assessment not found' }, { status: 404 });
    }

    // Structure data for PDF generation
    const dischargeData = {
      patient: {
        name: pacuAssessment.patient.name,
        folderNumber: pacuAssessment.patient.folderNumber,
        age: pacuAssessment.patient.age,
        gender: pacuAssessment.patient.gender,
        ward: pacuAssessment.patient.ward
      },
      surgery: {
        procedureName: pacuAssessment.surgery.procedureName,
        scheduledDate: pacuAssessment.surgery.scheduledDate.toISOString(),
        actualStartTime: pacuAssessment.surgery.actualStartTime?.toISOString(),
        actualEndTime: pacuAssessment.surgery.actualEndTime?.toISOString(),
        surgeon: { fullName: pacuAssessment.surgery.surgeon.fullName },
        anesthetist: pacuAssessment.surgery.anesthetist ? 
          { fullName: pacuAssessment.surgery.anesthetist.fullName } : undefined
      },
      holdingArea: pacuAssessment.surgery.holdingAreaAssessment ? {
        admissionTime: pacuAssessment.surgery.holdingAreaAssessment.arrivalTime.toISOString(),
        vitalSigns: {
          heartRate: pacuAssessment.surgery.holdingAreaAssessment.pulseRate,
          systolicBP: pacuAssessment.surgery.holdingAreaAssessment.bloodPressureSystolic,
          diastolicBP: pacuAssessment.surgery.holdingAreaAssessment.bloodPressureDiastolic,
          oxygenSaturation: pacuAssessment.surgery.holdingAreaAssessment.spo2,
          temperature: pacuAssessment.surgery.holdingAreaAssessment.temperature
        },
        preOpChecklist: {
          consentVerified: pacuAssessment.surgery.holdingAreaAssessment.consentFormSigned,
          siteMarked: pacuAssessment.surgery.holdingAreaAssessment.operationSiteMarked,
          fastingConfirmed: pacuAssessment.surgery.holdingAreaAssessment.nilPerOralMaintained
        }
      } : undefined,
      anesthesia: pacuAssessment.surgery.intraOperativeRecord?.anesthesiaRecord ? {
        type: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.anesthesiaType,
        technique: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.anesthesiaTechnique || '',
        asaClassification: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.asaClassification || '',
        inductionTime: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.inductionTime?.toISOString(),
        anesthesiaEndTime: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.anesthesiaEndTime?.toISOString(),
        baselineVitals: {
          heartRate: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.baselineHR,
          bloodPressure: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.baselineBP,
          spo2: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.baselineSpo2
        },
        medications: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.medicationRecords.map(med => ({
          medicationName: med.medicationName,
          dosage: med.dosage || '',
          route: med.route,
          administeredAt: med.administeredAt.toISOString(),
          medicationType: med.medicationType,
          volumeML: med.volumeML || undefined,
          rateMLPerHour: med.rateMLPerHour || undefined,
          bloodProductType: med.bloodProductType || undefined,
          bloodUnits: med.bloodUnits ? parseFloat(med.bloodUnits.toString()) : undefined
        })),
        complications: {
          hypotension: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.hypotensionOccurred,
          desaturation: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.desaturationOccurred,
          difficultAirway: pacuAssessment.surgery.intraOperativeRecord.anesthesiaRecord.difficultAirway
        }
      } : undefined,
      pacu: {
        admissionTime: pacuAssessment.admissionTime.toISOString(),
        dischargeTime: pacuAssessment.dischargeTime?.toISOString(),
        vitalSigns: pacuAssessment.vitalSigns.map(vs => ({
          recordedAt: vs.recordedAt.toISOString(),
          bloodPressure: vs.bloodPressure || '',
          heartRate: vs.heartRate || 0,
          oxygenSaturation: vs.oxygenSaturation || 0,
          painScore: vs.painScore || 0
        }))
      }
    };

    return NextResponse.json(dischargeData);

  } catch (error) {
    console.error('Error fetching discharge data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discharge data' },
      { status: 500 }
    );
  }
}
