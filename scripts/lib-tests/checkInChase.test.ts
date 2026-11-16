import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  EARLY_CONFIRM_MINUTES,
  REFUSAL_MESSAGE,
  buildCheckInChaseMessage,
  buildCheckInThanksMessage,
  commendableMembers,
  describeLead,
  minutesAhead,
  minutesBeforeStart,
  respondedMembers,
  silentMembers,
  thanksToneFor,
  type CaseFacts,
  type ChaseMember,
} from '../../src/lib/theatreOps/checkInChase';

// Chasing a team for their check-in, and thanking the early.
//
// The board showed "5 of 5 yet to respond" and gave nobody a way to act on it.
// The two buttons are opposites on purpose, and the value of each depends
// entirely on it going to the right people: a chase that reaches somebody who
// already answered teaches them the chase does not read their reply, and a
// commendation given on request is one nobody values.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

const NINE_AM = new Date('2026-11-16T09:00:00Z');

const member = (over: Partial<ChaseMember> = {}): ChaseMember => ({
  userId: 'u1',
  name: 'Dr A. Example',
  roleOnCase: 'Surgeon',
  status: null,
  checkedInAt: null,
  ...over,
});

const FACTS: CaseFacts = {
  procedureName: 'Bilateral Varicocoelectomy',
  scheduledTime: '09:00',
  scheduledAt: NINE_AM,
  theatre: 'Professor Ojukwu Theatre Complex',
  unit: 'Uro Unit I',
};

describe('a chase goes only to the people who said nothing', () => {
  it('picks out the silent', () => {
    const team = [
      member({ userId: 'a', status: null }),
      member({ userId: 'b', status: 'PRESENT' }),
      member({ userId: 'c', status: null }),
      member({ userId: 'd', status: 'UNAVAILABLE' }),
    ];
    expect(silentMembers(team).map((m) => m.userId)).toEqual(['a', 'c']);
  });

  it('does NOT chase somebody who said they cannot come', () => {
    // "Unavailable" is an answer. Chasing it is how a chase stops being read.
    const team = [member({ status: 'UNAVAILABLE' }), member({ userId: 'x', status: 'REPLACED' })];
    expect(silentMembers(team)).toEqual([]);
  });

  it('returns nobody when the whole team has answered', () => {
    expect(silentMembers([member({ status: 'EN_ROUTE' })])).toEqual([]);
  });
});

describe('how early somebody confirmed', () => {
  it('measures against the scheduled start, not against arrival', () => {
    const m = member({ status: 'PRESENT', checkedInAt: new Date('2026-11-16T07:00:00Z') });
    expect(minutesAhead(m, NINE_AM)).toBe(120);
  });

  it('is negative when they answered after the list was due to start', () => {
    const m = member({ status: 'PRESENT', checkedInAt: new Date('2026-11-16T09:30:00Z') });
    expect(minutesAhead(m, NINE_AM)).toBe(-30);
  });

  it('does not count an answer that is not a confirmation', () => {
    // Honest and worth having, but the theatre cannot plan an early start
    // around somebody who has said they are not coming.
    for (const status of ['UNAVAILABLE', 'REPLACED'] as const) {
      const m = member({ status, checkedInAt: new Date('2026-11-16T06:00:00Z') });
      expect(minutesAhead(m, NINE_AM), status).toBeNull();
    }
  });

  it('is null when either time is missing', () => {
    expect(minutesAhead(member({ status: 'PRESENT' }), NINE_AM)).toBeNull();
    expect(minutesAhead(member({ status: 'PRESENT', checkedInAt: NINE_AM }), null)).toBeNull();
    expect(minutesAhead(member({ checkedInAt: NINE_AM }), NINE_AM)).toBeNull();
  });
});

describe('a commendation is earned, not requested', () => {
  const early = member({
    userId: 'early', status: 'PRESENT', checkedInAt: new Date('2026-11-16T06:30:00Z'),
  });
  const late = member({
    userId: 'late', status: 'PRESENT', checkedInAt: new Date('2026-11-16T08:55:00Z'),
  });

  it('thanks the person who confirmed in time to be useful', () => {
    expect(commendableMembers([early, late], NINE_AM).map((m) => m.userId)).toEqual(['early']);
  });

  it('refuses when a confirmation was honest but too late to plan around', () => {
    // 08:55 for a 09:00 list is true and useless for planning.
    expect(commendableMembers([late], NINE_AM)).toEqual([]);
  });

  it('takes the threshold exactly, not approximately', () => {
    const onTheLine = member({
      status: 'PRESENT',
      checkedInAt: new Date(NINE_AM.getTime() - EARLY_CONFIRM_MINUTES * 60000),
    });
    const aMinuteShort = member({
      status: 'PRESENT',
      checkedInAt: new Date(NINE_AM.getTime() - (EARLY_CONFIRM_MINUTES - 1) * 60000),
    });
    expect(commendableMembers([onTheLine], NINE_AM)).toHaveLength(1);
    expect(commendableMembers([aMinuteShort], NINE_AM)).toHaveLength(0);
  });

  it('commends nobody when there is no scheduled time to measure against', () => {
    expect(commendableMembers([early], null)).toEqual([]);
  });

  it('says why it refused, in words somebody can act on', () => {
    expect(REFUSAL_MESSAGE.NOBODY_SILENT).toMatch(/already answered/i);
    expect(REFUSAL_MESSAGE.NOBODY_RESPONDED).toMatch(/nobody to thank/i);
    expect(REFUSAL_MESSAGE.NO_SCHEDULED_TIME).toMatch(/no scheduled time/i);
  });
});

describe('the chase message', () => {
  const msg = buildCheckInChaseMessage({
    member: member({ roleOnCase: 'Anaesthetist' }),
    facts: FACTS,
    link: 'https://unth-theatre.link/dashboard/theatre-ops/check-in',
    senderName: 'Mrs I. Example',
  });

  it('says who they are on the case, and when', () => {
    expect(msg).toContain('Anaesthetist');
    expect(msg).toContain('Bilateral Varicocoelectomy');
    expect(msg).toContain('09:00');
    expect(msg).toContain('Professor Ojukwu Theatre Complex');
  });

  it('carries the link, because the point is one tap', () => {
    expect(msg).toContain('https://unth-theatre.link/dashboard/theatre-ops/check-in');
  });

  it('asks the thing the board cannot answer for them', () => {
    expect(msg.toLowerCase()).toContain('earlier than the scheduled time');
  });

  it('invents no sanction', () => {
    // The standing consequences live in the policy and the disciplinary route.
    // A chase that threatens is one a consultant answers by ringing the
    // Chairman rather than by checking in.
    for (const word of ['query', 'disciplinary', 'sanction', 'report you', 'escalate']) {
      expect(msg.toLowerCase(), word).not.toContain(word);
    }
  });

  it('signs with whoever pressed it', () => {
    expect(msg).toContain('Mrs I. Example');
  });

  it('carries an added note when there is one', () => {
    const withNote = buildCheckInChaseMessage({
      member: member(), facts: FACTS, link: 'x', note: 'We may pull this forward to 08:00.',
    });
    expect(withNote).toContain('We may pull this forward to 08:00.');
  });

  it('never addresses somebody as null', () => {
    const anon = buildCheckInChaseMessage({ member: member({ name: null }), facts: FACTS, link: 'x' });
    expect(anon).toContain('Dear Colleague');
    expect(anon).not.toContain('null');
  });
});

describe('the thank-you reaches everybody who answered', () => {
  // Thanking only the exemplary leaves the people who most need the nudge
  // about timing hearing nothing at all. So everybody who answered is
  // thanked -- and the TONE is what keeps the praise itself earned.

  const early = member({
    status: 'PRESENT', checkedInAt: new Date('2026-11-16T06:45:00Z'),
  });
  const late = member({
    status: 'PRESENT', checkedInAt: new Date('2026-11-16T08:55:00Z'),
  });
  const declined = member({
    status: 'UNAVAILABLE', checkedInAt: new Date('2026-11-16T06:00:00Z'),
  });
  const after = member({
    status: 'PRESENT', checkedInAt: new Date('2026-11-16T09:20:00Z'),
  });

  it('thanks everyone who answered, not only the early', () => {
    const team = [early, late, declined, member({ status: null })];
    expect(respondedMembers(team)).toHaveLength(3);
  });

  it('picks the tone from the record', () => {
    expect(thanksToneFor(early, NINE_AM)).toBe('EARLY_CONFIRMED');
    expect(thanksToneFor(late, NINE_AM)).toBe('LATE_CONFIRMED');
    expect(thanksToneFor(declined, NINE_AM)).toBe('DECLINED');
  });

  it('praises the early one, and names the benefit', () => {
    const msg = buildCheckInThanksMessage({
      member: early, facts: FACTS, tone: 'EARLY_CONFIRMED',
      minutesBefore: minutesBeforeStart(early.checkedInAt, NINE_AM),
    });
    expect(msg).toContain('2 hours 15 minutes');
    expect(msg.toLowerCase()).toContain('start early');
    expect(msg.toLowerCase()).not.toContain('one request');
  });

  it('thanks the late one AND asks for earlier next time', () => {
    // The whole point of widening this: the person who checked in at 08:55
    // is exactly who needs telling, and under the old rule got nothing.
    const msg = buildCheckInThanksMessage({
      member: late, facts: FACTS, tone: 'LATE_CONFIRMED',
      minutesBefore: minutesBeforeStart(late.checkedInAt, NINE_AM),
    });
    expect(msg.toLowerCase()).toContain('thank you');
    expect(msg).toContain('5 minutes');
    expect(msg.toLowerCase()).toContain('before');
    expect(msg).toContain('1 hour');
  });

  it('says plainly when the answer came AFTER the start time', () => {
    const msg = buildCheckInThanksMessage({
      member: after, facts: FACTS, tone: 'LATE_CONFIRMED',
      minutesBefore: minutesBeforeStart(after.checkedInAt, NINE_AM),
    });
    expect(msg).toContain('after');
    expect(msg).toContain('20 minutes');
  });

  it('thanks somebody for saying they could NOT come', () => {
    // Telling the theatre at 06:00 that you are unavailable is more useful
    // than silence, and is the behaviour least reinforced anywhere else.
    const msg = buildCheckInThanksMessage({
      member: declined, facts: FACTS, tone: 'DECLINED',
      minutesBefore: minutesBeforeStart(declined.checkedInAt, NINE_AM),
    });
    expect(msg.toLowerCase()).toContain('thank you');
    expect(msg.toLowerCase()).toContain('cover');
    // Told us three hours ahead, so no nudge.
    expect(msg.toLowerCase()).not.toContain('one request');
  });

  it('nudges a LATE decline, because the earlier it comes the better', () => {
    const lateDecline = member({
      status: 'UNAVAILABLE', checkedInAt: new Date('2026-11-16T08:50:00Z'),
    });
    const msg = buildCheckInThanksMessage({
      member: lateDecline, facts: FACTS, tone: 'DECLINED',
      minutesBefore: minutesBeforeStart(lateDecline.checkedInAt, NINE_AM),
    });
    expect(msg.toLowerCase()).toContain('one request');
  });

  it('still reserves the praise for those who earned it', () => {
    // commendableMembers is unchanged and still decides who is EXEMPLARY.
    expect(commendableMembers([early, late, declined], NINE_AM)
      .map((m) => m.status)).toEqual(['PRESENT']);
  });

  it('describes a lead time the way a person would say it', () => {
    expect(describeLead(135)).toBe('2 hours 15 minutes');
    expect(describeLead(120)).toBe('2 hours');
    expect(describeLead(60)).toBe('1 hour');
    expect(describeLead(45)).toBe('45 minutes');
    expect(describeLead(1)).toBe('1 minute');
    expect(describeLead(-20)).toBe('20 minutes');
  });
});
describe('the decisions that must not move to the client', () => {
  const route = codeOf('src/app/api/theatre-ops/check-in/chase/route.ts');
  const page = codeOf('src/app/dashboard/theatre-ops/check-in/page.tsx');

  it('lets the server pick the recipients, not the browser', () => {
    // The browser sends a case and an intention. Two definitions of "has not
    // answered" is one definition too many.
    expect(route).toContain('silentMembers(members)');
    expect(route).toContain('respondedMembers(members)');
    expect(route).toContain('thanksToneFor(member, scheduledAt)');
    expect(page).not.toContain('silentMembers');
    expect(page).not.toContain('respondedMembers');
    expect(page).not.toContain('thanksToneFor');
  });

  it('queues through the comms pipeline rather than sending directly', () => {
    expect(route).toContain('queueMessage(');
    expect(route).not.toContain('sendTemplate');
  });

  it('still hands back wa.me links, because the provider is cloud-only', () => {
    expect(route).toContain('https://wa.me/');
    expect(route).toContain('toWhatsAppNumber');
  });

  it('refuses a stranger but allows anybody named on the case', () => {
    expect(route).toContain('CHASE_ROLES');
    expect(route).toContain('onThisCase');
    expect(route).toContain('status: 403');
  });

  it('builds the link from publicSiteUrl, never the request host', () => {
    // A link built from the request host reaches a consultant's phone as the
    // theatre node's Tailscale address, which cannot resolve on mobile data.
    expect(route).toContain('publicSiteUrl()');
  });

  it('makes a double-click one message and tomorrow a new one', () => {
    expect(route).toContain('${surgery.id}:${member.userId}:${kind}:${day}');
  });
});

describe('the board shows WHEN somebody answered', () => {
  // "Present" on its own cannot distinguish a confirmation given last night
  // from one given at 08:58 for a 09:00 list — and only the first is what the
  // commend button rewards, so the board has to show the difference.
  const page = read('src/app/dashboard/theatre-ops/check-in/page.tsx');

  it('renders the check-in time against each team member', () => {
    expect(page).toContain('checked in ${watClock(t.checkedInAt)}');
  });

  it('reads it back to you on your own case too', () => {
    // "Did that actually register?" is a real question on one bar of signal.
    expect(page).toContain('const mineRow = c.team.find((t) => t.isMe)');
    expect(page).toContain('checked in {watClock(mineRow.checkedInAt)}');
  });

  it('formats in WAT, through the house helper', () => {
    // This server runs UTC. A raw time reads an hour out for every member of
    // staff on the board, and nobody would think to check.
    expect(page).toContain("import { watClock } from '@/lib/watDay'");
    expect(page).not.toMatch(/toLocaleTimeString\(/);
  });

  it('shows nothing where nobody has answered', () => {
    // The time is conditional on checkedInAt, so a silent row stays silent
    // rather than rendering "checked in --:--".
    expect(page).toContain("t.checkedInAt ? ` · checked in");
  });
});
