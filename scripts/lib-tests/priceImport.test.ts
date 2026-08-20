/**
 * Bulk price upload.
 *
 * An administrator pastes a spreadsheet and every row becomes a price the
 * hospital charges patients. The failure modes are financial, not technical:
 * a rounded figure nobody typed, a date read as January in one country and
 * February in another, or half a file committed so nobody can tell which half.
 *
 * So the rules under test are: reject rather than round, reject rather than
 * guess, and report every fault at once rather than one per upload attempt.
 */
import { describe, expect, it } from 'vitest';

import { CHARGE_KINDS } from '../../src/lib/estimates/chargeKinds';
import {
  mapHeaders,
  nairaToKobo,
  parseDate,
  parsePriceRows,
  splitDelimited,
} from '../../src/lib/estimates/priceImport';

const OPTS = { validKinds: CHARGE_KINDS, defaultEffectiveFrom: '2026-08-11' };

describe('naira to kobo', () => {
  it('reads the ways people actually type money', () => {
    expect(nairaToKobo('1500')).toBe(150000);
    expect(nairaToKobo('1,500')).toBe(150000);
    expect(nairaToKobo('₦1,500.50')).toBe(150050);
    expect(nairaToKobo(' 250 ')).toBe(25000);
    expect(nairaToKobo('0')).toBe(0);
    expect(nairaToKobo('1500.5')).toBe(150050);
  });

  it('REJECTS sub-kobo precision instead of rounding it', () => {
    // A rounded price is a figure nobody typed. Better to make the
    // administrator say what they meant.
    expect(nairaToKobo('1500.505')).toBeNull();
    expect(nairaToKobo('0.001')).toBeNull();
  });

  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['', '  ', 'free', '-500', '1.2.3', '1e5', 'N/A', '--']) {
      expect(nairaToKobo(bad), bad).toBeNull();
    }
  });
});

describe('effective dates', () => {
  it('accepts only unambiguous ISO dates', () => {
    expect(parseDate('2026-08-11')).toBe('2026-08-11');
  });

  it('refuses slash dates rather than guessing the country', () => {
    // 01/02/2026 is January in one convention and February in another. An
    // effective date guessed wrongly misprices a whole month.
    for (const bad of ['01/02/2026', '11-08-2026', 'Aug 11 2026', '2026/08/11']) {
      expect(parseDate(bad), bad).toBeNull();
    }
  });

  it('refuses a date that does not exist', () => {
    // Date() rolls 31 February into March without complaint.
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
  });
});

describe('headers', () => {
  it('accepts the variety spreadsheets actually produce', () => {
    const map = mapHeaders(['Code', 'ITEM NAME', 'charge_kind', 'Amount (Naira)', 'Effective From']);
    expect(map['Code']).toBe('code');
    expect(map['ITEM NAME']).toBe('name');
    expect(map['charge_kind']).toBe('kind');
    expect(map['Effective From']).toBe('effectiveFrom');
  });
});

describe('splitting a pasted block', () => {
  it('keeps a quoted comma inside one field', () => {
    // "Suture, 2/0 vicryl" is an ordinary item name, and without quote handling
    // it shifts every column after it by one — silently mispricing the row.
    const rows = splitDelimited(
      'code,name,kind,amount\nSUT1,"Suture, 2/0 vicryl",CONSUMABLE,1500');
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.name).toBe('Suture, 2/0 vicryl');
    expect(rows[0].cells.amount).toBe('1500');
  });

  it('handles tab-separated paste from a spreadsheet', () => {
    const rows = splitDelimited('code\tname\tkind\tamount\nX1\tGauze\tCONSUMABLE\t200');
    expect(rows[0].cells.name).toBe('Gauze');
  });

  it('numbers lines as the file does, so a fault can be found', () => {
    const rows = splitDelimited('code,name,kind,amount\nA,A,OTHER,1\nB,B,OTHER,2');
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });
});

const row = (cells: Record<string, string>, line = 2) => ({ line, cells });

describe('validating rows', () => {
  it('accepts a complete row', () => {
    const r = parsePriceRows([row({
      code: 'THEATRE-MAJOR', name: 'Theatre charge, major', kind: 'THEATRE',
      amount: '25,000', effectiveFrom: '2026-08-11',
    })], OPTS);
    expect(r.invalid).toEqual([]);
    expect(r.valid[0].amountKobo).toBe(2_500_000);
  });

  it('reports EVERY fault on a row at once', () => {
    // An administrator fixing a 500-line sheet needs the whole list, not one
    // fault per upload attempt.
    const r = parsePriceRows([row({ code: '', name: '', kind: 'NONSENSE', amount: 'free' })], OPTS);
    expect(r.valid).toHaveLength(0);
    const p = r.invalid[0].problem;
    expect(p).toContain('Code');
    expect(p).toContain('Name');
    expect(p).toContain('NONSENSE');
    expect(p).toContain('valid price');
  });

  it('requires a ward for an admission charge', () => {
    // Admission is priced per ward, so without one the row cannot be applied
    // to anything.
    const without = parsePriceRows([row({
      code: 'BED-DAILY', name: 'Daily bed', kind: 'ADMISSION', amount: '5000',
    })], OPTS);
    expect(without.invalid[0].problem).toContain('ward');

    const with_ = parsePriceRows([row({
      code: 'BED-DAILY', name: 'Daily bed', kind: 'ADMISSION', amount: '5000', ward: 'WARD 3',
    })], OPTS);
    expect(with_.valid[0].ward).toBe('WARD 3');
  });

  it('falls back to the given default date when the column is blank', () => {
    const r = parsePriceRows([row({
      code: 'X', name: 'X', kind: 'OTHER', amount: '100',
    })], OPTS);
    expect(r.valid[0].effectiveFrom).toBe('2026-08-11');
  });

  it('flags two rows claiming the same price slot', () => {
    // The administrator cannot have meant both, and choosing one silently
    // would be a guess about money.
    const r = parsePriceRows([
      row({ code: 'A', name: 'A', kind: 'OTHER', amount: '100', effectiveFrom: '2026-08-11' }, 2),
      row({ code: 'A', name: 'A again', kind: 'OTHER', amount: '200', effectiveFrom: '2026-08-11' }, 7),
    ], OPTS);
    expect(r.valid).toHaveLength(1);
    expect(r.duplicates[0].line).toBe(7);
    expect(r.duplicates[0].problem).toContain('line 2');
  });

  it('allows the same code at a different effective date', () => {
    // That is how a price change is expressed, not a duplicate.
    const r = parsePriceRows([
      row({ code: 'A', name: 'A', kind: 'OTHER', amount: '100', effectiveFrom: '2026-08-11' }, 2),
      row({ code: 'A', name: 'A', kind: 'OTHER', amount: '200', effectiveFrom: '2026-09-01' }, 3),
    ], OPTS);
    expect(r.valid).toHaveLength(2);
    expect(r.duplicates).toEqual([]);
  });

  it('skips blank lines and a header repeated mid-file', () => {
    const r = parsePriceRows([
      row({ code: '', name: '', amount: '' }, 5),
      row({ code: 'code', name: 'name', kind: 'kind', amount: 'amount' }, 6),
    ], OPTS);
    expect(r.skipped).toBe(2);
    expect(r.invalid).toEqual([]);
  });

  it('normalises a kind written with spaces or lower case', () => {
    const r = parsePriceRows([row({
      code: 'P', name: 'Physio', kind: 'postop service', amount: '3000',
    })], OPTS);
    expect(r.valid[0].kind).toBe('POSTOP_SERVICE');
  });

  it('never returns a row in both valid and invalid', () => {
    // The caller commits `valid` in one transaction; a row appearing in both
    // would be applied while also being reported as rejected.
    const r = parsePriceRows([
      row({ code: 'A', name: 'A', kind: 'OTHER', amount: '100' }, 2),
      row({ code: '', name: '', kind: 'OTHER', amount: 'x' }, 3),
      row({ code: 'A', name: 'A', kind: 'OTHER', amount: '100' }, 4),
    ], OPTS);
    const lines = [
      ...r.valid.map((v) => v.line),
      ...r.invalid.map((i) => i.line),
      ...r.duplicates.map((d) => d.line),
    ];
    expect(new Set(lines).size).toBe(lines.length);
  });
});
