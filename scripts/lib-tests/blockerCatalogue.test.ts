/**
 * Turning a refusal into something a person can act on.
 *
 * The thing being protected is restraint as much as coverage. A dialog that
 * appears on every failure, saying "something went wrong" on top of a message
 * that already said so, is an extra click in the way of somebody who is already
 * stuck — and people learn to dismiss it without reading. So the tests below
 * are in two halves: the refusals it must explain, and the ones it must leave
 * alone.
 *
 * The validation shapes are taken from what this codebase actually returns.
 * There are three, in use simultaneously, and a dialog that handles some of
 * them teaches people not to trust it.
 */
import { describe, expect, it } from 'vitest';

import {
  describeBlocker, readFieldProblems, humaniseField, HANDLED_ELSEWHERE,
} from '../../src/lib/blockers/catalogue';

const refuse = (over: Partial<Parameters<typeof describeBlocker>[0]> = {}) => ({
  status: 400,
  url: '/api/surgeries',
  method: 'POST',
  body: {},
  ...over,
});

describe('the three validation shapes', () => {
  it('reads an array of Zod issues under details', () => {
    const f = readFieldProblems({
      error: 'Validation',
      details: [{ path: ['scheduledTime'], message: 'Enter a start time as HH:MM.' }],
    });
    expect(f).toHaveLength(1);
    expect(f[0].label).toBe('Scheduled time');
    expect(f[0].name).toBe('scheduledTime');
  });

  it('reads a flattened object under details', () => {
    const f = readFieldProblems({
      error: 'Validation failed',
      details: { fieldErrors: { procedureName: ['Required'] }, formErrors: [] },
    });
    expect(f).toHaveLength(1);
    expect(f[0].label).toBe('Procedure name');
    expect(f[0].message).toBe('Required');
  });

  it('reads the array when it was put under error itself', () => {
    const f = readFieldProblems({ error: [{ path: ['unit'], message: 'Required' }] });
    expect(f[0].label).toBe('Unit');
  });

  it('reads the form-level messages out of a flattened error', () => {
    const f = readFieldProblems({ details: { fieldErrors: {}, formErrors: ['Pick a date first.'] } });
    expect(f[0].label).toBe('This form');
    expect(f[0].message).toBe('Pick a date first.');
  });

  it('reads the operation note’s own problems, which are already plain words', () => {
    const f = readFieldProblems({
      problems: [{ field: 'feedingAt', message: 'Feeds are to start at a specified time, but no time is given.' }],
    });
    expect(f[0].name).toBe('feedingAt');
    expect(f[0].message).toMatch(/no time is given/);
  });

  it('finds nothing in a body that carries none', () => {
    expect(readFieldProblems({ error: 'Forbidden' })).toHaveLength(0);
    expect(readFieldProblems(null)).toHaveLength(0);
    expect(readFieldProblems('not an object')).toHaveLength(0);
  });
});

describe('naming a field the way a person would', () => {
  it('splits camel case', () => {
    expect(humaniseField('scheduledTime')).toBe('Scheduled time');
    expect(humaniseField('estimatedDuration')).toBe('Estimated duration');
  });

  it('uses the last segment of a path, not the shape of the request', () => {
    expect(humaniseField(['patient', 'folderNumber'])).toBe('Folder number');
  });

  it('copes with nothing rather than printing undefined', () => {
    expect(humaniseField(undefined)).toBe('This field');
    expect(humaniseField([])).toBe('This field');
  });
});

describe('incomplete information', () => {
  const body = {
    error: 'Validation failed',
    details: [
      { path: ['procedureName'], message: 'Required' },
      { path: ['indication'], message: 'Required' },
    ],
  };

  it('says how many things need attention, not "validation failed"', () => {
    const b = describeBlocker(refuse({ body }))!;
    expect(b.title).toBe('2 things need attention');
    expect(b.why).not.toMatch(/validation/i);
  });

  it('lists every field, so nobody has to submit twice to find the second one', () => {
    expect(describeBlocker(refuse({ body }))!.fields).toHaveLength(2);
  });

  it('offers to put the cursor in the first one', () => {
    const fix = describeBlocker(refuse({ body }))!.fixes.find((f) => f.kind === 'field');
    expect(fix?.field).toBe('procedureName');
  });

  it('states the single problem in the heading when there is only one', () => {
    const one = describeBlocker(refuse({
      body: { details: [{ path: ['scheduledTime'], message: 'Enter a start time as HH:MM.' }] },
    }))!;
    expect(one.title).toBe('One thing needs attention');
    expect(one.why).toBe('Scheduled time: Enter a start time as HH:MM.');
  });
});

describe('refusals that mean "go and do something else first"', () => {
  it('sends somebody to register a patient the server has never seen', () => {
    const b = describeBlocker(refuse({ status: 404, body: { error: 'Patient not found' } }))!;
    expect(b.code).toBe('NO_PATIENT');
    expect(b.fixes.find((f) => f.kind === 'go')?.href).toBe('/dashboard/patients/new');
  });

  it('warns that the patient may already be on file under a different spelling', () => {
    const b = describeBlocker(refuse({ status: 404, body: { error: 'Patient not found' } }))!;
    expect(b.fixes.map((f) => f.detail).join(' ')).toMatch(/typed differently/);
  });

  it('sends somebody to the review board when the patient is not marked fit', () => {
    const b = describeBlocker(refuse({
      status: 409, body: { code: 'NOT_FIT_FOR_ANAESTHESIA', error: 'Not fit.' },
    }))!;
    expect(b.fixes.find((f) => f.kind === 'go')?.href).toBe('/dashboard/anaesthetist-board');
  });

  it('sends somebody to the shelf when there is not enough stock', () => {
    const b = describeBlocker(refuse({
      status: 409, url: '/api/stock/issue', body: { code: 'INSUFFICIENT_STOCK', error: 'Only 2 left.' },
    }))!;
    expect(b.why).toContain('Only 2 left.');
    expect(b.fixes.find((f) => f.kind === 'go')?.href).toBe('/dashboard/theatre-supply');
  });
});

describe('who you are, and what you may do', () => {
  it('explains a sign-out rather than showing "Unauthorized"', () => {
    const b = describeBlocker(refuse({ status: 401, body: { error: 'Unauthorized' } }))!;
    expect(b.code).toBe('SIGNED_OUT');
    expect(b.why).toMatch(/Nothing was saved/);
    expect(b.fixes[0].href).toBe('/auth/login');
  });

  it('says whose permission is needed, and that it takes a minute', () => {
    const b = describeBlocker(refuse({ status: 403, body: { error: 'Forbidden' } }))!;
    expect(b.code).toBe('NO_ACCESS');
    expect(b.fixes.map((f) => f.detail).join(' ')).toMatch(/administrator can grant it/);
  });
});

describe('the network, and the server', () => {
  it('tells somebody offline that the work is kept, not lost', () => {
    const b = describeBlocker(refuse({ offline: true }))!;
    expect(b.code).toBe('OFFLINE');
    expect(b.why).toMatch(/kept here/);
    expect(b.severity).toBe('warn');
  });

  it('does not tell somebody offline to press the button again', () => {
    // Pressing again is exactly how a queued booking becomes two bookings.
    const b = describeBlocker(refuse({ offline: true }))!;
    expect(b.fixes.some((f) => f.kind === 'retry')).toBe(false);
  });

  it('offers a retry on a server error, and says it is safe', () => {
    const b = describeBlocker(refuse({ status: 500, body: { error: 'Internal server error' } }))!;
    expect(b.fixes.some((f) => f.kind === 'retry')).toBe(true);
    expect(b.fixes.find((f) => f.kind === 'retry')?.detail).toMatch(/Nothing was saved/);
  });

  it('treats a file that is too large as a thing to fix, not a failure', () => {
    const b = describeBlocker(refuse({ status: 413, body: {} }))!;
    expect(b.code).toBe('TOO_LARGE');
    expect(b.fixes[0].detail).toMatch(/photograph taken on a phone/);
  });
});

describe('what it must leave alone', () => {
  it('stands aside for the screens that already do this properly', () => {
    for (const code of Array.from(HANDLED_ELSEWHERE)) {
      expect(describeBlocker(refuse({ status: 409, body: { code, error: 'x' } }))).toBeNull();
    }
  });

  it('says nothing when the response says nothing', () => {
    // A dialog reading "something went wrong" is an extra click in the way of
    // somebody who is already stuck.
    expect(describeBlocker(refuse({ status: 400, body: {} }))).toBeNull();
    expect(describeBlocker(refuse({ status: 400, body: null }))).toBeNull();
  });

  it('does not treat the word "Validation" as a reason worth showing', () => {
    expect(describeBlocker(refuse({ status: 400, body: { error: 'Validation' } }))).toBeNull();
  });

  it('passes the server’s own sentence through when it is a real one', () => {
    const b = describeBlocker(refuse({
      status: 400, body: { error: 'The deposit must be confirmed before booking.' },
    }))!;
    expect(b.why).toBe('The deposit must be confirmed before booking.');
  });
});

describe('every blocker is usable', () => {
  const samples = [
    refuse({ status: 401, body: { error: 'Unauthorized' } }),
    refuse({ status: 403, body: { error: 'Forbidden' } }),
    refuse({ status: 413, body: {} }),
    refuse({ status: 500, body: { error: 'boom' } }),
    refuse({ offline: true }),
    refuse({ status: 404, body: { error: 'Patient not found' } }),
    refuse({ body: { details: [{ path: ['a'], message: 'Required' }] } }),
  ];

  it('always offers at least one thing to do', () => {
    for (const s of samples) {
      const b = describeBlocker(s)!;
      expect(b.fixes.length).toBeGreaterThan(0);
    }
  });

  it('always gives a title short enough to read at a glance', () => {
    for (const s of samples) {
      expect(describeBlocker(s)!.title.length).toBeLessThan(45);
    }
  });

  it('never leaves the reason empty', () => {
    for (const s of samples) {
      expect(describeBlocker(s)!.why.trim().length).toBeGreaterThan(10);
    }
  });

  it('gives every "go" fix somewhere to go', () => {
    for (const s of samples) {
      for (const fix of describeBlocker(s)!.fixes) {
        if (fix.kind === 'go') expect(fix.href).toMatch(/^\//);
        if (fix.kind === 'field') expect(fix.field).toBeTruthy();
      }
    }
  });
});

/**
 * Blocks the form works out for itself — a time outside theatre hours, a step
 * that needs an earlier one done first — never reach the server, and they are
 * the ones people get most stuck on. They go through the same dialog, so there
 * is only one way of being told no.
 */
describe('raising a block from the form itself', () => {
  const withWindow = (fn: (events: CustomEvent[]) => void) => {
    const events: CustomEvent[] = [];
    const prev = (globalThis as any).window;
    (globalThis as any).window = {
      dispatchEvent: (e: CustomEvent) => { events.push(e); return true; },
      CustomEvent,
    };
    try { fn(events); } finally { (globalThis as any).window = prev; }
  };

  it('always leaves a button, even when the caller offers none', async () => {
    const { raiseBlock, RAISE_EVENT } = await import('../../src/lib/blockers/raise');
    withWindow((events) => {
      raiseBlock({ title: 'Outside theatre hours', why: 'The list runs 09:00 to 17:00.' });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(RAISE_EVENT);
      expect(events[0].detail.fixes.length).toBeGreaterThan(0);
      expect(events[0].detail.severity).toBe('block');
    });
  });

  it('keeps the fixes the form gave it', async () => {
    const { raiseBlock } = await import('../../src/lib/blockers/raise');
    withWindow((events) => {
      raiseBlock({
        title: 'The procedure is not set',
        why: 'The picker is empty.',
        fixes: [{ kind: 'field', label: 'Take me to it', field: 'procedureName' }],
      });
      expect(events[0].detail.fixes[0].field).toBe('procedureName');
    });
  });

  it('does nothing at all on the server rather than throwing', async () => {
    const { raiseBlock } = await import('../../src/lib/blockers/raise');
    const prev = (globalThis as any).window;
    (globalThis as any).window = undefined;
    try {
      expect(() => raiseBlock({ title: 'x', why: 'y' })).not.toThrow();
    } finally { (globalThis as any).window = prev; }
  });
});
