/**
 * Milestone capture.
 *
 * Two movements were recorded in fourteen days across a hospital running full
 * lists daily, so every dashboard built on them is empty. The rules here are
 * what make a one-tap record safe: forgiving of a skipped step, honest about a
 * late entry, and impossible to double-record by accident.
 */
import { describe, expect, it } from 'vitest';

import {
  captureOrder,
  caseState,
  checkBackdate,
  checkSequence,
  isPhase,
  isRecorded,
  MAX_BACKDATE_MINUTES,
  missedPhases,
  nextPhase,
  PHASE_META,
  PHASE_ORDER,
  recordCompleteness,
  type Phase,
} from './theatreOps/milestones';

const NOW = new Date('2026-08-04T10:00:00.000Z');
const at = (m: number) => new Date(NOW.getTime() + m * 60_000);
const rec = (phase: Phase, minutes: number) => ({ phase, timestamp: at(minutes) });

describe('the journey', () => {
  it('runs from the ward to the ward', () => {
    expect(PHASE_ORDER[0]).toBe('WARD');
    expect(PHASE_ORDER[PHASE_ORDER.length - 1]).toBe('RETURNED_TO_WARD');
    expect(PHASE_ORDER.length).toBe(11);
  });

  it('describes every phase', () => {
    for (const p of PHASE_ORDER) {
      expect(PHASE_META[p].label.length).toBeGreaterThan(0);
      expect(PHASE_META[p].hint.length).toBeGreaterThan(0);
    }
  });

  it('recognises its own phases and nothing else', () => {
    expect(isPhase('SURGERY_STARTED')).toBe(true);
    expect(isPhase('KNIFE_TO_SKIN')).toBe(false);
    expect(isPhase(null)).toBe(false);
  });

  it('marks the five the calculations cannot work without', () => {
    const essential = PHASE_ORDER.filter((p) => PHASE_META[p].essential);
    expect(essential).toContain('SURGERY_STARTED');
    expect(essential).toContain('INSIDE_THEATRE');
    expect(essential).toContain('ANAESTHESIA_STARTED');
  });
});

describe('the single obvious next tap', () => {
  it('starts at the beginning for a case with nothing recorded', () => {
    expect(nextPhase([])).toBe('WARD');
  });

  it('offers the step after the furthest point reached', () => {
    expect(nextPhase([rec('WARD', 0), rec('PORTER_DISPATCHED', 5)])).toBe('HOLDING_AREA');
  });

  it('does NOT send the nurse back to fill a gap', () => {
    // THE rule. A theatre that skipped the holding area is offered
    // "anaesthesia", not sent back to a step that has already passed. The gap
    // can be corrected later; the patient on the table cannot wait.
    const recorded = [rec('WARD', 0), rec('INSIDE_THEATRE', 30)];
    expect(nextPhase(recorded)).toBe('ANAESTHESIA_STARTED');
  });

  it('has nothing left to offer once the patient is back on the ward', () => {
    expect(nextPhase(PHASE_ORDER.map((p, i) => rec(p, i)))).toBe(null);
  });
});

describe('gaps', () => {
  it('names what was skipped', () => {
    const recorded = [rec('WARD', 0), rec('INSIDE_THEATRE', 30)];
    expect(missedPhases(recorded)).toEqual(['PORTER_DISPATCHED', 'HOLDING_AREA']);
  });

  it('reports none for a case recorded in full so far', () => {
    expect(missedPhases([rec('WARD', 0), rec('PORTER_DISPATCHED', 5)])).toEqual([]);
  });

  it('reports none for a case not yet started', () => {
    expect(missedPhases([])).toEqual([]);
  });
});

describe('what the coordinator reads down the list', () => {
  it('calls a case with nothing recorded not started', () => {
    expect(caseState([])).toBe('NOT_STARTED');
  });

  it('follows the patient through', () => {
    expect(caseState([rec('PORTER_DISPATCHED', 0)])).toBe('ON_THE_WAY');
    expect(caseState([rec('INSIDE_THEATRE', 0)])).toBe('IN_THEATRE');
    expect(caseState([rec('SURGERY_STARTED', 0)])).toBe('OPERATING');
    expect(caseState([rec('SURGERY_ENDED', 0)])).toBe('FINISHING');
    expect(caseState([rec('RECOVERY_ROOM', 0)])).toBe('COMPLETE');
  });

  it('reads from the furthest milestone, not the last one entered', () => {
    // A nurse catching up may enter the holding area AFTER knife-to-skin.
    // The case is still operating.
    expect(caseState([rec('SURGERY_STARTED', 0), rec('HOLDING_AREA', 5)])).toBe('OPERATING');
  });
});

describe('how complete a case record is', () => {
  it('scores against the essential milestones only', () => {
    // A theatre that records what matters reads as complete rather than being
    // marked down for skipping "on the ward".
    const essentials = PHASE_ORDER.filter((p) => PHASE_META[p].essential);
    const full = recordCompleteness(essentials.map((p, i) => rec(p, i)));
    expect(full.percent).toBe(100);
  });

  it('is zero for a case with nothing recorded', () => {
    expect(recordCompleteness([]).percent).toBe(0);
  });

  it('is partial for a case that stopped halfway', () => {
    const r = recordCompleteness([rec('PORTER_DISPATCHED', 0), rec('INSIDE_THEATRE', 20)]);
    expect(r.percent).toBeGreaterThan(0);
    expect(r.percent).toBeLessThan(100);
  });
});

describe('entering a time that was missed at the moment', () => {
  it('accepts now', () => {
    expect(checkBackdate(NOW, NOW).ok).toBe(true);
  });

  it('accepts earlier in the list', () => {
    expect(checkBackdate(at(-180), NOW).ok).toBe(true);
  });

  it('refuses the future', () => {
    const r = checkBackdate(at(60), NOW);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('future');
  });

  it('tolerates a few seconds of clock drift', () => {
    // Phones are not synchronised. Refusing a record because a handset is two
    // minutes fast would be maddening at the point of care.
    expect(checkBackdate(at(2), NOW).ok).toBe(true);
  });

  it('refuses a typo that lands days ago', () => {
    // An unbounded field invites a slip that quietly poisons every average.
    expect(checkBackdate(at(-(MAX_BACKDATE_MINUTES + 60)), NOW).ok).toBe(false);
  });

  it('refuses something that is not a time at all', () => {
    expect(checkBackdate(new Date('not a date'), NOW).ok).toBe(false);
  });
});

describe('times that contradict each other', () => {
  it('refuses knife-to-skin before the patient entered the room', () => {
    const recorded = [rec('INSIDE_THEATRE', 30)];
    const r = checkSequence(recorded, 'SURGERY_STARTED', at(10));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('cannot be before');
  });

  it('refuses a step timed after one that follows it', () => {
    const recorded = [rec('SURGERY_STARTED', 60)];
    const r = checkSequence(recorded, 'INSIDE_THEATRE', at(90));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('cannot be after');
  });

  it('allows a skipped step to be filled in at a sensible time', () => {
    // Out-of-order RECORDING is fine — theatres catch up. Only impossible
    // TIMES are refused.
    const recorded = [rec('INSIDE_THEATRE', 30), rec('SURGERY_STARTED', 60)];
    expect(checkSequence(recorded, 'ANAESTHESIA_STARTED', at(40)).ok).toBe(true);
  });

  it('has no objection to the first milestone on a case', () => {
    expect(checkSequence([], 'SURGERY_STARTED', NOW).ok).toBe(true);
  });
});

describe('ordering today\'s list', () => {
  const c = (id: string, state: any, scheduledTime: string) => ({ id, state, scheduledTime });

  it('puts the case being operated on first', () => {
    const ordered = captureOrder([
      c('waiting', 'NOT_STARTED', '08:00'),
      c('operating', 'OPERATING', '11:00'),
      c('done', 'COMPLETE', '07:00'),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(['operating', 'waiting', 'done']);
  });

  it('sinks completed cases to the bottom however early they were', () => {
    const ordered = captureOrder([c('done', 'COMPLETE', '06:00'), c('later', 'NOT_STARTED', '15:00')]);
    expect(ordered[0].id).toBe('later');
  });

  it('orders equals by scheduled time', () => {
    const ordered = captureOrder([c('b', 'NOT_STARTED', '12:00'), c('a', 'NOT_STARTED', '09:00')]);
    expect(ordered.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('does not reorder the caller\'s array', () => {
    const input = [c('b', 'COMPLETE', '12:00'), c('a', 'OPERATING', '09:00')];
    captureOrder(input);
    expect(input.map((x) => x.id)).toEqual(['b', 'a']);
  });
});
