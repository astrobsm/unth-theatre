import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { coversElectiveSpecialty } from '../../src/lib/technicianBackfill';
import { specialtyKey } from '../../src/lib/technicianCoverage';

/**
 * The call team covers the unplanned. It does not staff a planned list.
 *
 * On 27 August the next day's elective anaesthetic roster had not been
 * published, so all fifteen of the following day's cases fell through to the
 * one person rostered — the emergency on-call consultant — and were stamped
 * with his name across eight theatres. It READ as an assignment, so nobody
 * chased the missing roster.
 *
 * The same rule now governs the technicians: only somebody rostered to the
 * case's own specialty may be filled in, and a case with nobody rostered stays
 * unassigned and says so, until the roster is published and backfills it.
 */
const neuro = specialtyKey('Neurosurgery');

describe('who may be filled in on a planned case', () => {
  it('accepts a technician rostered to that specialty', () => {
    expect(coversElectiveSpecialty({ shift: 'MORNING', subRole: 'Neurosurgery' }, neuro)).toBe(true);
  });

  it('reconciles the unit wording a booking uses', () => {
    // Bookings say "Neuro Unit III" where the roster says "Neurosurgery".
    expect(coversElectiveSpecialty({ shift: 'MORNING', subRole: 'Neurosurgery' }, specialtyKey('Neuro Unit III'))).toBe(true);
  });

  it('refuses a technician rostered to a DIFFERENT specialty', () => {
    // Cover for another list is not cover for this one; it is the same mistake
    // wearing a more convincing name.
    expect(coversElectiveSpecialty({ shift: 'MORNING', subRole: 'Orthopaedics' }, neuro)).toBe(false);
  });
});

describe('the call team is never used for a planned list', () => {
  it('refuses day call, night call and ICU', () => {
    for (const subRole of ['DAY CALL (emergency cover)', 'NIGHT CALL (emergency cover)', 'ICU']) {
      expect(coversElectiveSpecialty({ shift: 'CALL', subRole }, neuro), subRole).toBe(false);
      expect(coversElectiveSpecialty({ shift: 'MORNING', subRole }, neuro), subRole).toBe(false);
    }
  });

  it('refuses a shift with no assignment at all', () => {
    // A technician on call with nothing named is still on call.
    expect(coversElectiveSpecialty({ shift: 'CALL', subRole: null }, neuro)).toBe(false);
    expect(coversElectiveSpecialty({ shift: 'NIGHT', subRole: '' }, neuro)).toBe(false);
    // And a morning shift with no assignment names no specialty, so it covers none.
    expect(coversElectiveSpecialty({ shift: 'MORNING', subRole: null }, neuro)).toBe(false);
  });

  it('refuses everything when the case has no specialty to match', () => {
    expect(coversElectiveSpecialty({ shift: 'MORNING', subRole: 'Neurosurgery' }, null)).toBe(false);
  });
});

describe('the backfill runs when the roster is published', () => {
  const publish = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src/app/api/roster/departments/[dept]/publish/route.ts'),
    'utf8',
  );

  it('for the technicians as well as the anaesthetists', () => {
    expect(publish).toContain('backfillAnaesthetists');
    expect(publish).toContain('backfillTechnicians');
    expect(publish).toContain("dept.category === 'ANAESTHETIC_TECHNICIANS'");
  });

  it('and a failure there still publishes the roster', () => {
    // The roster is the point; the backfill is a convenience on top of it.
    expect(publish).toContain('technician backfill failed (roster still published)');
  });
});

describe('the booking route never reaches for the call team on an elective', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src/app/api/surgeries/route.ts'),
    'utf8',
  );

  it('restricts an elective to the morning shift', () => {
    expect(src).toContain("? ['MORNING']");
  });

  it('does not trust the form’s on-duty hint for a planned case', () => {
    // The form may have resolved it before the roster was published.
    expect(src).toContain("surgeryType === 'ELECTIVE' ? null");
  });
});
