import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  BOOKING_STEPS,
  BOOKING_STEP_IDS,
  BOOKING_STEP_LABELS,
  LAST_BOOKING_STEP,
  bookingStepIdAt,
  bookingStepIndexOf,
  isBookingStepId,
} from '../../src/lib/booking/bookingSteps';

// The booking wizard's step list, which used to exist in four copies.
//
// Worth being precise about what was wrong, because it was reported wrongly
// once already. The page used ONE array for index -> name on save and name ->
// index on resume, so the round trip was self-consistent; the route's copy was
// only ever used for a membership check, where its different order could not
// matter. Nobody was ever resumed on the wrong step by that mismatch.
//
// What was real: four hand-maintained copies with nothing cross-checking them,
// and a step id ('review') the route accepted and the form cannot render, which
// would have resolved to -1 and dumped somebody back at step one.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

describe('the order is load-bearing', () => {
  it('matches exactly what drafts were already saved with', () => {
    // Every draft stored before this change holds one of these ids. Reordering
    // the list re-labels those drafts and resumes their owners somewhere else.
    expect(BOOKING_STEP_IDS).toEqual([
      'patient', 'surgery', 'team', 'consent', 'preop', 'packs',
    ]);
  });

  it('keeps the labels the form already showed', () => {
    expect(BOOKING_STEP_LABELS).toEqual([
      'Patient', 'Surgery', 'Team', 'Consent & history', 'Safety results', 'Packs & sign-off',
    ]);
  });

  it('has a label for every id and nothing spare', () => {
    expect(BOOKING_STEP_LABELS).toHaveLength(BOOKING_STEP_IDS.length);
    expect(LAST_BOOKING_STEP).toBe(BOOKING_STEPS.length - 1);
  });
});

describe('index and id round-trip', () => {
  it('survives the trip out to the database and back, at every step', () => {
    // This is the whole job: save an index as a name, read the name back as
    // the same index.
    BOOKING_STEP_IDS.forEach((_id, index) => {
      expect(bookingStepIndexOf(bookingStepIdAt(index))).toBe(index);
    });
  });

  it('sends the one id the form cannot render FORWARD, not back to the start', () => {
    // The route accepted 'review'; the form has no such step. indexOf would
    // return -1 and the old code turned that into 0 — restoring somebody's
    // data and putting them back at the beginning of a six-step form.
    expect(bookingStepIndexOf('review')).toBe(LAST_BOOKING_STEP);
    expect(bookingStepIndexOf('review')).not.toBe(0);
  });

  it('never returns -1, whatever it is handed', () => {
    for (const value of [null, undefined, '', 'nonsense', 'PATIENT']) {
      expect(bookingStepIndexOf(value), String(value)).toBeGreaterThanOrEqual(0);
    }
  });

  it('never returns undefined for an index off the end', () => {
    expect(bookingStepIdAt(99)).toBe('patient');
    expect(bookingStepIdAt(-1)).toBe('patient');
  });

  it('accepts the ids a draft may legitimately hold, and no others', () => {
    for (const id of [...BOOKING_STEP_IDS, 'review']) {
      expect(isBookingStepId(id), id).toBe(true);
    }
    for (const id of ['', 'Patient', 'summary', 42, null, undefined, {}]) {
      expect(isBookingStepId(id), String(id)).toBe(false);
    }
  });
});

describe('there is only one copy of the list now', () => {
  const page = codeOf('src/app/dashboard/surgeries/new/page.tsx');
  const route = codeOf('src/app/api/surgeries/draft/route.ts');

  it('leaves no literal step array in the booking form', () => {
    // Three of the four copies lived here.
    expect(page).not.toMatch(/\['patient',\s*'surgery'/);
    expect(page).not.toContain("'consent', 'preop', 'packs'");
  });

  it('leaves no second list in the draft route', () => {
    expect(route).not.toMatch(/const STEPS = \[/);
    expect(route).not.toContain("'packs', 'team', 'review'");
  });

  it('has both sides importing the same module', () => {
    expect(page).toContain("from '@/lib/booking/bookingSteps'");
    expect(route).toContain("from '@/lib/booking/bookingSteps'");
  });

  it('uses the shared helpers at each of the three points that mattered', () => {
    // Two saves and one resume.
    expect(page.match(/bookingStepIdAt\(/g) ?? []).toHaveLength(2);
    expect(page).toContain('bookingStepIndexOf(resumable.step)');
  });

  it('validates an incoming step against the shared list', () => {
    expect(route).toContain('isBookingStepId(body.step)');
  });
});
