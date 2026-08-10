// ============================================================
// Bulk price upload — parsing and validation
// ------------------------------------------------------------
// Administrators paste or upload a spreadsheet of prices: consumables, ward
// admission rates, surgical fees, theatre charges, investigations. Each row
// becomes a `Tariff` — the existing effective-dated price master — so this file
// introduces no new pricing table.
//
// It is deliberately pure. Nothing here touches a database, which means the
// awkward cases can be tested exhaustively rather than discovered by an
// administrator who has just overwritten the theatre charge for every
// procedure in the hospital.
//
// TWO RULES THAT SHAPE ALL OF IT
//
// Money is INTEGER KOBO, as everywhere else in this schema. "1500.50" is
// parsed to 150050 kobo, and anything with sub-kobo precision is REJECTED
// rather than rounded: a silently rounded price is a figure nobody typed.
//
// Nothing is committed until the whole file is understood. The caller applies
// the result in one transaction, so a file with one bad row on line 400 leaves
// the price master exactly as it was. A half-imported price list is worse than
// a rejected one, because nobody can tell which half took.
// ============================================================

import { type ChargeKind } from './chargeKinds';

export interface RawRow {
  /** 1-based line number in the uploaded file, for reporting. */
  line: number;
  cells: Record<string, string>;
}

export interface ParsedPrice {
  line: number;
  code: string;
  name: string;
  kind: ChargeKind;
  amountKobo: number;
  effectiveFrom: string; // YYYY-MM-DD
  /** Optional link to a stock item, so consumables price against inventory. */
  itemCode?: string;
  /** For ward admission rates: which ward this daily charge applies to. */
  ward?: string;
  notes?: string;
  reason?: string;
}

export interface RowProblem {
  line: number;
  code: string;
  problem: string;
}

export interface ImportResult {
  valid: ParsedPrice[];
  invalid: RowProblem[];
  /** Same code + kind + effectiveFrom appearing twice in ONE file. */
  duplicates: RowProblem[];
  /** Rows deliberately skipped: blank lines, or a repeated header. */
  skipped: number;
}

/** Column headings accepted, in any case, with spaces or underscores. */
const ALIASES: Record<string, string[]> = {
  code: ['code', 'item code', 'charge code'],
  name: ['name', 'description', 'item', 'item name'],
  kind: ['kind', 'type', 'category', 'charge kind'],
  amount: ['amount', 'price', 'naira', 'amount naira', 'unit price', 'cost'],
  effectiveFrom: ['effective from', 'effective', 'from', 'start date', 'date'],
  itemCode: ['inventory code', 'stock code', 'item ref'],
  ward: ['ward', 'ward name'],
  notes: ['notes', 'note', 'comment'],
  reason: ['reason', 'why'],
};

const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/** Map a row's headings onto our field names, tolerating spreadsheet variety. */
export function mapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const raw of headers) {
    const h = normaliseHeader(raw);
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(h)) { map[raw] = field; break; }
    }
  }
  return map;
}

/**
 * Naira text to integer kobo.
 *
 * Accepts "1,500", "₦1500", "1500.50", " 1500 ". Rejects anything with more
 * than two decimal places instead of rounding it, because a price the
 * administrator did not type is a price nobody agreed.
 *
 * Returns null for anything unparseable, so the caller reports the line rather
 * than storing a zero.
 */
export function nairaToKobo(text: string): number | null {
  const cleaned = (text ?? '').replace(/[₦\s,]/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(kobo)) return null;
  return kobo;
}

/** ISO date, or null. Rejects ambiguous forms rather than guessing. */
export function parseDate(text: string): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  // Only YYYY-MM-DD. "01/02/2026" is January in one country and February in
  // another, and an effective date guessed wrongly misprices a whole month.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject 2026-02-31, which Date happily rolls into March.
  if (d.toISOString().slice(0, 10) !== t) return null;
  return t;
}

export interface ParseOptions {
  validKinds: readonly string[];
  /** Applied when a row leaves the date blank. */
  defaultEffectiveFrom: string;
}

/**
 * Validate every row, reporting all problems rather than stopping at the first.
 *
 * An administrator fixing a 500-line spreadsheet needs the whole list of
 * faults, not one at a time.
 */
export function parsePriceRows(rows: RawRow[], opts: ParseOptions): ImportResult {
  const valid: ParsedPrice[] = [];
  const invalid: RowProblem[] = [];
  const duplicates: RowProblem[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const row of rows) {
    const get = (f: string) => (row.cells[f] ?? '').trim();
    const code = get('code');
    const name = get('name');

    // A wholly blank line, or a header repeated mid-file by a spreadsheet
    // export, is not an error worth reporting.
    if (!code && !name && !get('amount')) { skipped++; continue; }
    if (normaliseHeader(code) === 'code') { skipped++; continue; }

    const problems: string[] = [];

    if (!code) problems.push('Code is required.');
    if (!name) problems.push('Name is required.');

    const kindRaw = get('kind').toUpperCase().replace(/[\s-]+/g, '_');
    if (!kindRaw) problems.push('Kind is required.');
    else if (!opts.validKinds.includes(kindRaw)) {
      problems.push(`Kind "${get('kind')}" is not one of ${opts.validKinds.join(', ')}.`);
    }

    const amountKobo = nairaToKobo(get('amount'));
    if (amountKobo === null) {
      problems.push(`Amount "${get('amount')}" is not a valid price. Use digits, at most two decimals.`);
    } else if (amountKobo < 0) {
      problems.push('Amount cannot be negative.');
    }

    const dateText = get('effectiveFrom');
    const effectiveFrom = dateText ? parseDate(dateText) : opts.defaultEffectiveFrom;
    if (!effectiveFrom) {
      problems.push(`Effective date "${dateText}" must be written YYYY-MM-DD.`);
    }

    // Ward admission rates are priced per ward, so the ward is what
    // distinguishes two otherwise identical rows.
    if (kindRaw === 'ADMISSION' && !get('ward')) {
      problems.push('An admission charge needs a ward.');
    }

    if (problems.length) {
      invalid.push({ line: row.line, code: code || '(no code)', problem: problems.join(' ') });
      continue;
    }

    // Two rows in one file claiming the same price slot: the administrator
    // cannot have meant both, and picking one silently would be a guess.
    const key = `${code}|${kindRaw}|${effectiveFrom}|${get('ward')}`;
    const first = seen.get(key);
    if (first !== undefined) {
      duplicates.push({
        line: row.line, code,
        problem: `Same code, kind and effective date as line ${first}. Remove one.`,
      });
      continue;
    }
    seen.set(key, row.line);

    valid.push({
      line: row.line,
      code, name,
      kind: kindRaw as ChargeKind,
      amountKobo: amountKobo as number,
      effectiveFrom: effectiveFrom as string,
      itemCode: get('itemCode') || undefined,
      ward: get('ward') || undefined,
      notes: get('notes') || undefined,
      reason: get('reason') || undefined,
    });
  }

  return { valid, invalid, duplicates, skipped };
}

/**
 * Split a pasted CSV or TSV block into rows.
 *
 * Handles quoted fields containing commas, because an item named
 * "Suture, 2/0 vicryl" is entirely ordinary and would otherwise shift every
 * column after it by one.
 */
export function splitDelimited(text: string): RawRow[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (!lines.length) return [];

  const delimiter = (lines[0].match(/\t/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delimiter) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };

  const headers = parseLine(lines[0]);
  const map = mapHeaders(headers);
  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells: Record<string, string> = {};
    const parts = parseLine(lines[i]);
    headers.forEach((h, idx) => {
      const field = map[h];
      if (field) cells[field] = parts[idx] ?? '';
    });
    rows.push({ line: i + 1, cells });
  }
  return rows;
}

/** Headings recognised, for the template an administrator downloads. */
export const TEMPLATE_HEADERS = ['code', 'name', 'kind', 'amount', 'effective from', 'ward', 'inventory code', 'reason'];
