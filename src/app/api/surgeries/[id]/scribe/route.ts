import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { analyzePreopSafety, type ScribeInput } from '@/lib/medicalScribe';
import { hasConsentFile } from '@/lib/consentPresence';

export const dynamic = 'force-dynamic';

/**
 * GET /api/surgeries/[id]/scribe
 *
 * The deterministic rules-based pre-operative safety analysis over the booked
 * case's recorded clinical data and consent status. No external calls.
 *
 * WHAT MADE THIS SLOW. It selected consentFileData — the scanned consent form,
 * held as base64 TEXT and commonly several megabytes — in order to compute one
 * boolean, `!!consentFileData`. On a hospital connection that is seconds of
 * waiting to decide whether to print a single line saying consent is on file.
 * The surgeries table is 58 MB for 481 rows almost entirely because of these
 * blobs; this route was moving them one case at a time.
 *
 * The column is no longer selected. Whether a file exists is asked separately,
 * inside the database, and only the answer crosses the wire.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Both at once: neither waits on the other, and neither is large now.
  const [surgery, consentFilePresent] = await Promise.all([
    prisma.surgery.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        procedureName: true,
        surgeryType: true,
        magnitude: true,
        scheduledDate: true,
        scheduledTime: true,
        recentHb: true,
        hbSampleAt: true,
        potassium: true,
        sodium: true,
        creatinine: true,
        hbsAgStatus: true,
        hcvStatus: true,
        hivStatus: true,
        bloodPressureSystolic: true,
        bloodPressureDiastolic: true,
        bleedingRiskLevel: true,
        nutritionalStatusAtBooking: true,
        pressureSoreRiskAtBooking: true,
        needBloodTransfusion: true,
        // consentFileData is deliberately absent — see the note above.
        consentSignedElectronically: true,
        consentCompletedAt: true,
        subspecialty: true,
        unit: true,
        patient: {
          select: {
            name: true,
            age: true,
            ageUnit: true,
            gender: true,
            folderNumber: true,
            comorbidities: true,
            onAnticoagulants: true,
            onAntiplatelets: true,
          },
        },
        preOpReviews: { select: { asaClass: true, airwayClass: true, riskLevel: true } },
      },
    }),
    hasConsentFile(params.id),
  ]);

  if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

  const result = analyzePreopSafety({ ...surgery, consentFilePresent } as unknown as ScribeInput);

  return NextResponse.json({
    surgery: {
      id: surgery.id,
      procedureName: surgery.procedureName,
      surgeryType: surgery.surgeryType,
      subspecialty: surgery.subspecialty,
      unit: surgery.unit,
      scheduledDate: surgery.scheduledDate,
      scheduledTime: surgery.scheduledTime,
      patient: surgery.patient,
    },
    ...result,
  });
}
