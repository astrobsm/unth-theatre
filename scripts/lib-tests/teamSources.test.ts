/**
 * "Not assigned" was not true.
 *
 * Reported on 6 November against My Theatre Team: "the information here is
 * not correct, the anaesthetic technicians are assigned but it shows not
 * assigned."
 *
 * They were assigned. The live database for that day held:
 *
 *   theatre allocations ................... 4
 *     with an anaesthetic technician ...... 0
 *     with any anaesthetist ............... 0
 *     with a scrub nurse .................. 4   <- so only nurses appeared
 *   surgeries ............................. 23
 *     with an anaesthetist on the case .... 23
 *   published roster rows, morning
 *     anaesthetists ....................... 15
 *     anaesthetic technicians ............. 16
 *
 * Three places record who is working and the card read one of them.
 *
 * The ways the FIX can go wrong, worst first:
 *
 *   A ROSTER NAME PRINTED AS A THEATRE ASSIGNMENT. None of those 37 roster
 *   rows names a theatre — the department publishes a shift, not a room —
 *   so putting one in the "Anaesthetic Technician:" slot would invent a
 *   fact nobody recorded, and somebody would go to Theatre 1 looking for a
 *   person who was never sent there. That is worse than the bug.
 *
 *   A LESS SPECIFIC ANSWER WINNING. One name allocated to this theatre
 *   beats sixteen on the morning roster, because the question the card asks
 *   is "who is in this room".
 *
 *   SILENCE COMING BACK. If every source is empty the card must still say
 *   so plainly rather than show an empty space.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  anyoneKnown,
  dedupe,
  resolveTeamLine,
  summariseLine,
  type NamedPerson,
} from '../../src/lib/allocations/teamSources';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const ALLOCATED: NamedPerson[] = [{ id: 'u1', name: 'Dr Allocated' }];
const ON_CASES: NamedPerson[] = [{ id: 'u2', name: 'Dr OnTheCase' }];
const ON_DUTY: NamedPerson[] = [
  { id: 'u3', name: 'Tech One', tier: null },
  { id: 'u4', name: 'Tech Two', tier: null },
];

const line = (over: Partial<Parameters<typeof resolveTeamLine>[0]> = {}) =>
  resolveTeamLine({ what: 'anaesthetic technician', ...over });

describe('which answer the card gives', () => {
  it('prefers the person allocated to this theatre', () => {
    const l = line({ allocation: ALLOCATED, fromCases: ON_CASES, onDuty: ON_DUTY });
    expect(l.source).toBe('allocation');
    expect(l.people.map((p) => p.name)).toEqual(['Dr Allocated']);
  });

  it('says nothing extra about an allocated name', () => {
    // It is the thing the card has always claimed to show; explaining it
    // would make the exceptional case look ordinary.
    expect(line({ allocation: ALLOCATED }).note).toBeNull();
  });

  it('falls back to whoever is named on the theatre’s cases', () => {
    const l = line({ allocation: [], fromCases: ON_CASES, onDuty: ON_DUTY });
    expect(l.source).toBe('cases');
    expect(l.people.map((p) => p.name)).toEqual(['Dr OnTheCase']);
    expect(l.note).toContain('not on the theatre allocation');
  });

  it('falls back to the published roster last', () => {
    const l = line({ allocation: [], fromCases: [], onDuty: ON_DUTY, shift: 'MORNING' });
    expect(l.source).toBe('roster');
    expect(l.people).toHaveLength(2);
  });

  it('NEVER claims a roster name was put in this theatre', () => {
    // The whole integrity of the fix. Say they are on duty, say nobody has
    // been allocated to the room, and say who to ask.
    const l = line({ allocation: [], fromCases: [], onDuty: ON_DUTY, shift: 'MORNING' });
    expect(l.note).toContain('not allocated to a named theatre');
    expect(l.note).toContain('published morning roster');
    expect(l.note).toContain('who is covering this room');
  });

  it('still says "Not assigned" when every source is empty', () => {
    const l = line({ allocation: [], fromCases: [], onDuty: [] });
    expect(l.source).toBe('none');
    expect(summariseLine(l)).toBe('Not assigned');
  });

  it('counts somebody as known however the card learned of them', () => {
    expect(anyoneKnown([line({ onDuty: ON_DUTY })])).toBe(true);
    expect(anyoneKnown([line({})])).toBe(false);
  });

  it('does not print the same person twice or print a blank', () => {
    const l = line({
      allocation: [
        { id: 'u1', name: 'Dr A' },
        { id: 'u1', name: 'Dr A' },
        { id: null, name: '   ' },
        { id: null, name: 'Dr A' },
      ],
    });
    expect(l.people.map((p) => p.name)).toEqual(['Dr A']);
  });

  it('matches a person with an id to the same person without one', () => {
    // The realistic collision: a roster row whose user record is gone
    // carries only a name, and the same consultant arrives from a case
    // with an id. Matching on "id, or else name" lets them both through,
    // and the card then shows two people covering one room.
    const l = line({
      allocation: [
        { id: null, name: 'Dr A' },
        { id: 'u1', name: 'Dr A' },
      ],
    });
    expect(l.people).toHaveLength(1);
  });

  it('names a few and counts the rest', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ id: `u${i}`, name: `Tech ${i}` }));
    expect(summariseLine({ source: 'roster', people: many, note: null }, 3))
      .toBe('Tech 0, Tech 1, Tech 2 +13 more');
  });

  it('is unchanged by whitespace around a name', () => {
    expect(dedupe([{ name: '  Dr A  ' }])[0].name).toBe('Dr A');
  });
});

describe('the endpoint and the card', () => {
  const api = read('src/app/api/allocations/team-view/route.ts');
  const card = read('src/components/MyTheatreTeam.tsx');

  it('reads all three places people are recorded', () => {
    expect(api).toContain('prisma.theatreAllocation.findMany');
    expect(api).toContain('prisma.surgery.findMany');
    expect(api).toContain('prisma.roster.findMany');
    expect(api).toContain("status: 'PUBLISHED'");
  });

  it('asks for both anaesthetists and technicians from the roster', () => {
    expect(api).toContain("'ANAESTHETISTS', 'ANAESTHETIC_TECHNICIANS'");
  });

  it('does NOT write a fallback name into the allocation fields', () => {
    // anaestheticTechnician must go on meaning "the allocation says so".
    // Anything already reading it — an export, another screen — would
    // otherwise start reporting roster names as theatre assignments.
    expect(api).toContain("anaestheticTechnician: a.anaestheticTechnician?.fullName || null");
    expect(api).toContain('anaesthetistLine');
    expect(api).toContain('technicianLine');
  });

  it('looks up the case technician by id, because it has no foreign key', () => {
    expect(api).toContain('technicianNames');
    expect(api).not.toContain('theatreTechnician: { select:');
  });

  it('counts a theatre as covered when any source knows somebody', () => {
    expect(api).toContain('teamAssigned: anyoneKnown([anaesthetistLine, technicianLine])');
  });

  it('shows the fallback on the card, with where it came from', () => {
    expect(card).toContain('TeamLineView');
    expect(card).toContain('line={a.technicianLine}');
    expect(card).toContain('line={a.anaesthetistLine}');
    expect(card).toContain('{line.note}');
  });

  it('no longer tells the user the team is simply unallocated', () => {
    expect(card).not.toContain('Team not yet allocated for this theatre on this date');
    expect(card).toContain('not on the published roster');
  });
});
