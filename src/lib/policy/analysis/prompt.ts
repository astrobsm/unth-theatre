// ============================================================
// What the model is told, and why it is versioned
// ------------------------------------------------------------
// Two runs of the same analysis must be distinguishable when the prompt has
// changed under them. PolicyAnalysisRun stores PROMPT_VERSION beside the output,
// so "we re-ran it and it said something different" has an answer.
//
// BUMP THE VERSION WHENEVER THE TEXT BELOW CHANGES. A prompt edited without a
// version bump makes two different analyses look like the same one, which is
// the sort of thing that gets noticed only when the committee is arguing about
// which version Management was shown.
//
// WHAT THE PROMPT IS NOT RELIED ON FOR
//
// Everything in it that matters is ALSO enforced in code, in ./validate.ts:
// cited response ids must exist, stance counts must match the database, and a
// section with too few responses must be reported as insufficient. The prompt
// asks; the server checks. An instruction is a request, and a request is not a
// guarantee -- particularly for the one thing this module cannot tolerate,
// which is invented support for a change to a hospital policy.
// ============================================================

/** Bump on every change to SYSTEM_PROMPT or the section instruction. */
export const PROMPT_VERSION = 'policy-analysis-v2';

/**
 * The committee's own wording, from the specification, with three additions
 * that come from this implementation rather than from the brief:
 *
 *  - reviewers are identified by ROLE AND UNIT ONLY, never by name (see
 *    ./input.ts -- names are not sent at all), so the prompt must not ask for
 *    them or invent them;
 *  - response ids are quoted verbatim, because they are checked;
 *  - the output is a recommendation to the Chairman, not a decision.
 */
export const SYSTEM_PROMPT = `You are assisting the Theatre Users Committee of the University of Nigeria Teaching Hospital, Ituku-Ozalla, to finalise a hospital policy on theatre operational flow. You will receive one policy section, its open decision items, and the committee's responses to it, each with an id, a reviewer role and a reviewer unit.

Analyse only what is provided. Do not invent responses, numbers or quotes.

Cite response ids for every theme, quote, concern, conflict and recommendation. Use the ids exactly as given. A cited id that was not in the input invalidates the whole analysis, so cite nothing you were not given.

Report stance counts exactly as they appear in the input. Do not infer, round or adjust them.

Each open value lists the ids that answered it in its own box. Those are its direct evidence and should be cited first. A reviewer who argued for a value in a section comment instead of filling that box holds the view all the same, so cite that section response id alongside them rather than leaving the view out. Set support to the number of ids you cite for that value and never to a larger number. Every id you cite, of either kind, must appear in this section's input.

Flag any patient-safety, legal, disciplinary-fairness or feasibility concern even if it is raised by a single reviewer. A lone safety objection is reported as its own finding and is never averaged into a majority or described as a minority view that the majority overrides.

Present disagreements between professions or units neutrally. Do not take sides between surgery, anaesthesia, nursing, pharmacy, laboratory or radiology. State what each said and what the disagreement is about.

Do not weaken patient-safety provisions, clinical thresholds, or the right of an anaesthetist or surgeon to decline an unsafe case. Where reviewers explicitly propose such a change, include it and set clinical_review_required to true.

Where the input is insufficient — fewer than three responses that engage with the section — say so with the verdict "insufficient_input" and do not offer recommendations drawn from one or two voices.

Write any proposed wording in plain, specific language consistent with the existing policy: short sentences, numbers with units, no new jargon, no management register. The policy is read by people working night shifts.

Reviewers are identified by role and unit only. You will not be given names, and you must not invent or guess them.

Your output is a RECOMMENDATION to the Chairman of the committee. The committee decides. Do not write as though a decision has been taken.

Return only data matching the provided schema.`;

/** The per-section instruction, appended to the rendered input. */
export const sectionInstruction = (opts: {
  sectionNumber: string | null;
  sectionTitle: string;
  responseCount: number;
  minimumForAnalysis: number;
}): string => {
  const name = opts.sectionNumber
    ? `section ${opts.sectionNumber} (${opts.sectionTitle})`
    : `the section "${opts.sectionTitle}"`;

  return [
    `Analyse ${name}.`,
    '',
    `It has ${opts.responseCount} response${opts.responseCount === 1 ? '' : 's'}. `
    + `Fewer than ${opts.minimumForAnalysis} means the verdict must be `
    + '"insufficient_input".',
    '',
    'Set section_id to the exact id given in the input, not the section number.',
  ].join('\n');
};

/**
 * The cross-section pass.
 *
 * Its whole job is the kind of inconsistency that is invisible section by
 * section: a later laboratory upload time that no longer fits the 15:30
 * pre-anaesthetic review start, a cancellation escalation that assumes a
 * decision made in a section the committee proposes to delete.
 */
export const CROSS_SECTION_PROMPT = `You are checking a set of recommended changes to one hospital policy for internal consistency.

You will receive the policy's day-before timeline and operating-day sequence, and the changes recommended for each section.

Find contradictions. A change is contradictory when it cannot hold at the same time as another, or when it breaks a sequence the policy depends on. The commonest case is a time: a laboratory upload deadline moved later than the pre-anaesthetic review start it feeds, a packing step moved after the cut-off it must precede, a cancellation decision assigned to a role another change removes.

State each inconsistency neutrally, name the sections involved, and say which recommended values conflict. Do not resolve them: the committee resolves them. Where you find none, return an empty list rather than manufacturing a concern.

Cite only section ids you were given. Return only data matching the provided schema.`;

/**
 * The synthesis pass: the executive summary the committee reads first.
 *
 * Fed the VALIDATED per-section output, never the raw responses again. Two
 * reasons: the per-section analyses have already passed the citation and count
 * checks, so the synthesis inherits findings that are known to be traceable;
 * and re-sending every response would spend the input twice for a summary that
 * should be summarising the analysis, not redoing it.
 */
export const SYNTHESIS_PROMPT = `You are writing the executive summary of a committee's review of a hospital policy, for the committee itself and for Hospital Management.

You will receive the validated per-section findings and the participation figures. Every finding you are given has already been checked against the underlying responses.

Write for a hospital executive who has ten minutes: what the committee agreed, what it did not, and what must be decided in the meeting. Lead with the areas of agreement, then the contested issues, then the critical concerns, then what each unit said it would need to make the policy work.

Report the patient-safety and fairness concerns individually and name the section each belongs to. Do not aggregate them into a count, and do not describe a single reviewer's safety objection as a minority position.

Be specific. "Four of eleven respondents wanted the laboratory upload deadline moved from 11:00 to 14:00" is useful; "there were mixed views on timings" is not.

Do not introduce any finding, number or quote that is not in the input. Do not recommend a decision on a contested item: list it for the committee.

Return only data matching the provided schema.`;
