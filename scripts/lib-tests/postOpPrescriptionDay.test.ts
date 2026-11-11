// Two lists of drugs on one screen, for different patients, on different days.
//
// The dispensing page carries the anaesthetists' prescriptions for an upcoming
// list AND the surgeons' post-operative ones for patients already out of
// theatre. Neither was bounded by a day: the post-op panel asked for
// everything and got the newest 200 ever written, so on 11 November it opened
// on cases from 8 July. Prescriptions collected four months ago sat above the
// one a patient in recovery was waiting for, and nothing on screen said which
// day anything belonged to.
//
// The two default to OPPOSITE days, which is the part that has to stay right:
// anaesthetic prescriptions are packed ahead for tomorrow's list, and
// post-operative ones are written after the operation, so tomorrow's cannot
// exist yet.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  defaultPostOpDay, defaultPharmacyDay, postOpDayCaution, dayCaution,
} from '../../src/lib/pharmacy/day';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const api = read('src/app/api/post-op-prescriptions/route.ts');
const panel = read('src/components/PostOpPrescriptionsPanel.tsx');
const page = read('src/app/dashboard/prescriptions/page.tsx');

const AFTERNOON = new Date('2026-11-11T10:05:00Z'); // 11:05 WAT, as in the screenshot

describe('the two lists default to opposite days', () => {
  it('opens post-op on today and packing on tomorrow', () => {
    // Said together, because the risk is somebody "tidying" them into one
    // shared default and silently emptying the post-op list every morning.
    expect(defaultPostOpDay(AFTERNOON)).toBe('2026-11-11');
    expect(defaultPharmacyDay(AFTERNOON)).toBe('2026-11-12');
  });

  it('warns about the future on the post-op list, and the past on the packing list', () => {
    // A post-op prescription for tomorrow cannot exist. A packing list for
    // yesterday is finished work. Each page warns about its own impossible
    // direction and stays silent on the other, or the warnings get ignored.
    expect(postOpDayCaution('2026-11-12', AFTERNOON)).toMatch(/has not happened yet/i);
    expect(postOpDayCaution('2026-11-11', AFTERNOON)).toBeNull();
    // Going back is the normal reason to change the post-op date at all —
    // somebody collecting late — so it must not nag.
    expect(postOpDayCaution('2026-11-04', AFTERNOON)).toBeNull();

    expect(dayCaution('2026-11-04', AFTERNOON)).toMatch(/has passed/i);
    expect(dayCaution('2026-11-12', AFTERNOON)).toBeNull();
  });
});

describe('the post-op API', () => {
  it('takes a day, bounded in WAT', () => {
    expect(api).toContain('searchParams.get("date")');
    expect(api).toContain('watDayRange(date)');
    expect(api).toContain('where.prescribedAt = { gte: start, lt: end }');
    // Not the runtime's timezone: the server runs UTC and a WAT day starts at
    // 23:00 the previous day, so a locally-read day drops the night list.
    expect(api).not.toContain('setHours(0, 0, 0, 0)');
  });

  it('files a prescription under when the surgeon wrote it', () => {
    // createdAt is a database fact — a row re-created by a sync replay would
    // file itself under the day it arrived rather than the day of the care.
    expect(api).toContain('prescribedAt');
    expect(api).not.toMatch(/where\.createdAt\s*=/);
  });

  it('does not default the filter, because two other callers need everything', () => {
    // The post-op notes page looks one up by surgeryId and medication
    // tracking filters by status across days. A default here would quietly
    // empty both.
    expect(api).toContain('if (date) {');
    expect(api).not.toMatch(/const date = searchParams\.get\("date"\) \?\?/);
  });
});

describe('the post-op panel', () => {
  it('asks for one day, and reloads when the day changes', () => {
    expect(panel).toContain('/api/post-op-prescriptions?date=');
    expect(panel).toContain('useState(defaultPostOpDay)');
    // The day must be in the callback's dependencies, or changing it leaves
    // yesterday's list on screen under today's heading — which is worse than
    // not filtering at all.
    expect(panel).toMatch(/\}, \[day\]\);/);
  });

  it('offers a picker, a step either way, and the two days used most', () => {
    expect(panel).toContain('type="date"');
    expect(panel).toContain('shiftDay(d, -1)');
    expect(panel).toContain('shiftDay(d, 1)');
    expect(panel).toContain("label: 'Today'");
    expect(panel).toContain("label: 'Yesterday'");
  });

  it('names the day in the empty state', () => {
    // "No prescriptions found" reads as "none exist", and somebody goes
    // looking for a fault instead of changing the date.
    expect(panel).toContain('No post-operative prescriptions were written on ${describeDay(day)}');
    expect(panel).not.toContain("'No post-operative prescriptions found.'");
  });

  it('says how many, so an empty day is distinguishable from a broken load', () => {
    expect(panel).toContain('items.length === 1');
  });
});

describe('the anaesthetic list is named', () => {
  it('says what it is, next to a list of post-op drugs', () => {
    // Two unlabelled lists of drugs for different patients on one screen is a
    // good way to pack from the wrong one.
    expect(page).toContain('Anaesthetic prescriptions');
    expect(page).toContain('For surgery on <strong>{describeDay(selectedDate)}</strong>');
  });
});
