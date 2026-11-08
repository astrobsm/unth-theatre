'use client';

/**
 * The research engine: the whole variable catalogue, the modern tests, and a
 * report that can be taken to a journal.
 *
 * Three things this does differently from a statistics package:
 *
 * 1. It only offers a field the variables that can legally go in it. A
 *    Kaplan-Meier needs a number for time and a yes/no for the event; a
 *    logistic regression needs a yes/no outcome. Restricting the picker is why
 *    the engine rarely has to refuse anything.
 * 2. Every result arrives with its interpretation, its cautions and a sentence
 *    for the results section. A package hands back a p-value and leaves the
 *    writing-up to the reader, which is where "there was no difference between
 *    the groups" comes from.
 * 3. Nothing is computed over cases the reader may not open. The scope is
 *    applied in the database query, and the banner at the top says which cases
 *    are in scope and why — so a count that looks small is explained rather
 *    than mistaken for a quiet month.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play, Plus, Trash2, Download, FileSpreadsheet, FileText, Database,
  Lock, ShieldCheck, Sigma, Table2, Loader2, AlertTriangle,
} from 'lucide-react';
import { exportToExcel, exportToCSV } from '@/lib/exportUtils';
import { installPdfTextGuard } from '@/lib/pdfSafeText';
import VariablePicker, {
  VariableMultiPicker, findVariable, type ClientDomain, type ClientVariable,
} from './VariablePicker';
import {
  InterpretationCard, LogisticTable, SurvivalChart, RocChart, AgreementCard,
  TestResultCard, TableOneView, DescriptiveBlock, GroupedBlock, fmtP,
  type Interpretation,
} from './AnalysisResult';

interface Criterion { field: string; op: string; value: string }

const NUMERIC_OPS = [
  { value: 'gte', label: '≥' }, { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' }, { value: 'lt', label: '<' },
  { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
];
const TEXT_OPS = [
  { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' },
  { value: 'in', label: 'is one of' }, { value: 'contains', label: 'contains' },
];

/**
 * The analyses on offer, each with the variable shapes its fields accept.
 * `needs` drives both the form and the Run button, so an analysis cannot be
 * submitted half-specified.
 */
const ANALYSES: Array<{
  value: string; label: string; blurb: string;
  needs: Array<{ field: string; label: string; kinds: Array<ClientVariable['kind']>; multi?: boolean }>;
  groups?: boolean;
}> = [
  {
    value: '', label: 'No test — describe the cohort only',
    blurb: 'Descriptive statistics for the variables chosen below.', needs: [],
  },
  {
    value: 'ttest', label: "Welch's t-test (two groups)",
    blurb: 'Compares means. Welch does not assume equal variance, which is the version to use '
      + 'unless you have checked that they are equal.',
    needs: [
      { field: 'numericField', label: 'Numeric outcome', kinds: ['numeric'] },
      { field: 'groupField', label: 'Group by', kinds: ['categorical', 'boolean'] },
    ],
    groups: true,
  },
  {
    value: 'mannwhitney', label: 'Mann-Whitney U (two groups)',
    blurb: 'Compares distributions without assuming a normal one. The right default for '
      + 'operating times, blood loss and length of stay, which are all skewed.',
    needs: [
      { field: 'numericField', label: 'Numeric outcome', kinds: ['numeric'] },
      { field: 'groupField', label: 'Group by', kinds: ['categorical', 'boolean'] },
    ],
    groups: true,
  },
  {
    value: 'anova', label: 'One-way ANOVA (three or more groups)',
    blurb: 'Compares means across every level at once. Assumes a roughly normal distribution.',
    needs: [
      { field: 'numericField', label: 'Numeric outcome', kinds: ['numeric'] },
      { field: 'groupField', label: 'Group by', kinds: ['categorical', 'boolean'] },
    ],
  },
  {
    value: 'kruskal', label: 'Kruskal-Wallis (three or more groups)',
    blurb: 'The non-parametric version of ANOVA, and the safer choice for theatre data.',
    needs: [
      { field: 'numericField', label: 'Numeric outcome', kinds: ['numeric'] },
      { field: 'groupField', label: 'Group by', kinds: ['categorical', 'boolean'] },
    ],
  },
  {
    value: 'chisquare', label: 'Chi-square (association between two categories)',
    blurb: 'Tests whether the distribution of one category differs across another.',
    needs: [
      { field: 'rowField', label: 'Rows', kinds: ['categorical', 'boolean'] },
      { field: 'colField', label: 'Columns', kinds: ['categorical', 'boolean'] },
    ],
  },
  {
    value: 'fisher', label: "Fisher's exact test (2×2, small numbers)",
    blurb: 'Exact, so it is valid where a chi-square is not — any 2×2 with an expected count '
      + 'below five.',
    needs: [
      { field: 'rowField', label: 'Rows (2 levels)', kinds: ['categorical', 'boolean'] },
      { field: 'colField', label: 'Columns (2 levels)', kinds: ['categorical', 'boolean'] },
    ],
  },
  {
    value: 'effect', label: 'Risk and odds ratio (2×2)',
    blurb: 'The size of the difference with its confidence interval, which a p-value does not give.',
    needs: [
      { field: 'rowField', label: 'Exposure', kinds: ['categorical', 'boolean'] },
      { field: 'colField', label: 'Outcome', kinds: ['categorical', 'boolean'] },
    ],
  },
  {
    value: 'spearman', label: 'Spearman correlation',
    blurb: 'Rank correlation. The one to use for ASA, wound class or any ordinal score.',
    needs: [
      { field: 'fieldX', label: 'Variable X', kinds: ['numeric'] },
      { field: 'fieldY', label: 'Variable Y', kinds: ['numeric'] },
    ],
  },
  {
    value: 'pearson', label: 'Pearson correlation',
    blurb: 'Assumes a straight line between two measurements.',
    needs: [
      { field: 'fieldX', label: 'Variable X', kinds: ['numeric'] },
      { field: 'fieldY', label: 'Variable Y', kinds: ['numeric'] },
    ],
  },
  {
    value: 'regression', label: 'Linear regression',
    blurb: 'How much one measurement changes per unit of another, with the slope in clinical units.',
    needs: [
      { field: 'fieldX', label: 'Predictor (X)', kinds: ['numeric'] },
      { field: 'fieldY', label: 'Outcome (Y)', kinds: ['numeric'] },
    ],
  },
  {
    value: 'logistic', label: 'Multivariable logistic regression',
    blurb: 'Adjusted odds ratios for a yes/no outcome. Categories are expanded against a '
      + 'reference level, which is named in the result.',
    needs: [
      { field: 'outcomeField', label: 'Yes/no outcome', kinds: ['boolean'] },
      {
        field: 'predictors', label: 'Predictors', multi: true,
        kinds: ['numeric', 'categorical', 'boolean'],
      },
    ],
  },
  {
    value: 'survival', label: 'Kaplan-Meier and log-rank',
    blurb: 'Time to an event, with censoring handled properly. Leave the grouping empty for a '
      + 'single curve.',
    needs: [
      { field: 'timeField', label: 'Time to event', kinds: ['numeric'] },
      { field: 'eventField', label: 'Event happened (yes/no)', kinds: ['boolean'] },
      { field: 'groupField', label: 'Compare groups (optional)', kinds: ['categorical', 'boolean'] },
    ],
  },
  {
    value: 'roc', label: 'ROC curve and AUC',
    blurb: 'How well a measurement discriminates an outcome, and at which cut-off.',
    needs: [
      { field: 'scoreField', label: 'Measurement / score', kinds: ['numeric'] },
      { field: 'outcomeField', label: 'Yes/no outcome', kinds: ['boolean'] },
    ],
  },
  {
    value: 'kappa', label: "Cohen's kappa (agreement)",
    blurb: 'Agreement beyond chance between two records of the same thing — a planned against a '
      + 'performed procedure, a pre-op against a post-op diagnosis.',
    needs: [
      { field: 'fieldA', label: 'First record', kinds: ['categorical', 'boolean'] },
      { field: 'fieldB', label: 'Second record', kinds: ['categorical', 'boolean'] },
    ],
  },
];

/** Optional fields may be left blank without blocking the run. */
const OPTIONAL = new Set(['groupField:survival']);

export default function AdvancedAnalysis() {
  const [domains, setDomains] = useState<ClientDomain[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [variableCount, setVariableCount] = useState(0);

  const [dates, setDates] = useState({ from: '', to: '' });
  const [include, setInclude] = useState<Criterion[]>([]);
  const [exclude, setExclude] = useState<Criterion[]>([]);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string | null>(null);

  const [testType, setTestType] = useState('');
  const [test, setTest] = useState<Record<string, any>>({});
  const [higherIsPositive, setHigherIsPositive] = useState(true);

  const [t1Group, setT1Group] = useState<string | null>(null);
  const [t1Vars, setT1Vars] = useState<string[]>([]);
  const [t1Parametric, setT1Parametric] = useState(false);

  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Distinct values per categorical variable, fetched on demand so a filter can
  // offer what actually occurs instead of making somebody guess a spelling.
  const [valueCache, setValueCache] = useState<Record<string, Array<{ value: string; n?: number }>>>({});

  useEffect(() => {
    let live = true;
    fetch('/api/research/dataset?catalog=1')
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) { setCatalogError(j.error); return; }
        setDomains(j.domains ?? []);
        setVariableCount(j.count ?? 0);
      })
      .catch(() => live && setCatalogError('The variable catalogue could not be loaded.'));
    return () => { live = false; };
  }, []);

  const loadValues = useCallback(async (key: string) => {
    if (valueCache[key]) return;
    const def = findVariable(domains, key);
    if (!def || def.kind === 'numeric' || def.kind === 'date') return;
    if (def.values) {
      setValueCache((p) => ({ ...p, [key]: def.values!.map((v) => ({ value: v })) }));
      return;
    }
    try {
      const r = await fetch(`/api/research/dataset?values=${encodeURIComponent(key)}`);
      const j = await r.json();
      const vals = Array.isArray(j.values)
        ? j.values.map((v: any) => (typeof v === 'string' ? { value: v } : v))
        : [];
      setValueCache((p) => ({ ...p, [key]: vals }));
    } catch { /* the filter stays a free-text box, which still works */ }
  }, [domains, valueCache]);

  const analysis = useMemo(
    () => ANALYSES.find((a) => a.value === testType) ?? ANALYSES[0],
    [testType],
  );

  const ready = useMemo(() => analysis.needs.every((n) => {
    if (OPTIONAL.has(`${n.field}:${testType}`)) return true;
    const v = test[n.field];
    return n.multi ? Array.isArray(v) && v.length > 0 : typeof v === 'string' && v.length > 0;
  }), [analysis, test, testType]);

  const addCriterion = (kind: 'inc' | 'exc') => {
    const first = domains[0]?.variables[0]?.key ?? '';
    const c: Criterion = { field: first, op: 'eq', value: '' };
    if (kind === 'inc') setInclude((p) => [...p, c]); else setExclude((p) => [...p, c]);
  };

  const serialize = (list: Criterion[]) => list
    .filter((c) => c.field && c.value !== '')
    .map((c) => {
      const def = findVariable(domains, c.field);
      if (c.op === 'in') {
        return { field: c.field, op: 'in', value: c.value.split(',').map((s) => s.trim()).filter(Boolean) };
      }
      if (def?.kind === 'numeric') return { field: c.field, op: c.op, value: Number(c.value) };
      if (def?.kind === 'boolean') return { field: c.field, op: c.op, value: c.value === 'true' };
      return { field: c.field, op: c.op, value: c.value };
    });

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const body: Record<string, any> = {
        from: dates.from || undefined,
        to: dates.to || undefined,
        include: serialize(include),
        exclude: serialize(exclude),
        outcomes,
        groupBy: groupBy || null,
        withDataset: true,
      };
      if (testType) {
        const payload: Record<string, any> = { type: testType };
        analysis.needs.forEach((n) => {
          const v = test[n.field];
          if (n.multi ? Array.isArray(v) && v.length > 0 : v) payload[n.field] = v;
        });
        if (analysis.groups) { payload.groupA = test.groupA ?? ''; payload.groupB = test.groupB ?? ''; }
        if (testType === 'roc') payload.higherIsPositive = higherIsPositive;
        body.test = payload;
      }
      if (t1Group && t1Vars.length > 0) {
        body.tableOne = { groupBy: t1Group, variables: t1Vars, parametric: t1Parametric };
      }
      const res = await fetch('/api/research/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e: any) {
      setError(e?.message || 'The analysis could not be run.');
    } finally {
      setLoading(false);
    }
  };

  const exportDataset = async (format: 'excel' | 'csv') => {
    if (!result?.dataset?.length) return;
    const name = `research-cohort-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'excel') await exportToExcel(result.dataset, name, 'Cohort');
    else await exportToCSV(result.dataset, name);
  };

  /**
   * The report. It carries the cohort definition, the scope it was run under,
   * the table, the result and — the part that matters — the cautions. A PDF
   * that printed the p-value and left the cautions on the screen would be the
   * version that reaches a journal.
   */
  const exportReport = async () => {
    if (!result) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    installPdfTextGuard(doc);
    let y = 18;

    doc.setFontSize(15);
    doc.text('Theatre Research Analysis', 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, y);
    y += 5;
    doc.text(
      `Period: ${dates.from || 'all records'} to ${dates.to || 'present'} · `
      + `${result.count} case(s) analysed`, 14, y,
    );
    y += 5;
    const scopeLine = doc.splitTextToSize(`Access scope: ${result.scope?.explanation ?? '—'}`, 180);
    doc.text(scopeLine, 14, y);
    y += scopeLine.length * 4 + 3;
    doc.setTextColor(0);

    const cohortRows = [
      ...serialize(include).map((c) => ['Include', findVariable(domains, c.field)?.label ?? c.field,
        c.op, String(c.value)]),
      ...serialize(exclude).map((c) => ['Exclude', findVariable(domains, c.field)?.label ?? c.field,
        c.op, String(c.value)]),
    ];
    if (cohortRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['', 'Variable', 'Operator', 'Value']],
        body: cohortRows,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [42, 120, 214] },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    const t1 = result.tableOne;
    if (t1) {
      doc.setFontSize(11);
      doc.text(`Table 1 — by ${t1.groupByLabel}`, 14, y);
      y += 2;
      autoTable(doc, {
        startY: y + 2,
        head: [[
          'Characteristic', `Overall (n=${t1.overallN})`,
          ...t1.groups.map((g: any) => `${g.label} (n=${g.n})`), 'p',
        ]],
        body: t1.rows.map((r: any) => [
          r.isLevel ? `   ${r.level}` : r.label,
          r.overall?.display ?? '—',
          ...t1.groups.map((g: any) => r.cells?.[g.label]?.display ?? '—'),
          r.pValue === null || r.pValue === undefined ? '—' : fmtP(r.pValue),
        ]),
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [42, 120, 214] },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      (t1.footnotes ?? []).forEach((f: string) => {
        const lines = doc.splitTextToSize(f, 180);
        if (y > 265) { doc.addPage(); y = 18; }
        doc.setFontSize(7.5);
        doc.setTextColor(110);
        doc.text(lines, 14, y);
        y += lines.length * 3.4 + 1;
      });
      doc.setTextColor(0);
      y += 4;
    }

    const inf = result.inferential as Record<string, any> | null;
    if (inf && Array.isArray(inf.terms) && inf.ok) {
      if (y > 220) { doc.addPage(); y = 18; }
      doc.setFontSize(11);
      doc.text('Logistic regression', 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [['Variable', 'Adjusted OR', '95% CI', 'p']],
        body: inf.terms.filter((t: any) => t.name !== '(Intercept)').map((t: any) => [
          t.name,
          (Math.round(t.oddsRatio * 100) / 100).toFixed(2),
          `${(Math.round(t.ci95Lower * 100) / 100).toFixed(2)}–${(Math.round(t.ci95Upper * 100) / 100).toFixed(2)}`,
          fmtP(t.pValue),
        ]),
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [27, 175, 122] },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    const interp = result.interpretation as Interpretation | null;
    if (interp) {
      if (y > 230) { doc.addPage(); y = 18; }
      doc.setFontSize(11);
      doc.text('Result', 14, y);
      y += 6;
      doc.setFontSize(9.5);
      [interp.headline, interp.plain].forEach((para) => {
        const lines = doc.splitTextToSize(para, 180);
        if (y + lines.length * 4.4 > 275) { doc.addPage(); y = 18; }
        doc.text(lines, 14, y);
        y += lines.length * 4.4 + 2;
      });

      y += 2;
      if (y > 250) { doc.addPage(); y = 18; }
      doc.setFontSize(10);
      doc.text('Limitations', 14, y);
      y += 5;
      doc.setFontSize(8.5);
      interp.cautions.forEach((c) => {
        const lines = doc.splitTextToSize(`• ${c}`, 178);
        if (y + lines.length * 3.9 > 278) { doc.addPage(); y = 18; }
        doc.text(lines, 16, y);
        y += lines.length * 3.9 + 1.5;
      });

      y += 4;
      if (y > 250) { doc.addPage(); y = 18; }
      doc.setFontSize(10);
      doc.text('For the results section', 14, y);
      y += 5;
      doc.setFontSize(9);
      const rep = doc.splitTextToSize(interp.reporting, 180);
      doc.text(rep, 14, y);
    }

    doc.save(`theatre-research-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (catalogError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        {catalogError}
      </div>
    );
  }
  if (domains.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />Loading the variable catalogue…
      </div>
    );
  }

  const inf = result?.inferential as Record<string, any> | null;

  return (
    <div className="space-y-5">
      {/* Scope — said before any number is shown. */}
      {result?.scope && (
        <div className={`rounded-xl border p-3 flex items-start gap-2 ${
          result.scope.kind === 'own' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
        }`}>
          {result.scope.kind === 'own'
            ? <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            : <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />}
          <div>
            <p className="text-sm text-gray-800">{result.scope.explanation}</p>
            {result.scope.pending && (
              <p className="text-xs text-amber-800 mt-1">
                An application for wider access is with the Theatre Research Board.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Cohort ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Database className="w-4 h-4" />Cohort
          <span className="ml-auto text-xs font-normal text-gray-500">
            {variableCount} variables available
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="text-xs text-gray-500">Scheduled from
            <input type="date" value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500">to
            <input type="date" value={dates.to} onChange={(e) => setDates({ ...dates, to: e.target.value })}
              className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </label>
        </div>

        <CriteriaEditor
          title="Include only cases where ALL of these hold"
          accent="emerald" domains={domains} list={include} valueCache={valueCache}
          onLoadValues={loadValues}
          onAdd={() => addCriterion('inc')}
          onUpdate={(i, patch) => setInclude((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))}
          onRemove={(i) => setInclude((p) => p.filter((_, idx) => idx !== i))}
        />
        <CriteriaEditor
          title="Exclude a case if ANY of these hold"
          accent="rose" domains={domains} list={exclude} valueCache={valueCache}
          onLoadValues={loadValues}
          onAdd={() => addCriterion('exc')}
          onUpdate={(i, patch) => setExclude((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))}
          onRemove={(i) => setExclude((p) => p.filter((_, idx) => idx !== i))}
        />
      </section>

      {/* ── Variables to describe ───────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <Table2 className="w-4 h-4" />Variables to describe
        </h3>
        <VariableMultiPicker
          domains={domains} value={outcomes} onChange={setOutcomes}
          label="Outcomes and characteristics" max={40}
        />
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Break the table down by (optional)</p>
          <VariablePicker
            domains={domains} value={groupBy} onChange={setGroupBy}
            kinds={['categorical', 'boolean']} placeholder="No breakdown"
          />
          {groupBy && (
            <button type="button" onClick={() => setGroupBy(null)}
              className="mt-1 text-xs text-gray-500 hover:text-gray-700">Clear breakdown</button>
          )}
        </div>
      </section>

      {/* ── Table 1 ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Table 1 (optional)</h3>
        <p className="text-xs text-gray-500 -mt-2">
          The cohort-characteristics table a paper opens with: every variable, by group, with the
          right test chosen per row and the missing count shown.
        </p>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Columns are the levels of</p>
          <VariablePicker
            domains={domains} value={t1Group} onChange={setT1Group}
            kinds={['categorical', 'boolean']} placeholder="Choose the grouping variable…"
          />
        </div>
        <VariableMultiPicker
          domains={domains} value={t1Vars} onChange={setT1Vars}
          kinds={['numeric', 'categorical', 'boolean']}
          label="Rows" max={30}
        />
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={t1Parametric} onChange={(e) => setT1Parametric(e.target.checked)}
            className="mt-0.5" />
          <span>
            Report mean (SD) and use ANOVA instead of median [IQR] and Kruskal-Wallis. Only tick
            this where the distributions are genuinely symmetric — operating time, blood loss and
            length of stay are not.
          </span>
        </label>
      </section>

      {/* ── Analysis ────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Sigma className="w-4 h-4" />Analysis
        </h3>
        <label className="text-xs text-gray-500 block">Test or model
          <select
            value={testType}
            onChange={(e) => { setTestType(e.target.value); setTest({}); }}
            className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
          >
            {ANALYSES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{analysis.blurb}</p>

        {analysis.needs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {analysis.needs.map((n) => (
              <div key={n.field}>
                <p className="text-xs font-medium text-gray-600 mb-1.5">{n.label}</p>
                {n.multi ? (
                  <VariableMultiPicker
                    domains={domains} kinds={n.kinds} label="Entered in the model"
                    value={Array.isArray(test[n.field]) ? test[n.field] : []}
                    onChange={(keys) => setTest((p) => ({ ...p, [n.field]: keys }))}
                    max={10}
                  />
                ) : (
                  <VariablePicker
                    domains={domains} kinds={n.kinds}
                    value={test[n.field] ?? null}
                    onChange={(k) => setTest((p) => ({ ...p, [n.field]: k }))}
                    placeholder={OPTIONAL.has(`${n.field}:${testType}`) ? 'Leave empty for one curve' : 'Choose…'}
                  />
                )}
              </div>
            ))}

            {analysis.groups && (
              <div className="grid grid-cols-2 gap-2 lg:col-span-2">
                <GroupValueInput
                  label="Group A" field={test.groupField} cache={valueCache}
                  onLoad={loadValues} value={test.groupA ?? ''}
                  onChange={(v) => setTest((p) => ({ ...p, groupA: v }))}
                />
                <GroupValueInput
                  label="Group B" field={test.groupField} cache={valueCache}
                  onLoad={loadValues} value={test.groupB ?? ''}
                  onChange={(v) => setTest((p) => ({ ...p, groupB: v }))}
                />
              </div>
            )}

            {testType === 'roc' && (
              <label className="flex items-start gap-2 text-xs text-gray-600 lg:col-span-2">
                <input type="checkbox" checked={higherIsPositive}
                  onChange={(e) => setHigherIsPositive(e.target.checked)} className="mt-0.5" />
                <span>
                  A higher value means the outcome is more likely. Untick for a measurement where
                  LOW is bad — a haemoglobin or a temperature — or the AUC comes out below 0.5 and
                  reads as a useless test when it is a correct one pointing the other way.
                </span>
              </label>
            )}
          </div>
        )}

        {testType && !ready && (
          <p className="text-xs text-amber-700 mt-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Choose every variable above before running this analysis.
          </p>
        )}
      </section>

      {/* ── Run and export ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={run} disabled={loading || (testType !== '' && !ready)}
          className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Running…' : 'Run analysis'}
        </button>
        <button
          type="button" onClick={exportReport} disabled={!result}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-40"
        >
          <FileText className="w-4 h-4" />Report (PDF)
        </button>
        <button
          type="button" onClick={() => exportDataset('excel')} disabled={!result?.dataset?.length}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
        >
          <FileSpreadsheet className="w-4 h-4" />Anonymised dataset (Excel)
        </button>
        <button
          type="button" onClick={() => exportDataset('csv')} disabled={!result?.dataset?.length}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />CSV
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* ── Results ────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-x-6 gap-y-1">
            <p className="text-sm text-gray-600">
              Cohort: <span className="font-bold text-indigo-600">{result.count}</span> case(s)
            </p>
            <p className="text-sm text-gray-500">{result.scanned} in scope before filtering</p>
            {result.truncated && (
              <p className="text-sm text-amber-700">
                The scan stopped at its limit — narrow the dates to be sure nothing was left out.
              </p>
            )}
          </div>

          {result.interpretation && <InterpretationCard i={result.interpretation as Interpretation} />}

          {inf && testType === 'logistic' && <LogisticTable res={inf} />}
          {inf && testType === 'survival' && <SurvivalChart res={inf} />}
          {inf && testType === 'roc' && <RocChart res={inf} />}
          {inf && testType === 'kappa' && <AgreementCard res={inf} />}
          {inf && !['logistic', 'survival', 'roc', 'kappa'].includes(testType) && (
            <TestResultCard res={inf} />
          )}

          {result.tableOne && <TableOneView t1={result.tableOne} />}
          {result.grouped && <GroupedBlock grouped={result.grouped} />}
          {result.descriptive && <DescriptiveBlock descriptive={result.descriptive} />}

          {result.dataset?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h4 className="text-sm font-semibold text-gray-800">Anonymised dataset</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                {result.dataset.length} row(s) ready to export
                {result.datasetTruncated && ' — capped; narrow the cohort for the full set'}.
                Names, folder numbers and exact ages are not in it: surgeons and anaesthetists
                appear as codes, and age as a band.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Criteria editor ──────────────────────────────────────────────────

function CriteriaEditor({
  title, accent, domains, list, valueCache, onLoadValues, onAdd, onUpdate, onRemove,
}: {
  title: string;
  accent: 'emerald' | 'rose';
  domains: ClientDomain[];
  list: Criterion[];
  valueCache: Record<string, Array<{ value: string; n?: number }>>;
  onLoadValues: (key: string) => void;
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<Criterion>) => void;
  onRemove: (i: number) => void;
}) {
  const btn = accent === 'emerald'
    ? 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
    : 'text-rose-700 hover:bg-rose-50 border-rose-200';

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-600">{title}</p>
        <button type="button" onClick={onAdd}
          className={`inline-flex items-center gap-1 px-2 py-1 border rounded-lg text-xs ${btn}`}>
          <Plus className="w-3 h-3" />Add
        </button>
      </div>
      {list.length === 0 && <p className="text-xs text-gray-400">None — every case in scope is included.</p>}
      <div className="space-y-2">
        {list.map((c, i) => {
          const def = findVariable(domains, c.field);
          const ops = def?.kind === 'numeric' ? NUMERIC_OPS : TEXT_OPS;
          const cached = valueCache[c.field];
          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 sm:col-span-5">
                <VariablePicker
                  compact domains={domains} value={c.field}
                  onChange={(k) => {
                    const next = findVariable(domains, k);
                    onUpdate(i, {
                      field: k, value: '',
                      op: next?.kind === 'numeric' ? 'gte' : 'eq',
                    });
                    onLoadValues(k);
                  }}
                />
              </div>
              <select
                value={c.op} onChange={(e) => onUpdate(i, { op: e.target.value })}
                className="col-span-4 sm:col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              >
                {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="col-span-7 sm:col-span-4">
                {def?.kind === 'boolean' ? (
                  <select
                    value={c.value} onChange={(e) => onUpdate(i, { value: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="">Choose…</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : def?.kind !== 'numeric' && c.op !== 'in' && c.op !== 'contains' && cached?.length ? (
                  <select
                    value={c.value} onChange={(e) => onUpdate(i, { value: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="">Choose…</option>
                    {cached.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.value}{v.n ? ` (${v.n})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={c.value}
                    onFocus={() => onLoadValues(c.field)}
                    onChange={(e) => onUpdate(i, { value: e.target.value })}
                    placeholder={def?.kind === 'numeric' ? (def.unit ?? 'value')
                      : c.op === 'in' ? 'comma, separated, values' : 'value'}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  />
                )}
              </div>
              <button type="button" onClick={() => onRemove(i)}
                className="col-span-1 text-gray-400 hover:text-red-600 pt-1.5" aria-label="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Group A / Group B, offering the values that actually occur in that field. */
function GroupValueInput({
  label, field, cache, onLoad, value, onChange,
}: {
  label: string;
  field: string | undefined;
  cache: Record<string, Array<{ value: string; n?: number }>>;
  onLoad: (k: string) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  useEffect(() => { if (field) onLoad(field); }, [field, onLoad]);
  const cached = field ? cache[field] : undefined;
  return (
    <label className="text-xs text-gray-500">{label}
      {cached?.length ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Choose…</option>
          {cached.map((v) => (
            <option key={v.value} value={v.value}>{v.value}{v.n ? ` (${v.n})` : ''}</option>
          ))}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={field ? 'value' : 'choose the grouping variable first'}
          className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
      )}
    </label>
  );
}
