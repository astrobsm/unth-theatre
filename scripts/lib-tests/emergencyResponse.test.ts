/**
 * Emergency response monitoring.
 *
 * The behaviour worth pinning down: a board built only from the acknowledgements
 * that EXIST shows a tidy list of the people who answered and hides the
 * departments that never did. Since the ones who never answered are what holds
 * the case up, most of these tests are about absence.
 */
import { describe, expect, it } from 'vitest';

import {
  ANSWER_LABEL,
  CORE_ROLES,
  isComing,
  minutesBetween,
  REQUIRED_ROLES,
  RESPONSE_OVERDUE_MINUTES,
  responseBoard,
  responseMinutes,
  roleState,
  summarise,
  urgencyOrder,
} from './theatreOps/emergencyResponse';

const BOOKED = new Date('2026-08-05T09:00:00.000Z');
const at = (m: number) => new Date(BOOKED.getTime() + m * 60_000);

const r = (role: string, status: string | null, minutesLater: number | null, extra: any = {}) => ({
  role,
  userId: `u-${role}`,
  userName: `Staff ${role}`,
  status,
  respondedAt: minutesLater === null ? null : at(minutesLater),
  etaMinutes: null,
  distanceKm: null,
  ...extra,
});

describe('the clock', () => {
  it('counts whole minutes', () => {
    expect(minutesBetween(BOOKED, at(7))).toBe(7);
  });

  it('does not run backwards', () => {
    expect(minutesBetween(at(10), BOOKED)).toBe(0);
  });

  it('has no answer for someone who has not answered', () => {
    expect(responseMinutes(BOOKED, null)).toBe(null);
  });

  it('records how long an answer took', () => {
    expect(responseMinutes(BOOKED, at(4))).toBe(4);
  });
});

describe('where one role stands', () => {
  it('is settled once they answer, whatever they answered', () => {
    // "Unable to attend" is an answer, and a useful one — it lets a
    // coordinator start looking for cover instead of waiting.
    expect(roleState({ respondedAt: at(3), requestedAt: BOOKED, now: at(40) })).toBe('RESPONDED');
  });

  it('is merely awaited early on', () => {
    expect(roleState({ respondedAt: null, requestedAt: BOOKED, now: at(5) })).toBe('AWAITING');
  });

  it('becomes overdue once the wait is unreasonable', () => {
    expect(roleState({ respondedAt: null, requestedAt: BOOKED, now: at(RESPONSE_OVERDUE_MINUTES) }))
      .toBe('OVERDUE');
  });
});

describe('who is coming', () => {
  it('counts available, already-in-theatre and en route', () => {
    expect(isComing('AVAILABLE')).toBe(true);
    expect(isComing('ARRIVED')).toBe(true);
    expect(isComing('EN_ROUTE')).toBe(true);
  });

  it('does not count someone tied up or unable to attend', () => {
    expect(isComing('ON_ANOTHER_CASE')).toBe(false);
    expect(isComing('UNAVAILABLE')).toBe(false);
    expect(isComing(null)).toBe(false);
  });

  it('words the answers the way the specification does', () => {
    expect(ANSWER_LABEL.ARRIVED).toBe('Already in theatre');
    expect(ANSWER_LABEL.UNAVAILABLE).toBe('Unable to attend');
  });
});

describe('the board', () => {
  it('lists every required department, not only those who replied', () => {
    // THE test. Two acknowledgements must not become a two-row board.
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: [r('SURGEON', 'AVAILABLE', 2), r('ANAESTHETIST', 'EN_ROUTE', 3)],
      now: at(5),
    });
    expect(b.rows.length).toBe(REQUIRED_ROLES.length);
    expect(b.responded).toBe(2);
    expect(b.awaiting).toBe(REQUIRED_ROLES.length - 2);
  });

  it('blocks the case when a core role has nobody coming', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: [r('SURGEON', 'AVAILABLE', 1), r('SCRUB_NURSE', 'AVAILABLE', 1)],
      now: at(4),
    });
    expect(b.canProceed).toBe(false);
    expect(b.blocking).toContain('Anaesthetist');
    expect(summarise(b)).toContain('Cannot start');
  });

  it('lets the case proceed once the three that matter are coming', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: CORE_ROLES.map((role) => r(role, 'AVAILABLE', 2)),
      now: at(6),
    });
    expect(b.canProceed).toBe(true);
    expect(b.blocking).toEqual([]);
  });

  it('does not treat "unable to attend" as coming', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: [
        r('SURGEON', 'AVAILABLE', 1),
        r('ANAESTHETIST', 'UNAVAILABLE', 1),
        r('SCRUB_NURSE', 'AVAILABLE', 1),
      ],
      now: at(5),
    });
    // They answered — so nothing is overdue — but the case still cannot run.
    expect(b.responded).toBe(3);
    expect(b.canProceed).toBe(false);
    expect(b.blocking).toEqual(['Anaesthetist']);
  });

  it('prefers the person who said yes when two answer for one role', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: [
        { ...r('PORTER', 'UNAVAILABLE', 1), userName: 'Says no' },
        { ...r('PORTER', 'EN_ROUTE', 4), userName: 'Says yes' },
      ],
      now: at(6),
    });
    const porter = b.rows.find((x) => x.role === 'PORTER')!;
    expect(porter.userName).toBe('Says yes');
    expect(porter.coming).toBe(true);
  });

  it('escalates silence as the clock runs', () => {
    const early = responseBoard({ requestedAt: BOOKED, responses: [], now: at(5) });
    const late = responseBoard({ requestedAt: BOOKED, responses: [], now: at(30) });
    expect(early.overdue).toBe(0);
    expect(late.overdue).toBe(REQUIRED_ROLES.length);
  });

  it('remembers the slowest answer for afterwards', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: [r('SURGEON', 'AVAILABLE', 2), r('BLOODBANK_STAFF', 'AVAILABLE', 26)],
      now: at(30),
    });
    expect(b.slowestMinutes).toBe(26);
  });

  it('has no slowest answer when nobody has answered', () => {
    expect(responseBoard({ requestedAt: BOOKED, responses: [], now: at(9) }).slowestMinutes).toBe(null);
  });
});

describe('a case that is over', () => {
  it('does not demand a surgeon for a case that already ran', () => {
    // Caught by rehearsing against live data: a COMPLETED emergency from last
    // week reported "Cannot start — no surgeon or anaesthetist or scrub
    // nurse". False, and alarming. Nobody acknowledged through the app; the
    // case ran anyway, hours ago.
    const b = responseBoard({ requestedAt: BOOKED, responses: [], now: at(4000), closed: true });
    expect(b.closed).toBe(true);
    expect(summarise(b)).toContain('Closed');
    expect(summarise(b)).not.toContain('Cannot start');
  });

  it('says plainly when nobody acknowledged', () => {
    const b = responseBoard({ requestedAt: BOOKED, responses: [], now: at(4000), closed: true });
    expect(summarise(b)).toContain('nobody acknowledged');
  });

  it('counts the departments that did', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: [r('SURGEON', 'AVAILABLE', 3), r('PORTER', 'EN_ROUTE', 8)],
      now: at(4000),
      closed: true,
    });
    expect(summarise(b)).toContain('2 of 12');
  });

  it('is open unless it is told otherwise', () => {
    expect(responseBoard({ requestedAt: BOOKED, responses: [], now: at(5) }).closed).toBe(false);
  });

  it('sinks below every live case, however long ago it was booked', () => {
    const live = responseBoard({ requestedAt: BOOKED, responses: [], now: at(30) });
    const done = responseBoard({ requestedAt: at(-5000), responses: [], now: at(30), closed: true });
    const ordered = urgencyOrder([{ id: 'done', board: done }, { id: 'live', board: live }]);
    expect(ordered[0].id).toBe('live');
  });
});

describe('the line a coordinator reads first', () => {
  it('names the missing role rather than counting it', () => {
    const b = responseBoard({ requestedAt: BOOKED, responses: [r('SURGEON', 'AVAILABLE', 1)], now: at(2) });
    // "waiting on the anaesthetist" is actionable; "11 outstanding" is not.
    expect(summarise(b).toLowerCase()).toContain('anaesthetist');
  });

  it('reports a fully answered emergency plainly', () => {
    const b = responseBoard({
      requestedAt: BOOKED,
      responses: REQUIRED_ROLES.map((role) => r(role, 'AVAILABLE', 2)),
      now: at(5),
    });
    expect(summarise(b)).toContain('answered');
  });
});

describe('which emergency needs a phone call', () => {
  const board = (mins: number, canProceed: boolean) =>
    responseBoard({
      requestedAt: at(-mins),
      responses: canProceed ? CORE_ROLES.map((role) => r(role, 'AVAILABLE', -mins + 1)) : [],
      now: BOOKED,
    });

  it('puts a blocked case above a settled one, however old', () => {
    const ordered = urgencyOrder([
      { id: 'settled', board: board(90, true) },
      { id: 'blocked', board: board(5, false) },
    ]);
    expect(ordered[0].id).toBe('blocked');
  });

  it('among blocked cases, the longest wait is first', () => {
    const ordered = urgencyOrder([
      { id: 'newer', board: board(5, false) },
      { id: 'older', board: board(40, false) },
    ]);
    expect(ordered[0].id).toBe('older');
  });

  it('does not reorder the caller\'s array', () => {
    const input = [{ id: 'a', board: board(5, true) }, { id: 'b', board: board(40, false) }];
    urgencyOrder(input);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
