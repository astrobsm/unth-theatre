/**
 * A plan whose date has gone past.
 *
 * It looked exactly like one that was still true, so it aged on the list: not
 * operated, not withdrawn, not moved, and counted as "planned" the whole time
 * by the unit card and by the pharmacy reading ahead. The unit that wrote it
 * knew it had slipped. Nobody else did.
 *
 * Overdue is a QUESTION, not a verdict. The case may have been done and not yet
 * published, it may be moving to next week, or it may be off. All three are
 * ordinary; what is not ordinary is leaving it unanswered.
 */
import { describe, expect, it } from 'vitest';
import {
  overdueState,
  slippageNote,
  planChangeReasonProblem,
  newPlanDateProblem,
  PLAN_CHANGE_REASON_MIN,
  type ScheduleDraft,
} from '../../src/lib/surgeryDrafts/draft';

/** Local midday, so a test can never trip over a timezone boundary. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0);
const TODAY = at(2026, 11, 20);

const plan = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  id: 'p1',
  unit: 'PS Unit 2',
  subspecialty: 'Plastic Surgery',
  procedureName: 'Wound debridement',
  status: 'DRAFT',
  ...over,
});

describe('when a plan is overdue', () => {
  it('is overdue the day after its date, and not on the day itself', () => {
    // A case planned for today is not late at nine in the morning. Comparing a
    // date-only target against the clock would make it late from the first
    // minute of the day.
    expect(overdueState(plan({ targetDate: at(2026, 11, 20) }), TODAY).overdue).toBe(false);
    expect(overdueState(plan({ targetDate: at(2026, 11, 21) }), TODAY).overdue).toBe(false);
    expect(overdueState(plan({ targetDate: at(2026, 11, 19) }), TODAY).overdue).toBe(true);
  });

  it('counts the days it has slipped', () => {
    expect(overdueState(plan({ targetDate: at(2026, 11, 19) }), TODAY).daysPast).toBe(1);
    expect(overdueState(plan({ targetDate: at(2026, 11, 6) }), TODAY).daysPast).toBe(14);
    expect(overdueState(plan({ targetDate: at(2026, 11, 20) }), TODAY).daysPast).toBe(0);
  });

  it('survives the hour either side of midnight', () => {
    // WAT is an hour ahead of UTC. A boundary built in UTC would make a case
    // overdue an hour before midnight, which on a late list is a card turning
    // orange while the patient is still on the table.
    const lateYesterday = new Date(2026, 10, 19, 23, 30, 0, 0);
    const earlyToday = new Date(2026, 10, 20, 0, 30, 0, 0);
    expect(overdueState(plan({ targetDate: lateYesterday }), new Date(2026, 10, 19, 23, 45)).overdue)
      .toBe(false);
    expect(overdueState(plan({ targetDate: earlyToday }), new Date(2026, 10, 20, 23, 45)).overdue)
      .toBe(false);
  });

  it('is only ever asked of a plan', () => {
    // A published plan is a booked case and lives on the theatre list; a
    // withdrawn one was answered already. Asking either again would be the
    // system nagging about a decision somebody has made.
    const old = { targetDate: at(2026, 10, 1) };
    expect(overdueState(plan({ ...old, status: 'PUBLISHED' }), TODAY).overdue).toBe(false);
    expect(overdueState(plan({ ...old, status: 'WITHDRAWN' }), TODAY).overdue).toBe(false);
    expect(overdueState(plan({ ...old, status: 'DRAFT' }), TODAY).overdue).toBe(true);
  });

  it('does not call a dateless plan late', () => {
    // An intention without a day is a legitimate state this module has always
    // allowed, and it is not late for anything.
    expect(overdueState(plan({ targetDate: null }), TODAY).overdue).toBe(false);
    expect(overdueState(plan({}), TODAY).overdue).toBe(false);
    expect(overdueState(plan({ targetDate: 'not a date' }), TODAY).overdue).toBe(false);
  });

  it('reads an ISO string as well as a Date', () => {
    // The API returns strings; the card renders them without converting.
    expect(overdueState(plan({ targetDate: '2026-11-19T00:00:00.000Z' }), TODAY).overdue).toBe(true);
  });
});

describe('the reason, which is the point of asking', () => {
  it('insists on one', () => {
    expect(planChangeReasonProblem('')).toContain('Say why');
    expect(planChangeReasonProblem(null)).toContain('Say why');
    expect(planChangeReasonProblem('   ')).toContain('Say why');
  });

  it('refuses an answer too short to mean anything', () => {
    expect(PLAN_CHANGE_REASON_MIN).toBe(5);
    expect(planChangeReasonProblem('no')).toContain('fuller reason');
    expect(planChangeReasonProblem('theatre list full')).toBeNull();
  });

  it('does not count the whitespace somebody padded it with', () => {
    expect(planChangeReasonProblem('  ok  ')).toContain('fuller reason');
  });
});

describe('the new date', () => {
  it('cannot be another date in the past', () => {
    // The fault being fixed is a plan with a date behind it. Answering "when?"
    // with another date behind it answers nothing.
    expect(newPlanDateProblem('2026-11-19', TODAY)).toContain('already passed');
    expect(newPlanDateProblem('2026-11-20', TODAY)).toBeNull();
    expect(newPlanDateProblem('2026-12-10', TODAY)).toBeNull();
  });

  it('insists there is one, and that it can be read', () => {
    expect(newPlanDateProblem('', TODAY)).toContain('Choose the new date');
    expect(newPlanDateProblem('next Tuesday', TODAY)).toContain('cannot be read');
  });
});

describe('how much a plan has slipped', () => {
  it('says nothing about a plan that has not moved', () => {
    expect(slippageNote(plan())).toBeNull();
    expect(slippageNote(plan({ rescheduleCount: 0 }))).toBeNull();
  });

  it('counts the moves and names the first date promised', () => {
    // A case moved once is an ordinary reschedule. A case moved four times is a
    // different thing entirely, and the only place that showed was in
    // somebody's memory.
    const once = slippageNote(plan({ rescheduleCount: 1, originalTargetDate: at(2026, 11, 10) }));
    expect(once).toContain('moved 1 time');
    expect(once).not.toContain('1 times');
    expect(once).toContain('10 Nov');

    const four = slippageNote(plan({ rescheduleCount: 4, originalTargetDate: at(2026, 11, 10) }));
    expect(four).toContain('moved 4 times');
  });

  it('still reports the count when the original date was never captured', () => {
    // Every plan on the system today predates this being recorded, and a count
    // without a first date is still worth saying.
    expect(slippageNote(plan({ rescheduleCount: 2 }))).toBe('moved 2 times');
    expect(slippageNote(plan({ rescheduleCount: 2, originalTargetDate: 'rubbish' })))
      .toBe('moved 2 times');
  });
});
