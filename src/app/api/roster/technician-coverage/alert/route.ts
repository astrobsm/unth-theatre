import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushToUsers } from '@/lib/pushAll';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ANAESTHETIC_TECHNICIAN'];
const schema = z.object({ date: z.string() });
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

// POST /api/roster/technician-coverage/alert — flag when booked theatres have no
// technician. Notifies the day/night call technicians + theatre managers.
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
    const dow = start.getDay();

    const [rosterRows, surgeries, theatres, units, schedules, managers] = await Promise.all([
      prisma.roster.findMany({
        where: { staffCategory: 'ANAESTHETIC_TECHNICIANS' as any, date: { gte: start, lte: end }, status: 'PUBLISHED' },
        select: { userId: true, shift: true, subRole: true },
      }),
      prisma.surgery.findMany({
        where: { scheduledDate: { gte: start, lte: end }, surgeryType: { not: 'EMERGENCY' } as any },
        select: { unit: true, location: true, theatreId: true },
      }),
      prisma.theatreSuite.findMany({ select: { id: true, name: true } }),
      prisma.surgicalUnit.findMany({ select: { id: true, name: true } }),
      prisma.surgicalUnitSchedule.findMany({ where: { dayOfWeek: dow }, select: { unitId: true, theatreName: true } }),
      prisma.user.findMany({ where: { role: 'THEATRE_MANAGER', status: 'APPROVED' }, select: { id: true } }),
    ]);

    const theatreById = new Map(theatres.map((t) => [t.id, t.name]));
    const unitIdByName = new Map(units.map((u) => [norm(u.name), u.id]));
    const theatreByUnitId = new Map(schedules.map((s) => [s.unitId, s.theatreName]));

    const coveredTheatres = new Set<string>();
    const callTechIds = new Set<string>();
    for (const r of rosterRows) {
      const sub = (r.subRole || '').trim();
      if (/night\s*call|day\s*call/i.test(sub) || r.shift === 'CALL' || r.shift === 'NIGHT') { callTechIds.add(r.userId); continue; }
      if (/\bicu\b/i.test(sub)) continue;
      if (sub) coveredTheatres.add(norm(sub));
    }

    const resolveTheatre = (s: { theatreId: string | null; unit: string | null; location: string | null }): string | null => {
      if (s.theatreId && theatreById.has(s.theatreId)) return theatreById.get(s.theatreId)!;
      if (s.unit) { const uid = unitIdByName.get(norm(s.unit)); if (uid && theatreByUnitId.has(uid)) return theatreByUnitId.get(uid)!; }
      return s.location || null;
    };

    const gaps = Array.from(
      new Set(
        surgeries
          .map((s) => resolveTheatre(s))
          .filter((t): t is string => !!t && !coveredTheatres.has(norm(t)))
      )
    );

    if (gaps.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, gaps: [], message: 'No theatre coverage gaps — nothing to alert.' });
    }

    const recipients = Array.from(new Set([...Array.from(callTechIds), ...managers.map((m) => m.id)]));
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, gaps, message: 'Gaps found, but no call technician / manager to notify.' });
    }

    const humanDate = start.toLocaleDateString('en-GB');
    const title = '⚠️ Technician coverage gap';
    const body = `No anaesthetic technician is assigned to these booked theatres on ${humanDate}: ${gaps.join(', ')}. Please assign cover.`;

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
