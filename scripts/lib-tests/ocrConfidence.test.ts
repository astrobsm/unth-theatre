import { describe, it, expect } from 'vitest';
import {
  bandFor, assessTokens, assessDocument, canAcceptVerification, DEFAULT_THRESHOLDS,
} from '../../src/lib/ocr/confidence';

const t = (text: string, confidence?: number | null, alternatives?: string[]) =>
  ({ text, confidence, alternatives });

const line = (...tokens: ReturnType<typeof t>[]) => assessTokens(tokens);

describe('bandFor', () => {
  it('bands by the configured thresholds', () => {
    expect(bandFor(0.99)).toBe('HIGH');
    expect(bandFor(0.96)).toBe('GOOD');
    expect(bandFor(0.92)).toBe('MODERATE');
    expect(bandFor(0.40)).toBe('LOW');
  });

  it('treats absent confidence as LOW, never as fine', () => {
    // An engine reporting no confidence has told us nothing, and nothing must
    // not read as good.
    expect(bandFor(null)).toBe('LOW');
    expect(bandFor(undefined)).toBe('LOW');
    expect(bandFor(NaN)).toBe('LOW');
  });

  it('is inclusive at each boundary', () => {
    expect(bandFor(DEFAULT_THRESHOLDS.high)).toBe('HIGH');
    expect(bandFor(DEFAULT_THRESHOLDS.good)).toBe('GOOD');
    expect(bandFor(DEFAULT_THRESHOLDS.moderate)).toBe('MODERATE');
  });
});

describe('high confidence must NOT excuse a dangerous value', () => {
  // The failure this module exists to prevent: a threshold-only system passes
  // "Morphine 15 mg" at 99% because the handwriting was beautifully clear.
  it('flags a dose read at 100% confidence', () => {
    const [, dose] = line(t('Morphine', 1.0), t('15', 1.0), t('mg', 1.0));
    expect(dose.band).toBe('HIGH');
    expect(dose.isUncertain).toBe(true);
    expect(dose.highRisk).toContain('DOSE');
    expect(dose.reason).toMatch(/even though the recogniser was confident/i);
  });

  it('flags a drug name at full confidence', () => {
    const [drug] = line(t('Ketamine', 1.0));
    expect(drug.highRisk).toContain('DRUG_NAME');
    expect(drug.isUncertain).toBe(true);
  });

  it('leaves ordinary prose alone at good confidence', () => {
    const assessed = line(t('Patient', 0.99), t('comfortable', 0.99), t('overnight', 0.99));
    expect(assessed.every((a) => !a.isUncertain)).toBe(true);
    expect(assessed.every((a) => a.reason === null)).toBe(true);
  });
});

describe('risk is contextual', () => {
  it('treats a route as high risk — IM and IV are not interchangeable', () => {
    const [route] = line(t('IM', 0.99));
    expect(route.highRisk).toContain('ROUTE');
  });

  it('treats a frequency as high risk — od read as tds trebles a dose', () => {
    expect(line(t('tds', 0.99))[0].highRisk).toContain('FREQUENCY');
  });

  it('marks a word after "Allergy:" as an allergy', () => {
    const assessed = line(t('Allergy:', 0.99), t('penicillin', 0.99));
    expect(assessed[1].highRisk).toContain('ALLERGY');
  });

  it('marks a number after "Folder" as an identifier, not merely a dose', () => {
    const assessed = line(t('Folder', 0.99), t('0294817', 0.99));
    expect(assessed[1].highRisk).toContain('PATIENT_IDENTIFIER');
  });

  it('recognises a blood group written across two tokens', () => {
    const assessed = line(t('O', 0.99), t('+', 0.99));
    expect(assessed[0].highRisk).toContain('BLOOD_GROUP');
  });

  it('recognises a time', () => {
    expect(line(t('09:30', 0.99))[0].highRisk).toContain('DATE_TIME');
  });
});

describe('engine disagreement', () => {
  it('flags a token two engines read differently', () => {
    const [dose] = line(t('5', 0.99, ['15']));
    expect(dose.isUncertain).toBe(true);
    expect(dose.reason).toMatch(/disagreed/i);
    expect(dose.alternatives).toContain('15');
  });

  it('offers alternatives without choosing one', () => {
    // The whole point of section 2: candidates may be identified, never
    // selected. The text stays as the primary engine read it.
    const [dose] = line(t('5', 0.99, ['15', '50']));
    expect(dose.text).toBe('5');
    expect(dose.alternatives).toHaveLength(2);
  });

  it('does not treat an identical second reading as disagreement', () => {
    const [word] = line(t('stable', 0.99, ['Stable', 'stable']));
    expect(word.alternatives).toHaveLength(0);
  });
});

describe('assessDocument', () => {
  it('requires review when a high-risk value is present', () => {
    const doc = assessDocument(line(t('Morphine', 1.0), t('5', 1.0), t('mg', 1.0)));
    expect(doc.requiresReview).toBe(true);
    expect(doc.highRiskCount).toBeGreaterThan(0);
    expect(doc.reviewReason).toMatch(/confirmed against the original/i);
  });

  it('does not require review for clean ordinary prose', () => {
    const doc = assessDocument(line(t('Patient', 0.99), t('resting', 0.99)));
    expect(doc.requiresReview).toBe(false);
    expect(doc.reviewReason).toBeNull();
  });

  it('requires review when NOTHING could be read', () => {
    // The dangerous default. An engine that failed must not come back as
    // "nothing to check" — that is exactly when a person must look.
    const doc = assessDocument([]);
    expect(doc.requiresReview).toBe(true);
    expect(doc.reviewReason).toMatch(/Nothing could be read/i);
  });

  it('counts uncertain words separately from high-risk ones', () => {
    const doc = assessDocument(line(t('Patient', 0.4), t('Morphine', 1.0)));
    expect(doc.highRiskCount).toBe(1);
    expect(doc.uncertainCount).toBe(2);
    expect(doc.reviewReason).toMatch(/unsure/i);
  });
});

describe('canAcceptVerification — the gate behind the save button', () => {
  const assessed = line(t('Morphine', 1.0), t('5', 1.0), t('mg', 1.0), t('IM', 1.0));

  it('refuses while a high-risk value is unconfirmed', () => {
    const verdict = canAcceptVerification(assessed, new Set());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/needs? confirming/i);
  });

  it('names the outstanding value so it can be found', () => {
    const verdict = canAcceptVerification(assessed, new Set());
    expect(verdict.reason).toMatch(/Morphine|5|mg|IM/);
  });

  it('accepts once every high-risk value is confirmed', () => {
    const all = new Set(assessed.map((a, i) => (a.highRisk.length ? i : -1)).filter((i) => i >= 0));
    const verdict = canAcceptVerification(assessed, all);
    expect(verdict.ok).toBe(true);
  });

  it('does not demand confirmation of ordinary words', () => {
    const prose = line(t('Patient', 0.99), t('comfortable', 0.99));
    expect(canAcceptVerification(prose, new Set()).ok).toBe(true);
  });

  it('is not satisfied by confirming the WRONG token', () => {
    // Confirming index 0 when the outstanding value is elsewhere must not pass.
    const verdict = canAcceptVerification(assessed, new Set([0]));
    expect(verdict.ok).toBe(false);
  });
});

describe('must not cry wolf', () => {
  // Flagging ordinary prose teaches people to click through warnings without
  // reading them, which degrades every genuine warning too. These pin the fix
  // for "Patient comfortable overnight", which once flagged every word after
  // "Patient" as a patient identifier.
  it('does not treat "Patient" in a sentence as a field label', () => {
    const assessed = line(t('Patient', 0.99), t('comfortable', 0.99), t('overnight', 0.99));
    expect(assessed.some((a) => a.highRisk.includes('PATIENT_IDENTIFIER'))).toBe(false);
  });

  it('DOES treat "Patient:" with a colon as a field label', () => {
    const assessed = line(t('Patient:', 0.99), t('Adaeze', 0.99));
    expect(assessed[1].highRisk).toContain('PATIENT_IDENTIFIER');
  });

  it('DOES treat a number after "Folder" as an identifier', () => {
    const assessed = line(t('Folder', 0.99), t('0294817', 0.99));
    expect(assessed[1].highRisk).toContain('PATIENT_IDENTIFIER');
  });

  it('does not flag "temp" in prose, but does flag a temperature reading', () => {
    expect(line(t('temp', 0.99), t('improving', 0.99))[1].highRisk).not.toContain('VITAL_SIGN');
    expect(line(t('temp', 0.99), t('37.2', 0.99))[1].highRisk).toContain('VITAL_SIGN');
  });

  it('still flags an allergy without a colon', () => {
    // Specific enough a marker that it applies regardless — the cost of a false
    // positive on "allergy" is far below the cost of missing one.
    expect(line(t('Allergy', 0.99), t('penicillin', 0.99))[1].highRisk).toContain('ALLERGY');
  });
});
