// ============================================================
// The people who actually perform a duty
// ------------------------------------------------------------
//   GET  ?duty=…&from=…&to=…   — who carries this duty, with their own record
//   POST { duty, from, to, personId } — send one of them the appeal
//
// WHY THIS EXISTS. The ranking can only name somebody once they have done the
// work: a pack nobody made carries no packer, an alert nobody answered carries
// no responder. So the board could chase the people already doing the job and
// nobody else, which is the exact opposite of what it is for — and with no
// legitimate recipient, a chase could reach somebody from another department
// entirely. An anaesthetist must never receive a pharmacy chase.
//
// The roles that perform each duty, and the roster category that says who was
// on, are declared on the duty itself. This route reads both, never guesses,
// and refuses to write to anybody who holds neither a role for the duty nor a
// record against it.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { collectDutyEvents } from '@/lib/dutyPerformance/collect';
import { buildDutyReport } from '@/lib/dutyPerformance/report';
import { periodLabel } from '@/lib/dutyPerformance/export';
import {
  buildDutyBrief, foldRoster, isEveDuty, rosterWindowFor, sortTeam, dayBefore,
  type DutyTeamMember,
} from '@/lib/dutyPerformance/dutyTeam';
import { DUTIES, isDutyKey, type DutyKey, type DutyReport } from '@/lib/dutyPerformance/types';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

const VIEW_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY',
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_PHARMACY',
  'CMD',
] as const;

const SEND_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'HEAD_OF_PHARMACY',
  'HEAD_OF_ANAESTHESIA',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A WAT calendar day from an instant. Nigeria is UTC+1 all year. */
const watDayOf = (d: Date) => new Date(d.getTime() + 60 * 60_000).toISOString().slice(0, 10);

const linkFor = (duty: string, from: string, to: string) =>
  `/dashboard/duty-performance?duty=${duty}&from=${from}&to=${to}`;

/**
 * Everybody the board may write to about this duty, with their own record.
 *
 * Two sources, deliberately kept apart on the way out: the published roster
 * (a strong claim — this person was on that night) and the role register (a
 * weaker one — this person does this kind of work). Both are needed: the
 * nursing duties are not rostered a week ahead at all, and a roster that is
 * never published would otherwise leave a duty with nobody to write to.
 */
async function buildTeam(
  duty: DutyKey,
  from: string,
  to: string,
  report: DutyReport,
  dueDays: string[],
): Promise<DutyTeamMember[]> {
  const def = DUTIES[duty];

  // The days somebody had to be on for the work to get done: the day before
  // for a duty discharged the evening before, the day itself otherwise.
  const eves = isEveDuty(duty) ? dueDays.map(dayBefore) : dueDays.slice();

  const rosterRows = def.rosterCategory
    ? await (async () => {
        const w = rosterWindowFor(duty, from, to);
        const rows = await prisma.roster.findMany({
          where: {
            staffCategory: def.rosterCategory as never,
            status: 'PUBLISHED',
            date: { gte: new Date(`${w.from}T00:00:00Z`), lte: new Date(`${w.to}T00:00:00Z`) },
          },
          select: { userId: true, staffName: true, date: true, shift: true },
        });
        return rows.map((r) => ({
          userId: r.userId,
          name: r.staffName,
          date: r.date.toISOString().slice(0, 10),
          shift: String(r.shift ?? ''),
        }));
      })()
    : [];

  const rostered = foldRoster(rosterRows, eves);

  // Everybody holding a role that performs the duty. Suspended and rejected
  // accounts are left out: writing to somebody who can no longer log in is a
  // message that cannot be acted on.
  const byRole = await prisma.user.findMany({
    where: { role: { in: def.roles as never }, status: 'APPROVED' as never },
    select: { id: true, fullName: true, phoneNumber: true, role: true },
  });

  // And anybody with a record for this duty, whatever their role. Somebody who
  // actually did the work has earned a place on the list even if the role
  // register disagrees about whose job it was.
  const performers = new Map<string, (typeof report.people)[number]>();
  report.people.concat(report.unranked).forEach((p) => {
    if (p.personId) performers.set(p.personId, p);
  });

  const ids = new Set<string>();
  rostered.forEach((_v, k) => ids.add(k));
  byRole.forEach((u) => ids.add(u.id));
  performers.forEach((_v, k) => ids.add(k));

  const all = ids.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(ids) } },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
      })
    : [];

  const members: DutyTeamMember[] = all.map((u) => {
    const r = rostered.get(u.id);
    return {
      userId: u.id,
      name: u.fullName,
      role: u.role ? String(u.role) : null,
      phone: u.phoneNumber ?? null,
      days: r?.days ?? [],
      shifts: r?.shifts ?? [],
      eves: r?.eves ?? 0,
      source: r ? 'roster' : 'role',
      performance: performers.get(u.id) ?? null,
    };
  });

  return sortTeam(members);
}

export async function GET(request: NextRequest) {
  const { error } = await requireRole(VIEW_ROLES as never);
  if (error) return error;

  try {
    const sp = request.nextUrl.searchParams;
    const duty = sp.get('duty') ?? 'PREOP_REVIEW';
    if (!isDutyKey(duty)) return NextResponse.json({ error: 'Unknown duty' }, { status: 400 });
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: 'Which period?' }, { status: 400 });
    }

    const events = await collectDutyEvents(duty, from, to);
    const report = buildDutyReport(duty, events, { from, to });

    const dueDays: string[] = [];
    events.forEach((e) => {
      if (!e.dueAt) return;
      const d = e.dueAt instanceof Date ? e.dueAt : new Date(e.dueAt);
      if (Number.isNaN(d.getTime())) return;
      const key = watDayOf(d);
      if (dueDays.indexOf(key) === -1) dueDays.push(key);
    });

    const members = await buildTeam(duty, from, to, report, dueDays);

    const base = linkFor(duty, from, to);
    const briefed = await prisma.notification.findMany({
      where: { type: 'DUTY_BRIEF', link: { startsWith: base } },
      select: { userId: true },
    });

    return NextResponse.json({
      members,
      briefedUserIds: briefed.map((b) => b.userId),
      definition: DUTIES[duty],
      periodLabel: periodLabel(from, to),
      department: {
        total: report.total,
        done: report.done,
        onTime: report.onTime,
      },
    });
  } catch (err) {
    console.error('[duty-performance/team] failed:', err);
    return NextResponse.json({ error: 'Could not work out who does this duty' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(SEND_ROLES as never);
  if (error) return error;

  const actor = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const duty = String(body?.duty ?? '');
    const personId = String(body?.personId ?? '');
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');

    if (!isDutyKey(duty)) return NextResponse.json({ error: 'Unknown duty' }, { status: 400 });
    if (!personId) return NextResponse.json({ error: 'Which colleague?' }, { status: 400 });
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: 'Which period?' }, { status: 400 });
    }

    const def = DUTIES[duty];
    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, phoneNumber: true, role: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const events = await collectDutyEvents(duty, from, to);
    const report = buildDutyReport(duty, events, { from, to });

    const dueDays: string[] = [];
    events.forEach((e) => {
      if (!e.dueAt) return;
      const d = e.dueAt instanceof Date ? e.dueAt : new Date(e.dueAt);
      if (Number.isNaN(d.getTime())) return;
      const key = watDayOf(d);
      if (dueDays.indexOf(key) === -1) dueDays.push(key);
    });

    const team = await buildTeam(duty, from, to, report, dueDays);
    const member = team.find((m) => m.userId === person.id) ?? null;

    // THE GUARD THE WHOLE ROUTE IS FOR. Nobody is written to about a duty they
    // neither hold a role for, nor were rostered for, nor have a record
    // against. This is the rule that stops an anaesthetist being asked about
    // pharmacy packing.
    if (!member) {
      return NextResponse.json(
        {
          error:
            `${person.fullName} does not carry ${def.label.toLowerCase()}. `
            + `That duty belongs to ${def.owner.toLowerCase()} `
            + `(${def.roles.join(', ')}), and nothing is recorded against them for it.`,
        },
        { status: 400 },
      );
    }

    const link = `${linkFor(duty, from, to)}&kind=brief`;
    const already = await prisma.notification.findFirst({
      where: { userId: person.id, type: 'DUTY_BRIEF', link },
      select: { id: true, createdAt: true },
    });
    if (already) {
      return NextResponse.json({
        alreadySent: true,
        message:
          `${person.fullName} was already written to about this duty for this period on `
          + `${already.createdAt.toISOString().slice(0, 10)}. Nothing was sent again.`,
      });
    }

    const label = periodLabel(from, to);
    const text = buildDutyBrief({
      duty,
      personName: person.fullName,
      periodLabel: label,
      departmentTotal: report.total,
      departmentDone: report.done,
      departmentOnTime: report.onTime,
      daysOnDuty: member.days.length,
      eves: member.eves,
      own: member.performance,
    });

    const wa = person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null;

    const queued = await queueMessage({
      channel: 'WHATSAPP' as never,
      priority: 'NORMAL' as never,
      recipientUserId: person.id,
      recipientName: person.fullName,
      recipientAddress: wa,
      recipientIsStaff: true,
      body: text,
      relatedType: 'USER',
      relatedId: person.id,
      trigger: 'DUTY_BRIEF',
      scope: `${duty}:${from}:${to}`,
      createdById: actor.id ?? null,
      createdByName: actorName,
    });

    // In the app as well, so a colleague with no number on file still receives
    // it — and so the board can read back who has been written to.
    await prisma.notification.create({
      data: {
        userId: person.id,
        type: 'DUTY_BRIEF',
        title: `${def.label}: a request, ${label}`,
        message: text,
        link,
      },
    });

    return NextResponse.json({
      sent: true,
      whatsappQueued: queued.queued === true,
      whatsappSkipped: wa
        ? (queued.queued ? null : (queued.reason ?? 'Not queued'))
        : `${person.fullName} has no phone number on file.`,
      whatsapp: wa ? { number: wa, text } : null,
    });
  } catch (err) {
    console.error('[duty-performance/team] send failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
