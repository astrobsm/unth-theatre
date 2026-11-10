// The pharmacy counter takes whatever the patient is holding.
//
// Two failures sit behind this, and both end with somebody turned away from a
// window they were standing at legitimately.
//
//   1. A box that takes only a PT number answers "no surgery found" to a
//      patient holding PH-7K9QF2, and a box that takes only a code does the
//      same to the patient who lost their slip. The person at the counter
//      cannot tell which box they are looking at, because both say "look up".
//
//   2. Worse, and quieter: the lookup used to report the patient's own PT
//      number AS the pharmacy code whenever the case had none. A pharmacist
//      reads that out, the patient writes it down, and it will never resolve
//      anywhere — a code that cannot work, handed over with confidence.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  looksLikeSurgeryCode, codeTypeOf, buildCode, normaliseCode, CODE_PREFIX,
} from '../../src/lib/surgeryCodes';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const api = read('src/app/api/surgery-codes/lookup/route.ts');
const widget = read('src/components/SurgeryCodeLookup.tsx');
const pharmacy = read('src/app/dashboard/prescriptions/page.tsx');
const consumables = read('src/app/dashboard/consumable-pack-provider/page.tsx');

describe('telling a code from a patient number', () => {
  it('recognises every code this system mints', () => {
    // Generated rather than hand-written, so the detector cannot drift from
    // the generator — which is the way this breaks silently.
    for (const type of ['consumable', 'pharmacy', 'anaesthesia'] as const) {
      for (let i = 0; i < 50; i += 1) {
        const code = buildCode(type);
        expect(looksLikeSurgeryCode(code), code).toBe(true);
        expect(codeTypeOf(code), code).toBe(type);
      }
    }
  });

  it('accepts a code however it was typed', () => {
    // Read off a slip, so: lower case, stray spaces, both.
    for (const typed of ['ph-7k9qf2', ' PH-7K9QF2 ', 'Ph-7K9Qf2', 'PH - 7K9QF2']) {
      expect(looksLikeSurgeryCode(typed), typed).toBe(true);
      expect(codeTypeOf(typed), typed).toBe('pharmacy');
    }
  });

  it('does not mistake a patient number for a code', () => {
    // THE ONE THAT MATTERS. A folder number treated as a code is looked up in
    // the wrong table and reported missing, for a patient who is on file.
    for (const notACode of [
      'PT-12345', 'PT12345', '565979', 'UNTH/2026/0041',
      'A-12345', '', '   ', 'PH', 'PH-', 'PH-1', 'XX-7K9QF2',
    ]) {
      expect(looksLikeSurgeryCode(notACode), notACode).toBe(false);
      expect(codeTypeOf(notACode), notACode).toBeNull();
    }
  });

  it('rejects a body that could never have been minted', () => {
    // The generator's alphabet leaves out 0/O and 1/I/L so codes can be read
    // aloud. Something containing them is a misreading, not a missing code,
    // and saying "no surgery found" sends somebody looking for a record that
    // was never the one they wanted.
    expect(looksLikeSurgeryCode('PH-7K9QF0')).toBe(false);
    expect(looksLikeSurgeryCode('PH-7K9QFI')).toBe(false);
    expect(looksLikeSurgeryCode('PH-7K9QF1')).toBe(false);
  });

  it('keeps the three prefixes in step with the generator', () => {
    expect(Object.values(CODE_PREFIX).sort()).toEqual(['AN', 'CP', 'PH']);
    expect(normaliseCode(' ph-7k9qf2 ')).toBe('PH-7K9QF2');
  });
});

describe('what the lookup hands back', () => {
  it('returns all three codes, however the case was found', () => {
    // The counter is asked "what is my code?" by the patient in front of it.
    // These were being read out of the database and dropped before the screen
    // saw them.
    expect(api).toContain('function codesOf(');
    const returns = api.match(/codes: codesOf\(/g) ?? [];
    // Consumable, pharmacy and anaesthesia patient branches, plus the
    // code branch.
    expect(returns.length).toBe(4);
    expect(api).toContain('codes: { consumable: null, pharmacy: null, anaesthesia: code }');
  });

  it('never passes a PT number off as a code', () => {
    // The old `code: <column> ?? patientIdentifier` put the patient's own
    // number where a PH- code goes.
    //
    // Matched as an ASSIGNMENT, so the hazard can still be named in the
    // comment that explains why it was removed.
    expect(api).not.toMatch(/code:\s*[^,\n]*\?\?\s*patientIdentifier/);
    expect(api).toContain('consumablePackCode ?? null');
    expect(api).toContain('pharmacyDrugCode ?? null');
    expect(api).toContain('anaesthesiaDrugCode ?? null');
  });

  it('reads all three columns in every branch, not just its own', () => {
    // Four selects: three patient branches and the code branch.
    expect((api.match(/consumablePackCode: true,/g) ?? []).length).toBe(4);
    expect((api.match(/pharmacyDrugCode: true,/g) ?? []).length).toBe(4);
    expect((api.match(/anaesthesiaDrugCode: true,/g) ?? []).length).toBe(4);
  });
});

describe('the boxes at the counter', () => {
  it('take either a code or a patient number', () => {
    expect(widget).toContain('looksLikeSurgeryCode(trimmed)');
    expect(widget).toContain("lookupBy === \"either\"");
    // The shape of the input decides which parameter is sent.
    expect(widget).toContain("params.set(\"code\", trimmed)");
    expect(widget).toContain("params.set(\"patientIdentifier\", trimmed)");
  });

  it('say so in the placeholder', () => {
    // Otherwise the counter does not know it may type a code, and carries on
    // asking for a PT number the patient does not have — or does not know
    // that a space instead of a hyphen is fine.
    expect(widget).toContain('PT-12345 or PT 12345');
    expect(widget).toContain('${sample}');
  });

  it('show the codes, and mark the ones that do not exist', () => {
    expect(widget).toContain('CODE_LABEL.map');
    expect(widget).toContain('not issued');
    // Copyable, because the next thing that happens is somebody writes it on
    // a slip by hand and gets a character wrong.
    expect(widget).toContain('clipboard?.writeText(value)');
  });
});

describe('the pharmacy page', () => {
  it('offers the pharmacy, consumable and anaesthesia boxes', () => {
    for (const kind of ['PHARMACY', 'CONSUMABLE', 'ANAESTHESIA']) {
      expect(pharmacy, kind).toContain(`expect="${kind}"`);
    }
  });

  it('lets every box take either input', () => {
    expect((pharmacy.match(/lookupBy="either"/g) ?? []).length).toBe(3);
    expect(pharmacy).not.toContain('lookupBy="patient"');
  });

  it('no longer promises only a PT number in the labels', () => {
    expect(pharmacy).not.toContain("enter the patient's PT number");
    expect(pharmacy).toContain('pharmacy code or PT number');
    expect(pharmacy).toContain('consumable code or PT number');
  });
});

describe('the consumable pack desk', () => {
  it('takes either the code or the patient number, like pharmacy', () => {
    expect(consumables).toContain('lookupBy="either"');
    expect(consumables).not.toContain('lookupBy="patient"');
    expect(consumables).toContain('consumable code or PT number');
  });
});

describe('a number that could be two patients', () => {
  it('is refused, not resolved to whichever is most recent', () => {
    // THE ONE THAT MATTERS MOST HERE. Folder numbers are bare digits and PT
    // numbers are prefixed, so expanding "12345" into both shapes can land on
    // two people. The old query nested the patient match inside a findFirst
    // on the request table, which silently picked the one with the newest
    // request — at a pharmacy window, the wrong person's drugs.
    expect(api).toContain('prisma.patient.findMany');
    expect(api).toContain('matches.length > 1');
    expect(api).toContain('ambiguous: true');
    expect(api).toContain('{ status: 409 }');
    expect(api).toContain('ambiguousNumberMessage(patientIdentifier, matches)');
    // The patient is resolved BEFORE any request table is consulted.
    expect(api.indexOf('prisma.patient.findMany'))
      .toBeLessThan(api.indexOf('surgeryConsumableRequest.findFirst'));
  });

  it('matches every spelling of the number', () => {
    expect(api).toContain('patientNumberForms(patientIdentifier)');
    expect(api).toContain('forms.candidates.flatMap');
    // Both columns, case-blind.
    expect(api).toContain('folderNumber: { equals: c, mode: "insensitive" as const }');
    expect(api).toContain('ptNumber: { equals: c, mode: "insensitive" as const }');
  });

  it('tells an unknown number apart from one with nothing requested', () => {
    // They used to read identically. One means go to the booking office; the
    // other means the case is booked and nobody has requested anything yet.
    expect(api).toContain('No patient on file matches');
    expect(api).toContain('patientExists: true');
    expect(api).toContain('is on file, but no');
  });

  it('says which spellings are accepted when nothing matched', () => {
    expect(api).toContain('PT-12345, PT 12345 or PT12345');
  });

  it('advertises them in the box as well', () => {
    expect(widget).toContain('PT-12345 or PT 12345');
  });
});
