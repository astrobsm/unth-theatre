// ============================================================
// Stopping dictation repeating itself
// ------------------------------------------------------------
// Reported: "25 year old woman 25 year old woman 25 year old woman…" — the same
// phrase appended over and over, on both desktop and phone.
//
// The result handler already reads from `event.resultIndex`, so it is not the
// classic replay-from-zero bug. The cause is OVERLAPPING SESSIONS: continuous
// recognition ends on its own every few seconds, a restart is scheduled, and if
// the new session begins before the old one has finished delivering, both emit
// the same final phrase. Android Chrome is particularly prone to it, and it also
// happens on desktop when the network stalls mid-utterance.
//
// Rather than chase every browser's timing, the fix is stated as a rule about
// the TEXT: the same final phrase, from the same speaker, within a short window,
// is one utterance. Somebody genuinely repeating themselves pauses for longer
// than a duplicated event does.
//
// Pure and clock-injected, so it can be tested without a microphone.
// ============================================================

/**
 * How long an identical phrase is treated as an echo rather than a repetition.
 *
 * 2.5 seconds: long enough to cover a duplicate arriving from an overlapping
 * session (tens of milliseconds to about a second), short enough that a person
 * deliberately saying "no. no." is still recorded twice.
 */
export const DEFAULT_ECHO_WINDOW_MS = 2500;

export interface DedupeState {
  lastText: string;
  lastAt: number;
}

/** Compare on words, so punctuation and spacing do not hide a duplicate. */
export function normaliseUtterance(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // Punctuation becomes a SPACE, not nothing: a hyphen joins two words, so
    // deleting it turns "year-old" into "yearold" and a real duplicate stops
    // matching its own echo.
    // ASCII class rather than \p{L}: the build target predates Unicode property
    // escapes, and this only has to spot a duplicate of the same words.
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    // Trailing punctuation became a space above, so trim AFTER collapsing.
    .trim();
}

export interface AcceptResult {
  accept: boolean;
  /** What to store for the next comparison. Unchanged when rejected. */
  state: DedupeState;
  reason?: 'echo' | 'contained' | 'empty';
}

/**
 * Should this final transcript be appended?
 *
 * Two rejections, both observed in the reported output:
 *
 *   echo       the identical phrase again, within the window
 *   contained  the new phrase is the previous one plus more, which is what a
 *              restarted session produces when it re-delivers an utterance it
 *              had already emitted — "25 year old woman" then
 *              "25 year old woman with". Appending both gives the doubling in
 *              the screenshot.
 *
 * The containment rule replaces rather than skips, so the LONGER version wins
 * and nothing the person said is lost.
 */
export function acceptUtterance(
  incoming: string,
  state: DedupeState | null,
  now: number,
  windowMs: number = DEFAULT_ECHO_WINDOW_MS
): AcceptResult & { replacePrevious?: boolean } {
  const text = normaliseUtterance(incoming);
  if (!text) {
    return { accept: false, state: state ?? { lastText: '', lastAt: now }, reason: 'empty' };
  }

  if (!state || now - state.lastAt > windowMs) {
    return { accept: true, state: { lastText: text, lastAt: now } };
  }

  if (text === state.lastText) {
    // Same phrase again inside the window: an echo, not a repetition. The
    // timestamp is NOT refreshed, so a genuine third utterance after the window
    // still gets through rather than being held off indefinitely.
    return { accept: false, state, reason: 'echo' };
  }

  if (text.startsWith(state.lastText + ' ')) {
    // A superset of what was just appended — the restarted session re-delivering
    // with more words. Replace rather than append, so the longer version wins
    // and the person's words are neither doubled nor lost.
    return {
      accept: true,
      replacePrevious: true,
      state: { lastText: text, lastAt: now },
    };
  }

  if (state.lastText.startsWith(text + ' ')) {
    // A shorter prefix of what is already there — a late-arriving earlier
    // fragment. Dropping it keeps the fuller text.
    return { accept: false, state, reason: 'contained' };
  }

  return { accept: true, state: { lastText: text, lastAt: now } };
}

/**
 * Remove a trailing occurrence of `previous` from `value`, for the replace case.
 *
 * Works on the raw text rather than the normalised form, so the user's own
 * capitalisation and punctuation elsewhere in the field are untouched.
 */
export function stripTrailing(value: string, previousRaw: string): string {
  const trimmedValue = value.trimEnd();
  const prev = previousRaw.trim();
  if (!prev) return value;
  if (trimmedValue.toLowerCase().endsWith(prev.toLowerCase())) {
    return trimmedValue.slice(0, trimmedValue.length - prev.length).trimEnd();
  }
  return value;
}
