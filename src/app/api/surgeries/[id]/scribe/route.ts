import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { analyzePreopSafety, type ScribeInput } from '@/lib/medicalScribe';

export const dynamic = 'force-dynamic';

// GET /api/surgeries/[id]/scribe
// Runs the deterministic rules-based pre-operative safety analysis over the
// booked surgery's recorded clinical data + consent status. No external calls.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const surgery = await prisma.surgery.findUnique({
    where: { id: params.id },
    select: {
      id: true, procedureName: true, surgeryType: true, magnitude: true, scheduledDate: true, scheduledTime: true,
      recentHb: true, hbSampleAt: true, potassium: true, sodium: true, creatinine: true,
      hbsAgStatus: true, hcvStatus: true, hivStatus: true,
      bloodPressureSystolic: true, bloodPressureDiastolic: true,
      bleedingRiskLevel: true, nutritionalStatusAtBooking: true, pressureSoreRiskAtBooking: true,
      needBloodTransfusion: true,
      consentSignedElectronically: true, consentFileData: true, consentCompletedAt: true,
      subspecialty: true, unit: true,
      patient: {
        select: {
          name: true, age: true, ageUnit: true, gender: true, folderNumber: true,
          comorbidities: true, onAnticoagulants: true, onAntiplatelets: true,
        },
      },
      preOpReviews: { select: { asaClass: true, airwayClass: true, riskLevel: true } },
    },
  });

  if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

  const result = analyzePreopSafety(surgery as unknown as ScribeInput);

  return NextResponse.json({
    surgery: {
      id: surgery.id, procedureName: surgery.procedureName, surgeryType: surgery.surgeryType,
      subspecialty: surgery.subspecialty, unit: surgery.unit,
      scheduledDate: surgery.scheduledDate, scheduledTime: surgery.scheduledTime,
      patient: surgery.patient,
    },
    ...result,
  });
}
