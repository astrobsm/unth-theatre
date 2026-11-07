/**
 * How a consultant is written to, as against everybody else.
 *
 * Asked for on 7 November:
 *
 *   "in the messages change the word chased to (reached out to) when its to
 *    the consultant, make it very polite and as an attention being drawn to
 *    speak to the residents working under him to do the needful"
 *
 * The ways this goes wrong, worst first:
 *
 *   POLITENESS THAT SOFTENS THE FACTS. The deadline, the review, the blocker
 *   and the standing notice must be identical in both registers. If the
 *   consultant is the one person on the case reading a gentler account of how
 *   late it is, the courtesy has cost the thing the message exists for. This
 *   file checks the facts twice — once in each register — and compares.
 *
 *   ADDRESSING A REGISTRAR AS A CONSULTANT. The register is chosen from the
 *   role on the ACCOUNT, never from a roster slot label: "Anaesthetist (1st
 *   on call)" is a consultant on some nights and a senior registrar on
 *   others, and getting it wrong reads as sarcasm.
 *
 *   THE WORD CREEPING BACK. "Chased" must not reach a consultant from any of
 *   the four message builders, including ones written later.
 *
 *   LOSING THE ASK. The point is not merely a softer tone: it is that the
 *   consultant is asked to speak to the residents and registrars under him.
 *   A polite message without that sentence has not done what was asked.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CONSULTANT_ROLES, askBlock, closing, consultantAsk, contactVerb, contactedVerb,
  isConsultantRole, opening, standardAsk,
} from '../../src/lib/emergency/consultantTone';
import { blockerSpec, buildBlockerChaseMessage } from '../../src/lib/emergency/blockers';
import {
  buildAssignmentChaseMessage, readReviewState,
} from '../../src/lib/emergency/assignmentChase';
import { buildTeamChaseMessage } from '../../src/lib/emergency/teamChase';
import { CMAC_LABELS, buildCmacMessage, cmacStanding } from '../../src/lib/emergency/cmacEscalation';
import { hourRuleStanding } from '../../src/lib/emergency/hourRule';
import type { RollCallMember } from '../../src/lib/emergency/teamChase';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const FACTS = {
  patientName: 'A Patient', folderNumber: 'PT000001', procedureName: 'Laparotomy',
  theatreName: 'Theatre 2', surgeonName: 'Mr B', ward: 'Ward 4', priority: 'CRITICAL',
};
const standing = () => hourRuleStanding({ requestedAt: new Date(Date.now() - 25 * 60_000) });
const NO_REVIEW = readReviewState([]);

/** The same blocker chase, sent to a consultant and to a porter. */
const blockerTo = (role: string) => buildBlockerChaseMessage({
  spec: blockerSpec('NO_ANAESTHETIST')!,
  detail: 'Both theatres running',
  recipientName: 'Dr Okeke',
  recipientLabel: 'Consultant Anaesthetist',
  recipientRole: role,
  facts: FACTS,
  standing: standing(),
  reportedByName: 'Nurse D',
  reportedByRole: 'SCRUB_NURSE',
});

const assignTo = (role: string) => buildAssignmentChaseMessage({
  recipientName: 'Dr Okeke',
  recipientLabel: 'Consultant Anaesthetist',
  recipientRole: role,
  kind: 'ANAESTHETIST',
  facts: FACTS,
  standing: standing(),
  review: NO_REVIEW,
  bookedAt: new Date(Date.now() - 25 * 60_000),
});

const member = (userRole: string | null): RollCallMember => ({
  userId: 'u1', name: 'Dr Okeke', phoneNumber: '08031234567',
  roleOnCase: 'Anaesthetist (1st on call)', teamRole: 'ANAESTHETIST', source: 'roster',
  userRole, availability: null, respondedAt: null, mustReview: true, reviewDone: false,
  mustRespond: true,
});

const teamTo = (role: string | null) => buildTeamChaseMessage({
  member: member(role),
  facts: { patientName: 'A Patient', procedureName: 'Laparotomy' },
  standing: standing(),
  summary: {
    total: 3, expected: 3, responded: 1, coming: 1, unavailable: 0,
    silent: [], anaesthetists: [], reviewDone: false, reachable: 3,
  },
});

describe('who is a consultant', () => {
  it('reads it off the account, not off a roster label', () => {
    expect(isConsultantRole('CONSULTANT_ANAESTHETIST')).toBe(true);
    expect(isConsultantRole('ANAESTHETIST')).toBe(false);
    expect(isConsultantRole('HOUSE_OFFICER')).toBe(false);
    expect(isConsultantRole(null)).toBe(false);
  });

  it('includes the heads of department and the executive', () => {
    ['HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY', 'CMAC', 'DC_MAC', 'THEATRE_CHAIRMAN']
      .forEach((r) => expect(isConsultantRole(r), r).toBe(true));
  });

  it('names only roles the system actually has', () => {
    // A role spelled in a way the enum does not have would silently never
    // match, and that consultant would get the blunt version for ever.
    const schema = read('prisma/schema.prisma');
    const block = schema.slice(
      schema.indexOf('enum UserRole {'),
      schema.indexOf('}', schema.indexOf('enum UserRole {')),
    );
    const real = new Set(block.split('\n').slice(1).map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Z_]*$/.test(l)));
    expect([...CONSULTANT_ROLES].filter((r) => !real.has(r))).toEqual([]);
  });
});

describe('the words themselves', () => {
  it('says "reached out to" for a consultant and "chased" for everybody else', () => {
    expect(contactVerb(true)).toBe('reached out to');
    expect(contactVerb(false)).toBe('chased');
    expect(contactedVerb(true)).toBe('been reached out to');
  });

  it('greets a consultant and apologises before asking anything', () => {
    const o = opening({ name: 'Dr Okeke', label: 'Consultant Anaesthetist', consultant: true });
    expect(o[0]).toBe('Dear Dr Okeke,');
    expect(o.join('\n')).toContain('Good day sir/ma');
    expect(o.join('\n')).toContain('apologies for the intrusion');
    expect(o.join('\n')).toContain('reached out to');
    expect(o.join('\n')).not.toContain('chased');
  });

  it('does not greet the porter, who needs the first line for the job', () => {
    const o = opening({ name: 'Mr Eze', label: 'porter', consultant: false });
    expect(o.join('\n')).toContain('chased');
    expect(o.join('\n')).not.toContain('Good day');
  });

  it('asks the consultant to speak to the residents under him', () => {
    // The actual thing that was asked for. A polite message without this
    // sentence has not done it.
    const a = consultantAsk('Bring the patient now.').join('\n');
    expect(a).toContain('drawing your kind attention');
    expect(a).toContain('residents and registrars working under you');
    expect(a).toContain('do the needful');
  });

  it('keeps exactly one duty in the message, and the right one', () => {
    expect(consultantAsk('Bring the patient now.').join('\n')).toContain('Bring the patient now.');
    expect(standardAsk('Bring the patient now.').join('\n')).toContain('Bring the patient now.');
    expect(askBlock('Bring the patient now.', true)).toEqual(consultantAsk('Bring the patient now.'));
    expect(askBlock('Bring the patient now.', false)).toEqual(standardAsk('Bring the patient now.'));
  });

  it('offers the consultant the alternative of handling it himself', () => {
    expect(consultantAsk('x').join('\n')).toContain('rather handle it personally');
  });

  it('thanks a consultant and nobody else', () => {
    // A chase that ends in thanks reads as though the thing asked for were
    // optional, and for the person who must walk to the ward it is not.
    expect(closing(true).join('')).toContain('Thank you very much');
    expect(closing(false)).toEqual([]);
  });
});

describe('every message builder honours the register', () => {
  const CASES: [string, (role: string) => string][] = [
    ['blocker chase', blockerTo],
    ['assignment chase', assignTo],
    ['team chase', (r) => teamTo(r)],
  ];

  CASES.forEach(([name, build]) => {
    it(`${name}: never says "chased" to a consultant`, () => {
      const m = build('CONSULTANT_ANAESTHETIST');
      expect(m, name).not.toMatch(/being \*?chased/i);
      expect(m, name).toContain('reached out to');
    });

    it(`${name}: greets the consultant`, () => {
      const m = build('CONSULTANT_ANAESTHETIST');
      expect(m, name).toContain('Dear Dr Okeke');
      expect(m, name).toContain('Good day sir/ma');
      expect(m, name).toContain('residents and registrars working under you');
      expect(m, name).toContain('Thank you very much');
    });

    it(`${name}: keeps the blunt version for everybody else`, () => {
      const m = build('ANAESTHETIC_TECHNICIAN');
      expect(m, name).toContain('chased');
      expect(m, name).not.toContain('Good day sir/ma');
      expect(m, name).not.toContain('Thank you very much');
    });
  });

  it('greets the consultant BEFORE putting the case to him', () => {
    // A polite message cannot open with "WHAT IS STOPPING IT".
    const m = blockerTo('CONSULTANT_ANAESTHETIST');
    // indexOf must be found FIRST: a missing greeting returns -1, which is
    // less than any index and would pass an ordering check on its own.
    expect(m.indexOf('Dear Dr Okeke')).toBeGreaterThan(-1);
    expect(m.indexOf('Dear Dr Okeke')).toBeLessThan(m.indexOf('What is stopping it'));
  });

  it('still leads with the problem for everybody else', () => {
    const m = blockerTo('PORTER');
    expect(m.indexOf('What is stopping it')).toBeLessThan(m.indexOf('you are being'));
  });
});

describe('politeness does not soften a single fact', () => {
  it('states the same deadline in both registers', () => {
    const polite = blockerTo('CONSULTANT_ANAESTHETIST');
    const blunt = blockerTo('PORTER');
    const deadline = /must be on the table by \d{2}:\d{2}/;
    expect(polite).toMatch(deadline);
    expect(blunt).toMatch(deadline);
    expect(polite.match(deadline)?.[0]).toBe(blunt.match(deadline)?.[0]);
  });

  it('carries the same standing notice to a consultant', () => {
    expect(blockerTo('CONSULTANT_ANAESTHETIST')).toContain('within one hour of booking');
    expect(assignTo('CONSULTANT_ANAESTHETIST')).toContain('THEATRE EMERGENCY STANDARD');
    expect(teamTo('CONSULTANT_ANAESTHETIST')).toContain('THEATRE EMERGENCY STANDARD');
  });

  it('tells a consultant the review is missing, in the same words', () => {
    expect(assignTo('CONSULTANT_ANAESTHETIST')).toContain('ANAESTHETIC REVIEW: NOT DONE');
    expect(assignTo('ANAESTHETIC_TECHNICIAN')).toContain('ANAESTHETIC REVIEW: NOT DONE');
  });

  it('still names what the case is actually waiting on', () => {
    expect(blockerTo('CONSULTANT_ANAESTHETIST'))
      .toContain(blockerSpec('NO_ANAESTHETIST')!.ask);
  });

  it('does not drop the detail somebody typed', () => {
    expect(blockerTo('CONSULTANT_ANAESTHETIST')).toContain('Both theatres running');
  });
});

describe('the CMAC, who is always written to in that register', () => {
  const build = () => buildCmacMessage({
    recipientName: 'Prof. M',
    recipientLabel: CMAC_LABELS.CMAC,
    facts: { ...FACTS, escalatedByName: 'Dr N', escalatedByRole: 'SURGEON' },
    standing: hourRuleStanding({ requestedAt: new Date(Date.now() - 150 * 60_000) }),
    cmac: cmacStanding({ requestedAt: new Date(Date.now() - 134 * 60_000) }),
    members: [member('CONSULTANT_ANAESTHETIST')],
    review: NO_REVIEW,
    blockers: [],
    responded: 1,
    expected: 5,
  });

  it('greets him and apologises for the hour', () => {
    const m = build();
    expect(m).toContain('Dear Prof. M');
    expect(m).toContain('Good day sir/ma');
    expect(m).toContain('apologies');
  });

  it('asks him to have the residents told to do the needful', () => {
    expect(build()).toContain('residents and registrars under them told to do the needful');
  });

  it('thanks him', () => {
    expect(build()).toContain('Thank you very much sir/ma');
  });

  it('still hands him the numbers and the unvarnished facts', () => {
    const m = build();
    expect(m).toContain('NUMBERS TO REACH THEM');
    expect(m).toContain('+2348031234567');
    expect(m).toContain('NO BLOCKER HAS BEEN RECORDED');
    expect(m).toContain('2 h 14 m ago');
  });
});

describe('the wiring', () => {
  const tone = read('src/lib/emergency/consultantTone.ts');
  const rollCall = read('src/lib/emergency/caseRollCall.ts');
  const chaseTeam = read('src/app/api/emergency-booking/[id]/chase-team/route.ts');
  const blocker = read('src/app/api/emergency-booking/[id]/blocker/route.ts');
  const assign = read('src/app/api/emergency-booking/[id]/chase-assignment/route.ts');

  it('carries the account role from the database to the message', () => {
    // Four hops, each of which silently defaults to "not a consultant" if it
    // is missed: the select, the slot, the roll call member, the builder.
    expect(chaseTeam).toContain('phoneNumber: true, role: true');
    expect(rollCall).toContain('userRole: s.role');
    expect(rollCall).toContain('userRole: booking.surgeon.role ?? null,');
    expect(rollCall).toContain('userRole: booking.anesthetist.role ?? null,');
    expect(read('src/lib/emergency/teamChase.ts')).toContain('userRole: p.userRole ?? null,');
  });

  it('passes the role at every call site that builds a message', () => {
    expect(blocker).toContain('recipientRole: person.role,');
    expect(assign).toContain('recipientRole: target.role,');
  });

  it('keeps the register in one file, so a fifth builder cannot drift', () => {
    ['blockers', 'assignmentChase', 'teamChase'].forEach((f) => {
      expect(read(`src/lib/emergency/${f}.ts`), f)
        .toContain("from './consultantTone'");
    });
    expect(tone).toContain("export const contactVerb");
  });

  it('never hard-codes the polite wording outside that file', () => {
    // The whole point of one register is that it is one register.
    ['blockers', 'assignmentChase', 'teamChase'].forEach((f) => {
      expect(read(`src/lib/emergency/${f}.ts`), f).not.toContain('Good day sir/ma');
    });
  });
});
