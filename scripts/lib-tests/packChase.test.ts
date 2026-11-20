/**
 * Chasing the pack provider and the pharmacy.
 *
 * The rules that matter here are the ones about when NOT to send, because
 * those decide whether anybody still reads the messages in a month. A chase
 * channel that buzzes four phones for a list nobody has built yet is a chase
 * channel that gets muted, and then the one that mattered goes unread too.
 */
import { describe, expect, it } from 'vitest';
import {
  chaseState,
  cooldownProblem,
  packChaseMessage,
  chaseSummary,
  canChasePack,
  outstandingLines,
  liveLines,
  PACK_CHASE_COOLDOWN_MINUTES,
  PACK_CHASE_ROLES,
  CONSUMABLE_ROLES,
  PHARMACY_ROLES,
  type ChaseLine,
} from '../../src/lib/packs/chase';
import { PACK_EDITOR_ROLES } from '../../src/lib/theatreOps/packAmendment';

const line = (name: string, status: string, quantity = 1): ChaseLine => ({
  id: name, name, quantity, status,
});

describe('what is actually outstanding', () => {
  const lines = [
    line('Gloves 7.5', 'REQUESTED', 4),
    line('Diathermy pad', 'PACKING'),
    line('Suction tubing', 'PACKED'),
    line('Drape pack', 'DELIVERED'),
    line('Extra gown', 'CANCELLED'),
  ];

  it('counts a line being picked as still owed', () => {
    // PACKING is the provider having started, not having finished. Counting it
    // as settled is how a pack sits half-picked with nobody chasing it.
    expect(outstandingLines(lines).map((l) => l.name))
      .toEqual(['Gloves 7.5', 'Diathermy pad']);
  });

  it('leaves a withdrawn line out of every count', () => {
    expect(liveLines(lines)).toHaveLength(4);
    const s = chaseState(lines, []);
    expect(s.consumables.total).toBe(4);
    expect(s.consumables.packed).toBe(1);
    expect(s.consumables.delivered).toBe(1);
  });

  it('names the outstanding items with their quantities', () => {
    const s = chaseState(lines, []);
    expect(s.consumables.outstandingNames).toEqual(['Gloves 7.5 ×4', 'Diathermy pad']);
  });
});

describe('when not to chase at all', () => {
  it('refuses, and says so differently, when no list has been built', () => {
    // THE IMPORTANT BRANCH. An empty pack is not a slow provider; it is a list
    // nobody has made. Chasing sends somebody hunting for a request that does
    // not exist, and the person tapping the button is the one who has to act.
    const s = chaseState([], []);
    expect(s.worth).toBe(false);
    expect(s.problem).toContain('Nothing has been requested');
    expect(s.problem).toContain('Build the lists first');
  });

  it('refuses, differently again, when everything is already done', () => {
    const s = chaseState([line('Gloves', 'DELIVERED')], [line('Propofol', 'PACKED')]);
    expect(s.worth).toBe(false);
    expect(s.problem).toContain('Nothing is outstanding');
    // Two refusals that read the same would leave the reader unable to tell a
    // pack that is finished from one that was never asked for.
    expect(s.problem).not.toBe(chaseState([], []).problem);
  });

  it('counts a list of nothing but withdrawn lines as never built', () => {
    const s = chaseState([line('Extra gown', 'CANCELLED')], []);
    expect(s.worth).toBe(false);
    expect(s.problem).toContain('Nothing has been requested');
  });
});

describe('who gets written to', () => {
  it('writes only to the side that is outstanding', () => {
    // The pharmacist cannot do anything about a missing drape, and the pack
    // provider cannot do anything about a missing vial. A message that is
    // mostly somebody else's problem is a message that gets skimmed.
    const onlyDrugs = chaseState([line('Gloves', 'DELIVERED')], [line('Propofol', 'REQUESTED')]);
    expect(onlyDrugs.chase).toEqual(['PHARMACY']);
    expect(onlyDrugs.roles).toEqual(PHARMACY_ROLES);

    const onlyKit = chaseState([line('Gloves', 'REQUESTED')], [line('Propofol', 'DELIVERED')]);
    expect(onlyKit.chase).toEqual(['CONSUMABLE']);
    expect(onlyKit.roles).toEqual(CONSUMABLE_ROLES);
  });

  it('writes to both when both are outstanding', () => {
    const s = chaseState([line('Gloves', 'REQUESTED')], [line('Propofol', 'PACKING')]);
    expect(s.chase).toEqual(['CONSUMABLE', 'PHARMACY']);
    expect(s.roles).toEqual([...CONSUMABLE_ROLES, ...PHARMACY_ROLES]);
  });

  it('never writes to the providers themselves', () => {
    // A provider chasing their own list is not a chase, and would let a late
    // pack be papered over from the inside.
    for (const r of [...CONSUMABLE_ROLES, ...PHARMACY_ROLES]) {
      expect(canChasePack(r), `${r} must not be able to chase`).toBe(false);
    }
  });

  it('lets the people waiting in the room chase, not only the ones who may edit', () => {
    // Deciding what a case needs is a clinical judgement. Asking whether the
    // thing already decided on has been picked is not, and making a scrub
    // nurse find a surgeon first adds a step to the moment with none to spare.
    expect(canChasePack('SCRUB_NURSE')).toBe(true);
    expect(canChasePack('ANAESTHETIC_TECHNICIAN')).toBe(true);
    expect(PACK_EDITOR_ROLES.includes('SCRUB_NURSE')).toBe(false);

    // And everybody who may edit may also chase — the narrower power implying
    // the wider one would be the wrong way round.
    for (const r of PACK_EDITOR_ROLES) {
      expect(PACK_CHASE_ROLES, `${r} may edit but not chase`).toContain(r);
    }
  });

  it('is not case-sensitive about a role', () => {
    expect(canChasePack('surgeon')).toBe(true);
    expect(canChasePack(null)).toBe(false);
    expect(canChasePack('')).toBe(false);
  });
});

describe('the cooldown', () => {
  const now = new Date(2026, 10, 20, 11, 40);

  it('lets a first chase through', () => {
    expect(cooldownProblem(null, now)).toBeNull();
  });

  it('holds a second one briefly, and says when it may go', () => {
    const p = cooldownProblem(new Date(2026, 10, 20, 11, 36), now);
    expect(p).toContain('4 min ago');
    expect(p).toContain(`in ${PACK_CHASE_COOLDOWN_MINUTES - 4} min`);
    // And it never leaves somebody with no way through: the numbers are on the
    // same panel, and the refusal says so.
    expect(p).toContain('ring them');
  });

  it('lets a genuine second chase through once the wait is up', () => {
    const at = new Date(now.getTime() - PACK_CHASE_COOLDOWN_MINUTES * 60_000);
    expect(cooldownProblem(at, now)).toBeNull();
  });

  it('is short, because the honest reason to chase twice is that nobody came', () => {
    expect(PACK_CHASE_COOLDOWN_MINUTES).toBeLessThanOrEqual(15);
  });

  it('reads sensibly a few seconds after a send', () => {
    const p = cooldownProblem(new Date(now.getTime() - 20_000), now);
    expect(p).toContain('less than a minute ago');
    expect(p).not.toContain('0 min ago');
  });
});

describe('the message a provider reads', () => {
  const state = chaseState(
    [line('Gloves 7.5', 'REQUESTED', 4), line('Diathermy pad', 'REQUESTED')],
    [line('Inj. Hydrocortisone', 'REQUESTED', 2)],
  );

  const emergencyText = packChaseMessage({
    list: 'CONSUMABLE',
    state,
    patientName: 'A Patient',
    folderNumber: '123456',
    procedureName: 'Emergency caesarean section',
    theatreName: 'A&E Theatre',
    requiredBy: new Date(2026, 10, 20, 10, 0),
    emergency: true,
    priority: 'HIGH',
    fromName: 'Dr Surgeon',
  });

  it('leads with the emergency and the count, not with a list of items', () => {
    const lines = emergencyText.split('\n');
    expect(lines[0]).toContain('EMERGENCY');
    expect(lines[0]).toContain('HIGH');
    expect(lines[1]).toBe('Consumable pack: 2 items still outstanding.');
  });

  it('carries the time the case has to start', () => {
    // The single most useful line in it, and the one a provider acts on.
    expect(emergencyText).toContain('Required by: 10:00');
  });

  it('writes the time the same way on every machine', () => {
    // toLocaleTimeString prints one way on a laptop and another on the theatre
    // server, and a message is read on neither.
    expect(emergencyText).toMatch(/Required by: \d{2}:\d{2}$/m);
  });

  it('lists only the side it is addressed to', () => {
    expect(emergencyText).toContain('Gloves 7.5 ×4');
    expect(emergencyText).not.toContain('Hydrocortisone');

    const pharmacy = packChaseMessage({ list: 'PHARMACY', state, fromName: 'Dr Surgeon' });
    expect(pharmacy).toContain('Hydrocortisone ×2');
    expect(pharmacy).not.toContain('Gloves');
  });

  it('truncates a long list rather than sending forty bullets to a phone', () => {
    const many = Array.from({ length: 20 }, (_, i) => line(`Item ${i}`, 'REQUESTED'));
    const text = packChaseMessage({
      list: 'CONSUMABLE', state: chaseState(many, []), fromName: 'Dr Surgeon',
    });
    expect(text).toContain('…and 14 more');
    expect(text).toContain('20 items still outstanding');
  });

  it('says who asked', () => {
    expect(emergencyText).toContain('Asked by Dr Surgeon');
  });

  it('does not shout EMERGENCY at an elective case', () => {
    const elective = packChaseMessage({ list: 'CONSUMABLE', state, fromName: 'Dr Surgeon' });
    expect(elective).not.toContain('EMERGENCY');
    expect(elective.split('\n')[0]).toBe('🏥 UNTH Theatre');
  });

  it('survives a case with nothing but a list', () => {
    const bare = packChaseMessage({ list: 'CONSUMABLE', state, fromName: 'Dr Surgeon' });
    expect(bare).not.toContain('undefined');
    expect(bare).not.toContain('null');
    expect(bare).not.toContain('Required by:');
  });
});

describe('the one-line summary', () => {
  it('counts both sides when both are owed', () => {
    const s = chaseState([line('Gloves', 'REQUESTED')], [line('Propofol', 'REQUESTED')]);
    expect(chaseSummary(s)).toBe('1 consumable and 1 pharmacy item outstanding.');
  });

  it('pluralises', () => {
    const s = chaseState([line('a', 'REQUESTED'), line('b', 'REQUESTED')], []);
    expect(chaseSummary(s)).toBe('2 consumables outstanding.');
  });

  it('says so plainly when nothing is', () => {
    expect(chaseSummary(chaseState([], []))).toBe('Nothing outstanding.');
  });
});
