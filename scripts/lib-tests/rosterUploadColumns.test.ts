import { describe, it, expect } from 'vitest';
import {
  rosterTemplateHeaders,
  resolveColumns,
  positionalColumns,
} from '../../src/lib/rosterUploadColumns';
import { ROSTER_DEPARTMENTS, getRosterDept } from '../../src/lib/rosterDepartments';

/**
 * The round trip that was broken: the template writes a header row, somebody
 * fills the sheet in, and the upload reads it back.
 *
 * It failed silently for the anaesthetists. The template labelled the column
 * "Surgical Specialty"; the parser looked for 'sub' / 'role' / 'assign' /
 * 'subspecial' / 'theatre' and matched none of them, so the subspecialty — the
 * one field that decides which cases an anaesthetist covers — imported blank on
 * every row. Nothing failed. The rows appeared, correctly named and shifted,
 * with an empty assignment that looks exactly like a sheet nobody finished.
 */
describe('the template header row and the upload parser agree', () => {
  for (const dept of ROSTER_DEPARTMENTS) {
    it(`${dept.slug}: every column the template writes is found again`, () => {
      const headers = rosterTemplateHeaders(dept);
      const idx = resolveColumns(headers, dept.subRoleLabel);

      // Each field must resolve to the column that actually holds it.
      expect(headers[idx.name]).toBe('Name');
      expect(headers[idx.date]).toBe('Date');
      expect(headers[idx.shift]).toBe('Shift');
      expect(headers[idx.location]).toBe('Location');
      expect(headers[idx.notes]).toBe('Notes');

      // THE REGRESSION. -1 here is the anaesthetist bug.
      expect(idx.subRole, `${dept.slug} assignment column went missing`).toBeGreaterThanOrEqual(0);
      expect(headers[idx.subRole]).toBe(dept.subRoleLabel ?? 'Sub-role');

      // Seniority exists exactly when the department has grades.
      if (dept.seniorityLevels?.length) {
        expect(headers[idx.seniority]).toBe('Seniority');
      } else {
        expect(idx.seniority).toBe(-1);
      }

      // No two fields may point at the same column.
      const used = [idx.name, idx.date, idx.shift, idx.subRole, idx.location, idx.notes];
      expect(new Set(used).size, `${dept.slug} has two fields on one column`).toBe(used.length);
    });
  }

  it('finds the anaesthetists’ subspecialty column by its real label', () => {
    const anaes = getRosterDept('anaesthetists')!;
    expect(anaes.subRoleLabel).toBe('Surgical Specialty');
    const headers = rosterTemplateHeaders(anaes);
    expect(resolveColumns(headers, anaes.subRoleLabel).subRole).toBe(3);
    // ...and by keyword too, for a sheet retyped by hand with no label passed.
    expect(resolveColumns(headers).subRole).toBe(3);
  });

  it('still reads sheets saved before this change', () => {
    // Old technician template: seven columns, "Sub-role" and a Seniority column.
    const old = ['Name', 'Date', 'Shift', 'Sub-role', 'Seniority', 'Location', 'Notes'];
    const idx = resolveColumns(old, 'Theatre / ICU');
    expect(idx.subRole).toBe(3);
    expect(idx.seniority).toBe(4);
    expect(idx.location).toBe(5);
    expect(idx.notes).toBe(6);
  });

  it('reads a headerless paste by position, narrower without seniority', () => {
    expect(positionalColumns(true)).toMatchObject({ seniority: 4, location: 5, notes: 6 });
    // Six columns wide: assuming otherwise reads Location as a grade.
    expect(positionalColumns(false)).toMatchObject({ seniority: -1, location: 4, notes: 5 });
  });
});
