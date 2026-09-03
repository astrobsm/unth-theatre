import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { verdictForUploadedRow, batchKey, assignmentKey } from '../../src/lib/rosterUploadDedupe';

/**
 * The bulk upload de-duplicated on PERSON + DATE + SHIFT alone, which is not
 * what a duplicate is.
 *
 * One anaesthetist genuinely covers two specialties on a single morning, and
 * the roster records that as two rows differing only in the assignment.
 * Uploading such a sheet silently dropped the second, so the second specialty
 * had nobody against it and nothing said why.
 *
 * Measured on the live roster while clearing duplicates: of the groups holding
 * two assigned rows, HALF were one person covering two things — "Neurosurgery +
 * Urology" — and half were the same assignment written twice. Only the second
 * kind is a duplicate.
 */
const on = (...subRoles: string[]) => subRoles.map((s, i) => ({ id: `r${i}`, subRole: s }));

describe('two specialties on one shift is cover, not duplication', () => {
  it('accepts a second, different assignment for the same person and shift', () => {
    // THE BUG. This line used to be dropped.
    expect(verdictForUploadedRow('Urology', on('Neurosurgery'))).toEqual({ action: 'INSERT' });
  });

  it('refuses the same assignment twice', () => {
    const v = verdictForUploadedRow('Neurosurgery', on('Neurosurgery'));
    expect(v.action).toBe('SKIP');
  });

  it('compares assignments ignoring case and spacing', () => {
    // The sheet is typed by hand as often as it is picked from the dropdown.
    expect(verdictForUploadedRow('  neurosurgery ', on('Neurosurgery')).action).toBe('SKIP');
    expect(assignmentKey('Obstetrics  &   Gynaecology')).toBe('obstetrics & gynaecology');
  });

  it('inserts when nothing is on file at all', () => {
    expect(verdictForUploadedRow('Neurosurgery', [])).toEqual({ action: 'INSERT' });
    expect(verdictForUploadedRow('', [])).toEqual({ action: 'INSERT' });
  });
});

describe('a blank assignment is the weakest claim there is', () => {
  it('is skipped when the person is already rostered that shift', () => {
    // A person holding both a named row and an empty one fills two team slots
    // with one name — how the emergency board showed a team of two that was a
    // team of one.
    expect(verdictForUploadedRow('', on('Neurosurgery')).action).toBe('SKIP');
    expect(verdictForUploadedRow(null, on('')).action).toBe('SKIP');
  });

  it('is filled in rather than joined, when the sheet names an assignment', () => {
    // Inserting beside the blank row would recreate the shadowed pair that had
    // to be cleaned out of the live roster.
    const v = verdictForUploadedRow('Neurosurgery', on(''));
    expect(v).toEqual({ action: 'UPDATE', rosterId: 'r0' });
  });

  it('fills the blank row even when another assignment is already held', () => {
    const v = verdictForUploadedRow('Urology', [{ id: 'a', subRole: 'Neurosurgery' }, { id: 'b', subRole: '' }]);
    expect(v).toEqual({ action: 'UPDATE', rosterId: 'b' });
  });
});

describe('the key used within one uploaded sheet', () => {
  it('separates two assignments for the same person, date and shift', () => {
    const a = batchKey('u1', '2026-09-03', 'MORNING', 'Neurosurgery');
    const b = batchKey('u1', '2026-09-03', 'MORNING', 'Urology');
    expect(a).not.toBe(b);
  });

  it('still collapses the identical line written twice', () => {
    expect(batchKey('u1', '2026-09-03', 'MORNING', 'Neurosurgery'))
      .toBe(batchKey('u1', '2026-09-03', 'MORNING', ' neurosurgery '));
  });

  it('separates different people, days and shifts', () => {
    const base = batchKey('u1', '2026-09-03', 'MORNING', 'X');
    expect(base).not.toBe(batchKey('u2', '2026-09-03', 'MORNING', 'X'));
    expect(base).not.toBe(batchKey('u1', '2026-09-04', 'MORNING', 'X'));
    expect(base).not.toBe(batchKey('u1', '2026-09-03', 'CALL', 'X'));
  });
});

describe('the upload route uses this rule', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src/app/api/roster/departments/[dept]/bulk/route.ts'),
    'utf8',
  );

  it('judges each line against what is on file, assignment included', () => {
    expect(src).toContain('verdictForUploadedRow');
    expect(src).toContain('batchKey(');
    // The old key ignored the assignment entirely.
    expect(src).not.toContain('const key = `${res.id}|${date}|${shift}`');
  });

  it('reads the assignment back from the database to compare against', () => {
    expect(src).toMatch(/select:\s*\{[^}]*subRole:\s*true/s);
  });
});
