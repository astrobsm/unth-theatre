import { describe, it, expect } from 'vitest';
import {
  isInForce, priceOn, priceForItemOn, admissionCode, summariseUnpriced,
  type TariffRow,
} from '../../src/lib/estimates/priceLookup';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const row = (over: Partial<TariffRow> = {}): TariffRow => ({
  id: 't1',
  code: 'THEATRE-MAJOR',
  name: 'Theatre charge, major',
  kind: 'THEATRE',
  amount: 8_000_000,
  effectiveFrom: d('2026-01-01'),
  effectiveTo: null,
  ...over,
});

describe('isInForce', () => {
  it('includes the first day of the window', () => {
    expect(isInForce(row({ effectiveFrom: d('2026-08-01') }), d('2026-08-01'))).toBe(true);
  });

  it('excludes the day before', () => {
    expect(isInForce(row({ effectiveFrom: d('2026-08-01') }), d('2026-07-31'))).toBe(false);
  });

  it('treats effectiveTo as exclusive', () => {
    // This is what makes supersession clean: the new row's `from` equals the old
    // row's `to`, and exactly one applies that day. Inclusive `to` would make
    // both apply and the answer would depend on sort order.
    const r = row({ effectiveFrom: d('2026-01-01'), effectiveTo: d('2026-08-01') });
    expect(isInForce(r, d('2026-07-31'))).toBe(true);
    expect(isInForce(r, d('2026-08-01'))).toBe(false);
  });

  it('treats a null effectiveTo as still current', () => {
    expect(isInForce(row(), d('2030-01-01'))).toBe(true);
  });

  it('compares by calendar day, ignoring time of day', () => {
    // A tariff window is a date. An estimate prepared at 4pm must not price
    // differently from one prepared at 9am.
    const r = row({ effectiveFrom: d('2026-08-01') });
    expect(isInForce(r, new Date('2026-08-01T23:59:00Z'))).toBe(true);
  });
});

describe('priceOn', () => {
  const old = row({ id: 'old', amount: 6_000_000, effectiveFrom: d('2026-01-01'), effectiveTo: d('2026-08-01') });
  const current = row({ id: 'new', amount: 8_000_000, effectiveFrom: d('2026-08-01'), effectiveTo: null });

  it('picks the row in force on the date', () => {
    expect(priceOn([old, current], 'THEATRE-MAJOR', 'THEATRE', d('2026-07-15'))?.amount).toBe(6_000_000);
    expect(priceOn([old, current], 'THEATRE-MAJOR', 'THEATRE', d('2026-08-15'))?.amount).toBe(8_000_000);
  });

  it('reads an old estimate at the old price — the whole point', () => {
    // An estimate given in July must still explain itself in September.
    expect(priceOn([old, current], 'THEATRE-MAJOR', 'THEATRE', d('2026-07-31'))?.id).toBe('old');
  });

  it('returns null when nothing is priced, rather than zero', () => {
    // A silent zero reads as "free" on a patient's estimate.
    expect(priceOn([old, current], 'NOT-A-CODE', 'THEATRE', d('2026-08-15'))).toBeNull();
  });

  it('returns null before the first price existed', () => {
    expect(priceOn([current], 'THEATRE-MAJOR', 'THEATRE', d('2025-01-01'))).toBeNull();
  });

  it('does not cross kinds even for the same code', () => {
    // PROCEDURE and THEATRE can legitimately share a code.
    const proc = row({ id: 'p', kind: 'PROCEDURE', amount: 1 });
    expect(priceOn([proc], 'THEATRE-MAJOR', 'THEATRE', d('2026-08-15'))).toBeNull();
    expect(priceOn([proc], 'THEATRE-MAJOR', 'PROCEDURE', d('2026-08-15'))?.amount).toBe(1);
  });

  it('is deterministic when windows overlap', () => {
    // Overlap means the price master is inconsistent — a bad import, or a row
    // added without closing its predecessor. Deterministic beats arbitrary.
    const a = row({ id: 'aaa', amount: 100, effectiveFrom: d('2026-01-01') });
    const b = row({ id: 'bbb', amount: 200, effectiveFrom: d('2026-06-01') });
    expect(priceOn([a, b], 'THEATRE-MAJOR', 'THEATRE', d('2026-08-01'))?.id).toBe('bbb');
    expect(priceOn([b, a], 'THEATRE-MAJOR', 'THEATRE', d('2026-08-01'))?.id).toBe('bbb');
  });

  it('breaks a same-day overlap by id, not by input order', () => {
    const a = row({ id: 'aaa', amount: 100, effectiveFrom: d('2026-06-01') });
    const b = row({ id: 'bbb', amount: 200, effectiveFrom: d('2026-06-01') });
    expect(priceOn([a, b], 'THEATRE-MAJOR', 'THEATRE', d('2026-08-01'))?.id).toBe('bbb');
    expect(priceOn([b, a], 'THEATRE-MAJOR', 'THEATRE', d('2026-08-01'))?.id).toBe('bbb');
  });
});

describe('priceForItemOn', () => {
  it('finds a stock item price by id', () => {
    const r = row({ id: 'ti', kind: 'CONSUMABLE', itemId: 'item-9', amount: 150_000 });
    expect(priceForItemOn([r], 'item-9', d('2026-08-15'))?.amount).toBe(150_000);
  });

  it('returns null for an unpriced item', () => {
    const r = row({ itemId: 'item-9' });
    expect(priceForItemOn([r], 'item-other', d('2026-08-15'))).toBeNull();
  });

  it('respects the window', () => {
    const r = row({ itemId: 'item-9', effectiveFrom: d('2026-09-01') });
    expect(priceForItemOn([r], 'item-9', d('2026-08-15'))).toBeNull();
  });
});

describe('admissionCode', () => {
  it('folds the ward into the code, matching the bulk import', () => {
    // Tariff has no ward column; the import encodes it this way. The two must
    // not drift apart or admission prices become unfindable.
    expect(admissionCode('BED-DAILY', 'Female Medical Ward')).toBe('BED-DAILY::FEMALE MEDICAL WARD');
  });

  it('leaves the code alone with no ward', () => {
    expect(admissionCode('BED-DAILY', null)).toBe('BED-DAILY');
    expect(admissionCode('BED-DAILY', '')).toBe('BED-DAILY');
  });

  it('trims and upper-cases so casing cannot cause a miss', () => {
    expect(admissionCode('BED-DAILY', '  female ward ')).toBe('BED-DAILY::FEMALE WARD');
  });
});

describe('summariseUnpriced', () => {
  it('names what could not be priced', () => {
    // Surfaced rather than swallowed: a patient plans around these figures.
    const out = summariseUnpriced([
      { description: 'Mesh', kind: 'IMPLANT', code: 'MESH-L', reason: 'no price in force' },
    ]);
    expect(out[0]).toBe('Mesh (IMPLANT, MESH-L): no price in force');
  });
});
