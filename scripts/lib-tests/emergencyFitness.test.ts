/**
 * The emergency assessment has to end in an answer.
 *
 * Asked for on 6 November:
 *
 *   "fix it such that at the end of second step, fitness status will be
 *    selected and recommendation made on what will be done to make the
 *    patient fit, then advice surgeon to optimize and reschedule asap"
 *
 * What was there before: three prose fields, and a box headed "What needs to
 * be optimised before surgery" whose contents the API threw away — zod
 * strips keys it does not declare, and that one was never declared. So the
 * one question the rest of the theatre needs answered, may this patient have
 * this anaesthetic now, was answered nowhere; and the anaesthetist's list of
 * what to fix was typed into a void.
 *
 * The ways this can go wrong, worst first:
 *
 *   NOT FIT WITH NOTHING TO DO. A dead end: the case stalls, nobody owns it,
 *   and no one knows what would change the answer. The same gate the
 *   elective review uses is applied here, in the form AND on the server.
 *
 *   ADVICE THAT READS AS A CANCELLATION. It is not the anaesthetist's call
 *   to communicate, and an emergency whose indication is worsening may still
 *   go unoptimised on a shared decision between two consultants. The message
 *   states the position and what would change it.
 *
 *   THE CASE UNBLOCKING ITSELF. Ticking the items off is evidence for a
 *   reassessment, never a substitute for one.
 *
 * No real patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CATEGORY_LABELS,
  canCompleteReview,
  type OptimisationRequirement,
} from '../../src/lib/anaesthesia/fitness';
import {
  adviceNotificationLine,
  buildSurgeonFitnessAdvice,
  requirementLine,
  targetLabel,
} from '../../src/lib/emergency/fitnessAdvice';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const REQS: OptimisationRequirement[] = [
  {
    category: 'BLOOD_PRODUCTS',
    action: 'Two units crossmatched and physically in theatre before induction',
    responsible: 'Blood bank',
    targetCompletion: '2026-11-06T18:30:00Z',
    priority: 'CRITICAL',
  },
  {
    category: 'ELECTROLYTE_CORRECTION',
    action: 'Correct potassium to above 3.0 and recheck',
    responsible: 'Ward team',
    priority: 'MEDIUM',
  },
];

const FACTS = {
  patientName: 'Test Patient',
  folderNumber: 'F-0002',
  procedureName: 'Exploratory laparotomy',
  theatreName: 'Theatre 2',
  surgeonName: 'Mr A',
  reviewerName: 'Dr B',
  anaestheticPlan: 'General',
  optimisationNeeded: 'Catheterise before transfer',
  riskAssessment: 'Hypokalaemic and anaemic, actively bleeding',
  at: new Date('2026-11-06T17:05:00Z'),
};

// ---------------------------------------------------------------------------

describe('the gate the assessment must pass', () => {
  it('will not complete without a decision', () => {
    const { ok, problems } = canCompleteReview({ decision: null, reviewerId: 'u1' });
    expect(ok).toBe(false);
    expect(problems.join(' ')).toContain('fit for the proposed anaesthesia');
  });

  it('accepts FIT on its own', () => {
    expect(canCompleteReview({ decision: 'FIT', reviewerId: 'u1' }).ok).toBe(true);
  });

  it('refuses NOT FIT with nothing to do', () => {
    // The dead end: a case that stalls with no owner and nobody knowing what
    // would change the answer.
    const { ok, problems } = canCompleteReview({
      decision: 'NOT_FIT', requirements: [], reviewerId: 'u1',
    });
    expect(ok).toBe(false);
    expect(problems.join(' ')).toContain('at least one requirement');
  });

  it('refuses a requirement that is a category with no instruction', () => {
    const { ok, problems } = canCompleteReview({
      decision: 'NOT_FIT',
      requirements: [{ category: 'BLOOD_PRODUCTS', action: 'blood' }],
      reviewerId: 'u1',
    });
    expect(ok).toBe(false);
    expect(problems.join(' ')).toContain('not an instruction');
  });

  it('accepts NOT FIT once there is something to do', () => {
    expect(canCompleteReview({
      decision: 'NOT_FIT', requirements: REQS, reviewerId: 'u1',
    }).ok).toBe(true);
  });
});

describe('one requirement, written out', () => {
  it('carries the category, the instruction, the owner and the target', () => {
    const line = requirementLine(REQS[0], 1);
    expect(line).toContain(CATEGORY_LABELS.BLOOD_PRODUCTS);
    expect(line).toContain('Two units crossmatched');
    expect(line).toContain('who: Blood bank');
    expect(line).toContain('by: 6 Nov, 19:30'); // 18:30 UTC is 19:30 in Lagos
    expect(line).toContain('priority: critical');
  });

  it('does not shout about an ordinary priority', () => {
    expect(requirementLine(REQS[1], 2)).not.toContain('priority');
  });

  it('says nothing where no target was set', () => {
    expect(targetLabel(null)).toBe('');
    expect(targetLabel('not a date')).toBe('');
  });
});

describe('what the surgeon is told when the patient is not fit', () => {
  const text = buildSurgeonFitnessAdvice({
    decision: 'NOT_FIT', requirements: REQS, facts: FACTS,
  });

  it('names the patient, the case and who reviewed them', () => {
    expect(text).toContain('Mr A, Test Patient (F-0002) — Exploratory laparotomy, Theatre 2');
    expect(text).toContain('Dr B reviewed this patient');
    expect(text).toContain('not fit for the proposed anaesthesia as they stand');
  });

  it('lists everything that would change the answer', () => {
    expect(text).toContain('What must be done to make this patient fit (2)');
    expect(text).toContain('Two units crossmatched');
    expect(text).toContain('Correct potassium');
  });

  it('keeps the free-text note the form has always had', () => {
    // The box the API used to discard. It reaches the surgeon now.
    expect(text).toContain('Catheterise before transfer');
  });

  it('asks for optimisation AND re-listing, in one breath, now', () => {
    expect(text).toContain('optimise and re-list as soon as this is done');
    expect(text).toContain('within the hour, not on another day');
  });

  it('says what actually unblocks the case', () => {
    expect(text).toContain('an anaesthetist re-assessing the patient');
    expect(text).toContain('not a substitute for it');
  });

  it('does not tell the surgeon the case is cancelled', () => {
    // Not the anaesthetist's decision to communicate, and an emergency whose
    // indication is worsening may still have to go.
    expect(text).not.toMatch(/cancel/i);
    expect(text).toContain('may proceed');
    expect(text).toContain('must not proceed on silence');
  });

  it('carries the theatre network notice once, and never the Wi-Fi key', () => {
    expect(text.match(/UNTH-THEATRE-ORM/g) ?? []).toHaveLength(1);
    expect(text).not.toContain('93934015');
  });
});

describe('what the surgeon is told when the patient is fit', () => {
  const text = buildSurgeonFitnessAdvice({
    decision: 'FIT', requirements: [], facts: FACTS,
  });

  it('says plainly that nothing is waiting on anaesthesia', () => {
    expect(text).toContain('PATIENT IS FIT');
    expect(text).toContain('Nothing is waiting on anaesthesia');
  });

  it('still reminds them of the hour', () => {
    expect(text).toContain('within the hour of booking');
  });

  it('does not list requirements it does not have', () => {
    expect(text).not.toContain('What must be done');
  });

  it('gives the bell a line for each answer', () => {
    expect(adviceNotificationLine('FIT', [], 'Dr B')).toContain('fit');
    const notFit = adviceNotificationLine('NOT_FIT', REQS, 'Dr B');
    expect(notFit).toContain('2 things must be done');
    expect(notFit).toContain('re-list');
  });
});

describe('the endpoint and the form', () => {
  const api = read('src/app/api/emergency-pre-anaesthetic/route.ts');
  const page = read('src/app/dashboard/emergency-booking/page.tsx');
  const schema = read('prisma/schema.prisma');

  it('stops discarding what the anaesthetist typed about optimisation', () => {
    // The field was on the form and absent from the zod schema, so zod
    // stripped it and the create never saw it.
    expect(api).toContain('optimisationNeeded: z.string()');
    // The write itself, with its trailing comma: the advice block also
    // mentions data.optimisationNeeded, and an assertion that matched that
    // would pass with the column write deleted.
    expect(api).toContain('optimisationNeeded: data.optimisationNeeded,');
  });

  it('records the decision, who made it and when', () => {
    expect(api).toContain('fitnessDecision: data.fitnessDecision');
    expect(api).toContain('fitnessDecidedById: session.user.id');
    expect(schema).toContain('fitnessDecision    AnaestheticFitness?');
  });

  it('keeps the list of what would change the answer', () => {
    expect(api).toContain('optimisationPlan: requirements.length > 0');
    expect(schema).toContain('optimisationPlan   String? @db.Text');
  });

  it('applies the same gate as the form, because a stale page posts the old shape', () => {
    expect(api).toContain('const gate = canCompleteReview({');
    expect(page).toContain('canCompleteReview({');
  });

  it('uses the elective vocabulary rather than inventing a second one', () => {
    expect(api).toContain("from '@/lib/anaesthesia/fitness'");
    expect(page).toContain("from '@/lib/anaesthesia/fitness'");
  });

  it('advises the surgeon, and records that it did', () => {
    expect(api).toContain('buildSurgeonFitnessAdvice({');
    expect(api).toContain('surgeonAdvisedAt: new Date()');
    expect(schema).toContain('surgeonAdviceText String?');
  });

  it('never throws out of the advice, because the review is already saved', () => {
    expect(api).toContain('could not advise the surgeon');
  });

  it('asks the question at the end of step 2, and nowhere else', () => {
    expect(page).toContain('Fitness for the proposed anaesthesia');
    expect(page).toContain('{reviewStep === 2 && (');
  });

  it('will not let the review be submitted without an answer', () => {
    expect(page).toContain('disabled={submittingReview || reviewProblems.length > 0}');
  });

  it('opens a first requirement the moment NOT FIT is chosen', () => {
    expect(page).toContain("setFitnessDecision('NOT_FIT')");
    expect(page).toContain('rs.length > 0 ? rs : [{');
  });

  it('sends the requirements with the review', () => {
    expect(page).toContain('payload.optimisationRequirements');
  });

  it('hands the advice back as a wa.me link, because the queue is not a delivery', () => {
    expect(api).toContain('advice = {');
    expect(page).toContain('whatsappLink(fitnessAdvice.whatsapp.number, fitnessAdvice.text)');
  });
});
