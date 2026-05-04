import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public kiosk endpoint — no auth (mirrors /api/emergency-display)
// Returns active emergency lab requests that still need results uploaded.
// An item disappears (and announcement stops) once its status moves to
// RESULTS_READY / RESULTS_VERIFIED / RESULTS_VIEWED / CANCELLED.
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = [
  'REQUESTED',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'SAMPLE_COLLECTION_DISPATCHED',
  'SAMPLE_COLLECTED',
  'SAMPLE_RECEIVED_AT_LAB',
  'PROCESSING',
] as const;

export async function GET() {
  try {
    const requests = await prisma.emergencyLabRequest.findMany({
      where: { status: { in: ACTIVE_STATUSES as any } },
      include: {
        labTests: { select: { testName: true, status: true, resultEnteredAt: true } },
      },
      orderBy: [{ priority: 'asc' }, { requestedAt: 'desc' }],
    });

    const items = requests
      // hide requests whose tests all have results entered
      .filter((r) => !(r.labTests.length > 0 && r.labTests.every((t) => !!t.resultEnteredAt)))
      .map((r) => ({
        id: r.id,
        patientName: r.patientName,
        folderNumber: r.folderNumber,
        age: r.age,
        gender: r.gender,
        ward: r.ward || 'Unknown ward',
        diagnosis: r.diagnosis || r.clinicalIndication || 'Diagnosis not specified',
        priority: r.priority,
        status: r.status,
        clinicalIndication: r.clinicalIndication,
        requestedByName: r.requestedByName,
        requestedAt: r.requestedAt.toISOString(),
        tests: r.labTests.map((t) => ({
          name: t.testName,
          status: t.status,
          resultUploaded: !!t.resultEnteredAt,
        })),
      }));

    return NextResponse.json({ items, count: items.length, timestamp: new Date().toISOString() });
  } catch (e: any) {
    console.error('[announcement-display/lab] error:', e);
    return NextResponse.json({ items: [], count: 0, error: e?.message || String(e), timestamp: new Date().toISOString() });
  }
}
