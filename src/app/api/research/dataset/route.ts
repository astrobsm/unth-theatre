// ============================================================
// The research query builder, over the whole catalogue
// ------------------------------------------------------------
//   GET  ?catalog=1   the variables, grouped by stage of the journey
//   POST {...}        a cohort, its descriptive statistics, a cross-tab and a test
//
// REPLACES A QUERY BUILDER THAT COULD SEE THIRTEEN VARIABLES. The clinical
// record behind it carries several hundred fields across fourteen tables, and
// the thirteen were the ones that happened to be on the surgery row. Every
// variable in the catalogue is now a filter, a grouping, an outcome and an
// export column.
//
// THE DATASET IS STILL ANONYMISED, and more strictly than before: no name, no
// folder number, dates reduced to a month, ages to a band, and the surgeon and
// anaesthetist to stable codes so cohorts stay comparable without anybody
// being named. The training log book next door is the one export that carries
// identifiers, and it is gated and audited separately.
//
// EVERY NUMBER CARRIES ITS OWN DENOMINATOR. A rate computed over a cohort
// where the variable is mostly null is not a rate, it is an artefact of who
// fills in forms — so each summary reports how many cases actually had the
// value as well as the figure itself.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { describe, welchTTest, mannWhitneyU, chiSquare, pearson } from '@/lib/stats';
import {
  oneWayAnova, kruskalWallis, fisherExact, twoByTwo, spearman, linearRegression,
} from '@/lib/statsExtra';
import { RESEARCH_INCLUDE } from '@/lib/research/include';
import { researchScopeFor, withScope } from '@/lib/research/scope';
import { interpret } from '@/lib/research/interpret';
import { interpretLogistic, interpretSurvival, interpretDiagnostic }
  from '@/lib/research/interpretModel';
import { logisticRegression, indicatorColumns, type LogisticResult }
  from '@/lib/research/regression';
import { kaplanMeierByGroup, logRank, type SurvivalCurve } from '@/lib/research/survival';
import { rocCurve, cohensKappa, type RocResult, type AgreementResult }
  from '@/lib/research/diagnostic';
import { buildTableOne } from '@/lib/research/tableOne';
import {
  RESEARCH_VARIABLES, RESEARCH_VARIABLE_COUNT, catalogueForClient, variable,
  numericValue, categoryValue, type VariableValue,
} from '@/lib/research/variables';

export const dynamic = 'force-dynamic';

/** How many cases one query may pull. A guard, not a quota anybody meets. */
const MAX_CASES = 20000;

/** How many rows the dataset returns inline before it asks to be narrowed. */
const MAX_ROWS_RETURNED = 5000;

type Op = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'present' | 'absent';

interface Criterion { field: string; op: Op; value?: string | number | string[] }

function matches(values: Record<string, VariableValue>, c: Criterion): boolean {
  const v = values[c.field];
  if (c.op === 'present') return v !== null && v !== undefined;
  if (c.op === 'absent') return v === null || v === undefined;

  const def = variable(c.field);
  if (!def) return false;

  if (def.kind === 'numeric') {
    const n = numericValue(v);
    if (n === null) return false;
    const target = Number(c.value);
    if (!Number.isFinite(target)) return false;
    switch (c.op) {
      case 'eq': return n === target;
      case 'neq': return n !== target;
      case 'gt': return n > target;
      case 'gte': return n >= target;
      case 'lt': return n < target;
      case 'lte': return n <= target;
      default: return false;
    }
  }

  const s = categoryValue(v);
  if (s === null) return false;
  if (c.op === 'in') {
    const list = Array.isArray(c.value)
      ? c.value
      : String(c.value ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    return list.some((x) => x.toLowerCase() === s.toLowerCase());
  }
  if (c.op === 'eq') return s.toLowerCase() === String(c.value ?? '').toLowerCase();
  if (c.op === 'neq') return s.toLowerCase() !== String(c.value ?? '').toLowerCase();
  return false;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('catalog') === '1') {
    return NextResponse.json({
      count: RESEARCH_VARIABLE_COUNT,
      domains: catalogueForClient(),
    });
  }

  // Distinct values for one categorical variable, so a filter can offer the
  // values that actually occur rather than making somebody guess a spelling.
  const field = searchParams.get('values');
  const def = field ? variable(field) : null;
  if (!def) return NextResponse.json({ error: 'Which variable?' }, { status: 400 });
  if (def.values) return NextResponse.json({ field: def.key, values: def.values });

  // Scoped like every other read here: the values a filter offers must come
  // from the cases this person may see. A value list built over the whole
  // theatre would name diagnoses from cases they cannot open, which is the
  // leak a dropdown makes easy to miss.
  const actorG = session.user as { id?: string; role?: string };
  const scopeG = await researchScopeFor(actorG.id, actorG.role);
  const cases = await prisma.surgery.findMany({
    where: withScope({}, scopeG) as never,
    include: RESEARCH_INCLUDE as never,
    orderBy: { scheduledDate: 'desc' },
    take: 4000,
  });
  const seen = new Map<string, number>();
  (cases as never[]).forEach((c) => {
    const s = categoryValue(def.read(c as never));
    if (s !== null) seen.set(s, (seen.get(s) ?? 0) + 1);
  });

  return NextResponse.json({
    field: def.key,
    values: Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(([value, n]) => ({ value, n })),
  });
}

/** The anonymised export row. See the header for what is deliberately absent. */
function anonymise(
  values: Record<string, VariableValue>,
  index: number,
  code: (prefix: string, name: string | null) => string | null,
): Record<string, VariableValue> {
  const out: Record<string, VariableValue> = { caseId: `C${String(index + 1).padStart(5, '0')}` };
  RESEARCH_VARIABLES.forEach((v) => {
    if (v.key === 'surgeon') { out.surgeonCode = code('S', categoryValue(values[v.key])); return; }
    if (v.key === 'anaesthetist') { out.anaesthetistCode = code('A', categoryValue(values[v.key])); return; }
    // The exact age goes; the band stays. A date of birth cannot be rebuilt
    // from "Adult 40-64", and it very nearly can be from an age in years plus
    // a month and a ward.
    if (v.key === 'ageYears') return;
    out[v.key] = values[v.key];
  });
  return out;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const from: string | undefined = body?.from;
    const to: string | undefined = body?.to;
    const include: Criterion[] = Array.isArray(body?.include) ? body.include : [];
    const exclude: Criterion[] = Array.isArray(body?.exclude) ? body.exclude : [];
    const outcomes: string[] = Array.isArray(body?.outcomes) ? body.outcomes : [];
    const groupBy: string | null = body?.groupBy ?? null;
    const withDataset: boolean = body?.withDataset !== false;

    const where: Record<string, unknown> = {};
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) range.lte = new Date(`${to}T23:59:59.999Z`);
      where.scheduledDate = range;
    }

    // THE CONTROL. Applied in the where clause, not after the rows come back:
    // filtering in memory would mean the other cases were read and counted
    // first, and a denominator or an error message can betray what is in them.
    const actor = session.user as { id?: string; role?: string };
    const scope = await researchScopeFor(actor.id, actor.role);

    const cases = await prisma.surgery.findMany({
      where: withScope(where, scope) as never,
      include: RESEARCH_INCLUDE as never,
      orderBy: { scheduledDate: 'asc' },
      take: MAX_CASES,
    });

    // Read every variable once per case. Reading them per analysis instead
    // would run the accessors a dozen times over the same rows.
    let rows = (cases as never[]).map((c) => {
      const out: Record<string, VariableValue> = {};
      RESEARCH_VARIABLES.forEach((v) => {
        try { out[v.key] = v.read(c as never); } catch { out[v.key] = null; }
      });
      return out;
    });

    if (include.length > 0) rows = rows.filter((r) => include.every((c) => matches(r, c)));
    if (exclude.length > 0) rows = rows.filter((r) => !exclude.some((c) => matches(r, c)));

    // ── Descriptive statistics on the chosen outcomes ───────────────
    const chosen = outcomes.map((k) => variable(k)).filter((v): v is NonNullable<typeof v> => !!v);
    const descriptive: Record<string, unknown> = {};
    chosen.forEach((v) => {
      if (v.kind === 'numeric') {
        const vals = rows.map((r) => numericValue(r[v.key]));
        descriptive[v.key] = {
          kind: 'numeric', label: v.label, unit: v.unit ?? null,
          // The denominator, beside the figure. See the header.
          recorded: vals.filter((x) => x !== null).length,
          total: rows.length,
          ...describe(vals),
        };
      } else {
        const counts: Record<string, number> = {};
        let recorded = 0;
        rows.forEach((r) => {
          const s = categoryValue(r[v.key]);
          if (s === null) return;
          recorded += 1;
          counts[s] = (counts[s] ?? 0) + 1;
        });
        descriptive[v.key] = {
          kind: 'categorical', label: v.label, recorded, total: rows.length, counts,
        };
      }
    });

    // ── A grouped table: every outcome, split by one categorical ────
    let grouped: unknown = null;
    const groupDef = groupBy ? variable(groupBy) : null;
    if (groupDef) {
      const buckets = new Map<string, Array<Record<string, VariableValue>>>();
      rows.forEach((r) => {
        const key = categoryValue(r[groupDef.key]);
        if (key === null) return;
        const b = buckets.get(key);
        if (b) b.push(r); else buckets.set(key, [r]);
      });
      grouped = {
        by: groupDef.key,
        byLabel: groupDef.label,
        // Cases with no value for the grouping variable are counted and
        // reported, not dropped silently: a group-by that quietly loses a
        // third of the cohort is how a denominator goes wrong.
        ungrouped: rows.length - Array.from(buckets.values()).reduce((a, b) => a + b.length, 0),
        groups: Array.from(buckets.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([label, list]) => ({
            label,
            n: list.length,
            outcomes: Object.fromEntries(chosen.map((v) => {
              if (v.kind === 'numeric') {
                const vals = list.map((r) => numericValue(r[v.key]));
                const d = describe(vals);
                return [v.key, {
                  kind: 'numeric', recorded: vals.filter((x) => x !== null).length,
                  mean: d.mean, median: d.median, sd: d.sd, q1: d.q1, q3: d.q3,
                }];
              }
              const yes = list.filter((r) => r[v.key] === true).length;
              const known = list.filter((r) => r[v.key] === true || r[v.key] === false).length;
              return [v.key, {
                kind: 'rate', yes, recorded: known,
                percent: known > 0 ? Math.round((yes / known) * 1000) / 10 : null,
              }];
            })),
          })),
      };
    }

    // ── The statistical test, if one was asked for ──────────────────
    let inferential: unknown = null;
    const t = body?.test;
    if (t?.type) {
      const numDef = t.numericField ? variable(t.numericField) : null;
      const grpDef = t.groupField ? variable(t.groupField) : null;
      const numbersIn = (label: string) => rows
        .filter((r) => categoryValue(r[grpDef!.key]) === label)
        .map((r) => numericValue(r[numDef!.key]));

      if ((t.type === 'ttest' || t.type === 'mannwhitney') && numDef && grpDef && t.groupA && t.groupB) {
        const a = numbersIn(t.groupA);
        const b = numbersIn(t.groupB);
        const res = t.type === 'ttest' ? welchTTest(a, b) : mannWhitneyU(a, b);
        inferential = { ...res, numericField: numDef.key, groupField: grpDef.key,
          groupA: t.groupA, groupB: t.groupB };
      } else if ((t.type === 'anova' || t.type === 'kruskal') && numDef && grpDef) {
        const labels = Array.from(new Set(
          rows.map((r) => categoryValue(r[grpDef.key])).filter((x): x is string => x !== null),
        ));
        const groups = labels.map((label) => ({ label, values: numbersIn(label) }));
        const res = t.type === 'anova' ? oneWayAnova(groups) : kruskalWallis(groups);
        inferential = { ...res, numericField: numDef.key, groupField: grpDef.key };
      } else if ((t.type === 'chisquare' || t.type === 'fisher' || t.type === 'effect')
        && t.rowField && t.colField) {
        const rowDef = variable(t.rowField);
        const colDef = variable(t.colField);
        if (rowDef && colDef) {
          const rowVals = Array.from(new Set(
            rows.map((r) => categoryValue(r[rowDef.key])).filter((x): x is string => x !== null),
          ));
          const colVals = Array.from(new Set(
            rows.map((r) => categoryValue(r[colDef.key])).filter((x): x is string => x !== null),
          ));
          const matrix = rowVals.map((rv) => colVals.map((cv) => rows.filter(
            (r) => categoryValue(r[rowDef.key]) === rv && categoryValue(r[colDef.key]) === cv,
          ).length));

          if (t.type === 'chisquare') {
            inferential = { ...chiSquare(matrix), rowField: rowDef.key, colField: colDef.key,
              rowVals, colVals, matrix };
          } else if (rowVals.length === 2 && colVals.length === 2) {
            const table: [[number, number], [number, number]] =
              [[matrix[0][0], matrix[0][1]], [matrix[1][0], matrix[1][1]]];
            inferential = t.type === 'fisher'
              ? { ...fisherExact(table), rowField: rowDef.key, colField: colDef.key, rowVals, colVals, matrix }
              : { test: 'Effect size', statistic: null, pValue: null,
                ...twoByTwo(table), rowField: rowDef.key, colField: colDef.key, rowVals, colVals, matrix };
          } else {
            // Said plainly rather than returning a figure from the first two
            // rows of a bigger table, which is what a silent slice would do.
            inferential = {
              test: t.type === 'fisher' ? "Fisher's exact test" : 'Effect size',
              statistic: null, pValue: null,
              detail: `This needs a 2x2 table. "${rowDef.label}" has ${rowVals.length} values and `
                + `"${colDef.label}" has ${colVals.length}. Filter them down to two each, or use chi-square.`,
            };
          }
        }
      } else if ((t.type === 'pearson' || t.type === 'spearman' || t.type === 'regression')
        && t.fieldX && t.fieldY) {
        const xDef = variable(t.fieldX);
        const yDef = variable(t.fieldY);
        if (xDef && yDef) {
          const xs = rows.map((r) => numericValue(r[xDef.key]));
          const ys = rows.map((r) => numericValue(r[yDef.key]));
          if (t.type === 'pearson') {
            inferential = { test: 'Pearson correlation', statistic: pearson(xs, ys), pValue: null,
              fieldX: xDef.key, fieldY: yDef.key,
              detail: 'Assumes a straight line. For an ordinal variable such as ASA or wound class, use Spearman.' };
          } else if (t.type === 'spearman') {
            inferential = { ...spearman(xs, ys), fieldX: xDef.key, fieldY: yDef.key };
          } else {
            inferential = { ...linearRegression(xs, ys), fieldX: xDef.key, fieldY: yDef.key,
              detail: `Slope is ${yDef.unit ?? yDef.label} per ${xDef.unit ?? xDef.label}.` };
          }
        }
      } else if (t.type === 'logistic' && t.outcomeField) {
        // Logistic regression. The outcome must be a yes/no variable; each
        // predictor is taken as a number where it is one, and expanded into
        // indicator columns against a reference level where it is a category.
        const outDef = variable(t.outcomeField);
        const chosen: string[] = Array.isArray(t.predictors) ? t.predictors : [];
        const predictorDefs = chosen
          .map((k) => variable(k))
          .filter((v): v is NonNullable<typeof v> => !!v && v.key !== outDef?.key);
        if (outDef && outDef.kind === 'boolean' && predictorDefs.length > 0) {
          const columns: Array<{ name: string; values: Array<number | null> }> = [];
          const references: Array<{ field: string; reference: string }> = [];
          predictorDefs.forEach((v) => {
            if (v.kind === 'numeric') {
              columns.push({ name: v.label, values: rows.map((r) => numericValue(r[v.key])) });
              return;
            }
            if (v.kind === 'boolean') {
              columns.push({
                name: v.label,
                values: rows.map((r) => (r[v.key] === true ? 1 : r[v.key] === false ? 0 : null)),
              });
              return;
            }
            const expanded = indicatorColumns(
              v.label,
              rows.map((r) => categoryValue(r[v.key])),
              typeof t.references?.[v.key] === 'string' ? t.references[v.key] : undefined,
            );
            if (expanded.reference) references.push({ field: v.label, reference: expanded.reference });
            expanded.columns.forEach((c) => columns.push(c));
          });
          const res = logisticRegression({
            outcome: rows.map((r) => (r[outDef.key] === true ? true
              : r[outDef.key] === false ? false : null)),
            predictors: columns,
          });
          inferential = { ...res, outcomeField: outDef.key, references };
        }
      } else if (t.type === 'survival' && t.timeField && t.eventField) {
        // Kaplan-Meier, and the log-rank test when a grouping was named.
        const timeDef = variable(t.timeField);
        const eventDef = variable(t.eventField);
        const byDef = t.groupField ? variable(t.groupField) : null;
        if (timeDef && timeDef.kind === 'numeric' && eventDef && eventDef.kind === 'boolean') {
          const obs = rows.map((r) => ({
            time: numericValue(r[timeDef.key]),
            event: r[eventDef.key] === true ? true : r[eventDef.key] === false ? false : null,
            group: byDef ? categoryValue(r[byDef.key]) : null,
          }));
          const curves = kaplanMeierByGroup(obs);
          const test = byDef ? logRank(obs) : null;
          inferential = {
            test: test?.test ?? 'Kaplan-Meier',
            statistic: test?.statistic ?? null,
            pValue: test?.pValue ?? null,
            df: test?.df ?? null,
            groups: test?.groups ?? null,
            curves,
            timeField: timeDef.key,
            eventField: eventDef.key,
            groupField: byDef?.key ?? null,
            timeUnit: timeDef.unit ?? null,
            detail: test?.detail
              ?? 'One curve. Name a grouping variable to compare curves with the log-rank test.',
          };
        }
      } else if (t.type === 'roc' && t.scoreField && t.outcomeField) {
        const scoreDef = variable(t.scoreField);
        const outDef = variable(t.outcomeField);
        if (scoreDef && scoreDef.kind === 'numeric' && outDef && outDef.kind === 'boolean') {
          const res = rocCurve({
            scores: rows.map((r) => numericValue(r[scoreDef.key])),
            outcome: rows.map((r) => (r[outDef.key] === true ? true
              : r[outDef.key] === false ? false : null)),
            higherIsPositive: t.higherIsPositive !== false,
          });
          inferential = { ...res, scoreField: scoreDef.key, outcomeField: outDef.key };
        }
      } else if (t.type === 'kappa' && t.fieldA && t.fieldB) {
        const aDef = variable(t.fieldA);
        const bDef = variable(t.fieldB);
        if (aDef && bDef && aDef.kind !== 'numeric' && bDef.kind !== 'numeric') {
          const asText = (v: VariableValue) => (v === true ? 'Yes' : v === false ? 'No'
            : categoryValue(v));
          const res = cohensKappa(
            rows.map((r) => asText(r[aDef.key])),
            rows.map((r) => asText(r[bDef.key])),
          );
          inferential = { ...res, fieldA: aDef.key, fieldB: bDef.key };
        }
      }
    }

    // Every test comes back with its result IN WORDS. A p-value on its own is
    // read as a verdict; the interpretation says what it supports, what it
    // does not, and what would weaken it. See src/lib/research/interpret.ts
    // for the rule about never writing "no difference".
    let interpretation: unknown = null;
    if (inferential && (t?.type === 'logistic' || t?.type === 'survival'
      || t?.type === 'roc' || t?.type === 'kappa')) {
      // These four do not reduce to one p-value, so they carry their own
      // interpreters. Handing them to interpret() would print a headline about
      // a statistic that the analysis never produced.
      const r = inferential as Record<string, unknown>;
      const label = (key: unknown) => (typeof key === 'string'
        ? (variable(key)?.label ?? 'the outcome') : 'the outcome');
      if (t.type === 'logistic') {
        interpretation = interpretLogistic(r as unknown as LogisticResult, {
          outcomeLabel: label(t.outcomeField),
          references: (r.references as Array<{ field: string; reference: string }>) ?? [],
        });
      } else if (t.type === 'survival') {
        interpretation = interpretSurvival({
          curves: (r.curves as SurvivalCurve[]) ?? [],
          pValue: (r.pValue as number | null) ?? null,
          statistic: (r.statistic as number | null) ?? null,
          outcomeLabel: label(t.eventField),
          groupLabel: t.groupField ? variable(t.groupField)?.label ?? null : null,
          timeUnit: (r.timeUnit as string | null) ?? null,
        });
      } else if (t.type === 'roc') {
        interpretation = interpretDiagnostic(r as unknown as RocResult, {
          outcomeLabel: label(t.outcomeField),
          scoreLabel: t.scoreField ? variable(t.scoreField)?.label ?? null : null,
        });
      } else {
        interpretation = interpretDiagnostic(r as unknown as AgreementResult, {
          outcomeLabel: label(t.fieldA),
        });
      }
    } else if (inferential) {
      const r = inferential as Record<string, unknown>;
      const numLabel = t?.numericField ? variable(t.numericField)?.label : null;
      const grpLabel = t?.groupField ? variable(t.groupField)?.label
        : (t?.colField ? variable(t.colField)?.label : null);
      const rowLabel = t?.rowField ? variable(t.rowField)?.label : null;
      const effect = (r.oddsRatio as Record<string, unknown> | undefined) ?? null;
      interpretation = interpret({
        test: String(r.test ?? 'Test'),
        statistic: (r.statistic as number | null) ?? null,
        pValue: (r.pValue as number | null) ?? null,
        n: rows.length,
        recorded: Array.isArray(r.groups)
          ? (r.groups as Array<{ n: number }>).reduce((a, g) => a + (g.n ?? 0), 0)
          : rows.length,
        outcomeLabel: numLabel ?? rowLabel ?? 'the outcome',
        groupLabel: grpLabel ?? 'the groups',
        groupCount: Array.isArray(r.groups) ? (r.groups as unknown[]).length
          : (Array.isArray(r.colVals) ? (r.colVals as unknown[]).length : null),
        effect: effect && effect.estimate !== undefined
          ? {
            measure: String(effect.measure ?? 'Effect'),
            estimate: (effect.estimate as number | null) ?? null,
            ci95Lower: (effect.ci95Lower as number | null) ?? null,
            ci95Upper: (effect.ci95Upper as number | null) ?? null,
          }
          : null,
        detail: (r.detail as string | undefined) ?? null,
      });
    }

    // ── Table 1, where one was asked for ───────────────────────────
    let tableOne: unknown = null;
    const t1 = body?.tableOne;
    if (t1?.groupBy) {
      const by = variable(String(t1.groupBy));
      const chosen: string[] = Array.isArray(t1.variables) ? t1.variables : [];
      const vars = chosen
        .map((k) => variable(k))
        .filter((v): v is NonNullable<typeof v> => !!v && v.kind !== 'date');
      if (by && vars.length > 0) {
        tableOne = buildTableOne(rows, by, vars, { parametric: t1.parametric === true });
      }
    }

    const codes = new Map<string, string>();
    let counter = 0;
    const code = (prefix: string, name: string | null): string | null => {
      if (!name) return null;
      const k = `${prefix}:${name}`;
      if (!codes.has(k)) { counter += 1; codes.set(k, `${prefix}${String(counter).padStart(3, '0')}`); }
      return codes.get(k)!;
    };

    return NextResponse.json({
      // Said on every response, so a count that looks small is explained
      // rather than mistaken for a quiet month.
      scope: { kind: scope.kind, explanation: scope.explanation, grant: scope.grant,
        pending: scope.pending },
      count: rows.length,
      scanned: cases.length,
      truncated: cases.length >= MAX_CASES,
      variablesAvailable: RESEARCH_VARIABLE_COUNT,
      descriptive,
      grouped,
      inferential,
      interpretation,
      tableOne,
      dataset: withDataset
        ? rows.slice(0, MAX_ROWS_RETURNED).map((r, i) => anonymise(r, i, code))
        : [],
      datasetTruncated: withDataset && rows.length > MAX_ROWS_RETURNED,
    });
  } catch (err) {
    console.error('[research/dataset] failed:', err);
    return NextResponse.json({ error: 'Could not run the query' }, { status: 500 });
  }
}
