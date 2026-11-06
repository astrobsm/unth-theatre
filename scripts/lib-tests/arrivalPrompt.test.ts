/**
 * Asking somebody, on arrival, whether they are here.
 *
 * Asked for on 6 November:
 *
 *   "when a user arrives at the hospital and opens logs in, if his name is
 *    on any booked case he gets a pop up to indicate his availability
 *    status (location must be accessible, if denied by the user, notify him
 *    that his availability status can not be ascertained and may be
 *    considered abscent"
 *
 * The ways this can go wrong, worst first:
 *
 *   A DIALOGUE THAT BLOCKS THE WORK. If a refused location stopped the
 *   answer being recorded, the result would not be better data: it would be
 *   no data, and a consultant who learned to close the app. That lesson is
 *   written into requestFix.ts and was paid for on the anaesthesia setup
 *   log. The warning is a warning; the answer is always saved.
 *
 *   A DIALOGUE EVERYBODY SEES. One that greets all two hundred staff every
 *   morning is dismissed unread within a week, and then it is useless on
 *   the morning it mattered. It must appear only for somebody on a case
 *   today who has not answered.
 *
 *   A WARNING THAT ACCUSES. "May be considered absent" is a fact about what
 *   the record can show, not a charge against the person — a theatre
 *   basement produces exactly the same silence as a refusal.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ARRIVAL_ANSWERS,
  answerFor,
  answerProblem,
  hasPosition,
  isArrivalAnswer,
  locationNotice,
  shouldPrompt,
  statusFor,
  storedReason,
  unanswered,
  type MyCase,
} from '../../src/lib/theatreOps/arrivalPrompt';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const caseOn = (over: Partial<MyCase> = {}): MyCase => ({
  kind: 'SURGERY', id: 'c1', label: 'Laparotomy at 09:00', myRole: 'Surgeon',
  myStatus: null, ...over,
});

describe('who gets asked', () => {
  it('asks nobody who is not on a case', () => {
    expect(shouldPrompt([])).toBe(false);
  });

  it('asks somebody with an unanswered case', () => {
    expect(shouldPrompt([caseOn()])).toBe(true);
  });

  it('stops asking once they have answered', () => {
    // Being stopped by the same dialogue on the next page is how a prompt
    // becomes something people dismiss without reading.
    expect(shouldPrompt([caseOn({ myStatus: 'PRESENT' })])).toBe(false);
  });

  it('asks only about the cases still unanswered', () => {
    const list = [caseOn(), caseOn({ id: 'c2', myStatus: 'EN_ROUTE' })];
    expect(unanswered(list).map((c) => c.id)).toEqual(['c1']);
  });
});

describe('the answers offered', () => {
  it('offers here, on my way, and not available', () => {
    expect(ARRIVAL_ANSWERS.map((a) => a.key)).toEqual(['HERE', 'ON_MY_WAY', 'NOT_AVAILABLE']);
  });

  it('speaks each table’s own language', () => {
    // Two vocabularies, built a year apart for different boards. Neither is
    // being rewritten for a pop-up.
    expect(statusFor('HERE', 'SURGERY')).toBe('PRESENT');
    expect(statusFor('HERE', 'EMERGENCY')).toBe('ARRIVED');
    expect(statusFor('ON_MY_WAY', 'SURGERY')).toBe('EN_ROUTE');
    expect(statusFor('ON_MY_WAY', 'EMERGENCY')).toBe('EN_ROUTE');
    expect(statusFor('NOT_AVAILABLE', 'SURGERY')).toBe('UNAVAILABLE');
    expect(statusFor('NOT_AVAILABLE', 'EMERGENCY')).toBe('UNAVAILABLE');
  });

  it('insists on a reason for not being available', () => {
    // "Unavailable" with no reason reads the same as silence to anybody
    // trying to plan around it, and the elective endpoint refuses it.
    expect(answerFor('NOT_AVAILABLE').needsReason).toBe(true);
    expect(answerProblem('NOT_AVAILABLE', '')).toContain('why');
    expect(answerProblem('NOT_AVAILABLE', 'Stuck in Enugu traffic')).toBeNull();
  });

  it('does not ask a reason of somebody who is here', () => {
    expect(answerProblem('HERE', '')).toBeNull();
  });

  it('refuses an answer it does not recognise', () => {
    expect(isArrivalAnswer('MAYBE')).toBe(false);
    expect(answerProblem(null, '')).toBe('Choose one.');
  });
});

describe('what the person is told about their location', () => {
  const GOOD = { latitude: 6.42, longitude: 7.49, accuracyM: 20, unavailableReason: null };
  const DENIED = {
    latitude: null, longitude: null, accuracyM: null,
    unavailableReason: 'Location permission denied on this handset',
  };

  it('knows whether a position arrived', () => {
    expect(hasPosition(GOOD)).toBe(true);
    expect(hasPosition(DENIED)).toBe(false);
    expect(hasPosition(null)).toBe(false);
  });

  it('says plainly that an unconfirmed answer may be read as absence', () => {
    const n = locationNotice(DENIED);
    expect(n.tone).toBe('warn');
    expect(n.detail).toContain('cannot be confirmed');
    expect(n.detail).toContain('may be treated as absence');
  });

  it('tells them the answer is still saved, and how to fix it', () => {
    // The warning must not read as a refusal, or the next thing somebody
    // does is close the app.
    const n = locationNotice(DENIED);
    expect(n.detail).toContain('can still record your status');
    expect(n.detail).toContain('allow it in your browser');
  });

  it('repeats the handset’s own reason, so the record is not guesswork', () => {
    expect(locationNotice(DENIED).detail).toContain('permission denied');
  });

  it('does not accuse anybody of being elsewhere', () => {
    const n = locationNotice(DENIED);
    expect(n.detail).not.toMatch(/absent\b(?!.*may)/i);
    expect(n.detail).not.toMatch(/you are not|lying|false/i);
  });

  it('is quiet and factual when the position arrived', () => {
    const n = locationNotice(GOOD);
    expect(n.tone).toBe('ok');
    expect(n.detail).toContain('not as a trail of where you have been');
  });

  it('stores why there was no position, and nothing when there was one', () => {
    expect(storedReason(GOOD)).toBeNull();
    expect(storedReason(DENIED)).toBe('Location permission denied on this handset');
    expect(storedReason({ latitude: null, longitude: null })).toBe('The handset gave no position.');
  });

  it('does not let a long reason run away with the column', () => {
    const long = { latitude: null, longitude: null, unavailableReason: 'x'.repeat(500) };
    expect((storedReason(long) ?? '').length).toBeLessThanOrEqual(200);
  });
});

describe('the endpoint and the dialogue', () => {
  const api = read('src/app/api/me/arrival-check-in/route.ts');
  const ui = read('src/components/ArrivalAvailabilityPrompt.tsx');
  const layout = read('src/app/dashboard/layout.tsx');
  const schema = read('prisma/schema.prisma');

  it('looks at both kinds of booked case', () => {
    expect(api).toContain('mySurgeries');
    expect(api).toContain('myEmergencies');
  });

  it('only counts somebody actually named on the case', () => {
    expect(api).toContain('caseTeamSlots(surgery).find');
    expect(api).toContain('You are not on the team for this case.');
    expect(api).toContain('You are not named on this emergency.');
  });

  it('assesses the position on the server, never trusting the browser', () => {
    // The assignment itself: a verdict read from the body and merely
    // falling back to assessFix would satisfy a looser match.
    expect(api).toContain('const verdict = assessFix({');
    expect(api).toContain('could claim to be on site from anywhere');
  });

  it('records WHY there was no position', () => {
    // Both branches: the elective table and the emergency one. One of
    // them alone satisfies a toContain and leaves the other silent.
    expect(api.match(/locationUnavailableReason: unavailableReason/g) ?? []).toHaveLength(2);
    expect(schema).toContain('locationUnavailableReason String?');
  });

  it('never blocks the answer on the location', () => {
    // No early return on a missing fix anywhere in the POST.
    expect(api).not.toMatch(/if \(!fix\)[\s\S]{0,80}status: 4\d\d/);
    expect(ui).toContain('disabled={busy || !answer}');
  });

  it('asks for the location as the dialogue opens, not after the answer', () => {
    expect(ui).toContain('void requestFix()');
    expect(ui).toContain('not after they have answered');
  });

  it('shows nothing at all when there is nothing to ask', () => {
    expect(ui).toContain('if (!open || todo.length === 0) return null;');
  });

  it('is mounted where somebody lands after signing in', () => {
    expect(layout).toContain('<ArrivalAvailabilityPrompt />');
  });
});
