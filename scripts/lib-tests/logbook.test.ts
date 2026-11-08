// The training log book: the West African College of Surgeons' requirements as
// published, and the parts this module must not invent.
//
// THE SINGLE MOST IMPORTANT TEST IN THIS FILE is that the WACS Faculty of
// Anaesthesia quotas still sum to the thousand the College requires. A quota
// table that does not add up to its own stated total is one somebody has
// edited without reading, and a trainee planning three years of rotations
// against it would be planning against nothing.
//
// The second is that the profiles whose numbers could NOT be read from the
// College's published documents carry no numbers at all. A figure this system
// invented would be quoted back at an examiner, and the trainee would carry
// the consequence, not the software.
import { describe, it, expect } from 'vitest';
import {
  COLLEGE_PROFILES, collegeProfile, PARTICIPATION_LEVELS, LEVEL_CODE,
  WACS_ANAESTHESIA_MEMBERSHIP_QUOTAS,
} from '../../src/lib/logbook/colleges';
import { participationIn, participationWhere } from '../../src/lib/logbook/participation';
import { buildLogbookRows, quotaProgress, logbookSummary } from '../../src/lib/logbook/build';
import { LOGBOOK_INCLUDE } from '../../src/lib/logbook/include';
import { mayGenerateFor } from '../../src/lib/logbook/access';
import { badFields } from './schemaFields';

describe('what the College actually requires', () => {
  it('reproduces the WACS anaesthesia quotas so that each cut sums to 1000', () => {
    // The twelve specialty rows are one cut of the thousand cases. The two
    // technique rows (general 650 + regional 350) are the other cut of the
    // same thousand, which is why they are summed separately.
    const specialty = WACS_ANAESTHESIA_MEMBERSHIP_QUOTAS
      .filter((q) => q.match.on === 'specialty')
      .reduce((a, q) => a + (q.required ?? 0), 0);
    expect(specialty).toBe(1000);

    const technique = WACS_ANAESTHESIA_MEMBERSHIP_QUOTAS
      .filter((q) => q.match.on === 'anaesthesiaType')
      .reduce((a, q) => a + (q.required ?? 0), 0);
    expect(technique).toBe(1000);
  });

  it('keeps the individual figures the College published', () => {
    const byKey = Object.fromEntries(
      WACS_ANAESTHESIA_MEMBERSHIP_QUOTAS.map((q) => [q.key, q.required]),
    );
    expect(byKey.general).toBe(650);
    expect(byKey.regional).toBe(350);
    expect(byKey.generalSurgery).toBe(300);
    expect(byKey.obstetrics).toBe(230);
    expect(byKey.orthopaedics).toBe(100);
    expect(byKey.paediatric).toBe(60);
    expect(byKey.neuro).toBe(20);
    expect(byKey.icu).toBe(20);
  });

  it('carries the no-block-signature rule, which is what trainees are caught by', () => {
    const p = collegeProfile('wacs-anaesthesia-membership')!;
    expect(p.totalRequired).toBe(1000);
    expect(p.requirement).toContain('Block signature will not be acceptable');
  });

  it('asserts NO quota where the College publishes none', () => {
    // Two different reasons, and the note says which. WACS Surgery: the
    // figures could not be read. NPMCN: the portfolio arrived and sets out
    // no operative minimum at all. Either way no number is invented, and a
    // reader can tell the two apart.
    ['wacs-surgery', 'npmcn-surgery'].forEach((key) => {
      const p = collegeProfile(key)!;
      expect(p.quotasVerified).toBe(false);
      expect(p.totalRequired).toBeNull();
      expect(p.quotas).toEqual([]);
      expect(p.sourceNote.toLowerCase(), key)
        .toMatch(/could not be read|no minimum numbers|enter your faculty/);
    });

    // And the NPMCN note explains the reason rather than implying a gap in
    // this module's research.
    expect(collegeProfile('npmcn-surgery')!.sourceNote)
      .toContain('NO minimum numbers');
  });

  it('gives every profile a requirement, a source and an attestation', () => {
    COLLEGE_PROFILES.forEach((p) => {
      expect(p.requirement.length).toBeGreaterThan(40);
      expect(p.sourceNote.length).toBeGreaterThan(30);
      expect(p.attestation).toContain('certify');
      expect(p.columns.length).toBeGreaterThan(8);
    });
  });

  it('uses the four participation levels with single-letter codes', () => {
    expect(PARTICIPATION_LEVELS.map((l) => l.key))
      .toEqual(['OBSERVED', 'ASSISTED', 'SUPERVISED', 'INDEPENDENT']);
    expect(LEVEL_CODE.INDEPENDENT).toBe('P');
    expect(LEVEL_CODE.ASSISTED).toBe('A');
  });
});

/** A case fixture. Lettered ids only — no real patient reaches a test file. */
const aCase = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'case-a',
  scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
  status: 'COMPLETED',
  surgeryType: 'ELECTIVE',
  subspecialty: 'General Surgery',
  indication: 'right inguinal hernia',
  procedureName: 'open hernia repair',
  surgeonId: 'dr-a',
  patient: { name: 'Patient A', folderNumber: 'PT000001', age: 44, ageUnit: 'YEARS', gender: 'Male', fitnessAssessments: [] },
  ...over,
});

describe('who took part, and at what level', () => {
  it('counts the surgeon of record as the operator', () => {
    const p = participationIn(aCase(), 'dr-a', 'SURGEON')!;
    expect(p.role).toBe('SURGEON');
  });

  it('proposes SUPERVISED when a consultant is named on the case', () => {
    const p = participationIn(
      aCase({ supervisingConsultantId: 'dr-b', supervisingConsultantName: 'Prof B' }),
      'dr-a', 'SURGEON',
    )!;
    expect(p.level).toBe('SUPERVISED');
    expect(p.supervisorName).toBe('Prof B');
    expect(p.basis).toContain('Prof B');
  });

  it('proposes INDEPENDENT for a consultant with nobody else named', () => {
    const p = participationIn(aCase(), 'dr-a', 'CONSULTANT_SURGEON')!;
    expect(p.level).toBe('INDEPENDENT');
  });

  it('proposes SUPERVISED, not INDEPENDENT, when nothing is recorded either way', () => {
    // The conservative claim. Over-claiming independence is the error an
    // examiner looks for; under-claiming is one a supervisor fixes with a pen.
    const p = participationIn(aCase(), 'dr-a', 'SURGEON')!;
    expect(p.level).toBe('SUPERVISED');
    expect(p.basis).toContain('more conservative');
  });

  it('counts an assistant as assisting, never as operating', () => {
    const p = participationIn(aCase({ assistantSurgeonId: 'dr-c' }), 'dr-c', 'SURGEON')!;
    expect(p.role).toBe('ASSISTANT');
    expect(p.level).toBe('ASSISTED');
  });

  it('counts the anaesthetist of record', () => {
    const p = participationIn(aCase({ anesthetistId: 'dr-d' }), 'dr-d', 'ANAESTHETIST')!;
    expect(p.role).toBe('ANAESTHETIST');
  });

  it('lets the intraoperative record override the booking', () => {
    // Written in the room, so it beats the field filled in at booking.
    const p = participationIn(
      aCase({ intraOperativeRecord: { primarySurgeonId: 'dr-e' } }), 'dr-e', 'SURGEON',
    )!;
    expect(p.role).toBe('SURGEON');
    expect(p.basis).toContain('intraoperative record');
  });

  it('treats a bare team listing as assisting and says why', () => {
    const p = participationIn(
      aCase({ teamMembers: [{ userId: 'dr-f', role: 'REGISTRAR' }] }), 'dr-f', 'SURGEON',
    )!;
    expect(p.level).toBe('ASSISTED');
    expect(p.basis).toContain('not what was done');
  });

  it('returns nothing for somebody who was not on the case', () => {
    expect(participationIn(aCase(), 'dr-z', 'SURGEON')).toBeNull();
  });

  it('looks in every place a person can be recorded', () => {
    const w = participationWhere('dr-a') as { OR: Array<Record<string, unknown>> };
    const keys = w.OR.map((o) => Object.keys(o)[0]);
    expect(keys).toEqual([
      'surgeonId', 'assistantSurgeonId', 'anesthetistId',
      'supervisingConsultantId', 'teamMembers', 'intraOperativeRecord',
    ]);
  });
});

describe('the book itself', () => {
  const cases = [
    aCase({ id: 'c2', scheduledDate: new Date('2026-05-01T08:00:00.000Z') }),
    aCase({ id: 'c1', scheduledDate: new Date('2026-01-02T08:00:00.000Z') }),
    aCase({ id: 'c3', surgeonId: 'dr-other' }),
  ];

  it('numbers the rows from one, oldest first', () => {
    const rows = buildLogbookRows(cases, { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows.map((r) => r.serial)).toEqual([1, 2]);
    expect(rows.map((r) => r.caseId)).toEqual(['c1', 'c2']);
    expect(rows[0].date).toBe('2026-01-02');
  });

  it('leaves out cases the person had nothing to do with', () => {
    const rows = buildLogbookRows(cases, { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows.find((r) => r.caseId === 'c3')).toBeUndefined();
  });

  it('carries the hospital number, because the College asks for it', () => {
    const rows = buildLogbookRows(cases, { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows[0].hospitalNumber).toBe('PT000001');
  });

  it('leaves the patient NAME out unless it is explicitly asked for', () => {
    const without = buildLogbookRows(cases, { personId: 'dr-a', personRole: 'SURGEON' });
    expect(without[0].patientName).toBeNull();

    const with_ = buildLogbookRows(cases, {
      personId: 'dr-a', personRole: 'SURGEON', includePatientName: true,
    });
    expect(with_[0].patientName).toBe('Patient A');
  });

  it('prefers what was found at operation over what was suspected at booking', () => {
    const rows = buildLogbookRows([aCase({
      postOpNotes: [{
        signedAt: new Date('2026-03-04T12:00:00.000Z'),
        postOpDiagnosis: 'strangulated inguinal hernia',
        procedurePerformed: 'emergency herniotomy and bowel resection',
      }],
    })], { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows[0].diagnosis).toBe('Strangulated inguinal hernia');
    expect(rows[0].procedure).toBe('Emergency herniotomy and bowel resection');
  });

  it('falls back to the booking indication rather than inventing a diagnosis', () => {
    const rows = buildLogbookRows([aCase()], { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows[0].diagnosis).toBe('Right inguinal hernia');
  });

  it('reports a death first, because that is what an examiner looks for', () => {
    const rows = buildLogbookRows([aCase({
      mortality: { timeOfDeath: new Date('2026-03-04T15:00:00.000Z'), causeOfDeath: 'Haemorrhagic shock' },
    })], { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows[0].outcome).toContain('Died 2026-03-04');
    expect(rows[0].outcome).toContain('Haemorrhagic shock');
  });

  it('names complications from all three records in one column', () => {
    const rows = buildLogbookRows([aCase({
      anesthesiaRecord: { hypotensionOccurred: true, difficultAirway: true },
      surgicalCount: { discrepancyOccurred: true },
    })], { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows[0].complications).toContain('hypotension');
    expect(rows[0].complications).toContain('difficult airway');
    expect(rows[0].complications).toContain('Count discrepancy');
  });

  it('records an age under a year in months, not as zero', () => {
    const rows = buildLogbookRows([aCase({
      patient: { folderNumber: 'PT000002', age: 6, ageUnit: 'MONTHS', gender: 'Female', fitnessAssessments: [] },
    })], { personId: 'dr-a', personRole: 'SURGEON' });
    expect(rows[0].age).toBe('6 mo');
  });
});

describe('progress against the College quotas', () => {
  const rows = buildLogbookRows(
    Array.from({ length: 5 }, (_, i) => aCase({
      id: `g${i}`,
      anesthetistId: 'dr-d',
      surgeonId: null,
      anesthesiaRecord: { anesthesiaType: 'GENERAL' },
      subspecialty: 'General Surgery',
    })),
    { personId: 'dr-d', personRole: 'ANAESTHETIST' },
  );

  it('counts cases into the categories the College names', () => {
    const progress = quotaProgress(rows, collegeProfile('wacs-anaesthesia-membership')!);
    const general = progress.find((p) => p.key === 'general')!;
    expect(general.achieved).toBe(5);
    expect(general.required).toBe(650);
    expect(general.shortfall).toBe(645);
    expect(general.percent).toBeCloseTo(0.8, 1);
  });

  it('shows no percentage where the College publishes no figure', () => {
    // A progress bar against an invented denominator is the most misleading
    // thing this screen could show.
    const progress = quotaProgress(rows, collegeProfile('npmcn-surgery')!);
    expect(progress).toEqual([]);
  });

  it('summarises by level, role, specialty and year, and states what is missing', () => {
    const s = logbookSummary(rows);
    expect(s.total).toBe(5);
    expect(s.byRole.Anaesthetist).toBe(5);
    expect(s.bySpecialty['General Surgery']).toBe(5);
    expect(s.byYear['2026']).toBe(5);
    expect(s.missingDiagnosis).toBe(0);
  });
});

describe('who may generate whose book', () => {
  it('always lets somebody generate their own', () => {
    expect(mayGenerateFor('dr-a', 'HOUSE_OFFICER', 'dr-a')).toBe(true);
  });

  it('lets nobody pull a colleague’s, whatever their rank', () => {
    // Changed on 8 November 2026 on instruction: "for the log books a user can
    // only see his own cases." It previously allowed trainers and theatre
    // management, which was convenient and was also a route to a spreadsheet
    // of hospital numbers from cases the puller had nothing to do with.
    expect(mayGenerateFor('dr-a', 'SURGEON', 'dr-b')).toBe(false);
    expect(mayGenerateFor('dr-a', 'HOUSE_OFFICER', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'HEAD_OF_SURGERY', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'CONSULTANT_ANAESTHETIST', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'THEATRE_MANAGER', 'dr-b')).toBe(false);
    expect(mayGenerateFor('boss', 'ADMIN', 'dr-b')).toBe(false);
  });
});

describe('the log book include tree resolves against the real schema', () => {
  it('selects only fields the schema declares', () => {
    const problems = badFields('Surgery', LOGBOOK_INCLUDE as never);
    expect(problems, `Fields that do not exist:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  it('loads the folder number on purpose, unlike the research tree', () => {
    expect(Object.keys(LOGBOOK_INCLUDE.patient.select)).toContain('folderNumber');
  });
});
