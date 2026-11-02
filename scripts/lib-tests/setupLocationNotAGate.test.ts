import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assessFix, VERDICT_LABEL } from '../../src/lib/theatreOps/geofence';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Source with line comments removed, so a quoted old message is not read
 *  as the message still being shown. */
const stripComments = (src: string) =>
  src
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

// An anaesthetic technician could not log that a theatre was set up because
// his phone answered "Location permission denied". The theatre was ready; the
// board said untouched. These tests hold the three places that have to agree
// that a position is evidence, not a precondition.

describe('a setup with no position', () => {
  it('is assessed, not rejected', () => {
    // The page now sends nulls, and assessFix is what both the page and the
    // readiness board put them through.
    const fix = assessFix({ latitude: null, longitude: null, accuracyM: null });
    expect(fix.verdict).toBe('NO_FIX');
    expect(fix.distanceM).toBeNull();
    expect(fix.label).toBe('Position not confirmed');
  });

  it('survives every shape a handset with no fix can produce', () => {
    for (const shape of [
      null,
      undefined,
      {},
      { latitude: null, longitude: null },
      { latitude: undefined, longitude: undefined },
      // 0,0 is the Gulf of Guinea, not a technician at sea.
      { latitude: 0, longitude: 0 },
      { latitude: NaN, longitude: NaN },
    ]) {
      expect(assessFix(shape as any).verdict).toBe('NO_FIX');
    }
  });

  it('reads on the board as a fact about the phone, not about the person', () => {
    // Worth asserting: this wording is the whole reason refusing the setup
    // was unnecessary. It says nothing was confirmed, and accuses nobody.
    expect(VERDICT_LABEL.NO_FIX).toBe('Position not confirmed');
    expect(VERDICT_LABEL.NO_FIX).not.toMatch(/fail|denied|invalid|error/i);
  });

  it('still tells the truth when a position IS supplied', () => {
    // The change must not have turned the check into a rubber stamp.
    const far = assessFix({ latitude: 6.0, longitude: 7.0, accuracyM: 20 });
    expect(far.verdict).toBe('OFF_SITE');
    const vague = assessFix({ latitude: 6.4025, longitude: 7.5103, accuracyM: 5000 });
    expect(vague.verdict).toBe('IMPRECISE');
  });
});

describe('the three layers agree that location is not a gate', () => {
  it('the database lets the columns be empty', () => {
    const schema = read('prisma/schema.prisma');
    const model = schema.slice(
      schema.indexOf('model AnesthesiaSetupLog {'),
      schema.indexOf('@@map("anesthesia_setup_logs")'),
    );
    expect(model.length).toBeGreaterThan(0);
    // NOT NULL on these three is what made the form a dead end.
    expect(model).toMatch(/^\s*latitude\s+Float\?/m);
    expect(model).toMatch(/^\s*longitude\s+Float\?/m);
    expect(model).toMatch(/^\s*locationName\s+String\?/m);
    // And the record says WHY there is no position.
    expect(model).toMatch(/locationUnavailableReason\s+String\?/);
  });

  it('a migration drops the constraints rather than only the Prisma types', () => {
    // Prisma's schema file is not the database. Editing the model without a
    // migration leaves the live table rejecting exactly the rows this change
    // exists to allow, and the failure appears only in production.
    const sql = read(
      'prisma/migrations/20261103090000_setup_location_not_a_gate/migration.sql',
    );
    for (const col of ['latitude', 'longitude', 'locationName']) {
      expect(sql).toMatch(
        new RegExp(`ALTER COLUMN "${col}" DROP NOT NULL`, 'i'),
      );
    }
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "locationUnavailableReason"/i);
  });

  it('the API accepts a body with no coordinates', () => {
    const route = read('src/app/api/anesthesia-setup/start/route.ts');
    expect(route).toMatch(/latitude: z\.number\(\)\.min\(-90\)\.max\(90\)\.nullable\(\)\.optional\(\)/);
    expect(route).toMatch(/longitude: z\.number\(\)\.min\(-180\)\.max\(180\)\.nullable\(\)\.optional\(\)/);
    expect(route).toMatch(/locationUnavailableReason/);
  });

  it('the form no longer promises the technician a dead end', () => {
    // Comments are stripped first: the file deliberately QUOTES the old
    // wording to explain why it went, and a test that cannot tell a quotation
    // from the thing itself would forbid recording the history.
    const page = stripComments(read('src/app/dashboard/anesthesia-setup/page.tsx'));
    // The exact strings from the photographed screen.
    expect(page).not.toContain('Location is required to log setup');
    expect(page).not.toContain('Start Setup (Location Required)');
    expect(page).not.toContain('You must allow location access to log setup');
    // And the submit path must not be able to abort on a location failure.
    expect(page).toMatch(/locationUnavailableReason: location \? undefined : noLocationReason/);
  });

  it('bounds the wait so the button always comes back', () => {
    // watchPosition can sit on a handset that neither fixes nor errors. A
    // spinner that never stops is indistinguishable from a broken app.
    const page = read('src/app/dashboard/anesthesia-setup/page.tsx');
    const m = page.match(/const LOCATION_WAIT_MS = (\d+);/);
    expect(m).not.toBeNull();
    const ms = Number(m![1]);
    expect(ms).toBeGreaterThan(12000); // don't discard a fix that was coming
    expect(ms).toBeLessThanOrEqual(25000); // nobody stands there for half a minute
    expect(page).toContain('Promise.race');
  });

  it('names the real cause when the page is not on https', () => {
    // Over plain http Chrome reports PERMISSION_DENIED with no prompt and no
    // way to grant it, which on the theatre server reached by IP would look
    // to every technician like their own phone misbehaving, forever.
    const page = read('src/app/dashboard/anesthesia-setup/page.tsx');
    expect(page).toContain('isSecureContext');
  });
});
