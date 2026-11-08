// The builder UI and the analysis API have to agree on every field name.
//
// This is the failure these tests exist for: the UI posts `{ type: 'logistic',
// outcomeField: 'anyComplication', predictors: [...] }` and the route reads
// `t.outcome` instead of `t.outcomeField`. Nothing throws. The route finds no
// outcome, skips the branch, returns `inferential: null`, and the screen shows
// a cohort count and no result — which reads as "there was nothing to find"
// rather than "the analysis never ran". Typescript cannot catch it, because the
// body crosses the wire as JSON.
//
// So: every analysis the UI offers must be handled by the route, under the
// field names the UI actually sends, and must have somewhere on screen to be
// rendered.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const ui = readFileSync(join(root, 'src/components/research/AdvancedAnalysis.tsx'), 'utf8');
const route = readFileSync(join(root, 'src/app/api/research/dataset/route.ts'), 'utf8');
const results = readFileSync(join(root, 'src/components/research/AnalysisResult.tsx'), 'utf8');

/** The analyses the UI offers, with the field names it sends for each. */
function analysesFromUi(): Array<{ type: string; fields: string[]; kinds: Record<string, string[]> }> {
  const start = ui.indexOf('const ANALYSES');
  expect(start).toBeGreaterThan(-1);
  const end = ui.indexOf('\n];', start);
  const block = ui.slice(start, end);

  const out: Array<{ type: string; fields: string[]; kinds: Record<string, string[]> }> = [];
  // Each entry begins "value: '<type>'" and lists its fields as
  // "{ field: '<name>', ..., kinds: [...] }".
  const entries = block.split(/\n  \{\n/).slice(1);
  entries.forEach((e) => {
    const type = /value: '([a-z]*)'/.exec(e)?.[1];
    if (type === undefined) return;
    const fields: string[] = [];
    const kinds: Record<string, string[]> = {};
    const re = /field: '([A-Za-z]+)'/g;
    let m = re.exec(e);
    while (m !== null) {
      fields.push(m[1]);
      m = re.exec(e);
    }
    fields.forEach((f) => {
      const seg = e.slice(e.indexOf(`field: '${f}'`));
      const k = /kinds: \[([^\]]*)\]/.exec(seg.slice(0, 260));
      kinds[f] = k ? k[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean) : [];
    });
    out.push({ type, fields, kinds });
  });
  return out;
}

const ANALYSES = analysesFromUi();
const REAL = ANALYSES.filter((a) => a.type !== '');

describe('the builder and the API agree', () => {
  it('found the analyses in the component', () => {
    // If the parse breaks, every assertion below passes vacuously — so the
    // count is asserted first.
    expect(ANALYSES.length).toBeGreaterThanOrEqual(15);
    expect(REAL.map((a) => a.type)).toContain('logistic');
    expect(REAL.map((a) => a.type)).toContain('survival');
    expect(REAL.map((a) => a.type)).toContain('roc');
    expect(REAL.map((a) => a.type)).toContain('kappa');
    expect(REAL.map((a) => a.type)).toContain('mannwhitney');
  });

  it('handles every analysis the UI offers', () => {
    const unhandled = REAL
      .map((a) => a.type)
      .filter((type) => !route.includes(`t.type === '${type}'`));
    expect(unhandled).toEqual([]);
  });

  it('reads every field name the UI sends', () => {
    const missing: string[] = [];
    REAL.forEach((a) => {
      a.fields.forEach((f) => {
        if (!route.includes(`t.${f}`)) missing.push(`${a.type}.${f}`);
      });
    });
    expect(missing).toEqual([]);
  });

  it('offers no field that the route does not restrict to the same shape', () => {
    // Where the UI offers only yes/no variables for a field, the route must
    // require kind 'boolean' for it — otherwise a category reaches an engine
    // that will refuse it, and the refusal is reported as a finding of nothing.
    const booleanOnly = REAL.flatMap((a) => a.fields
      .filter((f) => a.kinds[f]?.length === 1 && a.kinds[f][0] === 'boolean')
      .map((f) => ({ type: a.type, field: f })));
    expect(booleanOnly.length).toBeGreaterThan(0);
    booleanOnly.forEach(({ type, field }) => {
      const branch = route.slice(route.indexOf(`t.type === '${type}'`));
      const body = branch.slice(0, branch.indexOf('} else if') > 0 ? branch.indexOf('} else if') : 3000);
      expect(body, `${type}.${field} must be checked for kind boolean`)
        .toMatch(/kind === 'boolean'/);
    });
  });

  it('sends the grouping values only for the tests that compare two named groups', () => {
    // groupA/groupB are free text; a test that does not use them must not ask
    // for them, or somebody fills them in and wonders why nothing changed.
    expect(ui).toContain('analysis.groups');
    const withGroups = /value: 'ttest'[\s\S]{0,900}?groups: true/.test(ui);
    expect(withGroups).toBe(true);
    expect(route).toContain('t.groupA');
    expect(route).toContain('t.groupB');
  });

  it('posts Table 1 under the key the route reads', () => {
    expect(ui).toContain('body.tableOne = {');
    expect(ui).toMatch(/groupBy: t1Group/);
    expect(ui).toMatch(/variables: t1Vars/);
    expect(ui).toMatch(/parametric: t1Parametric/);
    expect(route).toContain('body?.tableOne');
    expect(route).toContain('t1.groupBy');
    expect(route).toContain('t1.variables');
    expect(route).toContain("t1.parametric === true");
  });

  it('sends the ROC direction, which decides whether the AUC is below 0.5', () => {
    expect(ui).toContain('payload.higherIsPositive = higherIsPositive');
    expect(route).toContain('higherIsPositive: t.higherIsPositive !== false');
  });

  it('uses the same catalogue endpoint the route serves', () => {
    expect(ui).toContain("/api/research/dataset?catalog=1");
    expect(route).toContain("searchParams.get('catalog')");
    expect(ui).toContain('/api/research/dataset?values=');
    expect(route).toContain("searchParams.get('values')");
  });
});

describe('the chart palette', () => {
  // The order of these hues is what makes two survival curves distinguishable,
  // including to a reader with colour-vision deficiency. It was chosen by
  // running the adjacent-pair separation check, not by eye, so a change here
  // has to be re-checked the same way rather than merged because it looks nice.
  it('is the validated eight, in the validated order, and is not cycled', () => {
    const block = results.slice(results.indexOf('export const PALETTE'));
    const body = block.slice(0, block.indexOf('];') + 2);
    const hexes = body.match(/#[0-9a-f]{6}/g) ?? [];
    expect(hexes).toEqual([
      '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
      '#e87ba4', '#008300', '#6250d6', '#e34948',
    ]);
    // Amber beside red measured 14.4 to a full-colour reader — below the floor.
    expect(hexes.indexOf('#eda100') + 1).not.toBe(hexes.indexOf('#e34948'));
    expect(hexes.indexOf('#e34948') + 1).not.toBe(hexes.indexOf('#eda100'));
  });

  it('gives a single-series bar chart one colour, not a hue per bar', () => {
    // A hue per bar makes colour mean rank, so the colours move when a filter
    // changes the order — the same category comes back a different colour.
    const block = results.slice(results.indexOf('export function DescriptiveBlock'));
    expect(block).toContain('backgroundColor: SINGLE_SERIES');
    expect(block).not.toMatch(/backgroundColor: labels\.map/);
  });

  it('keeps a legend wherever more than one series is drawn', () => {
    const km = results.slice(results.indexOf('export function SurvivalChart'));
    expect(km).toContain("legend: { position: 'bottom' }");
    const roc = results.slice(results.indexOf('export function RocChart'));
    expect(roc).toContain("legend: { position: 'bottom' }");
  });
});

describe('every result has somewhere to be shown', () => {
  it('renders each of the four model-shaped results with its own component', () => {
    ['logistic', 'survival', 'roc', 'kappa'].forEach((type) => {
      expect(ui).toContain(`testType === '${type}'`);
    });
    expect(ui).toContain('LogisticTable');
    expect(ui).toContain('SurvivalChart');
    expect(ui).toContain('RocChart');
    expect(ui).toContain('AgreementCard');
    // Everything else falls through to the generic card.
    expect(ui).toContain('TestResultCard');
  });

  it('shows the interpretation whenever there is one', () => {
    expect(ui).toContain('result.interpretation && <InterpretationCard');
  });

  it('never hides the cautions behind a click', () => {
    // The cautions are the part that stops a p-value being read as a verdict.
    // They are rendered unconditionally, not inside a collapsed panel.
    const card = results.slice(results.indexOf('export function InterpretationCard'));
    const body = card.slice(0, card.indexOf('\n}\n'));
    expect(body).toContain('i.cautions.map');
    // Guarded only by whether there are any — not by an open/expanded flag.
    expect(body).toContain('i.cautions.length > 0 && (');
    expect(body).not.toMatch(/(open|expanded|showCautions)/);
  });

  it('draws a Kaplan-Meier stepped, never smoothed', () => {
    const chart = results.slice(results.indexOf('export function SurvivalChart'));
    const body = chart.slice(0, chart.indexOf('\n}\n'));
    expect(body).toContain("stepped: 'after'");
    expect(body).toContain('tension: 0');
    // "Not reached" comes from the engine's own note, not from a blank cell.
    expect(body).toContain('c.medianNote');
  });

  it('draws the chance diagonal on a ROC curve', () => {
    const chart = results.slice(results.indexOf('export function RocChart'));
    const body = chart.slice(0, chart.indexOf('\n}\n'));
    expect(body).toContain("label: 'Chance'");
    expect(body).toContain('borderDash');
  });

  it('shows the denominator beside every descriptive figure', () => {
    const block = results.slice(results.indexOf('export function DescriptiveBlock'));
    expect(block).toContain('{v.recorded}/{v.total}');
  });

  it('puts the cautions in the exported PDF, not only on the screen', () => {
    const report = ui.slice(ui.indexOf('const exportReport'));
    const body = report.slice(0, report.indexOf('\n  };'));
    expect(body).toContain('Limitations');
    expect(body).toContain('interp.cautions.forEach');
    expect(body).toContain('interp.reporting');
    // And the scope under which the numbers were produced.
    expect(body).toContain('Access scope');
  });
});
