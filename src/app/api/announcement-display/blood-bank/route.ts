import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public kiosk endpoint — no auth.
// Returns blood requests for emergency surgeries that still need preparation.
// Item disappears (announcement stops) once status becomes READY/DELIVERED/CANCELLED.
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['REQUESTED', 'ACKNOWLEDGED', 'IN_PREPARATION'] as const;

export async function GET() {
  try {
    const requests = await prisma.bloodRequest.findMany({
      where: {
        isEmergency: true,
        status: { in: ACTIVE_STATUSES as any },
      },
      include: {
        surgery: { select: { procedureName: true } },
        patient: { select: { ward: true } },
      },
      orderBy: [{ priorityLevel: 'asc' }, { createdAt: 'desc' }],
    });

    const items = requests.map((r) => ({
      id: r.id,
      patientName: r.patientName,
      folderNumber: r.folderNumber,
      ward: (r.patient as any)?.ward || 'Unknown ward',
      diagnosis:
        r.clinicalIndication || r.procedureName || r.surgery?.procedureName || 'Emergency surgery',
      procedureName: r.procedureName || r.surgery?.procedureName || '',
      bloodType: r.bloodType,
      rhFactor: r.rhFactor,
      unitsRequested: r.unitsRequested,
      bloodProducts: r.bloodProducts,
      urgency: r.urgency,
      priorityLevel: r.priorityLevel,
      status: r.status,
      requestedByName: r.requestedByName,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ items, count: items.length, timestamp: new Date().toISOString() });
  } catch (e: any) {
    console.error('[announcement-display/blood-bank] error:', e);
    return NextResponse.json({ items: [], count: 0, error: e?.message || String(e), timestamp: new Date().toISOString() });
  }
}
