import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSISTING_NOTE, TEAM_GRADES, assistantsAsTeamMembers, gradeForAccountRole,
  isAssisting, isTeamGrade, mergeTeamMembers, primaryAssistantId, withAssistingNote,
} from '../../src/lib/surgery/assistants';
import { buildCaseTeam } from '../../src/lib/theatre/caseTeam';

// The booking form's "Assistant(s)" picker had a search, an Add control and
// removable chips, and held exactly one: choosing a second replaced the first.
// Most lists here are done by two or three surgeons, so the second and third
// were either unrecorded or filed in a different section under a grade, with
// nothing saying they were operating.

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('gradeForAccountRole — a default, not an invention', () => {
  it('reads a consultant as a consultant', () => {
    expect(gradeForAccountRole('CONSULTANT_SURGEON')).toBe('CONSULTANT');
    expect(gradeForAccountRole('CONSULTANT_ANAESTHETIST')).toBe('CONSULTANT');
  });

  it('reads a house officer as a house officer', () => {
    expect(gradeForAccountRole('HOUSE_OFFICER')).toBe('HOUSE_OFFICER');
  });

  it('falls back to registrar for a plain SURGEON account', () => {
    // There is no REGISTRAR account role in this system: 194 accounts are
    // plain SURGEON, covering registrars and senior registrars alike. The
    // commoner of the two is offered and the booker can correct it.
    expect(gradeForAccountRole('SURGEON')).toBe('REGISTRAR');
    expect(gradeForAccountRole(null)).toBe('REGISTRAR');
    expect(gradeForAccountRole(undefined)).toBe('REGISTRAR');
  });

  it('only ever returns a grade the team table accepts', () => {
    for (const r of ['SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'PORTER', '', null]) {
      expect(isTeamGrade(gradeForAccountRole(r)), String(r)).toBe(true);
    }
  });
});

describe('assistantsAsTeamMembers', () => {
  it('keeps every assistant, not just the first', () => {
    const rows = assistantsAsTeamMembers([
      { userId: 'a', name: 'Dr Eze', grade: 'CONSULTANT' },
      { userId: 'b', name: 'Dr Nwosu', grade: 'REGISTRAR' },
      { userId: 'c', name: 'Dr Obi', grade: 'HOUSE_OFFICER' },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(['Dr Eze', 'Dr Nwosu', 'Dr Obi']);
  });

  it('marks each one as assisting, so they are not read as unit team', () => {
    const rows = assistantsAsTeamMembers([{ userId: 'a', name: 'Dr Eze', grade: 'REGISTRAR' }]);
    expect(rows[0].specialNotes).toBe(ASSISTING_NOTE);
    expect(isAssisting(rows[0].specialNotes)).toBe(true);
  });

  it('keeps a visiting surgeon who has no account', () => {
    // A visiting surgeon from another hospital is exactly the case a name
    // alone has to be bookable for.
    const rows = assistantsAsTeamMembers([{ userId: null, name: 'Mr Visiting', grade: 'CONSULTANT' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
  });

  it('drops a nameless row rather than storing a blank', () => {
    const rows = assistantsAsTeamMembers([
      { userId: 'a', name: '   ', grade: 'REGISTRAR' },
      { userId: 'b', name: 'Dr Nwosu', grade: 'REGISTRAR' },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Dr Nwosu']);
  });
});

describe('mergeTeamMembers — one row per person', () => {
  const assisting = assistantsAsTeamMembers([
    { userId: 'reg1', name: 'Dr Nwosu', grade: 'REGISTRAR' },
  ]);

  it('keeps the unit team and the assistants together', () => {
    const merged = mergeTeamMembers(
      [{ name: 'Dr Adaeze', role: 'CONSULTANT', userId: 'con1' }],
      assisting,
    );
    expect(merged.map((m) => m.name).sort()).toEqual(['Dr Adaeze', 'Dr Nwosu']);
  });

  it('lists somebody in both lists once, as assisting', () => {
    // One human being who will either scrub or not. Asking them twice
    // produces a board that can contradict itself.
    const merged = mergeTeamMembers(
      [{ name: 'Dr Nwosu', role: 'REGISTRAR', userId: 'reg1' }],
      assisting,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].specialNotes).toBe(ASSISTING_NOTE);
  });

  it('matches people without accounts on their name', () => {
    const merged = mergeTeamMembers(
      [{ name: '  mr visiting ', role: 'CONSULTANT', userId: null }],
      assistantsAsTeamMembers([{ userId: null, name: 'Mr Visiting', grade: 'CONSULTANT' }]),
    );
    expect(merged).toHaveLength(1);
  });

  it('carries the staff code the unit-team picker records', () => {
    const merged = mergeTeamMembers(
      [{ name: 'Dr Adaeze', role: 'CONSULTANT', userId: 'con1', staffCode: 'SRG233' }],
      [],
    );
    expect(merged[0].staffCode).toBe('SRG233');
  });
});

describe('primaryAssistantId — the one column everything else reads', () => {
  it('is the first assistant with an account', () => {
    expect(primaryAssistantId([
      { userId: 'a', name: 'Dr Eze', grade: 'CONSULTANT' },
      { userId: 'b', name: 'Dr Nwosu', grade: 'REGISTRAR' },
    ])).toBe('a');
  });

  it('skips past a visiting surgeon who has no id to put there', () => {
    // Leaving the column null while an assistant with an account is on the
    // case would keep that case off their own dashboard.
    expect(primaryAssistantId([
      { userId: null, name: 'Mr Visiting', grade: 'CONSULTANT' },
      { userId: 'b', name: 'Dr Nwosu', grade: 'REGISTRAR' },
    ])).toBe('b');
  });

  it('is null when nobody on the list has an account', () => {
    expect(primaryAssistantId([{ userId: null, name: 'Mr Visiting', grade: 'CONSULTANT' }])).toBeNull();
  });

  it('is null when there are no assistants at all', () => {
    expect(primaryAssistantId([])).toBeNull();
  });
});

describe('withAssistingNote', () => {
  it('adds the note to a label that is already in words', () => {
    expect(withAssistingNote('Senior registrar', ASSISTING_NOTE)).toBe('Senior registrar (assisting)');
  });

  it('leaves a unit-team member as their grade alone', () => {
    expect(withAssistingNote('Registrar', null)).toBe('Registrar');
    expect(withAssistingNote('Registrar', 'Scrubbing for the first case')).toBe('Registrar');
  });

  it('does not restyle the label it is given', () => {
    // The two team lists in this codebase word their roles differently on
    // purpose. A helper that imposed its own casing would have quietly
    // rewritten every row in both to add a suffix to one — which it did,
    // and the suite caught it.
    expect(withAssistingNote('Circulating Nurse', null)).toBe('Circulating Nurse');
    expect(withAssistingNote('Circulating nurse', null)).toBe('Circulating nurse');
  });

  it('never returns an empty label', () => {
    expect(withAssistingNote(null, null)).toBe('Team member');
    expect(withAssistingNote('   ', ASSISTING_NOTE)).toBe('Team member (assisting)');
  });
});

describe('a second surgeon is on the case in every sense that matters', () => {
  const posts = { surgeonId: 'surg1', assistantSurgeonId: 'asst1' };
  const people = [
    { id: 'surg1', fullName: 'Dr Okeke' },
    { id: 'asst1', fullName: 'Dr Eze' },
    { id: 'asst2', fullName: 'Dr Nwosu' },
  ];
  const bookedMembers = assistantsAsTeamMembers([
    { userId: 'asst1', name: 'Dr Eze', grade: 'CONSULTANT' },
    { userId: 'asst2', name: 'Dr Nwosu', grade: 'REGISTRAR' },
  ]).map((m) => ({ userId: m.userId, memberName: m.name, role: m.role, specialNotes: m.specialNotes }));

  it('the board names all three', () => {
    const team = buildCaseTeam({ posts, people, bookedMembers });
    expect(team.map((m) => m.name).sort()).toEqual(['Dr Eze', 'Dr Nwosu', 'Dr Okeke']);
  });

  it('the second assistant is named as assisting, not merely as a registrar', () => {
    const team = buildCaseTeam({ posts, people, bookedMembers });
    expect(team.find((m) => m.userId === 'asst2')?.role).toBe('Registrar (assisting)');
  });

  it('the first assistant appears once, holding both roles', () => {
    // They are written to the column AND to the team table. One person, one
    // row, both parts named.
    const team = buildCaseTeam({ posts, people, bookedMembers });
    const first = team.filter((m) => m.userId === 'asst1');
    expect(first).toHaveLength(1);
    expect(first[0].role).toContain('Assistant surgeon');
    expect(first[0].role).toContain('assisting');
  });
});

describe('the booking actually sends them', () => {
  it('the form appends instead of replacing, and merges them into the team', () => {
    const page = read('src/app/dashboard/surgeries/new/page.tsx');
    expect(page).toContain('mergeTeamMembers(');
    expect(page).toContain('assistantsAsTeamMembers(chosenAssistants)');
    expect(page).toContain('assistantSurgeonId: primaryAssistantId(chosenAssistants)');
    // The old behaviour, in its own words.
    expect(page).not.toContain('if (id) setAssistantIds([id]);');
    expect(page).not.toContain('For a second assistant, add them to the unit team below');
  });

  it('the booking route stores what the team member is doing on the case', () => {
    const route = read('src/app/api/surgeries/route.ts');
    expect(route).toContain('specialNotes: tm.specialNotes || null');
  });

  it('every team list loads the note it now depends on', () => {
    for (const f of [
      'src/app/api/case-availability/route.ts',
      'src/app/api/cmd/theatre-status/route.ts',
      'src/app/api/dashboards/[desk]/route.ts',
      'src/lib/theatreOps/caseTeam.ts',
    ]) {
      expect(read(f), f).toContain('specialNotes: true');
    }
  });

  it('TEAM_GRADES matches the grades the database accepts', () => {
    const schema = read('prisma/schema.prisma');
    const block = schema.slice(schema.indexOf('enum SurgicalTeamRole'));
    for (const g of TEAM_GRADES) {
      expect(block.slice(0, block.indexOf('}')), g).toContain(g);
    }
  });
});
