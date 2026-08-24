import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every key left in `surgeryData` is spread into prisma.surgery.create(), so
 * each one must be a column on Surgery. A field the form sends that the model
 * does not have makes Prisma reject the ENTIRE call — "Invalid
 * `prisma.surgery.create()` invocation: Unknown argument" — and booking stops
 * for everybody.
 *
 * That is not hypothetical. deferOutstanding and allowDuplicate were added as
 * instructions to the handler, read, and then left in the spread; booking was
 * broken from 21 to 24 August and the only symptom anyone could see was the
 * words "Internal server error".
 *
 * Reading the source rather than importing it: the route pulls in next-auth,
 * Prisma and a dozen libs, none of which belong in a unit test. The three
 * things this needs — the zod keys, the destructured names and the model
 * columns — are all plainly in the text.
 */

const root = join(__dirname, '..', '..');
const routeSrc = readFileSync(join(root, 'src/app/api/surgeries/route.ts'), 'utf8');
const schemaSrc = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');

function block(src: string, startRe: RegExp, endRe: RegExp): string {
  // Split on \r?\n. These files check out CRLF on Windows, and a trailing \r
  // stops any $-anchored pattern from matching — which is exactly how the
  // first version of this test reported an empty destructure list.
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && endRe.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** Top-level keys of the request schema. */
function zodKeys(): string[] {
  const b = block(routeSrc, /const surgerySchema\s*=/, /^\}\);/);
  return Array.from(new Set([...b.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm)].map((m) => m[1])));
}

/** Names pulled out before the spread — including `x: _x` renames. */
function destructured(): string[] {
  const b = block(routeSrc, /^\s*const \{$/, /\} = validatedData;/);
  return Array.from(new Set([...b.matchAll(/^ {6}([a-zA-Z][a-zA-Z0-9_]*)\s*(?::|,)/gm)].map((m) => m[1])));
}

/** Scalar and relation fields on the Surgery model. */
function surgeryColumns(): string[] {
  const b = block(schemaSrc, /^model Surgery \{/, /^\}/);
  return Array.from(new Set([...b.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*)\s+\S/gm)].map((m) => m[1])));
}

describe('what gets spread into prisma.surgery.create()', () => {
  it('finds the three lists it reasons about', () => {
    // Guards the parsing itself: if the route is reformatted so these come back
    // empty, the real assertion below would pass by finding nothing.
    expect(zodKeys().length).toBeGreaterThan(30);
    expect(destructured().length).toBeGreaterThan(10);
    expect(surgeryColumns().length).toBeGreaterThan(50);
  });

  it('leaves nothing that is not a column on Surgery', () => {
    const columns = new Set(surgeryColumns());
    const removed = new Set(destructured());
    const leaked = zodKeys().filter((k) => !removed.has(k) && !columns.has(k));

    expect(
      leaked,
      `These are sent by the form and spread into surgery.create() but are not `
      + `columns on Surgery, so Prisma will reject every booking. Either add them `
      + `to the destructure above ...surgeryData, or add them to the model: `
      + leaked.join(', '),
    ).toEqual([]);
  });

  it('catches the exact regression that broke booking in August', () => {
    // deferOutstanding is sent on every submission, not only an early one.
    const removed = new Set(destructured());
    expect(removed.has('deferOutstanding')).toBe(true);
    expect(removed.has('allowDuplicate')).toBe(true);
  });
});
