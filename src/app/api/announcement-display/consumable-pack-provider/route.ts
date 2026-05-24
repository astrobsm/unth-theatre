import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public kiosk endpoint — no auth.
// Returns one entry per surgery that still has consumable requests
// awaiting packing (status REQUESTED or PACKING). Item disappears from the
// feed — and the looping announcement stops — once every consumable for
// that surgery has been marked PACKED (or DELIVERED / CANCELLED).
//
// Emergency surgeries are surfaced first.
export const dynamic = 'force-dynamic';

const PENDING = ['REQUESTED', 'PACKING'] as const;

export async function GET() {
  try {
    const rows = await prisma.surgeryConsumableRequest.findMany({
      where: { status: { in: PENDING as any } },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            scheduledTime: true,
            subspecialty: true,
            surgeryType: true,
            surgeonName: true,
            location: true,
            patient: { select: { name: true, folderNumber: true, ward: true } },
          },
        },
      },
      orderBy: [{ surgery: { scheduledDate: 'asc' } }, { createdAt: 'asc' }],
    });

    // Group by surgery
    const bySurgery = new Map<
      string,
      {
        id: string;
        patientName: string;
        folderNumber?: string;
        ward?: string;
        diagnosis?: string;
        priority?: string;
        procedureName: string;
        surgeonName?: string;
        subspecialty?: string;
        location?: string;
        scheduledDate: string;
        scheduledTime?: string;
        surgeryType: string;
        pendingCount: number;
        packingCount: number;
        requestedCount: number;
        createdAt: string;
      }
    >();

    for (const r of rows) {
      const s: any = r.surgery;
      if (!s) continue;
      const key = s.id;
      const existing = bySurgery.get(key);
      if (existing) {
        existing.pendingCount += 1;
        if (r.status === 'PACKING') existing.packingCount += 1;
        if (r.status === 'REQUESTED') existing.requestedCount += 1;
      } else {
        bySurgery.set(key, {
          id: `cpp_${s.id}`,
          patientName: s.patient?.name || 'Unknown patient',
          folderNumber: s.patient?.folderNumber || undefined,
          ward: s.patient?.ward || s.location || undefined,
          diagnosis: s.procedureName || 'Surgery',
          priority: s.surgeryType === 'EMERGENCY' ? 'EMERGENCY' : 'ELECTIVE',
          procedureName: s.procedureName || 'Surgery',
          surgeonName: s.surgeonName || undefined,
          subspecialty: s.subspecialty || undefined,
          location: s.location || undefined,
          scheduledDate: s.scheduledDate
            ? new Date(s.scheduledDate).toISOString()
            : new Date().toISOString(),
          scheduledTime: s.scheduledTime || undefined,
          surgeryType: s.surgeryType || 'ELECTIVE',
          pendingCount: 1,
          packingCount: r.status === 'PACKING' ? 1 : 0,
          requestedCount: r.status === 'REQUESTED' ? 1 : 0,
          createdAt: (r as any).createdAt
            ? new Date((r as any).createdAt).toISOString()
            : new Date().toISOString(),
        });
      }
    }

    // Emergency first, then by scheduled date asc
    const items = Array.from(bySurgery.values()).sort((a, b) => {
      if (a.surgeryType === 'EMERGENCY' && b.surgeryType !== 'EMERGENCY') return -1;
      if (b.surgeryType === 'EMERGENCY' && a.surgeryType !== 'EMERGENCY') return 1;
      return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
    });

    return NextResponse.json({
      items,
      count: items.length,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[announcement-display/consumable-pack-provider] error:', e);
    return NextResponse.json({
      items: [],
      count: 0,
      error: e?.message || String(e),
      timestamp: new Date().toISOString(),
    });
  }
}
