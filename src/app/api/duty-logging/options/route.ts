import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/duty-logging/options
// Public endpoint used by the Quick Duty Logging panel on the (unauthenticated)
// login page. The porter/cleaner staff code is the access credential — exactly
// the same model already used by /api/transport/start, /api/cleaning/* and
// /api/duties/*. Given a VALID, APPROVED staff code we return the lookup data
// needed to populate the dynamic dropdowns (patients to transport, porters for
// the trolley partner, receiving staff, theatres). Patient data is scoped to the
// active transport population to minimise exposure.
const ELIGIBLE_ROLES = new Set(['PORTER', 'CLEANER', 'ADMIN', 'THEATRE_MANAGER']);

const RECEIVING_ROLES: any[] = [
  'RECOVERY_ROOM_NURSE',
  'SCRUB_NURSE',
  'THEATRE_MANAGER',
  'ANAESTHETIST',
  'CONSULTANT_ANAESTHETIST',
  'ANAESTHETIC_TECHNICIAN',
  'HOUSE_OFFICER',
  'SURGEON',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const staffCode = (body?.staffCode ?? '').toString().trim();
    if (!staffCode) {
      return NextResponse.json({ error: 'Staff code is required' }, { status: 400 });
    }

    // Validate the staff code — the credential for this public panel.
    const staff = await prisma.user.findUnique({
      where: { staffCode },
      select: { id: true, fullName: true, staffCode: true, role: true, status: true },
    });

    if (!staff) {
      return NextResponse.json({ error: 'Invalid staff code' }, { status: 404 });
    }
    if (staff.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Staff account is not approved' }, { status: 403 });
    }
    if (!ELIGIBLE_ROLES.has(staff.role)) {
      return NextResponse.json(
        { error: 'This staff code is not authorised for quick duty logging' },
        { status: 403 }
      );
    }

    // Active transport population: patients with a non-cancelled surgery in a
    // tight window around today (covers pre-op transfers and post-op returns).
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setDate(to.getDate() + 2);
    to.setHours(23, 59, 59, 999);

    const surgeries = await prisma.surgery.findMany({
      where: {
        status: { not: 'CANCELLED' },
        scheduledDate: { gte: from, lte: to },
      },
      select: {
        patient: { select: { id: true, name: true, folderNumber: true } },
      },
      orderBy: { scheduledDate: 'desc' },
      take: 200,
    });

    const seen = new Set<string>();
    const patients: { id: string; name: string; folderNumber: string }[] = [];
    for (const s of surgeries) {
      const p = s.patient;
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        patients.push({ id: p.id, name: p.name, folderNumber: p.folderNumber });
      }
    }

    // Porters for the trolley-partner dropdown (excluding the current porter).
    const porterRows = await prisma.user.findMany({
      where: { role: 'PORTER', status: 'APPROVED', staffCode: { not: null } },
      select: { id: true, fullName: true, staffCode: true },
      orderBy: { fullName: 'asc' },
      take: 200,
    });
    const porters = porterRows
      .filter((p) => p.id !== staff.id)
      .map((p) => ({ id: p.id, name: p.fullName, code: p.staffCode }));

    // Staff who can receive a patient at the destination.
    const receivingRows = await prisma.user.findMany({
      where: { role: { in: RECEIVING_ROLES }, status: 'APPROVED' },
      select: { id: true, fullName: true, staffCode: true, role: true },
      orderBy: { fullName: 'asc' },
      take: 300,
    });
    const receivingStaff = receivingRows.map((r) => ({
      id: r.id,
      name: r.fullName,
      code: r.staffCode,
      role: r.role,
    }));

    // Theatres (for cleaning + location dropdowns). Not sensitive.
    const theatreRows = await prisma.theatreSuite.findMany({
      select: { name: true, location: true },
      orderBy: { name: 'asc' },
    });
    const theatres = theatreRows.map((t) => ({ name: t.name, location: t.location }));

    return NextResponse.json({
      staff: { id: staff.id, name: staff.fullName, code: staff.staffCode, role: staff.role },
      patients,
      porters,
      receivingStaff,
      theatres,
    });
  } catch (error) {
    console.error('Error loading duty-logging options:', error);
    return NextResponse.json({ error: 'Failed to load options' }, { status: 500 });
  }
}
