/**
 * The anaesthetic review, seen by everybody on the case.
 *
 * Until now only anaesthetists could see the result. The surgeon learned the
 * patient had been declared unfit when the list did not start; the registrar
 * chasing a crossmatch did not know a review had already asked for one.
 *
 * Two judgements here are easy to get wrong and both make the board useless
 * in opposite directions:
 *
 *   SHOUTING TOO EARLY. Tomorrow's case has until 9pm this evening. A board
 *   that warns at 8am about a review that is not due for thirteen hours
 *   teaches people to scroll past it, and then the real one is missed too.
 *
 *   BEING TOO QUIET. A patient declared NOT FIT with outstanding
 *   requirements is the one item on the board that somebody can usually
 *   clear today, and it has to outrank everything else.
 */
import { describe, expect, it } from 'vitest';

import {
  reviewBadge, isNoteworthy, NOTEWORTHY_STATES,
} from '../../src/lib/dashboard/reviewStatus';
import { reviewDeadline } from '../../src/lib/anaesthesia/reviewWatch';

/** A WAT wall-clock moment as the UTC instant it really is. */
const wat = (iso: string) => new Date(`${iso}+01:00`);

const SURGERY_DAY = '2026-10-15T00:00:00.000Z';

const base = {
  surgeryId: 's1',
  procedureName: 'Inguinal hernia repair',
  patientName: 'ADA OKEKE',
  surgeryDate: SURGERY_DAY,
  status: 'SCHEDULED',
};

describe('a case with no review yet', () => {
  it('stays quiet while the review is not due', () => {
    const b = reviewBadge(base, wat('2026-10-14T08:00:00'));
    expect(b?.state).toBe('PENDING');
    expect(b?.severity).toBe('LOW');
    expect(b?.detail).toMatch(/9pm/);
  });

  it('turns to OVERDUE at the same 9pm the evening watch uses', () => {
    // Deliberately asserted against reviewDeadline itself. If the board and
    // the summons disagreed about when a review was late, one of them would
    // be accusing somebody the other considers on time.
    const due = reviewDeadline(SURGERY_DAY);
    expect(reviewBadge(base, new Date(due.getTime() - 1))?.state).toBe('PENDING');
    expect(reviewBadge(base, due)?.state).toBe('OVERDUE');
  });

  it('says what the consequence is, not just that it is late', () => {
    const b = reviewBadge(base, wat('2026-10-14T22:00:00'));
    expect(b?.severity).toBe('HIGH');
    expect(b?.detail).toMatch(/delay the morning list/);
  });

  it('says nothing when the case has no date', () => {
    expect(reviewBadge({ ...base, surgeryDate: null }, new Date())).toBeNull();
  });
});

describe('a case that was reviewed', () => {
  const reviewed = {
    ...base,
    reviewedAt: wat('2026-10-14T18:00:00'),
    reviewerName: 'Dr Joseph Achi',
  };

  it('reports FIT quietly and names who decided', () => {
    const b = reviewBadge({ ...reviewed, fitnessDecision: 'FIT' }, wat('2026-10-14T19:00:00'));
    expect(b?.state).toBe('FIT');
    expect(b?.severity).toBe('LOW');
    expect(b?.detail).toMatch(/Dr Joseph Achi/);
  });

  it('reports NOT FIT as the most serious thing on the board', () => {
    const b = reviewBadge(
      { ...reviewed, fitnessDecision: 'NOT_FIT', outstandingRequirements: 3 },
      wat('2026-10-14T19:00:00'),
    );
    expect(b?.state).toBe('NOT_FIT');
    expect(b?.severity).toBe('CRITICAL');
    expect(b?.title).toMatch(/NOT FIT/);
    // The number is the actionable part: it says how much is left to clear.
    expect(b?.detail).toMatch(/3 optimisation requirements outstanding/);
  });

  it('counts one requirement in the singular', () => {
    const b = reviewBadge(
      { ...reviewed, fitnessDecision: 'NOT_FIT', outstandingRequirements: 1 },
      wat('2026-10-14T19:00:00'),
    );
    expect(b?.detail).toMatch(/1 optimisation requirement outstanding/);
  });

  it('says so plainly when NOT FIT names nothing that would change it', () => {
    // A case blocked with no stated requirement is a case nobody can unblock,
    // and the board should say that rather than imply a list exists.
    const b = reviewBadge(
      { ...reviewed, fitnessDecision: 'NOT_FIT', outstandingRequirements: 0 },
      wat('2026-10-14T19:00:00'),
    );
    expect(b?.state).toBe('NOT_FIT');
    expect(b?.detail).toMatch(/nothing yet says what would change it/);
  });

  it('distinguishes a review with no decision from one that found the patient fit', () => {
    const b = reviewBadge({ ...reviewed, fitnessDecision: null }, wat('2026-10-14T19:00:00'));
    expect(b?.state).toBe('AWAITING_DECISION');
    expect(b?.severity).toBe('NORMAL');
  });

  it('does not report OVERDUE once a review exists, however late it was', () => {
    const b = reviewBadge(
      { ...reviewed, reviewedAt: wat('2026-10-15T06:00:00'), fitnessDecision: 'FIT' },
      wat('2026-10-15T07:00:00'),
    );
    expect(b?.state).toBe('FIT');
  });
});

describe('cases that are no longer anybody’s problem', () => {
  it('says nothing about a settled case', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'IN_PROGRESS']) {
      expect(reviewBadge({ ...base, status }, wat('2026-10-14T22:00:00')), status).toBeNull();
    }
  });

  it('is not fooled by case', () => {
    expect(reviewBadge({ ...base, status: 'cancelled' }, wat('2026-10-14T22:00:00'))).toBeNull();
  });
});

describe('what earns a line on a busy board', () => {
  it('keeps the three that need somebody to act', () => {
    expect(NOTEWORTHY_STATES).toEqual(['NOT_FIT', 'OVERDUE', 'AWAITING_DECISION']);
  });

  it('leaves out reassurance', () => {
    // On a six-case list, FIT and PENDING are six lines saying nothing is
    // wrong, and a board that is mostly reassurance stops being read.
    const fit = reviewBadge(
      { ...base, reviewedAt: wat('2026-10-14T18:00:00'), fitnessDecision: 'FIT' },
      wat('2026-10-14T19:00:00'),
    );
    expect(isNoteworthy(fit)).toBe(false);
    expect(isNoteworthy(reviewBadge(base, wat('2026-10-14T08:00:00')))).toBe(false);
  });

  it('keeps the unfit patient', () => {
    const unfit = reviewBadge(
      { ...base, reviewedAt: wat('2026-10-14T18:00:00'), fitnessDecision: 'NOT_FIT', outstandingRequirements: 2 },
      wat('2026-10-14T19:00:00'),
    );
    expect(isNoteworthy(unfit)).toBe(true);
  });

  it('handles a null badge', () => {
    expect(isNoteworthy(null)).toBe(false);
  });
});
