/**
 * Bulk import validation.
 *
 * The behaviours worth protecting: report EVERY fault in one pass rather than
 * the first; never guess a date format; and refuse the whole import if anything
 * is wrong, because a half-imported catalogue is worse than no import.
 */
import { describe, expect, it } from 'vitest';

import {
  canCommit,
  errorsToCsv,
  IMPORT_SPECS,
  mapHeaders,
  parseMoney,
  validateCell,
  validateSheet,
} from '../../src/lib/stock/import';

const ITEM_HEADERS = ['Item Name', 'Category', 'Description', 'Unit Cost (Naira)', 'Reorder Level', 'Supplier'];

describe('matching the sheet to the spec', () => {
  it('matches headers regardless of case, spacing or punctuation', () => {
    const { index, missing } = mapHeaders(IMPORT_SPECS.ITEMS.columns, ['item name', 'CATEGORY', 'Unit Cost(Naira)']);
    expect(missing).toHaveLength(0);
    expect(index.name).toBe(0);
    expect(index.category).toBe(1);
    expect(index.unitCostPrice).toBe(2);
  });

  it('names the required columns that are missing', () => {
    const { missing } = mapHeaders(IMPORT_SPECS.ITEMS.columns, ['Description']);
    expect(missing).toEqual(['Item Name', 'Category']);
  });

  it('does not complain about a missing optional column', () => {
    const { missing } = mapHeaders(IMPORT_SPECS.ITEMS.columns, ['Item Name', 'Category']);
    expect(missing).toHaveLength(0);
  });

  it('refuses the whole sheet up front when a required column is absent', () => {
    // Validating 2,000 rows against the wrong columns helps nobody.
    const p = validateSheet({ kind: 'ITEMS', headers: ['Description'], rows: [['x']] });
    expect(p.valid).toHaveLength(0);
    expect(p.errors[0].message).toContain('missing required column');
  });
});

describe('money', () => {
  it('reads naira into kobo', () => {
    expect(parseMoney('2500')).toBe(250_000);
    expect(parseMoney('2500.50')).toBe(250_050);
  });

  it('tolerates the naira sign and thousands separators', () => {
    expect(parseMoney('₦1,250.75')).toBe(125_075);
  });

  it('refuses something that is not a number', () => {
    expect(parseMoney('two thousand')).toBeNull();
  });

  it('rounds once, to the kobo', () => {
    expect(parseMoney('0.015')).toBe(2);
  });
});

describe('dates', () => {
  const col = IMPORT_SPECS.TARIFFS.columns.find((c) => c.field === 'effectiveFrom')!;

  it('reads ISO', () => {
    const { value } = validateCell(col, '2026-07-01', 2);
    expect((value as Date).toISOString().slice(0, 10)).toBe('2026-07-01');
  });

  it('reads dd/mm/yyyy as day first', () => {
    // Guessing mm/dd here would silently shift expiry dates by months.
    const { value } = validateCell(col, '07/01/2026', 2);
    expect((value as Date).toISOString().slice(0, 10)).toBe('2026-01-07');
  });

  it('refuses an ambiguous or malformed date rather than guessing', () => {
    expect(validateCell(col, '7 July 26', 2).error).not.toBeNull();
    expect(validateCell(col, '2026-13-45', 2).error).not.toBeNull();
  });
});

describe('validating a cell', () => {
  const nameCol = IMPORT_SPECS.ITEMS.columns.find((c) => c.field === 'name')!;
  const catCol = IMPORT_SPECS.ITEMS.columns.find((c) => c.field === 'category')!;
  const reorderCol = IMPORT_SPECS.ITEMS.columns.find((c) => c.field === 'reorderLevel')!;

  it('requires what is required, and says which column', () => {
    const { error } = validateCell(nameCol, '', 5);
    expect(error?.row).toBe(5);
    expect(error?.column).toBe('Item Name');
    expect(error?.message).toContain('required');
  });

  it('allows an empty optional cell', () => {
    expect(validateCell(reorderCol, '', 5).error).toBeNull();
  });

  it('accepts an enum in any case and stores it upper', () => {
    expect(validateCell(catCol, 'consumable', 5).value).toBe('CONSUMABLE');
  });

  it('lists the acceptable values when an enum is wrong', () => {
    const { error } = validateCell(catCol, 'SUTURE', 5);
    expect(error?.message).toContain('CONSUMABLE');
  });

  it('refuses a fractional integer', () => {
    expect(validateCell(reorderCol, '2.5', 5).error).not.toBeNull();
  });

  it('refuses a negative where a minimum is set', () => {
    expect(validateCell(reorderCol, '-1', 5).error).not.toBeNull();
  });

  it('refuses text longer than the column allows', () => {
    expect(validateCell(nameCol, 'x'.repeat(201), 5).error).not.toBeNull();
  });
});

describe('validating a whole sheet', () => {
  it('accepts a clean sheet', () => {
    const p = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [
        ['Vicryl 2/0', 'CONSUMABLE', 'Suture', '2500', '20', 'Ginos Ventures'],
        ['Propofol 200mg', 'CONSUMABLE', 'Induction agent', '1200', '50', ''],
      ],
    });
    expect(p.errors).toHaveLength(0);
    expect(p.valid).toHaveLength(2);
    expect(p.summary.toCreate).toBe(2);
  });

  it('reports EVERY fault, not just the first', () => {
    // Fixing errors one upload at a time is how people give up.
    const p = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [
        ['', 'NONSENSE', '', 'abc', '', ''],
        ['', 'ALSO WRONG', '', 'xyz', '', ''],
      ],
    });
    expect(p.errors.length).toBeGreaterThan(4);
    expect(new Set(p.errors.map((e) => e.row)).size).toBe(2);
  });

  it('numbers rows as the operator sees them in Excel', () => {
    const p = validateSheet({ kind: 'ITEMS', headers: ITEM_HEADERS, rows: [['', 'CONSUMABLE', '', '', '', '']] });
    // First data row is row 2: row 1 is the header.
    expect(p.errors[0].row).toBe(2);
  });

  it('ignores wholly blank trailing rows', () => {
    const p = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [['Vicryl', 'CONSUMABLE', '', '', '', ''], ['', '', '', '', '', ''], ['  ', '', '', '', '', '']],
    });
    expect(p.errors).toHaveLength(0);
    expect(p.valid).toHaveLength(1);
  });

  it('converts money to kobo on the parsed row', () => {
    const p = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [['Vicryl', 'CONSUMABLE', '', '₦2,500.50', '', '']],
    });
    expect(p.valid[0].values.unitCostPrice).toBe(250_050);
  });
});

describe('duplicates', () => {
  it('finds the same key twice in the file and rejects BOTH copies', () => {
    // Which of the two is the truth? Taking the last one silently is a guess.
    const p = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [
        ['Vicryl 2/0', 'CONSUMABLE', 'first', '2500', '', ''],
        ['vicryl 2/0', 'CONSUMABLE', 'second', '3000', '', ''],
      ],
    });
    expect(p.duplicatesInFile).toHaveLength(1);
    expect(p.duplicatesInFile[0].rows).toEqual([2, 3]);
    expect(p.valid).toHaveLength(0);
    expect(p.errors.some((e) => e.message.includes('rows 2, 3'))).toBe(true);
  });

  it('separates rows that already exist from rows that are new', () => {
    const p = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [
        ['Vicryl 2/0', 'CONSUMABLE', '', '2500', '', ''],
        ['Brand New Item', 'CONSUMABLE', '', '100', '', ''],
      ],
      existingKeys: ['vicryl 2/0'],
    });
    expect(p.summary.toUpdate).toBe(1);
    expect(p.summary.toCreate).toBe(1);
  });
});

describe('cross-field rules', () => {
  const STOCK_HEADERS = ['Item Name', 'Batch Number', 'Store Code', 'Quantity', 'Expiry Date', 'Purchase Price (Naira)', 'Selling Price (Naira)', 'Owner', 'Vendor Name'];

  it('consignment stock must name its vendor', () => {
    const p = validateSheet({
      kind: 'STOCK',
      headers: STOCK_HEADERS,
      rows: [['Vicryl', 'LOT-1', 'TSU-CONS', '10', '2027-01-01', '100', '250', 'VENDOR', '']],
    });
    expect(p.errors.some((e) => e.message.includes('vendor that owns it'))).toBe(true);
    expect(p.valid).toHaveLength(0);
  });

  it('hospital-owned stock needs no vendor', () => {
    const p = validateSheet({
      kind: 'STOCK',
      headers: STOCK_HEADERS,
      rows: [['Vicryl', 'LOT-1', 'TSU-CONS', '10', '2027-01-01', '100', '250', 'HOSPITAL', '']],
    });
    expect(p.errors).toHaveLength(0);
  });
});

describe('whether the import may proceed', () => {
  const clean = validateSheet({
    kind: 'ITEMS',
    headers: ITEM_HEADERS,
    rows: [['Vicryl', 'CONSUMABLE', '', '2500', '', '']],
  });

  it('allows a clean import', () => {
    expect(canCommit(clean).allowed).toBe(true);
  });

  it('blocks on ANY error — a partial import is worse than none', () => {
    const dirty = validateSheet({
      kind: 'ITEMS',
      headers: ITEM_HEADERS,
      rows: [['Vicryl', 'CONSUMABLE', '', '2500', '', ''], ['', 'CONSUMABLE', '', '', '', '']],
    });
    const verdict = canCommit(dirty);
    expect(verdict.allowed).toBe(false);
    expect(verdict.message).toContain('nothing has been changed');
  });

  it('blocks an empty import', () => {
    const empty = validateSheet({ kind: 'ITEMS', headers: ITEM_HEADERS, rows: [] });
    expect(canCommit(empty).allowed).toBe(false);
  });
});

describe('the error report', () => {
  it('is CSV, so it opens in the tool the file came from', () => {
    const csv = errorsToCsv([{ row: 2, column: 'Item Name', value: '', message: 'Item Name is required.' }]);
    expect(csv.split('\n')[0]).toBe('Row,Column,Value,Problem');
    expect(csv).toContain('"Item Name is required."');
  });

  it('escapes a message containing a quote', () => {
    const csv = errorsToCsv([{ row: 2, column: 'X', value: 'a"b', message: 'said "no"' }]);
    expect(csv).toContain('"a""b"');
  });
});
