/**
 * Turning a refusal into a set of choices.
 *
 * Every scheduling refusal in this application used to be a dead end: the
 * theatre is busy at 10:00, and the surgeon — with a patient in front of them —
 * had to leave the form, find the list, work out what was where, and come back.
 * This module answers the question the refusal raised, and these tests are
 * about whether the answers are ones somebody could actually act on.
 *
 * The push-back arithmetic gets its own section because it is the option people
 * will reach for most and the one easiest to get quietly wrong: a plan that
 * overlaps two cases, loses the turnover, or runs the list past the cutoff
 * looks perfectly reasonable on a screen and falls apart in a theatre.
 */
import { describe, expect, it } from 'vitest';

import {
  resolveSchedule, findGaps, insertAndPush,
  type CaseOnList,
} from '../../src/lib/scheduling/resolve';
import { TURNOVER_MINUTES } from '../../src/lib/theatreOps/scheduling';

const c = (
  id: string, scheduledTime: string, estimatedDuration: number, over: Partial<CaseOnList> = {},
): CaseOnList => ({
  id, scheduledTime, estimatedDuration,
  patientName: `Patient ${id}`, procedureName: `Procedure ${id}`,
  ...over,
});

/** A morning list: 09:00-10:30 and 11:00-12:00, with turnover between. */
const morning = [c('a', '09:00', 90), c('b', '11:00', 60)];

describe('when there is no problem', () => {
  it('says so, and offers nothing', () => {
    const r = resolveSchedule({ scheduledTime: '13:00', estimatedDuration: 60 }, morning);
    expect(r.ok).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.options).toHaveLength(0);
  });

  it('still returns the day, because the user asked to see it', () => {
    const r = resolveSchedule({ scheduledTime: '13:00', estimatedDuration: 60 }, morning);
    expect(r.dayList.map((x) => `${x.start}-${x.end}`)).toEqual(['09:00-10:30', '11:00-12:00']);
  });
});

describe('when the theatre is busy', () => {
  const clash = { scheduledTime: '10:00', estimatedDuration: 60 };

  it('names the case in the way rather than describing it', () => {
    const r = resolveSchedule(clash, morning, { otherTheatres: [] });
    expect(r.ok).toBe(false);
    expect(r.blockers[0].kind).toBe('OVERLAP');
    expect(r.blockers[0].clashesWith.map((x) => x.id)).toContain('a');
    expect(r.blockers[0].message).toContain('09:00');
  });

  it('offers to keep the requested time and move the rest', () => {
    const r = resolveSchedule(clash, morning);
    const push = r.options.find((o) => o.kind === 'INSERT_AND_PUSH');
    expect(push).toBeTruthy();
    expect(push!.scheduledTime).toBe('10:00');
  });

  it('offers a free window that disturbs nobody', () => {
    const r = resolveSchedule(clash, morning);
    expect(r.options.some((o) => o.kind === 'FILL_GAP')).toBe(true);
  });

  it('offers another theatre when one is free at that hour', () => {
    const r = resolveSchedule(clash, morning, {
      otherTheatres: [{ theatreId: 't2', theatreName: 'Theatre 2', cases: [c('x', '14:00', 60)] }],
    });
    const other = r.options.find((o) => o.kind === 'OTHER_THEATRE');
    expect(other?.theatreId).toBe('t2');
    expect(other?.scheduledTime).toBe('10:00');
  });

  it('does not offer a theatre that is busy at the same hour', () => {
    const r = resolveSchedule(clash, morning, {
      otherTheatres: [{ theatreId: 't2', theatreName: 'Theatre 2', cases: [c('x', '09:30', 120)] }],
    });
    expect(r.options.some((o) => o.kind === 'OTHER_THEATRE')).toBe(false);
  });

  it('puts the least disruptive option first', () => {
    const r = resolveSchedule(clash, morning, {
      otherTheatres: [{ theatreId: 't2', theatreName: 'Theatre 2', cases: [] }],
    });
    // Moving nobody beats moving somebody.
    expect(r.options[0].moves).toHaveLength(0);
  });

  it('gives every option a start time the caller can act on', () => {
    const r = resolveSchedule(clash, morning, {
      otherTheatres: [{ theatreId: 't2', theatreName: 'Theatre 2', cases: [] }],
    });
    for (const o of r.options) {
      if (o.kind === 'ANOTHER_DAY') continue;
      expect(o.scheduledTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

describe('inserting and pushing the rest back', () => {
  it('moves the case that is in the way to after the new one', () => {
    // New case 10:00-11:00, so 'a' (09:00-10:30) clashes and goes after it:
    // 11:00 plus turnover = 11:20.
    const plan = insertAndPush(morning, { scheduledTime: '10:00', estimatedDuration: 60 });
    expect(plan?.moves.find((m) => m.id === 'a')?.to).toBe('11:20');
  });

  it('pushes the cases behind it as well, in order', () => {
    const plan = insertAndPush(morning, { scheduledTime: '10:00', estimatedDuration: 60 });
    const moves = plan!.moves;
    // 'a' becomes 11:20-12:50, so 'b' (60 min) starts at 13:10.
    expect(moves.find((m) => m.id === 'b')?.to).toBe('13:10');
  });

  it('leaves a case that is genuinely clear of the new one alone', () => {
    const plan = insertAndPush([c('early', '08:00', 30), c('late', '15:00', 30)],
      { scheduledTime: '10:00', estimatedDuration: 60 });
    expect(plan?.moves).toHaveLength(0);
  });

  it('keeps the full turnover between every pair after the shuffle', () => {
    const plan = insertAndPush(morning, { scheduledTime: '10:00', estimatedDuration: 60 })!;
    // Rebuild the day as it would stand and check no two cases touch.
    const after = morning.map((x) => {
      const moved = plan.moves.find((m) => m.id === x.id);
      return { ...x, scheduledTime: moved ? moved.to : x.scheduledTime };
    }).concat([c('new', '10:00', 60)]);

    const rows = after
      .map((x) => {
        const [h, m] = x.scheduledTime.split(':').map(Number);
        const s = h * 60 + m;
        return { s, e: s + x.estimatedDuration };
      })
      .sort((p, q) => p.s - q.s);

    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].s - rows[i - 1].e).toBeGreaterThanOrEqual(TURNOVER_MINUTES);
    }
  });

  it('refuses to plan a shuffle that would run past the cutoff', () => {
    // A full afternoon: pushing everything back cannot fit before 17:00.
    const packed = [c('p1', '09:00', 180), c('p2', '12:30', 180)];
    expect(insertAndPush(packed, { scheduledTime: '09:30', estimatedDuration: 120 })).toBeNull();
  });

  it('will not move a case that has already started', () => {
    const running = [c('live', '09:30', 120, { immovable: true, status: 'IN_PROGRESS' })];
    const plan = insertAndPush(running, { scheduledTime: '10:00', estimatedDuration: 60 });
    expect(plan?.blockedBy?.id).toBe('live');
    expect(plan?.moves).toHaveLength(0);
  });

  it('says so in the blockers rather than quietly dropping the option', () => {
    const running = [c('live', '09:30', 120, { immovable: true, status: 'IN_PROGRESS' })];
    const r = resolveSchedule({ scheduledTime: '10:00', estimatedDuration: 60 }, running);
    expect(r.options.some((o) => o.kind === 'INSERT_AND_PUSH')).toBe(false);
    expect(r.blockers.map((b) => b.message).join(' ')).toMatch(/cannot be moved — it is in progress/);
  });

  it('excludes the case being rescheduled from its own calculation', () => {
    // Moving 'b' to 09:30 must not treat 'b' as an obstacle to itself.
    const plan = insertAndPush(morning, { scheduledTime: '11:00', estimatedDuration: 60, ignoreId: 'b' });
    expect(plan).toBeTruthy();
    expect(plan!.moves.some((m) => m.id === 'b')).toBe(false);
  });
});

describe('finding the free windows', () => {
  it('finds the gap between two cases', () => {
    // 09:00-10:30 and 13:00-14:00 leaves 10:50 to 12:40 once turnover is taken.
    const gaps = findGaps([c('a', '09:00', 90), c('b', '13:00', 60)], 60);
    expect(gaps.some((g) => g.start === '10:50' && g.end === '12:40')).toBe(true);
  });

  it('counts turnover on both sides, so a gap is smaller than it looks', () => {
    // Exactly 60 minutes between two cases is not room for a 60-minute case.
    const tight = [c('a', '09:00', 60), c('b', '11:00', 60)];
    expect(findGaps(tight, 60).some((g) => g.start === '10:20')).toBe(false);
    // 20 minutes of it IS usable, once both turnovers are taken.
    expect(findGaps(tight, 20).some((g) => g.start === '10:20')).toBe(true);
  });

  it('finds the window before the first case', () => {
    const gaps = findGaps([c('a', '13:00', 60)], 60);
    expect(gaps[0].start).toBe('09:00');
  });

  it('finds the window after the last', () => {
    const gaps = findGaps([c('a', '09:00', 60)], 60);
    expect(gaps.some((g) => g.start === '10:20')).toBe(true);
  });

  it('finds nothing in a full day', () => {
    expect(findGaps([c('a', '09:00', 460)], 60)).toHaveLength(0);
  });

  it('ignores a case with an unreadable time rather than throwing', () => {
    const gaps = findGaps([c('bad', 'morning', 60), c('a', '13:00', 60)], 60);
    expect(gaps.length).toBeGreaterThan(0);
  });
});

describe('past the cutoff', () => {
  it('explains what time it would finish', () => {
    const r = resolveSchedule({ scheduledTime: '16:00', estimatedDuration: 180 }, []);
    expect(r.blockers[0].kind).toBe('PAST_CUTOFF');
    expect(r.blockers[0].message).toContain('19:00');
  });

  it('does not offer to push other cases back to make room', () => {
    // Nothing can be moved to create time that does not exist in the day.
    const r = resolveSchedule({ scheduledTime: '16:00', estimatedDuration: 180 }, morning);
    expect(r.options.some((o) => o.kind === 'INSERT_AND_PUSH')).toBe(false);
  });

  it('offers an earlier window when the day has one', () => {
    const r = resolveSchedule({ scheduledTime: '16:00', estimatedDuration: 180 }, []);
    expect(r.options.some((o) => o.kind === 'FILL_GAP')).toBe(true);
  });

  it('falls back to another day when the list is full', () => {
    const r = resolveSchedule({ scheduledTime: '16:00', estimatedDuration: 240 }, [c('a', '09:00', 400)]);
    expect(r.options.map((o) => o.kind)).toContain('ANOTHER_DAY');
  });
});

describe('shortening the estimate', () => {
  it('is offered when a window is nearly big enough', () => {
    // 100 minutes of usable space, for a 120-minute case.
    const tight = [c('a', '09:00', 60), c('b', '12:20', 60)];
    const r = resolveSchedule({ scheduledTime: '10:00', estimatedDuration: 120 }, tight);
    const shorten = r.options.find((o) => o.kind === 'SHORTEN');
    expect(shorten?.estimatedDuration).toBe(100);
  });

  it('warns what it costs, rather than presenting it as free', () => {
    const tight = [c('a', '09:00', 60), c('b', '12:20', 60)];
    const r = resolveSchedule({ scheduledTime: '10:00', estimatedDuration: 120 }, tight);
    expect(r.options.find((o) => o.kind === 'SHORTEN')?.detail)
      .toMatch(/puts the rest of the list behind/);
  });

  it('is ranked below every option that does not shorten anything', () => {
    const tight = [c('a', '09:00', 60), c('b', '12:20', 60)];
    const r = resolveSchedule({ scheduledTime: '10:00', estimatedDuration: 120 }, tight);
    const shortenAt = r.options.findIndex((o) => o.kind === 'SHORTEN');
    expect(shortenAt).toBe(r.options.length - 1);
  });

  it('will not trim a case by more than a fifth', () => {
    // A four-hour case offered a one-hour window has not been shortened, it has
    // been replaced by a different operation. Past that point the honest answer
    // is another day, and it says so.
    const r = resolveSchedule({ scheduledTime: '16:00', estimatedDuration: 240 }, [c('a', '09:00', 400)]);
    expect(r.options.some((o) => o.kind === 'SHORTEN')).toBe(false);
    expect(r.options.map((o) => o.kind)).toContain('ANOTHER_DAY');
  });

  it('never goes below the floor', () => {
    const packed = [c('a', '09:00', 200), c('b', '12:40', 200)];
    const r = resolveSchedule({ scheduledTime: '12:20', estimatedDuration: 60 }, packed, { minimumDuration: 30 });
    const shorten = r.options.find((o) => o.kind === 'SHORTEN');
    expect(shorten === undefined || shorten.estimatedDuration! >= 30).toBe(true);
  });
});

describe('a request that is not a request', () => {
  it('asks for a time when there is not one', () => {
    const r = resolveSchedule({ scheduledTime: 'soon', estimatedDuration: 60 }, morning);
    expect(r.blockers[0].kind).toBe('INVALID_TIME');
  });

  it('still shows the day and the free windows, which are what help', () => {
    const r = resolveSchedule({ scheduledTime: '', estimatedDuration: 60 }, morning);
    expect(r.dayList).toHaveLength(2);
    expect(r.options.some((o) => o.kind === 'FILL_GAP')).toBe(true);
  });

  it('asks for a duration when there is not one', () => {
    const r = resolveSchedule({ scheduledTime: '10:00', estimatedDuration: 0 }, morning);
    expect(r.blockers[0].kind).toBe('INVALID_DURATION');
  });
});
