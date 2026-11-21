/**
 * Giving a review round more time.
 *
 * The bug this fixes: the Chairman's only Reopen button posted
 * `{ action: 'reopen' }` with no date, and the API refuses that on a lapsed
 * round — rightly, because every personal link expires with the round, so
 * reopening on the old deadline hands every member an EXPIRED page. The one
 * button offered for the job could therefore never do it, and the only way
 * left to extend a review was a database edit.
 *
 * Most of what follows is about composing a LOCAL wall-clock time correctly.
 * The committee is in WAT, `datetime-local` inputs carry no zone, and
 * toISOString() is UTC. Mix those up and a deadline set for 23:59 lands an
 * hour out — on a closing deadline, that is somebody's response lost.
 */
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_PRESETS,
  DEFAULT_EXTENSION_HOURS,
  presetLabel,
  extendedTo,
  extendFrom,
  deadlinePassed,
  hoursLeft,
  extensionProblem,
  deadlineText,
  toLocalInputValue,
  fromLocalInputValue,
  describeExtension,
  extensionPayload,
} from '../../src/lib/policy/extend';

// The round in question closed Thursday 19 November 2026 at 23:59.
const CLOSED_AT = new Date(2026, 10, 19, 23, 59, 0, 0);
// Asked on Saturday 21 November, mid-morning.
const NOW = new Date(2026, 10, 21, 10, 30, 0, 0);

describe('the offers', () => {
  it('leads with the forty-eight hours that is what gets asked for', () => {
    expect(DEFAULT_EXTENSION_HOURS).toBe(48);
    expect(EXTENSION_PRESETS).toContain(48);
  });

  it('names each one the way a person would', () => {
    expect(presetLabel(24)).toBe('1 days');
    expect(presetLabel(48)).toBe('2 days');
    expect(presetLabel(168)).toBe('7 days');
    expect(presetLabel(6)).toBe('6 hours');
  });
});

describe('where the extension counts from', () => {
  it('runs from NOW when the round has already lapsed', () => {
    // THE WHOLE POINT. "Another 48 hours" asked on Saturday about a round that
    // shut on Thursday means two days from Saturday. Counting from the old
    // deadline would reopen it already half spent — and on a round lapsed by
    // more than the extension, would reopen it into the past, which the API
    // then refuses, leaving the owner pressing a button that does nothing.
    const to = extendFrom(CLOSED_AT, NOW, 48);
    expect(deadlineText(to)).toBe('23 Nov 2026, 10:30');
    expect(to.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('runs from the deadline when the round is still live', () => {
    // Extending a round that has not closed yet should ADD to the time
    // remaining, not restart the clock and quietly shorten it.
    const stillOpen = new Date(2026, 10, 25, 23, 59);
    const to = extendFrom(stillOpen, NOW, 48);
    expect(deadlineText(to)).toBe('27 Nov 2026, 23:59');
  });

  it('never returns a time in the past, however long ago the round shut', () => {
    const ancient = new Date(2025, 0, 1, 0, 0);
    for (const h of EXTENSION_PRESETS) {
      expect(extendFrom(ancient, NOW, h).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('drops the seconds, because a deadline to the second is noise', () => {
    const odd = new Date(2026, 10, 21, 10, 30, 37, 412);
    expect(extendedTo(odd, 48).getSeconds()).toBe(0);
    expect(extendedTo(odd, 48).getMilliseconds()).toBe(0);
  });
});

describe('whether the deadline has gone', () => {
  it('knows this one had', () => {
    expect(deadlinePassed(CLOSED_AT, NOW)).toBe(true);
    expect(hoursLeft(CLOSED_AT, NOW)).toBeLessThan(0);
  });

  it('counts the exact moment as passed', () => {
    // At 23:59:00 the round is shut. Treating the boundary as still open gives
    // a minute in which the screen says open and the API says expired.
    expect(deadlinePassed(CLOSED_AT, new Date(CLOSED_AT.getTime()))).toBe(true);
  });

  it('knows a live one is live', () => {
    expect(deadlinePassed(new Date(2026, 10, 25), NOW)).toBe(false);
    expect(hoursLeft(new Date(2026, 10, 25), NOW)).toBeGreaterThan(0);
  });
});

describe('refusing a date that will not work', () => {
  it('refuses an empty box rather than silently doing nothing', () => {
    expect(extensionProblem({ closesAt: null, now: NOW })).toContain('Pick the date');
  });

  it('refuses a time already gone, and says what to do instead', () => {
    const p = extensionProblem({ closesAt: CLOSED_AT, now: NOW });
    expect(p).toContain('already passed');
    // Closing the round is the legitimate thing somebody might have meant.
    expect(p).toContain('close the round');
  });

  it('refuses a mistyped year', () => {
    // 2062 instead of 2026. Not a clinical limit — a guard against a two-day
    // extension becoming one nobody notices has never ended.
    expect(extensionProblem({ closesAt: new Date(2062, 10, 23), now: NOW }))
      .toContain('two years');
  });

  it('refuses an unparseable date', () => {
    expect(extensionProblem({ closesAt: new Date('nonsense'), now: NOW })).toBeTruthy();
  });

  it('accepts the forty-eight hours being asked for', () => {
    expect(extensionProblem({ closesAt: extendFrom(CLOSED_AT, NOW, 48), now: NOW }))
      .toBeNull();
  });
});

describe('writing the time down', () => {
  it('composes it by hand, never through the machine locale', () => {
    // toLocaleString prints "Nov 21" here and "21 Nov" on the theatre server.
    // A closing time that reads differently in two places is exactly what an
    // argument about a late response turns on.
    expect(deadlineText(new Date(2026, 10, 21, 9, 5))).toBe('21 Nov 2026, 09:05');
    expect(deadlineText(new Date(2026, 0, 1, 0, 0))).toBe('1 Jan 2026, 00:00');
  });
});

describe('the datetime-local round trip', () => {
  it('fills the input with LOCAL parts, not an ISO string', () => {
    // THE TRAP. toISOString() is UTC; this machine and the server are WAT. Feed
    // an ISO string to a wall-clock input and every deadline shows an hour
    // early, silently, every time.
    const d = new Date(2026, 10, 23, 23, 59);
    expect(toLocalInputValue(d)).toBe('2026-11-23T23:59');
    expect(toLocalInputValue(d)).not.toContain('Z');
  });

  it('pads single digits so the input accepts it', () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });

  it('reads the value back as the same wall-clock time', () => {
    const d = new Date(2026, 10, 23, 23, 59);
    const back = fromLocalInputValue(toLocalInputValue(d));
    expect(back).not.toBeNull();
    expect(deadlineText(back!)).toBe(deadlineText(d));
    expect(back!.getHours()).toBe(23);
  });

  it('refuses a value carrying a zone, rather than shifting it', () => {
    // '2026-11-23T23:59Z' parses as UTC and would land at 00:59 local. Refusing
    // it is the only honest option: there is no way to tell which the writer
    // meant.
    expect(fromLocalInputValue('2026-11-23T23:59Z')).toBeNull();
    expect(fromLocalInputValue('2026-11-23T23:59+01:00')).toBeNull();
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('tomorrow')).toBeNull();
  });
});

describe('what gets sent to the API', () => {
  const to = extendFrom(CLOSED_AT, NOW, 48);

  it('sends reopen AND a date for a closed round', () => {
    // Either alone is refused: the action without a date because the old one
    // has passed, the date alone because a CLOSED round stays closed.
    const payload = extensionPayload({ status: 'CLOSED', closesAt: to });
    expect(payload.action).toBe('reopen');
    expect(payload.closesAt).toBe(to.toISOString());
  });

  it('sends the date alone for a round that is open but lapsed', () => {
    // Sending `reopen` for one of these is refused with "That round is already
    // open", which reads as a bug to whoever pressed the button.
    const payload = extensionPayload({ status: 'OPEN', closesAt: to });
    expect(payload.action).toBeUndefined();
    expect(payload.closesAt).toBe(to.toISOString());
  });

  it('sends UTC on the wire, whatever the input showed', () => {
    // Local in the box, ISO on the wire. The API parses with new Date(), so
    // anything else is a deadline an hour out on the server.
    expect(extensionPayload({ status: 'CLOSED', closesAt: to }).closesAt).toMatch(/Z$/);
  });
});

describe('the sentence shown before the button is pressed', () => {
  it('says it is reopening, and for how long, when the round has lapsed', () => {
    const text = describeExtension(CLOSED_AT, extendFrom(CLOSED_AT, NOW, 48), NOW);
    expect(text).toContain('Reopening');
    expect(text).toContain('19 Nov 2026');
    expect(text).toContain('2 days');
    expect(text).toContain('23 Nov 2026, 10:30');
  });

  it('says it is moving the date when the round is still live', () => {
    const open = new Date(2026, 10, 25, 23, 59);
    const text = describeExtension(open, extendFrom(open, NOW, 48), NOW);
    expect(text).toContain('Moving the deadline');
    expect(text).not.toContain('Reopening');
  });
});
