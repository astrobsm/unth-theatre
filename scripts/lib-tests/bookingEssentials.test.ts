/**
 * A booking cannot reach the theatre list without a surgeon.
 *
 * Two O&G Firm 3 cases booked on 18 October 2026 by a house officer showed
 * "Not assigned" in the surgeon column right up to their operating day. Three
 * things had to line up for that, and all three were true:
 *
 *   the surgeon <select> is marked required, but the early "Book now" button
 *   carries formNoValidate, so the browser never checked it;
 *
 *   goToStep saves a draft and moves on without validating anything, so the
 *   surgery step could be walked past empty;
 *
 *   and the API's zod schema has `surgeonName: z.string()` with no minimum,
 *   so an empty string was a valid booking.
 *
 * The form's early-submit path keeps its own short list of essentials, and the
 * surgeon was simply never on it. This reads that list out of the source and
 * holds it to its contents, because the failure is silent: a booking with no
 * surgeon looks completely normal until somebody opens the unit card and finds
 * nobody to ring.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const FORM = path.join(ROOT, 'src/app/dashboard/surgeries/new/page.tsx');
const API = path.join(ROOT, 'src/app/api/surgeries/route.ts');

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** The `essentials.push(...)` list guarding the early booking. */
function earlyEssentials(): string[] {
  const src = read(FORM);
  const start = src.indexOf('const essentials: string[] = [];');
  expect(start, 'the early-submit essentials block has moved').toBeGreaterThan(0);
  const block = src.slice(start, start + 2500);
  return Array.from(block.matchAll(/essentials\.push\('([^']+)'\)/g)).map((m) => m[1]);
}

describe('what the early booking insists on', () => {
  const essentials = earlyEssentials();

  it('reads the block at all', () => {
    expect(essentials.length).toBeGreaterThanOrEqual(3);
  });

  it('insists on the surgeon', () => {
    // THE ONE THAT WAS MISSING.
    expect(essentials).toContain('the surgeon');
  });

  it('still insists on who, what and when', () => {
    expect(essentials).toContain('the patient');
    expect(essentials).toContain('the procedure');
    expect(essentials).toContain('the date');
  });

  it('does not insist on the theatre or the unit', () => {
    // Deliberately absent, and the distinction is the whole point: neither is
    // knowable when a case is booked, and demanding them stopped a surgeon
    // with a patient, a procedure and a date putting the case on the list.
    // The surgeon is not like that — a case belongs to somebody.
    expect(essentials).not.toContain('the theatre');
    expect(essentials).not.toContain('the unit');
  });

  it('checks the surgeon by id OR by typed name', () => {
    // A surgeon chosen from the picker gives an id; one typed in free text
    // gives only a name. Either is a surgeon; neither alone may be demanded.
    const src = read(FORM);
    const i = src.indexOf("essentials.push('the surgeon')");
    expect(i).toBeGreaterThan(0);
    const guard = src.slice(Math.max(0, i - 400), i);
    expect(guard).toMatch(/selectedSurgeonId/);
    expect(guard).toMatch(/surgeonName/);
  });
});

describe('the server refuses one too', () => {
  const api = read(API);

  it('rejects a booking with neither a surgeon id nor a name', () => {
    // The form's early button bypasses browser validation by design, and this
    // route has other callers, so the rule cannot live only on the form.
    expect(api).toMatch(/NO_SURGEON/);
    expect(api).toMatch(/if \(!surgeonId && !String\(surgeonName \?\? ''\)\.trim\(\)\)/);
  });

  it('refuses before it writes anything', () => {
    // A 400 after the surgery row exists would leave the case on the list
    // anyway, which is the state this is meant to prevent.
    const guard = api.indexOf('NO_SURGEON');
    // The CALL, not the two comments above it that name it in prose — an
    // earlier draft of this test matched one of those and reported the guard
    // as coming too late.
    const create = api.indexOf('await prisma.surgery.create({');
    expect(guard).toBeGreaterThan(0);
    expect(create).toBeGreaterThan(0);
    expect(guard).toBeLessThan(create);
  });
});
