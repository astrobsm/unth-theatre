/**
 * Document numbering.
 *
 * Public-service documents carry a legible, sortable reference that identifies
 * the unit, the financial year and the sequence. The formats below are
 * deterministic — given the same inputs they always produce the same string,
 * which lets an offline device mint a provisional number that the server can
 * verify rather than silently rewrite.
 *
 *   Imprest      TCU/IMP/2026/0007
 *   Expenditure  TCU/EXP/2026/000142
 *   Retirement   TCU/RET/2026/0007
 *   Voucher      TCU/PV/2026/000142
 *   Document ID  IMPREST-RET-20260730-3F9A2C1B   (printed under the QR code)
 */

import { DocumentType } from './enums';

export const DEFAULT_UNIT_PREFIX = 'TCU';

export const SERIES = {
  IMPREST: 'IMP',
  EXPENDITURE: 'EXP',
  RETIREMENT: 'RET',
  VOUCHER: 'PV',
  RECEIPT: 'RCT',
} as const;
export type Series = (typeof SERIES)[keyof typeof SERIES];

export interface NumberFormatOptions {
  unitPrefix?: string;
  /** Financial year label; a `2026/2027` label is reduced to `2026`. */
  financialYear: string;
  sequence: number;
  padding?: number;
}

function normaliseYear(label: string): string {
  const match = /(\d{4})/.exec(label);
  return match?.[1] ?? label.replace(/\W/g, '');
}

export function formatDocumentNumber(series: Series, options: NumberFormatOptions): string {
  const {
    unitPrefix = DEFAULT_UNIT_PREFIX,
    financialYear,
    sequence,
    padding = series === SERIES.EXPENDITURE || series === SERIES.VOUCHER ? 6 : 4,
  } = options;

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Sequence must be a positive integer, received: ${String(sequence)}`);
  }

  return [
    unitPrefix.toUpperCase(),
    series,
    normaliseYear(financialYear),
    String(sequence).padStart(padding, '0'),
  ].join('/');
}

export const formatImprestNumber = (o: NumberFormatOptions) =>
  formatDocumentNumber(SERIES.IMPREST, o);
export const formatExpenseNumber = (o: NumberFormatOptions) =>
  formatDocumentNumber(SERIES.EXPENDITURE, o);
export const formatRetirementNumber = (o: NumberFormatOptions) =>
  formatDocumentNumber(SERIES.RETIREMENT, o);
export const formatVoucherNumber = (o: NumberFormatOptions) =>
  formatDocumentNumber(SERIES.VOUCHER, o);

export interface ParsedDocumentNumber {
  unitPrefix: string;
  series: string;
  financialYear: string;
  sequence: number;
}

/** Parses a reference back into its parts; `null` when the shape is unrecognised. */
export function parseDocumentNumber(value: string): ParsedDocumentNumber | null {
  const match = /^([A-Z0-9]+)\/([A-Z]+)\/(\d{4})\/(\d+)$/.exec(value.trim().toUpperCase());
  if (!match) return null;
  const [, unitPrefix, series, financialYear, sequence] = match;
  return {
    unitPrefix: unitPrefix as string,
    series: series as string,
    financialYear: financialYear as string,
    sequence: Number(sequence),
  };
}

const DOCUMENT_TYPE_CODE: Record<DocumentType, string> = {
  IMPREST_REGISTER: 'IMPREG',
  CASH_BOOK: 'CASHBK',
  EXPENSE_REGISTER: 'EXPREG',
  RETIREMENT_FORM: 'RETFRM',
  APPROVAL_SHEET: 'APPRVL',
  RECEIPT_REGISTER: 'RCTREG',
  SUMMARY_REPORT: 'SUMMRY',
  VENDOR_REGISTER: 'VNDREG',
  AUDIT_REPORT: 'AUDRPT',
  PAYMENT_VOUCHER: 'PAYVCH',
};

/**
 * Mints the unique identifier printed on a generated PDF and encoded in its
 * QR code. `entropy` must be supplied by the caller (crypto random on the
 * server, `crypto.getRandomValues` in the browser) so this module stays pure
 * and therefore trivially testable.
 */
export function buildDocumentId(params: {
  documentType: DocumentType;
  issuedAt: Date;
  entropy: string;
}): string {
  const { documentType, issuedAt, entropy } = params;
  const stamp =
    issuedAt.getUTCFullYear().toString() +
    String(issuedAt.getUTCMonth() + 1).padStart(2, '0') +
    String(issuedAt.getUTCDate()).padStart(2, '0');
  const suffix = entropy.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8).padEnd(8, '0');
  return `${DOCUMENT_TYPE_CODE[documentType]}-${stamp}-${suffix}`;
}

/** The URL encoded into a document's QR code for third-party verification. */
export function buildVerifyUrl(baseUrl: string, documentId: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/${encodeURIComponent(documentId)}`;
}
