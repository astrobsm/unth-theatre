import { describe, expect, it } from 'vitest';
import { DocumentType } from '../../src/lib/imprest/enums';
import {
  buildDocumentId,
  buildVerifyUrl,
  formatExpenseNumber,
  formatImprestNumber,
  formatRetirementNumber,
  parseDocumentNumber,
} from '../../src/lib/imprest/numbering';
import {
  formatDateTime,
  formatLongDate,
  formatShortDate,
  initials,
  maskTin,
  monthKey,
  monthLabel,
  monthRange,
  relativeDays,
  truncate,
} from '../../src/lib/imprest/format';

describe('document numbering', () => {
  it('formats each series with its own padding', () => {
    expect(formatImprestNumber({ financialYear: '2026', sequence: 7 })).toBe('TCU/IMP/2026/0007');
    expect(formatExpenseNumber({ financialYear: '2026', sequence: 142 })).toBe('TCU/EXP/2026/000142');
    expect(formatRetirementNumber({ financialYear: '2026', sequence: 7 })).toBe('TCU/RET/2026/0007');
  });

  it('reduces a split financial year label to its opening year', () => {
    expect(formatImprestNumber({ financialYear: '2026/2027', sequence: 1 })).toBe('TCU/IMP/2026/0001');
  });

  it('honours a custom unit prefix', () => {
    expect(
      formatImprestNumber({ unitPrefix: 'unth', financialYear: '2026', sequence: 3 }),
    ).toBe('UNTH/IMP/2026/0003');
  });

  it('rejects a non-positive sequence', () => {
    expect(() => formatImprestNumber({ financialYear: '2026', sequence: 0 })).toThrow(RangeError);
    expect(() => formatImprestNumber({ financialYear: '2026', sequence: 1.5 })).toThrow(RangeError);
  });

  it('round-trips through the parser', () => {
    const value = formatExpenseNumber({ financialYear: '2026', sequence: 142 });
    expect(parseDocumentNumber(value)).toEqual({
      unitPrefix: 'TCU',
      series: 'EXP',
      financialYear: '2026',
      sequence: 142,
    });
  });

  it('returns null for an unrecognised reference', () => {
    expect(parseDocumentNumber('not-a-reference')).toBeNull();
  });
});

describe('document identity', () => {
  const issuedAt = new Date('2026-07-30T09:15:00.000Z');

  it('stamps the type, date and entropy', () => {
    const id = buildDocumentId({
      documentType: DocumentType.RETIREMENT_FORM,
      issuedAt,
      entropy: '3f9a2c1b7e',
    });
    expect(id).toBe('RETFRM-20260730-3F9A2C1B');
  });

  it('pads short entropy so the identifier keeps a fixed width', () => {
    const id = buildDocumentId({
      documentType: DocumentType.CASH_BOOK,
      issuedAt,
      entropy: 'ab',
    });
    expect(id).toBe('CASHBK-20260730-AB000000');
  });

  it('builds a verification URL without doubling the slash', () => {
    expect(buildVerifyUrl('https://imprest.unth.gov.ng/verify/', 'RETFRM-20260730-3F9A2C1B')).toBe(
      'https://imprest.unth.gov.ng/verify/RETFRM-20260730-3F9A2C1B',
    );
  });
});

describe('date presentation', () => {
  it('renders the long form printed on vouchers', () => {
    expect(formatLongDate('2026-07-30')).toBe('30th July, 2026');
    expect(formatLongDate('2026-07-01')).toBe('1st July, 2026');
    expect(formatLongDate('2026-07-02')).toBe('2nd July, 2026');
    expect(formatLongDate('2026-07-03')).toBe('3rd July, 2026');
    expect(formatLongDate('2026-07-11')).toBe('11th July, 2026');
    expect(formatLongDate('2026-07-22')).toBe('22nd July, 2026');
  });

  it('renders compact and timestamped forms', () => {
    expect(formatShortDate('2026-07-30')).toBe('30/07/2026');
    expect(formatDateTime('2026-07-30T09:15:00.000Z')).toBe('30 Jul 2026, 09:15');
  });

  it('shows an em dash rather than "Invalid Date"', () => {
    expect(formatLongDate(null)).toBe('—');
    expect(formatShortDate('')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('aggregation keys', () => {
  it('derives month keys and labels', () => {
    expect(monthKey('2026-07-30')).toBe('2026-07');
    expect(monthLabel('2026-07')).toBe('Jul 2026');
  });

  it('fills every month in a range so the graph has no gaps', () => {
    expect(monthRange('2026-11-15', '2027-02-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});

describe('text helpers', () => {
  it('describes relative due dates', () => {
    expect(relativeDays(0)).toBe('today');
    expect(relativeDays(1)).toBe('tomorrow');
    expect(relativeDays(5)).toBe('in 5 days');
    expect(relativeDays(-3)).toBe('3 days overdue');
  });

  it('derives initials from a full name', () => {
    expect(initials('Adaeze Okeke')).toBe('AO');
    expect(initials('Chukwuemeka')).toBe('C');
  });

  it('truncates on a word boundary where it can', () => {
    expect(truncate('Reams of A4 duplicating paper', 15)).toBe('Reams of A4…');
    expect(truncate('Short', 15)).toBe('Short');
  });

  it('masks a TIN down to its last four digits', () => {
    expect(maskTin('12345678901')).toBe('•••••••8901');
    expect(maskTin(null)).toBe('—');
  });
});
