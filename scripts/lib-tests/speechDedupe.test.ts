import { describe, it, expect } from 'vitest';
import {
  acceptUtterance, normaliseUtterance, stripTrailing, DEFAULT_ECHO_WINDOW_MS,
} from '../../src/lib/speech-dedupe';

// Written against the actual reported output:
//   "25 year old woman 25 year old woman 25 year old woman 25 year old woman
//    with 25 year old woman with"
// which is an echo and a containment, one after the other.

const T = 1_000_000;

describe('normaliseUtterance', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normaliseUtterance('  25 Year-old WOMAN.  '))
      .toBe(normaliseUtterance('25 year old woman'));
  });

  it('is empty for whitespace', () => {
    expect(normaliseUtterance('   ')).toBe('');
  });
});

describe('acceptUtterance — the reported fault', () => {
  it('accepts the first utterance', () => {
    const r = acceptUtterance('25 year old woman', null, T);
    expect(r.accept).toBe(true);
  });

  it('rejects the SAME phrase arriving again immediately', () => {
    // Two sessions overlapping, both emitting the same final result.
    const first = acceptUtterance('25 year old woman', null, T);
    const second = acceptUtterance('25 year old woman', first.state, T + 200);
    expect(second.accept).toBe(false);
    expect(second.reason).toBe('echo');
  });

  it('replaces rather than appends when the repeat has MORE words', () => {
    // "25 year old woman" then "25 year old woman with" — appending both is
    // exactly the doubling in the screenshot.
    const first = acceptUtterance('25 year old woman', null, T);
    const second = acceptUtterance('25 year old woman with', first.state, T + 400);
    expect(second.accept).toBe(true);
    expect(second.replacePrevious).toBe(true);
  });

  it('drops a late-arriving shorter fragment', () => {
    const first = acceptUtterance('25 year old woman with', null, T);
    const second = acceptUtterance('25 year old woman', first.state, T + 300);
    expect(second.accept).toBe(false);
    expect(second.reason).toBe('contained');
  });

  it('survives the whole reported sequence without doubling', () => {
    const sequence = [
      '25 year old woman',
      '25 year old woman',
      '25 year old woman',
      '25 year old woman with',
      '25 year old woman with',
    ];
    let state = null as Parameters<typeof acceptUtterance>[1];
    const appended: string[] = [];
    let t = T;
    for (const s of sequence) {
      const r = acceptUtterance(s, state, t);
      state = r.state;
      if (r.accept) {
        if (r.replacePrevious) appended.pop();
        appended.push(s);
      }
      t += 300;
    }
    // One phrase, in its fullest form — not five.
    expect(appended).toEqual(['25 year old woman with']);
  });
});

describe('acceptUtterance — must not silence a real speaker', () => {
  it('allows the same phrase again after the window', () => {
    // Somebody genuinely repeating themselves pauses for longer than a
    // duplicated event does.
    const first = acceptUtterance('no', null, T);
    const later = acceptUtterance('no', first.state, T + DEFAULT_ECHO_WINDOW_MS + 1);
    expect(later.accept).toBe(true);
  });

  it('does NOT refresh the timestamp on an echo', () => {
    // Otherwise a stream of duplicates would hold the window open forever and a
    // genuine repetition would never get through.
    const first = acceptUtterance('no', null, T);
    const echo = acceptUtterance('no', first.state, T + 100);
    expect(echo.state.lastAt).toBe(first.state.lastAt);

    const genuine = acceptUtterance('no', echo.state, T + DEFAULT_ECHO_WINDOW_MS + 1);
    expect(genuine.accept).toBe(true);
  });

  it('allows different phrases in quick succession', () => {
    const a = acceptUtterance('the patient is stable', null, T);
    const b = acceptUtterance('blood pressure is normal', a.state, T + 100);
    expect(b.accept).toBe(true);
  });

  it('allows a phrase that merely shares a first word', () => {
    // Containment must be a whole-prefix match, or "no" would swallow "not for
    // theatre".
    const a = acceptUtterance('no', null, T);
    const b = acceptUtterance('not for theatre today', a.state, T + 100);
    expect(b.accept).toBe(true);
    expect(b.replacePrevious).toBeUndefined();
  });

  it('rejects an empty utterance without disturbing the state', () => {
    const a = acceptUtterance('the patient is stable', null, T);
    const b = acceptUtterance('   ', a.state, T + 100);
    expect(b.accept).toBe(false);
    expect(b.state.lastText).toBe(a.state.lastText);
  });
});

describe('stripTrailing', () => {
  it('removes the previous phrase from the end', () => {
    expect(stripTrailing('Notes: 25 year old woman', '25 year old woman')).toBe('Notes:');
  });

  it('ignores case when matching', () => {
    expect(stripTrailing('Notes: 25 Year Old Woman', '25 year old woman')).toBe('Notes:');
  });

  it('leaves the value alone when it does not end with the phrase', () => {
    // Never removes text it did not put there.
    expect(stripTrailing('Notes: something else', '25 year old woman'))
      .toBe('Notes: something else');
  });

  it('handles an empty previous phrase', () => {
    expect(stripTrailing('Notes: abc', '')).toBe('Notes: abc');
  });
});
