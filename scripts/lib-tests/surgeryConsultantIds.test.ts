import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  consultantIdsOf,
  consultantNamesOf,
  consultantsOf,
  isSupervisingConsultant,
} from '../../src/lib/surgery/consultantIds';

// Real values, read out of the live theatre database. 161 of 1,264 cases hold
// a list in this column, and these are the shapes that were actually there.
const TWO = '2b14880f-a236-4afa-9497-770933690842,fb83e182-5bc5-4e99-baa2-084db36ad184';
const ONE = '3b4a672e-c115-4584-82ac-aca88fc9fedf';
const FOUR = [
  'e7bafee1-005e-4a82-8806-acc3e44994b8',
  '17c2bbbc-b7f5-40ca-ad85-513cea1819b1',
  'f53d1b62-3f8c-431d-bdc4-04e7b1375444',
  'f14c2881-8b64-4fb1-ac83-12569a3a75bf',
].join(',');

describe('Surgery.supervisingConsultantId is a list', () => {
  it('reads the two-consultant case that broke the late-booking chase', () => {
    // Ortho Unit II. Handing this whole string to Notification.userId, which
    // carries a foreign key, is what produced "The server could not complete
    // this" on every attempt, forever.
    expect(consultantIdsOf(TWO)).toEqual([
      '2b14880f-a236-4afa-9497-770933690842',
      'fb83e182-5bc5-4e99-baa2-084db36ad184',
    ]);
  });

  it('reads a single id unchanged, so callers need no special case', () => {
    expect(consultantIdsOf(ONE)).toEqual([ONE]);
  });

  it('reads four', () => {
    expect(consultantIdsOf(FOUR)).toHaveLength(4);
  });

  it('is empty rather than noisy when there is nothing there', () => {
    expect(consultantIdsOf(null)).toEqual([]);
    expect(consultantIdsOf(undefined)).toEqual([]);
    expect(consultantIdsOf('')).toEqual([]);
    expect(consultantIdsOf('   ')).toEqual([]);
    expect(consultantIdsOf(',,,')).toEqual([]);
  });

  it('drops anything that is not id-shaped', () => {
    // Some rows hold a name where an id belongs. Passing that to a WHERE
    // clause asks the database about a person who does not exist.
    expect(consultantIdsOf('Nwankwo Emmanuel')).toEqual([]);
    expect(consultantIdsOf(`${ONE},Nwankwo Emmanuel`)).toEqual([ONE]);
  });

  it('tolerates spacing and does not repeat an id', () => {
    expect(consultantIdsOf(` ${ONE} , ${ONE} `)).toEqual([ONE]);
  });

  it('answers "is this consultant on the case" for a shared unit', () => {
    // `surgery.supervisingConsultantId === userId` is false for EVERY
    // consultant on a two-consultant unit. That is the silent half of this
    // bug: a consultant simply never sees his own case.
    expect(TWO === 'fb83e182-5bc5-4e99-baa2-084db36ad184').toBe(false);
    expect(isSupervisingConsultant(TWO, 'fb83e182-5bc5-4e99-baa2-084db36ad184')).toBe(true);
    expect(isSupervisingConsultant(TWO, '2b14880f-a236-4afa-9497-770933690842')).toBe(true);
    expect(isSupervisingConsultant(TWO, ONE)).toBe(false);
    expect(isSupervisingConsultant(TWO, null)).toBe(false);
    expect(isSupervisingConsultant(null, ONE)).toBe(false);
  });
});

describe('pairing the ids with the names', () => {
  it('pairs them when the two lists agree', () => {
    const out = consultantsOf(TWO, 'Nwankwo Emmanuel,Okwara Blasius Okechukwu');
    expect(out).toEqual([
      { id: '2b14880f-a236-4afa-9497-770933690842', name: 'Nwankwo Emmanuel' },
      { id: 'fb83e182-5bc5-4e99-baa2-084db36ad184', name: 'Okwara Blasius Okechukwu' },
    ]);
  });

  it('drops the names rather than misattributing them when they disagree', () => {
    // A name containing a comma splits into two and the lists come out
    // different lengths. "Chigbu, Chibuike O." is a real example from this
    // database. A misaligned name is worse than none: it would put one
    // consultant's name against another consultant's id.
    const out = consultantsOf(TWO, 'Chigbu, Chibuike O.,Ifebi Okechukwu Chidiebere');
    expect(out.map((c) => c.name)).toEqual([null, null]);
    expect(out.map((c) => c.id)).toHaveLength(2);
  });

  it('reads the names list as written', () => {
    expect(consultantNamesOf('A, B ,C')).toEqual(['A', 'B', 'C']);
    expect(consultantNamesOf(null)).toEqual([]);
  });
});

describe('the late-booking chase no longer writes an unchecked id', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'src/app/api/late-bookings/chase/route.ts'),
    'utf8',
  );

  it('parses the consultant field instead of using it whole', () => {
    expect(route).toContain('consultantIdsOf(surgery.supervisingConsultantId)');
    // The exact line that threw: a list handed to a foreign key.
    expect(route).not.toMatch(/userId:\s*surgery\.supervisingConsultantId/);
  });

  it('checks every notification recipient exists first', () => {
    // bookedById and supervisingConsultantId have no foreign key of their
    // own; Notification.userId has one. Something has to check.
    expect(route).toContain('realConsultants');
    expect(route).toMatch(/const booker = surgery\.bookedById/);
    expect(route).not.toMatch(/userId:\s*surgery\.bookedById/);
  });

  it('writes everything in one transaction, offence row first', () => {
    // The dialog tells the operator "Nothing was saved, so pressing again is
    // safe". That has to be TRUE, or a retry issues a second formal
    // disciplinary query with a new reference number to a named clinician.
    const tx = route.indexOf('prisma.$transaction');
    const offenceCreate = route.indexOf('tx.lateBookingOffence.create');
    const queryCreate = route.indexOf('tx.disciplinaryQuery.create');
    expect(tx).toBeGreaterThan(-1);
    expect(offenceCreate).toBeGreaterThan(tx);
    // The offence is the guard: it must be written before the query that
    // depends on the ladder position it establishes.
    expect(offenceCreate).toBeLessThan(queryCreate);
  });

  it('keeps comms outside the transaction', () => {
    // An offence recorded whose WhatsApp did not go out is a true row. A
    // WhatsApp sent for an offence that was rolled back is a warning for an
    // event the system denies happened.
    const txStart = route.indexOf('prisma.$transaction');
    const txEnd = route.indexOf('// -- The message itself');
    expect(txEnd).toBeGreaterThan(txStart);
    expect(route.slice(txStart, txEnd)).not.toContain('queueMessage');
    expect(route.indexOf('queueMessage(')).toBeGreaterThan(txEnd);
  });

  it('notifies every supervising consultant, not just the first', () => {
    expect(route).toContain('realConsultants.length');
    expect(route).toContain('consultantsNotified');
  });

  it('stops the catch-all from swallowing the cause', () => {
    // For months every failure became the same five words with a Try again
    // button that could never work.
    expect(route).toMatch(/P2002/);
    expect(route).toMatch(/P2003/);
    expect(route).toMatch(/code \?\? ''/);
    // And a duplicate press reports success rather than a server error.
    expect(route).toContain('alreadyRecorded: true');
  });

  it('keeps the whole list on the offence record', () => {
    // Truncating consultantId to the first id would quietly drop the others
    // from the record of who was told.
    expect(route).toContain('consultantId: surgery.supervisingConsultantId');
  });
});

describe('nowhere treats the column as a single id any more', () => {
  // A GUARD, NOT A STYLE RULE. Each pattern below is a live defect:
  // `{ supervisingConsultantId: userId }` silently matches nothing on a
  // shared unit, and writing the raw value where a user id is expected
  // throws against Notification's foreign key. They were spread over eleven
  // files and it took a crash report from theatre to find them.
  const SRC = join(__dirname, '..', '..', 'src');

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(full));
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };

  // The helper itself quotes the patterns it replaces, so it is exempt.
  //
  // Read ONCE, here, not inside each test. Scanning 1,090 files three times
  // over took over five seconds under the full suite's parallel load and the
  // tests timed out -- a guard that fails when the machine is busy teaches
  // people to ignore it.
  const sources = walk(SRC)
    .filter((f) => !f.endsWith(join('surgery', 'consultantIds.ts')))
    .map((f) => ({ name: f.slice(SRC.length + 1), text: readFileSync(f, 'utf8') }));
  const offenders = (re: RegExp) =>
    sources.filter((f) => re.test(f.text)).map((f) => f.name);

  const EQUALITY_FILTER = /supervisingConsultantId:\s*userId[\s,}]/;
  const TRIPLE_EQUALS = /supervisingConsultantId\s*===|===\s*\w+\.supervisingConsultantId/;
  const RAW_AS_USER_ID = /userId:\s*\w+\.supervisingConsultantId[\s,}]/;

  it('has regexes that actually match the thing they forbid', () => {
    // A guard that cannot fail is worse than none, and the first version of
    // this one could not: a stray control character where a word boundary
    // was meant made every pattern unmatchable, and it passed against a
    // deliberate violation. These three lines are the positive control.
    expect(EQUALITY_FILTER.test('OR: [{ supervisingConsultantId: userId },]')).toBe(true);
    expect(TRIPLE_EQUALS.test('if (surgery.supervisingConsultantId === userId)')).toBe(true);
    expect(RAW_AS_USER_ID.test('{ userId: s.supervisingConsultantId, role: 1 }')).toBe(true);
  });

  it('never filters Prisma on supervisingConsultantId by equality', () => {
    expect(offenders(EQUALITY_FILTER)).toEqual([]);
  });

  it('never compares it with ===', () => {
    expect(offenders(TRIPLE_EQUALS)).toEqual([]);
  });

  it('never writes the raw value where a single user id is expected', () => {
    expect(offenders(RAW_AS_USER_ID)).toEqual([]);
  });
});
