/**
 * Date and text presentation helpers.
 *
 * Dates are rendered in the long form used on Nigerian public-service
 * documents (`30th July, 2026`) for printed output and in a compact
 * `dd/mm/yyyy` for tables.
 */

import type { IsoDate, IsoDateTime } from './types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function toDate(value: IsoDate | IsoDateTime | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const normalised = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `30th July, 2026` — the form printed on vouchers and certifications. */
export function formatLongDate(value: IsoDate | IsoDateTime | Date | null): string {
  const date = value ? toDate(value) : null;
  if (!date) return '—';
  const day = date.getUTCDate();
  return `${day}${ordinalSuffix(day)} ${MONTHS[date.getUTCMonth()]}, ${date.getUTCFullYear()}`;
}

/** `30/07/2026` — compact form for dense tables. */
export function formatShortDate(value: IsoDate | IsoDateTime | Date | null): string {
  const date = value ? toDate(value) : null;
  if (!date) return '—';
  return [
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    date.getUTCFullYear(),
  ].join('/');
}

/** `30 Jul 2026, 09:15` — used on audit trail rows and document footers. */
export function formatDateTime(value: IsoDateTime | Date | null): string {
  const date = value ? toDate(value) : null;
  if (!date) return '—';
  return (
    `${String(date.getUTCDate()).padStart(2, '0')} ${SHORT_MONTHS[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2, '0')}:` +
    `${String(date.getUTCMinutes()).padStart(2, '0')}`
  );
}

export function toIsoDate(value: Date | string): IsoDate {
  const date = toDate(value);
  if (!date) throw new TypeError(`Cannot convert to ISO date: ${String(value)}`);
  return date.toISOString().slice(0, 10);
}

/** `2026-07` — the bucket key for monthly aggregation. */
export function monthKey(value: IsoDate | IsoDateTime | Date): string {
  const date = toDate(value);
  if (!date) throw new TypeError(`Cannot derive month key from: ${String(value)}`);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `Jul 2026` — the axis label for the monthly spending graph. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const index = Number(month) - 1;
  return `${SHORT_MONTHS[index] ?? month} ${year}`;
}

/** `Q3 2026`. */
export function quarterLabel(value: IsoDate | IsoDateTime | Date): string {
  const date = toDate(value);
  if (!date) return '—';
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}

/** Inclusive month buckets spanning `from`..`to`, so the graph shows empty months. */
export function monthRange(from: IsoDate, to: IsoDate): string[] {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return [];

  const keys: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor <= limit && keys.length < 240) {
    keys.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

/** `2 days ago`, `in 5 days` — used on retirement due-date chips. */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days overdue`;
}

/** Initials for avatar chips: `Adaeze N. Okeke` → `AO`. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((p) => p.length > 1 || !p.includes('.'));
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Truncates for fixed-width PDF table cells, preserving whole words where possible. */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Masks a TIN for on-screen display, leaving the last four digits visible. */
export function maskTin(tin: string | null): string {
  if (!tin) return '—';
  const trimmed = tin.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${'•'.repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}
