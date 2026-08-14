import { criticalKind, CriticalKind } from './metrics';

/**
 * Deciding what a clinician must check before OCR text touches a record.
 *
 * This is the part of the system that refuses to guess. Everything else —
 * capture, geometry, engines — exists to give this module something to work
 * with; if it gets the decision wrong, a wrong dose reaches a patient with a
 * confident tick beside it.
 *
 * Two independent reasons to demand verification, and BOTH must be able to
 * trigger it alone:
 *
 *   1. The engine was unsure.  Low confidence, or two engines disagreed.
 *   2. The value is dangerous. A drug name, a dose, an identifier, a blood
 *      group. These require a human EVEN AT 100% CONFIDENCE, because a
 *      recogniser's confidence is a statement about pixels, not about
 *      medicine, and an engine can be perfectly certain and perfectly wrong.
 *
 * Reason 2 is the one systems get wrong. Confidence thresholds alone will
 * eventually pass "Morphine 15 mg" through at 99% because the handwriting was
 * beautifully clear — and it was, it just said 5.
 */

/** §14. Configurable by an administrator; these are the defaults. */
export interface ConfidenceThresholds {
  /** At or above: display normally. */
  high: number;
  /** At or above: display normally, allow review. */
  good: number;
  /** At or above: highlight as questionable. */
  moderate: number;
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  high: 0.98,
  good: 0.95,
  moderate: 0.90,
};

export type ConfidenceBand = 'HIGH' | 'GOOD' | 'MODERATE' | 'LOW';

export function bandFor(
  confidence: number | null | undefined,
  t: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): ConfidenceBand {
  // Absent confidence is treated as LOW, never as high. An engine that reports
  // no confidence has told us nothing, and "nothing" must not read as "fine".
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return 'LOW';
  if (confidence >= t.high) return 'HIGH';
  if (confidence >= t.good) return 'GOOD';
  if (confidence >= t.moderate) return 'MODERATE';
  return 'LOW';
}

/**
 * §14 and §29: categories requiring confirmation whatever the confidence.
 *
 * Kept as a list rather than a boolean so the verification record can say WHAT
 * the clinician was asked to confirm, not merely that they confirmed.
 */
export type HighRiskCategory =
  | 'DRUG_NAME' | 'DOSE' | 'UNIT' | 'ROUTE' | 'FREQUENCY'
  | 'ALLERGY' | 'BLOOD_GROUP' | 'PATIENT_IDENTIFIER'
  | 'DIAGNOSIS' | 'PROCEDURE' | 'DATE_TIME'
  | 'VITAL_SIGN' | 'LAB_VALUE' | 'IMPLANT' | 'BLOOD_PRODUCT' | 'CONSENT';

/** Routes. Confusing IM for IV changes what happens to a patient. */
const ROUTES = /^(iv|im|sc|sl|po|pr|pv|it|ivi|neb|top|inh)$/i;

/** Frequencies. "once daily" read as "three times daily" is a treble dose. */
const FREQUENCIES = /^(od|bd|tds|tid|qds|qid|prn|stat|nocte|mane|hourly|daily|weekly)$/i;

const BLOOD_GROUP = /^(a|b|ab|o)\s*(\+|-|pos|neg|positive|negative)$/i;

const DATE_OR_TIME = /^(\d{1,2}[:.]\d{2}|\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?)$/;

/**
 * Words that mark the FOLLOWING value as high risk regardless of what it looks
 * like. "Allergy: penicillin" makes "penicillin" critical even though a drug
 * name on its own would only be a DRUG_NAME.
 */
const CONTEXT_MARKERS: Array<{
  pattern: RegExp;
  category: HighRiskCategory;
  /**
   * True when the marker word is common enough in ordinary prose that it only
   * counts as a field label if it is followed by a value — a number, or a
   * colon after the label.
   *
   * "Patient" is the reason this exists. Without it, "Patient comfortable
   * overnight" flagged every word as a patient identifier. A system that
   * demands confirmation of ordinary prose teaches people to click through
   * warnings without reading them, which is a safety failure of its own and a
   * worse one, because it degrades every genuine warning too.
   */
  needsValue?: boolean;
}> = [
  { pattern: /^allerg(y|ies|ic)$/i, category: 'ALLERGY' },
  { pattern: /^(blood\s*)?group$/i, category: 'BLOOD_GROUP' },
  { pattern: /^(folder|hospital|patient)$/i, category: 'PATIENT_IDENTIFIER', needsValue: true },
  { pattern: /^(diagnosis|impression)$/i, category: 'DIAGNOSIS' },
  { pattern: /^(procedure|operation)$/i, category: 'PROCEDURE' },
  { pattern: /^(implant|prosthesis)$/i, category: 'IMPLANT' },
  { pattern: /^(bp|pulse|spo2|sats|temp|temperature)$/i, category: 'VITAL_SIGN', needsValue: true },
];

export interface TokenInput {
  text: string;
  confidence?: number | null;
  /** Text from other engines for the same position, if an ensemble ran. */
  alternatives?: string[];
}

export interface TokenAssessment {
  text: string;
  confidence: number | null;
  band: ConfidenceBand;
  /** Non-empty when this token must be confirmed whatever its confidence. */
  highRisk: HighRiskCategory[];
  isUncertain: boolean;
  /** Why, in words a clinician can read. Null when nothing is wrong. */
  reason: string | null;
  /**
   * Candidates to OFFER. Never applied. §2: clinical context may identify
   * alternatives, it may never select one.
   */
  alternatives: string[];
}

function categoriesFor(kind: CriticalKind): HighRiskCategory[] {
  switch (kind) {
    case 'DRUG': return ['DRUG_NAME'];
    case 'NUMBER': return ['DOSE'];
    case 'UNIT': return ['UNIT'];
    default: return [];
  }
}

/**
 * Assess a line of tokens together, because risk is contextual.
 *
 * A number alone is a dose; a number after "Folder" is an identifier; a word
 * after "Allergy:" is an allergy whatever it looks like. Assessing tokens in
 * isolation would miss all three.
 */
export function assessTokens(
  tokens: TokenInput[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): TokenAssessment[] {
  return tokens.map((token, index) => {
    const text = token.text ?? '';
    const confidence = token.confidence ?? null;
    const band = bandFor(confidence, thresholds);

    const categories = new Set<HighRiskCategory>(categoriesFor(criticalKind(text)));

    const bare = text.replace(/^[^\w]+|[^\w]+$/g, '');
    if (ROUTES.test(bare)) categories.add('ROUTE');
    if (FREQUENCIES.test(bare)) categories.add('FREQUENCY');
    if (DATE_OR_TIME.test(bare)) categories.add('DATE_TIME');

    // Blood group needs two tokens: "O" then "+".
    const withNext = `${bare} ${(tokens[index + 1]?.text ?? '').replace(/[^\w+-]/g, '')}`.trim();
    if (BLOOD_GROUP.test(withNext) || BLOOD_GROUP.test(bare)) categories.add('BLOOD_GROUP');

    // A marker in either of the two preceding tokens, which covers "Allergy:"
    // and "Blood group:" alike.
    const looksLikeAValue = criticalKind(text) === 'NUMBER';
    for (let back = 1; back <= 2; back++) {
      const raw = tokens[index - back]?.text ?? '';
      const previous = raw.replace(/^[^\w]+|[^\w]+$/g, '');
      const labelled = /[:=]\s*$/.test(raw);
      for (const marker of CONTEXT_MARKERS) {
        if (!marker.pattern.test(previous)) continue;
        if (marker.needsValue && !labelled && !looksLikeAValue) continue;
        categories.add(marker.category);
      }
    }

    const highRisk = Array.from(categories);
    const disagreement = (token.alternatives ?? []).filter(
      (a) => a.trim().toLowerCase() !== text.trim().toLowerCase(),
    );

    // Any ONE of these demands a human. They are not weighed against each
    // other, and a high confidence never cancels a high-risk category.
    const lowConfidence = band === 'LOW' || band === 'MODERATE';
    const isUncertain = lowConfidence || highRisk.length > 0 || disagreement.length > 0;

    let reason: string | null = null;
    if (disagreement.length > 0) {
      reason = `Engines disagreed: ${[text, ...disagreement].map((s) => `"${s}"`).join(' or ')}. Check the original.`;
    } else if (highRisk.length > 0 && lowConfidence) {
      reason = `${describe(highRisk)} and the recogniser was unsure. Check against the original.`;
    } else if (highRisk.length > 0) {
      // Worth saying plainly: people assume a high percentage means safe.
      reason = `${describe(highRisk)}. Confirm against the original even though the recogniser was confident.`;
    } else if (band === 'LOW') {
      reason = 'The recogniser was not confident about this word.';
    } else if (band === 'MODERATE') {
      reason = 'This word may not have been read correctly.';
    }

    return {
      text, confidence, band, highRisk, isUncertain, reason,
      alternatives: disagreement,
    };
  });
}

function describe(categories: HighRiskCategory[]): string {
  const words: Record<HighRiskCategory, string> = {
    DRUG_NAME: 'a drug name', DOSE: 'a dose or number', UNIT: 'a unit',
    ROUTE: 'a route of administration', FREQUENCY: 'a frequency',
    ALLERGY: 'an allergy', BLOOD_GROUP: 'a blood group',
    PATIENT_IDENTIFIER: 'a patient identifier', DIAGNOSIS: 'a diagnosis',
    PROCEDURE: 'a procedure', DATE_TIME: 'a date or time',
    VITAL_SIGN: 'a vital sign', LAB_VALUE: 'a laboratory value',
    IMPLANT: 'implant details', BLOOD_PRODUCT: 'a blood product',
    CONSENT: 'consent details',
  };
  const named = categories.map((c) => words[c]);
  if (named.length === 1) return `This is ${named[0]}`;
  return `This is ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

export interface DocumentAssessment {
  overallConfidence: number | null;
  band: ConfidenceBand;
  requiresReview: boolean;
  reviewReason: string | null;
  uncertainCount: number;
  highRiskCount: number;
  tokenCount: number;
}

/**
 * Whether the document as a whole can be accepted without review.
 *
 * Defaults to requiring review. A document with no tokens at all — an engine
 * that failed, or a page with nothing legible — must never come back as
 * "nothing to check": that is precisely the case where a person needs to look.
 */
export function assessDocument(
  assessments: TokenAssessment[],
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): DocumentAssessment {
  const scored = assessments.filter((a) => a.confidence !== null);
  const overallConfidence = scored.length
    ? scored.reduce((sum, a) => sum + (a.confidence ?? 0), 0) / scored.length
    : null;

  const uncertainCount = assessments.filter((a) => a.isUncertain).length;
  const highRiskCount = assessments.filter((a) => a.highRisk.length > 0).length;

  if (assessments.length === 0) {
    return {
      overallConfidence: null, band: 'LOW', requiresReview: true,
      reviewReason: 'Nothing could be read from this document. Check the original.',
      uncertainCount: 0, highRiskCount: 0, tokenCount: 0,
    };
  }

  const band = bandFor(overallConfidence, thresholds);
  const reasons: string[] = [];
  if (highRiskCount > 0) {
    reasons.push(`${highRiskCount} value${highRiskCount === 1 ? '' : 's'} must be confirmed against the original`);
  }
  const merelyUncertain = uncertainCount - highRiskCount;
  if (merelyUncertain > 0) {
    reasons.push(`${merelyUncertain} word${merelyUncertain === 1 ? '' : 's'} the recogniser was unsure of`);
  }
  if (band === 'LOW' || band === 'MODERATE') {
    reasons.push('overall confidence is low');
  }

  return {
    overallConfidence,
    band,
    requiresReview: reasons.length > 0,
    reviewReason: reasons.length ? capitalise(reasons.join('; ')) + '.' : null,
    uncertainCount, highRiskCount, tokenCount: assessments.length,
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Whether a verification may be recorded as complete.
 *
 * The gate behind the "Save verified transcription" button. Accepting a
 * document with unconfirmed high-risk values is the failure this whole design
 * exists to prevent, so it is refused here rather than trusted to the interface
 * — a button can be mis-wired, and this cannot.
 */
export function canAcceptVerification(
  assessments: TokenAssessment[],
  confirmedIndices: Set<number>,
): { ok: boolean; reason: string } {
  const outstanding = assessments
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => a.highRisk.length > 0 && !confirmedIndices.has(i));

  if (outstanding.length > 0) {
    const first = outstanding[0].a;
    return {
      ok: false,
      reason: outstanding.length === 1
        ? `"${first.text}" still needs confirming against the original.`
        : `${outstanding.length} values still need confirming, starting with "${first.text}".`,
    };
  }
  return { ok: true, reason: 'Every high-risk value has been confirmed.' };
}
