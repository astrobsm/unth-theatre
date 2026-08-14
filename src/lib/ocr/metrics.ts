/**
 * Measuring how well an OCR engine reads UNTH's documents.
 *
 * Character and Word Error Rate are the standard measures and they are both
 * here. But a headline error rate is close to useless for deciding whether an
 * engine is safe on clinical documents, and it is worth being explicit about
 * why before anyone reads a number off this and picks a provider.
 *
 *   Ground truth : "Morphine 5 mg IM 4 hourly for post-operative pain"
 *   Engine       : "Morphine 15 mg IM 4 hourly for post-operative pain"
 *
 * That is ONE inserted character in forty-eight. CER 2.1%, WER 11%. By any
 * normal reading of those numbers the engine did well. It also just trebled a
 * morphine dose.
 *
 *   Ground truth : "Patient for elective cholecystectomy tomorrow morning"
 *   Engine       : "Patient for elective cholecystectorny tomorrow morning"
 *
 * Also one word wrong, also ~11% WER, and clinically almost harmless — a
 * clinician reading it sees the typo and knows the word.
 *
 * The two failures are indistinguishable in aggregate metrics and could not be
 * less alike in a theatre. So this module reports THREE things, and the third
 * is the one that should decide a provider:
 *
 *   - cer / wer              how well it reads in general
 *   - criticalAccuracy       how well it reads numbers, doses and drug names
 *   - criticalErrors         every one of those errors, individually, so a
 *                            person can look at them rather than at an average
 *
 * An engine with a worse CER and perfect numbers is the better engine here.
 */

export interface Alignment {
  /** 'equal' | 'sub' | 'del' (in truth, missing from output) | 'ins' (invented) */
  op: 'equal' | 'sub' | 'del' | 'ins';
  truth?: string;
  hypothesis?: string;
}

export interface CriticalError {
  kind: 'NUMBER' | 'DRUG' | 'UNIT';
  expected: string;
  got: string | null;
  /** Context from the ground truth, so the error can be understood at a glance. */
  context: string;
  /**
   * True when the two differ by a factor of ten or more, or a decimal point
   * moved. These are the dose errors that kill people, and they are separated
   * from ordinary misreadings deliberately.
   */
  orderOfMagnitude: boolean;
}

export interface OcrScore {
  cer: number;
  wer: number;
  /** Correct critical tokens / critical tokens in the ground truth. 1 when none. */
  criticalAccuracy: number;
  criticalTotal: number;
  criticalCorrect: number;
  criticalErrors: CriticalError[];
  /** Characters and words in the ground truth, so scores can be pooled. */
  truthChars: number;
  truthWords: number;
  charEdits: number;
  wordEdits: number;
}

/**
 * Normalisation for the GENERAL metrics only.
 *
 * Case and surrounding punctuation are folded because "Patient," and "patient"
 * are the same reading for our purposes. Digits and decimal points are never
 * touched: they are the thing being measured.
 */
export function normaliseForScoring(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .toLowerCase();
}

export function tokenise(s: string): string[] {
  return normaliseForScoring(s).split(/\s+/).filter(Boolean);
}

/**
 * Strip punctuation that clings to a word without changing the word.
 *
 * A TRAILING full stop goes too — "5." at the end of a sentence is the number
 * five, and leaving the stop on made it invisible to the number check, which is
 * the one place a miss actually costs something. Only trailing: "0.5" keeps its
 * point because that point is the difference between a dose and a tenfold dose.
 */
function bare(token: string): string {
  return token.replace(/^[^\w.\d]+|[^\w.\d]+$/g, '').replace(/\.+$/, '');
}

// ---------------------------------------------------------------------------
// Edit distance, with the alignment kept.
// ---------------------------------------------------------------------------

/**
 * Levenshtein with backtrace.
 *
 * Full matrix rather than the two-row trick, because the alignment is the
 * point: showing a clinician which words an engine got wrong is worth far more
 * than the scalar, and it is what the benchmark screen displays.
 */
export function align<T>(truth: T[], hyp: T[]): { distance: number; ops: Alignment[] } {
  const m = truth.length;
  const n = hyp.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = truth[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }

  const ops: Alignment[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (truth[i - 1] === hyp[j - 1] ? 0 : 1)) {
      ops.push(truth[i - 1] === hyp[j - 1]
        ? { op: 'equal', truth: String(truth[i - 1]), hypothesis: String(hyp[j - 1]) }
        : { op: 'sub', truth: String(truth[i - 1]), hypothesis: String(hyp[j - 1]) });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ op: 'del', truth: String(truth[i - 1]) });
      i--;
    } else {
      ops.push({ op: 'ins', hypothesis: String(hyp[j - 1]) });
      j--;
    }
  }
  ops.reverse();
  return { distance: d[m][n], ops };
}

// ---------------------------------------------------------------------------
// Critical tokens
// ---------------------------------------------------------------------------

/**
 * Anything that looks like a quantity.
 *
 * Deliberately broad: doses, volumes, pressures, laboratory values, folder
 * numbers, times. A false positive here costs a line in a report; a false
 * negative hides a dose error.
 */
const NUMBER = /^[<>~]?\d+(?:[.,]\d+)?$/;

/**
 * Units that turn a number into a dose. Kept separate from the number because
 * "5 mg" read as "5 mcg" is a thousandfold error with the digit intact.
 */
const UNIT = /^(mg|mcg|µg|ug|g|kg|ml|l|mmol|mol|iu|units?|%|mmhg|mg\/dl|g\/dl|mmol\/l|µmol\/l|umol\/l|ng\/ml|mg\/kg)$/i;

/**
 * Drug names the theatre actually uses.
 *
 * This list ASSISTS measurement only — it never touches recognition, because
 * §12 forbids terminology overwriting an uncertain reading. Its only job here
 * is to notice that a drug name was got wrong so the error is counted where it
 * belongs rather than averaged away.
 */
export const CLINICAL_TERMS = new Set([
  'adrenaline', 'atracurium', 'atropine', 'bupivacaine', 'ceftriaxone',
  'dexamethasone', 'diclofenac', 'ephedrine', 'epinephrine', 'etomidate',
  'fentanyl', 'gentamicin', 'halothane', 'heparin', 'hydralazine',
  'insulin', 'isoflurane', 'ketamine', 'lidocaine', 'lignocaine',
  'metoclopramide', 'metronidazole', 'midazolam', 'morphine', 'naloxone',
  'neostigmine', 'nifedipine', 'noradrenaline', 'ondansetron', 'oxytocin',
  'paracetamol', 'pentazocine', 'pethidine', 'phenylephrine', 'propofol',
  'ranitidine', 'rocuronium', 'sevoflurane', 'suxamethonium', 'thiopentone',
  'tramadol', 'tranexamic', 'vecuronium', 'xylocaine',
]);

export type CriticalKind = 'NUMBER' | 'DRUG' | 'UNIT' | null;

export function criticalKind(token: string): CriticalKind {
  const t = bare(token);
  if (!t) return null;
  if (NUMBER.test(t)) return 'NUMBER';
  if (UNIT.test(t)) return 'UNIT';
  if (CLINICAL_TERMS.has(t.toLowerCase())) return 'DRUG';
  return null;
}

/**
 * Did the number change by a factor of ten or more?
 *
 * "5" read as "15" is threefold and serious. "5" read as "50" is tenfold and is
 * the class of error that reaches a coroner. They are reported separately
 * because a provider comparison should not let the first hide the second.
 */
function isOrderOfMagnitude(expected: string, got: string | null): boolean {
  if (got === null) return false;
  const a = parseFloat(expected.replace(',', '.'));
  const b = parseFloat(got.replace(',', '.'));
  if (!isFinite(a) || !isFinite(b) || a === 0 || b === 0) return false;
  const ratio = a > b ? a / b : b / a;
  return ratio >= 10;
}

/**
 * Did the engine actually get this clinical value right, allowing for the ways
 * OCR mangles spacing and punctuation without changing meaning?
 *
 * Added after the first real run, which reported two errors that were not
 * errors: "umol/L" read as "umol/L." (a trailing full stop) and "4.1" read as
 * "K+4.1" (the engine ran the label into the value). Both preserve the clinical
 * content exactly. Counting them as dose errors would have understated a good
 * engine by nearly a fifth — and a benchmark that invents errors ranks providers
 * as badly as one that hides them.
 *
 * The leniency is deliberately narrow. A number matches only if it appears in
 * the output as a COMPLETE numeric run: "5" inside "15" is not a match, because
 * that is precisely the failure this whole module exists to catch.
 */
function criticalMatches(kind: CriticalKind, truthToken: string, got: string | null): boolean {
  if (got === null) return false;
  const want = bare(truthToken).toLowerCase();
  const have = bare(got).toLowerCase();
  if (!want) return false;
  if (want === have) return true;

  if (kind === 'NUMBER') {
    // Every complete number in the output token, so "k+4.1" yields ["4.1"] and
    // "15" yields ["15"] — the first matches "4.1", the second never matches "5".
    const numbers = have.match(/\d+(?:[.,]\d+)?/g) ?? [];
    return numbers.includes(want.replace(/^[<>~]/, ''));
  }

  if (kind === 'DRUG' || kind === 'UNIT') {
    // A unit or drug name run into a neighbouring token, e.g. "1g" for "g".
    // Bounded so "mg" does not satisfy "mcg".
    const parts = have.split(/[^a-z%/]+/).filter(Boolean);
    return parts.includes(want);
  }

  return false;
}

// ---------------------------------------------------------------------------

export function score(truthText: string, hypText: string): OcrScore {
  const truthChars = normaliseForScoring(truthText).split('');
  const hypChars = normaliseForScoring(hypText).split('');
  const truthWords = tokenise(truthText);
  const hypWords = tokenise(hypText);

  const charResult = align(truthChars, hypChars);
  const wordResult = align(truthWords, hypWords);

  // Critical tokens are judged on the WORD alignment, so a missing word is
  // counted as a missing dose rather than silently shifting every later
  // comparison by one position.
  const criticalErrors: CriticalError[] = [];
  let criticalTotal = 0;
  let criticalCorrect = 0;

  wordResult.ops.forEach((op, index) => {
    const truthToken = op.truth;
    if (!truthToken) return;              // an invention; counted in wer, not here
    const kind = criticalKind(truthToken);
    if (!kind) return;

    criticalTotal++;
    const got = op.op === 'equal' ? op.hypothesis ?? null
      : op.op === 'sub' ? op.hypothesis ?? null
      : null;                              // deleted: the engine dropped it entirely

    if (op.op === 'equal' || criticalMatches(kind, truthToken, got)) {
      criticalCorrect++;
      return;
    }

    // Context from the surrounding ground-truth words, so a reader can see what
    // the number belonged to without opening the document.
    const nearby = wordResult.ops
      .slice(Math.max(0, index - 3), index + 4)
      .map((o) => o.truth)
      .filter(Boolean)
      .join(' ');

    criticalErrors.push({
      kind,
      expected: truthToken,
      got,
      context: nearby,
      orderOfMagnitude: kind === 'NUMBER' && isOrderOfMagnitude(bare(truthToken), got && bare(got)),
    });
  });

  return {
    cer: truthChars.length ? charResult.distance / truthChars.length : 0,
    wer: truthWords.length ? wordResult.distance / truthWords.length : 0,
    criticalAccuracy: criticalTotal ? criticalCorrect / criticalTotal : 1,
    criticalTotal,
    criticalCorrect,
    criticalErrors,
    truthChars: truthChars.length,
    truthWords: truthWords.length,
    charEdits: charResult.distance,
    wordEdits: wordResult.distance,
  };
}

/**
 * Combine per-document scores into one figure for an engine.
 *
 * Pooled by total edits over total length, NOT by averaging per-document rates.
 * Averaging rates lets a short document with one bad word count as much as a
 * full anaesthetic chart read perfectly, which would rank engines by how they
 * handle scraps.
 */
export function pool(scores: OcrScore[]): OcrScore {
  const sum = (f: (s: OcrScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  const truthChars = sum((s) => s.truthChars);
  const truthWords = sum((s) => s.truthWords);
  const charEdits = sum((s) => s.charEdits);
  const wordEdits = sum((s) => s.wordEdits);
  const criticalTotal = sum((s) => s.criticalTotal);
  const criticalCorrect = sum((s) => s.criticalCorrect);

  return {
    cer: truthChars ? charEdits / truthChars : 0,
    wer: truthWords ? wordEdits / truthWords : 0,
    criticalAccuracy: criticalTotal ? criticalCorrect / criticalTotal : 1,
    criticalTotal,
    criticalCorrect,
    criticalErrors: scores.flatMap((s) => s.criticalErrors),
    truthChars,
    truthWords,
    charEdits,
    wordEdits,
  };
}

/**
 * Whether an engine's numbers are good enough to be trusted on clinical
 * documents at all.
 *
 * Not a pass mark for the engine — every reading still goes to a human under
 * §14 and §29. It is the threshold below which offering the engine's output as
 * a starting point does more harm than good, because a transcription that is
 * usually right is read less carefully than one that is obviously unreliable.
 */
export function isSafeForClinicalUse(s: OcrScore): { safe: boolean; reason: string } {
  const magnitude = s.criticalErrors.filter((e) => e.orderOfMagnitude);
  if (magnitude.length > 0) {
    return {
      safe: false,
      reason: `${magnitude.length} order-of-magnitude error(s) on numbers, e.g. "${magnitude[0].expected}" read as "${magnitude[0].got}".`,
    };
  }
  if (s.criticalTotal > 0 && s.criticalAccuracy < 0.98) {
    return {
      safe: false,
      reason: `Numbers, doses and drug names were ${(s.criticalAccuracy * 100).toFixed(1)}% correct; 98% is the minimum.`,
    };
  }
  if (s.cer > 0.15) {
    return {
      safe: false,
      reason: `Character error rate ${(s.cer * 100).toFixed(1)}% is too high to be a useful starting point.`,
    };
  }
  return { safe: true, reason: 'Within thresholds. Every reading still requires human verification.' };
}
