import { describe, it, expect } from 'vitest';
import {
  score, pool, align, criticalKind, normaliseForScoring, isSafeForClinicalUse,
} from '../../src/lib/ocr/metrics';

describe('align', () => {
  it('is zero for identical input', () => {
    expect(align('abc'.split(''), 'abc'.split('')).distance).toBe(0);
  });

  it('counts a substitution as one edit', () => {
    expect(align('cat'.split(''), 'cot'.split('')).distance).toBe(1);
  });

  it('counts a deletion and an insertion', () => {
    expect(align('cat'.split(''), 'ct'.split('')).distance).toBe(1);
    expect(align('ct'.split(''), 'cat'.split('')).distance).toBe(1);
  });

  it('reports which words differ, not only how many', () => {
    const { ops } = align(['give', '5', 'mg'], ['give', '15', 'mg']);
    const subs = ops.filter((o) => o.op === 'sub');
    expect(subs).toHaveLength(1);
    expect(subs[0].truth).toBe('5');
    expect(subs[0].hypothesis).toBe('15');
  });

  it('handles an empty hypothesis', () => {
    expect(align('abc'.split(''), []).distance).toBe(3);
  });
});

describe('normalisation must not touch what is being measured', () => {
  it('folds case and whitespace', () => {
    expect(normaliseForScoring('  Patient   Stable  ')).toBe('patient stable');
  });

  it('leaves digits and decimal points alone', () => {
    expect(normaliseForScoring('0.5 mg')).toContain('0.5');
    expect(normaliseForScoring('12.5')).toBe('12.5');
  });
});

describe('criticalKind', () => {
  it('recognises numbers, including decimals and comparators', () => {
    expect(criticalKind('5')).toBe('NUMBER');
    expect(criticalKind('9.8')).toBe('NUMBER');
    expect(criticalKind('<0.5')).toBe('NUMBER');
  });

  it('recognises dose units', () => {
    expect(criticalKind('mg')).toBe('UNIT');
    expect(criticalKind('mcg')).toBe('UNIT');
    expect(criticalKind('mmol/l')).toBe('UNIT');
  });

  it('recognises drugs used in this theatre', () => {
    expect(criticalKind('morphine')).toBe('DRUG');
    expect(criticalKind('Suxamethonium')).toBe('DRUG');
  });

  it('ignores ordinary words', () => {
    expect(criticalKind('patient')).toBeNull();
    expect(criticalKind('for')).toBeNull();
  });

  it('sees through trailing punctuation', () => {
    expect(criticalKind('morphine,')).toBe('DRUG');
    expect(criticalKind('5.')).toBe('NUMBER');
  });
});

describe('the case this module exists for', () => {
  // A dose error and a harmless typo score almost identically on CER and WER.
  // The critical metrics are what tell them apart.
  const truth = 'Morphine 5 mg IM 4 hourly for post-operative pain';

  it('a trebled morphine dose looks harmless on CER', () => {
    const s = score(truth, 'Morphine 15 mg IM 4 hourly for post-operative pain');
    expect(s.cer).toBeLessThan(0.05);          // "excellent" by the usual reading
    expect(s.criticalAccuracy).toBeLessThan(1); // but the dose is wrong
    expect(s.criticalErrors).toHaveLength(1);
    expect(s.criticalErrors[0].kind).toBe('NUMBER');
    expect(s.criticalErrors[0].expected).toBe('5');
    expect(s.criticalErrors[0].got).toBe('15');
  });

  it('a harmless typo leaves the critical score perfect', () => {
    const s = score(
      'Patient for elective cholecystectomy tomorrow morning',
      'Patient for elective cholecystectorny tomorrow morning',
    );
    expect(s.wer).toBeGreaterThan(0);      // it did get a word wrong
    expect(s.criticalAccuracy).toBe(1);    // nothing clinical was harmed
    expect(s.criticalErrors).toHaveLength(0);
  });

  it('separates a tenfold error from a merely wrong one', () => {
    const threefold = score(truth, 'Morphine 15 mg IM 4 hourly for post-operative pain');
    const tenfold = score(truth, 'Morphine 50 mg IM 4 hourly for post-operative pain');
    expect(threefold.criticalErrors[0].orderOfMagnitude).toBe(false);
    expect(tenfold.criticalErrors[0].orderOfMagnitude).toBe(true);
  });

  it('catches a unit change that leaves the digit intact', () => {
    const s = score('Fentanyl 100 mcg IV', 'Fentanyl 100 mg IV');
    expect(s.criticalErrors.some((e) => e.kind === 'UNIT')).toBe(true);
  });

  it('counts a dropped dose as an error, not as an absence', () => {
    const s = score(truth, 'Morphine mg IM 4 hourly for post-operative pain');
    const dropped = s.criticalErrors.find((e) => e.expected === '5');
    expect(dropped).toBeTruthy();
    expect(dropped?.got).toBeNull();
  });

  it('gives context so an error can be read without the document', () => {
    const s = score(truth, 'Morphine 15 mg IM 4 hourly for post-operative pain');
    expect(s.criticalErrors[0].context).toContain('morphine');
  });

  it('is perfect on a perfect reading', () => {
    const s = score(truth, truth);
    expect(s.cer).toBe(0);
    expect(s.wer).toBe(0);
    expect(s.criticalAccuracy).toBe(1);
  });

  it('scores a wrong drug name as a drug error', () => {
    const s = score('Give ketamine 50 mg', 'Give ketorolac 50 mg');
    expect(s.criticalErrors.some((e) => e.kind === 'DRUG')).toBe(true);
  });
});

describe('pool', () => {
  it('weights by length rather than averaging rates', () => {
    // A long document read perfectly and a three-word scrap read badly. Averaging
    // the rates would rank an engine by how it handles scraps.
    const long = score('a '.repeat(100).trim(), 'a '.repeat(100).trim());
    const scrap = score('one two three', 'xxx yyy zzz');
    const pooled = pool([long, scrap]);
    const averaged = (long.wer + scrap.wer) / 2;
    expect(pooled.wer).toBeLessThan(averaged);
  });

  it('adds up critical tokens across documents', () => {
    const a = score('give 5 mg', 'give 5 mg');
    const b = score('give 10 mg', 'give 100 mg');
    const pooled = pool([a, b]);
    expect(pooled.criticalTotal).toBe(a.criticalTotal + b.criticalTotal);
    expect(pooled.criticalErrors).toHaveLength(1);
  });

  it('is defined for an empty corpus rather than dividing by zero', () => {
    const pooled = pool([]);
    expect(pooled.cer).toBe(0);
    expect(pooled.criticalAccuracy).toBe(1);
  });
});

describe('isSafeForClinicalUse', () => {
  it('refuses an engine that moved a decimal point', () => {
    const verdict = isSafeForClinicalUse(score('give 5 mg', 'give 50 mg'));
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/order-of-magnitude/);
  });

  it('refuses an engine below the critical threshold', () => {
    const verdict = isSafeForClinicalUse(score(
      'hb 9.8 k 4.1 na 138 creatinine 88 glucose 5.4',
      'hb 9.8 k 4.1 na 138 creatinine 88 glucose 5.6',
    ));
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/98%/);
  });

  it('accepts a clean reading but still says verification is required', () => {
    const verdict = isSafeForClinicalUse(score('give 5 mg morphine', 'give 5 mg morphine'));
    expect(verdict.safe).toBe(true);
    expect(verdict.reason).toMatch(/human verification/);
  });

  it('refuses an engine whose general reading is unusable', () => {
    const verdict = isSafeForClinicalUse(score(
      'the patient is stable and comfortable',
      'xxx yyy zzz qqq www',
    ));
    expect(verdict.safe).toBe(false);
  });
});

describe('leniency for mangled spacing must not forgive a dose error', () => {
  it('accepts a value the engine ran into its label', () => {
    // Real output from the first benchmark run: "K+ 4.1" came back as "K+4.1".
    // The clinical value is intact; this is a spacing fault, and it belongs in
    // WER rather than being reported as a wrong potassium.
    const s = score('K+ 4.1 mmol/L', 'K+4.1 mmol/L');
    expect(s.criticalAccuracy).toBe(1);
  });

  it('accepts a trailing full stop on a unit', () => {
    const s = score('creatinine 88 umol/L', 'creatinine 88 umol/L.');
    expect(s.criticalAccuracy).toBe(1);
  });

  it('STILL rejects a digit that changed', () => {
    // The whole point. "5" inside "15" is not a match.
    const s = score('morphine 5 mg', 'morphine 15 mg');
    expect(s.criticalAccuracy).toBeLessThan(1);
    expect(s.criticalErrors[0].expected).toBe('5');
  });

  it('STILL rejects a tenfold error hidden in a merged token', () => {
    const s = score('give 0.5 mg', 'give 5mg');
    expect(s.criticalAccuracy).toBeLessThan(1);
  });

  it('STILL rejects mg read as mcg', () => {
    const s = score('fentanyl 100 mcg', 'fentanyl 100 mg');
    expect(s.criticalAccuracy).toBeLessThan(1);
  });

  it('STILL rejects a dropped value', () => {
    const s = score('morphine 5 mg', 'morphine mg');
    expect(s.criticalAccuracy).toBeLessThan(1);
  });
});
