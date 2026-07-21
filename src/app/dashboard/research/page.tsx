'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import {
  FlaskConical, Filter, RefreshCw, Download, BarChart3, Activity,
  Users, AlertTriangle, Layers, Database, Sigma, Play, Plus, Trash2,
  FileSpreadsheet, FileText, ClipboardList,
} from 'lucide-react';
import { exportToExcel, exportToCSV, exportMultiSheetExcel } from '@/lib/exportUtils';

// Charts load on demand — chart.js is ~250 KB and this page is usable (query
// builder, filters, exports) long before a chart is rendered.
const chartLoading = () => (
  <div className="h-64 flex items-center justify-center text-sm text-gray-400">Loading chart…</div>
);
const Bar = dynamic(() => import('@/components/charts/ChartKit').then((m) => m.Bar), { ssr: false, loading: chartLoading });
const Line = dynamic(() => import('@/components/charts/ChartKit').then((m) => m.Line), { ssr: false, loading: chartLoading });
const Pie = dynamic(() => import('@/components/charts/ChartKit').then((m) => m.Pie), { ssr: false, loading: chartLoading });
const Doughnut = dynamic(() => import('@/components/charts/ChartKit').then((m) => m.Doughnut), { ssr: false, loading: chartLoading });

// ---- Palette ---------------------------------------------------------------
const PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#a855f7',
];

// ---- Query-builder field metadata -----------------------------------------
const NUMERIC_FIELDS = [
  { value: 'age', label: 'Patient age (years)' },
  { value: 'durationMinutes', label: 'Duration (minutes)' },
  { value: 'bloodLoss', label: 'Blood loss (mL)' },
  { value: 'complexityScore', label: 'Complexity score' },
];
const CATEGORICAL_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'type', label: 'Surgery type' },
  { value: 'subspecialty', label: 'Specialty' },
  { value: 'unit', label: 'Unit' },
  { value: 'theatre', label: 'Theatre / location' },
  { value: 'gender', label: 'Gender' },
  { value: 'anaesthesiaType', label: 'Anaesthesia type' },
  { value: 'complexityClass', label: 'Complexity class' },
  { value: 'cancellationCategory', label: 'Cancellation category' },
];
const NUMERIC_OPS = [
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
];
const CATEGORICAL_OPS = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'in', label: 'is one of (comma-separated)' },
];

interface Criterion {
  field: string;
  op: string;
  value: string;
}

const isNumericField = (f: string) => NUMERIC_FIELDS.some((n) => n.value === f);

// ---- Small presentational helpers -----------------------------------------
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatRow({ name, s }: { name: string; s: any }) {
  if (!s || !s.n) {
    return (
      <tr className="border-b border-gray-100">
        <td className="py-2 px-3 font-medium text-gray-700">{name}</td>
        <td className="py-2 px-3 text-gray-400" colSpan={9}>No data</td>
      </tr>
    );
  }
  const fmt = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '—');
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-3 font-medium text-gray-700">{name}</td>
      <td className="py-2 px-3">{s.n}</td>
      <td className="py-2 px-3">{fmt(s.mean)}</td>
      <td className="py-2 px-3">{fmt(s.median)}</td>
      <td className="py-2 px-3">{fmt(s.sd)}</td>
      <td className="py-2 px-3">{fmt(s.min)}</td>
      <td className="py-2 px-3">{fmt(s.max)}</td>
      <td className="py-2 px-3">{fmt(s.q1)}</td>
      <td className="py-2 px-3">{fmt(s.q3)}</td>
      <td className="py-2 px-3">{fmt(s.ci95Lower)}–{fmt(s.ci95Upper)}</td>
    </tr>
  );
}

// ============================================================================

export default function ResearchPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'dashboard' | 'query'>('dashboard');

  // -------- Shared filters --------
  const [meta, setMeta] = useState<any>({ specialties: [], units: [], theatres: [], surgeons: [], anaesthetists: [] });
  const [filters, setFilters] = useState({
    startDate: '', endDate: '', specialty: '', unit: '', theatre: '',
    surgeonId: '', anaesthetistId: '', type: '', status: '', ageGroup: '',
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // -------- Load selector metadata once --------
  useEffect(() => {
    fetch('/api/research?meta=1')
      .then((r) => r.json())
      .then((m) => { if (!m.error) setMeta(m); })
      .catch(() => {});
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
      const res = await fetch(`/api/research?${qs.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const resetFilters = () => setFilters({
    startDate: '', endDate: '', specialty: '', unit: '', theatre: '',
    surgeonId: '', anaesthetistId: '', type: '', status: '', ageGroup: '',
  });

  // -------- Chart datasets from response --------
  const trendChart = () => {
    const monthly = data?.trends?.monthly || {};
    const labels = Object.keys(monthly).sort();
    return {
      labels,
      datasets: [{
        label: 'Cases', data: labels.map((l) => monthly[l]),
        borderColor: PALETTE[0], backgroundColor: 'rgba(59,130,246,0.12)', fill: true, tension: 0.35,
      }],
    };
  };
  const specialtyChart = () => {
    const b = data?.bySpecialty || {};
    const labels = Object.keys(b).sort((x, y) => b[y] - b[x]);
    return {
      labels,
      datasets: [{ label: 'Cases', data: labels.map((l) => b[l]), backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]) }],
    };
  };
  const utilizationChart = () => {
    const u = data?.orUtilization || [];
    return {
      labels: u.map((x: any) => x.theatre),
      datasets: [{ label: 'Operating hours', data: u.map((x: any) => x.operatingHours), backgroundColor: PALETTE[5] }],
    };
  };
  const complexityChart = () => {
    const c = data?.complexityDistribution || {};
    const order = ['Minor', 'Intermediate', 'Major', 'Supermajor'];
    const labels = order.filter((k) => c[k] != null);
    const colorMap: Record<string, string> = { Minor: '#22c55e', Intermediate: '#3b82f6', Major: '#f59e0b', Supermajor: '#ef4444' };
    return {
      labels,
      datasets: [{ data: labels.map((l) => c[l]), backgroundColor: labels.map((l) => colorMap[l]) }],
    };
  };
  const cancellationChart = () => {
    const c = data?.cancellation?.byCategory || {};
    const labels = Object.keys(c);
    return {
      labels,
      datasets: [{ data: labels.map((l) => c[l]), backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]) }],
    };
  };
  const anaesthesiaChart = () => {
    const a = data?.anaesthesiaMix || {};
    const labels = Object.keys(a);
    return {
      labels,
      datasets: [{ data: labels.map((l) => a[l]), backgroundColor: labels.map((_, i) => PALETTE[(i + 3) % PALETTE.length]) }],
    };
  };

  // -------- Dashboard exports --------
  const buildExportSheets = () => {
    if (!data) return [];
    const v = data.volume;
    const summary = [
      { Metric: 'Total cases', Value: v.total },
      { Metric: 'Completed', Value: v.completed },
      { Metric: 'Cancelled', Value: v.cancelled },
      { Metric: 'In progress', Value: v.inProgress },
      { Metric: 'Scheduled', Value: v.scheduled },
      { Metric: 'Elective', Value: v.elective },
      { Metric: 'Urgent', Value: v.urgent },
      { Metric: 'Emergency', Value: v.emergency },
      { Metric: 'Average cases/day', Value: v.avgPerDay },
      { Metric: 'Cancellation rate (%)', Value: v.cancellationRate },
    ];
    const specialty = Object.entries(data.bySpecialty || {}).map(([Specialty, Cases]) => ({ Specialty, Cases }));
    const utilization = (data.orUtilization || []).map((u: any) => ({ Theatre: u.theatre, Cases: u.cases, 'Operating hours': u.operatingHours, 'Avg case (min)': u.avgCaseMinutes }));
    const surgeons = (data.surgeonPerformance || []).map((s: any) => ({
      Surgeon: s.surgeon, Cases: s.cases,
      'Avg duration (min)': Math.round(s.avgDuration),
      'Avg blood loss (mL)': Math.round(s.avgBloodLoss),
      'Avg complexity': Math.round(s.avgComplexity),
      'Cancellation %': Math.round(s.cancellationRate * 10) / 10,
      'Emergency %': Math.round(s.emergencyRatio * 10) / 10,
    }));
    const complexity = Object.entries(data.complexityDistribution || {}).map(([Class, Cases]) => ({ Class, Cases }));
    const cancellations = Object.entries(data.cancellation?.byReason || {}).map(([Reason, Count]) => ({ Reason, Count }));
    const stats = [
      { Measure: 'Duration (min)', ...flatStat(data.durationStats) },
      { Measure: 'Blood loss (mL)', ...flatStat(data.bloodLossStats) },
      { Measure: 'Complexity score', ...flatStat(data.complexityStats) },
    ];
    return [
      { name: 'Summary', data: summary },
      { name: 'By Specialty', data: specialty },
      { name: 'OR Utilization', data: utilization },
      { name: 'Surgeon Performance', data: surgeons },
      { name: 'Complexity', data: complexity },
      { name: 'Cancellations', data: cancellations },
      { name: 'Descriptive Stats', data: stats },
    ];
  };

  const exportDashboardExcel = async () => {
    const sheets = buildExportSheets();
    if (sheets.length) await exportMultiSheetExcel(sheets, `theatre-research-${new Date().toISOString().slice(0, 10)}`);
  };

  const exportDashboardPdf = async () => {
    if (!data) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Theatre Research & Analytics Report', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);
    const range = filters.startDate || filters.endDate ? `${filters.startDate || '…'} to ${filters.endDate || '…'}` : 'All dates';
    doc.text(`Period: ${range}`, 14, 30);
    doc.setTextColor(0);
    const v = data.volume;
    autoTable(doc, {
      startY: 36, head: [['Metric', 'Value']],
      body: [
        ['Total cases', v.total], ['Completed', v.completed], ['Cancelled', v.cancelled],
        ['Elective', v.elective], ['Emergency', v.emergency], ['Avg cases/day', v.avgPerDay],
        ['Cancellation rate (%)', v.cancellationRate],
      ],
      theme: 'striped', headStyles: { fillColor: [59, 130, 246] },
    });
    autoTable(doc, {
      head: [['Measure', 'n', 'Mean', 'Median', 'SD', 'Min', 'Max']],
      body: [
        statPdfRow('Duration (min)', data.durationStats),
        statPdfRow('Blood loss (mL)', data.bloodLossStats),
        statPdfRow('Complexity score', data.complexityStats),
      ],
      theme: 'grid', headStyles: { fillColor: [34, 197, 94] },
    });
    const surg = (data.surgeonPerformance || []).slice(0, 20).map((s: any) => [
      s.surgeon, s.cases, Math.round(s.avgDuration), Math.round(s.avgComplexity), `${Math.round(s.cancellationRate)}%`,
    ]);
    if (surg.length) {
      autoTable(doc, {
        head: [['Surgeon', 'Cases', 'Avg dur (min)', 'Avg complexity', 'Cancel %']],
        body: surg, theme: 'striped', headStyles: { fillColor: [139, 92, 246] },
      });
    }
    doc.save(`theatre-research-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ==========================================================================
  // Query builder state
  // ==========================================================================
  const [include, setInclude] = useState<Criterion[]>([]);
  const [exclude, setExclude] = useState<Criterion[]>([]);
  const [qbDates, setQbDates] = useState({ startDate: '', endDate: '' });
  const [test, setTest] = useState<any>({ type: '', numericField: 'durationMinutes', groupField: 'type', groupA: '', groupB: '', rowField: 'complexityClass', colField: 'status', fieldX: 'durationMinutes', fieldY: 'bloodLoss' });
  const [qbResult, setQbResult] = useState<any>(null);
  const [qbLoading, setQbLoading] = useState(false);
  const [qbError, setQbError] = useState('');

  const addCriterion = (kind: 'inc' | 'exc') => {
    const c: Criterion = { field: 'subspecialty', op: 'eq', value: '' };
    if (kind === 'inc') setInclude((p) => [...p, c]); else setExclude((p) => [...p, c]);
  };
  const updateCriterion = (kind: 'inc' | 'exc', i: number, patch: Partial<Criterion>) => {
    const upd = (list: Criterion[]) => list.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    if (kind === 'inc') setInclude(upd); else setExclude(upd);
  };
  const removeCriterion = (kind: 'inc' | 'exc', i: number) => {
    if (kind === 'inc') setInclude((p) => p.filter((_, idx) => idx !== i));
    else setExclude((p) => p.filter((_, idx) => idx !== i));
  };

  const serializeCriteria = (list: Criterion[]) => list
    .filter((c) => c.value !== '')
    .map((c) => ({
      field: c.field,
      op: c.op,
      value: c.op === 'in' ? c.value.split(',').map((s) => s.trim()).filter(Boolean) : (isNumericField(c.field) ? Number(c.value) : c.value),
    }));

  const runQuery = async () => {
    setQbLoading(true);
    setQbError('');
    try {
      const body: any = {
        startDate: qbDates.startDate || undefined,
        endDate: qbDates.endDate || undefined,
        include: serializeCriteria(include),
        exclude: serializeCriteria(exclude),
      };
      if (test.type) body.test = test;
      const res = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setQbResult(json);
    } catch (e: any) {
      setQbError(e.message || 'Query failed');
    } finally {
      setQbLoading(false);
    }
  };

  const exportQbDataset = async (format: 'excel' | 'csv') => {
    if (!qbResult?.dataset?.length) return;
    const fn = `research-cohort-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'excel') await exportToExcel(qbResult.dataset, fn, 'Cohort');
    else await exportToCSV(qbResult.dataset, fn);
  };

  const canView = session != null;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
          <FlaskConical className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Theatre Research &amp; Analytics</h1>
          <p className="text-sm text-gray-500">Volume, utilization, complexity &amp; statistical analysis of theatre activity</p>
        </div>
      </div>

      {!canView && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">Please sign in to view research analytics.</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setTab('dashboard')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <BarChart3 className="w-4 h-4 inline mr-1.5" />Analytics Dashboard
        </button>
        <button
          onClick={() => setTab('query')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'query' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Database className="w-4 h-4 inline mr-1.5" />Research Query Builder
        </button>
      </div>

      {tab === 'dashboard' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
            <div className="flex items-center gap-2 mb-3 text-gray-700">
              <Filter className="w-4 h-4" /><span className="text-sm font-semibold">Filters</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <label className="text-xs text-gray-500">From
                <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-gray-500">To
                <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-gray-500">Specialty
                <select value={filters.specialty} onChange={(e) => setFilters({ ...filters, specialty: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  {meta.specialties.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Unit
                <select value={filters.unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  {meta.units.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Theatre
                <select value={filters.theatre} onChange={(e) => setFilters({ ...filters, theatre: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  {meta.theatres.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Surgeon
                <select value={filters.surgeonId} onChange={(e) => setFilters({ ...filters, surgeonId: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  {meta.surgeons.map((s: any) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Anaesthetist
                <select value={filters.anaesthetistId} onChange={(e) => setFilters({ ...filters, anaesthetistId: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  {meta.anaesthetists.map((s: any) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Type
                <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  <option value="ELECTIVE">Elective</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">Age group
                <select value={filters.ageGroup} onChange={(e) => setFilters({ ...filters, ageGroup: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  <option value="adult">Adult (≥16)</option>
                  <option value="paediatric">Paediatric (&lt;16)</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">Status
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">All</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In progress</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={loadDashboard} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                <RefreshCw className="w-4 h-4" />Apply
              </button>
              <button onClick={resetFilters} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Reset</button>
              <div className="flex-1" />
              <button onClick={exportDashboardExcel} disabled={!data} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
                <FileSpreadsheet className="w-4 h-4" />Excel
              </button>
              <button onClick={exportDashboardPdf} disabled={!data} className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-40">
                <FileText className="w-4 h-4" />PDF
              </button>
            </div>
          </div>

          {error && <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          {loading && <div className="p-8 text-center text-gray-400">Loading analytics…</div>}

          {data && !loading && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                <KpiCard label="Total cases" value={data.volume.total} color="#4f46e5" />
                <KpiCard label="Completed" value={data.volume.completed} color="#16a34a" />
                <KpiCard label="Cancelled" value={data.volume.cancelled} sub={`${data.volume.cancellationRate}% rate`} color="#dc2626" />
                <KpiCard label="Elective" value={data.volume.elective} color="#2563eb" />
                <KpiCard label="Emergency" value={data.volume.emergency} sub={`${data.volume.urgent} urgent`} color="#ea580c" />
                <KpiCard label="Avg / day" value={data.volume.avgPerDay} color="#7c3aed" />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Activity className="w-4 h-4" />Case volume trend (monthly)</h3>
                  <div className="h-64"><Line data={trendChart()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Layers className="w-4 h-4" />Cases by specialty</h3>
                  <div className="h-64"><Bar data={specialtyChart()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, indexAxis: 'y' as const }} /></div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" />Operating hours by theatre</h3>
                  <div className="h-64"><Bar data={utilizationChart()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Sigma className="w-4 h-4" />Surgical complexity distribution</h3>
                  <div className="h-64"><Doughnut data={complexityChart()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const } } }} /></div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Cancellations by category</h3>
                  <div className="h-64">{Object.keys(data.cancellation?.byCategory || {}).length ? <Pie data={cancellationChart()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const } } }} /> : <p className="text-center text-gray-400 pt-20">No cancellations in range</p>}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Activity className="w-4 h-4" />Anaesthesia mix</h3>
                  <div className="h-64">{Object.keys(data.anaesthesiaMix || {}).length ? <Doughnut data={anaesthesiaChart()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const } } }} /> : <p className="text-center text-gray-400 pt-20">No data</p>}</div>
                </div>
              </div>

              {/* Descriptive statistics */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Sigma className="w-4 h-4" />Descriptive statistics</h3>
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3">Measure</th><th className="py-2 px-3">n</th><th className="py-2 px-3">Mean</th>
                      <th className="py-2 px-3">Median</th><th className="py-2 px-3">SD</th><th className="py-2 px-3">Min</th>
                      <th className="py-2 px-3">Max</th><th className="py-2 px-3">Q1</th><th className="py-2 px-3">Q3</th><th className="py-2 px-3">95% CI</th>
                    </tr>
                  </thead>
                  <tbody>
                    <StatRow name="Duration (min)" s={data.durationStats} />
                    <StatRow name="Blood loss (mL)" s={data.bloodLossStats} />
                    <StatRow name="Complexity score" s={data.complexityStats} />
                  </tbody>
                </table>
              </div>

              {/* Surgeon performance */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Users className="w-4 h-4" />Surgeon performance</h3>
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3">Surgeon</th><th className="py-2 px-3">Cases</th><th className="py-2 px-3">Avg duration (min)</th>
                      <th className="py-2 px-3">Avg blood loss (mL)</th><th className="py-2 px-3">Avg complexity</th><th className="py-2 px-3">Cancellation %</th><th className="py-2 px-3">Emergency %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.surgeonPerformance || []).map((s: any) => (
                      <tr key={s.surgeon} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-700">{s.surgeon}</td>
                        <td className="py-2 px-3">{s.cases}</td>
                        <td className="py-2 px-3">{Math.round(s.avgDuration)}</td>
                        <td className="py-2 px-3">{Math.round(s.avgBloodLoss)}</td>
                        <td className="py-2 px-3">{Math.round(s.avgComplexity)}</td>
                        <td className="py-2 px-3">{Math.round(s.cancellationRate * 10) / 10}%</td>
                        <td className="py-2 px-3">{Math.round(s.emergencyRatio * 10) / 10}%</td>
                      </tr>
                    ))}
                    {(!data.surgeonPerformance || data.surgeonPerformance.length === 0) && (
                      <tr><td className="py-3 px-3 text-gray-400" colSpan={7}>No cases in range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'query' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" />Cohort definition</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="text-xs text-gray-500">From
                <input type="date" value={qbDates.startDate} onChange={(e) => setQbDates({ ...qbDates, startDate: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-gray-500">To
                <input type="date" value={qbDates.endDate} onChange={(e) => setQbDates({ ...qbDates, endDate: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </label>
            </div>

            <CriteriaEditor title="Inclusion criteria (all must match)" kind="inc" list={include} onAdd={addCriterion} onUpdate={updateCriterion} onRemove={removeCriterion} accent="emerald" />
            <CriteriaEditor title="Exclusion criteria (exclude if any match)" kind="exc" list={exclude} onAdd={addCriterion} onUpdate={updateCriterion} onRemove={removeCriterion} accent="rose" />
          </div>

          {/* Optional statistical test */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Sigma className="w-4 h-4" />Inferential test (optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs text-gray-500">Test
                <select value={test.type} onChange={(e) => setTest({ ...test, type: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">None</option>
                  <option value="ttest">Welch t-test (2 groups)</option>
                  <option value="mannwhitney">Mann–Whitney U (2 groups)</option>
                  <option value="chisquare">Chi-square (association)</option>
                  <option value="pearson">Pearson correlation</option>
                </select>
              </label>
              {(test.type === 'ttest' || test.type === 'mannwhitney') && (
                <>
                  <label className="text-xs text-gray-500">Numeric outcome
                    <select value={test.numericField} onChange={(e) => setTest({ ...test, numericField: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {NUMERIC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-gray-500">Group by
                    <select value={test.groupField} onChange={(e) => setTest({ ...test, groupField: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {CATEGORICAL_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-gray-500">Group A
                      <input value={test.groupA} onChange={(e) => setTest({ ...test, groupA: e.target.value })} placeholder="e.g. ELECTIVE" className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-gray-500">Group B
                      <input value={test.groupB} onChange={(e) => setTest({ ...test, groupB: e.target.value })} placeholder="e.g. EMERGENCY" className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                  </div>
                </>
              )}
              {test.type === 'chisquare' && (
                <>
                  <label className="text-xs text-gray-500">Rows
                    <select value={test.rowField} onChange={(e) => setTest({ ...test, rowField: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {CATEGORICAL_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-gray-500">Columns
                    <select value={test.colField} onChange={(e) => setTest({ ...test, colField: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {CATEGORICAL_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                </>
              )}
              {test.type === 'pearson' && (
                <>
                  <label className="text-xs text-gray-500">Variable X
                    <select value={test.fieldX} onChange={(e) => setTest({ ...test, fieldX: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {NUMERIC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-gray-500">Variable Y
                    <select value={test.fieldY} onChange={(e) => setTest({ ...test, fieldY: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {NUMERIC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={runQuery} disabled={qbLoading} className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              <Play className="w-4 h-4" />{qbLoading ? 'Running…' : 'Run query'}
            </button>
            <button onClick={() => exportQbDataset('excel')} disabled={!qbResult?.dataset?.length} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
              <FileSpreadsheet className="w-4 h-4" />Export anonymized (Excel)
            </button>
            <button onClick={() => exportQbDataset('csv')} disabled={!qbResult?.dataset?.length} className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
              <Download className="w-4 h-4" />CSV
            </button>
          </div>

          {qbError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{qbError}</div>}

          {qbResult && (
            <>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm text-gray-600">Cohort size: <span className="font-bold text-indigo-600">{qbResult.count}</span> case(s)</p>
              </div>

              {/* Descriptive stats */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Descriptive statistics</h3>
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3">Measure</th><th className="py-2 px-3">n</th><th className="py-2 px-3">Mean</th>
                      <th className="py-2 px-3">Median</th><th className="py-2 px-3">SD</th><th className="py-2 px-3">Min</th>
                      <th className="py-2 px-3">Max</th><th className="py-2 px-3">Q1</th><th className="py-2 px-3">Q3</th><th className="py-2 px-3">95% CI</th>
                    </tr>
                  </thead>
                  <tbody>
                    <StatRow name="Patient age (yrs)" s={qbResult.descriptive?.age} />
                    <StatRow name="Duration (min)" s={qbResult.descriptive?.durationMinutes} />
                    <StatRow name="Blood loss (mL)" s={qbResult.descriptive?.bloodLoss} />
                    <StatRow name="Complexity score" s={qbResult.descriptive?.complexityScore} />
                  </tbody>
                </table>
              </div>

              {/* Inferential result */}
              {qbResult.inferential && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Inferential test result</h3>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p><span className="font-medium">Test:</span> {qbResult.inferential.test}</p>
                    {qbResult.inferential.groupA && <p><span className="font-medium">Groups:</span> {qbResult.inferential.groupField} = {qbResult.inferential.groupA} vs {qbResult.inferential.groupB}</p>}
                    {qbResult.inferential.fieldX && <p><span className="font-medium">Variables:</span> {qbResult.inferential.fieldX} × {qbResult.inferential.fieldY}</p>}
                    {qbResult.inferential.statistic != null && <p><span className="font-medium">Statistic:</span> {Math.round(qbResult.inferential.statistic * 1000) / 1000}</p>}
                    {qbResult.inferential.pValue != null && (
                      <p><span className="font-medium">p-value:</span> {qbResult.inferential.pValue < 0.001 ? '< 0.001' : Math.round(qbResult.inferential.pValue * 1000) / 1000}
                        {' '}<span className={qbResult.inferential.pValue < 0.05 ? 'text-green-600 font-semibold' : 'text-gray-500'}>({qbResult.inferential.pValue < 0.05 ? 'significant' : 'not significant'} at α=0.05)</span>
                      </p>
                    )}
                    {qbResult.inferential.df != null && <p><span className="font-medium">df:</span> {Math.round(qbResult.inferential.df * 100) / 100}</p>}
                  </div>
                </div>
              )}

              {/* Anonymized preview */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Anonymized dataset preview (first 50 rows)</h3>
                {qbResult.dataset?.length ? (
                  <table className="w-full text-xs min-w-[900px]">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        {Object.keys(qbResult.dataset[0]).map((k) => <th key={k} className="py-1.5 px-2 whitespace-nowrap">{k}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {qbResult.dataset.slice(0, 50).map((row: any, i: number) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          {Object.keys(qbResult.dataset[0]).map((k) => <td key={k} className="py-1.5 px-2 whitespace-nowrap">{row[k] == null ? '—' : String(row[k])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-gray-400 text-sm">No cases match this cohort.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Criteria editor sub-component -----------------------------------------
function CriteriaEditor({
  title, kind, list, onAdd, onUpdate, onRemove, accent,
}: {
  title: string;
  kind: 'inc' | 'exc';
  list: Criterion[];
  onAdd: (k: 'inc' | 'exc') => void;
  onUpdate: (k: 'inc' | 'exc', i: number, patch: Partial<Criterion>) => void;
  onRemove: (k: 'inc' | 'exc', i: number) => void;
  accent: 'emerald' | 'rose';
}) {
  const allFields = [...NUMERIC_FIELDS, ...CATEGORICAL_FIELDS];
  const btn = accent === 'emerald' ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-rose-700 bg-rose-50 hover:bg-rose-100';
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
        <button onClick={() => onAdd(kind)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${btn}`}>
          <Plus className="w-3.5 h-3.5" />Add
        </button>
      </div>
      {list.length === 0 && <p className="text-xs text-gray-400 italic">None</p>}
      <div className="space-y-2">
        {list.map((c, i) => {
          const numeric = isNumericField(c.field);
          const ops = numeric ? NUMERIC_OPS : CATEGORICAL_OPS;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={c.field}
                onChange={(e) => {
                  const nf = e.target.value;
                  const nowNumeric = isNumericField(nf);
                  onUpdate(kind, i, { field: nf, op: nowNumeric ? 'gte' : 'eq' });
                }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm min-w-[160px]"
              >
                {allFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select value={c.op} onChange={(e) => onUpdate(kind, i, { op: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                value={c.value}
                onChange={(e) => onUpdate(kind, i, { value: e.target.value })}
                placeholder={numeric ? 'number' : (c.op === 'in' ? 'A, B, C' : 'value')}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]"
              />
              <button onClick={() => onRemove(kind, i)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Stat formatting helpers ----------------------------------------------
function flatStat(s: any) {
  if (!s || !s.n) return { n: 0, Mean: '', Median: '', SD: '', Min: '', Max: '', Q1: '', Q3: '', 'CI95 Lower': '', 'CI95 Upper': '' };
  const r = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '');
  return { n: s.n, Mean: r(s.mean), Median: r(s.median), SD: r(s.sd), Min: r(s.min), Max: r(s.max), Q1: r(s.q1), Q3: r(s.q3), 'CI95 Lower': r(s.ci95Lower), 'CI95 Upper': r(s.ci95Upper) };
}
function statPdfRow(name: string, s: any): (string | number)[] {
  if (!s || !s.n) return [name, 0, '—', '—', '—', '—', '—'];
  const r = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '—');
  return [name, s.n, r(s.mean), r(s.median), r(s.sd), r(s.min), r(s.max)];
}
