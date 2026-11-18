import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREPARATION_ROLES, isReadOnlyRole, refuseIfReadOnly,
} from '../../src/lib/surgeryDrafts/access';
import {
  canPublish, missingForPublish, publishPayload, type ScheduleDraft,
} from '../../src/lib/surgeryDrafts/draft';
import { MODULES } from '../../src/lib/modules';

// Planned Cases was eleven free-text boxes, one of which asked for a
// patient's UUID to be pasted in. So no plan carried a patient id, which is
// the one thing publishing insists on; and no plan said what the case would
// need, so the people who order and pack had nothing to act on — and could
// not open the screen in any case.

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const plan = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  id: 'plan1',
  unit: 'GS Unit I',
  subspecialty: 'General Surgery',
  patientId: 'pat1',
  patientName: 'A Patient',
  surgeonName: 'Dr Okeke',
  procedureName: 'Right hemicolectomy',
  indication: 'Caecal mass',
  status: 'DRAFT',
  ...over,
});

describe('what the plan carries into the booking', () => {
  it('sends what the case needs, so publishing does not ask again', () => {
    const body = publishPayload(
      plan({
        needBloodTransfusion: true,
        needDiathermy: true,
        otherSpecialNeeds: 'Vascular clamps',
        isDayCase: true,
        postOpDestination: 'DAY_CASE_DISCHARGE',
        location: 'Main Theatre',
      }),
      { scheduledDate: '2026-12-01', scheduledTime: '09:00' },
    );
    expect(body.needBloodTransfusion).toBe(true);
    expect(body.needDiathermy).toBe(true);
    expect(body.otherSpecialNeeds).toBe('Vascular clamps');
    expect(body.isDayCase).toBe(true);
    expect(body.postOpDestination).toBe('DAY_CASE_DISCHARGE');
    expect(body.location).toBe('Main Theatre');
  });

  it('says false rather than nothing for a need that was not ticked', () => {
    // The booking route defaults these to false anyway; sending undefined
    // would mean the plan and the case could disagree about whether the
    // question was asked.
    const body = publishPayload(plan(), { scheduledDate: '2026-12-01', scheduledTime: '09:00' });
    expect(body.needBloodTransfusion).toBe(false);
    expect(body.needStereo).toBe(false);
    expect(body.isDayCase).toBe(false);
    expect(body.otherSpecialNeeds).toBeNull();
  });

  it('still refuses to invent what the plan does not hold', () => {
    // The labs, the consent, the risk scores and the team stay out: a draft
    // that carried values for those would be recording as fact things nobody
    // has checked.
    const body = publishPayload(plan(), { scheduledDate: '2026-12-01', scheduledTime: '09:00' });
    for (const invented of ['teamMembers', 'consentForm', 'hbValue', 'asaScore', 'theatreId']) {
      expect(body, invented).not.toHaveProperty(invented);
    }
  });

  it('a plan with a real patient can be published in one press', () => {
    expect(missingForPublish(plan())).toEqual([]);
    expect(canPublish(plan())).toBe(true);
  });

  it('a plan with a name and no patient record still cannot', () => {
    const said = missingForPublish(plan({ patientId: null }));
    expect(said.map((m) => m.field)).toContain('patientId');
    expect(canPublish(plan({ patientId: null }))).toBe(false);
  });
});

describe('who may read the plans, and who may only read them', () => {
  it('the pharmacy, the pack provider and the store can open the screen', () => {
    const module = MODULES.find((m) => m.id === 'surgery-drafts');
    expect(module).toBeDefined();
    for (const r of PREPARATION_ROLES) {
      expect(module!.defaultRoles, r).toContain(r);
    }
  });

  it('they cannot write', () => {
    expect(isReadOnlyRole('PHARMACIST')).toBe(true);
    expect(isReadOnlyRole('CONSUMABLE_PACK_PROVIDER')).toBe(true);
    expect(isReadOnlyRole('THEATRE_STORE_KEEPER')).toBe(true);
  });

  it('a head of pharmacy keeps the write they have everywhere else', () => {
    // They sit in CLINICAL_CORE for every other module; taking the write away
    // here alone would be a rule nobody could predict from anywhere else.
    expect(isReadOnlyRole('HEAD_OF_PHARMACY')).toBe(false);
  });

  it('leaves the units who own the cases alone', () => {
    for (const r of ['SURGEON', 'CONSULTANT_SURGEON', 'BOOKING_OFFICER', 'HOUSE_OFFICER']) {
      expect(isReadOnlyRole(r), r).toBe(false);
      expect(refuseIfReadOnly(r, 'add a plan'), r).toBeNull();
    }
  });

  it('the refusal says what they CAN do', () => {
    // "Forbidden" on a screen somebody was deliberately given reads as a
    // fault in the system rather than as a boundary.
    const said = refuseIfReadOnly('PHARMACIST', 'add a plan');
    expect(said).toContain('see every planned case');
    expect(said).toContain('cannot add a plan');
  });

  it('saves every new field on an edit, not only on the first save', () => {
    // The PATCH route copies a WHITELIST of keys. That shape is right — it
    // stops a client writing publishedAt — but a field added to the schema
    // and not added to the list is validated and then silently dropped.
    const one = read('src/app/api/surgery-drafts/[id]/route.ts');
    const whitelist = one.slice(one.indexOf('const data: Record<string, unknown> = {}'));
    for (const f of [
      'needBloodTransfusion', 'needDiathermy', 'needStereo', 'needMontrellMattress',
      'otherSpecialNeeds', 'isDayCase', 'postOpDestination', 'location',
    ]) {
      expect(whitelist, f).toContain(`'${f}'`);
    }
  });

  it('does not coerce a string into a request for blood', () => {
    // z.coerce.boolean() reads the STRING "false" as true. On these four
    // fields that is a pack request nobody made, arriving silently.
    const create = read('src/app/api/surgery-drafts/route.ts');
    const one = read('src/app/api/surgery-drafts/[id]/route.ts');
    for (const f of ['needBloodTransfusion', 'needDiathermy', 'needStereo', 'needMontrellMattress', 'isDayCase']) {
      expect(create, f).not.toContain(`${f}: z.coerce.boolean`);
      expect(one, f).not.toContain(`${f}: z.coerce.boolean`);
    }
  });

  it('is enforced on the route, not by hiding the button', () => {
    const create = read('src/app/api/surgery-drafts/route.ts');
    const one = read('src/app/api/surgery-drafts/[id]/route.ts');
    expect(create).toContain('refuseIfReadOnly');
    // Every way in: add, change, delete.
    expect(one.match(/refuseIfReadOnly/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('the form asks with dropdowns, not with free text', () => {
  const page = read('src/app/dashboard/surgery-drafts/page.tsx');

  it('no longer asks anybody to paste a patient UUID', () => {
    // The field, not the prose: the comment above the picker still quotes the
    // old label, because that is what the comment is explaining.
    expect(page).not.toContain('label="Patient ID (from Patients)"');
    expect(page).not.toContain('placeholder="Needed to publish"');
  });

  it('draws its lists from the database', () => {
    for (const url of [
      '/api/patients?limit=200',
      '/api/surgical-units?activeOnly=true',
      '/api/locations',
    ]) {
      expect(page, url).toContain(url);
    }
    expect(page).toContain('roles=SURGEON,CONSULTANT_SURGEON');
  });

  it('uses the same procedure catalogue the booking form uses', () => {
    expect(page).toContain('ProcedurePicker');
    expect(page).toContain('SUBSPECIALTIES');
  });

  it('a chosen patient sets the id, the name and the number together', () => {
    // A plan carrying one person's folder under another person's typed name
    // is the duplicate this whole area exists to prevent.
    expect(page).toContain('patientId: v,');
    expect(page).toContain('patientName: pt ? pt.name : ');
  });

  it('keeps the unregistered patient, because a plan precedes the folder', () => {
    expect(page).toContain('Not registered yet');
  });

  it('asks what the case will need', () => {
    for (const field of [
      'needBloodTransfusion', 'needDiathermy', 'needStereo',
      'needMontrellMattress', 'otherSpecialNeeds', 'isDayCase', 'postOpDestination',
    ]) {
      expect(page, field).toContain(field);
    }
  });

  it('does not let the planner pick a theatre', () => {
    // The booking form deliberately stopped offering one: when each booker
    // chose a room, a single unit's cases scattered across three of them.
    expect(page).not.toContain('preferredTheatreId');
    expect(read('prisma/schema.prisma')).not.toContain('preferredTheatreId');
  });
});

describe('the column is there to hold it', () => {
  const migration = read('prisma/migrations/20261118150000_planned_case_preparation/migration.sql');

  it('adds every field the form now collects', () => {
    for (const col of [
      'needBloodTransfusion', 'needDiathermy', 'needStereo', 'needMontrellMattress',
      'otherSpecialNeeds', 'isDayCase', 'postOpDestination', 'location',
    ]) {
      expect(migration, col).toContain(`"${col}"`);
    }
  });

  it('leaves every existing plan valid', () => {
    // Nullable or defaulted throughout: a plan written last week is not made
    // invalid by a column added this week.
    expect(migration).not.toMatch(/ADD COLUMN[^;]*NOT NULL(?![^;]*DEFAULT)/);
    expect(migration).not.toMatch(/DROP COLUMN/i);
  });
});
