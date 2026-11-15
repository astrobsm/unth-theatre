// ============================================================
// The values in [square brackets] — what the committee is actually deciding
// ------------------------------------------------------------
// The draft carries around forty bracketed values: "[11:00]", "[24 hours]",
// "[80%]", "[number] clinical assistants", "[agreed secure location]". They are
// open proposals, and they are the part of the policy most likely to be settled
// badly. In a group chat a time gets agreed by whoever answers last, and six
// months later nobody can say how many people supported it.
//
// So each one is pulled out and asked about on its own, with its surrounding
// sentence, and tallied.
//
// WHAT IS NOT A DECISION ITEM, and why each exclusion is here:
//
//   [text](url)   a Markdown link. The draft cites circulars this way, and
//                 treating a link label as an open value would ask the
//                 committee to choose a new value for "the 2024 circular".
//   [ ] and [x]   task-list checkboxes. Appendix F is a form with these; every
//                 one of them would otherwise become a decision item.
//   [1], [2]      footnote markers, where the document uses them. A bare
//                 integer is ambiguous -- "[3]" could be a footnote or a
//                 genuinely proposed count -- so these are NOT excluded, they
//                 are typed as NUMBER and left for the owner to dismiss in the
//                 preview. Guessing wrong in the direction of asking is
//                 recoverable; guessing wrong in the direction of silence is
//                 not, because nobody can dismiss a question they never saw.
// ============================================================

export type DecisionItemType =
  | 'TIME'
  | 'PERCENTAGE'
  | 'NUMBER'
  | 'DURATION'
  | 'FREE_TEXT'
  | 'CHOICE';

export interface DetectedDecisionItem {
  /** Exactly as it appears, brackets included: "[11:00]". */
  placeholder: string;
  /** The text inside the brackets: "11:00". */
  currentValue: string;
  type: DecisionItemType;
  surroundingSentence: string;
  /** Offered alternatives, where the value reads as a choice. */
  options: string[] | null;
  /** Position within the section body, so ordering is document ordering. */
  index: number;
}

/** How much context to keep. A table row or a long clause, not a page. */
const MAX_SENTENCE = 400;

const TIME_RE = /^\d{1,2}[:.]\d{2}\s*(?:am|pm|hrs|h)?$/i;
const PERCENT_RE = /^\d+(?:\.\d+)?\s*(?:%|per\s?cent|percent)$/i;
const NUMBER_RE = /^\d+(?:\.\d+)?$/;
const DURATION_RE =
  /^(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty-four)\s*[-\s]?\s*(?:second|minute|min|hour|hr|day|week|month|year)s?$/i;
const NUMBER_WORD_RE = /^(?:number|count|how\s+many|n)(?:\s+of\s+.*)?$/i;

/**
 * What kind of value is this?
 *
 * Exported and tested on the real strings from the draft, because the type
 * decides which control a reviewer is shown on a phone. Typing "[24 hours]" as
 * free text gives them an empty box where a duration picker belongs; typing
 * "[agreed secure location]" as a number gives them a spinner for a store room.
 */
export function guessDecisionItemType(value: string): DecisionItemType {
  const v = value.trim();
  if (v === '') return 'FREE_TEXT';

  if (TIME_RE.test(v)) return 'TIME';
  if (PERCENT_RE.test(v)) return 'PERCENTAGE';
  if (DURATION_RE.test(v)) return 'DURATION';
  if (NUMBER_RE.test(v)) return 'NUMBER';
  if (NUMBER_WORD_RE.test(v)) return 'NUMBER';

  // "weekly / fortnightly", "Monday or Thursday" — a short list of named
  // alternatives. Guarded on length so a sentence containing the word "or"
  // does not become a two-option dropdown.
  if (splitChoices(v) !== null) return 'CHOICE';

  return 'FREE_TEXT';
}

/**
 * The alternatives in a choice-shaped value, or null if it is not one.
 *
 * Deliberately conservative: at most four options, each short and none reading
 * as prose. "[agreed secure location]" has no separator and stays free text;
 * "[11:00 or 14:00]" becomes two options.
 *
 * NOTE WHAT IS NOT TESTED FOR. An earlier version rejected any part containing
 * `.` `:` `;` `!` or `?` as "sentence punctuation", which silently rejected
 * every time: "11:00" contains a colon and "15.30" contains a full stop, so the
 * two forms this draft uses most were the two it refused. Prose is recognised
 * by its LENGTH and by the punctuation that only prose uses.
 */
export function splitChoices(value: string): string[] | null {
  const v = value.trim();
  const parts = v
    .split(/\s*(?:\/|\bor\b|,)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p !== '');

  if (parts.length < 2 || parts.length > 4) return null;
  const readsAsProse = (p: string) =>
    p.length > 40 || p.split(/\s+/).length > 5 || /[;!?]/.test(p);
  if (parts.some(readsAsProse)) return null;
  return parts;
}

/**
 * The sentence a placeholder sits in.
 *
 * Bounded by sentence punctuation or a line break, so a placeholder inside a
 * Markdown table row yields that row — which is the most useful context there
 * is for the appendices, where the open values live in tables.
 */
export function surroundingSentenceOf(body: string, start: number, end: number): string {
  const isBoundary = (ch: string) => ch === '\n' || ch === '.' || ch === '!' || ch === '?';

  let from = start;
  while (from > 0 && !isBoundary(body[from - 1])) from -= 1;

  let to = end;
  while (to < body.length && !isBoundary(body[to])) to += 1;
  if (to < body.length && body[to] !== '\n') to += 1; // keep the full stop

  let sentence = body.slice(from, to).replace(/\s+/g, ' ').trim();
  // Table rows arrive as "| a | b |"; the pipes read as noise in a question.
  sentence = sentence.replace(/^\|\s*/, '').replace(/\s*\|$/, '').replace(/\s*\|\s*/g, ' — ');

  if (sentence.length > MAX_SENTENCE) {
    sentence = `${sentence.slice(0, MAX_SENTENCE - 1).trimEnd()}…`;
  }
  return sentence;
}

/** A Markdown link `[label](href)` — the bracket is a label, not a value. */
function isMarkdownLink(body: string, end: number): boolean {
  return body[end] === '(';
}

/** A task-list checkbox `[ ]`, `[x]`, `[X]`. */
function isCheckbox(inner: string): boolean {
  return /^[\sxX]?$/.test(inner);
}

/**
 * Every bracketed open value in one section body, in document order.
 *
 * Non-greedy and single-level: a nested bracket would be a fault in the draft,
 * and the owner sees the result in the preview either way.
 */
export function detectDecisionItems(body: string): DetectedDecisionItem[] {
  const out: DetectedDecisionItem[] = [];
  if (!body) return out;

  const re = /\[([^\[\]\n]*)\]/g;
  let match: RegExpExecArray | null = re.exec(body);

  while (match !== null) {
    const inner = match[1];
    const start = match.index;
    const end = start + match[0].length;

    if (!isCheckbox(inner) && !isMarkdownLink(body, end)) {
      const currentValue = inner.trim();
      out.push({
        placeholder: match[0],
        currentValue,
        type: guessDecisionItemType(currentValue),
        surroundingSentence: surroundingSentenceOf(body, start, end),
        options: splitChoices(currentValue),
        index: start,
      });
    }

    match = re.exec(body);
  }

  return out;
}
