/**
 * Every column in an Excel export must name a field the report builder
 * actually produces.
 *
 * This is worth its own suite because the failure is silent: a column keyed to
 * a field that does not exist renders as an empty column, and an accountant
 * receives a workbook with a blank "Amount" rather than an error. That is
 * exactly what happened once — the cash-book layout asked for `totalCost` when
 * the builder emits `amount`.
 *
 * The check reads both files and compares the keys, so it fails the moment
 * either side is renamed without the other.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const EXPORT_ROUTE = join(ROOT, 'src/app/api/imprest/reports/export/route.ts');
const REPORTS_LIB = join(ROOT, 'src/lib/imprest/reports.ts');

const exportSrc = readFileSync(EXPORT_ROUTE, 'utf8');
const libSrc = readFileSync(REPORTS_LIB, 'utf8');

/** `{ header: 'x', key: 'y' }` entries, grouped by the layout they sit in. */
function parseLayouts(): Record<string, { rowsFrom: string; keys: string[] }> {
  const out: Record<string, { rowsFrom: string; keys: string[] }> = {};
  const block = /\n {2}'?([a-z-]+)'?: \{\s*\n\s*title: '[^']+',\s*\n\s*rowsFrom: '(\w+)',\s*\n\s*columns: \[([\s\S]*?)\n {4}\],/g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(exportSrc)) !== null) {
    const keys = Array.from(m[3].matchAll(/key: '([^']+)'/g)).map((k) => k[1]);
    out[m[1]] = { rowsFrom: m[2], keys };
  }
  return out;
}

/** Which builder produces each report kind. */
const BUILDER: Record<string, string> = {
  register: 'imprestRegister',
  'cash-book': 'cashBook',
  outstanding: 'outstanding',
  vendors: 'vendorRegister',
  quarterly: 'quarterlyPosition',
  annual: 'annualSummary',
  categories: 'categoryAnalysis',
  receipts: 'receiptRegister',
  audit: 'auditReport',
};

/** Source of one exported builder function, from its signature to the next one. */
function bodyOf(fnName: string): string {
  const start = libSrc.indexOf(`export async function ${fnName}(`);
  if (start === -1) throw new Error(`builder ${fnName} not found in reports.ts`);
  const after = libSrc.indexOf('\nexport ', start + 1);
  return libSrc.slice(start, after === -1 ? undefined : after);
}

/**
 * Every property name a builder could put on a row: both `name: value` and the
 * shorthand `name,`.
 *
 * Deliberately generous — it scans the whole builder rather than trying to
 * locate the row literal. A false "this field exists" is a missed mismatch; a
 * false "it doesn't" would be a test that cries wolf and gets deleted. The
 * first parser here was too clever about narrowing the region and reported six
 * fields missing that were plainly there.
 */
function keysEmittedBy(fnName: string): Set<string> {
  const body = bodyOf(fnName);
  const keys = new Set<string>();
  // Property position, wherever it appears — several row literals are written
  // on one line inside a Map default, so a line-anchored match found nothing.
  for (const m of body.matchAll(/(?:^\s*|[{,(]\s*)([a-zA-Z][\w]*)\s*:/gm)) keys.add(m[1]);
  for (const m of body.matchAll(/^\s+([a-zA-Z][\w]*),\s*$/gm)) keys.add(m[1]);
  // `const spent = ...` then used as shorthand.
  for (const m of body.matchAll(/\bconst (\w+) =/g)) keys.add(m[1]);
  return keys;
}

const LAYOUTS = parseLayouts();

describe('the export layouts were found at all', () => {
  it('parses one layout per report kind', () => {
    // If this regex ever stops matching, every test below would pass vacuously.
    expect(Object.keys(LAYOUTS).length).toBe(9);
  });

  it('every layout has columns', () => {
    for (const [kind, layout] of Object.entries(LAYOUTS)) {
      expect(layout.keys.length > 0).toBe(true);
      expect(typeof kind).toBe('string');
    }
  });
});

describe('every export column names a field the builder emits', () => {
  for (const [kind, layout] of Object.entries(LAYOUTS)) {
    it(`${kind}`, () => {
      const emitted = keysEmittedBy(BUILDER[kind]);
      const missing = layout.keys.filter((k) => !emitted.has(k));
      expect(missing.join(', ')).toBe('');
    });
  }

  it('names a builder for every layout', () => {
    const unmapped = Object.keys(LAYOUTS).filter((k) => !BUILDER[k]);
    expect(unmapped.join(', ')).toBe('');
  });
});

describe('the check itself has teeth', () => {
  it('would notice a column keyed to a field nobody produces', () => {
    expect(keysEmittedBy('cashBook').has('definitelyNotAField')).toBe(false);
  });

  it('really did read the builders', () => {
    expect(keysEmittedBy('cashBook').size > 5).toBe(true);
    expect(keysEmittedBy('vendorRegister').has('vendorName')).toBe(true);
  });

  it('the builder each layout names actually exists', () => {
    for (const fn of Object.values(BUILDER)) {
      expect(libSrc).toContain(`export async function ${fn}(`);
    }
  });
});
