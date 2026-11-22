/**
 * The day's unreviewed list, written to the Head of Anaesthesia.
 *
 * The board chases one case at a time at the person named on it. That is right
 * for one registrar who forgot and wrong for what the board usually shows the
 * evening before a list: seven cases, no reviews, a different name against
 * each. Chasing seven people one at a time puts the department's problem to
 * seven individuals and never to the person who can move the rota.
 *
 * Two things are tested harder than the rest. A case an anaesthetist ATTENDED
 * and found empty must never be listed among the defaults — somebody did
 * exactly what was asked of them, and misnaming that is how a board loses the
 * people it depends on. And a case with nobody named at all must be visible as
 * such, because it is a hole in the rota that no chase can land in.
 *
 * The names below are invented. Real staff names stay out of the repository.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildHodBriefing,
  briefingProblem,
  briefingSummary,
  caseLine,
  isUnreviewed,
  attendedNotInWard,
  longDay,
  responsibleFor,
  splitForBriefing,
  type BriefCase,
} from '../../src/lib/anaesthesia/hodBriefing';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const c = (over: Partial<BriefCase> = {}): BriefCase => ({
  patientName: 'Test Patient One',
  folderNumber: '000111',
  procedureName: 'Abdominal myomectomy',
  scheduledTime: '09:00',
  unit: 'O&G Firm 2',
  surgeonName: 'Dr A. Surgeon',
  state: 'AWAITING',
  reviewers: [{ name: 'Dr B. Registrar', grade: 'SENIOR_REGISTRAR' }],
  ...over,
});

describe('which cases count as unreviewed', () => {
  it('counts the four states in which no review exists', () => {
    expect(isUnreviewed('AWAITING')).toBe(true);
    expect(isUnreviewed('AWAITING_REASSIGNMENT')).toBe(true);
    expect(isUnreviewed('HANDBACK_WINDOW_CLOSED')).toBe(true);
    expect(isUnreviewed('LAPSED')).toBe(true);
  });

  it('leaves out the reviewed and the settled', () => {
    expect(isUnreviewed('REVIEWED')).toBe(false);
    expect(isUnreviewed('SETTLED')).toBe(false);
  });

  it('keeps an attended ward visit OUT of the defaults', () => {
    // An anaesthetist walked to the ward and the patient was not in it. That
    // is a finding against the list, not against the department, and burying
    // it among defaults misnames somebody who did what was asked.
    expect(isUnreviewed('PATIENT_NOT_IN_WARD')).toBe(false);
    expect(attendedNotInWard('PATIENT_NOT_IN_WARD')).toBe(true);
  });

  it('splits the two apart', () => {
    const split = splitForBriefing([
      c(), c({ state: 'REVIEWED' }), c({ state: 'PATIENT_NOT_IN_WARD' }), c({ state: 'LAPSED' }),
    ]);
    expect(split.unreviewed).toHaveLength(2);
    expect(split.attended).toHaveLength(1);
  });
});

describe('who answers for a case', () => {
  it('names the rostered reviewer with their grade', () => {
    expect(responsibleFor(c())).toBe('Dr B. Registrar (senior registrar)');
  });

  it('names both when two are expected', () => {
    const s = responsibleFor(c({
      reviewers: [
        { name: 'Dr B. Registrar', grade: 'SENIOR_REGISTRAR' },
        { name: 'Dr C. Junior', grade: 'REGISTRAR' },
      ],
    }));
    expect(s).toContain('Dr B. Registrar');
    expect(s).toContain('and Dr C. Junior');
  });

  it('lets a reassignment outrank the roster', () => {
    // Writing to a head of department about a decision they themselves made,
    // naming the people they moved it away from, is worse than not writing.
    const s = responsibleFor(c({ reassignedToName: 'Dr D. Replacement' }));
    expect(s).toBe('Dr D. Replacement (reassigned)');
  });

  it('says plainly when nobody is named', () => {
    // The worst row on the board and the easiest to miss: no chase can land
    // anywhere and no deadline can be recorded against anybody.
    expect(responsibleFor(c({ reviewers: [] }))).toContain('NOBODY NAMED');
  });
});

describe('refusing to send', () => {
  it('refuses a day where every case has a review', () => {
    const p = briefingProblem([c({ state: 'REVIEWED' }), c({ state: 'REVIEWED' })]);
    expect(p).toContain('Every case on this list has a review');
  });

  it('refuses a day with no cases at all', () => {
    expect(briefingProblem([])).toContain('no cases listed');
  });

  it('refuses when the only gaps are ward absences', () => {
    // Nobody has defaulted, and the surgical teams were written to when the
    // absence was recorded. A letter to the HOD here would be an accusation
    // with no subject.
    const p = briefingProblem([c({ state: 'PATIENT_NOT_IN_WARD' })]);
    expect(p).toContain('findings against the list');
  });

  it('allows it when something really is unreviewed', () => {
    expect(briefingProblem([c(), c({ state: 'REVIEWED' })])).toBeNull();
  });
});

describe('the message', () => {
  const msg = buildHodBriefing({
    day: '2026-11-23',
    handbackBy: new Date(2026, 10, 22, 19, 0),
    reviewBy: new Date(2026, 10, 22, 21, 0),
    cases: [c(), c({ state: 'LAPSED', patientName: 'Test Patient Two', reviewers: [] }), c({ state: 'REVIEWED' })],
    hodName: 'Prof E. Head',
    senderName: 'Super Administrator',
    now: new Date(2026, 10, 22, 22, 15),
  });

  it('addresses the head of department by name', () => {
    expect(msg).toContain('Dear Prof E. Head,');
  });

  it('counts only the unreviewed, against the whole list', () => {
    expect(msg).toContain('2 of the 3 cases listed for Monday 23 November 2026');
  });

  it('names each case and who was expected to review it', () => {
    expect(msg).toContain('Test Patient One');
    expect(msg).toContain('Expected reviewer: Dr B. Registrar (senior registrar)');
    expect(msg).toContain('NOBODY NAMED');
  });

  it('marks the one that missed the deadline as having missed it', () => {
    expect(msg).toContain('MISSED THE 21:00 DEADLINE');
  });

  it('states the policy the head is being asked to act under', () => {
    expect(msg).toContain('hand-back window closed at 19:00');
    expect(msg).toContain('due by 21:00');
    expect(msg).toContain('recorded against the person named to it');
  });

  it('says the thing nobody outside theatre sees coming', () => {
    // A missing review stops the pharmacy and the pack provider working at
    // all, and the ban on paper prescriptions means there is no way round it
    // on the morning.
    expect(msg).toContain('banned paper prescriptions');
    expect(msg).toContain('theatre pharmacy has nothing to dispense against');
    expect(msg).toContain('consumable pack provider has nothing to pack');
    expect(msg).toContain('paper is no longer permitted');
  });

  it('ends with something to do, not only something to feel', () => {
    expect(msg).toContain('Please name or reassign a reviewer');
    expect(msg).toContain('/dashboard/preop-reviews/watch');
  });

  it('signs itself', () => {
    expect(msg).toContain('— Super Administrator, Theatre Management');
  });

  it('does not list a reviewed case among the defaults', () => {
    const body = msg.slice(msg.indexOf('CASES WITHOUT A REVIEW'), msg.indexOf('WHERE THIS STANDS'));
    expect(body.match(/Expected reviewer:/g)).toHaveLength(2);
  });
});

describe('an attended ward visit in the message', () => {
  const msg = buildHodBriefing({
    day: '2026-11-23',
    cases: [c(), c({
      state: 'PATIENT_NOT_IN_WARD',
      patientName: 'Test Patient Three',
      patientAbsentByName: 'Dr F. Attended',
      patientAbsentReason: 'not yet admitted',
    })],
    now: new Date(2026, 10, 22, 22, 15),
  });

  it('gives it its own heading and says it is not a default', () => {
    expect(msg).toContain('ATTENDED — PATIENT NOT IN THE WARD');
    expect(msg).toContain('These are not defaults');
  });

  it('records who went and what they found', () => {
    expect(msg).toContain('Dr F. Attended');
    expect(msg).toContain('not yet admitted');
  });

  it('still only counts the real defaults in the opening line', () => {
    expect(msg).toContain('1 of the 2 cases');
  });
});

describe('a head of department nobody has named', () => {
  it('still writes a usable letter', () => {
    const msg = buildHodBriefing({ day: '2026-11-23', cases: [c()], hodName: null });
    expect(msg).toContain('Dear Head of Anaesthesia,');
  });
});

describe('dates and times', () => {
  it('composes the day from local parts rather than a locale', () => {
    // This machine and the theatre server are both WAT but print differently,
    // and a date that reads one way on the board and another in the HOD's
    // WhatsApp is what the next morning's argument turns on.
    expect(longDay('2026-11-23')).toBe('Monday 23 November 2026');
  });

  it('leaves an unreadable day alone rather than inventing one', () => {
    expect(longDay('tomorrow')).toBe('tomorrow');
  });

  it('falls back to the stated deadlines when none are given', () => {
    const msg = buildHodBriefing({ day: '2026-11-23', cases: [c()] });
    expect(msg).toContain('19:00');
    expect(msg).toContain('21:00');
  });
});

describe('the line each case gets', () => {
  it('leads with the time and the unit, which is how a list is read', () => {
    expect(caseLine(c(), 0)).toContain('1. 09:00 · O&G Firm 2');
  });

  it('copes with a case that has no time on it', () => {
    expect(caseLine(c({ scheduledTime: null }), 0)).toContain('(no time)');
  });

  it('carries the hand-back reason when there was one', () => {
    const line = caseLine(c({
      state: 'AWAITING_REASSIGNMENT', handedBackReason: 'on call elsewhere',
    }), 0);
    expect(line).toContain('Handed back: on call elsewhere');
  });
});

describe('the summary under the button', () => {
  it('says what is about to be sent', () => {
    const s = briefingSummary([c(), c({ state: 'LAPSED' }), c({ state: 'REVIEWED' })]);
    expect(s).toContain('2 cases with no review');
  });

  it('calls out the rota holes separately', () => {
    expect(briefingSummary([c({ reviewers: [] })])).toContain('nobody named to review it');
  });

  it('says so when there is nothing to send', () => {
    expect(briefingSummary([c({ state: 'REVIEWED' })])).toBe('Every case has a review.');
  });
});

describe('how the board and the briefing stay in step', () => {
  it('builds the board once and reads it twice', () => {
    // The only thing worse than a board that is wrong is a briefing to the
    // head of department that disagrees with the board it was sent from.
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    expect(route).toContain('async function boardFor(');
    expect(route.match(/await boardFor\(/g)?.length).toBe(2);
  });

  it('recomputes the list on the server rather than trusting the browser', () => {
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    const at = route.indexOf("action === 'brief-hod'");
    expect(at).toBeGreaterThan(-1);
    expect(route.slice(at, at + 3000)).toContain('await boardFor(briefDay');
  });

  it('names the post through the one route that changes a role', () => {
    // A second role-writing path would be a second copy of the ADMIN-only
    // rule, the self-change refusal and the audit row to keep in step.
    const page = read('src/app/dashboard/preop-reviews/watch/page.tsx');
    expect(page).toContain('/api/users/${chosen.id}');
    expect(page).toContain("role: 'HEAD_OF_ANAESTHESIA'");
  });

  it('says out loud when nobody holds the post', () => {
    const route = read('src/app/api/preop-reviews/watch/route.ts');
    expect(route).toContain('noHod');
    expect(route).toContain('reached no inbox');
  });
});
