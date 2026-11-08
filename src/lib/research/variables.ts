// ============================================================
// The catalogue, assembled — and checked against itself
// ------------------------------------------------------------
// Three files of definitions meet here, and the invariants that make the
// catalogue trustworthy are asserted on the way through rather than left to a
// code review.
//
// A DUPLICATE KEY IS A SILENT DATA ERROR, not a lint warning. Two variables
// sharing a key means one of them is unreachable: a query asking for
// `bloodLossMl` would get whichever the lookup map happened to keep, and a
// dataset exported under one label would carry the other's values. It throws
// at module load, which is as early as this can be caught and far better than
// a paper built on it.
// ============================================================

import type { ResearchVariable, DomainKey, RawCase, VariableValue } from './types';
import { RESEARCH_DOMAINS } from './types';
import { PREOP_VARIABLES } from './variables.preop';
import { THEATRE_VARIABLES } from './variables.theatre';
import { OUTCOME_DOMAIN_VARIABLES } from './variables.outcome';

export * from './types';

/** Every research variable, in journey order. */
export const RESEARCH_VARIABLES: readonly ResearchVariable[] = (() => {
  const all = [...PREOP_VARIABLES, ...THEATRE_VARIABLES, ...OUTCOME_DOMAIN_VARIABLES];

  const seen = new Set<string>();
  const duplicates: string[] = [];
  all.forEach((x) => {
    if (seen.has(x.key)) duplicates.push(x.key);
    seen.add(x.key);
  });
  if (duplicates.length > 0) {
    throw new Error(
      `Research catalogue has duplicate variable keys: ${duplicates.join(', ')}. `
      + 'Two variables sharing a key makes one of them unreachable and can export '
      + 'one variable under the other one’s label.',
    );
  }

  const domains = new Set(RESEARCH_DOMAINS.map((d) => d.key));
  const strays = all.filter((x) => !domains.has(x.domain)).map((x) => x.key);
  if (strays.length > 0) {
    throw new Error(
      `Research variables in an unknown domain: ${strays.join(', ')}. `
      + 'A variable in a domain no picker lists is a variable nobody can find.',
    );
  }

  return all;
})();

const BY_KEY = new Map(RESEARCH_VARIABLES.map((x) => [x.key, x]));

/** One variable by key, or null. */
export const variable = (key: string): ResearchVariable | null => BY_KEY.get(key) ?? null;

export const variableKeys = (): string[] => RESEARCH_VARIABLES.map((x) => x.key);

/** The variables in one domain, in catalogue order. */
export const variablesIn = (domain: DomainKey): ResearchVariable[] =>
  RESEARCH_VARIABLES.filter((x) => x.domain === domain);

/** The variables of one kind — what a numeric picker or a group-by may offer. */
export const variablesOfKind = (
  ...kinds: ResearchVariable['kind'][]
): ResearchVariable[] => RESEARCH_VARIABLES.filter((x) => kinds.includes(x.kind));

/**
 * The catalogue as a client needs it: no accessors, grouped by domain.
 *
 * The `read` functions cannot cross the wire, and a client that tried to
 * serialise them would send `undefined` for every variable. This is the only
 * shape the API returns.
 */
export function catalogueForClient(): Array<{
  key: DomainKey; label: string; blurb: string;
  variables: Array<Omit<ResearchVariable, 'read'>>;
}> {
  return RESEARCH_DOMAINS.map((d) => ({
    key: d.key,
    label: d.label,
    blurb: d.blurb,
    variables: variablesIn(d.key).map(({ read, ...rest }) => rest),
  })).filter((d) => d.variables.length > 0);
}

/** Every variable's value for one case, keyed by variable key. */
export function readCase(c: RawCase): Record<string, VariableValue> {
  const out: Record<string, VariableValue> = {};
  RESEARCH_VARIABLES.forEach((x) => {
    try {
      out[x.key] = x.read(c);
    } catch {
      // A single malformed row must not take out the whole dataset. A value
      // that cannot be read is missing, which is a state every analysis in
      // this module already handles.
      out[x.key] = null;
    }
  });
  return out;
}

/** How many variables exist, for a screen that wants to say so. */
export const RESEARCH_VARIABLE_COUNT = RESEARCH_VARIABLES.length;
