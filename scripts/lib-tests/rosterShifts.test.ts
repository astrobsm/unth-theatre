import { describe, it, expect } from 'vitest';
import { normaliseShift } from '../../src/lib/rosterShifts';
import {
  ROSTER_DEPARTMENTS,
  getRosterDept,
  getShiftOptions,
  TECHNICIAN_SPECIAL_ASSIGNMENTS,
  ON_CALL_ALL_SPECIALTIES,
} from '../../src/lib/rosterDepartments';

/**
 * The roster shows each department its own wording for a shift, and the bulk
 * upload has to read that wording back. Those are two files that must agree, and
 * nothing but this test makes them.
 *
 * This is not hypothetical. Renaming the technicians' CALL shift to
 * "DAY CALL/EMERGENCIES" broke the upload immediately: the label canonicalises
 * to "DAY CALL EMERGENCIES", which no branch matched, so every technician row in
 * a downloaded-and-refilled template would have been rejected as "unreadable
 * shift" — while the template itself went on offering that exact word in a
 * dropdown.
 */
describe('roster shift labels round-trip through the upload parser', () => {
  // THE LOAD-BEARING TEST. Every label any department offers must read back as
  // the value it was declared with. A rename that forgets the parser fails here
  // rather than in a theatre at seven in the morning.
  for (const dept of ROSTER_DEPARTMENTS) {
    it(`${dept.slug}: every offered label parses back to its stored value`, () => {
      for (const opt of getShiftOptions(dept)) {
        expect(normaliseShift(opt.label), `${dept.slug} label "${opt.label}"`).toBe(opt.value);
      }
    });
  }

  it('reads NIGHT CALL as NIGHT, not CALL', () => {
    // "NIGHT CALL/EMERGENCIES" contains "CALL". Matching CALL first would put
    // the night technician on days — and technician-coverage picks who is
    // called for a 2 a.m. emergency from exactly this field.
    expect(normaliseShift('NIGHT CALL/EMERGENCIES')).toBe('NIGHT');
    expect(normaliseShift('night call')).toBe('NIGHT');
    expect(normaliseShift('DAY CALL/EMERGENCIES')).toBe('CALL');
  });

  it('still accepts the wordings people already type', () => {
    for (const [raw, want] of [
      ['MORNING', 'MORNING'], ['am', 'MORNING'], ['Day', 'MORNING'], ['ELECTIVES', 'MORNING'],
      ['CALL', 'CALL'], ['on-call', 'CALL'], ['Emergencies', 'CALL'], ['CALL/EMERGENCIES', 'CALL'],
      ['NIGHT', 'NIGHT'], ['pm', 'NIGHT'], ['late', 'NIGHT'],
    ] as const) {
      expect(normaliseShift(raw), raw).toBe(want);
    }
  });

  it('rejects what it cannot read rather than guessing', () => {
    for (const raw of ['', '   ', 'whenever', 'SHIFT 2', 'MORNING/NIGHT']) {
      expect(normaliseShift(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('anaesthetic technicians mirror the anaesthetists', () => {
  const tech = getRosterDept('anaesthetic-technicians')!;
  const anaes = getRosterDept('anaesthetists')!;

  it('has no seniority, so no grade field is shown, exported or uploaded', () => {
    // The entry used to carry CONSULTANT / SENIOR_REGISTRAR / REGISTRAR, copied
    // from the anaesthetists. No technician holds a medical grade, and all 506
    // of their live roster rows have the column NULL.
    expect(tech.seniorityLevels ?? []).toEqual([]);
    // The anaesthetists genuinely do have grades — this must not have removed
    // the field everywhere.
    expect(anaes.seniorityLevels?.length).toBeGreaterThan(0);
  });

  it('names its shifts by duty, the way the anaesthetists do', () => {
    const labels = getShiftOptions(tech).map((s) => s.label);
    expect(labels).toContain('ELECTIVES');
    expect(labels.some((l) => /DAY CALL/.test(l))).toBe(true);
  });

  it('keeps NIGHT, which the anaesthetists do not have', () => {
    // Deliberate divergence. technician-coverage routes an overnight emergency
    // to the night technician and a daytime one to the day technician; folding
    // NIGHT into CALL would send every 2 a.m. case to whoever is on day call.
    // 37 published rows are already shift NIGHT.
    expect(getShiftOptions(tech).map((s) => s.value)).toContain('NIGHT');
    expect(getShiftOptions(anaes).map((s) => s.value)).not.toContain('NIGHT');
  });

  it('is rostered to a surgical specialty, like the anaesthetists', () => {
    // Was 'THEATRE'. Technicians are now rostered to Neurosurgery, Orthopaedics
    // and so on — the same live list the anaesthetists get, from SurgicalUnit.
    expect(tech.subRoleSource).toBe('SURGICAL_SPECIALTY');
    expect(tech.subRoleSource).toBe(anaes.subRoleSource);
    expect(tech.subRoleLabel).toBe('Surgical Specialty');
  });

  it('offers ICU and the call assignments on top of the specialties', () => {
    expect(TECHNICIAN_SPECIAL_ASSIGNMENTS).toContain('ICU');
    expect(tech.extraSubRoles).toEqual(TECHNICIAN_SPECIAL_ASSIGNMENTS);
  });

  it('does not offer the anaesthetists\' on-call-for-everything option', () => {
    // The anaesthetists have one consultant covering every specialty overnight.
    // A technician takes DAY CALL or NIGHT CALL instead, and the coverage route
    // depends on telling those two apart.
    expect(tech.onCallSubRole).toBeUndefined();
    expect(anaes.onCallSubRole).toBe(ON_CALL_ALL_SPECIALTIES);
  });

  it('keeps the assignment strings classifyTechnicianRow pattern-matches', () => {
    // These are matched by /night\s*call/i, /day\s*call/i and /\bicu\b/i.
    // Rewording them silently unassigns the on-call technicians.
    for (const s of TECHNICIAN_SPECIAL_ASSIGNMENTS) {
      expect(/night\s*call/i.test(s) || /day\s*call/i.test(s) || /\bicu\b/i.test(s)).toBe(true);
    }
  });
});
