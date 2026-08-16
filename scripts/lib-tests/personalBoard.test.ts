import { describe, it, expect } from 'vitest';
import {
  buildPersonalBoard, dutiesForRole, boardSummary, sortBoard,
  QUERY_CUTOFF, BoardItem,
} from '../../src/lib/dashboard/personalBoard';

const NOW = new Date('2026-08-18T08:00:00.000Z');

const query = (over: Partial<Parameters<typeof buildPersonalBoard>[0]['queries'][0]> = {}) => ({
  id: 'q1', referenceNumber: 'Q-001', subject: 'Late start', status: 'ISSUED',
  deadlineTime: '2026-08-19T08:00:00.000Z', createdAt: '2026-08-18T07:00:00.000Z',
  ...over,
});

const board = (over: Partial<Parameters<typeof buildPersonalBoard>[0]> = {}) =>
  buildPersonalBoard({ role: 'SCRUB_NURSE', now: NOW, queries: [], tasks: [], ...over });

describe('the cutoff — start clean, do not import a backlog', () => {
  it('ignores a query raised before 17 August 2026', () => {
    const items = board({ queries: [query({ createdAt: '2026-08-16T09:00:00.000Z' })] });
    expect(items.filter((i) => i.kind === 'QUERY')).toHaveLength(0);
  });

  it('shows a query raised on or after the cutoff', () => {
    const items = board({ queries: [query({ createdAt: QUERY_CUTOFF.toISOString() })] });
    expect(items.filter((i) => i.kind === 'QUERY')).toHaveLength(1);
  });

  it('the cutoff does not move with time', () => {
    // A relative cutoff would mean two people logging in on different days saw
    // different history for the same query.
    expect(QUERY_CUTOFF.toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });
});

describe('queries', () => {
  it('gives every query somewhere to go', () => {
    const [item] = board({ queries: [query()] });
    expect(item.actionUrl).toContain('/dashboard/queries/q1');
    expect(item.actionLabel).toMatch(/respond/i);
  });

  it('marks an overdue query CRITICAL, a pending one HIGH', () => {
    const overdue = board({ queries: [query({ deadlineTime: '2026-08-18T07:00:00.000Z' })] })[0];
    const pending = board({ queries: [query()] })[0];
    expect(overdue.severity).toBe('CRITICAL');
    expect(overdue.title).toMatch(/OVERDUE/);
    expect(pending.severity).toBe('HIGH');
  });

  it('drops a query already responded to', () => {
    for (const status of ['RESPONDED', 'RESOLVED', 'DISMISSED']) {
      const items = board({ queries: [query({ status })] });
      expect(items.filter((i) => i.kind === 'QUERY')).toHaveLength(0);
    }
  });

  it('treats a query as compulsory', () => {
    expect(board({ queries: [query()] })[0].compulsory).toBe(true);
  });
});

describe('standing duties by role', () => {
  it('reminds a scrub nurse about Theatre Reception and the porter', () => {
    const duties = dutiesForRole('SCRUB_NURSE');
    const reception = duties.find((d) => d.id === 'scrub-reception');
    expect(reception).toBeTruthy();
    expect(reception?.detail).toMatch(/porter/i);
    expect(reception?.compulsory).toBe(true);
  });

  it('reminds recovery about the ward escort log and the porter', () => {
    const duty = dutiesForRole('RECOVERY_NURSE').find((d) => d.id === 'recovery-escort');
    expect(duty?.detail).toMatch(/escort log/i);
    expect(duty?.detail).toMatch(/porter/i);
  });

  it('reminds an anaesthetist about review, prescriptions and consumables', () => {
    const duty = dutiesForRole('ANAESTHETIST').find((d) => d.id === 'anaesthetist-review');
    expect(duty?.detail).toMatch(/consumables/i);
    expect(duty?.detail).toMatch(/prescription/i);
  });

  it('reminds an anaesthetist to start monitoring and chart drugs', () => {
    const duty = dutiesForRole('ANAESTHETIST').find((d) => d.id === 'anaesthetist-charting');
    expect(duty?.title).toMatch(/monitoring/i);
    expect(duty?.detail).toMatch(/chart/i);
  });

  it('does not give a scrub nurse the anaesthetist duties', () => {
    // The whole point of a personal board: other people's work is not on it.
    const ids = dutiesForRole('SCRUB_NURSE').map((d) => d.id);
    expect(ids).not.toContain('anaesthetist-review');
  });

  it('is case insensitive about the role', () => {
    expect(dutiesForRole('scrub_nurse')).toHaveLength(dutiesForRole('SCRUB_NURSE').length);
  });

  it('gives an unknown role no duties rather than everybody’s', () => {
    expect(dutiesForRole('PORTER')).toHaveLength(0);
  });
});

describe('ordering — the top of the list must be the thing that matters', () => {
  it('puts an overdue query above everything', () => {
    const items = board({
      queries: [query({ deadlineTime: '2026-08-18T07:00:00.000Z' })],
      tasks: [{ id: 't1', title: 'Routine task' }],
    });
    expect(items[0].kind).toBe('QUERY');
    expect(items[0].severity).toBe('CRITICAL');
  });

  it('puts an overdue task above an on-time one', () => {
    const items = board({
      tasks: [
        { id: 'ontime', title: 'Later today', dueAt: '2026-08-18T16:00:00.000Z' },
        { id: 'late', title: 'Late task', dueAt: '2026-08-18T06:00:00.000Z' },
      ],
    });
    const late = items.findIndex((i) => i.id === 'task:late');
    const ontime = items.findIndex((i) => i.id === 'task:ontime');
    expect(late).toBeLessThan(ontime);
  });

  it('ranks a pending query above an equally urgent overdue task', () => {
    // Both are HIGH, so kind decides, and a query wins. That is deliberate: a
    // query has a hard deadline that escalates on its own if it is missed,
    // whereas a late task escalates only when a person notices. Recorded as a
    // test because it is a judgement, not an obvious truth — if the theatre
    // decides clinical work should come first, this is the line to change.
    const items = board({
      queries: [query()],
      tasks: [{ id: 'late', title: 'Late task', dueAt: '2026-08-18T06:00:00.000Z' }],
    });
    expect(items.findIndex((i) => i.kind === 'QUERY'))
      .toBeLessThan(items.findIndex((i) => i.id === 'task:late'));
  });

  it('sorts equal items by the nearest deadline', () => {
    const sorted = sortBoard([
      { id: 'b', kind: 'TASK', severity: 'NORMAL', title: 'later', dueAt: new Date('2026-08-20') },
      { id: 'a', kind: 'TASK', severity: 'NORMAL', title: 'sooner', dueAt: new Date('2026-08-19') },
    ] as BoardItem[]);
    expect(sorted[0].id).toBe('a');
  });

  it('puts standing reminders below real work', () => {
    const items = board({ tasks: [{ id: 't1', title: 'A task' }] });
    const task = items.findIndex((i) => i.kind === 'TASK');
    const reminder = items.findIndex((i) => i.kind === 'REMINDER');
    expect(task).toBeLessThan(reminder);
  });
});

describe('boardSummary', () => {
  it('leads with overdue when something is overdue', () => {
    const items = board({ queries: [query({ deadlineTime: '2026-08-18T07:00:00.000Z' })] });
    expect(boardSummary(items)).toMatch(/overdue/i);
  });

  it('counts queries when nothing is overdue', () => {
    expect(boardSummary(board({ queries: [query()] }))).toMatch(/quer/i);
  });

  it('says so plainly when there is nothing outstanding', () => {
    expect(boardSummary(board())).toMatch(/nothing outstanding/i);
  });
});
