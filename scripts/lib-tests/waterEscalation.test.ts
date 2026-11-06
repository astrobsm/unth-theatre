/**
 * A water fault has to be explained, chased, and closed by somebody looking
 * again.
 *
 * Asked for on 6 November:
 *
 *   "modify also such that for the user to log the water status or readiness
 *    status location will be tracked, again when any other status apart from
 *    ok is selected, a dynamic field appears to state the problem and the
 *    action taken, and the plan b for water for that day, upon submission of
 *    any report with any status apart from ok, a very distress whatsapp
 *    message will be created to chase the head of water supply, and head of
 *    works department, and when the error is fixed, the user need to
 *    re-assess and correct the status."
 *
 * The ways this can go wrong, worst first:
 *
 *   A FAULT THAT CLOSES ITSELF. If silence, or time, or a slightly kinder
 *   status closed an issue, the board would show a dry theatre as fixed and
 *   nobody would ever go back. Only a report that looked at the same area
 *   and found it OK may close one, and that is asserted from several angles.
 *
 *   A CHASE THAT SAYS NOTHING. "Theatre 3: NO_WATER" sends the head of works
 *   out with no idea what he is going to. The message must carry the problem,
 *   what has already been tried, and the plan B.
 *
 *   A GATE THAT STOPS THE REPORT BEING FILED AT ALL. The location must never
 *   be a condition of saving: a theatre basement gives no position however
 *   diligent the round was.
 *
 *   A NOTE LEFT ON A FIXED ROOM. "The riser valve is shut" carried onto a
 *   room somebody has just marked OK is how a closed fault gets chased for
 *   another week.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  MIN_NOTE,
  areasNotOk,
  buildWaterAreas,
  missingExplanations,
  readWaterAreas,
  type TheatreRow,
  type WaterArea,
} from '../../src/lib/water/waterAreas';
import {
  READINESS_ASPECTS,
  READINESS_OVERALL_KEY,
  readinessAreas,
  readinessStatusLabel,
} from '../../src/lib/water/readiness';
import {
  RECHASE_AFTER_HOURS,
  needsRechase,
  openForLabel,
  reassessmentNotice,
  reconcileIssues,
  type WaterIssueLike,
} from '../../src/lib/water/issues';
import {
  DISTRESS_ROLES,
  buildWaterDistressMessage,
  distressNotificationLine,
} from '../../src/lib/water/distress';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const THEATRES: TheatreRow[] = [
  { id: 't1', name: 'Theatre 1', location: 'Professor Ojukwu Theatre Complex' },
  { id: 't2', name: 'Theatre 2', location: 'Professor Ojukwu Theatre Complex' },
  { id: 'eye', name: 'Eye Theatre', location: 'Eye Theatre' },
];

const area = (over: Partial<WaterArea> = {}): WaterArea => ({
  key: 'theatre:eye', name: 'Eye Theatre', location: 'Eye Theatre', status: 'NO_WATER',
  problem: 'The riser valve on the second floor is shut and the key is missing',
  actionTaken: 'Called the works office; borehole switched to this line',
  ...over,
});

const issue = (over: Partial<WaterIssueLike> = {}): WaterIssueLike => ({
  id: 'i1',
  areaKey: 'theatre:eye',
  areaName: 'Eye Theatre',
  location: 'Eye Theatre',
  status: 'NO_WATER',
  problem: 'The riser valve is shut',
  actionTaken: 'Works office called',
  contingencyPlan: 'Tanker at 10am',
  openedAt: new Date('2026-11-05T06:30:00Z'),
  openedByName: 'A. Plumber',
  ...over,
});

// ---------------------------------------------------------------------------

describe('what a report must say before it can be filed', () => {
  it('asks for nothing when every area is OK', () => {
    const areas = buildWaterAreas(THEATRES);
    expect(missingExplanations(areas, '')).toEqual([]);
  });

  it('asks for the problem, the action and the plan B when one room is not', () => {
    const areas = [area({ problem: '', actionTaken: '' })];
    const missing = missingExplanations(areas, '');
    expect(missing).toHaveLength(3);
    expect(missing.join(' ')).toContain('Eye Theatre');
    expect(missing.join(' ')).toContain('plan B');
  });

  it('names each affected room, not just the first', () => {
    const missing = missingExplanations(
      [
        area({ problem: '', actionTaken: '' }),
        area({ key: 'theatre:t2', name: 'Theatre 2', problem: '', actionTaken: '' }),
      ],
      'Tanker at 10am',
    );
    expect(missing.join(' ')).toContain('Eye Theatre');
    expect(missing.join(' ')).toContain('Theatre 2');
  });

  it('is satisfied once all three are given', () => {
    expect(missingExplanations([area()], 'Tanker at 10am; scrub water from Suite 1')).toEqual([]);
  });

  it('does not accept a stray keystroke as a description', () => {
    expect(MIN_NOTE).toBeGreaterThan(1);
    const missing = missingExplanations([area({ problem: 'x' })], 'Tanker at 10am');
    expect(missing.join(' ')).toContain('what is wrong in Eye Theatre');
  });

  it('still asks for the plan B when the rooms are explained', () => {
    expect(missingExplanations([area()], '  ')).toEqual([
      'Give the plan B for water today — how the theatres get water while this is unfixed.',
    ]);
  });
});

describe('the notes travel with the status they explain', () => {
  it('carries a fault description into the next form', () => {
    const seeded = buildWaterAreas(THEATRES, [area()]);
    const eye = seeded.find((a) => a.key === 'theatre:eye');
    expect(eye?.status).toBe('NO_WATER');
    expect(eye?.problem).toContain('riser valve');
    expect(eye?.actionTaken).toContain('works office');
  });

  it('drops the description from a room that is OK again', () => {
    // The whole point of a re-assessment: the room is fixed, and the account
    // of what was wrong with it must not travel on as though it still is.
    const seeded = buildWaterAreas(THEATRES, [area({ status: 'OK' })]);
    const eye = seeded.find((a) => a.key === 'theatre:eye');
    expect(eye?.status).toBe('OK');
    expect(eye?.problem).toBeUndefined();
    expect(eye?.actionTaken).toBeUndefined();
  });

  it('reads the notes back off a logged row', () => {
    const row = { areaStatuses: JSON.stringify([area()]) };
    const back = readWaterAreas(row);
    expect(back[0].problem).toContain('riser valve');
    expect(back[0].actionTaken).toContain('works office');
  });

  it('leaves them undefined on a row logged before they existed', () => {
    const row = {
      areaStatuses: JSON.stringify([
        { key: 'theatre:eye', name: 'Eye Theatre', location: 'Eye Theatre', status: 'LEAK' },
      ]),
    };
    expect(readWaterAreas(row)[0].problem).toBeUndefined();
  });
});

describe('the readiness report asked in the same shape', () => {
  const ready = {
    restroomsWaterReady: true,
    scrubbingWaterReady: true,
    theatreActivitiesWaterReady: true,
    noShortageConfirmed: true,
    overallReadiness: 'READY',
  };

  it('has nothing wrong when everything is promised', () => {
    expect(areasNotOk(readinessAreas(ready))).toEqual([]);
  });

  it('covers the four promises and the overall verdict', () => {
    const areas = readinessAreas(ready);
    expect(areas).toHaveLength(READINESS_ASPECTS.length + 1);
    expect(areas.map((a) => a.key)).toContain(READINESS_OVERALL_KEY);
  });

  it('flags a promise that cannot be given', () => {
    const bad = areasNotOk(readinessAreas({ ...ready, scrubbingWaterReady: false }));
    expect(bad).toHaveLength(1);
    expect(bad[0].name).toBe('Surgical scrubbing');
    expect(bad[0].status).toBe('NOT_READY');
  });

  it('flags AT_RISK even when all four promises are given', () => {
    // The tanks are low and the borehole is being worked on: every box can be
    // ticked and the day still be at risk. That is exactly the case the
    // theatre needs chased, and the old form raised nothing for it.
    const bad = areasNotOk(readinessAreas({ ...ready, overallReadiness: 'AT_RISK' }));
    expect(bad).toHaveLength(1);
    expect(bad[0].key).toBe(READINESS_OVERALL_KEY);
    expect(bad[0].status).toBe('AT_RISK');
  });

  it('puts the one problem and action onto every aspect that is not ready', () => {
    const bad = areasNotOk(readinessAreas({
      ...ready,
      restroomsWaterReady: false,
      scrubbingWaterReady: false,
      overallReadiness: 'NOT_READY',
      riskDetails: 'Borehole pump is down',
      actionTaken: 'Tanker ordered for 6am',
    }));
    expect(bad).toHaveLength(3);
    bad.forEach((a) => {
      expect(a.problem).toBe('Borehole pump is down');
      expect(a.actionTaken).toBe('Tanker ordered for 6am');
    });
  });

  it('insists on the plan B through the same check the status form uses', () => {
    const areas = readinessAreas({ ...ready, overallReadiness: 'NOT_READY' });
    expect(missingExplanations(areas, '').join(' ')).toContain('plan B');
  });

  it('says ready, at risk and not ready in words', () => {
    expect(readinessStatusLabel('AT_RISK')).toBe('At risk');
    expect(readinessStatusLabel('NOT_READY')).toBe('Not ready');
    expect(readinessStatusLabel('READY')).toBe('Ready');
  });
});

describe('a fault closes only when somebody looks again', () => {
  const ok = (key: string, name: string): WaterArea => ({
    key, name, location: '', status: 'OK',
  });

  it('opens one for a room that is newly broken', () => {
    const r = reconcileIssues([], [area(), ok('theatre:t1', 'Theatre 1')]);
    expect(r.toOpen.map((a) => a.key)).toEqual(['theatre:eye']);
    expect(r.toClose).toEqual([]);
  });

  it('does not open a second one for a fault already open', () => {
    const r = reconcileIssues([issue()], [area()]);
    expect(r.toOpen).toEqual([]);
    expect(r.toUpdate).toHaveLength(1);
    expect(r.toUpdate[0].issue.id).toBe('i1');
  });

  it('closes it when the same area is looked at and found OK', () => {
    const r = reconcileIssues([issue()], [ok('theatre:eye', 'Eye Theatre')]);
    expect(r.toClose).toHaveLength(1);
    expect(r.toClose[0].issue.id).toBe('i1');
  });

  it('does NOT close it when the report simply never mentions the room', () => {
    // The form is built from the theatre table, so a room taken out of
    // service would otherwise close its own fault by disappearing.
    const r = reconcileIssues([issue()], [ok('theatre:t1', 'Theatre 1')]);
    expect(r.toClose).toEqual([]);
    expect(r.untouched.map((i) => i.id)).toEqual(['i1']);
  });

  it('does NOT close it on a kinder status', () => {
    // A leak becoming low pressure is progress. It is not a fix, and the
    // chase goes on.
    const r = reconcileIssues(
      [issue({ status: 'LEAK' })],
      [area({ status: 'LOW_PRESSURE' })],
    );
    expect(r.toClose).toEqual([]);
    expect(r.toUpdate[0].area.status).toBe('LOW_PRESSURE');
  });

  it('does NOT close it merely because days have passed', () => {
    const old = issue({ openedAt: new Date('2026-01-01T00:00:00Z') });
    const r = reconcileIssues([old], []);
    expect(r.toClose).toEqual([]);
    expect(r.untouched).toHaveLength(1);
  });

  it('handles a report that closes one room and opens another', () => {
    const r = reconcileIssues(
      [issue()],
      [ok('theatre:eye', 'Eye Theatre'), area({ key: 'theatre:t2', name: 'Theatre 2' })],
    );
    expect(r.toClose).toHaveLength(1);
    expect(r.toOpen.map((a) => a.name)).toEqual(['Theatre 2']);
  });
});

describe('how long it has been open', () => {
  const opened = new Date('2026-11-05T06:00:00Z');

  it('counts in minutes, hours and days as it grows', () => {
    expect(openForLabel(opened, new Date('2026-11-05T06:20:00Z'))).toBe('20 minutes');
    expect(openForLabel(opened, new Date('2026-11-05T11:00:00Z'))).toBe('5 hours');
    expect(openForLabel(opened, new Date('2026-11-08T06:00:00Z'))).toBe('3 days');
  });

  it('survives a date it cannot read', () => {
    expect(openForLabel('not a date')).toBe('1 minute');
  });

  it('says nothing at all when nothing is open', () => {
    // A standing "all clear" banner is read once and then never again, and
    // the day it says something else nobody notices.
    expect(reassessmentNotice([])).toBeNull();
  });

  it('names the rooms and the oldest fault', () => {
    const notice = reassessmentNotice(
      [issue(), issue({ id: 'i2', areaKey: 'theatre:t2', areaName: 'Theatre 2', openedAt: new Date('2026-11-01T06:00:00Z') })],
      new Date('2026-11-05T06:00:00Z'),
    );
    expect(notice).toContain('2 water faults');
    expect(notice).toContain('Eye Theatre');
    expect(notice).toContain('4 days');
    expect(notice).toContain('Nothing else closes it');
  });

  it('re-chases a fault that has outlived the assurance given about it', () => {
    const at = new Date('2026-11-05T06:00:00Z');
    expect(needsRechase({ openedAt: at, lastChasedAt: at }, at)).toBe(false);
    const later = new Date(at.getTime() + (RECHASE_AFTER_HOURS + 1) * 3600_000);
    expect(needsRechase({ openedAt: at, lastChasedAt: at }, later)).toBe(true);
  });
});

describe('the message that goes out', () => {
  const message = buildWaterDistressMessage({
    kind: 'STATUS',
    recipientLabel: 'Head of Works Department',
    recipientName: 'Engr. Works',
    areas: [area(), area({ key: 'theatre:t2', name: 'Theatre 2', location: 'Professor Ojukwu Theatre Complex', status: 'LOW_PRESSURE', problem: 'Pressure drops when two taps run', actionTaken: 'Booster pump restarted' })],
    contingencyPlan: '2,000L tanker at 10am; scrub water drawn from Suite 1',
    loggedByName: 'A. Plumber',
    loggedByRole: 'PLUMBER',
    at: new Date('2026-11-06T05:30:00Z'),
    overall: 'CRITICAL',
    overheadTankLevel: 12,
    groundTankLevel: 0,
    locationSentence: 'This water report was logged from inside the hospital site, about 120 m from the centre of the campus.',
    areasChecked: 16,
  });

  it('chases the head of water supply and the head of works, by role', () => {
    expect(DISTRESS_ROLES.map((r) => r.role)).toEqual([
      'WATER_SUPPLY_SUPERVISOR', 'WORKS_SUPERVISOR',
    ]);
  });

  it('names every affected room and where it is', () => {
    expect(message).toContain('Eye Theatre');
    expect(message).toContain('Theatre 2');
    expect(message).toContain('Professor Ojukwu Theatre Complex');
  });

  it('quotes what is wrong and what has already been tried', () => {
    // Without these the message is a summons with no information in it, and
    // the head of works arrives with the wrong tools.
    expect(message).toContain('riser valve');
    expect(message).toContain('Already done: Called the works office');
    expect(message).toContain('Booster pump restarted');
  });

  it('carries the plan B, which is the theatre’s actual question', () => {
    expect(message).toContain('Plan B for water today:');
    expect(message).toContain('2,000L tanker at 10am');
  });

  it('says so plainly when there is no plan B', () => {
    const none = buildWaterDistressMessage({
      kind: 'STATUS', recipientLabel: 'Head of Works Department',
      areas: [area()], contingencyPlan: null,
      loggedByName: 'A. Plumber', at: new Date('2026-11-06T05:30:00Z'),
    });
    expect(none).toContain('none has been given');
  });

  it('says that it does not close by itself', () => {
    expect(message).toContain('does not close by itself');
    expect(message).toContain('re-assess');
  });

  it('gives the tank levels, which say how long there is', () => {
    expect(message).toContain('overhead 12%');
    expect(message).toContain('ground 0%');
  });

  it('reads differently for the readiness report, and names the day', () => {
    const readiness = buildWaterDistressMessage({
      kind: 'READINESS', recipientLabel: 'Head of Water Supply',
      areas: areasNotOk(readinessAreas({
        restroomsWaterReady: true, scrubbingWaterReady: false,
        theatreActivitiesWaterReady: true, noShortageConfirmed: false,
        overallReadiness: 'NOT_READY',
        riskDetails: 'Borehole pump is down', actionTaken: 'Tanker ordered',
      })),
      contingencyPlan: 'Two tankers from 05:30',
      loggedByName: 'B. Supervisor',
      at: new Date('2026-11-06T15:00:00Z'),
      overall: 'NOT_READY',
      forDate: 'Saturday 7 November',
    });
    expect(readiness).toContain('Saturday 7 November');
    expect(readiness).toContain('Not ready');
    expect(readiness).toContain('Surgical scrubbing');
  });

  it('names no patient, and no case', () => {
    // The shared network notice mentions patient records, so the check is
    // against the chase itself: these messages travel on personal handsets
    // and get forwarded, and rooms and water are the whole subject.
    const body = message.split('────────────────────')[0];
    expect(body).not.toMatch(/folder/i);
    expect(body).not.toMatch(/patient/i);
    expect(body).not.toMatch(/surgeon/i);
  });

  it('carries the theatre network notice exactly once', () => {
    expect(message.match(/UNTH-THEATRE-ORM/g) ?? []).toHaveLength(1);
  });

  it('never prints the Wi-Fi key', () => {
    // The key is deliberately kept behind the app login; a forwarded chase
    // would publish it to everybody it reached.
    expect(message).not.toContain('93934015');
  });

  it('gives the bell a line that names rooms rather than counting them', () => {
    const line = distressNotificationLine([area(), area({ key: 'k2', name: 'Theatre 2' })]);
    expect(line).toContain('Eye Theatre (No water)');
    expect(line).toContain('Theatre 2');
  });
});

describe('the page and the API', () => {
  const page = read('src/app/dashboard/plumbing-water-supply/page.tsx');
  const statusApi = read('src/app/api/plumbing-water-supply/route.ts');
  const readinessApi = read('src/app/api/water-supply-readiness/route.ts');
  const schema = read('prisma/schema.prisma');
  const escalate = read('src/lib/water/escalate.ts');

  it('takes a position on both forms, without ever blocking the submit', () => {
    expect(page.match(/await requestFix\(\)/g) ?? []).toHaveLength(2);
    // requestFix resolves with a reason instead of rejecting; nothing here
    // may turn that into a refusal to save.
    expect(page).not.toMatch(/if \(!fix\)[^\n]*return/);
  });

  it('tells the person their location is recorded, before the button', () => {
    expect(page.match(/Your location is recorded with this report/g) ?? []).toHaveLength(2);
  });

  it('stores the position on both reports, assessed on the server', () => {
    expect(statusApi).toContain('fixColumns(fix ?? null)');
    expect(readinessApi).toContain('fixColumns(data.fix ?? null)');
    expect(statusApi).toContain('loggedFixVerdict: where.fixVerdict');
    expect(readinessApi).toContain('loggedFixVerdict: where.fixVerdict');
    expect(schema).toContain('loggedLocationUnavailableReason String?');
  });

  it('checks the explanations on the server as well as in the form', () => {
    // A browser left open since before the deploy posts the old shape.
    expect(statusApi).toContain('missingExplanations(areas, contingencyPlan)');
    expect(readinessApi).toContain('missingExplanations(areas, data.contingencyPlan)');
    expect(page).toContain('missingExplanations(statusAreas, statusData.contingencyPlan)');
  });

  it('raises the chase from both reports through one path', () => {
    expect(statusApi).toContain("source: 'STATUS'");
    expect(readinessApi).toContain("source: 'READINESS'");
    expect(statusApi).toContain('escalateWaterReport({');
    expect(readinessApi).toContain('escalateWaterReport({');
  });

  it('hands the message over as a wa.me link, because the queue is not a delivery', () => {
    expect(escalate).toContain('handoffs.push');
    expect(page).toContain('whatsappLink(h.number, h.text)');
  });

  it('never throws out of the escalation, because the report is already saved', () => {
    expect(escalate).toContain('} catch (e) {');
    expect(escalate).toContain('[water/escalate] failed after the report was saved');
  });

  it('shows what is still open, and offers to re-assess it', () => {
    expect(page).toContain('reassessmentNotice(openIssues)');
    expect(page).toContain('Re-assess and correct the status');
    expect(page).toContain('startReassessment');
  });

  it('keeps the fault table out of the way of the old columns', () => {
    // The seven legacy columns are still written, exactly as before.
    expect(statusApi).toContain('legacyColumnsFor(areas)');
    expect(schema).toContain('model WaterAreaIssue');
  });
});
