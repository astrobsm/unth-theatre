// ============================================================
// Kaplan-Meier survival, and the log-rank test
// ------------------------------------------------------------
// WHY A SURVIVAL ANALYSIS AND NOT A PROPORTION. "Thirty per cent died" is not
// an answer to "how do these patients do", because it silently assumes every
// patient was followed for the same length of time. They never are: a patient
// operated on last week and alive today has not survived, they have not been
// followed. Treating that as a success inflates the figure; dropping them
// loses the most recent cases, which are usually the ones being asked about.
//
// CENSORING is the mechanism that handles it honestly. A patient contributes
// to the denominator for exactly as long as they were observed, and then
// leaves it without being counted as either outcome.
//
// THE MEDIAN IS OFTEN NOT REACHED, and the module says so rather than
// printing the largest observed time. Where fewer than half the patients have
// had the event, the median survival is simply not estimable from this data —
// and reporting the longest follow-up instead, which is a common error, says
// the opposite of the truth.
//
// THE LOG-RANK compares whole curves rather than a single time point. Picking
// the time point after seeing the data is how two curves that cross get
// reported as a difference.
// ============================================================

export interface SurvivalPoint {
  time: number;
  /** Still at risk immediately before this time. */
  atRisk: number;
  events: number;
  censored: number;
  /** Kaplan-Meier estimate of survival after this time. */
  survival: number;
  ci95Lower: number;
  ci95Upper: number;
}

export interface SurvivalCurve {
  label: string;
  n: number;
  events: number;
  censored: number;
  points: SurvivalPoint[];
  /** Null where fewer than half the patients had the event. */
  medianSurvival: number | null;
  /** Said out loud, because "not reached" is a result, not a gap. */
  medianNote: string;
  /** Survival at the end of follow-up. */
  finalSurvival: number | null;
  maxFollowUp: number | null;
}

export interface SurvivalObservation {
  /** Time from the start to the event or to the last follow-up. */
  time: number | null | undefined;
  /** True = the event happened. False = still alive/well when last seen. */
  event: boolean | null | undefined;
  /** Optional grouping, for comparing curves. */
  group?: string | null;
}

export interface LogRankResult {
  test: 'Log-rank';
  statistic: number | null;
  pValue: number | null;
  df: number | null;
  groups: Array<{ label: string; observed: number; expected: number; n: number }>;
  detail?: string;
}

/** Wilson-Hilferty chi-square tail, as the rest of this module uses. */
function chiSquareTail(x: number, df: number): number {
  if (!(x > 0) || df <= 0) return 1;
  const t = (x / df) ** (1 / 3);
  const m = 1 - 2 / (9 * df);
  const s = Math.sqrt(2 / (9 * df));
  const z = (t - m) / s;
  const a = Math.abs(z);
  const k = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327 * Math.exp(-(a * a) / 2);
  const p = d * k * (0.3193815 + k * (-0.3565638 + k * (1.781478
    + k * (-1.821256 + k * 1.330274))));
  return Math.min(1, Math.max(0, z > 0 ? p : 1 - p));
}

/** The usable observations: a non-negative time and a known event status. */
function clean(obs: readonly SurvivalObservation[]): Array<{ t: number; e: boolean; g: string }> {
  const out: Array<{ t: number; e: boolean; g: string }> = [];
  obs.forEach((o) => {
    const t = typeof o.time === 'number' && Number.isFinite(o.time) ? o.time : null;
    if (t === null || t < 0) return;
    if (o.event !== true && o.event !== false) return;
    out.push({ t, e: o.event, g: o.group ?? 'All cases' });
  });
  return out;
}

/**
 * One Kaplan-Meier curve.
 *
 * The estimate steps down only at times an event occurred; a censored
 * observation leaves the risk set without moving the curve, which is the
 * whole mechanism. Greenwood's formula gives the interval, clamped to [0,1]
 * because a survival probability outside that range is an artefact of the
 * approximation rather than a finding.
 */
export function kaplanMeier(
  obs: readonly SurvivalObservation[],
  label = 'All cases',
): SurvivalCurve {
  const rows = clean(obs).sort((a, b) => a.t - b.t);
  const n = rows.length;
  const events = rows.filter((r) => r.e).length;

  const empty: SurvivalCurve = {
    label, n, events, censored: n - events, points: [],
    medianSurvival: null,
    medianNote: n === 0
      ? 'No usable observations: a case needs both a follow-up time and a known outcome.'
      : 'No events occurred, so survival cannot be estimated beyond "nobody had the event".',
    finalSurvival: n > 0 ? 1 : null,
    maxFollowUp: n > 0 ? rows[n - 1].t : null,
  };
  if (n === 0 || events === 0) return empty;

  const times = Array.from(new Set(rows.filter((r) => r.e).map((r) => r.t))).sort((a, b) => a - b);
  const points: SurvivalPoint[] = [];
  let survival = 1;
  let greenwood = 0;

  times.forEach((t) => {
    const atRisk = rows.filter((r) => r.t >= t).length;
    const d = rows.filter((r) => r.t === t && r.e).length;
    const c = rows.filter((r) => r.t === t && !r.e).length;
    if (atRisk === 0 || d === 0) return;

    survival *= 1 - d / atRisk;
    greenwood += d / (atRisk * (atRisk - d) || 1);
    const se = survival * Math.sqrt(greenwood);
    const r4 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000;

    points.push({
      time: t,
      atRisk,
      events: d,
      censored: c,
      survival: r4(survival),
      ci95Lower: r4(survival - 1.96 * se),
      ci95Upper: r4(survival + 1.96 * se),
    });
  });

  // The median is the FIRST time the curve reaches or crosses 0.5. Where it
  // never does, it is not estimable -- and reporting the longest follow-up
  // instead, which is the common error, says the opposite of the truth.
  const crossing = points.find((p) => p.survival <= 0.5) ?? null;

  return {
    label,
    n,
    events,
    censored: n - events,
    points,
    medianSurvival: crossing ? crossing.time : null,
    medianNote: crossing
      ? `Half the patients had the event by ${crossing.time}.`
      : `Median not reached: only ${events} of ${n} had the event, so survival never fell to `
        + 'a half. The longest follow-up is not a median and must not be quoted as one.',
    finalSurvival: points.length > 0 ? points[points.length - 1].survival : 1,
    maxFollowUp: rows[n - 1].t,
  };
}

/** One curve per group, each labelled, largest group first. */
export function kaplanMeierByGroup(
  obs: readonly SurvivalObservation[],
): SurvivalCurve[] {
  const rows = clean(obs);
  const groups = Array.from(new Set(rows.map((r) => r.g)));
  return groups
    .map((g) => kaplanMeier(obs.filter((o) => (o.group ?? 'All cases') === g), g))
    .sort((a, b) => b.n - a.n);
}

/**
 * The log-rank test: do these curves differ anywhere along their length?
 *
 * At every time an event occurs, the deaths are shared out between the groups
 * in proportion to how many of each were still at risk, and the test asks
 * whether the observed share differs from the expected one. Comparing whole
 * curves rather than a single time point is the point: picking the time point
 * after seeing the data is how two curves that cross get reported as a
 * difference.
 */
export function logRank(obs: readonly SurvivalObservation[]): LogRankResult {
  const rows = clean(obs);
  const labels = Array.from(new Set(rows.map((r) => r.g)));

  const summary = labels.map((label) => ({
    label,
    observed: rows.filter((r) => r.g === label && r.e).length,
    expected: 0,
    n: rows.filter((r) => r.g === label).length,
  }));

  if (labels.length < 2) {
    return {
      test: 'Log-rank', statistic: null, pValue: null, df: null, groups: summary,
      detail: 'Needs at least two groups to compare.',
    };
  }
  if (rows.filter((r) => r.e).length === 0) {
    return {
      test: 'Log-rank', statistic: null, pValue: null, df: null, groups: summary,
      detail: 'No events occurred in any group, so there is nothing to compare.',
    };
  }

  const eventTimes = Array.from(new Set(rows.filter((r) => r.e).map((r) => r.t)))
    .sort((a, b) => a - b);

  eventTimes.forEach((t) => {
    const atRisk = rows.filter((r) => r.t >= t).length;
    const d = rows.filter((r) => r.t === t && r.e).length;
    if (atRisk === 0 || d === 0) return;
    summary.forEach((g) => {
      const nj = rows.filter((r) => r.g === g.label && r.t >= t).length;
      g.expected += (d * nj) / atRisk;
    });
  });

  // The usual chi-square form, summed over groups. It is conservative
  // compared with the full variance-covariance version, which is the right
  // direction for a figure that will be quoted.
  const statistic = summary.reduce((a, g) =>
    (g.expected > 0 ? a + ((g.observed - g.expected) ** 2) / g.expected : a), 0);
  const df = labels.length - 1;

  return {
    test: 'Log-rank',
    statistic: Math.round(statistic * 1000) / 1000,
    pValue: Math.round(chiSquareTail(statistic, df) * 10000) / 10000,
    df,
    groups: summary.map((g) => ({ ...g, expected: Math.round(g.expected * 100) / 100 })),
  };
}

/** Survival at a named time, read off a curve. For "30-day survival". */
export function survivalAt(curve: SurvivalCurve, time: number): number | null {
  if (curve.n === 0) return null;
  if (curve.maxFollowUp !== null && time > curve.maxFollowUp) {
    // Beyond the longest follow-up there is no estimate, only extrapolation.
    return null;
  }
  const upTo = curve.points.filter((p) => p.time <= time);
  return upTo.length === 0 ? 1 : upTo[upTo.length - 1].survival;
}
