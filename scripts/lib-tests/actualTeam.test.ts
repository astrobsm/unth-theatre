import { describe, it, expect } from 'vitest';
import {
  currentTeam,
  confirmationHistory,
  teamProblem,
  orderForWriting,
  prefillFromBooking,
  describeChange,
  scheduledStart,
  startDelayMinutes,
  durationMinutes,
  overrunMinutes,
  summarise,
  confirmationCoverage,
  LATE_START_MINUTES,
  MAX_ANAESTHETISTS,
  OVERRUN_MINUTES,
  type ActualTeamRow,
  type DraftMember,
} from '../../src/lib/surgery/actualTeam';

/**
 * A surgery row names the surgeon who was BOOKED. On most lists here that is
 * the consultant who put the case up, and the person who held the knife was a
 * senior registrar. Every figure ever drawn from surgeonId therefore answered
 * "whose list was this" while reading as though it answered "who did this".
 *
 * These rules decide what goes on somebody's record and what their head of
 * department reads about them, so they are proved rather than read.
 */

const row = (over: Partial<ActualTeamRow> & Pick<ActualTeamRow, 'confirmationId' | 'memberName' | 'role'>): ActualTeamRow => ({
  confirmedAt: '2026-11-19T10:00:00.000Z',
  confirmedById: 'u-confirm',
  confirmedByName: 'Scrub Nurse',
  position: 0,
  ...over,
});

describe('reading the confirmed team', () => {
  it('takes the newest confirmation, because a later set is a correction', () => {
    // The standing rule that the EARLIEST record wins governs two nodes holding
    // rival versions of one booking. This is a human correcting themselves, and
    // "first wins" would make correction impossible.
    const rows = [
      row({ confirmationId: 'c1', confirmedAt: '2026-11-19T10:00:00Z', memberName: 'Dr Booked', role: 'PRIMARY_SURGEON' }),
      row({ confirmationId: 'c2', confirmedAt: '2026-11-19T14:00:00Z', memberName: 'Dr Actual', role: 'PRIMARY_SURGEON' }),
    ];
    const team = currentTeam(rows);
    expect(team?.members.map((m) => m.memberName)).toEqual(['Dr Actual']);
    expect(team?.correctionCount).toBe(1);
  });

  it('breaks a tied timestamp the same way on both nodes', () => {
    // Two nodes each confirming within the same millisecond must not render
    // different teams for the same case, and must not flap as rows arrive in a
    // different order.
    const a = row({ confirmationId: 'aaa', confirmedAt: '2026-11-19T10:00:00Z', memberName: 'A', role: 'PRIMARY_SURGEON' });
    const b = row({ confirmationId: 'bbb', confirmedAt: '2026-11-19T10:00:00Z', memberName: 'B', role: 'PRIMARY_SURGEON' });
    expect(currentTeam([a, b])?.members[0].memberName).toBe('B');
    expect(currentTeam([b, a])?.members[0].memberName).toBe('B');
  });

  it('orders a team the way an operation note reads it', () => {
    const rows = [
      row({ confirmationId: 'c1', memberName: 'Assistant Two', role: 'ASSISTANT', position: 1 }),
      row({ confirmationId: 'c1', memberName: 'The Surgeon', role: 'PRIMARY_SURGEON', position: 0 }),
      row({ confirmationId: 'c1', memberName: 'Assistant One', role: 'ASSISTANT', position: 0 }),
    ];
    expect(currentTeam(rows)?.members.map((m) => m.memberName)).toEqual([
      'The Surgeon', 'Assistant One', 'Assistant Two',
    ]);
  });

  it('has nothing to say about a case nobody confirmed', () => {
    // Which is the point: an unconfirmed case counts for nobody, and that is
    // what makes the confirmed figure mean anything.
    expect(currentTeam([])).toBeNull();
  });

  it('keeps the whole correction trail, newest first', () => {
    const rows = [
      row({ confirmationId: 'c1', confirmedAt: '2026-11-19T10:00:00Z', memberName: 'First', role: 'PRIMARY_SURGEON' }),
      row({ confirmationId: 'c2', confirmedAt: '2026-11-19T12:00:00Z', memberName: 'Second', role: 'PRIMARY_SURGEON' }),
      row({ confirmationId: 'c3', confirmedAt: '2026-11-19T14:00:00Z', memberName: 'Third', role: 'PRIMARY_SURGEON' }),
    ];
    expect(confirmationHistory(rows).map((c) => c.members[0].memberName)).toEqual([
      'Third', 'Second', 'First',
    ]);
  });
});

describe('what may be saved', () => {
  const surgeon: DraftMember = { memberName: 'Dr Eze', role: 'PRIMARY_SURGEON', userId: 'u1' };

  it('insists somebody is named', () => {
    expect(teamProblem([])).toContain('at least the surgeon');
    expect(teamProblem([{ memberName: '   ', role: 'PRIMARY_SURGEON' }])).toContain('at least the surgeon');
  });

  it('insists exactly one of them operated', () => {
    expect(teamProblem([{ memberName: 'Dr A', role: 'ASSISTANT' }])).toContain('which of these was the operating surgeon');
    const two = teamProblem([surgeon, { memberName: 'Dr B', role: 'PRIMARY_SURGEON', userId: 'u2' }]);
    expect(two).toContain('Only one operating surgeon');
    // and says WHY, because "no" without a reason gets worked around
    expect(two).toContain('consent form');
  });

  it('allows a case with no anaesthetist at all', () => {
    // A case done under local by the surgeon. Demanding an anaesthetist would
    // make the form unfillable for a whole category of list.
    expect(teamProblem([surgeon])).toBeNull();
  });

  it('allows two anaesthetists, because a relief mid-case is an ordinary day', () => {
    // The surgeon rule does not apply here and the asymmetry is deliberate:
    // one operating surgeon is forced by the consent form, the deposit and the
    // theatre list, and nothing equivalent constrains who held the airway at
    // two in the afternoon.
    expect(MAX_ANAESTHETISTS).toBe(2);
    expect(teamProblem([surgeon, { memberName: 'Dr Gas', role: 'ANAESTHETIST', userId: 'u3' }])).toBeNull();
    expect(teamProblem([
      surgeon,
      { memberName: 'Dr Gas', role: 'ANAESTHETIST', userId: 'u3' },
      { memberName: 'Dr Relief', role: 'ANAESTHETIST', userId: 'u4' },
    ])).toBeNull();
  });

  it('refuses a third, which is a rota rather than a case', () => {
    const three = teamProblem([
      surgeon,
      { memberName: 'Dr Gas', role: 'ANAESTHETIST', userId: 'u3' },
      { memberName: 'Dr Relief', role: 'ANAESTHETIST', userId: 'u4' },
      { memberName: 'Dr Third', role: 'ANAESTHETIST', userId: 'u6' },
    ]);
    expect(three).toContain('At most 2 anaesthetists');
    // and says where the third one goes instead
    expect(three).toContain('anaesthetic assistant');
  });

  it('refuses the same person twice', () => {
    const dup = teamProblem([surgeon, { memberName: 'Dr Eze', role: 'ASSISTANT', userId: 'u1' }]);
    expect(dup).toContain('twice');
    // matched on the account where there is one, and on the name where there is not
    const byName = teamProblem([
      { memberName: 'Visiting Surgeon', role: 'PRIMARY_SURGEON' },
      { memberName: ' visiting surgeon ', role: 'ASSISTANT' },
    ]);
    expect(byName).toContain('twice');
  });

  it('numbers each post from its own first, not from the top of the team', () => {
    // The first assistant is the first assistant whether or not an anaesthetic
    // assistant was present.
    const ordered = orderForWriting([
      { memberName: 'Nurse Gas', role: 'ANAESTHETIC_ASSISTANT' },
      { memberName: 'Assist Two', role: 'ASSISTANT' },
      { memberName: 'Dr Gas', role: 'ANAESTHETIST' },
      { memberName: 'The Surgeon', role: 'PRIMARY_SURGEON' },
      { memberName: 'Assist One', role: 'ASSISTANT' },
    ]);
    expect(ordered.map((m) => [m.memberName, m.position])).toEqual([
      ['The Surgeon', 0],
      ['Assist Two', 0],
      ['Assist One', 1],
      ['Dr Gas', 0],
      ['Nurse Gas', 0],
    ]);
  });

  it('drops a blank line rather than storing an unnamed team member', () => {
    const ordered = orderForWriting([
      { memberName: 'The Surgeon', role: 'PRIMARY_SURGEON' },
      { memberName: '  ', role: 'ASSISTANT' },
    ]);
    expect(ordered).toHaveLength(1);
  });
});

describe('starting from the booking', () => {
  const people = [
    { id: 'u1', fullName: 'Prof Booked', staffCode: 'S1', role: 'CONSULTANT_SURGEON' },
    { id: 'u2', fullName: 'Dr Assistant', staffCode: 'S2', role: 'SURGEON' },
    { id: 'u3', fullName: 'Dr Gas Booked', staffCode: 'S3', role: 'ANAESTHETIST' },
    { id: 'u4', fullName: 'Dr Gas Actual', staffCode: 'S4', role: 'ANAESTHETIST' },
    { id: 'u5', fullName: 'Nurse Gas', staffCode: 'S5', role: 'NURSE_ANAESTHETIST' },
  ];

  it('offers the booked team, assistants included', () => {
    const draft = prefillFromBooking({
      surgeonId: 'u1',
      assistantSurgeonId: 'u2',
      people,
      bookedMembers: [
        { userId: null, memberName: 'Visiting Registrar', role: 'REGISTRAR', specialNotes: 'Assisting' },
        { userId: 'u9', memberName: 'Unit Member', role: 'HOUSE_OFFICER', specialNotes: null },
      ],
    });
    expect(draft.map((m) => [m.memberName, m.role])).toEqual([
      ['Prof Booked', 'PRIMARY_SURGEON'],
      ['Dr Assistant', 'ASSISTANT'],
      ['Visiting Registrar', 'ASSISTANT'],
    ]);
    // The unit team is not the operating team. Somebody listed under the unit
    // without an assisting note was not claimed to have scrubbed.
    expect(draft.find((m) => m.memberName === 'Unit Member')).toBeUndefined();
  });

  it('offers no anaesthetist where none was booked', () => {
    // An empty row labelled "Anaesthetist" is an invitation to put a name in
    // one, and a local-anaesthetic case has nobody to put there.
    const draft = prefillFromBooking({ surgeonId: 'u1', people });
    expect(draft.some((m) => m.role === 'ANAESTHETIST')).toBe(false);
  });

  it('takes the anaesthetist the room recorded over the one the booking guessed', () => {
    // surgeries.anesthetistId is written at booking, before the anaesthetic
    // rota exists. The intra-operative record is written in the room.
    const draft = prefillFromBooking({
      surgeonId: 'u1',
      anesthetistId: 'u4',
      nurseAnesthetistId: 'u5',
      people,
    });
    expect(draft.filter((m) => m.role === 'ANAESTHETIST').map((m) => m.memberName)).toEqual(['Dr Gas Actual']);
    expect(draft.filter((m) => m.role === 'ANAESTHETIC_ASSISTANT').map((m) => m.memberName)).toEqual(['Nurse Gas']);
  });

  it('never offers the same person two lines', () => {
    const draft = prefillFromBooking({ surgeonId: 'u1', assistantSurgeonId: 'u1', people });
    expect(draft).toHaveLength(1);
  });

  it('says what the confirmation changed', () => {
    const booked = prefillFromBooking({ surgeonId: 'u1', anesthetistId: 'u3', people });
    const confirmed: ActualTeamRow[] = [
      row({ confirmationId: 'c', memberName: 'Dr Senior Registrar', role: 'PRIMARY_SURGEON', userId: 'u2' }),
      row({ confirmationId: 'c', memberName: 'Dr Gas Actual', role: 'ANAESTHETIST', userId: 'u4' }),
      row({ confirmationId: 'c', memberName: 'Extra Hand', role: 'ASSISTANT', userId: 'u9' }),
    ];
    const change = describeChange(booked, confirmed);
    expect(change).toContain('Dr Senior Registrar operated, not Prof Booked');
    expect(change).toContain('Dr Gas Actual gave the anaesthetic, not Dr Gas Booked');
    expect(change).toContain('Extra Hand assisted');
  });

  it('reports a relief the booking never mentioned', () => {
    const booked = prefillFromBooking({ surgeonId: 'u1', anesthetistId: 'u3', people });
    const confirmed: ActualTeamRow[] = [
      row({ confirmationId: 'c', memberName: 'Prof Booked', role: 'PRIMARY_SURGEON', userId: 'u1' }),
      row({ confirmationId: 'c', memberName: 'Dr Gas Booked', role: 'ANAESTHETIST', userId: 'u3', position: 0 }),
      row({ confirmationId: 'c', memberName: 'Dr Gas Actual', role: 'ANAESTHETIST', userId: 'u4', position: 1 }),
    ];
    // The one who was booked is still there, so this is an addition rather
    // than a swap -- and it is the addition that is worth saying out loud.
    expect(describeChange(booked, confirmed)).toContain('Dr Gas Actual gave the anaesthetic');
  });

  it('says nothing where the booked team is what happened', () => {
    const booked = prefillFromBooking({ surgeonId: 'u1', people });
    const confirmed: ActualTeamRow[] = [
      row({ confirmationId: 'c', memberName: 'Prof Booked', role: 'PRIMARY_SURGEON', userId: 'u1' }),
    ];
    expect(describeChange(booked, confirmed)).toBeNull();
  });
});

describe('the clock', () => {
  it('composes the booked start in local time, not UTC', () => {
    // THIS MACHINE AND THE THEATRE SERVER RUN ON WAT, an hour ahead of UTC.
    // scheduledTime is a string somebody read off a wall clock. Composing the
    // two in UTC would report every case in the hospital as an hour late.
    const start = scheduledStart(new Date(2026, 10, 19), '09:00');
    expect(start?.getHours()).toBe(9);
    expect(start?.getMinutes()).toBe(0);
    expect(start?.getDate()).toBe(19);
  });

  it('has no answer where the time was never written down', () => {
    expect(scheduledStart(new Date(2026, 10, 19), null)).toBeNull();
    expect(scheduledStart(new Date(2026, 10, 19), 'morning')).toBeNull();
    expect(scheduledStart(new Date(2026, 10, 19), '25:00')).toBeNull();
  });

  it('measures the delay off the blocks, and lets a case be early', () => {
    const base = {
      surgeryId: 's', scheduledDate: new Date(2026, 10, 19), scheduledTime: '09:00', team: [],
    };
    expect(startDelayMinutes({ ...base, knifeOnSkinTime: new Date(2026, 10, 19, 10, 5) })).toBe(65);
    expect(startDelayMinutes({ ...base, knifeOnSkinTime: new Date(2026, 10, 19, 8, 50) })).toBe(-10);
    expect(startDelayMinutes(base)).toBeNull();
  });

  it('prefers the knife time to the inferred start', () => {
    const delay = startDelayMinutes({
      surgeryId: 's', scheduledDate: new Date(2026, 10, 19), scheduledTime: '09:00', team: [],
      actualStartTime: new Date(2026, 10, 19, 9, 30),
      knifeOnSkinTime: new Date(2026, 10, 19, 9, 10),
    });
    expect(delay).toBe(10);
  });

  it('refuses a duration that is a mistyped time rather than an operation', () => {
    // A negative or thirty-hour span would move a median further than the case
    // it describes is worth.
    const base = { surgeryId: 's', scheduledDate: new Date(2026, 10, 19), team: [] };
    expect(durationMinutes({
      ...base,
      knifeOnSkinTime: new Date(2026, 10, 19, 9, 0),
      actualEndTime: new Date(2026, 10, 19, 8, 0),
    })).toBeNull();
    expect(durationMinutes({
      ...base,
      knifeOnSkinTime: new Date(2026, 10, 19, 9, 0),
      actualEndTime: new Date(2026, 10, 21, 9, 0),
    })).toBeNull();
    expect(durationMinutes({
      ...base,
      knifeOnSkinTime: new Date(2026, 10, 19, 9, 0),
      actualEndTime: new Date(2026, 10, 19, 11, 30),
    })).toBe(150);
  });

  it('measures the overrun against what the case was booked to need', () => {
    const c = {
      surgeryId: 's', scheduledDate: new Date(2026, 10, 19), team: [],
      estimatedDuration: 90,
      knifeOnSkinTime: new Date(2026, 10, 19, 9, 0),
      actualEndTime: new Date(2026, 10, 19, 11, 0),
    };
    expect(overrunMinutes(c)).toBe(30);
    expect(overrunMinutes({ ...c, estimatedDuration: null })).toBeNull();
  });
});

describe('what it adds up to', () => {
  const caseWith = (
    id: string,
    team: ActualTeamRow[],
    over: Record<string, unknown> = {},
  ) => ({
    surgeryId: id,
    unit: 'Orthopaedics',
    scheduledDate: new Date(2026, 10, 19),
    scheduledTime: '09:00',
    estimatedDuration: 60,
    team,
    ...over,
  });

  it('counts each post separately, because they are different work', () => {
    const cases = [
      caseWith('a', [
        row({ confirmationId: 'c', memberName: 'Dr Eze', role: 'PRIMARY_SURGEON', userId: 'u1', grade: 'SENIOR_REGISTRAR' }),
        row({ confirmationId: 'c', memberName: 'Prof Obi', role: 'ASSISTANT', userId: 'u2', grade: 'CONSULTANT' }),
        row({ confirmationId: 'c', memberName: 'Dr Gas', role: 'ANAESTHETIST', userId: 'u3', grade: 'CONSULTANT' }),
      ]),
      caseWith('b', [
        row({ confirmationId: 'd', memberName: 'Prof Obi', role: 'PRIMARY_SURGEON', userId: 'u2', grade: 'CONSULTANT' }),
        row({ confirmationId: 'd', memberName: 'Dr Eze', role: 'ASSISTANT', userId: 'u1', grade: 'SENIOR_REGISTRAR' }),
      ]),
    ];
    const out = summarise(cases);
    const eze = out.find((p) => p.userId === 'u1')!;
    const obi = out.find((p) => p.userId === 'u2')!;
    const gas = out.find((p) => p.userId === 'u3')!;

    expect([eze.operated, eze.assisted, eze.total]).toEqual([1, 1, 2]);
    // A CONSULTANT who assisted a registrar is a consultant doing an
    // assistant's job. Counting it as a consultant case hides the one thing a
    // training record exists to show.
    expect([obi.operated, obi.assisted]).toEqual([1, 1]);
    expect(obi.byGrade.CONSULTANT).toEqual({ PRIMARY_SURGEON: 1, ASSISTANT: 1 });
    expect([gas.anaesthetised, gas.operated]).toEqual([1, 0]);
  });

  it('counts the anaesthetist on the cases they actually gave', () => {
    const out = summarise([
      caseWith('a', [row({ confirmationId: 'c', memberName: 'Dr Gas', role: 'ANAESTHETIST', userId: 'u3' })]),
      caseWith('b', [row({ confirmationId: 'd', memberName: 'Nurse Gas', role: 'ANAESTHETIC_ASSISTANT', userId: 'u5' })]),
    ]);
    expect(out.find((p) => p.userId === 'u3')!.anaesthetised).toBe(1);
    expect(out.find((p) => p.userId === 'u5')!.anaesthesiaAssisted).toBe(1);
  });

  it('counts a relieved case for BOTH anaesthetists, not half for each', () => {
    // This is a record of work done, not a division of one case into halves.
    // Both of them gave that anaesthetic.
    const out = summarise([
      caseWith('a', [
        row({ confirmationId: 'c', memberName: 'Dr Started', role: 'ANAESTHETIST', userId: 'u3', position: 0 }),
        row({ confirmationId: 'c', memberName: 'Dr Relieved', role: 'ANAESTHETIST', userId: 'u4', position: 1 }),
      ]),
    ]);
    expect(out.find((p) => p.userId === 'u3')!.anaesthetised).toBe(1);
    expect(out.find((p) => p.userId === 'u4')!.anaesthetised).toBe(1);
  });

  it('uses a median, so one five-hour case does not redefine a surgeon', () => {
    // A mean would drag a surgeon with twenty ordinary lists into looking slow
    // on the strength of one bowel resected mid-procedure, and the person
    // reading the board cannot see that from the number.
    const mk = (id: string, mins: number) =>
      caseWith(id, [row({ confirmationId: id, memberName: 'Dr Eze', role: 'PRIMARY_SURGEON', userId: 'u1' })], {
        knifeOnSkinTime: new Date(2026, 10, 19, 9, 0),
        actualEndTime: new Date(2026, 10, 19, 9 + Math.floor(mins / 60), mins % 60),
      });
    const out = summarise([mk('a', 60), mk('b', 60), mk('c', 60), mk('d', 300)]);
    expect(out[0].medianDuration).toBe(60);
    expect(out[0].durationMeasured).toBe(4);
  });

  it('says how many cases each figure could be measured on', () => {
    // A median over three cases and a median over forty are different claims,
    // and a board that prints them identically invites the wrong one to be
    // acted on.
    const withTimes = caseWith('a', [row({ confirmationId: 'a', memberName: 'Dr Eze', role: 'PRIMARY_SURGEON', userId: 'u1' })], {
      knifeOnSkinTime: new Date(2026, 10, 19, 9, 30),
      actualEndTime: new Date(2026, 10, 19, 10, 30),
    });
    const withoutTimes = caseWith('b', [row({ confirmationId: 'b', memberName: 'Dr Eze', role: 'PRIMARY_SURGEON', userId: 'u1' })]);
    const out = summarise([withTimes, withoutTimes]);
    expect(out[0].total).toBe(2);
    expect(out[0].startMeasured).toBe(1);
    expect(out[0].durationMeasured).toBe(1);
  });

  it('counts a start as late only past the theatre slack', () => {
    const at = (h: number, m: number) =>
      caseWith(`${h}:${m}`, [row({ confirmationId: `${h}${m}`, memberName: 'Dr Eze', role: 'PRIMARY_SURGEON', userId: 'u1' })], {
        knifeOnSkinTime: new Date(2026, 10, 19, h, m),
      });
    expect(LATE_START_MINUTES).toBe(15);
    expect(summarise([at(9, 15)])[0].startedLate).toBe(0);
    expect(summarise([at(9, 16)])[0].startedLate).toBe(1);
    expect(OVERRUN_MINUTES).toBe(30);
  });

  it('keeps a visiting surgeon on the case and off the staff board', () => {
    // They operated and the case must say so. They have no account, so they
    // cannot be a row keyed on staff -- but they are still counted by name.
    const out = summarise([
      caseWith('a', [row({ confirmationId: 'c', memberName: 'Visiting Prof', role: 'PRIMARY_SURGEON', userId: null })]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBeNull();
    expect(out[0].name).toBe('Visiting Prof');
  });

  it('ranks the busiest first, so the board opens on who is carrying the list', () => {
    const out = summarise([
      caseWith('a', [
        row({ confirmationId: 'c', memberName: 'Busy', role: 'PRIMARY_SURGEON', userId: 'u1' }),
        row({ confirmationId: 'c', memberName: 'Quiet', role: 'ASSISTANT', userId: 'u2' }),
      ]),
      caseWith('b', [row({ confirmationId: 'd', memberName: 'Busy', role: 'PRIMARY_SURGEON', userId: 'u1' })]),
    ]);
    expect(out.map((p) => p.name)).toEqual(['Busy', 'Quiet']);
  });

  it('is honest about how much of the list it is built on', () => {
    // A board built on a third of the list is a board that will be believed
    // and should not be.
    expect(confirmationCoverage(30, 10)).toEqual({
      completed: 30, confirmed: 10, unconfirmed: 20, share: 1 / 3,
    });
    expect(confirmationCoverage(0, 0).share).toBeNull();
  });
});
