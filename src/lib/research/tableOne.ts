// ============================================================
// Table 1: the baseline characteristics table a paper opens with
// ------------------------------------------------------------
// The table every reviewer reads first and almost nobody enjoys building. It
// takes a cohort, splits it by one variable, and reports every other variable
// the way its own type demands — with the right test beside it.
//
// THREE DECISIONS THAT ARE USUALLY GOT WRONG, MADE HERE ONCE:
//
//   NON-PARAMETRIC BY DEFAULT. Operating times, blood loss and recovery stays
//   all have a long right tail; the mean of a skewed distribution is not a
//   typical value and the t-test on it is not valid. This reports a median
//   and an interquartile range and tests with Kruskal-Wallis unless the
//   caller asks otherwise. Where the data really is symmetrical the two
//   agree, so the default costs nothing and the alternative costs a wrong
//   answer on exactly the variables a theatre cares about.
//
//   THE DENOMINATOR IS PER CELL, NOT PER TABLE. A percentage computed over
//   the whole group when a third of it has no value recorded is not a
//   percentage of anything. Every cell carries how many cases it was computed
//   from, and the missing count is a row in its own right rather than a
//   footnote.
//
//   NO p-VALUE ON A VARIABLE THE GROUPS WERE DEFINED BY. Testing whether the
//   emergency group has more emergencies is a tautology that gets printed
//   more often than it should.
// ============================================================

import { describe as summarise } from '@/lib/stats';
import { chiSquare } from '@/lib/stats';
import { kruskalWallis, oneWayAnova, fisherExact } from '@/lib/statsExtra';
import type { ResearchVariable, VariableValue } from './variables';
import { numericValue, categoryValue } from './variables';

export interface TableOneCell {
  /** What is printed: "42 (18.3%)" or "65 [48–78]". */
  display: string;
  /** How many cases in this group had the value at all. */
  recorded: number;
  /** How many were in the group. */
  total: number;
}

export interface TableOneRow {
  key: string;
  label: string;
  unit: string | null;
  kind: 'numeric' | 'categorical';
  /** For a categorical variable, the level this row reports. */
  level?: string;
  /** Indented under its variable heading. */
  isLevel?: boolean;
  cells: Record<string, TableOneCell>;
  overall: TableOneCell;
  /** How many cases had nothing recorded, across the cohort. */
  missing: number;
  pValue: number | null;
  test: string | null;
  /** Why there is no p-value, where there is none. */
  pNote?: string;
}

export interface TableOne {
  groupBy: string;
  groupByLabel: string;
  groups: Array<{ label: string; n: number }>;
  overallN: number;
  ungrouped: number;
  rows: TableOneRow[];
  /** How the numbers should be read, printed under the table. */
  footnotes: string[];
}

const r1 = (x: number | null): string =>
  (x === null || !Number.isFinite(x) ? '—' : String(Math.round(x * 10) / 10));

/** "65 [48–78]" — median and interquartile range, as a paper prints it. */
function numericCell(values: Array<number | null>, total: number): TableOneCell {
  const present = values.filter((v): v is number => v !== null);
  const d = summarise(present);
  return {
    display: present.length === 0 ? '—' : `${r1(d.median)} [${r1(d.q1)}–${r1(d.q3)}]`,
    recorded: present.length,
    total,
  };
}

/** "54.2 (12.1)" — mean and standard deviation, for the parametric option. */
function meanCell(values: Array<number | null>, total: number): TableOneCell {
  const present = values.filter((v): v is number => v !== null);
  const d = summarise(present);
  return {
    display: present.length === 0 ? '—' : `${r1(d.mean)} (${r1(d.sd)})`,
    recorded: present.length,
    total,
  };
}

/** "42 (18.3%)" — count and the percentage OF THE CASES THAT HAD A VALUE. */
function countCell(hits: number, recorded: number, total: number): TableOneCell {
  return {
    display: recorded === 0 ? '—' : `${hits} (${Math.round((hits / recorded) * 1000) / 10}%)`,
    recorded,
    total,
  };
}

export interface TableOneOptions {
  /** Report mean (SD) and use ANOVA instead of median and Kruskal-Wallis. */
  parametric?: boolean;
  /** Levels seen fewer than this many times across the cohort are left out. */
  minLevelCount?: number;
}

/**
 * Build the table.
 *
 * `cases` are the already-read variable values, one record per case keyed by
 * variable key — the same shape the query builder produces, so the table and
 * the exported dataset can never disagree about what a case contained.
 */
export function buildTableOne(
  cases: ReadonlyArray<Record<string, VariableValue>>,
  groupBy: ResearchVariable,
  variables: readonly ResearchVariable[],
  options: TableOneOptions = {},
): TableOne {
  const parametric = options.parametric === true;
  const minLevel = options.minLevelCount ?? 1;

  // Split the cohort. Cases with no value for the grouping variable are
  // COUNTED AND REPORTED, not dropped: a table whose columns do not add up to
  // the cohort is a table somebody will query, correctly.
  const buckets = new Map<string, Array<Record<string, VariableValue>>>();
  let ungrouped = 0;
  cases.forEach((c) => {
    const key = categoryValue(c[groupBy.key]);
    if (key === null) { ungrouped += 1; return; }
    const b = buckets.get(key);
    if (b) b.push(c); else buckets.set(key, [c]);
  });

  const groups = Array.from(buckets.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, list]) => ({ label, n: list.length, list }));

  const rows: TableOneRow[] = [];

  variables.forEach((v) => {
    // Testing whether the emergency group has more emergencies is a tautology
    // that gets printed more often than it should.
    const isGrouping = v.key === groupBy.key;

    if (v.kind === 'numeric') {
      const byGroup = groups.map((g) => ({
        label: g.label,
        values: g.list.map((c) => numericValue(c[v.key])),
      }));
      const all = cases.map((c) => numericValue(c[v.key]));
      const missing = all.filter((x) => x === null).length;
      if (missing === all.length) return;

      const usable = byGroup.filter((g) => g.values.some((x) => x !== null));
      const test = usable.length >= 2 && !isGrouping
        ? (parametric ? oneWayAnova(usable) : kruskalWallis(usable))
        : null;

      const cells: Record<string, TableOneCell> = {};
      byGroup.forEach((g, i) => {
        cells[g.label] = parametric
          ? meanCell(g.values, groups[i].n)
          : numericCell(g.values, groups[i].n);
      });

      rows.push({
        key: v.key,
        label: v.label,
        unit: v.unit ?? null,
        kind: 'numeric',
        cells,
        overall: parametric ? meanCell(all, cases.length) : numericCell(all, cases.length),
        missing,
        pValue: test?.pValue ?? null,
        test: test?.test ?? null,
        pNote: isGrouping ? 'No test: the groups are defined by this variable.' : undefined,
      });
      return;
    }

    // ── Categorical and boolean ──────────────────────────────────
    const levelsAll = cases.map((c) => categoryValue(c[v.key]));
    const missing = levelsAll.filter((x) => x === null).length;
    if (missing === levelsAll.length) return;

    const counts = new Map<string, number>();
    levelsAll.forEach((l) => { if (l !== null) counts.set(l, (counts.get(l) ?? 0) + 1); });
    const levels = Array.from(counts.entries())
      .filter(([, n]) => n >= minLevel)
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l);
    if (levels.length === 0) return;

    const matrix = levels.map((level) => groups.map((g) =>
      g.list.filter((c) => categoryValue(c[v.key]) === level).length));

    let test: { test: string; pValue: number | null } | null = null;
    if (!isGrouping && groups.length >= 2 && levels.length >= 2) {
      const total = matrix.flat().reduce((a, x) => a + x, 0);
      const anySmall = matrix.flat().some((x) => x < 5);
      if (levels.length === 2 && groups.length === 2 && anySmall && total <= 400) {
        // Chi-square is not valid on a sparse 2x2 and will return a p-value
        // anyway. Fisher is exact there.
        test = fisherExact([[matrix[0][0], matrix[0][1]], [matrix[1][0], matrix[1][1]]]);
      } else {
        test = chiSquare(matrix);
      }
    }

    rows.push({
      key: v.key,
      label: v.label,
      unit: null,
      kind: 'categorical',
      cells: Object.fromEntries(groups.map((g) => {
        const recorded = g.list.filter((c) => categoryValue(c[v.key]) !== null).length;
        return [g.label, { display: `n = ${recorded}`, recorded, total: g.n }];
      })),
      overall: {
        display: `n = ${levelsAll.length - missing}`,
        recorded: levelsAll.length - missing,
        total: cases.length,
      },
      missing,
      pValue: test?.pValue ?? null,
      test: test?.test ?? null,
      pNote: isGrouping ? 'No test: the groups are defined by this variable.' : undefined,
    });

    levels.forEach((level, li) => {
      const cells: Record<string, TableOneCell> = {};
      groups.forEach((g, gi) => {
        const recorded = g.list.filter((c) => categoryValue(c[v.key]) !== null).length;
        cells[g.label] = countCell(matrix[li][gi], recorded, g.n);
      });
      rows.push({
        key: `${v.key}:${level}`,
        label: level,
        unit: null,
        kind: 'categorical',
        level,
        isLevel: true,
        cells,
        overall: countCell(counts.get(level) ?? 0, levelsAll.length - missing, cases.length),
        missing: 0,
        pValue: null,
        test: null,
      });
    });
  });

  return {
    groupBy: groupBy.key,
    groupByLabel: groupBy.label,
    groups: groups.map((g) => ({ label: g.label, n: g.n })),
    overallN: cases.length,
    ungrouped,
    rows,
    footnotes: [
      parametric
        ? 'Continuous variables are mean (SD), compared with one-way ANOVA.'
        : 'Continuous variables are median [interquartile range], compared with the '
          + 'Kruskal-Wallis test. Operating times, blood loss and recovery stays are skewed, '
          + 'so a median describes them and a mean does not.',
      'Categorical variables are n (%), compared with the chi-square test, or with Fisher’s '
      + 'exact test where a 2x2 table has a cell below five.',
      'Percentages are of the cases that had the value RECORDED, not of the whole group. The '
      + '"not recorded" count is given for every variable, because a rate computed where a '
      + 'third of the cases are blank measures documentation as much as it measures patients.',
      ...(ungrouped > 0
        ? [`${ungrouped} cases had no value for ${groupBy.label} and are in no column.`]
        : []),
    ],
  };
}
