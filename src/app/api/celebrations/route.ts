// ============================================================
// The celebrations board
// ------------------------------------------------------------
//   GET ?on=YYYY-MM-DD&ahead=14
//
// What there is to celebrate on a day, who it reaches, and who has already
// been written to. Read-only: nothing leaves the hospital from this route.
//
// It also reports how many colleagues have been asked and how many have
// answered, because a board showing four birthdays in a hospital of six
// hundred is not a quiet month — it is a prompt nobody has seen yet, and the
// difference matters to whoever is looking at the screen.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import {
  occasionsOn, occasionsBetween, parseDay, watToday, ymd, monthName, pairsFor,
} from '@/lib/celebrations/calendar';
import { personalTitle, longDay } from '@/lib/celebrations/messages';
import {
  recipientsFor, greetedOn, personalSent, dayPrefix, OCCASION_TYPE,
} from '@/lib/celebrations/dispatch';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
] as const;

export async function GET(request: NextRequest) {
  const { error } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  try {
    const url = new URL(request.url);
    const today = watToday();
    const on = url.searchParams.get('on') ?? today;
    if (!parseDay(on)) {
      return NextResponse.json({ error: 'Which day?' }, { status: 400 });
    }
    const ahead = Math.min(60, Math.max(0, Number(url.searchParams.get('ahead') ?? 14) || 0));

    // ── What the calendar says about today ────────────────────────────
    const calendar = occasionsOn(on);
    const already = await greetedOn(on);

    const occasions = await Promise.all(calendar.map(async (o) => {
      const people = await recipientsFor(o);
      let sent = 0;
      people.forEach((p) => { if (already.has(p.id)) sent += 1; });
      return {
        key: o.key,
        kind: o.kind,
        title: o.title,
        date: o.date,
        audience: o.audience,
        audienceLabel: o.audienceLabel ?? null,
        recipientCount: people.length,
        sentCount: sent,
        remaining: people.length - sent,
        withoutPhone: people.filter((p) => !p.phoneNumber).length,
      };
    }));

    // ── Whose own day it is ──────────────────────────────────────────
    const pairs = pairsFor(on);
    const personalRows = await prisma.staffCelebration.findMany({
      where: {
        active: true,
        OR: pairs,
        user: { status: 'APPROVED' },
      },
      select: {
        id: true, kind: true, label: true, month: true, day: true, sinceYear: true,
        user: { select: { id: true, fullName: true, role: true, phoneNumber: true, department: true } },
      },
      orderBy: [{ user: { fullName: 'asc' } }],
    });
    const sentPersonal = await personalSent(on, personalRows.map((r) => r.id));

    const personal = personalRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      title: personalTitle(r.kind as never, r.label),
      sinceYear: r.sinceYear,
      years: r.sinceYear && parseDay(on) ? parseDay(on)!.year - r.sinceYear : null,
      sent: sentPersonal.has(r.id),
      person: {
        id: r.user.id,
        fullName: r.user.fullName,
        role: r.user.role ? String(r.user.role) : null,
        department: r.user.department ?? null,
        hasPhone: Boolean(r.user.phoneNumber),
      },
    }));

    // ── Coming up ────────────────────────────────────────────────────
    const p = parseDay(on)!;
    const endDate = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
    endDate.setUTCDate(endDate.getUTCDate() + ahead);
    const end = endDate.toISOString().slice(0, 10);

    const soonCalendar = ahead > 0
      ? occasionsBetween(ymd(p.year, p.month, p.day), end)
          .filter((o) => o.date > on)
          .map((o) => ({ date: o.date, title: o.title, kind: o.kind, key: o.key }))
      : [];

    // Personal days in the window. Read by month/day pairs over the window
    // rather than by a date range, because the stored value has no year.
    const windowPairs: { month: number; day: number }[] = [];
    for (let i = 1; i <= ahead; i += 1) {
      const t = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
      t.setUTCDate(t.getUTCDate() + i);
      windowPairs.push({ month: t.getUTCMonth() + 1, day: t.getUTCDate() });
    }
    const soonPersonalRows = windowPairs.length
      ? await prisma.staffCelebration.findMany({
        where: { active: true, OR: windowPairs, user: { status: 'APPROVED' } },
        select: {
          id: true, kind: true, label: true, month: true, day: true,
          user: { select: { fullName: true, role: true } },
        },
      })
      : [];

    const soonPersonal = soonPersonalRows.map((r) => {
      // Place it in the right year: a December day read from January belongs
      // to this year, not the next, and the window is never longer than 60
      // days so the wrap can only ever be forward by one year.
      const sameYear = ymd(p.year, r.month, r.day);
      const date = sameYear >= on ? sameYear : ymd(p.year + 1, r.month, r.day);
      return {
        date,
        title: `${personalTitle(r.kind as never, r.label)} — ${r.user.fullName}`,
        kind: 'PERSONAL' as const,
        key: `personal:${r.id}`,
      };
    });

    const upcoming = soonCalendar.concat(soonPersonal)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 40)
      .map((u) => ({ ...u, dayLabel: longDay(u.date) }));

    // ── How well the hospital has answered the prompt ────────────────
    const [staffTotal, answered, withDays] = await Promise.all([
      prisma.user.count({ where: { status: 'APPROVED', vendorId: null } }),
      prisma.user.count({
        where: { status: 'APPROVED', vendorId: null, celebrationPrefsSetAt: { not: null } },
      }),
      prisma.staffCelebration.count({
        where: { active: true, user: { status: 'APPROVED' } },
      }),
    ]);

    // Anything already sent for today, named, so the screen can show what the
    // hospital said rather than only that it said something.
    const sentToday = await prisma.notification.count({
      where: { type: OCCASION_TYPE, link: { startsWith: dayPrefix(on) } },
    });

    return NextResponse.json({
      on,
      today,
      dayLabel: longDay(on),
      monthLabel: monthName(p.month),
      occasions,
      personal,
      upcoming,
      coverage: {
        staffTotal,
        answered,
        notAsked: Math.max(0, staffTotal - answered),
        daysRecorded: withDays,
      },
      sentToday,
    });
  } catch (err) {
    console.error('[celebrations] board failed:', err);
    return NextResponse.json({ error: 'Could not read the board' }, { status: 500 });
  }
}
