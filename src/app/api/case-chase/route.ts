// ============================================================
// The board: booked cases still missing something, and whose they are
// ------------------------------------------------------------
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Read-only. Two lists — the operating surgeons and the unit consultants —
// built from one pass over the cases, so the two cannot disagree about what is
// outstanding.
//
// CASES WITH NOBODY IN EITHER POSITION ARE REPORTED, NOT HIDDEN. A case with
// no surgeon recorded and no supervising consultant is missing paperwork AND
// missing an owner, and the second is the more serious of the two: there is
// nobody to write to. Shown separately so somebody can put a name on it.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { collectCasesWithGaps, groupBy, unattributed } from '@/lib/caseChase/collect';
import {
  chaseHeadline, patientLabel, roleWords, shortDay,
} from '@/lib/caseChase/messages';
import { CASE_GAPS, GAP_CODES } from '@/lib/caseChase/gaps';
import { periodLabel } from '@/lib/dutyPerformance/export';
import { SURGEON_TYPE, CONSULTANT_TYPE, chaseLink, chaseType } from '@/lib/caseChase/notify';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
  // The clinical heads, because the unit lists are theirs to act on and a
  // board only theatre management can see is a board the units argue with.
  'HEAD_OF_SURGERY',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_ANAESTHESIA',
] as const;

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Today in WAT — the theatre's day, not the server's. */
const watToday = () => new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  const { error } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  try {
    const url = new URL(request.url);
    const today = watToday();
    const from = url.searchParams.get('from') ?? today;
    // A week ahead by default. The useful question is about the cases that are
    // coming, not the ones that have gone: a gap found today on Friday's case
    // can still be closed, and one found on yesterday's cannot.
    const to = url.searchParams.get('to')
      ?? new Date(Date.now() + 7 * 24 * 60 * 60_000 + 60 * 60_000).toISOString().slice(0, 10);

    if (!isDay(from) || !isDay(to)) {
      return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'The first date is after the last.' }, { status: 400 });
    }

    const cases = await collectCasesWithGaps(from, to);

    const surgeonGroups = groupBy(cases, (c) => ({ id: c.surgeonId, name: c.surgeonName }));
    const consultantGroups = groupBy(cases, (c) => ({ id: c.consultantId, name: c.consultantName }));

    // Roles and phone numbers for everybody we might write to, in one query.
    const ids: string[] = [];
    surgeonGroups.concat(consultantGroups).forEach((g) => {
      if (ids.indexOf(g.personId) === -1) ids.push(g.personId);
    });
    const people = ids.length
      ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
      })
      : [];
    const byId: Record<string, typeof people[number]> = {};
    people.forEach((p) => { byId[p.id] = p; });

    // What has already gone out for this window, so nobody is written to twice.
    const sent = await prisma.notification.findMany({
      where: {
        type: { in: [SURGEON_TYPE, CONSULTANT_TYPE] },
        link: { in: [chaseLink('surgeon', from, to), chaseLink('consultant', from, to)] },
      },
      select: { userId: true, type: true, createdAt: true },
    });
    const sentKey: Record<string, string> = {};
    sent.forEach((s) => { sentKey[`${s.type}:${s.userId}`] = s.createdAt.toISOString(); });

    const shape = (kind: 'surgeon' | 'consultant') => (g: typeof surgeonGroups[number]) => {
      const u = byId[g.personId];
      const type = chaseType(kind);
      return {
        personId: g.personId,
        // The user record's name wins over the one denormalised onto the case:
        // a name that was right when the case was booked may since have been
        // corrected, and a letter addressed to the old one looks careless.
        personName: u?.fullName || g.personName,
        role: u?.role ? String(u.role) : null,
        roleLabel: roleWords(u?.role ? String(u.role) : null),
        hasPhone: Boolean(u?.phoneNumber),
        active: !u || u.status === 'APPROVED',
        units: g.units,
        caseCount: g.cases.length,
        counts: g.counts,
        fixable: g.fixable,
        lateCount: g.lateCount,
        headline: chaseHeadline(g),
        sentAt: sentKey[`${type}:${g.personId}`] ?? null,
        cases: g.cases.map((c) => ({
          id: c.id,
          when: [shortDay(c.scheduledDay), c.scheduledTime].filter(Boolean).join(' '),
          patient: patientLabel(c),
          procedureName: c.procedureName,
          gaps: c.gaps,
          bookedByName: c.bookedByName,
        })),
      };
    };

    const orphans = unattributed(cases);

    const totals: Record<string, number> = { cases: cases.length };
    GAP_CODES.forEach((code) => {
      totals[code] = cases.filter((c) => c.gaps.indexOf(code) !== -1).length;
    });

    return NextResponse.json({
      from,
      to,
      today,
      periodLabel: periodLabel(from, to),
      totals,
      gapLabels: GAP_CODES.map((c) => ({ code: c, label: CASE_GAPS[c].label })),
      surgeons: surgeonGroups.map(shape('surgeon')),
      consultants: consultantGroups.map(shape('consultant')),
      unattributed: {
        noSurgeon: orphans.noSurgeon.length,
        noConsultant: orphans.noConsultant.length,
        // A short, named sample: the point is for somebody to go and fix the
        // record, which needs the case, not the count.
        cases: orphans.noSurgeon.concat(
          orphans.noConsultant.filter((c) => !!c.surgeonId),
        ).slice(0, 10).map((c) => ({
          id: c.id,
          when: [shortDay(c.scheduledDay), c.scheduledTime].filter(Boolean).join(' '),
          patient: patientLabel(c),
          procedureName: c.procedureName,
          unit: c.unit,
          missing: !c.surgeonId ? 'no surgeon recorded' : 'no supervising consultant recorded',
        })),
      },
    });
  } catch (err) {
    console.error('[case-chase] board failed:', err);
    return NextResponse.json({ error: 'Could not read the board' }, { status: 500 });
  }
}
