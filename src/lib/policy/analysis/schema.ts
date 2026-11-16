// ============================================================
// The shape the model must return, and the shape the server checks
// ------------------------------------------------------------
// ONE schema, used twice: handed to the API as the structured-output format so
// the response is schema-valid by construction, and used again on the way back
// as the validator. Two separate definitions would drift, and the one that
// drifted would be the one doing the checking.
//
// NULLABLE, NOT OPTIONAL. Structured outputs want every key present, so a
// field that may have no value is `.nullable()` rather than `.optional()`. A
// missing key and a null value are different failures and only one of them is
// legible.
//
// WHY THIS ONE FILE IMPORTS `zod/v4`
//
// The SDK's `zodOutputFormat` helper is typed against zod 4. This project is on
// zod 3 throughout -- every route, every form -- and bumping a validation
// library across a 184-model application three days before the committee's
// deadline is not a trade worth making.
//
// zod 3.25 ships the v4 API alongside the v3 one under the `zod/v4` subpath, so
// this file uses it and nothing else in the project changes. The alternative
// was hand-writing a JSON Schema for the API and keeping a zod schema for
// validation -- two definitions of one contract, where the one that silently
// drifted would be the one doing the checking. That is exactly the failure this
// file's opening line is about.
// ============================================================

import { z } from 'zod/v4';

export const VERDICTS = [
  'consensus_keep',
  'consensus_change',
  'contested',
  'insufficient_input',
] as const;

export const CONCERN_KINDS = [
  'patient_safety',
  'legal',
  'fairness',
  'feasibility',
] as const;

export const CHANGE_TYPES = ['wording', 'value', 'add', 'remove'] as const;
export const SUPPORT_STRENGTHS = ['strong', 'moderate', 'weak'] as const;

const responseIds = z
  .array(z.string())
  .describe('Ids of the responses this rests on, exactly as given in the input.');

export const stanceCountsSchema = z.object({
  agree: z.number().int().min(0),
  agree_with_changes: z.number().int().min(0),
  disagree: z.number().int().min(0),
  not_my_area: z.number().int().min(0),
});

export const sectionAnalysisSchema = z.object({
  section_id: z.string().describe('The section id from the input, not its number.'),
  stance_counts: stanceCountsSchema,
  verdict: z.enum(VERDICTS),

  themes: z.array(z.object({
    summary: z.string().describe('One line. What this group of comments says.'),
    response_ids: responseIds,
    units: z.array(z.string()).describe('Units these comments came from.'),
  })),

  critical_concerns: z.array(z.object({
    type: z.enum(CONCERN_KINDS),
    summary: z.string(),
    response_ids: responseIds,
  })).describe(
    'Patient-safety, legal, fairness or feasibility concerns, including any '
    + 'raised by a single reviewer.',
  ),

  unit_conflicts: z.array(z.object({
    between: z.array(z.string()).describe('The units that disagree.'),
    issue: z.string().describe('What the disagreement is about, stated neutrally.'),
    response_ids: responseIds,
  })),

  decision_items: z.array(z.object({
    decision_item_id: z.string(),
    current_value: z.string(),
    proposals: z.array(z.object({
      value: z.string(),
      support: z.number().int().min(0),
      response_ids: responseIds,
    })),
    recommended_value: z.string().nullable(),
    rationale: z.string().nullable(),
    status: z.enum(['recommended', 'committee_decision_needed']),
  })),

  proposed_changes: z.array(z.object({
    type: z.enum(CHANGE_TYPES),
    current_text: z.string().nullable(),
    proposed_text: z.string(),
    rationale: z.string(),
    support_strength: z.enum(SUPPORT_STRENGTHS),
    response_ids: responseIds,
    clinical_review_required: z.boolean(),
  })),
});

export type SectionAnalysis = z.infer<typeof sectionAnalysisSchema>;

export const crossSectionSchema = z.object({
  inconsistencies: z.array(z.object({
    summary: z.string(),
    section_ids: z.array(z.string()),
    conflicting_values: z.array(z.string()),
  })),
});

export type CrossSectionAnalysis = z.infer<typeof crossSectionSchema>;

export const synthesisSchema = z.object({
  executive_summary: z.string().describe('Plain prose for a ten-minute read.'),
  areas_of_agreement: z.array(z.string()),
  contested_issues: z.array(z.object({
    summary: z.string(),
    section_ids: z.array(z.string()),
  })),
  critical_concerns: z.array(z.object({
    type: z.enum(CONCERN_KINDS),
    summary: z.string(),
    section_id: z.string().nullable(),
  })),
  unit_barriers: z.array(z.object({
    unit: z.string(),
    barrier: z.string(),
    resources_needed: z.string().nullable(),
  })),
  recommended_decision_values: z.array(z.object({
    decision_item_id: z.string(),
    recommended_value: z.string(),
    note: z.string().nullable(),
  })),
  for_the_meeting: z.array(z.string()).describe(
    'What the committee must settle in the room, because the responses do not.',
  ),
});

export type Synthesis = z.infer<typeof synthesisSchema>;

/**
 * Below this many engaged responses, a section is reported as insufficient
 * rather than analysed.
 *
 * The specification's `[3]` was itself a bracketed open value, so this is the
 * committee's to change — which is why it is a named constant rather than a
 * literal buried in a comparison. "Engaged" excludes NOT_MY_AREA: three people
 * saying a section is not their business is not three views on it.
 */
export const MINIMUM_FOR_ANALYSIS = 3;
