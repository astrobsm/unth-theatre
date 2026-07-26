import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Roles allowed to physically pack/provide the surgical consumable pack.
const PACK_PROVIDER_ROLES = ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'] as const;

type Contact = { name: string; phone: string | null; role?: string | null };

// A pack's whole-case readiness is aggregated across its child line-item rows.
type PackRow = { status: string };
function summarise(rows: PackRow[]) {
  const active = rows.filter((r) => r.status !== 'CANCELLED');
  const total = active.length;
  const prescribed = total > 0;
  const packedCount = active.filter((r) => r.status === 'PACKED' || r.status === 'DELIVERED').length;
  const ready = prescribed && packedCount === total;
  let statusLabel: string;
  if (!prescribed) statusLabel = 'NOT_PRESCRIBED';
  else if (active.every((r) => r.status === 'DELIVERED')) statusLabel = 'DELIVERED';
  else if (ready) statusLabel = 'PACKED';
  else if (active.some((r) => ['PACKING', 'PACKED', 'DELIVERED'].includes(r.status))) statusLabel = 'PACKING';
  else statusLabel = 'REQUESTED';
  return { prescribed, total, packedCount, ready, statusLabel };
}

function fmtDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// GET /api/surgery-readiness?date=YYYY-MM-DD
// Returns, for every case booked that day: consumable + pharmacy pack status,
// key contacts (with phones), flagged issues (each with a professional WhatsApp
// message + who to send it to), plus a per-unit log summary.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const base = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(base.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);

    const surgeries = await prisma.surgery.findMany({
      where: { scheduledDate: { gte: start, lte: end } },
      include: {
        patient: { select: { id: true, name: true, folderNumber: true, ptNumber: true, phoneNumber: true } },
        surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      },
      orderBy: [{ scheduledTime: 'asc' }],
    });

    const surgeryIds = surgeries.map((s) => s.id);

    const [consumables, drugs, providers, pharmacists] = await Promise.all([
      surgeryIds.length
        ? prisma.surgeryConsumableRequest.findMany({
            where: { surgeryId: { in: surgeryIds } },
            include: {
              requestedBy: { select: { id: true, fullName: true, phoneNumber: true } },
              packedBy: { select: { id: true, fullName: true, phoneNumber: true } },
            },
          })
        : Promise.resolve([] as any[]),
      surgeryIds.length
        ? prisma.surgeryDrugDressingRequest.findMany({
            where: { surgeryId: { in: surgeryIds } },
            include: {
              packedBy: { select: { id: true, fullName: true, phoneNumber: true } },
            },
          })
        : Promise.resolve([] as any[]),
      prisma.user.findMany({
        where: { role: { in: PACK_PROVIDER_ROLES as any }, status: 'APPROVED' },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
      }),
      prisma.user.findMany({
        where: { role: 'PHARMACIST', status: 'APPROVED' },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
      }),
    ]);

    const consumablesBySurgery = new Map<string, any[]>();
    for (const c of consumables) {
      const arr = consumablesBySurgery.get(c.surgeryId) || [];
      arr.push(c);
      consumablesBySurgery.set(c.surgeryId, arr);
    }
    const drugsBySurgery = new Map<string, any[]>();
    for (const d of drugs) {
      const arr = drugsBySurgery.get(d.surgeryId) || [];
      arr.push(d);
      drugsBySurgery.set(d.surgeryId, arr);
    }

    const providerContacts: Contact[] = providers
      .filter((u) => u.phoneNumber)
      .map((u) => ({ name: u.fullName, phone: u.phoneNumber, role: u.role }));
    const pharmacistContacts: Contact[] = pharmacists
      .filter((u) => u.phoneNumber)
      .map((u) => ({ name: u.fullName, phone: u.phoneNumber, role: u.role }));

    const humanDate = fmtDate(start);
    const senderName = session.user.name || 'Theatre Coordinator';
    const senderRole = ((session.user as any).role || 'STAFF').toString().replace(/_/g, ' ');
    const sign = `— ${senderName}, ${senderRole}, UNTH Theatre (ORM)`;

    // Build one case entry per surgery.
    const cases = surgeries.map((s) => {
      const cRows = consumablesBySurgery.get(s.id) || [];
      const dRows = drugsBySurgery.get(s.id) || [];
      const consumable = summarise(cRows);
      const pharmacy = summarise(dRows);

      // Consultant surgeon (FK first, then free-text name).
      const consultant: Contact = s.surgeon
        ? { name: s.surgeon.fullName, phone: s.surgeon.phoneNumber }
        : { name: s.surgeonName || 'Not assigned', phone: null };

      // Who booked the case — recorded on the base consumable rows.
      const bookerRow = cRows.find((r) => r.requestedBy) || cRows.find((r) => r.requestedByName);
      const bookedBy: Contact = bookerRow?.requestedBy
        ? { name: bookerRow.requestedBy.fullName, phone: bookerRow.requestedBy.phoneNumber }
        : { name: bookerRow?.requestedByName || 'Unknown', phone: null };

      const anaesthetist: Contact = s.anesthetist
        ? { name: s.anesthetist.fullName, phone: s.anesthetist.phoneNumber }
        : { name: 'Not assigned', phone: null };

      // Specific people who actually packed this case (if any), else the pool.
      const packedConsumableProviders: Contact[] = Array.from(
        new Map(
          cRows
            .filter((r) => r.packedBy?.phoneNumber)
            .map((r) => [r.packedBy.id, { name: r.packedBy.fullName, phone: r.packedBy.phoneNumber }])
        ).values()
      );
      const consumableProviders = packedConsumableProviders.length ? packedConsumableProviders : providerContacts;

      const packedPharmacists: Contact[] = Array.from(
        new Map(
          dRows
            .filter((r) => r.packedBy?.phoneNumber)
            .map((r) => [r.packedBy.id, { name: r.packedBy.fullName, phone: r.packedBy.phoneNumber }])
        ).values()
      );
      const casePharmacists = packedPharmacists.length ? packedPharmacists : pharmacistContacts;

      const caseHeader =
        `Re: Theatre case readiness — *${s.patient?.name || 'Patient'}* ` +
        `(Folder ${s.patient?.folderNumber || s.patient?.ptNumber || 'N/A'}), ` +
        `${s.procedureName}, ${s.unit} unit, scheduled ${humanDate} at ${s.scheduledTime}` +
        `${s.location ? `, ${s.location}` : ''}.`;

      const buildMessage = (issue: string) =>
        [`🏥 UNTH Theatre — Case Readiness Alert`, ``, caseHeader, ``, issue, ``, `Kindly action this promptly so the case proceeds as scheduled. Thank you.`, sign].join('\n');

      // Flagged conditions that need fixing, each with a target + prepared message.
      const flags: Array<{ id: string; severity: 'high' | 'medium'; label: string; targets: Contact[]; message: string }> = [];

      if (!consumable.prescribed) {
        flags.push({
          id: 'consumable-not-prescribed',
          severity: 'high',
          label: 'Consumable pack NOT prescribed',
          targets: [bookedBy, consultant].filter((c) => c.phone),
          message: buildMessage('The surgical CONSUMABLE pack for this case has not been selected/prescribed. Please complete the consumable pack selection for this booking.'),
        });
      } else if (!consumable.ready) {
        flags.push({
          id: 'consumable-not-packed',
          severity: 'high',
          label: `Consumable pack not packed (${consumable.packedCount}/${consumable.total})`,
          targets: consumableProviders,
          message: buildMessage('The surgical CONSUMABLE pack for this case is prescribed but NOT yet packed and ready. Please prioritise packing this pack.'),
        });
      }

      if (!pharmacy.prescribed) {
        flags.push({
          id: 'pharmacy-not-prescribed',
          severity: 'medium',
          label: 'Pharmacy pack NOT prescribed',
          targets: [bookedBy, consultant].filter((c) => c.phone),
          message: buildMessage('The PHARMACY (drugs/dressings) pack for this case has not been prescribed. Please complete the pharmacy pack for this booking.'),
        });
      } else if (!pharmacy.ready) {
        flags.push({
          id: 'pharmacy-not-packed',
          severity: 'high',
          label: `Pharmacy pack not packed (${pharmacy.packedCount}/${pharmacy.total})`,
          targets: casePharmacists,
          message: buildMessage('The PHARMACY (drugs/dressings) pack for this case is prescribed but NOT yet packed and ready. Please prioritise dispensing/packing this pack.'),
        });
      }

      return {
        id: s.id,
        patientName: s.patient?.name || 'Unknown',
        folderNumber: s.patient?.folderNumber || s.patient?.ptNumber || null,
        procedureName: s.procedureName,
        unit: s.unit,
        subspecialty: s.subspecialty,
        location: s.location || null,
        scheduledTime: s.scheduledTime,
        status: s.status,
        magnitude: s.magnitude || null,
        consumable,
        pharmacy,
        contacts: {
          consultant,
          bookedBy,
          anaesthetist,
          pharmacists: casePharmacists,
          consumableProviders,
        },
        flags,
        allReady: consumable.ready && pharmacy.ready,
      };
    });

    // Per-unit log: aggregate prescription + packing across the day.
    const unitMap = new Map<string, any>();
    for (const c of cases) {
      const key = c.unit || 'Unassigned';
      const u = unitMap.get(key) || {
        unit: key,
        cases: 0,
        consumablePrescribed: 0,
        consumableReady: 0,
        pharmacyPrescribed: 0,
        pharmacyReady: 0,
        flagged: 0,
      };
      u.cases += 1;
      if (c.consumable.prescribed) u.consumablePrescribed += 1;
      if (c.consumable.ready) u.consumableReady += 1;
      if (c.pharmacy.prescribed) u.pharmacyPrescribed += 1;
      if (c.pharmacy.ready) u.pharmacyReady += 1;
      if (c.flags.length) u.flagged += 1;
      unitMap.set(key, u);
    }
    const unitLog = Array.from(unitMap.values()).sort((a, b) => a.unit.localeCompare(b.unit));

    const summary = {
      totalCases: cases.length,
      ready: cases.filter((c) => c.allReady).length,
      flagged: cases.filter((c) => c.flags.length).length,
    };

    return NextResponse.json({ date: start.toISOString().slice(0, 10), summary, unitLog, cases });
  } catch (error) {
    console.error('Error building surgery readiness board:', error);
    return NextResponse.json({ error: 'Failed to load readiness board' }, { status: 500 });
  }
}
