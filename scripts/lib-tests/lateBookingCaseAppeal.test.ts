/**
 * The chase that reaches the consultant surgeon and the surgeon on the case.
 *
 * Asked for on 4 November:
 *
 *   "i want a chase whatapp message to be sent to the consultant surgeon and
 *    the surgeon that is in the case"
 *
 *   "when there are outstandings, the message will summarise all the cases
 *    booked for the day to appeal professionally"
 *
 * The ways this can be wrong, in order of how much damage they do:
 *
 *   telling a consultant that an offence is recorded against him when the
 *   ladder counts against the resident who entered the booking — he answers
 *   it as a disciplinary matter and we have turned a request for help into a
 *   dispute;
 *
 *   writing to the same person twice because the booker is also the surgeon,
 *   which reads as harassment and gets the third message ignored;
 *
 *   printing a heading over an empty list, which reads as a broken system;
 *
 *   and sending somebody to a page their role cannot open.
 *
 * No patient is named here. The cases are lettered and the folder numbers are
 * invented — a test fixture is not a place for a real folder number.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildCaseAppeal, daySummaryLines, groupByBooker,
} from '../../src/lib/lateBooking/caseAppeal';
import { buildChaseMessage, escalationFor } from '../../src/lib/lateBooking/escalation';
import { groupBy, type ChaseCase } from '../../src/lib/caseChase/collect';
import { MAX_CASES_LISTED } from '../../src/lib/caseChase/messages';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const CASE = (over: Partial<ChaseCase> = {}): ChaseCase => ({
  id: 'c1',
  procedureName: 'Exploratory laparotomy',
  scheduledDay: '2026-11-10',
  scheduledTime: '08:00',
  surgeryType: 'ELECTIVE',
  status: 'SCHEDULED',
  patientName: 'Patient A',
  folderNumber: 'PT-1',
  unit: 'GS Unit II',
  surgeonId: 's1',
  surgeonName: 'Dr Surgeon',
  consultantId: 'k1',
  consultantName: 'Prof Consultant',
  bookedById: 'r1',
  bookedByName: 'Dr Resident',
  gaps: ['CONSENT'],
  hoursLate: null,
  ...over,
});

/** The late case all three letters are written about. */
const TRIGGER = {
  id: 'late-1',
  patientLabel: 'Patient A (PT-1)',
  procedureName: 'Inguinal hernia repair',
  scheduledFor: '2026-11-10',
  bookedAtLabel: '9 Nov 2026, 7:40 PM',
  unit: 'GS Unit II',
  bookerName: 'Dr Resident',
  hoursLate: 19,
};

/** That day's list: the late case, plus two more of the same surgeon's. */
const DAY = [
  CASE({ id: 'late-1', gaps: ['LATE_BOOKING', 'CONSENT'] }),
  CASE({ id: 'c2', gaps: ['PRESCRIPTION'], patientName: 'Patient B', folderNumber: 'PT-2' }),
  CASE({
    id: 'c3',
    gaps: ['CONSENT', 'CONSUMABLES'],
    patientName: 'Patient C',
    folderNumber: 'PT-3',
    bookedByName: 'Dr Other',
    bookedById: 'r2',
  }),
];

const surgeonGroup = () => groupBy(DAY, (c) => ({ id: c.surgeonId, name: c.surgeonName }))
  .find((g) => g.personId === 's1') ?? null;

const consultantGroup = () => groupBy(DAY, (c) => ({ id: c.consultantId, name: c.consultantName }))
  .find((g) => g.personId === 'k1') ?? null;

const appeal = (over: Partial<Parameters<typeof buildCaseAppeal>[0]> = {}) => buildCaseAppeal({
  role: 'surgeon',
  personName: 'Dr Surgeon',
  roleLabel: 'Surgeon',
  unitLabel: 'GS Unit II',
  dayLabel: '10 Nov',
  trigger: TRIGGER,
  group: surgeonGroup(),
  decision: escalationFor(0),
  ...over,
});

describe('the letter to the surgeon on the case', () => {
  const msg = appeal();

  it('names the case it is about', () => {
    expect(msg).toContain('Inguinal hernia repair');
    expect(msg).toContain('Patient A (PT-1)');
    expect(msg).toContain('9 Nov 2026, 7:40 PM');
    expect(msg).toContain('GS Unit II');
  });

  it('quotes how late it was, as a figure they can check', () => {
    // "late" can be argued with. Nineteen hours past 15:30 cannot.
    expect(msg).toContain('19 hours');
  });

  it('says the record stands against the booker, not against the reader', () => {
    // THE MOST IMPORTANT LINE IN THE MESSAGE. A consultant or surgeon who
    // reads an offence number without being told whose it is will answer
    // this as a query against himself.
    expect(msg).toContain('Dr Resident');
    expect(msg).toMatch(/appeal, not a query/i);
    expect(msg).toMatch(/Nothing is recorded against you/i);
  });

  it('asks them to close what is outstanding themselves', () => {
    expect(msg).toMatch(/close what is outstanding/i);
    expect(msg).toContain('case screen');
  });

  it('does not hand them the consultant’s job of naming who booked what', () => {
    // "Entered by" is the one thing only a consultant can act on. In a
    // surgeon's letter it is a list of colleagues with nothing to do about.
    expect(msg).not.toContain('Entered by:');
  });

  it('carries the theatre network notice exactly once', () => {
    expect((msg.match(/THEATRE INTERNET/g) ?? []).length).toBe(1);
  });

  it('still names the escape route, so the policy is not punishment alone', () => {
    expect(msg).toContain('Theatre Manager');
    expect(msg).toContain('12 noon');
    expect(msg).toContain('1 November 2026');
  });
});

describe('the letter to the supervising consultant', () => {
  const msg = appeal({
    role: 'consultant',
    personName: 'Prof Consultant',
    roleLabel: 'Consultant Surgeon',
    group: consultantGroup(),
    byBooker: groupByBooker(DAY.filter((c) => c.id !== 'late-1')),
  });

  it('is headed with the unit, because that is what they answer for', () => {
    expect(msg).toContain('a late elective booking in GS Unit II');
  });

  it('asks for the one thing only they can do', () => {
    // A consultant cannot upload thirty consents. They can ask one registrar,
    // once, why four of theirs have none.
    expect(msg).toMatch(/raise it with your team on the round/i);
    expect(msg).toMatch(/expect it of them/i);
    // And it must not ask them to do the clerical work themselves.
    expect(msg).not.toMatch(/close what is outstanding/i);
  });

  it('names who entered the cases', () => {
    expect(msg).toContain('Entered by:');
    expect(msg).toContain('Dr Resident');
    expect(msg).toContain('Dr Other');
  });

  it('says nothing has been copied to anybody on their account', () => {
    expect(msg).toMatch(/nothing here has been copied to anybody on your account/i);
  });
});

describe("the day's outstanding cases, summarised", () => {
  const lines = daySummaryLines({
    dayLabel: '10 Nov',
    group: surgeonGroup(),
    whose: 'Your list',
    excludeCaseId: 'late-1',
  });
  const text = lines.join('\n');

  it('leaves out the case the letter is already about', () => {
    expect(text).not.toContain('PT-1');
    expect(text).toContain('PT-2');
    expect(text).toContain('PT-3');
  });

  it('counts each kind of gap', () => {
    expect(text).toContain('2 cases with something outstanding');
    expect(text).toContain('1 with no consent on the ORM');
    expect(text).toContain('1 with no pharmacy prescription');
    expect(text).toContain('1 with no consumable pack request');
  });

  it('names the cases rather than only counting them', () => {
    // A surgeon with three patients on one list cannot act on "your cases are
    // not ready": it fits all three equally badly.
    expect(text).toContain('Patient B');
    expect(text).toContain('Patient C');
    expect(text).toContain('Exploratory laparotomy');
  });

  it('says what each one needs', () => {
    expect(text).toContain('What each of these needs:');
    expect(text).toMatch(/upload the signed form|complete the consent form/i);
  });

  it('says "not on the ORM", never "not done"', () => {
    // A consent signed on paper is a real consent. Calling it missing will be
    // answered, correctly, by somebody telling us we are wrong.
    expect(text).toContain('no consent on the ORM');
    expect(text).not.toMatch(/consent not done|no consent taken/i);
  });

  it('stops listing after a readable number and says how many more', () => {
    const many = Array.from({ length: MAX_CASES_LISTED + 3 }, (_, i) => CASE({
      id: `m${i}`, patientName: `Patient ${i}`, folderNumber: `PT-${i}`,
    }));
    const long = daySummaryLines({
      dayLabel: '10 Nov',
      group: groupBy(many, (c) => ({ id: c.surgeonId, name: c.surgeonName }))[0],
      whose: 'Your list',
    }).join('\n');
    expect(long).toContain(`${3} more on the case list in the app`);
  });

  it('returns nothing at all when there is nothing else outstanding', () => {
    // A heading over an empty list reads as a fault in the system, and a
    // reader who finds one invented item stops believing the rest.
    const only = [CASE({ id: 'late-1' })];
    expect(daySummaryLines({
      dayLabel: '10 Nov',
      group: groupBy(only, (c) => ({ id: c.surgeonId, name: c.surgeonName }))[0],
      whose: 'Your list',
      excludeCaseId: 'late-1',
    })).toEqual([]);
    expect(daySummaryLines({ dayLabel: '10 Nov', group: null, whose: 'Your list' })).toEqual([]);
  });
});

describe('when the rest of the day is in order', () => {
  it('says so, instead of an empty heading', () => {
    const msg = appeal({
      group: groupBy([CASE({ id: 'late-1' })], (c) => ({ id: c.surgeonId, name: c.surgeonName }))[0],
    });
    expect(msg).toMatch(/is complete on the ORM/);
    expect(msg).not.toContain('The cases:');
  });
});

describe("the booker's own chase carries the day as well", () => {
  const base = {
    personName: 'Dr Resident',
    patientLabel: 'Patient A (PT-1)',
    procedureName: 'Inguinal hernia repair',
    scheduledFor: '2026-11-10',
    bookedAtLabel: '9 Nov 2026, 7:40 PM',
    unit: 'GS Unit II',
    decision: escalationFor(0),
  };

  it('includes the summary when one is passed', () => {
    const summary = daySummaryLines({
      dayLabel: '10 Nov',
      group: groupBy(DAY, (c) => ({ id: c.bookedById, name: c.bookedByName }))
        .find((g) => g.personId === 'r1') ?? null,
      whose: 'The cases you booked',
      excludeCaseId: 'late-1',
    });
    const msg = buildChaseMessage({ ...base, daySummary: summary });
    expect(msg).toContain('The cases you booked for 10 Nov');
    expect(msg).toContain('PT-2');
    // Before the reasoning, because the list is the part that can still be
    // acted on and the reasoning is the part a tired registrar skims.
    expect(msg.indexOf('The cases you booked for 10 Nov'))
      .toBeLessThan(msg.indexOf('Why we are asking'));
  });

  it('is unchanged when there is nothing else outstanding', () => {
    const msg = buildChaseMessage({ ...base, daySummary: [] });
    expect(msg).not.toContain('The cases you booked for');
    expect(msg).toContain('Inguinal hernia repair');
  });
});

describe('cases grouped by whoever entered them', () => {
  it('puts the heaviest booker first', () => {
    const g = groupByBooker([
      CASE({ id: 'a', bookedByName: 'Dr One' }),
      CASE({ id: 'b', bookedByName: 'Dr Two' }),
      CASE({ id: 'c', bookedByName: 'Dr Two' }),
    ]);
    expect(g[0].name).toBe('Dr Two');
    expect(g[0].cases).toHaveLength(2);
  });

  it('says when a booking cannot be traced to anybody', () => {
    // Filing it under the consultant would hide a problem of its own.
    const g = groupByBooker([CASE({ id: 'a', bookedByName: null })]);
    expect(g[0].name).toBe('Booker not recorded');
  });
});

describe('the chase route writes to all three', () => {
  const route = read('src/app/api/late-bookings/chase/route.ts');

  it('reads the operating surgeon off the case', () => {
    expect(route).toContain('surgeonId: true');
    expect(route).toContain("addAppeal(caseSurgeon, 'surgeon')");
  });

  it('writes to every supervising consultant, not just the first', () => {
    expect(route).toContain("realConsultants.forEach((c) => addAppeal(c, 'consultant'))");
    expect(route).toContain('consultantIdsOf(surgery.supervisingConsultantId)');
  });

  it('never writes to the same person twice', () => {
    // The booker is usually the surgeon too, and a consultant is sometimes
    // both. The booker's letter already carries their day.
    expect(route).toContain('if (written.has(u.id)) return;');
    expect(route).toContain('written.add(surgery.bookedById)');
  });

  it('reads the day once and groups it three ways', () => {
    expect(route).toContain('collectCasesWithGaps(operatingDay, operatingDay)');
    expect(route).toContain('const surgeonDay = groupBy(');
    expect(route).toContain('const consultantDay = groupBy(');
    expect(route).toContain('const bookerDay = groupBy(');
  });

  it('does not let a failed day summary cost the offence', () => {
    // The offence and the warning are the point; the summary is enrichment.
    expect(route).toMatch(/collectCasesWithGaps\(operatingDay, operatingDay\)\.catch/);
  });

  it('sends them to the case screen, not to the restricted report', () => {
    // The late-bookings board is theatre management and heads of department
    // only, so the old link opened a refusal page for the consultant it was
    // sent to. The head of department's copy still points there, because the
    // board is a page they can open -- so this looks at the loop, not at the
    // whole file.
    const loop = route.slice(route.indexOf('i < appealed.length'));
    expect(loop.slice(0, 700)).toContain('link: `/dashboard/surgeries/${surgery.id}`');
    expect(loop.slice(0, 700)).not.toContain('/dashboard/late-bookings?case=');
  });

  it('queues each letter under its own scope', () => {
    // One scope for three letters would have queueMessage treat two of them
    // as duplicates of the first and drop them.
    expect(route).toContain('scope: `${surgery.id}:${x.id}`');
    expect(route).toContain("channel: 'WHATSAPP' as never");
  });

  it('returns a wa.me hand-off for each one, because the queue is not a delivery', () => {
    expect(route).toContain('const handoffs:');
    expect(route).toContain('handoffs,');
  });

  it('stores the whole letter in the app, not a one-line notice', () => {
    expect(route).toContain('message: appealed[i].text');
  });
});

describe('the operator can see who is left to send to', () => {
  const page = read('src/app/dashboard/late-bookings/page.tsx');

  it('keeps every hand-off on screen', () => {
    expect(page).toContain('handoffs.map');
  });

  it('opens only the first, and says how many remain', () => {
    // Three window.open calls from one click are two blocked pop-ups, and the
    // operator would not know which of the three went out.
    expect(page).toContain('window.open(links[0].href');
    expect(page).toContain('more to send below');
  });
});
