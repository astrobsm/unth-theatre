import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  pick,
  forServer,
  isWorthResuming,
  draftBytes,
  CONSENT_DRAFT_KEY,
  type BookingDraft,
} from '../../src/lib/booking/draftState';

// "THE DATA WIPES OUT." Three separate faults produced that:
//
//   1. the draft snapshotted FormData only — native inputs with a name —
//      so the patient, magnitude, team, assistant, consultants, special
//      consumables and consent were never saved, because all of them live
//      in React state;
//   2. it saved only when moving FORWARD, so pressing Back discarded
//      whatever had just been typed;
//   3. "Continue where I stopped" set the step number and restored
//      nothing. The saved data was written and never read.

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const page = read('src', 'app', 'dashboard', 'surgeries', 'new', 'page.tsx');
const route = read('src', 'app', 'api', 'surgeries', 'draft', 'route.ts');

describe('the draft holds the whole form, not just native inputs', () => {
  it.each([
    'selectedPatientId',
    'magnitude',
    'anesthesiaType',
    'localAnaestheticId',
    'specialNeeds',
    'assistantIds',
    'supervisingConsultantIds',
    'teamMembers',
    'scheduledDate',
    'needBloodTransfusion',
  ])('collects %s', (field) => {
    const at = page.indexOf('const collectDraft');
    expect(at, 'collectDraft is gone').toBeGreaterThan(-1);
    expect(page.slice(at, at + 3000)).toContain(field);
  });

  it('still captures plain named inputs too', () => {
    const at = page.indexOf('const collectDraft');
    expect(page.slice(at, at + 3000)).toContain('FormData');
  });
});

describe('it saves often enough to be worth having', () => {
  it('saves when moving BACK as well as forward', () => {
    // It used to be wrapped in `if (next > step)`, so Back threw away the
    // step being left.
    const at = page.indexOf('const goToStep');
    const body = page.slice(at, at + 900);
    expect(body).not.toMatch(/if \(next > step\)/);
    expect(body).toContain('saveDraft(');
  });

  it('autosaves without waiting for a step change', () => {
    // Somebody who fills half a step and then loses the connection has
    // crossed no boundary and would otherwise have saved nothing.
    expect(page).toMatch(/setTimeout\([\s\S]{0,200}saveDraft/);
  });

  it('flushes when the page is hidden, not on beforeunload', () => {
    // A phone backgrounding the browser frequently never fires
    // beforeunload — which is exactly when the typing is about to be lost.
    expect(page).toContain('visibilitychange');
    expect(page).toContain('sendBeacon');
  });

  it('has a POST endpoint, because a beacon cannot PUT', () => {
    expect(route).toMatch(/export async function POST/);
  });
});

describe('resuming actually restores', () => {
  it('applies the saved draft rather than only setting the step', () => {
    const at = page.indexOf('Continue where I stopped');
    const before = page.slice(Math.max(0, at - 1200), at);
    expect(before).toContain('applyDraft(');
  });

  it('carries the data into the resume banner', () => {
    expect(page).toMatch(/data: \(draft\.data \?\? undefined\)/);
  });
});

describe('the consent photograph is kept on the device, not in the draft', () => {
  it('is stripped from anything sent to the server', () => {
    // The draft endpoint caps at 256 KB and runs auditChanges, which
    // TRUNCATES long strings — so a 700 KB base64 would be silently cut to
    // 200 characters and restored as a corrupt image that looks attached.
    // Absent is honest; truncated is a lie with a clinical record on it.
    const withPhoto: BookingDraft = {
      selectedPatientId: 'p1',
      consentFile: { name: 'c.jpg', mimeType: 'image/jpeg', base64: 'x'.repeat(5000), size: 5000 },
    };
    expect(forServer(withPhoto).consentFile).toBeUndefined();
    expect(forServer(withPhoto).selectedPatientId).toBe('p1');
    expect(draftBytes(forServer(withPhoto))).toBeLessThan(500);
  });

  it('does not mutate the draft it was given', () => {
    const d: BookingDraft = {
      consentFile: { name: 'c.jpg', mimeType: 'image/jpeg', base64: 'abc', size: 3 },
    };
    forServer(d);
    expect(d.consentFile).not.toBeUndefined();
  });

  it('is written to and read from the device', () => {
    expect(page).toContain('CONSENT_DRAFT_KEY');
    expect(page).toMatch(/localStorage\.setItem\(CONSENT_DRAFT_KEY/);
    expect(page).toMatch(/localStorage\.getItem\(CONSENT_DRAFT_KEY\)/);
  });

  it('is cleared when the draft is discarded and when the next patient starts', () => {
    // Otherwise "Start fresh" or the next patient on the list inherits the
    // previous patient's signed consent, which is a clinical error.
    const removals = page.match(/localStorage\.removeItem\(CONSENT_DRAFT_KEY\)/g) ?? [];
    expect(removals.length).toBeGreaterThanOrEqual(2);
  });
});

describe('an old draft cannot blank a newer field', () => {
  it('leaves a field alone when the draft does not mention it', () => {
    expect(pick(undefined, 'kept')).toBe('kept');
    expect(pick(undefined, true)).toBe(true);
  });

  it('restores an explicitly empty value', () => {
    // Cleared on purpose is different from never saved.
    expect(pick('', 'current')).toBe('');
    expect(pick(false, true)).toBe(false);
  });
});

describe('nothing is offered to restore when nothing was typed', () => {
  it('ignores an empty draft', () => {
    expect(isWorthResuming(null)).toBe(false);
    expect(isWorthResuming({})).toBe(false);
    expect(isWorthResuming({ fields: { a: '', b: '  ' } })).toBe(false);
  });

  it('notices real work', () => {
    expect(isWorthResuming({ selectedPatientId: 'p1' })).toBe(true);
    expect(isWorthResuming({ procedureName: 'Hernia repair' })).toBe(true);
    expect(isWorthResuming({ specialNeeds: [{ itemId: 'i1' }] })).toBe(true);
    expect(isWorthResuming({ fields: { procedureName: 'x' } })).toBe(true);
  });
});
