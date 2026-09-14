import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import {
  completeness, distribution, multiDistribution, practiceVariation,
  type Count, type GroupSeries,
} from '@/lib/postop/analytics';

export const dynamic = 'force-dynamic';

/**
 * What this hospital actually does, counted from its own operation notes.
 *
 * SIGNED NOTES ONLY. A draft is not a record of anything and must never reach a
 * denominator.
 *
 * Everything is counted in the database rather than by loading notes into
 * memory. That is not only speed: these are patient records, and an endpoint
 * that answers with aggregates is one that cannot accidentally answer with a
 * patient. Nothing identifiable leaves this route — the outputs are counts,
 * shares and the names of surgical units.
 *
 * Multi-selects are unnested in SQL, because a text[] column counted with
 * GROUP BY would count the exact combination of methods rather than each
 * method, and "diathermy plus suture ligation" is not an answer to "how often
 * is diathermy used".
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const params = req.nextUrl.searchParams;
  const from = params.get('from') ? new Date(String(params.get('from'))) : null;
  const to = params.get('to') ? new Date(String(params.get('to'))) : null;
  const unit = params.get('unit');

  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return NextResponse.json({ error: 'The dates given are not valid.' }, { status: 400 });
  }

  const where = {
    status: 'SIGNED' as const,
    ...(from || to ? { signedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(unit ? { surgery: { unit } } : {}),
  };

  const total = await prisma.postOpNote.count({ where });
  if (total === 0) {
    return NextResponse.json({
      total: 0,
      message: 'No signed structured notes in this period yet.',
      distributions: [], variation: [], completeness: [],
    });
  }

  // ---- Single-valued fields ----------------------------------------------
  // Raw SQL rather than Prisma's groupBy, which cannot take a column name as a
  // variable without defeating its own types. The column is never interpolated
  // from user input: it is one of the constants named below, and COUNTABLE is
  // the whitelist that keeps it that way.
  const COUNTABLE = [
    'hairRemoval', 'woundClass', 'feedingTiming', 'mobilisation',
    'vtePlan', 'wardPosition', 'reviewTiming', 'antibioticPlan', 'analgesiaPlan',
  ] as const;
  type Countable = (typeof COUNTABLE)[number];

  const groupCount = async (field: Countable): Promise<Count[]> => {
    if (!COUNTABLE.includes(field)) return [];
    const rows = await prisma.$queryRawUnsafe<{ value: string; count: bigint }[]>(
      `SELECT n."${field}" AS value, COUNT(*)::bigint AS count
         FROM "post_op_notes" n
        WHERE n."status" = 'SIGNED' AND n."${field}" IS NOT NULL
          ${from ? 'AND n."signedAt" >= $1' : ''}
          ${to ? `AND n."signedAt" <= $${from ? 2 : 1}` : ''}
        GROUP BY n."${field}" ORDER BY count DESC`,
      ...[from, to].filter(Boolean),
    );
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  };

  const [hairRemoval, woundClass, feeding, mobilisation, vte, wardPosition, review] = await Promise.all([
    groupCount('hairRemoval'),
    groupCount('woundClass'),
    groupCount('feedingTiming'),
    groupCount('mobilisation'),
    groupCount('vtePlan'),
    groupCount('wardPosition'),
    groupCount('reviewTiming'),
  ]);

  // ---- Multi-selects, unnested -------------------------------------------
  const unnest = async (column: string): Promise<Count[]> => {
    const rows = await prisma.$queryRawUnsafe<{ value: string; count: bigint }[]>(
      `SELECT v AS value, COUNT(*)::bigint AS count
         FROM "post_op_notes" n, UNNEST(n."${column}") AS v
        WHERE n."status" = 'SIGNED'
          ${from ? 'AND n."signedAt" >= $1' : ''}
          ${to ? `AND n."signedAt" <= $${from ? 2 : 1}` : ''}
        GROUP BY v ORDER BY count DESC`,
      ...[from, to].filter(Boolean),
    );
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  };

  const [haemostasis, closure, dressing, monitoring, escalation, positions] = await Promise.all([
    unnest('haemostasisMethods'),
    unnest('closureMethods'),
    unnest('dressingTypes'),
    unnest('woundMonitoring'),
    unnest('escalationTriggers'),
    unnest('positions'),
  ]);

  // ---- The preparation sequence ------------------------------------------
  // The reason the steps are rows rather than a paragraph. Counted by agent
  // and by the position it held in the sequence, which is the question a
  // paragraph cannot answer at all.
  const prepAgents = await prisma.$queryRaw<{ value: string; count: bigint }[]>`
    SELECT s."agent" AS value, COUNT(*)::bigint AS count
      FROM "post_op_prep_steps" s
      JOIN "post_op_notes" n ON n."id" = s."noteId"
     WHERE n."status" = 'SIGNED' AND s."agent" IS NOT NULL
     GROUP BY s."agent" ORDER BY count DESC`;

  const prepStepCounts = await prisma.$queryRaw<{ steps: number; notes: bigint }[]>`
    SELECT steps, COUNT(*)::bigint AS notes FROM (
      SELECT n."id", COUNT(s."id") FILTER (WHERE s."kind" = 'CLEANSE') AS steps
        FROM "post_op_notes" n
        LEFT JOIN "post_op_prep_steps" s ON s."noteId" = n."id"
       WHERE n."status" = 'SIGNED'
       GROUP BY n."id"
    ) t GROUP BY steps ORDER BY steps`;

  // ---- Practice variation, by surgical unit -------------------------------
  // By UNIT and not by surgeon. Both are computable, and the unit is the one
  // that can be published inside the hospital without turning an audit into a
  // list of named individuals — which is how audit stops being answered
  // honestly. A named comparison is a decision for the audit committee, not a
  // default of the endpoint.
  const unitRows = await prisma.$queryRaw<{ unit: string; value: string; count: bigint; cases: bigint }[]>`
    SELECT su."unit" AS unit, v AS value,
           COUNT(*)::bigint AS count,
           (SELECT COUNT(*)::bigint FROM "post_op_notes" n2
              JOIN "surgeries" s2 ON s2."id" = n2."surgeryId"
             WHERE n2."status" = 'SIGNED' AND s2."unit" = su."unit") AS cases
      FROM "post_op_notes" n
      JOIN "surgeries" su ON su."id" = n."surgeryId",
           UNNEST(n."haemostasisMethods") AS v
     WHERE n."status" = 'SIGNED'
     GROUP BY su."unit", v`;

  const byUnit = new Map<string, GroupSeries>();
  for (const r of unitRows) {
    const g = byUnit.get(r.unit) ?? { group: r.unit, cases: Number(r.cases), counts: [] };
    g.counts.push({ value: r.value, count: Number(r.count) });
    byUnit.set(r.unit, g);
  }

  // ---- Completeness -------------------------------------------------------
  const recorded = async (field: string) =>
    prisma.postOpNote.count({ where: { ...where, NOT: { [field]: null } } as never });

  const [cHair, cWound, cVte, cEscalation, cObsFreq, cFeeding] = await Promise.all([
    prisma.postOpNote.count({ where: { ...where, NOT: { hairRemoval: 'NOT_RECORDED' } } }),
    recorded('woundClass'),
    recorded('vtePlan'),
    prisma.postOpNote.count({ where: { ...where, escalationTriggers: { isEmpty: false } } }),
    recorded('observationFrequency'),
    recorded('feedingTiming'),
  ]);

  return NextResponse.json({
    total,
    scope: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      unit: unit ?? null,
    },
    distributions: [
      distribution('Hair removal', 'HAIR_REMOVAL_STATUS', hairRemoval, total),
      distribution('Wound class', 'WOUND_CLASSES', woundClass, total),
      distribution('Preparation agents used, at any step', 'PREP_AGENTS',
        prepAgents.map((r) => ({ value: r.value, count: Number(r.count) })), total),
      distribution('Oral intake', 'FEEDING_TIMING', feeding, total),
      distribution('Mobilisation', 'MOBILISATION', mobilisation, total),
      distribution('VTE prophylaxis', 'VTE_PLANS', vte, total),
      distribution('Position in the ward', 'WARD_POSITIONS', wardPosition, total),
      distribution('Next review', 'REVIEW_TIMING', review, total),
      multiDistribution('Haemostasis', 'HAEMOSTASIS_METHODS', haemostasis, total),
      multiDistribution('Closure', 'CLOSURE_METHODS', closure, total),
      multiDistribution('Dressing', 'DRESSING_TYPES', dressing, total),
      multiDistribution('Wound monitoring ordered', 'WOUND_MONITORING', monitoring, total),
      multiDistribution('Escalation triggers given', 'ESCALATION_TRIGGERS', escalation, total),
      multiDistribution('Operative position', 'OPERATIVE_POSITIONS', positions, total),
    ],
    cleansingSteps: prepStepCounts.map((r) => ({ steps: Number(r.steps), notes: Number(r.notes) })),
    variation: practiceVariation('HAEMOSTASIS_METHODS', Array.from(byUnit.values())),
    completeness: completeness([
      { field: 'hairRemoval', title: 'Hair removal recorded', recorded: cHair },
      { field: 'woundClass', title: 'Wound class', recorded: cWound },
      { field: 'vtePlan', title: 'VTE prophylaxis addressed', recorded: cVte },
      { field: 'escalationTriggers', title: 'Escalation triggers given', recorded: cEscalation },
      { field: 'observationFrequency', title: 'Observation frequency stated', recorded: cObsFreq },
      { field: 'feedingTiming', title: 'Feeding instruction', recorded: cFeeding },
    ], total),
    caveat:
      'These are counts from routine operation notes. They describe what was recorded, which is not '
      + 'the same as what was done, and they describe practice rather than outcome. Nothing here '
      + 'establishes that one practice causes a different result from another.',
  });
}
