/**
 * The laboratory benches, who was on duty, and whether they are here.
 *
 * Three things are being protected, and the third is the one that will decide
 * whether any of this survives contact with the hospital.
 *
 * A test must reach the bench that reports it. A worklist showing every
 * discipline to everybody is a worklist nobody owns — each scientist assumes
 * another has it, and the case is cancelled for want of a result that was on
 * the wrong screen all along.
 *
 * A request must name who should answer it, AT THE TIME. Reconstructing a
 * roster weeks afterwards from memory is precisely the reconstruction a Panel
 * of Inquiry has to do, and does badly. The answer may be nobody, and that is
 * the most valuable thing the record can say.
 *
 * And presence must never accuse somebody of something the evidence cannot
 * support. A phone with no signal, a fix accurate to two kilometres, a nurse
 * in a basement theatre — none of those is a person who left the hospital. A
 * presence record that cries wolf is switched off within a week, and then
 * nobody has anything at all.
 */
import { describe, expect, it } from 'vitest';

import {
  disciplineOf, disciplinesFor, mayReport, mayVerify, isDiscipline,
  LAB_DISCIPLINES, DISCIPLINE_LABEL,
} from '../../src/lib/diagnostics/disciplines';
import {
  shiftAt, resolveOnDuty, describeOnDuty, DEPARTMENT_ROLES, DEPARTMENT_LABEL,
  type OnDutyPerson,
} from '../../src/lib/diagnostics/onDuty';
import {
  evaluate, summarise, shouldRecord, distanceMetres, isOnDutyStatus,
  USELESS_ACCURACY_M, AWAY_CONCERN_MINUTES,
} from '../../src/lib/staff/presence';
import {
  TEST_CATALOGUE, catalogueByDiscipline, categoryFor,
} from '../../src/lib/diagnostics/testCatalogue';
import { ROSTER_DEPARTMENTS } from '../../src/lib/rosterDepartments';

// ── benches ─────────────────────────────────────────────────────────────────

describe('which bench a test belongs to', () => {
  it('sends the common theatre requests to the right discipline by name alone', () => {
    const cases: Array<[string, string]> = [
      ['Full blood count', 'HAEMATOLOGY'],
      ['PCV', 'HAEMATOLOGY'],
      ['INR', 'HAEMATOLOGY'],
      ['Serum urea and creatinine', 'CHEMICAL_PATHOLOGY'],
      ['Electrolytes', 'CHEMICAL_PATHOLOGY'],
      ['Liver function tests', 'CHEMICAL_PATHOLOGY'],
      ['Wound swab M/C/S', 'MICROBIOLOGY_IMMUNOLOGY'],
      ['HIV screening', 'MICROBIOLOGY_IMMUNOLOGY'],
      ['HBsAg', 'MICROBIOLOGY_IMMUNOLOGY'],
      ['Group and save', 'BLOOD_BANK'],
      ['Cross match 2 units', 'BLOOD_BANK'],
      ['Histology of specimen', 'HISTOPATHOLOGY'],
    ];
    for (const [name, expected] of cases) {
      expect(disciplineOf({ testName: name })).toBe(expected);
    }
  });

  it('prefers the category somebody chose over a guess from the name', () => {
    // A chosen category is a decision; a name is an inference.
    expect(disciplineOf({ category: 'CROSS_MATCH', testName: 'Full blood count' }))
      .toBe('BLOOD_BANK');
  });

  it('falls back to the name when the category is the catch-all', () => {
    expect(disciplineOf({ category: 'OTHER', testName: 'Serum potassium' }))
      .toBe('CHEMICAL_PATHOLOGY');
  });

  it('maps every category the emergency workup can produce', () => {
    // Exhaustive over EmergencyLabTestCategory. A category with no mapping
    // would silently land in OTHER and sit unread.
    const enumValues = [
      'HEMATOLOGY', 'BIOCHEMISTRY', 'COAGULATION', 'BLOOD_GAS', 'CROSS_MATCH',
      'URINALYSIS', 'MICROBIOLOGY', 'SEROLOGY', 'RADIOLOGY', 'ECG', 'OTHER',
    ];
    for (const v of enumValues) {
      expect(isDiscipline(disciplineOf({ category: v }))).toBe(true);
    }
    // Radiology and ECG are in that enum and are not laboratory work; they go
    // to OTHER rather than being dropped, because the request still exists.
    expect(disciplineOf({ category: 'RADIOLOGY' })).toBe('OTHER');
    expect(disciplineOf({ category: 'ECG' })).toBe('OTHER');
  });

  it('does not match a word inside a longer one', () => {
    // "urea" inside "Ureaplasma urealyticum" is microbiology, not chemistry.
    expect(disciplineOf({ testName: 'Ureaplasma urealyticum culture' }))
      .toBe('MICROBIOLOGY_IMMUNOLOGY');
  });

  it('says it does not know rather than guessing', () => {
    // An unrecognised test appears on a list somebody looks at, instead of
    // being guessed onto a bench where it would sit unread.
    expect(disciplineOf({ testName: 'Something nobody has heard of' })).toBe('OTHER');
    expect(disciplineOf({})).toBe('OTHER');
  });

  it('has a label for every discipline', () => {
    LAB_DISCIPLINES.forEach((d) => expect(DISCIPLINE_LABEL[d]).toBeTruthy());
  });
});

describe('who may report and who may release', () => {
  it('gives each scientist their own bench', () => {
    expect(disciplinesFor('HAEMATOLOGY_SCIENTIST')).toContain('HAEMATOLOGY');
    expect(disciplinesFor('HAEMATOLOGY_SCIENTIST')).not.toContain('CHEMICAL_PATHOLOGY');
    expect(disciplinesFor('CHEMICAL_PATHOLOGY_SCIENTIST')).toEqual(['CHEMICAL_PATHOLOGY']);
    expect(disciplinesFor('MICROBIOLOGY_SCIENTIST')).toContain('MICROBIOLOGY_IMMUNOLOGY');
  });

  it('lets the technicians see everything, because they receive every sample', () => {
    expect(disciplinesFor('LABORATORY_TECHNICIAN')).toHaveLength(LAB_DISCIPLINES.length);
    expect(disciplinesFor('LABORATORY_STAFF')).toHaveLength(LAB_DISCIPLINES.length);
  });

  it('gives a surgeon no bench at all', () => {
    expect(disciplinesFor('SURGEON')).toEqual([]);
    expect(mayReport('SURGEON', 'HAEMATOLOGY')).toBe(false);
  });

  it('lets a technician enter but not release', () => {
    // Releasing a result as fit to operate on is a different act from running
    // the analyser, and belongs to somebody answerable for it.
    expect(mayReport('LABORATORY_TECHNICIAN', 'HAEMATOLOGY')).toBe(true);
    expect(mayVerify('LABORATORY_TECHNICIAN', 'HAEMATOLOGY')).toBe(false);
    expect(mayVerify('HAEMATOLOGY_SCIENTIST', 'HAEMATOLOGY')).toBe(true);
  });

  it('will not let a scientist release another bench’s result', () => {
    expect(mayVerify('HAEMATOLOGY_SCIENTIST', 'CHEMICAL_PATHOLOGY')).toBe(false);
  });
});

// ── who was on duty ─────────────────────────────────────────────────────────

describe('which shift a moment falls in', () => {
  const at = (iso: string) => new Date(iso);

  it('places the working day', () => {
    expect(shiftAt(at('2026-09-22T09:00:00Z')).shift).toBe('MORNING'); // 10:00 WAT
    expect(shiftAt(at('2026-09-22T16:00:00Z')).shift).toBe('CALL');    // 17:00 WAT
    expect(shiftAt(at('2026-09-22T22:00:00Z')).shift).toBe('NIGHT');   // 23:00 WAT
  });

  it('files a 02:00 request under the night that began the evening before', () => {
    // Otherwise the request at 02:00 on Tuesday looks for Tuesday's night
    // shift, which has not started, and finds nobody.
    const { shift, rosterDate } = shiftAt(at('2026-09-22T01:00:00Z')); // 02:00 WAT Tue
    expect(shift).toBe('NIGHT');
    expect(rosterDate.toISOString().slice(0, 10)).toBe('2026-09-21');
  });
});

describe('naming who should answer', () => {
  const person = (id: string, name: string): OnDutyPerson => ({ userId: id, name });
  const base = {
    department: 'RADIOGRAPHERS' as const,
    at: new Date('2026-09-22T09:00:00Z'),
  };

  it('names the rostered staff when there are any', () => {
    const r = resolveOnDuty({ ...base, rostered: [person('a', 'Mr Eze')], register: [person('b', 'Ms Obi')] });
    expect(r.staff.map((p) => p.name)).toEqual(['Mr Eze']);
    expect(r.fallback).toBe(false);
    expect(describeOnDuty(r)).toBe('On duty: Mr Eze.');
  });

  it('falls back to the register, and says that is what it did', () => {
    // "We told the six radiographers on the register" is not the same fact as
    // "the radiographer on call is Mr Eze", and the requester must see which.
    const r = resolveOnDuty({ ...base, rostered: [], register: [person('a', 'Mr Eze'), person('b', 'Ms Obi')] });
    expect(r.fallback).toBe(true);
    expect(r.empty).toBe(false);
    expect(describeOnDuty(r)).toContain('No radiographers are rostered');
    expect(describeOnDuty(r)).toContain('Somebody should be rostered');
  });

  it('says plainly when there is nobody at all', () => {
    // A surgeon told "the request has been sent" who then waits two hours for
    // a department that had nobody on is worse served than one told at once.
    const r = resolveOnDuty({ ...base, rostered: [], register: [] });
    expect(r.empty).toBe(true);
    const line = describeOnDuty(r);
    expect(line).toContain('nobody for it to reach');
    expect(line).toContain('tell the head of department directly');
  });

  it('does not name the same person twice', () => {
    const r = resolveOnDuty({
      ...base,
      rostered: [person('a', 'Mr Eze'), person('a', 'Mr Eze')],
      register: [],
    });
    expect(r.staff).toHaveLength(1);
  });

  it('draws every department from roles that exist', () => {
    // A department pointing at a role the schema does not have reaches nobody,
    // exactly as the duty sheets once did.
    const roles = new Set(Object.values(DEPARTMENT_ROLES).flat());
    expect(roles.size).toBeGreaterThan(5);
    Object.keys(DEPARTMENT_ROLES).forEach((d) => {
      expect(DEPARTMENT_LABEL[d as keyof typeof DEPARTMENT_LABEL]).toBeTruthy();
      expect(DEPARTMENT_ROLES[d as keyof typeof DEPARTMENT_ROLES].length).toBeGreaterThan(0);
    });
  });
});

// ── presence ────────────────────────────────────────────────────────────────

const FENCE = { latitude: 6.4020, longitude: 7.4800, radiusMetres: 400 };

describe('measuring distance', () => {
  it('is zero at the same point', () => {
    expect(distanceMetres(
      { latitude: 6.4020, longitude: 7.4800 },
      { latitude: 6.4020, longitude: 7.4800 },
    )).toBe(0);
  });

  it('is about a hundred metres for a thousandth of a degree of latitude', () => {
    const d = distanceMetres(
      { latitude: 6.4020, longitude: 7.4800 },
      { latitude: 6.4029, longitude: 7.4800 },
    );
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});

describe('in, out, or cannot say', () => {
  it('calls somebody at the centre present', () => {
    const v = evaluate({ latitude: 6.4020, longitude: 7.4800, accuracyM: 10 }, FENCE);
    expect(v.onSite).toBe(true);
  });

  it('calls somebody two kilometres away absent', () => {
    const v = evaluate({ latitude: 6.4200, longitude: 7.4800, accuracyM: 10 }, FENCE);
    expect(v.onSite).toBe(false);
    expect(v.reason).toMatch(/from the hospital/);
  });

  it('gives the boundary to the member of staff', () => {
    // A phone on a bench by the wall wanders either side of the line all
    // morning; a boundary case must not become an accusation.
    const justOutside = { latitude: 6.4020 + 0.0042, longitude: 7.4800, accuracyM: 10 };
    const v = evaluate(justOutside, FENCE);
    expect(v.distanceM).toBeGreaterThan(FENCE.radiusMetres);
    expect(v.onSite).toBe(true);
    expect(v.reason).toMatch(/edge of the perimeter/);
  });

  it('will not place anybody on a fix accurate to two kilometres', () => {
    const v = evaluate({ latitude: 6.4200, longitude: 7.4800, accuracyM: 2000 }, FENCE);
    expect(v.onSite).toBeNull();
    expect(v.reason).toMatch(/cannot place anybody/);
    expect(2000).toBeGreaterThan(USELESS_ACCURACY_M);
  });

  it('treats no position as unknown, never as absence', () => {
    // A basement theatre has no signal. That is a fact about the building.
    expect(evaluate({}, FENCE).onSite).toBeNull();
    expect(evaluate({ latitude: 0, longitude: 0, accuracyM: 5 }, FENCE).onSite).toBeNull();
  });

  it('answers nothing at all when no perimeter has been set', () => {
    const v = evaluate({ latitude: 6.4020, longitude: 7.4800, accuracyM: 10 }, null);
    expect(v.onSite).toBeNull();
    expect(v.reason).toMatch(/No facility perimeter/);
  });
});

describe('what the board says about one person', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);

  it('reports somebody present', () => {
    const s = summarise([{ at: ago(5), onSite: true }], now);
    expect(s.lastKnown).toBe('ON_SITE');
    expect(s.concern).toBeNull();
  });

  it('measures absence from when it began, not from the latest check', () => {
    // Otherwise somebody four hours away reads as two minutes away.
    const s = summarise([
      { at: ago(2), onSite: false },
      { at: ago(30), onSite: false },
      { at: ago(60), onSite: false },
      { at: ago(90), onSite: true },
    ], now);
    expect(s.lastKnown).toBe('OFF_SITE');
    expect(s.minutesAway).toBe(60);
  });

  it('raises a concern only after a real interval, and phrases it as a question', () => {
    // The board does not know why somebody is away, and there are good
    // reasons — collecting blood, escorting a patient elsewhere.
    const brief = summarise([{ at: ago(10), onSite: false }], now);
    expect(brief.concern).toBeNull();

    const long = summarise([{ at: ago(AWAY_CONCERN_MINUTES + 5), onSite: false }], now);
    expect(long.concern).toMatch(/Worth asking why/);
    expect(long.concern).not.toMatch(/absent without|abandoned|violation/i);
  });

  it('does not let a run of unknowns overwrite the last real answer', () => {
    const s = summarise([
      { at: ago(1), onSite: null },
      { at: ago(3), onSite: null },
      { at: ago(10), onSite: true },
    ], now);
    expect(s.lastKnown).toBe('ON_SITE');
  });

  it('reports silence as staleness, not as absence', () => {
    const s = summarise([{ at: ago(200), onSite: true }], now);
    expect(s.lastKnown).toBe('ON_SITE');
    expect(s.stale).toBe(true);
    expect(s.concern).toMatch(/Last confirmed on site/);
  });

  it('says nothing at all when there is nothing to say', () => {
    const s = summarise([], now);
    expect(s.lastKnown).toBe('UNKNOWN');
    expect(s.concern).toBeNull();
  });
});

describe('when a check may be recorded at all', () => {
  it('records while on duty and rostered', () => {
    expect(shouldRecord({ status: 'AVAILABLE', onRoster: true }).record).toBe(true);
    expect(shouldRecord({ status: 'IN_THEATRE', onRoster: true }).record).toBe(true);
  });

  it('records nothing outside a rostered shift', () => {
    // Somebody's own time is their own, and no operational question needs it.
    const r = shouldRecord({ status: 'AVAILABLE', onRoster: false });
    expect(r.record).toBe(false);
    expect(r.reason).toMatch(/Not rostered/);
  });

  it('records nothing for off duty or on leave, even if rostered today', () => {
    for (const status of ['OFF_DUTY', 'ON_LEAVE', 'UNAVAILABLE']) {
      expect(shouldRecord({ status, onRoster: true }).record).toBe(false);
      expect(isOnDutyStatus(status)).toBe(false);
    }
  });

  it('records nothing when no status has been set', () => {
    expect(shouldRecord({ status: null, onRoster: true }).record).toBe(false);
  });
});

// ── what can be ordered, and where it is rostered ───────────────────────────

describe('the test catalogue a theatre orders from', () => {
  it('routes every listed test to the bench it says it belongs to', () => {
    // The whole point of a catalogue is that the name and the bench agree. A
    // test filed under one and matched to another is how a result appears on a
    // worklist nobody is watching.
    TEST_CATALOGUE.forEach((t) => {
      expect(disciplineOf({ testName: t.name })).toBe(t.discipline);
    });
  });

  it('covers the three benches by name and the blood bank', () => {
    const benches = new Set(TEST_CATALOGUE.map((t) => t.discipline));
    expect(benches.has('HAEMATOLOGY')).toBe(true);
    expect(benches.has('CHEMICAL_PATHOLOGY')).toBe(true);
    expect(benches.has('MICROBIOLOGY_IMMUNOLOGY')).toBe(true);
    expect(benches.has('BLOOD_BANK')).toBe(true);
  });

  it('names no test twice', () => {
    const names = TEST_CATALOGUE.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('groups for the picker without an empty heading', () => {
    const groups = catalogueByDiscipline();
    expect(groups.length).toBeGreaterThan(3);
    groups.forEach((g) => expect(g.tests.length).toBeGreaterThan(0));
  });

  it('stores a category the discipline mapping reads back', () => {
    // categoryFor writes the discipline itself, so an investigation requested
    // today sorts onto the same bench as one recorded before the enum existed.
    TEST_CATALOGUE.forEach((t) => {
      expect(disciplineOf({ category: categoryFor(t) })).toBe(t.discipline);
    });
  });
});

describe('the departments that can be rostered', () => {
  it('has a department for every roster category the duty capture reads', () => {
    // A department the capture looks for and the roster cannot create is a
    // department that is永 empty — every request against it would fall back to
    // the register and report "nobody rostered" for ever.
    const slugs = new Set(ROSTER_DEPARTMENTS.map((d) => d.category));
    Object.keys(DEPARTMENT_ROLES).forEach((category) => {
      expect(slugs.has(category)).toBe(true);
    });
  });

  it('draws each new department from roles that exist in the schema', () => {
    const wanted = Object.keys(DEPARTMENT_ROLES);
    ROSTER_DEPARTMENTS.filter((d) => wanted.includes(d.category)).forEach((d) => {
      expect(d.userRoles.length).toBeGreaterThan(0);
      expect(d.managerRoles.length).toBeGreaterThan(0);
      expect(d.slug).toMatch(/^[a-z-]+$/);
    });
  });

  it('gives the laboratory benches as sub-roles, matching the worklist', () => {
    // A scientist rostered to "haematology" and the haematology worklist must
    // mean the same thing without anybody mapping between them.
    const lab = ROSTER_DEPARTMENTS.find((d) => d.category === 'LABORATORY_SCIENTISTS')!;
    expect(lab.subRoles).toContain('HAEMATOLOGY');
    expect(lab.subRoles).toContain('CHEMICAL_PATHOLOGY');
    expect(lab.subRoles).toContain('MICROBIOLOGY_IMMUNOLOGY');
    lab.subRoles!.forEach((b) => expect(isDiscipline(b)).toBe(true));
  });
});
