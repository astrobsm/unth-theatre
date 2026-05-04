import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public kiosk endpoint — no auth.
// Returns prescriptions tied to an emergency surgery that still need to be
// packed by the pharmacist. Pulls from BOTH:
//   • EmergencyPrescription (status not yet PACKED/DISPENSED)
//   • AnestheticPrescription with urgency = EMERGENCY and packedAt is null
// Item disappears (announcement stops) when packed/dispensed.
export const dynamic = 'force-dynamic';

const EMERGENCY_RX_PENDING = ['DRAFT', 'SUBMITTED', 'PHARMACIST_VIEWED', 'PACKING'] as const;
const ANESTHETIC_RX_PENDING = ['PENDING_APPROVAL', 'APPROVED', 'LATE_ARRIVAL'] as const;

export async function GET() {
  try {
    const [emergencyRx, anestheticRx] = await Promise.all([
      prisma.emergencyPrescription.findMany({
        where: { status: { in: EMERGENCY_RX_PENDING as any } },
        include: {
          emergencyBooking: {
            select: {
              ward: true,
              diagnosis: true,
              indication: true,
              procedureName: true,
              priority: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.anestheticPrescription.findMany({
        where: {
          urgency: 'EMERGENCY',
          packedAt: null,
          status: { in: ANESTHETIC_RX_PENDING as any },
        },
        include: {
          surgery: { select: { procedureName: true } },
          patient: { select: { ward: true, whoRiskClass: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const items = [
      ...emergencyRx.map((p) => ({
        id: `er_${p.id}`,
        source: 'EMERGENCY' as const,
        patientName: p.patientName,
        folderNumber: p.folderNumber,
        ward: p.emergencyBooking?.ward || 'Unknown ward',
        diagnosis:
          p.emergencyBooking?.diagnosis ||
          p.emergencyBooking?.indication ||
          'Emergency surgery',
        procedureName: p.emergencyBooking?.procedureName || 'Emergency procedure',
        priority: p.emergencyBooking?.priority || 'CRITICAL',
        status: p.status,
        prescribedByName: p.prescribedByName,
        allergyAlerts: p.allergyAlerts || null,
        createdAt: p.createdAt.toISOString(),
      })),
      ...anestheticRx.map((p) => ({
        id: `ar_${p.id}`,
        source: 'ANESTHETIC' as const,
        patientName: p.patientName,
        folderNumber: '',
        ward: (p.patient as any)?.ward || 'Unknown ward',
        diagnosis: p.surgery?.procedureName || 'Emergency surgery',
        procedureName: p.surgery?.procedureName || 'Emergency procedure',
        priority: 'CRITICAL',
        status: p.status,
        prescribedByName: p.prescribedByName,
        allergyAlerts: p.allergyAlerts || null,
        createdAt: p.createdAt.toISOString(),
      })),
    ];

    return NextResponse.json({ items, count: items.length, timestamp: new Date().toISOString() });
  } catch (e: any) {
    console.error('[announcement-display/pharmacy] error:', e);
    return NextResponse.json({ items: [], count: 0, error: e?.message || String(e), timestamp: new Date().toISOString() });
  }
}
