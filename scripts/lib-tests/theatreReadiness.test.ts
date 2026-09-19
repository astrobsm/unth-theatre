/**
 * Theatre readiness, team availability, and the two messages the CMD sends.
 *
 * Three things are being protected here, and only one of them is arithmetic.
 *
 * That a theatre is never announced ready on a half-ticked list, and never
 * announced twice — the radio is heard over a running theatre and a false
 * "ready" sends a patient to a room that is not.
 *
 * That silence is never read as refusal. No answer from an anaesthetist means
 * no answer: they may be operating, teaching, post-call, or have no signal.
 * Every count, label and message in this feature has to hold that line,
 * because the moment one of them says "absent" the board becomes an
 * accusation and people stop answering it.
 *
 * And that one person is one row. A registrar who is both assistant and the
 * booker is one human being who will either turn up or not.
 */
import { describe, expect, it } from 'vitest';

import {
  SCRUB_NURSE_LIST, THEATRE_TECHNICIAN_LIST, READINESS_LISTS,
  listFor, progress, readinessAnnouncement, theatreFullyReady,
} from '../../src/lib/theatre/readiness';
import {
  statusLabel, statusLine, summarise, summaryLine, mayAnswerFor,
  isAvailabilityStatus, type TeamMemberAvailability,
} from '../../src/lib/theatre/availability';
import { buildCaseTeam, roleOnCase, roleLabel, teamUserIds } from '../../src/lib/theatre/caseTeam';
import { buildChaseMessage, buildAppreciationMessage } from '../../src/lib/theatre/cmdMessages';
import { theatreDay, parseTheatreDay, theatreDayBounds, dayKey } from '../../src/lib/theatre/day';

const tickAll = (role: 'SCRUB_NURSE' | 'THEATRE_TECHNICIAN') => {
  const t: Record<string, boolean> = {};
  READINESS_LISTS[role].checks.filter((c) => c.required).forEach((c) => { t[c.id] = true; });
  return t;
};

describe('the two lists', () => {
  it('gives the scrub nurse and the technician different lists', () => {
    const nurse = SCRUB_NURSE_LIST.checks.map((c) => c.id);
    const tech = THEATRE_TECHNICIAN_LIST.checks.map((c) => c.id);
    // The machine, the gases and the airway are not the scrub nurse's to
    // vouch for, and the sterile field is not the technician's.
    expect(tech).toContain('machine');
    expect(nurse).not.toContain('machine');
    expect(nurse).toContain('sterility');
    expect(tech).not.toContain('sterility');
  });

  it('asks both of them whether they are actually in the theatre', () => {
    // The announcement tells the surgical team somebody is standing there.
    expect(SCRUB_NURSE_LIST.checks.some((c) => c.id === 'present' && c.required)).toBe(true);
    expect(THEATRE_TECHNICIAN_LIST.checks.some((c) => c.id === 'present' && c.required)).toBe(true);
  });

  it('keeps every check id unique within a list', () => {
    for (const list of Object.values(READINESS_LISTS)) {
      const ids = list.checks.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('does not know a role it was not given', () => {
    expect(listFor('PORTER')).toBeNull();
    expect(listFor('')).toBeNull();
  });
});

describe('how far along a confirmation is', () => {
  it('counts only the required checks', () => {
    const p = progress('SCRUB_NURSE', tickAll('SCRUB_NURSE'));
    expect(p.total).toBe(SCRUB_NURSE_LIST.checks.filter((c) => c.required).length);
    expect(p.complete).toBe(true);
  });

  it('is not complete while one required box is untouched', () => {
    const ticks = tickAll('SCRUB_NURSE');
    delete ticks.radio;
    const p = progress('SCRUB_NURSE', ticks);
    expect(p.complete).toBe(false);
    expect(p.outstanding.map((c) => c.id)).toEqual(['radio']);
  });

  it('is complete without the optional one', () => {
    // "Something is short and I have already reported it" is worth recording
    // and must not hold up a theatre that is otherwise ready.
    const p = progress('SCRUB_NURSE', tickAll('SCRUB_NURSE'));
    expect(p.complete).toBe(true);
  });

  it('ignores ticks for checks that no longer exist', () => {
    // A record ticked against an older version of the list. A checklist that
    // reads 9 of 8 is a checklist nobody trusts again.
    const p = progress('SCRUB_NURSE', { ...tickAll('SCRUB_NURSE'), removed_last_month: true });
    expect(p.done).toBe(p.total);
    expect(p.done).toBeLessThanOrEqual(p.total);
  });

  it('treats nothing at all as nothing done, not as done', () => {
    expect(progress('SCRUB_NURSE', null).complete).toBe(false);
    expect(progress('SCRUB_NURSE', {}).done).toBe(0);
  });

  it('refuses to call an unknown list complete', () => {
    // Otherwise a typo in a role would announce a theatre ready on the
    // strength of having asked nothing at all.
    expect(progress('NOT_A_ROLE', { anything: true }).complete).toBe(false);
  });
});

describe('what the radio says', () => {
  it('says it three times', () => {
    const { message } = readinessAnnouncement({
      theatreName: 'Theatre 3', role: 'SCRUB_NURSE', confirmedByName: 'Sister Okeke',
    });
    const occurrences = message.split('Theatre 3 is ready to receive patients').length - 1;
    expect(occurrences).toBe(3);
  });

  it('names who confirmed it, so there is somebody to ask', () => {
    const { message } = readinessAnnouncement({
      theatreName: 'Theatre 3', role: 'SCRUB_NURSE', confirmedByName: 'Sister Okeke',
    });
    expect(message).toContain('Sister Okeke');
  });

  it('reads out a shortfall with the readiness', () => {
    // Announced together, it is still something somebody can fix before the
    // patient is on the table.
    const { message } = readinessAnnouncement({
      theatreName: 'Theatre 3', role: 'SCRUB_NURSE', confirmedByName: 'Sister Okeke',
      note: 'only two suction tubings left',
    });
    expect(message).toContain('only two suction tubings left');
  });

  it('says something different for the technician', () => {
    const { title, message } = readinessAnnouncement({
      theatreName: 'Theatre 1', role: 'THEATRE_TECHNICIAN', confirmedByName: 'Mr Eze',
    });
    expect(message).toContain('Anaesthetic preparation');
    expect(title).toContain('anaesthetic preparation');
  });

  it('never announces a nameless theatre', () => {
    const { message } = readinessAnnouncement({
      theatreName: '', role: 'SCRUB_NURSE', confirmedByName: 'Sister Okeke',
    });
    expect(message).not.toContain('undefined');
    expect(message).toContain('The theatre');
  });
});

describe('a theatre is ready when both sides say so', () => {
  it('is not ready on the nurse alone', () => {
    // A nurse in a prepared room beside an unchecked anaesthetic machine has
    // confirmed everything she is able to, and it is still not ready.
    expect(theatreFullyReady([{ role: 'SCRUB_NURSE', complete: true }])).toBe(false);
  });

  it('is not ready on the technician alone', () => {
    expect(theatreFullyReady([{ role: 'THEATRE_TECHNICIAN', complete: true }])).toBe(false);
  });

  it('is ready with both', () => {
    expect(theatreFullyReady([
      { role: 'SCRUB_NURSE', complete: true },
      { role: 'THEATRE_TECHNICIAN', complete: true },
    ])).toBe(true);
  });

  it('is not ready when one of them is only half done', () => {
    expect(theatreFullyReady([
      { role: 'SCRUB_NURSE', complete: true },
      { role: 'THEATRE_TECHNICIAN', complete: false },
    ])).toBe(false);
  });
});

// ── availability ────────────────────────────────────────────────────────────

const member = (over: Partial<TeamMemberAvailability> = {}): TeamMemberAvailability => ({
  userId: 'u1', name: 'Dr Nwosu', role: 'Surgeon', status: null, ...over,
});

describe('silence is not a refusal', () => {
  it('says "not yet said", never "absent"', () => {
    expect(statusLabel(null)).toBe('Not yet said');
    expect(statusLabel(null).toLowerCase()).not.toMatch(/absent|missing|failed|no show/);
  });

  it('counts the unanswered separately from the unavailable', () => {
    const s = summarise([
      member({ userId: 'a', status: 'AVAILABLE' }),
      member({ userId: 'b', status: null }),
      member({ userId: 'c', status: 'UNAVAILABLE' }),
    ]);
    expect(s.silent).toBe(1);
    expect(s.unavailable).toBe(1);
    expect(s.allAnswered).toBe(false);
  });

  it('does not claim the team is complete while somebody has not answered', () => {
    const s = summarise([
      member({ userId: 'a', status: 'AVAILABLE' }),
      member({ userId: 'b', status: null }),
    ]);
    expect(s.allAvailable).toBe(false);
  });

  it('treats a delay as coming, not as trouble', () => {
    // A surgeon twenty minutes away is not a case in trouble, and a board that
    // colours it as one is a board people learn to ignore.
    const s = summarise([
      member({ userId: 'a', status: 'AVAILABLE' }),
      member({ userId: 'b', status: 'DELAYED', etaMinutes: 20 }),
    ]);
    expect(s.allAvailable).toBe(true);
    expect(summaryLine(s)).toContain('2 of 2 confirmed');
  });

  it('puts the ETA in the line when there is one', () => {
    expect(statusLine(member({ status: 'DELAYED', etaMinutes: 25 }))).toBe('On the way — about 25 min');
  });

  it('does not invent an ETA that was not given', () => {
    expect(statusLine(member({ status: 'DELAYED' }))).toBe('On the way, delayed');
    expect(statusLine(member({ status: 'AVAILABLE', etaMinutes: 40 }))).toBe('Available');
  });

  it('calls an empty team an empty team, not a confirmed one', () => {
    const s = summarise([]);
    expect(s.allAvailable).toBe(false);
    expect(s.allAnswered).toBe(false);
    expect(summaryLine(s)).toBe('No team assigned yet');
  });

  it('only accepts the three answers there are', () => {
    expect(isAvailabilityStatus('AVAILABLE')).toBe(true);
    expect(isAvailabilityStatus('MAYBE')).toBe(false);
    expect(isAvailabilityStatus(null)).toBe(false);
  });
});

describe('who may answer for a case', () => {
  it('lets somebody on the team answer', () => {
    expect(mayAnswerFor('u2', ['u1', 'u2', null])).toBe(true);
  });

  it('does not let somebody off it answer', () => {
    expect(mayAnswerFor('u9', ['u1', 'u2'])).toBe(false);
  });

  it('is not fooled by a team of empty slots', () => {
    // Six unfilled post columns are six nulls, and "" must not match them.
    expect(mayAnswerFor('', [null, undefined, ''])).toBe(false);
  });
});

// ── assembling a team ───────────────────────────────────────────────────────

describe('one person, one row', () => {
  const people = [
    { id: 's1', fullName: 'Dr Nwosu', phoneNumber: '08030000001' },
    { id: 'a1', fullName: 'Dr Balogun', phoneNumber: null },
    { id: 'n1', fullName: 'Sister Okeke' },
  ];

  it('reads the named posts in the order a list is read out', () => {
    const team = buildCaseTeam({
      posts: { surgeonId: 's1', anesthetistId: 'a1', scrubNurseId: 'n1' },
      people,
    });
    expect(team.map((m) => m.role)).toEqual(['Surgeon', 'Anaesthetist', 'Scrub nurse']);
  });

  it('joins a second role onto the same person rather than listing them twice', () => {
    // A registrar who is both assistant and scrub is one human being who will
    // either turn up or not; asking twice produces a board that can
    // contradict itself.
    const team = buildCaseTeam({
      posts: { surgeonId: 's1', assistantSurgeonId: 's1' },
      people,
    });
    expect(team).toHaveLength(1);
    expect(team[0].role).toBe('Surgeon / Assistant surgeon');
  });

  it('picks up people added by the anaesthetists and the technicians', () => {
    const team = buildCaseTeam({
      posts: { surgeonId: 's1' },
      people,
      assignments: [{ userId: 'a1', userName: 'Dr Balogun', role: 'ANAESTHETIC_TECHNICIAN' }],
    });
    expect(team.map((m) => m.role)).toContain('Theatre technician');
  });

  it('uses the name it was given when the user row was not loaded', () => {
    // A board reading "Unknown" is less use than one saying what it was told.
    const team = buildCaseTeam({
      posts: {},
      people: [],
      assignments: [{ userId: 'x9', userName: 'Mr Eze', role: 'ANAESTHETIC_TECHNICIAN' }],
    });
    expect(team[0].name).toBe('Mr Eze');
  });

  it('lays each answer over the right person', () => {
    const team = buildCaseTeam({
      posts: { surgeonId: 's1', anesthetistId: 'a1' },
      people,
      answers: [{ userId: 'a1', status: 'DELAYED', etaMinutes: 15, note: 'in another theatre' }],
    });
    expect(team.find((m) => m.userId === 's1')!.status).toBeNull();
    expect(team.find((m) => m.userId === 'a1')!.status).toBe('DELAYED');
    expect(team.find((m) => m.userId === 'a1')!.etaMinutes).toBe(15);
  });

  it('ignores an answer from somebody no longer on the case', () => {
    // They may have been taken off it after answering, and their answer is no
    // longer about anybody's list.
    const team = buildCaseTeam({
      posts: { surgeonId: 's1' },
      people,
      answers: [{ userId: 'gone', status: 'AVAILABLE' }],
    });
    expect(team).toHaveLength(1);
    expect(team[0].userId).toBe('s1');
  });

  it('skips the posts nobody has been put in yet', () => {
    const team = buildCaseTeam({
      posts: { surgeonId: 's1', anesthetistId: null, scrubNurseId: undefined },
      people,
    });
    expect(team).toHaveLength(1);
  });

  it('reports the role to store against an answer', () => {
    const src = { posts: { anesthetistId: 'a1' }, people };
    expect(roleOnCase(src, 'a1')).toBe('Anaesthetist');
    expect(roleOnCase(src, 'nobody')).toBe('Team member');
    expect(teamUserIds(src)).toEqual(['a1']);
  });

  it('turns a role code into words', () => {
    expect(roleLabel('ANAESTHETIC_TECHNICIAN')).toBe('Theatre technician');
    expect(roleLabel('CIRCULATING_NURSE')).toBe('Circulating nurse');
    expect(roleLabel('SOMETHING_NEW')).toBe('Something new');
    expect(roleLabel(null)).toBe('Team member');
  });
});

// ── the CMD's two messages ──────────────────────────────────────────────────

describe('asking what is missing', () => {
  const msg = () => buildChaseMessage({
    toName: 'Sister Okeke',
    toRole: 'Scrub nurse',
    theatreName: 'Theatre 3',
    outstanding: ['the anaesthetic machine check'],
    fromName: 'Prof. Okonkwo',
  });

  it('asks rather than accuses', () => {
    expect(msg()).toMatch(/Could you let me know/);
    expect(msg()).not.toMatch(/failed|why have you|explain yourself|neglect/i);
  });

  it('allows that the board may be wrong', () => {
    // It sometimes is, and a message that does not admit it invites an
    // argument instead of an answer.
    expect(msg()).toMatch(/out of date/);
  });

  it('offers to remove the obstruction rather than only demanding an answer', () => {
    expect(msg()).toMatch(/I will have it moved/);
  });

  it('names what is outstanding instead of saying "there are issues"', () => {
    expect(msg()).toContain('the anaesthetic machine check');
  });

  it('is signed, because a message from nobody is easy to put aside', () => {
    expect(msg()).toContain('Prof. Okonkwo');
    expect(msg()).toContain('Chief Medical Director');
  });

  it('still reads properly with nothing but a name', () => {
    const bare = buildChaseMessage({ toName: 'Dr Balogun' });
    expect(bare).toContain('Good day Dr Balogun');
    expect(bare).not.toContain('undefined');
    expect(bare).not.toMatch(/\n{3,}/);
  });

  it('lists each case it is about', () => {
    const m = buildChaseMessage({
      cases: [
        { scheduledTime: '09:00', procedureName: 'Appendicectomy', patientName: 'A. Okafor' },
        { scheduledTime: '11:30', procedureName: 'Herniorrhaphy' },
      ],
    });
    expect(m).toContain('09:00 — Appendicectomy — for A. Okafor');
    expect(m).toContain('11:30 — Herniorrhaphy');
  });
});

describe('saying thank you', () => {
  it('names what is being thanked, so it does not read as a circular', () => {
    const m = buildAppreciationMessage({
      toName: 'Mr Eze',
      forWhat: 'having Theatre 1 confirmed ready by 07:20',
      fromName: 'Prof. Okonkwo',
    });
    expect(m).toContain('Thank you for having Theatre 1 confirmed ready by 07:20');
  });

  it('has something to say even with nothing specific', () => {
    const m = buildAppreciationMessage({ theatreName: 'Theatre 2' });
    expect(m).toContain('Thank you for being ready on time in Theatre 2');
    expect(m).not.toContain('undefined');
  });

  it('is signed like the other one', () => {
    expect(buildAppreciationMessage({ fromName: 'Prof. Okonkwo' })).toContain('Prof. Okonkwo');
  });
});

// ── the theatre's day ───────────────────────────────────────────────────────

describe('which day it is', () => {
  it('files half past midnight in Enugu under that morning, not the day before', () => {
    // WAT is an hour ahead of UTC. A readiness ticked at 00:30 local is 23:30
    // UTC the previous day, and filing it under yesterday would hide it from
    // the morning board.
    const localHalfPastMidnight = new Date('2026-09-19T23:30:00.000Z');
    expect(dayKey(theatreDay(localHalfPastMidnight))).toBe('2026-09-20');
  });

  it('reads a date out of a query string', () => {
    expect(dayKey(parseTheatreDay('2026-09-19'))).toBe('2026-09-19');
  });

  it('falls back to today rather than erroring on nonsense', () => {
    // A board that refuses to draw because a date was mistyped is less useful
    // than one showing the day everybody is standing in.
    expect(dayKey(parseTheatreDay('not-a-date'))).toBe(dayKey(theatreDay()));
    expect(dayKey(parseTheatreDay(null))).toBe(dayKey(theatreDay()));
  });

  it('bounds a day at twenty-four hours from local midnight', () => {
    const { start, end } = theatreDayBounds(parseTheatreDay('2026-09-19'));
    expect(start.toISOString()).toBe('2026-09-18T23:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
