import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushToUsers } from '@/lib/pushAll';
import { classifyTechnicianRow, specialtyKey } from '@/lib/technicianCoverage';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ANAESTHETIC_TECHNICIAN'];
const schema = z.object({ date: z.string() });

// POST /api/roster/technician-coverage/alert — flag when a booked SURGICAL
// SPECIALTY has no technician covering it. Notifies the day/night call
// technicians + theatre managers.
//
// Bucketing comes from @/lib/technicianCoverage, the same helper the coverage
// board uses. It used to be a second copy here, which meant the board and the
// alert could disagree about whether the day was covered — and the alert is the
// half nobody looks at until it is wrong.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes((session.user as any).role)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const { date } = schema.parse(await request.json());
    const base = new Date(date);
    if (isNaN(base.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);
    const [rosterRows, surgeries, managers] = await Promise.all([
      prisma.roster.findMany({
        where: { staffCategory: 'ANAESTHETIC_TECHNICIANS' as any, date: { gte: start, lte: end }, status: 'PUBLISHED' },
        select: { userId: true, shift: true, subRole: true },
      }),
      prisma.surgery.findMany({
        where: { scheduledDate: { gte: start, lte: end }, surgeryType: { not: 'EMERGENCY' } as any },
        select: { subspecialty: true, unit: true },
      }),
      prisma.user.findMany({ where: { role: 'THEATRE_MANAGER', status: 'APPROVED' }, select: { id: true } }),
    ]);

    const coveredSpecialties = new Set<string>();
    const callTechIds = new Set<string>();
    for (const r of rosterRows) {
      const { duty, specialty } = classifyTechnicianRow(r);
      if (duty === 'DAY_CALL' || duty === 'NIGHT_CALL') { callTechIds.add(r.userId); continue; }
      if (duty === 'ICU' || duty === 'UNASSIGNED') continue;
      const key = specialty ? specialtyKey(specialty) : null;
      if (key) coveredSpecialties.add(key);
    }

    // A case is a gap when nobody is rostered to its specialty. The specialty is
    // named as the BOOKING spells it, so the message points at something a
    // coordinator can search for; the unit stands in when the field is blank.
    const gaps = Array.from(
      new Set(
        surgeries
          .filter((s) => {
            const key = specialtyKey(s.subspecialty) ?? specialtyKey(s.unit);
            return key !== null && !coveredSpecialties.has(key);
          })
          .map((s) => (s.subspecialty || s.unit || '').trim())
          .filter((x) => x !== ''),
      ),
    );

    if (gaps.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, gaps: [], message: 'No specialty coverage gaps — nothing to alert.' });
    }

    const recipients = Array.from(new Set([...Array.from(callTechIds), ...managers.map((m) => m.id)]));
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, gaps, message: 'Gaps found, but no call technician / manager to notify.' });
    }

    const humanDate = start.toLocaleDateString('en-GB');
    const title = '⚠️ Technician coverage gap';
    const body = `No anaesthetic technician is rostered to these booked specialties on ${humanDate}: ${gaps.join(', ')}. Please assign cover.`;

    try {
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId, type: 'SYSTEM_ALERT' as any, title, message: body, link: '/dashboard/roster/technician-coverage',
        })),
      });
    } catch (e) { console.warn('technician gap notification skipped', e); }

    void pushToUsers(recipients, {
      title, body, url: '/dashboard/roster/technician-coverage',
      priority: 'HIGH', tag: 'technician-coverage-gap',
      data: { kind: 'technician_coverage_gap', date: start.toISOString().slice(0, 10) },
    });

    return NextResponse.json({ ok: true, notified: recipients.length, gaps });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    console.error('Technician gap alert failed:', error);
    return NextResponse.json({ error: 'Failed to send alert' }, { status: 500 });
  }
}
