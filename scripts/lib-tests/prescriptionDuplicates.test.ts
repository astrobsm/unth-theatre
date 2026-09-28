/**
 * Recognising a prescription that was sent twice because the first looked lost.
 *
 * On 28 September the pharmacy board showed one patient with thirteen
 * identical post-operative prescriptions across fifty-six minutes, and another
 * with two ninety seconds apart. Nobody was clicking carelessly: the send
 * button disables itself and reports success. What it also does is report
 * FAILURE when the response does not come back — and on this hospital's link a
 * request routinely reaches the server, is acted on, and the reply never
 * returns. The surgeon was told it failed, so they sent it again.
 *
 * This suite is about the two ways that rule can be wrong, because both are
 * clinical:
 *
 *   TOO EAGER, and a genuine second prescription is silently swallowed. A
 *   patient does not get drugs somebody deliberately prescribed.
 *
 *   TOO SLACK, and pharmacy packs the same course several times over. That is
 *   a real dispensing risk and it is what prompted this.
 *
 * So the boundaries are tested in both directions, and the cases that must NOT
 * collapse outnumber the ones that must.
 */
import { describe, expect, it } from 'vitest';

import {
  fingerprint, findDuplicate, UNTOUCHED_STATUSES,
  type MedicationLine, type ExistingPrescription,
} from '../../src/lib/prescriptions/duplicateGuard';

const MEDS: MedicationLine[] = [
  { drugName: 'Ceftriaxone 1g IV', dosage: '1000mg', route: 'IV', frequency: '12hrly', duration: '6 days', quantity: 1 },
  { drugName: 'Metronidazole 500mg IV', dosage: '500mg', route: 'IV', frequency: '8hourly', duration: '6/7', quantity: 1 },
];

const existing = (over: Partial<ExistingPrescription> = {}): ExistingPrescription => ({
  id: 'rx-1',
  status: 'SENT_TO_PHARMACY',
  medications: JSON.stringify(MEDS),
  prescribedById: 'dr-onyia',
  prescribedAt: new Date('2026-07-01T18:52:00Z'),
  ...over,
});

const incoming = { medications: MEDS, prescribedById: 'dr-onyia' };

describe('the fingerprint', () => {
  it('ignores the order the rows happen to be in', () => {
    // A form that rebuilds its rows can serialise the same drugs differently.
    // That is the same prescription.
    expect(fingerprint(MEDS)).toBe(fingerprint([...MEDS].reverse()));
  });

  it('ignores case and stray whitespace', () => {
    expect(fingerprint([{ drugName: 'Ceftriaxone 1g IV', dosage: '1000mg', quantity: 1 }]))
      .toBe(fingerprint([{ drugName: '  ceftriaxone 1g   iv ', dosage: '1000MG', quantity: 1 }]));
  });

  it('distinguishes a different quantity', () => {
    // Five ampoules and fifty are different prescriptions even when every
    // other field matches. Collapsing them would discard a correction.
    const a = [{ drugName: 'Ceftriaxone', quantity: 5 }];
    const b = [{ drugName: 'Ceftriaxone', quantity: 50 }];
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('distinguishes a different dose, route, frequency or duration', () => {
    const base = { drugName: 'Ceftriaxone', dosage: '1g', route: 'IV', frequency: 'bd', duration: '5/7', quantity: 1 };
    const f = fingerprint([base]);
    expect(fingerprint([{ ...base, dosage: '2g' }])).not.toBe(f);
    expect(fingerprint([{ ...base, route: 'PO' }])).not.toBe(f);
    expect(fingerprint([{ ...base, frequency: 'tds' }])).not.toBe(f);
    expect(fingerprint([{ ...base, duration: '7/7' }])).not.toBe(f);
  });

  it('is empty for an empty prescription', () => {
    // Nothing to compare. An empty fingerprint must never match another empty
    // one and suppress a real send — findDuplicate bails on it below.
    expect(fingerprint([])).toBe('');
    expect(fingerprint([{ drugName: '   ' }])).toBe('');
  });
});

describe('what counts as a repeat', () => {
  it('catches the identical resend that caused this', () => {
    const v = findDuplicate(incoming, [existing()]);
    expect(v.duplicateOf).toBe('rx-1');
    expect(v.reason).toMatch(/already waiting/i);
  });

  it('catches it however the rows were ordered', () => {
    const v = findDuplicate(
      { medications: [...MEDS].reverse(), prescribedById: 'dr-onyia' },
      [existing()],
    );
    expect(v.duplicateOf).toBe('rx-1');
  });

  it('catches a DRAFT as well as one sent', () => {
    expect(UNTOUCHED_STATUSES).toContain('DRAFT');
    expect(findDuplicate(incoming, [existing({ status: 'DRAFT' })]).duplicateOf).toBe('rx-1');
  });
});

describe('what must NOT be treated as a repeat', () => {
  it('allows it once pharmacy has started packing', () => {
    // The rule that replaces an arbitrary time window. Nothing has consumed an
    // unopened prescription, so a second copy adds only dispensing risk. Once
    // pharmacy has acted, an identical order is plausibly a genuine repeat
    // course and must go through.
    for (const status of ['PACKING', 'PACKED', 'AWAITING_PAYMENT', 'PAID', 'COLLECTED']) {
      expect(findDuplicate(incoming, [existing({ status })]).duplicateOf,
        `${status} should not suppress`).toBeNull();
    }
  });

  it('allows a different prescriber', () => {
    // Two clinicians prescribing identically are two people who each need to
    // be on the record. Collapsing them erases one.
    expect(findDuplicate(incoming, [existing({ prescribedById: 'dr-other' })]).duplicateOf)
      .toBeNull();
  });

  it('allows a prescription that differs by one drug', () => {
    const plusOne = [...MEDS, { drugName: 'Pentazocine 30mg IM', dosage: '30mg', quantity: 1 }];
    expect(findDuplicate({ medications: plusOne, prescribedById: 'dr-onyia' }, [existing()]).duplicateOf)
      .toBeNull();
  });

  it('allows a prescription that differs only by dose', () => {
    // The correction case. A surgeon fixing 1g to 2g must not have the
    // correction swallowed as a duplicate of the original.
    const corrected = [{ ...MEDS[0], dosage: '2000mg' }, MEDS[1]];
    expect(findDuplicate({ medications: corrected, prescribedById: 'dr-onyia' }, [existing()]).duplicateOf)
      .toBeNull();
  });

  it('allows an empty prescription through to normal validation', () => {
    // Not this guard's job to reject it, and an empty fingerprint matching
    // another empty one would suppress a real send.
    expect(findDuplicate({ medications: [], prescribedById: 'dr-onyia' },
      [existing({ medications: '[]' })]).duplicateOf).toBeNull();
  });

  it('allows it when the stored payload cannot be parsed', () => {
    // Guessing that unreadable data matches would discard a real prescription.
    expect(findDuplicate(incoming, [existing({ medications: 'not json' })]).duplicateOf)
      .toBeNull();
  });

  it('allows the first one, when nothing is waiting', () => {
    expect(findDuplicate(incoming, []).duplicateOf).toBeNull();
  });
});

describe('the scenario from the pharmacy board, end to end', () => {
  it('collapses thirteen attempts into one', () => {
    // Replays what actually happened: the same prescription sent again and
    // again because each response was lost. Only the first should exist.
    const queue: ExistingPrescription[] = [];
    let created = 0;

    for (let attempt = 0; attempt < 13; attempt += 1) {
      const v = findDuplicate(incoming, queue);
      if (v.duplicateOf) continue;
      created += 1;
      queue.push(existing({ id: `rx-${created}` }));
    }

    expect(created).toBe(1);
  });

  it('still lets a genuine second course through after packing', () => {
    // And the same loop, once pharmacy has packed the first: the repeat is
    // real and must be created.
    const packed = [existing({ status: 'PACKED' })];
    expect(findDuplicate(incoming, packed).duplicateOf).toBeNull();
  });
});
