/**
 * The analysis that turns a morning of argument into a sequence.
 *
 * Two things are being protected, and they pull in opposite directions.
 *
 * It must CATCH the contradictions a room cannot hold: a decision adopted on
 * the strength of another that was turned down an hour later; three decisions
 * each waiting on the next; an adopted action with nobody's name against it.
 * Those survive into the minute and are discovered months later by whoever
 * tries to act on them.
 *
 * And it must DECIDE NOTHING. Every line it emits has to trace back to
 * something a named person recorded in the room. The moment it starts picking
 * between proposals, or writing decisions nobody took, the document stops
 * being a governance record — and it stops being one precisely when somebody
 * challenges it, which is the only time it matters.
 */
import { describe, expect, it } from 'vitest';

import {
  analyse, findGaps, sequence, buildResolution, isActionable,
  AGENDA_TEMPLATE, AREA_LABEL, OUTCOME_LABEL, PROPOSAL_REFERENCE,
  type IssueInput, type DecisionInput,
} from '../../src/lib/audit/conference';

const issue = (
  ordinal: number,
  over: Partial<IssueInput> = {},
  decision?: Partial<DecisionInput> | null,
): IssueInput => ({
  id: `i${ordinal}`,
  ordinal,
  title: `Point ${ordinal}`,
  area: 'OTHER',
  decision: decision === null || decision === undefined
    ? null
    : {
        outcome: 'ADOPTED',
        decisionText: `Resolved something about point ${ordinal}`,
        ownerName: 'Dr Nwosu',
        dueDate: '2026-10-01',
        dependsOnIssueIds: [],
        ...decision,
      },
  ...over,
});

const codes = (issues: IssueInput[]) => findGaps(issues).map((f) => f.code);

describe('points that were never decided', () => {
  it('blocks adoption', () => {
    const a = analyse([issue(1), issue(2, {}, {})]);
    expect(a.blocking.some((f) => f.code === 'NO_DECISION')).toBe(true);
    expect(a.readyToAdopt).toBe(false);
  });

  it('names them, so nobody hunts through twenty pages', () => {
    const f = findGaps([issue(1), issue(2, {}, {}), issue(3)])
      .find((x) => x.code === 'NO_DECISION')!;
    expect(f.message).toContain('1, 3');
    expect(f.ordinals).toEqual([1, 3]);
  });

  it('carries them forward in the resolution rather than dropping them', () => {
    const text = buildResolution({
      title: 'Theatre restructure', sittingDate: '2026-09-21', chairName: 'Prof. Okonkwo',
      issues: [issue(1, { title: 'Late starts' }), issue(2, {}, {})],
    });
    expect(text).toContain('CARRIED FORWARD');
    expect(text).toContain('Late starts');
  });
});

describe('adopted, but nothing will happen', () => {
  it('blocks when nobody is named to carry it out', () => {
    const a = analyse([issue(1, {}, { ownerName: null })]);
    expect(a.blocking.map((f) => f.code)).toContain('NO_OWNER');
  });

  it('warns, but does not block, when there is no date', () => {
    const a = analyse([issue(1, {}, { dueDate: null })]);
    expect(codes([issue(1, {}, { dueDate: null })])).toContain('NO_DUE_DATE');
    // A date can be settled by the owner afterwards; an owner cannot.
    expect(a.readyToAdopt).toBe(true);
  });

  it('does not demand an owner for something nobody has to do', () => {
    // Rejected, noted and referred points commit nobody, so an owner would be
    // a name against an action that does not exist.
    for (const outcome of ['REJECTED', 'NOTED'] as const) {
      expect(codes([issue(1, {}, { outcome, ownerName: null })])).not.toContain('NO_OWNER');
    }
  });

  it('blocks when "adopted with modification" does not say what changed', () => {
    // The modification IS the decision.
    const a = analyse([issue(1, {}, {
      outcome: 'ADOPTED_WITH_MODIFICATION', decisionText: 'Agreed',
    })]);
    expect(a.blocking.map((f) => f.code)).toContain('MODIFICATION_NOT_STATED');
  });
});

describe('decisions that contradict each other', () => {
  it('catches an adoption resting on something that was turned down', () => {
    // The clearest contradiction a conference produces and the one most easily
    // missed: point 2 was adopted because point 1 was going to happen, and
    // point 1 was then rejected.
    const rejected = issue(1, {}, { outcome: 'REJECTED' });
    const dependent = issue(2, {}, { dependsOnIssueIds: ['i1'] });
    const f = findGaps([rejected, dependent]).find((x) => x.code === 'DEPENDS_ON_NOT_ADOPTED')!;
    expect(f.level).toBe('blocking');
    expect(f.ordinals).toEqual([2, 1]);
    expect(f.message).toContain('One of the two has to change');
  });

  it('catches an adoption resting on a point never decided', () => {
    const f = findGaps([issue(1), issue(2, {}, { dependsOnIssueIds: ['i1'] })]);
    expect(f.map((x) => x.code)).toContain('DEPENDS_ON_UNDECIDED');
  });

  it('catches three points each waiting on the next', () => {
    const a = analyse([
      issue(1, {}, { dependsOnIssueIds: ['i3'] }),
      issue(2, {}, { dependsOnIssueIds: ['i1'] }),
      issue(3, {}, { dependsOnIssueIds: ['i2'] }),
    ]);
    expect(a.blocking.map((f) => f.code)).toContain('CIRCULAR_DEPENDENCY');
    expect(a.sequence.circular).toHaveLength(3);
    expect(a.readyToAdopt).toBe(false);
  });

  it('refuses to break a loop by picking one itself', () => {
    // Choosing which of three mutually-blocking decisions goes first IS a
    // decision, and this does not make those.
    const a = analyse([
      issue(1, {}, { dependsOnIssueIds: ['i2'] }),
      issue(2, {}, { dependsOnIssueIds: ['i1'] }),
    ]);
    expect(a.sequence.steps).toHaveLength(0);
    const text = buildResolution({
      title: 'T', sittingDate: '2026-09-21', chairName: 'C',
      issues: [
        issue(1, {}, { dependsOnIssueIds: ['i2'] }),
        issue(2, {}, { dependsOnIssueIds: ['i1'] }),
      ],
    });
    expect(text).toContain('NOT SEQUENCED');
    expect(text).toContain('must say which of them goes first');
  });

  it('catches a deadline set before the thing it waits on', () => {
    const f = findGaps([
      issue(1, {}, { dueDate: '2026-12-01' }),
      issue(2, {}, { dueDate: '2026-10-01', dependsOnIssueIds: ['i1'] }),
    ]);
    expect(f.map((x) => x.code)).toContain('DUE_BEFORE_PREREQUISITE');
  });
});

describe('the order things can actually be done in', () => {
  it('puts what waits on nothing first', () => {
    const s = sequence([
      issue(1, {}, { dependsOnIssueIds: ['i2'] }),
      issue(2, {}, {}),
    ]);
    expect(s.steps.map((x) => x.issue.ordinal)).toEqual([2, 1]);
    expect(s.steps.map((x) => x.phase)).toEqual([1, 2]);
  });

  it('keeps agenda order within a stage, so it reads against the minute', () => {
    const s = sequence([issue(3, {}, {}), issue(1, {}, {}), issue(2, {}, {})]);
    expect(s.steps.map((x) => x.issue.ordinal)).toEqual([1, 2, 3]);
    expect(s.steps.every((x) => x.phase === 1)).toBe(true);
  });

  it('sequences only what somebody agreed to do', () => {
    // A rejected point has no implementation to order, and including it would
    // produce a plan containing things nobody agreed to.
    const s = sequence([
      issue(1, {}, { outcome: 'REJECTED' }),
      issue(2, {}, { outcome: 'DEFERRED' }),
      issue(3, {}, {}),
    ]);
    expect(s.steps.map((x) => x.issue.ordinal)).toEqual([3]);
  });

  it('is not held hostage by a dependency that was rejected', () => {
    // Already reported as a contradiction; it must not ALSO stall the sequence
    // and leave the chair with an empty plan and no explanation.
    const s = sequence([
      issue(1, {}, { outcome: 'REJECTED' }),
      issue(2, {}, { dependsOnIssueIds: ['i1'] }),
    ]);
    expect(s.steps.map((x) => x.issue.ordinal)).toEqual([2]);
    expect(s.circular).toHaveLength(0);
  });

  it('records what each step follows', () => {
    const s = sequence([
      issue(1, {}, {}),
      issue(2, {}, {}),
      issue(3, {}, { dependsOnIssueIds: ['i1', 'i2'] }),
    ]);
    expect(s.steps.find((x) => x.issue.ordinal === 3)!.after).toEqual([1, 2]);
  });
});

describe('the resolution', () => {
  const full = () => buildResolution({
    title: 'Theatre structural review',
    sittingDate: '2026-09-21',
    venue: 'Theatre seminar room',
    chairName: 'Prof. Okonkwo',
    issues: [
      issue(1, { title: 'Close the list at 14:00' }, {
        decisionText: 'The elective list closes at 14:00 the day before.',
        ownerName: 'Theatre Manager', dueDate: '2026-10-01',
        resourceImplication: 'A booking officer on each unit',
      }),
      issue(2, { title: 'Second anaesthetic machine' }, {
        decisionText: 'A second machine is commissioned for Theatre 3.',
        ownerName: 'Biomedical Engineer', dueDate: '2026-11-15',
        dependsOnIssueIds: ['i1'],
      }),
      issue(3, { title: 'Move the coffee machine' }, {
        outcome: 'REJECTED', decisionText: 'Not agreed.', rationale: 'No space.',
        ownerName: null, dueDate: null,
      }),
    ],
  });

  it('numbers the actions in the order they can be carried out', () => {
    const t = full();
    expect(t.indexOf('closes at 14:00')).toBeLessThan(t.indexOf('second machine is commissioned'));
  });

  it('names who is responsible and by when, against each one', () => {
    expect(full()).toContain('responsible: Theatre Manager');
    expect(full()).toContain('by 1 October 2026');
  });

  it('says what a step follows, so nobody starts it early', () => {
    expect(full()).toContain('follows point 1');
  });

  it('records what was NOT agreed, rather than leaving it out', () => {
    // Left out, the same proposal returns at the next sitting with nobody able
    // to say it was already considered.
    const t = full();
    expect(t).toContain('ALSO RESOLVED');
    expect(t).toContain('Move the coffee machine');
    expect(t).toContain('Reason: No space.');
  });

  it('carries the resource implication into the document', () => {
    expect(full()).toContain('Requires: A booking officer on each unit');
  });

  it('says so plainly when nothing was committed to', () => {
    const t = buildResolution({
      title: 'T', sittingDate: '2026-09-21', chairName: 'C',
      issues: [issue(1, {}, { outcome: 'NOTED' })],
    });
    expect(t).toContain('No decision at this sitting commits the department to an action.');
  });

  it('never prints an undefined or a blank date', () => {
    const t = buildResolution({
      title: 'T', sittingDate: '2026-09-21', chairName: 'C',
      issues: [issue(1, {}, { dueDate: null, ownerName: null, resourceImplication: null })],
    });
    expect(t).not.toMatch(/undefined|null|NaN|Invalid Date/);
  });

  it('is stable — the same conference produces the same resolution', () => {
    // An audit document that varies between runs cannot be relied on when it
    // is challenged, which is the only moment it matters.
    expect(full()).toBe(full());
  });
});

describe('it does not decide anything', () => {
  const withOptions = [
    issue(1, { title: 'Option A', proposal: 'Do it this way' }, { outcome: 'DEFERRED', reviewOn: '2026-11-01' }),
    issue(2, { title: 'Option B', proposal: 'Do it that way' }, { outcome: 'DEFERRED', reviewOn: '2026-11-01' }),
  ];

  it('does not pick a winner between two deferred proposals', () => {
    const a = analyse(withOptions);
    expect(a.sequence.steps).toHaveLength(0);
    expect(a.counts.adopted).toBe(0);
  });

  it('emits no action nobody recorded', () => {
    const t = buildResolution({
      title: 'T', sittingDate: '2026-09-21', chairName: 'C', issues: withOptions,
    });
    // Every actionable line must come from a recorded decision; with none
    // adopted there must be no agreed action at all.
    expect(t).not.toContain('Agreed actions');
    expect(t).toContain('No decision at this sitting commits');
  });

  it('reports a deferral with no return date rather than choosing one', () => {
    const f = findGaps([issue(1, {}, { outcome: 'DEFERRED', reviewOn: null })]);
    const d = f.find((x) => x.code === 'DEFERRED_NO_RETURN')!;
    expect(d.level).toBe('advisory');
    expect(d.message).toContain('how a point is lost');
  });
});

describe('observations about the room', () => {
  it('notices one person carrying the whole conference', () => {
    const many = [1, 2, 3, 4].map((n) => issue(n, {}, { ownerName: 'Sister Okeke' }));
    const f = findGaps(many).find((x) => x.code === 'OWNER_OVERLOADED')!;
    expect(f.level).toBe('advisory');
    expect(f.message).toContain('Sister Okeke is named on 4');
  });

  it('does not nag about three', () => {
    const three = [1, 2, 3].map((n) => issue(n, {}, { ownerName: 'Sister Okeke' }));
    expect(codes(three)).not.toContain('OWNER_OVERLOADED');
  });

  it('puts what blocks adoption above what merely advises', () => {
    const f = findGaps([
      issue(1, {}, { dueDate: null }),
      issue(2, {}, { ownerName: null }),
    ]);
    expect(f[0].level).toBe('blocking');
  });
});

describe('counting the sitting', () => {
  it('counts each outcome separately', () => {
    const a = analyse([
      issue(1, {}, {}),
      issue(2, {}, { outcome: 'REJECTED' }),
      issue(3, {}, { outcome: 'DEFERRED', reviewOn: '2026-11-01' }),
      issue(4, {}, { outcome: 'REFERRED', referredTo: 'Management board' }),
      issue(5, {}, { outcome: 'NOTED' }),
      issue(6),
    ]);
    expect(a.counts).toMatchObject({
      points: 6, decided: 5, adopted: 1, rejected: 1, deferred: 1, referred: 1, noted: 1,
    });
  });

  it('will not call an empty agenda ready to adopt', () => {
    // It would produce a resolution resolving nothing, signed by the chair.
    expect(analyse([]).readyToAdopt).toBe(false);
  });

  it('counts "adopted with modification" as an action', () => {
    expect(isActionable('ADOPTED_WITH_MODIFICATION')).toBe(true);
    expect(isActionable('DEFERRED')).toBe(false);
    expect(isActionable(null)).toBe(false);
  });
});

describe('the agenda is the Theatre Team submission', () => {
  it('carries every one of the eleven prayers', () => {
    // The prayers are the decisions actually before the Chief Medical
    // Director. A point dropped here is a decision the sitting never takes.
    const titles = AGENDA_TEMPLATE.map((t) => t.title).join(' | ');
    for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11]) {
      expect(titles).toContain(`Prayer ${n} `);
    }
    // Prayer 8 is split, because the submission's own timetable separates the
    // direction on payment (immediate) from the revolving fund (ninety days),
    // and a committee that cannot adopt one without the other is being asked
    // the wrong question.
    expect(titles).toContain('Prayer 8a');
    expect(titles).toContain('Prayer 8b');
  });

  it('cites the submission it comes from', () => {
    expect(PROPOSAL_REFERENCE).toContain('UNTH/THTR/TT/CMD/2026/09-02');
  });

  it('files each prayer where the submission puts it, not under Other', () => {
    // A proposal mis-filed is a proposal the committee cannot find.
    const byArea = new Set(AGENDA_TEMPLATE.map((t) => t.area));
    expect(byArea.has('INFECTION_PREVENTION')).toBe(true);
    expect(byArea.has('EMERGENCY_PATHWAY')).toBe(true);
    expect(byArea.has('DIAGNOSTIC_AND_SUPPORT')).toBe(true);
    expect(byArea.has('FINANCE_AND_REVENUE')).toBe(true);
    expect(byArea.has('GOVERNANCE')).toBe(true);
    expect(byArea.has('OTHER')).toBe(false);
    AGENDA_TEMPLATE.forEach((t) => expect(AREA_LABEL[t.area]).toBeTruthy());
  });

  it('states for each what happens now and what is asked for', () => {
    AGENDA_TEMPLATE.forEach((t) => {
      expect(t.background.length).toBeGreaterThan(80);
      expect(t.currentPractice.length).toBeGreaterThan(40);
      expect(t.proposal.length).toBeGreaterThan(80);
    });
  });

  it('carries over the submission\u2019s disclosures about what the app cannot yet do', () => {
    // Made expressly so that Management would not be given to understand the
    // position was further advanced than it is. Dropping them here would undo
    // that, and the committee would ratify an appraisal drawn from records
    // that do not exist.
    const disclosures = AGENDA_TEMPLATE.filter((t) => t.background.includes('DISCLOSED IN THE SUBMISSION'));
    expect(disclosures.length).toBeGreaterThanOrEqual(2);
    const all = AGENDA_TEMPLATE.map((t) => `${t.title} ${t.background} ${t.proposal}`).join(' ');
    expect(all).toContain('radiology');
    expect(all).toContain('surgical site infection');
  });

  it('keeps the safeguards the submission attached to its own prayers', () => {
    const all = AGENDA_TEMPLATE.map((t) => t.proposal).join(' ');
    // Provision before prohibition on attire; escalation rather than a
    // unilateral power to close a theatre; no diminution of entitlement on
    // reintegration. Each was a deliberate qualification, and a summary that
    // loses them misrepresents what was asked for.
    expect(all).toContain('FOLLOW provision and not precede it');
    expect(all).toContain('escalation rather than unilateral closure');
    expect(all).toContain('diminution of entitlement');
  });

  it('does not put a figure where the submission declined to', () => {
    // The decision-to-delivery interval is expressly left to the Department of
    // Obstetrics and Gynaecology to recommend and Management to adopt, so it
    // gets its own point and that point must not quietly supply a number.
    const dtd = AGENDA_TEMPLATE.find((t) => t.title.includes('decision-to-delivery'))!;
    expect(dtd).toBeTruthy();
    expect(dtd.background).toContain('declines to propose the figure');
    const everything = AGENDA_TEMPLATE.map((t) => t.proposal).join(' ');
    expect(everything).not.toMatch(/\b(15|20|30|45|60)\s*minutes\b/);
  });

  it('puts every ask on the agenda, not only the prayers', () => {
    // The sitting takes the points one after another, so anything absent here
    // is a decision the conference never makes. These are the asks the
    // submission makes outside its numbered prayers.
    const titles = AGENDA_TEMPLATE.map((t) => t.title).join(' | ');
    for (const ask of [
      'Legal Unit',                       // paragraph 2 preliminary
      'Costed attire schedule',           // paragraph 4 resource box, 14 days
      'turnover interval',                // paragraph 5(f)
      'two-source appraisal',             // paragraph 6 and Appendix C
      'Appendix A',                       // the emergency location recording table
      'decision-to-delivery',             // paragraph 7.2(d)
      'Vulnerable Group Fund',            // paragraph 2(b)
      'reported monthly',                 // paragraph 11(b), the ten measures
      'Appendix B',                       // the establishment sought
      'Provision within the application',  // paragraphs 6 and 8(f)
      'implementation timetable',         // paragraph 12
    ]) {
      expect(titles).toContain(ask);
    }
  });

  it('keeps the document order, with the phasing taken last', () => {
    // The preliminary first because prayer 8b turns on it; the phasing last so
    // the sitting settles what it is doing before it settles when.
    expect(AGENDA_TEMPLATE[0].title).toContain('Preliminary');
    expect(AGENDA_TEMPLATE[AGENDA_TEMPLATE.length - 1].title).toContain('implementation timetable');

    const prayerAt = (n: string) =>
      AGENDA_TEMPLATE.findIndex((t) => t.title.startsWith(`Prayer ${n} `));
    const order = ['1', '2', '3', '4', '5', '6', '7'].map(prayerAt);
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Each consequential sits directly with the prayer it belongs to.
    expect(AGENDA_TEMPLATE[prayerAt('2') + 1].title).toContain('Prayer 2, consequential');
  });

  it('brings no decision with it', () => {
    // The prayers are stated because they are what was prayed for. The column
    // beside each stays empty until somebody in the room fills it in.
    AGENDA_TEMPLATE.forEach((t) => {
      expect(t).not.toHaveProperty('decision');
      expect(t).not.toHaveProperty('outcome');
      expect(t).not.toHaveProperty('ownerName');
    });
  });

  it('has a label for every outcome', () => {
    (['ADOPTED', 'ADOPTED_WITH_MODIFICATION', 'REJECTED', 'DEFERRED', 'REFERRED', 'NOTED'] as const)
      .forEach((o) => expect(OUTCOME_LABEL[o]).toBeTruthy());
  });
});
