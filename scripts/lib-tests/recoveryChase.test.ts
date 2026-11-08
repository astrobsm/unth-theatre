// Chasing the recovery records that were never written.
//
// Two things are being proved here, and the second matters as much as the
// first.
//
// THE DETECTION: a case is only reported once its grace period has passed, a
// death in theatre raises nothing at all, and the two gaps are states of one
// record in sequence rather than two independent findings.
//
// THE WORDING: this message carries a medicolegal warning to somebody who
// probably gave good care. It must separate the care from the record BEFORE it
// warns, it must never allege that the care was not given, and it must not
// cite law it cannot stand behind. Those are properties of the text, so they
// are asserted against the text.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RECOVERY_GAPS, RECOVERY_GAP_CODES, RECORD_DUE_MINUTES,
  recoveryGaps, recordDueAt, dischargeDueAt, hoursOpen, accountableMoment,
  recoveryGapWords, type CaseForRecoveryGaps,
} from '../../src/lib/recoveryChase/gaps';
import {
  buildRecoveryChase, recoveryHeadline, dayWords, patientWords, caseLine,
  gapsPresent, PAPER_IS_NOT_ENOUGH, MAX_CASES_LISTED,
} from '../../src/lib/recoveryChase/messages';
import {
  RECOVERY_VIEW_ROLES, RECOVERY_SEND_ROLES, shiftDay, isDayString,
} from '../../src/lib/recoveryChase/access';
import { recoveryChaseLink, RECOVERY_CHASE_TYPE } from '../../src/lib/recoveryChase/notify';
import type { RecoveryChaseCase } from '../../src/lib/recoveryChase/collect';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const BOARD = 'src/app/api/recovery-chase/route.ts';
const SEND = 'src/app/api/recovery-chase/send/route.ts';
const PAGE = 'src/app/dashboard/recovery-chase/page.tsx';
const COLLECT = 'src/lib/recoveryChase/collect.ts';

/** 10:00 WAT on 3 November 2026, as a UTC instant. */
const wat = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 3, h - 1, m));

const baseCase = (over: Partial<CaseForRecoveryGaps> = {}): CaseForRecoveryGaps => ({
  scheduledDay: '2026-11-03',
  leftTheatreAt: wat(12, 0),
  recovery: null,
  diedInTheatre: false,
  ...over,
});

const chaseCase = (over: Partial<RecoveryChaseCase> = {}): RecoveryChaseCase => ({
  id: 'case-a',
  patientName: 'Patient A',
  folderNumber: 'PT000001',
  procedureName: 'Inguinal hernia repair',
  unit: 'General Surgery',
  scheduledDay: '2026-11-03',
  scheduledTime: '09:00',
  gaps: ['NO_RECOVERY_RECORD'],
  hoursOpen: null,
  openedClock: null,
  needICU: false,
  receivedByName: null,
  receivedById: null,
  coveringShifts: ['MORNING', 'CALL'],
  ...over,
});

describe('when a missing recovery record becomes a finding', () => {
  it('says nothing while the patient could still be on the trolley', () => {
    const c = baseCase();
    // 29 minutes after the patient left theatre.
    expect(recoveryGaps(c, wat(12, 29))).toEqual([]);
  });

  it('reports it once the thirty minutes have passed', () => {
    const c = baseCase();
    expect(recoveryGaps(c, wat(12, 30))).toEqual(['NO_RECOVERY_RECORD']);
    expect(recoveryGaps(c, wat(17, 0))).toEqual(['NO_RECOVERY_RECORD']);
  });

  it('uses the same thirty minutes duty performance judges the admission on', () => {
    expect(RECORD_DUE_MINUTES).toBe(30);
    expect(read('src/lib/dutyPerformance/collect.ts')).toContain('30 * 60_000');
  });

  it('waits for the day to end where no theatre end time was recorded', () => {
    const c = baseCase({ leftTheatreAt: null });
    // Mid-afternoon on the day itself: nothing, because there is no deadline
    // to measure against and guessing one would chase somebody on a guess.
    expect(recoveryGaps(c, wat(15, 0))).toEqual([]);
    // Once the WAT day has ended, it stands.
    expect(recoveryGaps(c, new Date(Date.UTC(2026, 10, 4, 1, 0)))).toEqual(['NO_RECOVERY_RECORD']);
  });

  it('puts the deadline exactly thirty minutes on, and counts the boundary', () => {
    const c = baseCase();
    expect(recordDueAt(c).toISOString()).toBe(wat(12, 30).toISOString());
    expect(recoveryGaps(c, recordDueAt(c))).toEqual(['NO_RECOVERY_RECORD']);
  });
});

describe('when an unclosed record becomes a finding', () => {
  const open = baseCase({
    recovery: {
      admissionTime: wat(12, 20), dischargeTime: null,
      createdAt: wat(12, 25), receivedBy: 'nurse-1',
    },
  });

  it('says nothing while the day the patient was received is still running', () => {
    expect(recoveryGaps(open, wat(23, 0))).toEqual([]);
  });

  it('reports it once that day has ended', () => {
    expect(recoveryGaps(open, new Date(Date.UTC(2026, 10, 3, 23, 0)))).toEqual(['NOT_DISCHARGED']);
  });

  it('raises nothing at all once the record is closed', () => {
    const closed = baseCase({
      recovery: {
        admissionTime: wat(12, 20), dischargeTime: wat(14, 0),
        createdAt: wat(12, 25), receivedBy: 'nurse-1',
      },
    });
    expect(recoveryGaps(closed, new Date(Date.UTC(2027, 0, 1)))).toEqual([]);
  });

  it('counts how long the record has stood open, and only while it is open', () => {
    expect(hoursOpen(open, wat(20, 20))).toBe(8);
    expect(hoursOpen(baseCase(), wat(20, 0))).toBeNull();
  });

  it('has no discharge deadline where there is no record to close', () => {
    expect(dischargeDueAt(baseCase())).toBeNull();
  });
});

describe('the two things that must never be chased', () => {
  it('raises nothing against a patient who died in theatre', () => {
    const dead = baseCase({ diedInTheatre: true });
    expect(recoveryGaps(dead, new Date(Date.UTC(2027, 0, 1)))).toEqual([]);

    // And not even when the record was also left open, which is the shape a
    // death during recovery leaves behind.
    const deadAndOpen = baseCase({
      diedInTheatre: true,
      recovery: {
        admissionTime: wat(12, 20), dischargeTime: null,
        createdAt: wat(12, 25), receivedBy: 'nurse-1',
      },
    });
    expect(recoveryGaps(deadAndOpen, new Date(Date.UTC(2027, 0, 1)))).toEqual([]);
  });

  it('never raises both codes for one record', () => {
    const late = new Date(Date.UTC(2027, 0, 1));
    [
      baseCase(),
      baseCase({
        recovery: {
          admissionTime: wat(12, 20), dischargeTime: null,
          createdAt: wat(12, 25), receivedBy: null,
        },
      }),
    ].forEach((c) => expect(recoveryGaps(c, late).length).toBeLessThanOrEqual(1));
  });

  it('does NOT drop a case booked for ICU, because nothing records that it went', () => {
    // The decision documented in gaps.ts: an ICU-flagged case is still listed,
    // with the flag carried, because dropping them all would hide real gaps.
    const icu = baseCase({ needICU: true });
    expect(recoveryGaps(icu, wat(13, 0))).toEqual(['NO_RECOVERY_RECORD']);
  });
});

describe('who answers for the case', () => {
  it('reads the shift from the hour the patient was in recovery', () => {
    const evening = baseCase({
      leftTheatreAt: wat(8, 0),
      recovery: {
        admissionTime: wat(19, 40), dischargeTime: null,
        createdAt: wat(19, 45), receivedBy: 'nurse-1',
      },
    });
    expect(accountableMoment(evening).toISOString()).toBe(wat(19, 40).toISOString());
  });

  it('falls back to the theatre end time, then to the start of the day', () => {
    expect(accountableMoment(baseCase()).toISOString()).toBe(wat(12, 0).toISOString());
    const nothing = baseCase({ leftTheatreAt: null });
    expect(accountableMoment(nothing).toISOString())
      .toBe(new Date(Date.UTC(2026, 10, 2, 23, 0)).toISOString());
  });

  it('matches a person to the cases their own shift covers, and no others', () => {
    // The rule the collector applies. A supervisor must not receive a letter
    // about a patient who was in recovery on somebody else's shift.
    const src = read(COLLECT);
    expect(src).toContain('c.coveringShifts.indexOf(shift) !== -1');
    expect(src).toContain('bucket.unmatched');
  });
});

describe('the gap catalogue', () => {
  it('describes every code once, with all four parts filled in', () => {
    expect(RECOVERY_GAP_CODES).toEqual(['NO_RECOVERY_RECORD', 'NOT_DISCHARGED']);
    RECOVERY_GAP_CODES.forEach((code) => {
      const d = RECOVERY_GAPS[code];
      expect(d.code).toBe(code);
      expect(d.label.trim().length).toBeGreaterThan(8);
      expect(d.short.trim().length).toBeGreaterThan(20);
      // The prose IS the message. An empty or stubbed paragraph would ship a
      // chase with a heading and nothing behind it, which is the one failure
      // mode a reader would notice before the recipient did.
      [d.missing, d.medicolegal, d.fix].forEach((part) => {
        expect(part.trim().length).toBeGreaterThan(80);
      });
    });
  });

  it('cites no statute, section or regulation it would have to defend', () => {
    // The decision in gaps.ts: the warning is specific about what is ABSENT,
    // never about what law says. A citation is easier to write and far easier
    // to dismiss, and if it were slightly wrong the whole message would go
    // with it.
    RECOVERY_GAP_CODES.forEach((code) => {
      const text = RECOVERY_GAPS[code].medicolegal;
      expect(text).not.toMatch(/section\s+\d/i);
      expect(text).not.toMatch(/\bAct\s+(of\s+)?\d{4}/i);
      expect(text).not.toMatch(/\bregulation\s+\d/i);
    });
  });

  it('keeps ORM capitalised when a label is lowered into a sentence', () => {
    expect(recoveryGapWords('NO_RECOVERY_RECORD')).toBe('no recovery record');
    expect(recoveryGapWords('NOT_DISCHARGED')).toBe('never discharged from recovery');
  });
});

describe('the message', () => {
  const build = (over: Parameters<typeof buildRecoveryChase>[0] | null = null) =>
    buildRecoveryChase(over ?? {
      personName: 'Sister A',
      roleLabel: 'Recovery Room Nurse',
      source: 'SUPERVISOR',
      shift: 'MORNING',
      day: '2026-11-03',
      completedCount: 9,
      cases: [chaseCase()],
    });

  it('names the patient and the folder number', () => {
    const text = build();
    expect(text).toContain('Patient A (PT000001)');
    expect(text).toContain('Inguinal hernia repair');
  });

  it('separates the care from the record BEFORE it warns about anything', () => {
    const text = build();
    const separation = text.indexOf('not a suggestion that the care was not given');
    const warning = text.indexOf('Why this matters');
    expect(separation).toBeGreaterThan(-1);
    expect(warning).toBeGreaterThan(-1);
    // A warning that arrives first is read as an accusation, and then nothing
    // after it is read at all.
    expect(separation).toBeLessThan(warning);
  });

  it('never alleges that the nurse failed to do anything', () => {
    const text = build().toLowerCase();
    ['you failed', 'you did not', 'you neglected', 'negligence'].forEach((phrase) => {
      expect(text).not.toContain(phrase);
    });
  });
});

describe('"even if it is on paper"', () => {
  it('answers the paper objection with reasons rather than with a rule', () => {
    const text = buildRecoveryChase({
      personName: 'Sister A',
      source: 'SUPERVISOR',
      shift: 'MORNING',
      day: '2026-11-03',
      completedCount: 9,
      cases: [chaseCase()],
    });
    // Three reasons, which is what was asked for: "even if they are on paper,
    // it must be documented on ORM" invites the reply that the observations
    // were charted properly, and that reply is usually true.
    expect(text).toContain('The ward cannot see it');
    expect(text).toContain('The hospital cannot produce it');
    expect(text).toContain('It is not credited to you');
    expect(PAPER_IS_NOT_ENOUGH.join(' ')).toContain('that is real nursing');
  });

  it('says plainly that paper is not a matter of preference', () => {
    expect(PAPER_IS_NOT_ENOUGH.join(' ')).toContain('not as a matter of preference');
  });
});

describe('the message in each register', () => {
  const of = (source: 'SUPERVISOR' | 'RECOVERY_NURSE' | 'RECORD_HOLDER') =>
    buildRecoveryChase({
      personName: 'Sister A',
      source,
      shift: 'NIGHT',
      day: '2026-11-03',
      completedCount: 4,
      cases: [chaseCase({
        gaps: ['NOT_DISCHARGED'], hoursOpen: 46, openedClock: '19:40',
        receivedByName: 'Sister A',
      })],
    });

  it('writes to a supervisor as a supervisor, not as the nurse who gave the care', () => {
    const text = of('SUPERVISOR');
    expect(text).toContain('nurse supervisor on duty');
    expect(text).toContain('as the supervisor rather than to any individual nurse');
  });

  it('tells the nurse who opened the record that it is still open', () => {
    const text = of('RECORD_HOLDER');
    expect(text).toContain('named on the ORM as the nurse who received');
    expect(text).not.toContain('nurse supervisor on duty');
  });

  it('names the rostered recovery nurse as rostered to recovery', () => {
    expect(of('RECOVERY_NURSE')).toContain('rostered to the recovery room');
  });

  it('offers ICU as the one answer that settles a case', () => {
    expect(of('SUPERVISOR')).toContain('never came to recovery at all');
  });

  it('carries the Wi-Fi notice every staff message carries', () => {
    expect(of('SUPERVISOR')).toContain('UNTH-THEATRE-ORM');
  });
});

describe('the small pieces the board reads', () => {
  it('says the day the way a duty day is said aloud', () => {
    expect(dayWords('2026-11-03')).toBe('Tuesday 3 November');
    expect(dayWords('not a day')).toBe('not a day');
  });

  it('names an unnamed patient without pretending to', () => {
    expect(patientWords(chaseCase({ patientName: null }))).toBe('a patient');
    expect(patientWords(chaseCase({ folderNumber: null }))).toBe('Patient A');
  });

  it('puts the hours an open record has stood on the case line', () => {
    const line = caseLine(chaseCase({
      gaps: ['NOT_DISCHARGED'], hoursOpen: 1709, openedClock: '19:40',
    }));
    expect(line).toContain('record open since 19:40');
    expect(line).toContain('1709 h');
  });

  it('marks an ICU-booked case on its own line', () => {
    expect(caseLine(chaseCase({ needICU: true }))).toContain('booked as needing ICU');
  });

  it('lists the gaps present in the canonical order', () => {
    expect(gapsPresent([
      chaseCase({ gaps: ['NOT_DISCHARGED'] }),
      chaseCase({ gaps: ['NO_RECOVERY_RECORD'] }),
    ])).toEqual(['NO_RECOVERY_RECORD', 'NOT_DISCHARGED']);
  });

  it('counts both kinds in the headline', () => {
    const h = recoveryHeadline([
      chaseCase({ gaps: ['NO_RECOVERY_RECORD'] }),
      chaseCase({ id: 'b', gaps: ['NOT_DISCHARGED'] }),
    ]);
    expect(h).toBe('2 cases: 1 with no recovery record, 1 never discharged');
  });

  it('stops naming patients past the cap and says how many are left', () => {
    const many = Array.from({ length: MAX_CASES_LISTED + 3 },
      (_, i) => chaseCase({ id: `c${i}` }));
    const text = buildRecoveryChase({
      personName: 'Sister A',
      source: 'SUPERVISOR',
      shift: 'MORNING',
      day: '2026-11-03',
      completedCount: 20,
      cases: many,
    });
    expect(text).toContain('and 3 more on the same day');
  });
});

describe('who may read it and who may send it', () => {
  it('lets every nurse who could supervise read the board', () => {
    ['RECOVERY_ROOM_NURSE', 'SCRUB_NURSE', 'INFECTION_CONTROL_NURSE']
      .forEach((r) => expect(RECOVERY_VIEW_ROLES as readonly string[]).toContain(r));
  });

  it('does NOT let one nurse send another a medicolegal warning', () => {
    ['RECOVERY_ROOM_NURSE', 'SCRUB_NURSE', 'INFECTION_CONTROL_NURSE', 'ANAESTHETIST']
      .forEach((r) => expect(RECOVERY_SEND_ROLES as readonly string[]).not.toContain(r));
  });

  it('keeps the senders a subset of the readers', () => {
    // Otherwise somebody could send a message from a board they cannot open,
    // and would be sending it unread.
    (RECOVERY_SEND_ROLES as readonly string[]).forEach((r) => {
      expect(RECOVERY_VIEW_ROLES as readonly string[]).toContain(r);
    });
  });

  it('gates both routes on those two lists and not on one', () => {
    expect(read(BOARD)).toContain('requireRole(RECOVERY_VIEW_ROLES as never)');
    expect(read(SEND)).toContain('requireRole(RECOVERY_SEND_ROLES as never)');
  });
});

describe('the send route cannot be talked into a false allegation', () => {
  const src = read(SEND);

  it('recomputes the gaps rather than believing the request', () => {
    expect(src).toContain('collectRecoveryGaps(day, day)');
    // The cases named in the letter come from the recomputed bucket, never
    // from the body. A letter alleging a record that was completed an hour ago
    // is read once, disproved, and nothing in this series is read again.
    expect(src).toContain('bucket.cases.filter((c) => recipient.caseIds.indexOf(c.id) !== -1)');
    expect(src).not.toMatch(/body\?\.(cases|caseIds|gaps)/);
  });

  it('refuses to send when the person has nothing outstanding', () => {
    expect(src).toContain('has nothing outstanding for');
    expect(src).toContain('{ status: 400 }');
  });

  it('refuses a day whose gaps are all on somebody else’s shift', () => {
    expect(src).toContain('none of them fall on this person');
  });

  it('will not send to an account that is not active', () => {
    expect(src).toContain("person.status !== 'APPROVED'");
  });

  it('does not send the same day twice', () => {
    expect(src).toContain('alreadySent: true');
    expect(src).toContain('type: RECOVERY_CHASE_TYPE, link');
  });

  it('audits every one it sends, because the warning goes on a record', () => {
    expect(src).toContain("action: 'RECOVERY_RECORD_CHASE_SENT'");
    expect(src).toContain('accountability: recipient.source');
  });

  it('files the notification against the person and the day', () => {
    expect(recoveryChaseLink('2026-11-03', 'u1'))
      .toBe('/dashboard/recovery-chase?day=2026-11-03&person=u1');
    // Keyed on the day: a second press about Tuesday is a duplicate, a message
    // about Wednesday is not.
    expect(recoveryChaseLink('2026-11-03', 'u1'))
      .not.toBe(recoveryChaseLink('2026-11-04', 'u1'));
    expect(RECOVERY_CHASE_TYPE).toBe('RECOVERY_RECORD_CHASE');
  });
});

describe('the board is honest about what it is not reporting', () => {
  it('carries the denominator and the mortalities it left out', () => {
    const src = read(BOARD);
    expect(src).toContain('completed: days.reduce');
    expect(src).toContain('mortalities: days.reduce');
  });

  it('counts the days on which there is nobody to write to', () => {
    expect(read(BOARD)).toContain('daysWithNobodyToWriteTo');
  });

  it('tells the reader on the page itself, not only in the code', () => {
    const page = read(PAGE);
    expect(page).toContain('mortality on file, not counted');
    expect(page).toContain('No nurse supervisor and no recovery nurse were on the published roster');
    expect(page).toContain('straight to ICU may genuinely never enter');
  });
});

describe('the window helpers', () => {
  it('shifts a day without letting a timezone cross a date', () => {
    expect(shiftDay('2026-11-03', -13)).toBe('2026-10-21');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('nonsense', -1)).toBe('nonsense');
  });

  it('accepts only a well-formed day', () => {
    expect(isDayString('2026-11-03')).toBe(true);
    expect(isDayString('2026-11-3')).toBe(false);
    expect(isDayString('')).toBe(false);
  });
});

describe('the pages are reachable and gated', () => {
  it('is registered as a module so access can be granted', () => {
    const mods = read('src/lib/modules.ts');
    expect(mods).toContain("id: 'recovery-chase'");
    expect(mods).toContain("paths: ['/dashboard/recovery-chase']");
  });

  it('is in the sidebar beside the recovery screen it reports on', () => {
    const layout = read('src/app/dashboard/layout.tsx');
    expect(layout).toContain("href: '/dashboard/recovery-chase'");
    expect(layout).toContain("{ type: 'single', href: '/dashboard/recovery-chase' }");
  });
});

describe('the bounds on the roster date column', () => {
  it('queries the @db.Date column with midnight UTC, not the WAT instant', () => {
    // The same off-by-one that silently dropped the last day of the setup
    // window. Here it would have read the roster for the wrong days and
    // reported a staffed shift as having nobody on it.
    const src = read(COLLECT);
    expect(src).toContain('date: { gte: dateColumn(from)!, lte: dateColumn(to)! }');
    expect(src).not.toContain('dateOnly(start)');
  });

  it('counts the days of the window inclusively', () => {
    // dayRange is what decides which day buckets exist at all.
    const src = read(COLLECT);
    expect(src).toContain('cursor.getTime() <= last');
  });
});
