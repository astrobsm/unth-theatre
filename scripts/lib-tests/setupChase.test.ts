// Chasing the anaesthetic technicians for the theatre setup and the equipment
// checks: 08:30 in the morning, 18:00 at the end of the day, on elective days.
//
// THE RULE THIS FILE EXISTS TO PROTECT is the one in gaps.ts: a theatre that
// was checked, found wanting and stood down raises NOTHING. A board that
// punished an honest stand-down would teach every technician that the safe
// answer is to tick the boxes and say nothing, and that is worse than any late
// setup it would catch. It is asserted from several directions here because it
// is the rule a later change is most likely to break by accident.
//
// AND THE DEADLINES ARE COMPARED AS INSTANTS. An end-of-day check entered at
// 00:30 the next morning reads as "00:30", which is before 18:00 on any clock
// — so a wall-clock comparison would record the very latest entries as the
// punctual ones.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SETUP_GAPS, SETUP_GAP_CODES, EQUIPMENT_CHECKS,
  MORNING_DUE_MINUTES, END_OF_DAY_DUE_MINUTES,
  MORNING_DUE_LABEL, END_OF_DAY_DUE_LABEL,
  morningDueAt, endOfDayDueAt, certifiedAt, uncheckedItems, setupGaps,
  setupGapWords, setupGapsPresent,
  type SetupLogFacts, type TheatreDayForGaps,
} from '../../src/lib/setupChase/gaps';
import {
  buildTechnicianSetupChase, setupHeadline, shortDay, theatreDayLine,
  theatreDayBits, gapsPresent, MAX_DAYS_LISTED,
} from '../../src/lib/setupChase/messages';
import {
  SETUP_VIEW_ROLES, SETUP_SEND_ROLES, SETUP_WINDOW_DAYS,
} from '../../src/lib/setupChase/access';
import { setupChaseLink, SETUP_CHASE_TYPE } from '../../src/lib/setupChase/notify';
import { dateColumn, watDayRange } from '../../src/lib/watDay';
import type { SetupTheatreDay, SetupTechnicianGroup } from '../../src/lib/setupChase/collect';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const BOARD = 'src/app/api/setup-chase/route.ts';
const SEND = 'src/app/api/setup-chase/send/route.ts';
const PAGE = 'src/app/dashboard/setup-chase/page.tsx';
const COLLECT = 'src/lib/setupChase/collect.ts';

const DAY = '2026-11-03';
/** A WAT wall-clock time on DAY, as the UTC instant it really is. */
const wat = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 3, h - 1, m));

const ALL_TICKED = Object.fromEntries(
  EQUIPMENT_CHECKS.map((c) => [c.field, true]),
) as SetupLogFacts['checks'];

const log = (over: Partial<SetupLogFacts> = {}): SetupLogFacts => ({
  id: 'log-1',
  technicianId: 'tech-1',
  technicianName: 'Technician A',
  readyTime: wat(8, 10),
  setupStartTime: wat(7, 50),
  setupEndTime: wat(8, 10),
  isReady: true,
  endOfDayLogged: true,
  endOfDayTime: wat(17, 40),
  deficiencyReportedAt: null,
  checks: { ...ALL_TICKED },
  ...over,
});

const theatreDay = (over: Partial<TheatreDayForGaps> = {}): TheatreDayForGaps => ({
  day: DAY,
  theatreId: 'th-1',
  theatreName: 'Theatre 3',
  log: log(),
  ...over,
});

describe('the two deadlines asked for', () => {
  it('is 08:30 in the morning and 18:00 at the end of the day', () => {
    expect(MORNING_DUE_MINUTES).toBe(8 * 60 + 30);
    expect(END_OF_DAY_DUE_MINUTES).toBe(18 * 60);
  });

  it('derives the labels from the minutes so the two cannot drift', () => {
    expect(MORNING_DUE_LABEL).toBe('08:30');
    expect(END_OF_DAY_DUE_LABEL).toBe('18:00');
  });

  it('reads them as WAT wall clock, not as the server’s UTC', () => {
    // 08:30 in Enugu is 07:30Z. A board reading the host clock would be an
    // hour out on both servers, which run UTC.
    expect(morningDueAt(DAY)!.toISOString()).toBe('2026-11-03T07:30:00.000Z');
    expect(endOfDayDueAt(DAY)!.toISOString()).toBe('2026-11-03T17:00:00.000Z');
  });

  it('returns nothing for a day it cannot read', () => {
    expect(morningDueAt('not a day')).toBeNull();
    expect(endOfDayDueAt('')).toBeNull();
  });
});

describe('a theatre set up and closed down properly', () => {
  it('raises nothing at all', () => {
    expect(setupGaps(theatreDay(), wat(23, 0))).toEqual([]);
  });

  it('is still clean when certified at exactly 08:30', () => {
    const td = theatreDay({ log: log({ readyTime: wat(8, 30), setupEndTime: wat(8, 30) }) });
    expect(setupGaps(td, wat(23, 0))).toEqual([]);
  });

  it('is clean when closed down at exactly 18:00', () => {
    const td = theatreDay({ log: log({ endOfDayTime: wat(18, 0) }) });
    expect(setupGaps(td, wat(23, 0))).toEqual([]);
  });
});

describe('the morning', () => {
  it('says nothing before 08:30 has arrived', () => {
    expect(setupGaps(theatreDay({ log: null }), wat(8, 29))).toEqual([]);
  });

  it('reports a theatre with no log once 08:30 has passed', () => {
    expect(setupGaps(theatreDay({ log: null }), wat(8, 30))).toEqual(['NO_MORNING_SETUP']);
  });

  it('reports one finding for a day with no log, not two', () => {
    // A day with no log has no end-of-day entry either. Saying so separately
    // would double every count on the board while adding nothing.
    expect(setupGaps(theatreDay({ log: null }), wat(23, 0))).toEqual(['NO_MORNING_SETUP']);
  });

  it('reports a theatre certified one minute late as late', () => {
    const td = theatreDay({ log: log({ readyTime: wat(8, 31), setupEndTime: wat(8, 31) }) });
    expect(setupGaps(td, wat(23, 0))).toEqual(['MORNING_SETUP_LATE']);
  });

  it('reads the ready time, and falls back to the end time, never to the start', () => {
    // Starting a setup is not certifying one. Treating the start as the
    // certification would report a theatre as ready the moment somebody
    // walked into it.
    expect(certifiedAt(log({ readyTime: wat(9, 0) }))!.toISOString()).toBe(wat(9, 0).toISOString());
    expect(certifiedAt(log({ readyTime: null }))!.toISOString()).toBe(wat(8, 10).toISOString());
    expect(certifiedAt(log({ readyTime: null, setupEndTime: null }))).toBeNull();
  });

  it('reports a setup opened, never certified and never stood down', () => {
    const td = theatreDay({
      log: log({ readyTime: null, setupEndTime: null, isReady: false }),
    });
    expect(setupGaps(td, wat(9, 0))).toContain('NO_MORNING_SETUP');
  });
});

describe('a theatre that was stood down — the rule that keeps this honest', () => {
  const stoodDown = log({
    isReady: false,
    readyTime: null,
    setupEndTime: null,
    deficiencyReportedAt: wat(8, 5),
    // Half the checklist blank is what being stood down looks like.
    checks: { anesthesiaMachineChecked: true, ventilatorChecked: false },
  });

  it('raises nothing in the morning, however blank the checklist', () => {
    const gaps = setupGaps(theatreDay({ log: stoodDown }), wat(23, 0));
    expect(gaps).not.toContain('NO_MORNING_SETUP');
    expect(gaps).not.toContain('MORNING_SETUP_LATE');
    expect(gaps).not.toContain('EQUIPMENT_NOT_CHECKED');
  });

  it('still expects the end-of-day check, because the theatre still existed', () => {
    const noEod = log({ ...stoodDown, endOfDayLogged: false, endOfDayTime: null });
    expect(setupGaps(theatreDay({ log: noEod }), wat(19, 0))).toEqual(['NO_END_OF_DAY']);
  });

  it('says so on the technician’s message and on the board', () => {
    const page = read(PAGE);
    expect(page).toContain('is <strong>not</strong> on');
    expect(page).toContain('Recording a theatre as not ready is the job done');
  });
});

describe('the equipment checks — the "check equipment" half', () => {
  it('names all eight items the setup log keeps', () => {
    expect(EQUIPMENT_CHECKS).toHaveLength(8);
    const schema = read('prisma/schema.prisma');
    EQUIPMENT_CHECKS.forEach((c) => {
      // Every field must exist on the model, or the check silently reads
      // undefined and every theatre looks unticked.
      expect(schema).toMatch(new RegExp(`${c.field}\\s+Boolean`));
      expect(c.label.length).toBeGreaterThan(3);
    });
  });

  it('reports a theatre certified ready with items left unticked', () => {
    const td = theatreDay({
      log: log({ checks: { ...ALL_TICKED, ventilatorChecked: false } }),
    });
    expect(setupGaps(td, wat(23, 0))).toEqual(['EQUIPMENT_NOT_CHECKED']);
  });

  it('names which items, so the message is actionable rather than a scolding', () => {
    const unticked = uncheckedItems(log({
      checks: { ...ALL_TICKED, ventilatorChecked: false, suctionChecked: false },
    }));
    expect(unticked).toEqual(['Ventilator', 'Suction']);
  });

  it('treats a missing field as unticked, never as ticked', () => {
    // A log row written before a column existed must not read as checked:
    // "ready" is what the anaesthetist proceeds on.
    expect(uncheckedItems(log({ checks: {} }))).toHaveLength(8);
  });

  it('spells the labels the way this hospital does', () => {
    const labels = EQUIPMENT_CHECKS.map((c) => c.label).join(' ');
    expect(labels).toContain('Anaesthesia machine');
    expect(labels).not.toContain('Anesthesia');
  });
});

describe('the end of the day', () => {
  it('says nothing before 18:00 has arrived', () => {
    const td = theatreDay({ log: log({ endOfDayLogged: false, endOfDayTime: null }) });
    expect(setupGaps(td, wat(17, 59))).toEqual([]);
  });

  it('reports a missing end-of-day check once 18:00 has passed', () => {
    const td = theatreDay({ log: log({ endOfDayLogged: false, endOfDayTime: null }) });
    expect(setupGaps(td, wat(18, 0))).toEqual(['NO_END_OF_DAY']);
  });

  it('reports one entered after 18:00 as late', () => {
    const td = theatreDay({ log: log({ endOfDayTime: wat(18, 20) }) });
    expect(setupGaps(td, wat(23, 0))).toEqual(['END_OF_DAY_LATE']);
  });

  it('catches a check entered at 00:30 the NEXT morning', () => {
    // The whole reason the comparison is on instants. "00:30" is before 18:00
    // on any clock, so a wall-clock comparison would record the latest entry
    // of all as punctual.
    const td = theatreDay({
      log: log({ endOfDayTime: new Date(Date.UTC(2026, 10, 3, 23, 30)) }),
    });
    expect(setupGaps(td, new Date(Date.UTC(2026, 10, 4, 6, 0)))).toEqual(['END_OF_DAY_LATE']);
  });

  it('does not call it late when it was flagged logged with no time on file', () => {
    // An older row with endOfDayLogged true and no timestamp has been done;
    // reporting it as late would be an allegation built on a missing column.
    const td = theatreDay({ log: log({ endOfDayLogged: true, endOfDayTime: null }) });
    expect(setupGaps(td, wat(23, 0))).toEqual([]);
  });
});

describe('a theatre both late and left open', () => {
  it('reports each finding once, in the canonical order', () => {
    const td = theatreDay({
      log: log({
        readyTime: wat(9, 42),
        setupEndTime: wat(9, 42),
        checks: { ...ALL_TICKED, monitorsChecked: false },
        endOfDayLogged: false,
        endOfDayTime: null,
      }),
    });
    expect(setupGaps(td, wat(23, 0)))
      .toEqual(['MORNING_SETUP_LATE', 'EQUIPMENT_NOT_CHECKED', 'NO_END_OF_DAY']);
  });

  it('orders a mixed set of codes the same way every time', () => {
    expect(setupGapsPresent(['NO_END_OF_DAY', 'NO_MORNING_SETUP']))
      .toEqual(['NO_MORNING_SETUP', 'NO_END_OF_DAY']);
  });
});

describe('the gap catalogue', () => {
  it('describes all five codes, with the prose actually written', () => {
    expect(SETUP_GAP_CODES).toHaveLength(5);
    SETUP_GAP_CODES.forEach((code) => {
      const d = SETUP_GAPS[code];
      expect(d.code).toBe(code);
      expect(d.label.trim().length).toBeGreaterThan(8);
      expect(d.short.trim().length).toBeGreaterThan(15);
      expect(d.consequence.trim().length).toBeGreaterThan(80);
      expect(d.fix.trim().length).toBeGreaterThan(40);
    });
  });

  it('quotes the deadlines from the constants, never typed into the prose', () => {
    // A message stating a deadline the code does not enforce is the one kind
    // of chase that cannot be defended at all. So every place a deadline
    // appears in prose must INTERPOLATE the label, and the label itself must
    // be computed from the minutes the detection compares against.
    const src = read('src/lib/setupChase/gaps.ts');
    expect(src).toContain('clock(MORNING_DUE_MINUTES)');
    expect(src).toContain('clock(END_OF_DAY_DUE_MINUTES)');
    expect(src).toContain('${MORNING_DUE_LABEL}');
    expect(src).toContain('${END_OF_DAY_DUE_LABEL}');
    expect(SETUP_GAPS.MORNING_SETUP_LATE.short).toContain(MORNING_DUE_LABEL);
    expect(SETUP_GAPS.END_OF_DAY_LATE.fix).toContain(END_OF_DAY_DUE_LABEL);
    expect(SETUP_GAPS.NO_MORNING_SETUP.label).toContain(MORNING_DUE_LABEL);
    expect(SETUP_GAPS.NO_END_OF_DAY.label).toContain(END_OF_DAY_DUE_LABEL);
  });

  it('lowers a label into a sentence without mangling ORM', () => {
    expect(setupGapWords('NO_END_OF_DAY')).toBe('no end-of-day check by 18:00');
  });
});

const boardDay = (over: Partial<SetupTheatreDay> = {}): SetupTheatreDay => ({
  day: DAY,
  theatreId: 'th-1',
  theatreName: 'Theatre 3',
  evidence: 'ALLOCATION',
  caseCount: 4,
  gaps: ['NO_MORNING_SETUP'],
  certifiedClock: null,
  endOfDayClock: null,
  unchecked: [],
  stoodDown: false,
  technicianId: 'tech-1',
  technicianName: 'Technician A',
  technicianSource: 'ALLOCATION',
  assignedTheatreName: null,
  ...over,
});

const group = (days: SetupTheatreDay[]): SetupTechnicianGroup => {
  const counts = Object.fromEntries(SETUP_GAP_CODES.map((c) => [c, 0])) as Record<string, number>;
  days.forEach((d) => d.gaps.forEach((g) => { counts[g] += 1; }));
  return {
    personId: 'tech-1',
    personName: 'Technician A',
    theatreDays: days,
    counts,
    theatres: Array.from(new Set(days.map((d) => d.theatreName))),
  };
};

describe('the message to the technician', () => {
  const text = buildTechnicianSetupChase({
    personName: 'Technician A',
    periodLabel: '21 October – 3 November 2026',
    group: group([
      boardDay(),
      boardDay({
        day: '2026-11-04',
        gaps: ['MORNING_SETUP_LATE', 'NO_END_OF_DAY'],
        certifiedClock: '09:42',
      }),
    ]),
  });

  it('states both deadlines before it says what was missed', () => {
    const asked = text.indexOf(MORNING_DUE_LABEL);
    const listed = text.indexOf('The theatres and days');
    expect(asked).toBeGreaterThan(-1);
    expect(asked).toBeLessThan(listed);
    expect(text).toContain(END_OF_DAY_DUE_LABEL);
  });

  it('names the theatre and the day, and what was missing on it', () => {
    expect(text).toContain('Tue 3 Nov — Theatre 3 — no morning setup logged');
    expect(text).toContain('certified 09:42 (due 08:30)');
  });

  it('promises that an honest stand-down is not on the list', () => {
    expect(text).toContain('A theatre you stand down is not on this list');
  });

  it('names the allocation problem it will not blame the technician for', () => {
    expect(text).toContain('Two theatres on one technician is an allocation problem');
  });

  it('carries the Wi-Fi notice every staff message carries', () => {
    expect(text).toContain('UNTH-THEATRE-ORM');
  });

  it('counts theatre-days, not faults', () => {
    expect(text).toContain('2 theatre-days');
  });

  it('stops listing past the cap and says how many are left', () => {
    const many = Array.from({ length: MAX_DAYS_LISTED + 2 },
      (_, i) => boardDay({ theatreId: `th-${i}`, theatreName: `Theatre ${i}` }));
    const long = buildTechnicianSetupChase({
      personName: 'Technician A', periodLabel: 'November', group: group(many),
    });
    expect(long).toContain('and 2 more in the same period');
  });
});

describe('the small pieces the board reads', () => {
  it('says the day the way a theatre day is said', () => {
    expect(shortDay('2026-11-03')).toBe('Tue 3 Nov');
    expect(shortDay('rubbish')).toBe('rubbish');
  });

  it('marks a theatre swap as a swap, not as a theatre nobody touched', () => {
    const line = theatreDayLine(boardDay({
      gaps: ['MORNING_SETUP_LATE'], certifiedClock: '09:10',
      assignedTheatreName: 'Theatre 9',
    }));
    expect(line).toContain('[you were assigned Theatre 9]');
  });

  it('does not claim a swap when the technician was where they were assigned', () => {
    expect(theatreDayLine(boardDay({ assignedTheatreName: 'Theatre 3' })))
      .not.toContain('you were assigned');
  });

  it('names the unticked items on the line rather than only the finding', () => {
    expect(theatreDayBits(boardDay({
      gaps: ['EQUIPMENT_NOT_CHECKED'], unchecked: ['Ventilator', 'Suction'],
    }))).toEqual(['certified ready with Ventilator, Suction unticked']);
  });

  it('lists the gaps present in the canonical order', () => {
    expect(gapsPresent([
      boardDay({ gaps: ['NO_END_OF_DAY'] }),
      boardDay({ gaps: ['NO_MORNING_SETUP'] }),
    ])).toEqual(['NO_MORNING_SETUP', 'NO_END_OF_DAY']);
  });

  it('counts each kind in the headline', () => {
    expect(setupHeadline(group([
      boardDay({ gaps: ['NO_MORNING_SETUP'] }),
      boardDay({ gaps: ['NO_END_OF_DAY'] }),
    ]))).toBe('2 theatre-days: 1 with no morning setup, 1 with no end-of-day check');
  });
});

describe('which days count as elective days', () => {
  const src = read(COLLECT);

  it('reads them from the work, not from Monday-to-Friday', () => {
    // A weekday rule chases somebody about a public holiday and misses the
    // Saturday list. Nothing in the collector may look at the day of week.
    expect(src).not.toMatch(/getDay\(\)|watDayOfWeek|MONDAY|weekday/);
    expect(src).toContain("surgeryType: 'ELECTIVE' as never");
    expect(src).toContain("allocationType: 'SURGERY' as never");
  });

  it('leaves maintenance, emergency AND merely reserved rooms out', () => {
    // A room held in reserve and never opened is not a theatre somebody
    // failed to set up. Where a reserved theatre did operate, the elective
    // case naming it brings the day in by the other route.
    expect(src).not.toContain("'MAINTENANCE'");
    expect(src).not.toContain("'RESERVED'");
    expect(src).not.toContain("'EMERGENCY'");
  });

  it('asks only about rooms an operation happens in', () => {
    // The holding area and the recovery room sit in the suite table as
    // theatres and are not set up by an anaesthetic technician.
    expect(src).toContain('isOperatingRoom === false');
  });

  it('judges a theatre-day, never a whole day', () => {
    expect(src).toContain('const key = (day: string, theatreId: string)');
  });

  it('takes the EARLIEST log for a theatre-day', () => {
    // A theatre set up at 08:10 and logged again at 11:00 for the afternoon
    // session was set up on time; reading the later row would report it as
    // three hours late.
    expect(src).toContain('if (!logByCell.has(k)) logByCell.set(k, l)');
  });

  it('cancelled cases do not make a day an elective day', () => {
    expect(src).toContain("status: { not: 'CANCELLED' as never }");
  });
});

describe('who is asked about a theatre-day', () => {
  const src = read(COLLECT);

  it('asks the technician who actually logged it first', () => {
    expect(src).toContain("technicianId = log.technicianId; source = 'SETUP_LOG'");
  });

  it('falls back to the allocation, then to the case', () => {
    expect(src).toContain("source = 'ALLOCATION'");
    expect(src).toContain("source = 'CASE'");
  });

  it('reports a theatre-day with nobody assigned instead of hiding it', () => {
    expect(src).toContain('theatreDays.filter((td) => !td.technicianId)');
    // And it is never grouped into somebody else's message.
    expect(src).toContain('if (!td.technicianId) return;');
  });

  it('shows those on the board, with somewhere to go and fix it', () => {
    const page = read(PAGE);
    expect(page).toContain('Theatre-days with no technician assigned');
    expect(page).toContain('/dashboard/theatre-readiness');
  });

  it('groups one message per technician, not one per theatre', () => {
    expect(read(SEND)).toContain('groupByTechnician(theatreDays)');
  });
});

describe('who may read it and who may send it', () => {
  it('lets the technicians read their own board', () => {
    expect(SETUP_VIEW_ROLES as readonly string[]).toContain('ANAESTHETIC_TECHNICIAN');
  });

  it('does not let one technician chase another', () => {
    expect(SETUP_SEND_ROLES as readonly string[]).not.toContain('ANAESTHETIC_TECHNICIAN');
    expect(SETUP_SEND_ROLES as readonly string[]).toContain('HEAD_OF_ANAESTHESIA');
  });

  it('keeps the senders a subset of the readers', () => {
    (SETUP_SEND_ROLES as readonly string[]).forEach((r) => {
      expect(SETUP_VIEW_ROLES as readonly string[]).toContain(r);
    });
  });

  it('gates the two routes on the two different lists', () => {
    expect(read(BOARD)).toContain('requireRole(SETUP_VIEW_ROLES as never)');
    expect(read(SEND)).toContain('requireRole(SETUP_SEND_ROLES as never)');
  });

  it('looks back a fortnight by default', () => {
    expect(SETUP_WINDOW_DAYS).toBe(14);
  });
});

describe('the send route cannot be talked into a false allegation', () => {
  const src = read(SEND);

  it('recomputes the theatre-days rather than believing the request', () => {
    expect(src).toContain('collectSetupGaps(from, to)');
    expect(src).not.toMatch(/body\?\.(theatreDays|gaps|counts)/);
  });

  it('refuses to send when the technician has nothing outstanding, with the figures', () => {
    expect(src).toContain('has nothing outstanding in this period');
    expect(src).toContain('electiveTheatreDays');
  });

  it('will not send to an account that is not active', () => {
    expect(src).toContain("person.status !== 'APPROVED'");
  });

  it('does not write to the same person twice about the same window', () => {
    expect(src).toContain('alreadySent: true');
    expect(setupChaseLink('2026-10-21', '2026-11-03', 'u1'))
      .toBe('/dashboard/setup-chase?from=2026-10-21&to=2026-11-03&person=u1');
    expect(setupChaseLink('2026-10-21', '2026-11-03', 'u1'))
      .not.toBe(setupChaseLink('2026-11-04', '2026-11-17', 'u1'));
    expect(SETUP_CHASE_TYPE).toBe('THEATRE_SETUP_CHASE');
  });

  it('audits every one it sends', () => {
    expect(src).toContain("action: 'THEATRE_SETUP_CHASE_SENT'");
  });
});

describe('the page is reachable and gated', () => {
  it('is registered as a module so access can be granted', () => {
    const mods = read('src/lib/modules.ts');
    expect(mods).toContain("id: 'setup-chase'");
    expect(mods).toContain("paths: ['/dashboard/setup-chase']");
  });

  it('sits in the sidebar beside the setup screen it reports on', () => {
    const layout = read('src/app/dashboard/layout.tsx');
    expect(layout).toContain("href: '/dashboard/setup-chase'");
    expect(layout).toContain("'/dashboard/setup-chase',");
  });

  it('carries the denominator so a count can be believed', () => {
    expect(read(BOARD)).toContain('electiveTheatreDays');
    expect(read(PAGE)).toContain('Of elective theatre-days');
  });
});

describe('the bounds on the setupDate column — an off-by-one that lied', () => {
  // setupDate is a Prisma @db.Date: a bare date, read back as midnight UTC.
  // Built from watDayRange — which returns the INSTANT a WAT day begins, and
  // is 23:00 on the day before — the upper bound landed a day early, so the
  // LAST day of every window found no setup logs at all. The board then
  // reported, with complete confidence, that nobody had set up any theatre
  // yesterday. That is the worst shape a bug can take on a board that sends
  // messages about people's work: not empty, wrong.
  it('puts a WAT day at midnight UTC, not at 23:00 the day before', () => {
    expect(dateColumn('2026-11-03')!.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(watDayRange('2026-11-03').start.toISOString()).toBe('2026-11-02T23:00:00.000Z');
    expect(dateColumn('2026-11-03')!.getTime())
      .toBeGreaterThan(watDayRange('2026-11-03').start.getTime());
  });

  it('includes the last day of the window', () => {
    const last = dateColumn('2026-11-03')!;
    // A log stored for 3 November must fall inside [from, to] when to is the
    // 3rd. With the old bound it did not.
    expect(new Date(Date.UTC(2026, 10, 3)).getTime()).toBeLessThanOrEqual(last.getTime());
  });

  it('refuses a day it cannot read rather than producing Invalid Date', () => {
    expect(dateColumn('2026-11-3')).toBeNull();
    expect(dateColumn('')).toBeNull();
  });

  it('is what the collector actually queries the column with', () => {
    const src = read(COLLECT);
    expect(src).toContain('setupDate: { gte: dayStart!, lte: dayEnd! }');
    expect(src).toContain('const dayEnd = dateColumn(to);');
    // And never the instant bounds, which is what went wrong.
    expect(src).not.toMatch(/setupDate:\s*\{\s*gte:\s*start/);
  });
});
