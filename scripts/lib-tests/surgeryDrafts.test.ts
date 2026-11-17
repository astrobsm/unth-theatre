import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

import {
  missingForPublish,
  canPublish,
  publishDefaults,
  publishPayload,
  publishIdempotencyKey,
  validatePublishChoice,
  asDateInput,
  type ScheduleDraft,
} from '../../src/lib/surgeryDrafts/draft';

/**
 * Tentative cases, and the line between a plan and a booking.
 *
 * Two things here are worth a test rather than a reading. A plan that can be
 * published while something essential is missing produces a case the theatre
 * cannot run; and a publish that is not idempotent produces the same patient
 * on the list twice, which is worse than either.
 */

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

const full = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  id: 'draft-1',
  unit: 'GS Unit I',
  subspecialty: 'General Surgery',
  patientId: 'patient-9',
  surgeonName: 'Dr Eze',
  procedureName: 'Right hemicolectomy',
  indication: 'Caecal mass',
  status: 'DRAFT',
  estimatedDuration: 120,
  ...over,
});

describe('what a plan still needs before it can be a case', () => {
  it('lets a complete plan through', () => {
    expect(missingForPublish(full())).toEqual([]);
    expect(canPublish(full())).toBe(true);
  });

  it('refuses a plan with no patient record, however well it is described', () => {
    // The case a unit hits most: the person is known, the folder is not open.
    const d = full({ patientId: null, patientName: 'Mrs Okeke' });
    const missing = missingForPublish(d);
    expect(missing.map((m) => m.field)).toContain('patientId');
    expect(missing.find((m) => m.field === 'patientId')!.say).toContain('Mrs Okeke');
    expect(canPublish(d)).toBe(false);
  });

  it('says something different when there is no name at all', () => {
    const say = missingForPublish(full({ patientId: null }))[0].say;
    expect(say).toContain('No patient yet');
  });

  it('names every missing thing at once, not one per attempt', () => {
    const missing = missingForPublish(
      full({ patientId: null, surgeonName: null, indication: null }),
    );
    expect(missing.map((m) => m.field).sort()).toEqual(['indication', 'patientId', 'surgeonName']);
  });

  it('will not publish something already published', () => {
    expect(canPublish(full({ status: 'PUBLISHED' }))).toBe(false);
    expect(canPublish(full({ status: 'WITHDRAWN' }))).toBe(false);
  });

  it('treats blank strings as missing rather than present', () => {
    expect(canPublish(full({ surgeonName: '   ' }))).toBe(false);
  });
});

describe('the Publish box opens on the date the unit was aiming for', () => {
  it('fills in the tentative date and time', () => {
    const d = full({ targetDate: '2026-11-26T00:00:00.000Z', preferredTime: '09:30' });
    expect(publishDefaults(d)).toEqual({ date: '2026-11-26', time: '09:30' });
  });

  it('leaves the date blank when the unit never set one', () => {
    expect(publishDefaults(full())).toEqual({ date: '', time: '' });
  });

  it('does not offer a time that is not a time', () => {
    // "25:70" parsed as a shape and then became an Invalid Date wherever it
    // was combined with a date. isClockTime is the check the rest of the app
    // uses, and this must not be the one place with its own opinion.
    expect(publishDefaults(full({ preferredTime: '25:70' })).time).toBe('');
  });
});

describe('publishing twice must not book twice', () => {
  it('keys on the draft, so a second press replays the first booking', () => {
    const a = publishIdempotencyKey('draft-1', '2026-11-26');
    const b = publishIdempotencyKey('draft-1', '2026-11-26');
    expect(a).toBe(b);
    expect(a).toContain('draft-1');
  });

  it('treats a different date as a different booking', () => {
    // A withdrawn plan republished to a new date is genuinely a new case and
    // must not replay the old response.
    expect(publishIdempotencyKey('draft-1', '2026-11-26')).not.toBe(
      publishIdempotencyKey('draft-1', '2026-12-03'),
    );
  });
});

describe('the body handed to the booking route', () => {
  it('carries the fields the route insists on', () => {
    const body = publishPayload(full(), { scheduledDate: '2026-11-26', scheduledTime: '09:00' });
    expect(body.patientId).toBe('patient-9');
    expect(body.unit).toBe('GS Unit I');
    expect(body.subspecialty).toBe('General Surgery');
    expect(body.indication).toBe('Caecal mass');
    expect(body.procedureName).toBe('Right hemicolectomy');
    expect(body.scheduledDate).toBe('2026-11-26');
    expect(body.scheduledTime).toBe('09:00');
    expect(body.estimatedDuration).toBe(120);
  });

  it("carries the unit's note onto the case as remarks", () => {
    // Otherwise the one piece of the plan explaining why it was planned that
    // way is dropped at the moment it becomes real.
    const body = publishPayload(full({ notes: 'Wants the Tuesday list' }), {
      scheduledDate: '2026-11-26', scheduledTime: '09:00',
    });
    expect(body.remarks).toBe('Wants the Tuesday list');
  });

  it('never sends a duration of zero', () => {
    const body = publishPayload(full({ estimatedDuration: 0 }), {
      scheduledDate: '2026-11-26', scheduledTime: '09:00',
    });
    expect(body.estimatedDuration).toBe(60);
  });

  it('invents nothing the plan does not hold', () => {
    // No labs, no consent, no team. A draft that filled those in would be
    // recording as fact things nobody checked.
    const body = publishPayload(full(), { scheduledDate: '2026-11-26', scheduledTime: '09:00' });
    ['recentHb', 'potassium', 'hivStatus', 'consent', 'onDutyTeam', 'teamMembers'].forEach((k) => {
      expect(body).not.toHaveProperty(k);
    });
  });
});

describe('the date and time chosen at the moment of publishing', () => {
  it('insists on a date', () => {
    expect(validatePublishChoice({ scheduledDate: '', scheduledTime: '09:00' })).toContain('date');
  });

  it('insists on a real clock time', () => {
    expect(validatePublishChoice({ scheduledDate: '2026-11-26', scheduledTime: '25:70' }))
      .toContain('24-hour');
    expect(validatePublishChoice({ scheduledDate: '2026-11-26', scheduledTime: '' }))
      .not.toBeNull();
  });

  it('accepts a good pair', () => {
    expect(validatePublishChoice({ scheduledDate: '2026-11-26', scheduledTime: '09:00' })).toBeNull();
  });

  it('reads a date in local terms, not UTC', () => {
    // asDateInput taking the UTC date would show a Nigerian user the day
    // before for anything written late in the evening.
    const d = new Date(2026, 10, 26, 23, 30);
    expect(asDateInput(d)).toBe('2026-11-26');
  });
});

describe('this module does not create surgeries', () => {
  // The design decision the whole module rests on. The booking route attaches
  // the magnitude bundle, resolves special needs, records the on-duty team,
  // enforces the cut-off and quotes the deposit. A second creation path would
  // have reproduced some of that and diverged on the rest, and the half it got
  // wrong would be invisible until a case reached theatre with no pack.

  it('has no surgery insert of its own', () => {
    expect(codeOf('src/app/api/surgery-drafts/route.ts')).not.toContain('prisma.surgery.create');
    expect(codeOf('src/app/api/surgery-drafts/[id]/route.ts')).not.toContain('prisma.surgery.create');
  });

  it('publishes through the ordinary booking route, with the idempotency key', () => {
    const page = codeOf('src/app/dashboard/surgery-drafts/page.tsx');
    expect(page).toContain("fetch('/api/surgeries'");
    expect(page).toContain("'X-Idempotency-Key': publishIdempotencyKey(");
  });

  it('books the case before it marks the plan', () => {
    // In the other order a failed booking leaves a plan claiming to be on a
    // list it is not on, which is the one outcome nobody can see from either
    // screen.
    const page = codeOf('src/app/dashboard/surgery-drafts/page.tsx');
    expect(page.indexOf("fetch('/api/surgeries'")).toBeLessThan(
      page.indexOf("status: 'PUBLISHED'"),
    );
  });

  it('shows the booking route\'s own refusal rather than a generic one', () => {
    const page = codeOf('src/app/dashboard/surgery-drafts/page.tsx');
    expect(page).toContain('created.error');
  });
});

describe('the table is registered for replication', () => {
  it('is classified in the sync policy', () => {
    // An unclassified table that capture is switched on for has no rule for
    // what to do with an arriving row. The migration enables capture, so the
    // policy must name it or the capture suite fails by name.
    const policy = read('src/lib/sync/syncPolicy.ts');
    expect(policy).toContain("table: 'surgery_schedule_drafts'");
  });

  it('switches capture on in the migration', () => {
    const sql = read('prisma/migrations/20261117140000_surgery_schedule_draft/migration.sql');
    expect(sql).toContain("sync_enable_table('surgery_schedule_drafts')");
  });

  it('keeps the date nullable, which is the point of the module', () => {
    const sql = read('prisma/migrations/20261117140000_surgery_schedule_draft/migration.sql');
    expect(sql).toMatch(/"targetDate"\s+TIMESTAMP\(3\),/);
  });
});
