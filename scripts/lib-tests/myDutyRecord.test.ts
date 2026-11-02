import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildDutyReport, CHASE_RATE, COMMENDATION_RATE } from '../../src/lib/dutyPerformance/report';
import { DUTIES, DUTY_KEYS, type DutyEvent, type DutyKey } from '../../src/lib/dutyPerformance/types';
import {
  MIN_RANKED_FOR_RANK, bandOf, myHeadline, myStanding, onTimeShare, rankLabel,
  sortMine, summariseMine, type MyDutyStanding,
} from '../../src/lib/dutyPerformance/myRecord';

// What a colleague is being told about themselves on their own dashboard. The
// ways of getting it wrong are telling somebody their record is fine while
// their manager's board offers a button to chase them about it, putting a
// position on screen that is really a comparison with one named colleague, and
// opening with congratulations above a row saying two discharges were never
// recorded.

const WINDOW = { from: '2026-10-01', to: '2026-10-31' };

const ev = (over: Partial<DutyEvent> = {}): DutyEvent => ({
  id: Math.random().toString(36).slice(2),
  personId: 'u1',
  personName: 'Nurse Chinwe Eze',
  unit: 'GENERAL_SURGERY',
  label: 'Eneh Abigail (F/1234) — Laparotomy',
  dueAt: '2026-10-10T09:00:00.000Z',
  doneAt: '2026-10-10T08:30:00.000Z',
  ...over,
});

/** n events for one person: `onTime` on time, `late` late, `missed` never done. */
const spread = (
  personId: string,
  name: string,
  onTime: number,
  late: number,
  missed: number,
): DutyEvent[] => {
  const out: DutyEvent[] = [];
  for (let i = 0; i < onTime; i += 1) {
    out.push(ev({ personId, personName: name, doneAt: '2026-10-10T08:00:00.000Z' }));
  }
  for (let i = 0; i < late; i += 1) {
    out.push(ev({ personId, personName: name, doneAt: '2026-10-10T18:00:00.000Z' }));
  }
  for (let i = 0; i < missed; i += 1) {
    out.push(ev({ personId, personName: name, doneAt: null }));
  }
  return out;
};

const reportFor = (duty: DutyKey, events: DutyEvent[]) =>
  buildDutyReport(duty, events, WINDOW);

describe('the band a colleague is shown agrees with what their manager can send', () => {
  it('calls a record excellent at exactly the commendation threshold', () => {
    // 9 of 10 on time is 90%, and COMMENDATION_RATE is the bar the thank-you
    // is gated on. If these two ever disagree, somebody is told they are
    // merely "keeping up" by the same system that just commended them.
    const r = reportFor('SURGERY_TIMING', spread('u1', 'A', 9, 1, 0));
    const p = r.people[0];
    expect(onTimeShare(p)).toBeCloseTo(COMMENDATION_RATE, 10);
    expect(bandOf(p)).toBe('EXCELLENT');
    expect(p.commendable).toBe(true);
  });

  it('calls a record falling behind exactly where a chase becomes available', () => {
    // 6 of 10 is below CHASE_RATE; the route refuses a chase at or above it.
    const r = reportFor('SURGERY_TIMING', spread('u1', 'A', 6, 2, 2));
    const p = r.people[0];
    expect(onTimeShare(p)!).toBeLessThan(CHASE_RATE);
    expect(bandOf(p)).toBe('NEEDS_ATTENTION');
  });

  it('does not call somebody falling behind while they sit on the chase line', () => {
    // Exactly 70%: the route declines a chase here, so the card must not
    // tell them they are behind.
    const r = reportFor('SURGERY_TIMING', spread('u1', 'A', 7, 2, 1));
    const p = r.people[0];
    expect(onTimeShare(p)).toBeCloseTo(CHASE_RATE, 10);
    expect(bandOf(p)).toBe('GOOD');
  });

  it('counts work never done against the share, not around it', () => {
    // The single most important rule in the whole module: somebody who did
    // nothing must not score 100%.
    const r = reportFor('SURGERY_TIMING', spread('u1', 'A', 0, 0, 8));
    const p = r.people[0];
    expect(onTimeShare(p)).toBe(0);
    expect(bandOf(p)).toBe('NEEDS_ATTENTION');
  });

  it('scores nobody on one or two instances', () => {
    const r = reportFor('SURGERY_TIMING', spread('u1', 'A', 0, 0, 2));
    const p = r.unranked[0];
    expect(bandOf(p)).toBe('TOO_FEW');
  });
});

describe('the position, and when it is withheld', () => {
  it('withholds a position when there is nobody much to compare with', () => {
    expect(rankLabel(2, 2)).toBeNull();
    expect(rankLabel(1, 1)).toBeNull();
  });

  it('shows one once enough colleagues are ranked', () => {
    expect(rankLabel(1, 3)).toBe('1st of 3');
    expect(rankLabel(4, 11)).toBe('4th of 11');
  });

  it('spells the awkward ordinals correctly', () => {
    expect(rankLabel(2, 9)).toBe('2nd of 9');
    expect(rankLabel(3, 9)).toBe('3rd of 9');
    expect(rankLabel(11, 20)).toBe('11th of 20');
    expect(rankLabel(12, 20)).toBe('12th of 20');
    expect(rankLabel(13, 20)).toBe('13th of 20');
    expect(rankLabel(21, 30)).toBe('21st of 30');
    expect(rankLabel(22, 30)).toBe('22nd of 30');
  });

  it('puts the best record first and reports its position as first', () => {
    const events = [
      ...spread('u1', 'Behind', 4, 1, 3),
      ...spread('u2', 'Best', 8, 0, 0),
      ...spread('u3', 'Middle', 6, 1, 1),
    ];
    const r = reportFor('SURGERY_TIMING', events);
    const best = myStanding('SURGERY_TIMING', r, 'u2')!;
    const behind = myStanding('SURGERY_TIMING', r, 'u1')!;
    expect(best.rank).toBe(1);
    expect(best.ofRanked).toBe(3);
    expect(behind.rank).toBe(3);
  });

  it('gives an unranked colleague figures but no position', () => {
    const events = [...spread('u1', 'A', 5, 0, 0), ...spread('u2', 'Barely', 1, 0, 1)];
    const r = reportFor('SURGERY_TIMING', events);
    const barely = myStanding('SURGERY_TIMING', r, 'u2')!;
    expect(barely.total).toBe(2);
    expect(barely.rank).toBeNull();
    expect(barely.band).toBe('TOO_FEW');
  });
});

describe('whose record it is', () => {
  it('returns nothing for a colleague with no work in the period', () => {
    const r = reportFor('SURGERY_TIMING', spread('u1', 'A', 4, 0, 0));
    expect(myStanding('SURGERY_TIMING', r, 'someone-else')).toBeNull();
  });

  it('never picks up work that has no name against it', () => {
    // Unattributed work is a data problem, and it must not be handed to a
    // colleague who happens to be asking about themselves.
    const r = reportFor('SURGERY_TIMING', [
      ...spread('u1', 'A', 3, 0, 0),
      ev({ personId: null, personName: null, doneAt: null }),
    ]);
    const mine = myStanding('SURGERY_TIMING', r, 'u1')!;
    expect(mine.total).toBe(3);
    expect(r.outstanding).toBe(1); // still visible on the board
  });
});

describe('the line at the top of the card', () => {
  const standing = (over: Partial<MyDutyStanding>): MyDutyStanding => ({
    duty: 'SURGERY_TIMING', label: 'Recording start and end of surgery',
    owner: 'Theatre nurses', where: 'x', whyShort: 'y',
    total: 10, done: 10, outstanding: 0, late: 0, onTime: 10,
    completionRate: 1, punctualityRate: 1, onTimeShare: 1,
    rank: 1, ofRanked: 5, band: 'EXCELLENT', perfect: true, headline: '',
    ...over,
  });

  it('leads with outstanding work, because that is the part still fixable', () => {
    const line = myHeadline(summariseMine([
      standing({ outstanding: 2, done: 8, onTimeShare: 0.8, band: 'GOOD', perfect: false }),
    ]));
    expect(line).toMatch(/2 things of yours are still not recorded/);
  });

  it('never opens with praise over a duty that is behind', () => {
    // An excellent record beside a neglected one is not "well done", and a
    // card that congratulates above a row of unrecorded work reads as a
    // system that is not paying attention.
    const line = myHeadline(summariseMine([
      standing({}),
      standing({
        duty: 'PACU_DISCHARGE', label: 'Recording a discharge from recovery',
        outstanding: 3, done: 5, total: 8, onTimeShare: 0.5,
        band: 'NEEDS_ATTENTION', perfect: false,
      }),
    ]));
    expect(line).not.toMatch(/on time\.$/);
    expect(line).toMatch(/3 things/);
  });

  it('says so plainly when everything was done on time', () => {
    expect(myHeadline(summariseMine([standing({})]))).toMatch(/All 10 of your duties/);
  });

  it('separates "all recorded but often late" from "all on time"', () => {
    const line = myHeadline(summariseMine([
      standing({ late: 4, onTime: 6, onTimeShare: 0.6, band: 'NEEDS_ATTENTION', perfect: false }),
    ]));
    expect(line).toMatch(/running late more often than not/);
  });

  it('says nothing was assigned rather than inventing a perfect record', () => {
    expect(myHeadline(summariseMine([]))).toMatch(/Nothing recorded against you/);
  });

  it('offers a best position only where one is worth showing', () => {
    const tiny = summariseMine([standing({ rank: 1, ofRanked: 2 })]);
    expect(tiny.bestRank).toBeNull();
    const real = summariseMine([standing({ rank: 2, ofRanked: 7 })]);
    expect(real.bestRank?.rank).toBe(2);
  });
});

describe('the order the duties are read in', () => {
  const s = (over: Partial<MyDutyStanding>): MyDutyStanding => ({
    duty: 'SURGERY_TIMING', label: 'A', owner: '', where: '', whyShort: '',
    total: 5, done: 5, outstanding: 0, late: 0, onTime: 5,
    completionRate: 1, punctualityRate: 1, onTimeShare: 1,
    rank: null, ofRanked: 0, band: 'GOOD', perfect: false, headline: '',
    ...over,
  });

  it('puts what is behind above what is fine', () => {
    const sorted = sortMine([
      s({ label: 'Fine', band: 'EXCELLENT' }),
      s({ label: 'Behind', band: 'NEEDS_ATTENTION' }),
      s({ label: 'Keeping up', band: 'GOOD' }),
    ]);
    expect(sorted.map((x) => x.label)).toEqual(['Behind', 'Keeping up', 'Fine']);
  });

  it('within a band, puts the most outstanding work first', () => {
    const sorted = sortMine([
      s({ label: 'One', band: 'GOOD', outstanding: 1 }),
      s({ label: 'Four', band: 'GOOD', outstanding: 4 }),
    ]);
    expect(sorted[0].label).toBe('Four');
  });

  it('sinks the duties too small to score to the bottom', () => {
    const sorted = sortMine([
      s({ label: 'Tiny', band: 'TOO_FEW', outstanding: 9 }),
      s({ label: 'Fine', band: 'EXCELLENT' }),
    ]);
    expect(sorted[0].label).toBe('Fine');
  });
});

// ── The drift guardrails ────────────────────────────────────────────────────
//
// Every role and roster category in the duty registry is a free string, and
// free strings drift from the enums they are supposed to name. That has
// already happened once in this codebase: a duty whose audience was spelled
// with roles that do not exist was shown to nobody at all, silently, for its
// whole life. These two tests read the enums out of the schema rather than
// comparing against a copy, so a renamed role breaks a test instead of
// quietly emptying a recipient list.

const SCHEMA = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');

function enumValues(name: string): string[] {
  const m = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(SCHEMA);
  if (!m) throw new Error(`enum ${name} not found in prisma/schema.prisma`);
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l));
}

describe('every duty names roles and rosters that really exist', () => {
  const roles = enumValues('UserRole');
  const categories = enumValues('StaffCategory');

  it('found the enums it is checking against', () => {
    expect(roles).toContain('ANAESTHETIC_TECHNICIAN');
    expect(roles).toContain('RECOVERY_ROOM_NURSE');
    expect(categories).toContain('RECOVERY_NURSES');
  });

  it('declares no role that is not a UserRole', () => {
    const bad: string[] = [];
    DUTY_KEYS.forEach((k) => {
      DUTIES[k].roles.forEach((r) => {
        if (roles.indexOf(r) === -1) bad.push(`${k}: ${r}`);
      });
    });
    expect(bad).toEqual([]);
  });

  it('gives every duty at least one role that can receive its message', () => {
    // A duty with no roles has no legitimate recipient, so the chase for it
    // can only ever reach somebody it was not meant for.
    DUTY_KEYS.forEach((k) => {
      expect(DUTIES[k].roles.length).toBeGreaterThan(0);
    });
  });

  it('declares no roster category that is not a StaffCategory', () => {
    const bad: string[] = [];
    DUTY_KEYS.forEach((k) => {
      const c = DUTIES[k].rosterCategory;
      if (c && categories.indexOf(c) === -1) bad.push(`${k}: ${c}`);
    });
    expect(bad).toEqual([]);
  });
});

describe('the duties added for theatre readiness, recovery and availability', () => {
  const added: DutyKey[] = [
    'THEATRE_READINESS', 'PATIENT_RECEPTION', 'PACU_ADMISSION',
    'PACU_DISCHARGE', 'CASE_AVAILABILITY',
  ];

  it('are all in the registry and in the key list', () => {
    added.forEach((k) => {
      expect(DUTY_KEYS).toContain(k);
      expect(DUTIES[k].key).toBe(k);
    });
  });

  it('tells each one where the work is recorded and why it matters', () => {
    added.forEach((k) => {
      expect(DUTIES[k].where.length).toBeGreaterThan(0);
      expect(DUTIES[k].whyShort.length).toBeGreaterThan(0);
      expect(DUTIES[k].ask.length).toBeGreaterThan(0);
      // A chase without steps assumes the reader knows where the button is.
      // Repeatedly, they did not.
      expect(DUTIES[k].steps.length).toBeGreaterThan(2);
    });
  });

  it('asks the technicians for readiness and the recovery nurses for recovery', () => {
    expect(DUTIES.THEATRE_READINESS.roles).toEqual(['ANAESTHETIC_TECHNICIAN']);
    expect(DUTIES.PACU_ADMISSION.roles).toEqual(['RECOVERY_ROOM_NURSE']);
    expect(DUTIES.PACU_DISCHARGE.roles).toEqual(['RECOVERY_ROOM_NURSE']);
  });

  it('asks everybody on a team about their own availability', () => {
    // It is the one duty here that is not one department's.
    expect(DUTIES.CASE_AVAILABILITY.roles.length).toBeGreaterThan(4);
    expect(DUTIES.CASE_AVAILABILITY.rosterCategory).toBeNull();
  });

  it('promises in writing that recovery discharge is not a speed measure', () => {
    // The hazard this duty carries is that somebody later "improves" the
    // deadline into one derived from length of stay, which would put
    // pressure on a nurse to move a patient out of recovery sooner. The
    // promise is part of the text sent to staff, so the test holds it there.
    const d = DUTIES.PACU_DISCHARGE;
    expect(d.why).toMatch(/Nothing here asks anybody to discharge a patient sooner/);
    expect(d.whyShort).toMatch(/never a quicker discharge/);
    // And it is generous about when the entry itself is due.
    expect(d.graceMinutes).toBeGreaterThanOrEqual(60);
  });

  it('does not treat a late answer on availability as a refusal', () => {
    const d = DUTIES.CASE_AVAILABILITY;
    expect(d.steps.join(' ')).toMatch(/Delayed is not a failure/);
    expect(d.steps.join(' ')).toMatch(/Unavailable in good time is a help/);
  });
});

describe('the floor for showing a position is a real constant', () => {
  it('is at least three, so a position is never a comparison with one person', () => {
    expect(MIN_RANKED_FOR_RANK).toBeGreaterThanOrEqual(3);
  });
});
