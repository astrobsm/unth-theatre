// ============================================================
// Running the analysis: three passes, counted and capped
// ------------------------------------------------------------
// Per-section, then cross-section, then synthesis. Every pass is validated in
// ./validate.ts before anything is stored as a finding, and a run that fails
// validation is kept as FAILED_VALIDATION with its reasons rather than retried
// quietly -- a prompt that has started inventing support is something the
// Chairman needs told, not something to paper over.
//
// MONEY. This spends real money on somebody else's account, per run, at the
// Chairman's click. So: the input is token-counted with the API's own counter
// before anything is sent, the estimate is refused outright above a ceiling,
// and the accumulated cost is re-checked after every single call so a long
// policy cannot run away. The ceiling is an environment variable because the
// right number is the hospital's to choose, not mine.
//
// NO TEMPERATURE. The specification asks for "a low temperature"; the parameter
// is rejected with a 400 on every current model. What it was reaching for --
// output that does not wander -- comes instead from structured outputs, which
// constrain the response to the schema by construction, and from effort, which
// is the real control over how hard the model works.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import prisma from '@/lib/prisma';

import {
  CROSS_SECTION_PROMPT,
  PROMPT_VERSION,
  SYNTHESIS_PROMPT,
  SYSTEM_PROMPT,
  sectionInstruction,
} from './prompt';
import {
  MINIMUM_FOR_ANALYSIS,
  crossSectionSchema,
  sectionAnalysisSchema,
  synthesisSchema,
  type CrossSectionAnalysis,
  type SectionAnalysis,
  type Synthesis,
} from './schema';
import {
  crossSectionInput,
  inputSnapshotHash,
  loadSectionInputs,
  worthAnalysing,
  type SectionInput,
} from './input';
import {
  validateCrossSection,
  validateSectionAnalysis,
  validateSynthesis,
  type Correction,
  type Violation,
} from './validate';

export const MODEL = 'claude-opus-5-5';

/** Claude Opus 5.5, US cents per million tokens. */
const CENTS_PER_M_INPUT = 400;
const CENTS_PER_M_OUTPUT = 2000;

/** Default ceiling for one run: five US dollars. */
const DEFAULT_MAX_CENTS = 500;

/** How many section calls run at once. */
const CONCURRENCY = 4;

const MAX_TOKENS = 16000;

/**
 * Stop starting new section calls after this long and hand back, so the caller
 * can come straight back for the rest.
 *
 * WHY THE RUN IS RESUMABLE AT ALL. Every other long route in this project
 * declares `maxDuration = 60`, which is the ceiling the deployment actually
 * allows. A twenty-two section policy at high effort does not finish in sixty
 * seconds, so a single-shot run would be killed on the cloud node every time --
 * after paying for whatever calls had completed.
 *
 * So the per-section pass banks what it has, returns `done: false`, and the
 * page calls again. A resumed run finds the earlier one by its input snapshot
 * hash and skips the sections already analysed, so nothing is paid for twice.
 * It also means the Chairman watches a count climb instead of a spinner.
 */
const SOFT_DEADLINE_MS = 45_000;

const maxCents = (): number => {
  const raw = Number(process.env.POLICY_ANALYSIS_MAX_CENTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_CENTS;
};

const centsFor = (inputTokens: number, outputTokens: number): number =>
  (inputTokens / 1_000_000) * CENTS_PER_M_INPUT
  + (outputTokens / 1_000_000) * CENTS_PER_M_OUTPUT;

export interface AnalysisOutcome {
  runId: string;
  status: 'RUNNING' | 'VALIDATED' | 'FAILED_VALIDATION' | 'FAILED_API';
  message: string;
  sectionsAnalysed: number;
  sectionsSkipped: number;
  proposedChanges: number;
  corrections: Correction[];
  violations: Violation[];
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  /** False while sections remain; the caller should come straight back. */
  done: boolean;
  remaining: number;
}

interface Usage { inputTokens: number; outputTokens: number }

/** Run `tasks` with a small pool, preserving order. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await work(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

class BudgetExceeded extends Error {}
class Refused extends Error {
  constructor(readonly category: string | null, message: string) {
    super(message);
  }
}

export async function runPolicyAnalysis(opts: {
  roundId: string;
  actorId: string;
  actorName: string;
}): Promise<AnalysisOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set on this deployment, so the analysis cannot run. '
      + 'Set it as a Vercel secret and in the theatre server .env.',
    );
  }

  const allInputs = await loadSectionInputs(opts.roundId);
  const inputs = worthAnalysing(allInputs);

  if (inputs.length === 0) {
    throw new Error(
      'No section has a single response yet, so there is nothing to analyse. '
      + 'Wait for the committee, or check that the round is open.',
    );
  }

  const client = new Anthropic();
  const snapshot = inputSnapshotHash(inputs);

  // Resume the run already under way on this exact input, if there is one. The
  // hash is what makes that safe: a different hash means the committee answered
  // more in between, which is a different analysis and starts afresh.
  const resumable = await prisma.policyAnalysisRun.findFirst({
    where: {
      roundId: opts.roundId,
      status: 'RUNNING',
      inputSnapshotHash: snapshot,
      promptVersion: PROMPT_VERSION,
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true, output: true, inputTokens: true, outputTokens: true },
  });

  const run = resumable
    ?? (await prisma.policyAnalysisRun.create({
      data: {
        roundId: opts.roundId,
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        inputSnapshotHash: snapshot,
        status: 'RUNNING',
        runById: opts.actorId,
        runByName: opts.actorName,
      },
      select: { id: true, output: true, inputTokens: true, outputTokens: true },
    }));

  const bankedOutput = (run.output ?? null) as
    | { sections?: SectionAnalysis[]; corrections?: Correction[] }
    | null;
  const banked: SectionAnalysis[] = bankedOutput?.sections ?? [];
  const bankedCorrections: Correction[] = bankedOutput?.corrections ?? [];
  const alreadyDone = new Set(banked.map((s) => s.section_id));

  // Cost carries forward, so the ceiling bounds the WHOLE analysis rather than
  // each slice of it. Otherwise a run resumed five times could spend five
  // times the cap without any single call noticing.
  const usage: Usage = {
    inputTokens: run.inputTokens ?? 0,
    outputTokens: run.outputTokens ?? 0,
  };
  const ceiling = maxCents();
  const deadline = Date.now() + SOFT_DEADLINE_MS;

  /** The sections this slice still has to do. */
  const todo = inputs.filter((i) => !alreadyDone.has(i.sectionId));

  const spend = () => centsFor(usage.inputTokens, usage.outputTokens);
  const chargeAndCheck = (u?: { input_tokens?: number; output_tokens?: number } | null) => {
    usage.inputTokens += u?.input_tokens ?? 0;
    usage.outputTokens += u?.output_tokens ?? 0;
    if (spend() > ceiling) {
      throw new BudgetExceeded(
        `The run passed its ceiling of ${(ceiling / 100).toFixed(2)} US dollars after `
        + `${Math.round(spend())} cents. Nothing further was sent.`,
      );
    }
  };

  const fail = async (
    status: 'FAILED_API' | 'FAILED_VALIDATION',
    message: string,
    violations: Violation[],
    corrections: Correction[],
  ): Promise<AnalysisOutcome> => {
    await prisma.policyAnalysisRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        validationErrors: { message, violations } as never,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costCents: Math.round(spend()),
      },
    });
    return {
      runId: run.id,
      status,
      message,
      sectionsAnalysed: 0,
      sectionsSkipped: allInputs.length - inputs.length,
      proposedChanges: 0,
      corrections,
      violations,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costCents: Math.round(spend()),
      done: true,
      remaining: 0,
    };
  };

  try {
    // ── Pre-flight: count before spending ──────────────────────────────
    // The API's own counter, not a character estimate: the point of a ceiling
    // is that it is believed, and a guess that is wrong by 40% is not.
    const [systemCount, bodyCount] = await Promise.all([
      client.messages.countTokens({
        model: MODEL,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: 'x' }],
      }),
      client.messages.countTokens({
        model: MODEL,
        // Only what is left to do. On a resumed run the sections already
        // analysed are paid for and banked; counting them again would refuse a
        // run for a cost it is not about to incur.
        messages: [{
          role: 'user',
          content: (todo.length > 0 ? todo : inputs).map((i) => i.rendered).join('\n\n'),
        }],
      }),
    ]);

    const estimatedInput = bodyCount.input_tokens + systemCount.input_tokens * todo.length;
    // A section analysis is a page or two of JSON, not a chapter.
    const estimatedOutput = 2500 * todo.length + 6000;
    // Against what has ALREADY been spent, so the ceiling bounds the whole
    // analysis and not each slice of it.
    const estimate = spend() + centsFor(estimatedInput, estimatedOutput);

    if (estimate > ceiling) {
      return await fail(
        'FAILED_API',
        `This analysis is estimated at about ${(estimate / 100).toFixed(2)} US dollars `
        + `across ${inputs.length} section(s), above the ceiling of `
        + `${(ceiling / 100).toFixed(2)}. Raise POLICY_ANALYSIS_MAX_CENTS if that is `
        + 'acceptable. Nothing further was sent.',
        [],
        [],
      );
    }

    // ── Pass 1: per section, resumable ─────────────────────────────────
    const allViolations: Violation[] = [];
    const allCorrections: Correction[] = [...bankedCorrections];

    const analysed = await pooled(todo, CONCURRENCY, async (input) => {
      // Checked before each call rather than after: a call started past the
      // deadline is a call that gets killed mid-flight and paid for anyway.
      if (Date.now() > deadline) return undefined;

      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Opus 5.5 defaults to medium; this is judgement-heavy clustering of
        // clinicians' prose, so it is set explicitly.
        output_config: {
          effort: 'high',
          format: zodOutputFormat(sectionAnalysisSchema),
        },
        // Opted in by default: on a policy decline the API re-runs the same
        // request on a fallback model inside the same call, so one refused
        // section does not lose the whole run.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `${input.rendered}\n\n${sectionInstruction({
            sectionNumber: input.number,
            sectionTitle: input.title,
            responseCount: input.facts.engagedCount,
            minimumForAnalysis: MINIMUM_FOR_ANALYSIS,
          })}`,
        }],
      });

      chargeAndCheck(response.usage);

      if (response.stop_reason === 'refusal') {
        throw new Refused(
          response.stop_details?.category ?? null,
          `The model declined to analyse section ${input.number ?? input.title}.`,
        );
      }

      const parsed = response.parsed_output as SectionAnalysis | null;
      if (!parsed) {
        throw new Error(
          `The analysis of section ${input.number ?? input.title} came back in a shape `
          + 'that does not match the schema.',
        );
      }

      const verdict = validateSectionAnalysis(parsed, input.facts);
      allCorrections.push(...verdict.corrections);
      if (!verdict.ok) {
        allViolations.push(
          ...verdict.violations.map((v) => ({
            ...v,
            where: `${input.number ? `section ${input.number}` : input.title}`
              + `${v.where ? `, ${v.where}` : ''}`,
          })),
        );
        return null;
      }
      return verdict.analysis;
    });

    if (allViolations.length > 0) {
      return await fail(
        'FAILED_VALIDATION',
        `The analysis was refused: ${allViolations.length} finding(s) could not be traced `
        + 'to the responses on file. Nothing from this run is shown as a finding. '
        + 'Re-run it, and if it fails the same way the prompt needs looking at.',
        allViolations,
        allCorrections,
      );
    }

    const sections = [
      ...banked,
      ...analysed.filter((a): a is SectionAnalysis => a != null),
    ];

    // ── Banked before going further ────────────────────────────────────
    // The per-section pass is the expensive one -- one call per section, and
    // this policy has twenty-two. If the two cheap passes below are then cut
    // off (a serverless function timeout, a dropped connection, a restart),
    // every one of those calls has been paid for and, without this, nothing
    // would have been stored: the run would sit at RUNNING with a null output
    // and the Chairman would press the button again and pay twice.
    //
    // So the validated findings are written now, with the usage so far. The
    // status stays RUNNING, so a cut-off run is still visibly incomplete
    // rather than passing as finished.
    await prisma.policyAnalysisRun.update({
      where: { id: run.id },
      data: {
        output: { sections, corrections: allCorrections, partial: true } as never,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costCents: Math.round(spend()),
      },
    });

    const remaining = inputs.length - sections.length;
    if (remaining > 0) {
      // Out of time, not out of work. The status stays RUNNING, the findings so
      // far are banked, and the caller comes back for the rest.
      return {
        runId: run.id,
        status: 'RUNNING',
        message:
          `Analysed ${sections.length} of ${inputs.length} sections so far. `
          + 'Continuing — nothing already done will be paid for again.',
        sectionsAnalysed: sections.length,
        sectionsSkipped: allInputs.length - inputs.length,
        proposedChanges: 0,
        corrections: allCorrections,
        violations: [],
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costCents: Math.round(spend()),
        done: false,
        remaining,
      };
    }

    // ── Pass 2: cross-section consistency ──────────────────────────────
    const crossResponse = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'high', format: zodOutputFormat(crossSectionSchema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: CROSS_SECTION_PROMPT,
      messages: [{
        role: 'user',
        content: crossSectionInput({
          sections: inputs,
          analyses: sections.map((s) => ({
            sectionId: s.section_id,
            recommendedChanges: [
              ...s.proposed_changes.map((c) => `${c.type}: ${c.proposed_text}`),
              ...s.decision_items
                .filter((d) => d.recommended_value)
                .map((d) => `value for ${d.decision_item_id}: ${d.recommended_value}`),
            ],
          })),
        }),
      }],
    });
    chargeAndCheck(crossResponse.usage);
    if (crossResponse.stop_reason === 'refusal') {
      throw new Refused(
        crossResponse.stop_details?.category ?? null,
        'The model declined the cross-section consistency check.',
      );
    }
    const cross = (crossResponse.parsed_output as CrossSectionAnalysis | null)
      ?? { inconsistencies: [] };

    const knownSectionIds = new Set(allInputs.map((i) => i.sectionId));
    const crossVerdict = validateCrossSection(cross, knownSectionIds);
    if (!crossVerdict.ok) {
      return await fail(
        'FAILED_VALIDATION',
        'The consistency check named sections that are not in this policy.',
        crossVerdict.violations,
        allCorrections,
      );
    }

    // ── Pass 3: synthesis, from the VALIDATED findings only ────────────
    const participation = await prisma.policyInvitation.count({
      where: { roundId: opts.roundId, revokedAt: null },
    });
    const submitted = await prisma.policyInvitation.count({
      where: { roundId: opts.roundId, revokedAt: null, submittedAt: { not: null } },
    });
    const general = await prisma.policyGeneralResponse.findMany({
      where: { roundId: opts.roundId },
      select: {
        overallSupport: true,
        barriers: true,
        resourcesNeeded: true,
        concern1: true,
        concern2: true,
        concern3: true,
        invitation: { select: { inviteeRole: true, inviteeUnit: true } },
      },
    });

    const synthesisResponse = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'high', format: zodOutputFormat(synthesisSchema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYNTHESIS_PROMPT,
      messages: [{
        role: 'user',
        content: [
          `PARTICIPATION: ${submitted} of ${participation} invited members submitted.`,
          '',
          'VALIDATED PER-SECTION FINDINGS:',
          JSON.stringify(sections, null, 1),
          '',
          'CROSS-SECTION INCONSISTENCIES:',
          JSON.stringify(cross.inconsistencies, null, 1),
          '',
          'WHAT EACH UNIT SAID ABOUT ITS OWN BARRIERS:',
          JSON.stringify(
            general.map((g) => ({
              unit: [g.invitation.inviteeRole, g.invitation.inviteeUnit]
                .filter(Boolean).join(', ') || 'Not stated',
              overall_support_1_to_5: g.overallSupport,
              barriers: g.barriers,
              resources_needed: g.resourcesNeeded,
              top_concerns: [g.concern1, g.concern2, g.concern3].filter(Boolean),
            })),
            null,
            1,
          ),
        ].join('\n'),
      }],
    });
    chargeAndCheck(synthesisResponse.usage);
    if (synthesisResponse.stop_reason === 'refusal') {
      throw new Refused(
        synthesisResponse.stop_details?.category ?? null,
        'The model declined to write the synthesis.',
      );
    }
    const synthesis = synthesisResponse.parsed_output as Synthesis | null;
    if (!synthesis) {
      return await fail(
        'FAILED_API',
        'The synthesis came back in a shape that does not match the schema.',
        [],
        allCorrections,
      );
    }

    const allDecisionItemIds = new Set(
      allInputs.flatMap((i) => Array.from(i.facts.decisionItemIds)),
    );
    const synthVerdict = validateSynthesis(synthesis, {
      sectionIds: knownSectionIds,
      decisionItemIds: allDecisionItemIds,
    });
    if (!synthVerdict.ok) {
      return await fail(
        'FAILED_VALIDATION',
        'The synthesis named a section or an open value that is not in this policy.',
        synthVerdict.violations,
        allCorrections,
      );
    }

    // ── Store ──────────────────────────────────────────────────────────
    const changeRows = sections.flatMap((s) =>
      s.proposed_changes.map((c) => ({
        analysisRunId: run.id,
        sectionId: s.section_id,
        type: c.type.toUpperCase() as 'WORDING' | 'VALUE' | 'ADD' | 'REMOVE',
        currentText: c.current_text,
        proposedText: c.proposed_text,
        rationale: c.rationale,
        supportingResponseIds: c.response_ids as never,
        supportStrength: c.support_strength.toUpperCase() as 'STRONG' | 'MODERATE' | 'WEAK',
        clinicalReviewRequired: c.clinical_review_required,
      })));

    await prisma.$transaction([
      prisma.policyAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: 'VALIDATED',
          finishedAt: new Date(),
          output: {
            sections,
            crossSection: cross,
            synthesis,
            corrections: allCorrections,
          } as never,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costCents: Math.round(spend()),
        },
      }),
      ...(changeRows.length > 0
        ? [prisma.policyProposedChange.createMany({ data: changeRows })]
        : []),
      prisma.policyReviewRound.update({
        where: { id: opts.roundId },
        data: { status: 'ANALYSED' },
      }),
    ]);

    return {
      runId: run.id,
      status: 'VALIDATED',
      message:
        `Analysed ${sections.length} section(s). ${changeRows.length} change(s) proposed, `
        + 'each one traceable to the responses it rests on. Nothing is applied until you '
        + 'accept it.',
      sectionsAnalysed: sections.length,
      sectionsSkipped: allInputs.length - inputs.length,
      proposedChanges: changeRows.length,
      corrections: allCorrections,
      violations: [],
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costCents: Math.round(spend()),
      done: true,
      remaining: 0,
    };
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      return fail('FAILED_API', error.message, [], []);
    }
    if (error instanceof Refused) {
      return fail(
        'FAILED_API',
        `${error.message} Safety category: ${error.category ?? 'not stated'}. `
        + 'This is the model declining, not a fault in the responses.',
        [],
        [],
      );
    }
    // Most specific first, so a rate limit is not reported as a bad request.
    if (error instanceof Anthropic.AuthenticationError) {
      return fail('FAILED_API', 'The Anthropic API key was rejected.', [], []);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail(
        'FAILED_API',
        'The Anthropic API rate-limited this run. Wait a few minutes and run it again — '
        + 'nothing from the partial run is stored as a finding.',
        [],
        [],
      );
    }
    if (error instanceof Anthropic.BadRequestError) {
      return fail('FAILED_API', `The API refused the request: ${error.message}`, [], []);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return fail('FAILED_API', 'Could not reach the Anthropic API.', [], []);
    }
    if (error instanceof Anthropic.APIError) {
      return fail('FAILED_API', `Anthropic API error ${error.status}: ${error.message}`, [], []);
    }
    console.error('[policy/analysis] unexpected failure', error);
    return fail(
      'FAILED_API',
      error instanceof Error ? error.message : 'The analysis failed unexpectedly.',
      [],
      [],
    );
  }
}
