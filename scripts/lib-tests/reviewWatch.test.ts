/**
 * Who a missed preoperative review is charged to.
 *
 * The deadlines are the easy half. The half that decides whether anybody
 * takes the scheme seriously is accountability: a surgeon or anaesthetist who
 * receives one summons they did not deserve will treat every later one as
 * noise, and the audit loses the only lever it has.
 *
 * So the cases below are mostly about NOT summoning people:
 *
 *   the anaesthetist on a case booked at 8pm for the next morning,
 *   the on-call consultant the system fell back to when nobody was rostered,
 *   the anaesthetist who said by 6pm that they could not do it.
 *
 * Each of those has a real failure behind it. None of them is that person's.
 */
import { describe, expect, it } from 'vitest';

import {
  HANDBACK_DEADLINE_HOUR,
  REVIEW_DEADLINE_HOUR,
  handbackDeadline,
  reviewDeadline,
  reviewWatchState,
  accountableFor,
  roleAccountableFor,
  needsHodNotice,
  bookedTooLateToReview,
  isFallbackAssignment,
  type ReviewWatchInput,
} from '../../src/lib/anaesthesia/reviewWatch';

/** A WAT wall-clock moment as the UTC instant it really is. WAT is UTC+1. */
const wat = (iso: string) => new Date(`${iso}+01:00`);

/** Thursday 15 October 2026 is the operating day throughout. */
const SURGERY_DAY = '2026-10-15';

const base: ReviewWatchInput = {
  surgeryDate: `${SURGERY_DAY}T00:00:00.000Z`,
  bookedAt: wat('2026-10-12T10:00:00'),
  status: 'SCHEDULED',
  expectedReviewerId: 'anaes-1',
  assignmentSource: 'subspecialty',
};

describe('the two deadlines', () => {
  it('sets them at 7pm and 9pm WAT the evening before', () => {
    expect(handbackDeadline(base.surgeryDate)).toEqual(wat('2026-10-14T19:00:00'));
    expect(reviewDeadline(base.surgeryDate)).toEqual(wat('2026-10-14T21:00:00'));
  });

  it('keeps the hours as stated', () => {
    expect(HANDBACK_DEADLINE_HOUR).toBe(19);
    expect(REVIEW_DEADLINE_HOUR).toBe(21);
  });

  it('reads the operating date as a WAT day, not as a UTC instant', () => {
    // All four of these are the 15th in Enugu, written differently. The
    // awkward one is 23:30Z on the 14th: that is 00:30 on the 15th in WAT, and
    // reading it as a UTC day would put the deadline a whole day early — on
    // the 13th — for exactly the small-hours cases that least tolerate it.
    for (const form of [
      '2026-10-14T23:30:00.000Z',
      '2026-10-15T00:00:00.000Z',
      '2026-10-15T08:00:00.000Z',
      '2026-10-15',
    ]) {
      expect(reviewDeadline(form), form).toEqual(wat('2026-10-14T21:00:00'));
    }
  });

  it('rolls over at 23:00Z, where the WAT day does', () => {
    // 23:30Z on the 15th is 00:30 on the 16th in Enugu, so it is a 16th case
    // and its deadline is the evening of the 15th. This is the same rule as
    // the previous test seen from the other side, and it is the one that
    // decides which day a midnight case is filed under.
    expect(reviewDeadline('2026-10-15T23:30:00.000Z')).toEqual(wat('2026-10-15T21:00:00'));
  });

  it('crosses a month boundary onto the previous month', () => {
    expect(reviewDeadline('2026-11-01T00:00:00.000Z')).toEqual(wat('2026-10-31T21:00:00'));
  });
});

describe('where a case stands', () => {
  it('is awaiting before 7pm', () => {
    expect(reviewWatchState(base, wat('2026-10-14T16:00:00'))).toBe('AWAITING');
  });

  it('closes the handback window at 7pm exactly', () => {
    expect(reviewWatchState(base, wat('2026-10-14T18:59:00'))).toBe('AWAITING');
    expect(reviewWatchState(base, wat('2026-10-14T19:00:00'))).toBe('HANDBACK_WINDOW_CLOSED');
  });

  it('lapses at 9pm exactly', () => {
    expect(reviewWatchState(base, wat('2026-10-14T20:59:00'))).toBe('HANDBACK_WINDOW_CLOSED');
    expect(reviewWatchState(base, wat('2026-10-14T21:00:00'))).toBe('LAPSED');
  });

  it('stops once the review exists', () => {
    const done = { ...base, reviewedAt: wat('2026-10-14T17:30:00'), reviewedById: 'anaes-1' };
    expect(reviewWatchState(done, wat('2026-10-14T23:00:00'))).toBe('REVIEWED');
  });

  it('stops chasing a cancelled or finished case', () => {
    for (const status of ['CANCELLED', 'COMPLETED', 'IN_PROGRESS']) {
      expect(reviewWatchState({ ...base, status }, wat('2026-10-14T23:00:00'))).toBe('SETTLED');
    }
  });

  it('waits on the HOD once a case is handed back', () => {
    const handed = { ...base, handedBackAt: wat('2026-10-14T17:00:00') };
    expect(reviewWatchState(handed, wat('2026-10-14T18:00:00'))).toBe('AWAITING_REASSIGNMENT');
    // Still their window to act, even past 7pm — saying "closed" while they
    // can still fix it tells them the wrong thing.
    expect(reviewWatchState(handed, wat('2026-10-14T20:00:00'))).toBe('AWAITING_REASSIGNMENT');
  });

  it('goes back to awaiting once somebody is named', () => {
    const fixed = {
      ...base,
      handedBackAt: wat('2026-10-14T17:00:00'),
      reassignedToId: 'anaes-2',
      reassignedAt: wat('2026-10-14T17:40:00'),
    };
    expect(reviewWatchState(fixed, wat('2026-10-14T18:00:00'))).toBe('AWAITING');
  });
});

describe('a case booked too late to review', () => {
  it('is excused when the booking lands after 7pm the evening before', () => {
    const late = { ...base, bookedAt: wat('2026-10-14T20:00:00') };
    expect(bookedTooLateToReview(late)).toBe(true);
    const who = accountableFor(late);
    expect(who?.ground).toBe('booked-too-late');
    // THE POINT. Nobody is named, least of all the anaesthetist.
    expect(who?.userId).toBeNull();
    expect(who?.reason).toMatch(/booked after 7pm/i);
  });

  it('is not excused when booked before 7pm, however tight', () => {
    // 6:59pm leaves two hours and one minute. Tight, possible, not excused.
    const tight = { ...base, bookedAt: wat('2026-10-14T18:59:00') };
    expect(bookedTooLateToReview(tight)).toBe(false);
    expect(accountableFor(tight)?.userId).toBe('anaes-1');
  });

  it('beats every other ground', () => {
    // Late booking AND a fallback assignment AND no handback. The booking is
    // still the finding: the others could not have happened in time either.
    const late = {
      ...base,
      bookedAt: wat('2026-10-14T22:00:00'),
      assignmentSource: 'on-call' as const,
    };
    expect(accountableFor(late)?.ground).toBe('booked-too-late');
  });

  it('is not claimed when the booking time is unknown', () => {
    // An absent bookedAt must not silently excuse a lapse.
    expect(bookedTooLateToReview({ ...base, bookedAt: null })).toBe(false);
    expect(accountableFor({ ...base, bookedAt: null })?.userId).toBe('anaes-1');
  });
});

describe('a name that came from a fallback', () => {
  it('treats on-call cover and a foreign list as a rota gap', () => {
    for (const source of ['on-call', 'other-specialty', 'none'] as const) {
      expect(isFallbackAssignment(source), source).toBe(true);
      const who = accountableFor({ ...base, assignmentSource: source });
      // Not the person the fallback landed on.
      expect(who?.userId, source).toBeNull();
      expect(who?.ground, source).toBe('rota-gap');
    }
  });

  it('still charges somebody named by hand', () => {
    // 'unrostered' means a person chose them deliberately. Weaker than a
    // roster, but it is an assignment and they knew about it.
    expect(isFallbackAssignment('unrostered')).toBe(false);
    expect(accountableFor({ ...base, assignmentSource: 'unrostered' })?.userId).toBe('anaes-1');
  });

  it('calls the HOD for a rota gap', () => {
    expect(roleAccountableFor('rota-gap')).toBe('HEAD_OF_ANAESTHESIA');
  });

  it('treats no anaesthetist at all as a rota gap', () => {
    const none = { ...base, expectedReviewerId: null };
    expect(accountableFor(none)?.ground).toBe('rota-gap');
    expect(accountableFor(none)?.userId).toBeNull();
  });
});

describe('handing a case back', () => {
  it('clears the anaesthetist who told the HOD in time', () => {
    const handed = { ...base, handedBackAt: wat('2026-10-14T18:00:00') };
    const who = accountableFor(handed);
    expect(who?.ground).toBe('hod-did-not-reassign');
    expect(who?.userId).toBeNull();
    expect(roleAccountableFor(who!.ground)).toBe('HEAD_OF_ANAESTHESIA');
  });

  it('clears them at 7pm exactly — the rule says "before 7pm", and 19:00 is the deadline', () => {
    const onTime = { ...base, handedBackAt: wat('2026-10-14T19:00:00') };
    expect(accountableFor(onTime)?.ground).toBe('hod-did-not-reassign');
  });

  it('charges them when they left it until after 7pm', () => {
    const tooLate = { ...base, handedBackAt: wat('2026-10-14T19:01:00') };
    const who = accountableFor(tooLate);
    expect(who?.ground).toBe('handed-back-too-late');
    expect(who?.userId).toBe('anaes-1');
  });

  it('moves the duty to whoever the HOD named', () => {
    const reassigned = {
      ...base,
      handedBackAt: wat('2026-10-14T17:00:00'),
      reassignedToId: 'anaes-2',
      reassignedAt: wat('2026-10-14T17:30:00'),
    };
    const who = accountableFor(reassigned);
    expect(who?.ground).toBe('reassigned-and-did-not-review');
    expect(who?.userId).toBe('anaes-2');
    // Emphatically not the person who handed it over correctly.
    expect(who?.userId).not.toBe('anaes-1');
  });
});

describe('the ordinary case', () => {
  it('charges the assigned anaesthetist who did neither thing', () => {
    const who = accountableFor(base);
    expect(who?.ground).toBe('did-not-review');
    expect(who?.userId).toBe('anaes-1');
    expect(who?.reason).toMatch(/before 9pm/);
    expect(who?.reason).toMatch(/before 7pm/);
  });

  it('charges nobody once it is reviewed', () => {
    expect(accountableFor({ ...base, reviewedAt: wat('2026-10-14T20:00:00') })).toBeNull();
  });

  it('names no role when an individual is accountable', () => {
    for (const g of ['did-not-review', 'handed-back-too-late', 'reassigned-and-did-not-review'] as const) {
      expect(roleAccountableFor(g), g).toBeNull();
    }
    // A late booking has a person too — the booker — but the caller finds
    // them from the surgery, not from a role.
    expect(roleAccountableFor('booked-too-late')).toBeNull();
  });

  it('gives every ground a reason somebody could act on', () => {
    const inputs: ReviewWatchInput[] = [
      base,
      { ...base, bookedAt: wat('2026-10-14T20:00:00') },
      { ...base, assignmentSource: 'on-call' },
      { ...base, handedBackAt: wat('2026-10-14T18:00:00') },
      { ...base, handedBackAt: wat('2026-10-14T20:00:00') },
      { ...base, handedBackAt: wat('2026-10-14T17:00:00'), reassignedToId: 'anaes-2' },
    ];
    const grounds = new Set<string>();
    for (const i of inputs) {
      const who = accountableFor(i);
      expect(who).not.toBeNull();
      expect(who!.reason.length).toBeGreaterThan(40);
      grounds.add(who!.ground);
    }
    // All six grounds are reachable — a ground nothing can produce is a
    // branch nobody has thought about.
    expect(grounds.size).toBe(6);
  });
});

describe('telling the HOD while they can still act', () => {
  it('says nothing before 7pm', () => {
    expect(needsHodNotice(base, wat('2026-10-14T18:00:00'))).toBe(false);
  });

  it('speaks up between 7pm and 9pm', () => {
    expect(needsHodNotice(base, wat('2026-10-14T19:30:00'))).toBe(true);
  });

  it('speaks up for a handback nobody has answered', () => {
    const handed = { ...base, handedBackAt: wat('2026-10-14T17:00:00') };
    expect(needsHodNotice(handed, wat('2026-10-14T17:05:00'))).toBe(true);
  });

  it('stops once the case has lapsed — too late to be of use', () => {
    expect(needsHodNotice(base, wat('2026-10-14T21:30:00'))).toBe(false);
  });

  it('stops once reviewed', () => {
    const done = { ...base, reviewedAt: wat('2026-10-14T19:10:00') };
    expect(needsHodNotice(done, wat('2026-10-14T19:30:00'))).toBe(false);
  });

  it('does not pester the HOD about a case booked too late to review', () => {
    const late = { ...base, bookedAt: wat('2026-10-14T20:00:00') };
    expect(needsHodNotice(late, wat('2026-10-14T20:30:00'))).toBe(false);
  });

  it('stops for a cancelled case', () => {
    expect(needsHodNotice({ ...base, status: 'CANCELLED' }, wat('2026-10-14T19:30:00'))).toBe(false);
  });
});
