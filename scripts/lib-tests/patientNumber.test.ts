import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  guessNumberKind, splitPatientNumbers, missingNumberProblem, sameNumberTwice,
  patientIdentifier, NUMBER_KIND_LABEL,
} from '../../src/lib/patients/patientNumber';

// Registration demanded a folder number. A patient who comes up from the
// clinic with a PT card and no folder number yet could not be put on the
// system — and a patient who cannot be registered cannot be booked, so the
// case goes on paper. These hold the rule that replaced it: one number, either
// kind, and the two kinds still kept apart underneath.

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('guessNumberKind', () => {
  it('reads a PT prefix in every way it gets written', () => {
    for (const v of ['PT001234', 'pt001234', 'PT-001234', 'PT 001234', 'pt_443076', 'PT.12']) {
      expect(guessNumberKind(v), v).toBe('pt');
    }
  });

  it('calls everything else a folder number', () => {
    for (const v of ['914954', 'UNTH/2024/001', '12/345', 'A1234']) {
      expect(guessNumberKind(v), v).toBe('folder');
    }
  });

  it('does not decide for somebody who has typed only the letters P and T', () => {
    // Deciding on the second keystroke, before there is a number at all, moves
    // the field under somebody while they are still typing into it.
    expect(guessNumberKind('PT')).toBe('folder');
    expect(guessNumberKind('')).toBe('folder');
    expect(guessNumberKind(null)).toBe('folder');
  });
});

describe('splitPatientNumbers — one box, two columns', () => {
  it('sends a folder number to the folder column', () => {
    expect(splitPatientNumbers({ typed: '914954', kind: 'folder' }))
      .toEqual({ folderNumber: '914954', ptNumber: null });
  });

  it('sends a PT number to the PT column', () => {
    expect(splitPatientNumbers({ typed: 'PT001234', kind: 'pt' }))
      .toEqual({ folderNumber: null, ptNumber: 'PT001234' });
  });

  it('puts the second number in the other column', () => {
    expect(splitPatientNumbers({ typed: 'PT001234', kind: 'pt', other: '914954' }))
      .toEqual({ folderNumber: '914954', ptNumber: 'PT001234' });
  });

  it('stores NULL and never an empty string for the number not given', () => {
    // Both columns are UNIQUE. Two patients holding the empty string would
    // collide with each other for having nothing in common.
    const n = splitPatientNumbers({ typed: '914954', kind: 'folder', other: '   ' });
    expect(n.ptNumber).toBeNull();
    expect(n.ptNumber).not.toBe('');
  });

  it('trims what a scanner adds and keeps what the hospital writes', () => {
    const n = splitPatientNumbers({ typed: '  UNTH/2024/001 ', kind: 'folder' });
    // Trimmed, because a trailing space is a second patient. The slash stays:
    // treating 12/345 as 12345 would merge two people.
    expect(n.folderNumber).toBe('UNTH/2024/001');
  });
});

describe('missingNumberProblem — the only rule left', () => {
  it('lets a folder number alone through', () => {
    expect(missingNumberProblem({ folderNumber: '914954', ptNumber: null })).toBeNull();
  });

  it('lets a PT number alone through, which is the whole point', () => {
    expect(missingNumberProblem({ folderNumber: null, ptNumber: 'PT001234' })).toBeNull();
  });

  it('refuses a registration with neither', () => {
    const said = missingNumberProblem({ folderNumber: null, ptNumber: null });
    expect(said).toBeTruthy();
    // Names both as acceptable, so nobody reads it as a missing folder number
    // and goes looking for one that does not exist.
    expect(said).toMatch(/folder number or a PT number/i);
  });

  it('counts whitespace as nothing', () => {
    expect(missingNumberProblem({ folderNumber: '   ', ptNumber: '' })).toBeTruthy();
  });
});

describe('sameNumberTwice', () => {
  it('warns when one number was entered in both boxes', () => {
    expect(sameNumberTwice({ folderNumber: 'PT001234', ptNumber: 'pt 001234' })).toBeTruthy();
  });

  it('says nothing about two genuinely different numbers', () => {
    expect(sameNumberTwice({ folderNumber: '914954', ptNumber: 'PT001234' })).toBeNull();
  });

  it('says nothing when only one was given', () => {
    // Two blanks are not a match — every patient without a PT number would
    // otherwise be warned about every other one.
    expect(sameNumberTwice({ folderNumber: '914954', ptNumber: null })).toBeNull();
    expect(sameNumberTwice({ folderNumber: null, ptNumber: null })).toBeNull();
  });
});

describe('patientIdentifier — the number on the slip', () => {
  it('prefers the folder number', () => {
    expect(patientIdentifier({ folderNumber: '914954', ptNumber: 'PT1' })).toBe('914954');
  });

  it('falls back to the PT number rather than printing a blank', () => {
    // A call-up slip is carried to the ward to collect a patient. A blank
    // where the number goes leaves nothing to check them against.
    expect(patientIdentifier({ folderNumber: null, ptNumber: 'PT001234' })).toBe('PT001234');
  });

  it('is empty, not a word, when there is genuinely nothing', () => {
    // It is written into a folderNumber column that other screens search.
    expect(patientIdentifier({ folderNumber: null, ptNumber: null })).toBe('');
    expect(patientIdentifier(null)).toBe('');
  });
});

describe('the rule is enforced where registrations actually arrive', () => {
  it('the API requires one of the two, not specifically the folder number', () => {
    const route = read('src/app/api/patients/route.ts');
    expect(route).toContain('missingNumberProblem');
    // The form is not the only way in: the offline queue replays through here.
    expect(route).not.toContain('folderNumber: z.string().min(1)');
  });

  it('neither column is compared when it is null', () => {
    // regexp_replace(upper(NULL)) is NULL, which is not TRUE, so the guard
    // would still not match. The point is that an unguarded comparison on a
    // now-nullable column is the kind of thing that gets copied into the next
    // query, where it will not be harmless.
    const route = read('src/app/api/patients/route.ts');
    expect(route).toContain('"folderNumber" is not null');
    expect(read('src/lib/patients/peerLookup.ts')).toContain('"folderNumber" is not null');
    expect(read('src/lib/patients/nearMatchQuery.ts')).toContain('coalesce("folderNumber"');
  });

  it('the column is nullable in the schema and in a migration', () => {
    const schema = read('prisma/schema.prisma');
    expect(schema).toContain('folderNumber   String?  @unique');
    const migration = read('prisma/migrations/20261118120000_patient_number_either/migration.sql');
    expect(migration).toContain('ALTER TABLE "patients" ALTER COLUMN "folderNumber" DROP NOT NULL');
    // Still unique: two patients sharing a folder number is the duplicate this
    // whole area exists to prevent.
    expect(migration).not.toMatch(/DROP\s+CONSTRAINT/i);
  });

  it('the registration form asks once and still sends both columns', () => {
    const page = read('src/app/dashboard/patients/new/page.tsx');
    expect(page).toContain('name="folderNumber"');
    expect(page).toContain('name="ptNumber"');
    expect(page).toContain('splitPatientNumbers');
    expect(page).toContain('missingNumberProblem');
    // One required box, not two fields of which one is compulsory.
    expect(page).not.toContain('Folder Number *');
  });

  it('a slip with room for one number takes whichever one exists', () => {
    for (const f of [
      'src/app/api/call-for-patient/route.ts',
      'src/app/api/pre-operative-visit/route.ts',
      'src/app/api/transport/start/route.ts',
    ]) {
      expect(read(f), f).toContain('patientIdentifier(');
    }
  });
});

describe('NUMBER_KIND_LABEL', () => {
  it('names both kinds the way the hospital does', () => {
    expect(NUMBER_KIND_LABEL.folder).toBe('Folder number');
    expect(NUMBER_KIND_LABEL.pt).toBe('PT number');
  });
});
