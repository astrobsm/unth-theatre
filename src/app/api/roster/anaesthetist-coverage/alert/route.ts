import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushToUsers } from '@/lib/pushAll';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST',
];

const schema = z.object({ date: z.string() });
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
const isOnCallRow = (shift: string, subRole: string | null | undefined) =>
  shift === 'CALL' || /all\s*emerg|on[\s-]*call/i.test(subRole || '');

// POST /api/roster/anaesthetist-coverage/alert — flag the on-call board when
// booked subspecialties have no rostered anaesthetist. Notifies the day's on-call
// consultant(s) plus all consultant anaesthetists (leads), in-app + push.
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

    const [rosterRows, surgeries, leads] = await Promise.all([
      prisma.roster.findMany({
        where: { staffCategory: 'ANAESTHETISTS' as any, date: { gte: start, lte: end }, status: 'PUBLISHED' },
        select: { userId: true, shift: true, subRole: true },
      }),
      prisma.surgery.findMany({
        where: { scheduledDate: { gte: start, lte: end } },
        select: { subspecialty: true, surgeryType: true },
      }),
      prisma.user.findMany({
        where: { role: 'CONSULTANT_ANAESTHETIST', status: 'APPROVED' },
        select: { id: true },
      }),
    ]);

    // Subspecialties with elective coverage on the roster.
    const covered = new Set<string>();
    const onCallUserIds = new Set<string>();
    for (const r of rosterRows) {
      if (isOnCallRow(r.shift, r.subRole)) { onCallUserIds.add(r.userId); continue; }
      if (r.subRole) covered.add(norm(r.subRole));
    }

    // Elective booked subspecialties with no coverage.
    const gaps = Array.from(
      new Set(
        surgeries
          .filter((s) => s.surgeryType !== 'EMERGENCY' && !covered.has(norm(s.subspecialty)))
          .map((s) => s.subspecialty)
          .filter(Boolean)
      )
    );

    if (gaps.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, gaps: [], message: 'No coverage gaps — nothing to alert.' });
    }

    const recipients = Array.from(new Set([...Array.from(onCallUserIds), ...leads.map((l) => l.id)]));
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, gaps, message: 'Gaps found, but no on-call/lead anaesthetist to notify.' });
    }

    const humanDate = start.toLocaleDateString('en-GB');
    const title = '⚠️ Anaesthetist coverage gap';
    const body = `No anaesthetist is rostered for these booked subspecialties on ${humanDate}: ${gaps.join(', ')}. Please assign cover.`;

    try {
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId, type: 'SYSTEM_ALERT' as any, title, message: body, link: '/dashboard/roster/anaesthetist-coverage',
        })),
      });
    } catch (e) { console.warn('coverage-gap notification skipped', e); }

    void pushToUsers(recipients, {
      title, body, url: '/dashboard/roster/anaesthetist-coverage',
      priority: 'HIGH', tag: 'anaesthetist-coverage-gap',
      data: { kind: 'anaesthetist_coverage_gap', date: start.toISOString().slice(0, 10) },
    });

    return NextResponse.json({ ok: true, notified: recipients.length, gaps });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    console.error('Coverage gap alert failed:', error);
    return NextResponse.json({ error: 'Failed to send alert' }, { status: 500 });
  }
}
