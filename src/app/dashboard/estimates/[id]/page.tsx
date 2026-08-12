'use client';

// ============================================================
// The estimate builder
// ------------------------------------------------------------
// Where a person turns a DRAFT into a document a patient can be given.
//
// The page never computes money. It sends lines and renders the totals the
// server returns — so what is displayed is always what is stored, and a figure
// on screen can never disagree with a figure on the PDF.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Plus, RefreshCw, Send, Trash2, TriangleAlert, Check, Ban,
} from 'lucide-react';
import { SECTION_LABELS, SECTION_ORDER, formatNaira } from '@/lib/estimates/calculate';
import { CHARGE_KINDS } from '@/lib/estimates/chargeKinds';

interface Line {
  id?: string;
  section: string;
  kind: string;
  description: string;
  unit: string;
  quantity: number;
  unitPriceKobo: number;
  totalKobo: number;
  frequencyPerDay?: number | null;
  durationDays?: number | null;
  priceOverridden?: boolean;
  overrideReason?: string | null;
  tariffId?: string | null;
}

interface Estimate {
  id: string;
  estimateNumber: string;
  status: string;
  revision: number;
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  subspecialty?: string | null;
  unit?: string | null;
  surgeonName?: string | null;
  anaesthesiaType?: string | null;
  plannedDate?: string | null;
  admissionType: string;
  expectedStayDays: number;
  subtotalKobo: number;
  depositKobo: number;
  totalKobo: number;
  notes?: string | null;
  approvedByName?: string | null;
  validUntil?: string | null;
  lines: Line[];
}

const emptyLine = (): Line => ({
  section: 'SURGICAL_MATERIAL', kind: 'CONSUMABLE', description: '',
  unit: 'each', quantity: 1, unitPriceKobo: 0, totalKobo: 0,
  priceOverridden: true, overrideReason: '',
});

export default function EstimateBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [est, setEst] = useState<Estimate | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unpriced, setUnpriced] = useState<{ description: string; reason: string }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Autofill inputs. Codes, not amounts — the price master owns amounts.
  const [procedureCode, setProcedureCode] = useState('');
  const [theatreCode, setTheatreCode] = useState('');
  const [anaesthesiaCode, setAnaesthesiaCode] = useState('');
  const [admissionCode, setAdmissionCode] = useState('');
  const [ward, setWard] = useState('');
  const [stayDays, setStayDays] = useState(0);
  const [depositPercent, setDepositPercent] = useState<number | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/estimates/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the estimate.');
      setEst(data.estimate);
      setLines(data.estimate.lines ?? []);
      setStayDays(data.estimate.expectedStayDays ?? 0);
      setWard(data.estimate.ward ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the estimate.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  const send = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setUnpriced(data.unpriced ?? []);
      setWarnings(data.totals?.warnings ?? []);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = () => send({
    action: 'SAVE_LINES', lines, expectedStayDays: stayDays,
    admissionType: est?.admissionType, notes: est?.notes ?? '',
    depositPercent: depositPercent === '' ? undefined : Number(depositPercent),
  });

  const autofill = () => send({
    action: 'AUTOFILL', lines,
    procedureCode: procedureCode.trim() || undefined,
    theatreCode: theatreCode.trim() || undefined,
    anaesthesiaCode: anaesthesiaCode.trim() || undefined,
    admissionBaseCode: admissionCode.trim() || undefined,
    ward: ward.trim() || undefined,
    expectedStayDays: stayDays,
    admissionType: est?.admissionType,
    depositPercent: depositPercent === '' ? undefined : Number(depositPercent),
  });

  const downloadPdf = async () => {
    if (!est) return;
    setBusy(true);
    try {
      // Imported here rather than at the top so jsPDF stays out of the page
      // bundle until somebody actually asks for a document.
      const [{ buildEstimatePdf, estimateFileName }] = await Promise.all([
        import('@/lib/estimates/estimatePdf'),
      ]);
      const blob = await buildEstimatePdf({
        ...est,
        plannedDate: est.plannedDate ?? null,
        lines: lines.map((l) => ({
          section: l.section, description: l.description, unit: l.unit,
          quantity: l.quantity, unitPriceKobo: l.unitPriceKobo, totalKobo: l.totalKobo,
          frequencyPerDay: l.frequencyPerDay, durationDays: l.durationDays,
          priceOverridden: l.priceOverridden,
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = estimateFileName(est);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF.');
    } finally {
      setBusy(false);
    }
  };

  const shareWhatsApp = async () => {
    const phone = window.prompt("Patient or relative's WhatsApp number");
    if (!phone) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${params.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, viewUrl: window.location.href }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not share.');
      window.open(data.url, '_blank');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  const editable = est ? !['ISSUED', 'APPROVED', 'SUPERSEDED', 'CANCELLED'].includes(est.status) : false;

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  if (loading) {
    return <div className="p-6 text-gray-500">Loading estimate…</div>;
  }
  if (!est) {
    return (
      <div className="p-6">
        <p className="text-red-700">{error ?? 'Estimate not found.'}</p>
        <button onClick={() => router.back()} className="mt-3 text-blue-700 underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">
            {est.estimateNumber}
            {est.revision > 1 && <span className="ml-2 text-sm text-gray-500">rev {est.revision}</span>}
          </h1>
          <p className="text-sm text-gray-600 truncate">
            {est.patientName} · {est.procedureName}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
          est.status === 'APPROVED' ? 'bg-green-100 text-green-800'
            : est.status === 'ISSUED' ? 'bg-blue-100 text-blue-800'
            : est.status === 'CANCELLED' || est.status === 'SUPERSEDED' ? 'bg-gray-200 text-gray-700'
            : 'bg-amber-100 text-amber-800'
        }`}>
          {est.status.replace(/_/g, ' ')}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {/* Warnings the server produced. Shown prominently: these are the reasons an
          estimate should not yet be given to a patient. */}
      {(warnings.length > 0 || unpriced.length > 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="w-4 h-4" /> Check before issuing
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {warnings.map((w, i) => <li key={`w${i}`}>{w}</li>)}
            {unpriced.map((u, i) => (
              <li key={`u${i}`}>
                <strong>{u.description}</strong> — {u.reason}. Add it to the Price Master, or enter it by hand below.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Autofill from the price master and packs ---- */}
      {editable && (
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">Build from the price master</h2>
          <p className="text-xs text-gray-500">
            Enter the tariff <em>codes</em> — amounts always come from the Price Master, never typed here.
            Materials are pulled from the {est.subspecialty ? <>{est.subspecialty} </> : ''}surgical and anaesthetic packs.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Surgeon's fee code", procedureCode, setProcedureCode, 'e.g. SURGEON-MAJOR'],
              ['Theatre charge code', theatreCode, setTheatreCode, 'e.g. THEATRE-MAJOR'],
              ["Anaesthetist's fee code", anaesthesiaCode, setAnaesthesiaCode, 'e.g. ANAES-SPINAL'],
              ['Bed charge code', admissionCode, setAdmissionCode, 'e.g. BED-DAILY'],
              ['Ward', ward, setWard, 'e.g. Female Surgical'],
            ].map(([label, value, setter, ph]) => (
              <label key={label as string} className="block">
                <span className="text-xs font-medium text-gray-600">{label as string}</span>
                <input
                  value={value as string}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  placeholder={ph as string}
                  className="mt-1 w-full rounded border-gray-300 text-sm"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Expected stay (days)</span>
              <input
                type="number" min={0} value={stayDays}
                onChange={(e) => setStayDays(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded border-gray-300 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Deposit (% of total)</span>
              <input
                type="number" min={0} max={100} value={depositPercent}
                onChange={(e) => setDepositPercent(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 50"
                className="mt-1 w-full rounded border-gray-300 text-sm"
              />
            </label>
          </div>
          <button
            onClick={autofill} disabled={busy}
            className="inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Add priced lines
          </button>
        </div>
      )}

      {/* ---- Lines, grouped by section ---- */}
      <div className="space-y-4">
        {SECTION_ORDER.filter((s) => lines.some((l) => l.section === s)).map((section) => {
          const rows = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.section === section);
          const total = rows.reduce((sum, { l }) => sum + (l.totalKobo || 0), 0);
          return (
            <div key={section} className="rounded-lg border bg-white overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                <h3 className="text-sm font-bold text-gray-800">
                  {SECTION_LABELS[section]}
                </h3>
                <span className="text-sm font-semibold text-gray-900">{formatNaira(total)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {rows.map(({ l, i }) => (
                      <tr key={l.id ?? i} className={l.priceOverridden ? 'bg-amber-50/50' : ''}>
                        <td className="px-3 py-2">
                          <input
                            value={l.description} disabled={!editable}
                            onChange={(e) => setLine(i, { description: e.target.value })}
                            className="w-full border-0 bg-transparent p-0 text-sm focus:ring-0 disabled:text-gray-700"
                          />
                          {l.priceOverridden && (
                            <input
                              value={l.overrideReason ?? ''} disabled={!editable}
                              onChange={(e) => setLine(i, { overrideReason: e.target.value })}
                              placeholder="Reason for the manual price (required)"
                              className="mt-1 w-full border-0 bg-transparent p-0 text-xs text-amber-800 placeholder-amber-600 focus:ring-0"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input
                            type="number" min={1} value={l.quantity} disabled={!editable}
                            onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="w-full rounded border-gray-200 text-sm"
                          />
                        </td>
                        <td className="px-2 py-2 w-32 text-right tabular-nums text-gray-600">
                          {formatNaira(l.unitPriceKobo)}
                        </td>
                        <td className="px-2 py-2 w-32 text-right font-semibold tabular-nums">
                          {formatNaira(l.totalKobo)}
                        </td>
                        <td className="px-2 py-2 w-10">
                          {editable && (
                            <button
                              onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                              className="text-gray-400 hover:text-red-700"
                              aria-label="Remove line"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {lines.length === 0 && (
          <div className="rounded-lg border-2 border-dashed p-8 text-center text-gray-500">
            Nothing costed yet. Use <strong>Build from the price master</strong> above, or add a line by hand.
          </div>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setLines((p) => [...p, emptyLine()])}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add a line by hand
          </button>
          <button
            onClick={save} disabled={busy}
            className="inline-flex items-center gap-2 rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save and recalculate
          </button>
        </div>
      )}

      {/* ---- Totals: always the server's figures ---- */}
      <div className="rounded-lg border-2 border-blue-800 bg-white p-4">
        <div className="flex items-center justify-between text-lg">
          <span className="font-bold text-blue-900">TOTAL ESTIMATE</span>
          <span className="font-bold tabular-nums">{formatNaira(est.totalKobo)}</span>
        </div>
        {est.depositKobo > 0 && (
          <div className="mt-1 flex items-center justify-between text-sm text-gray-700">
            <span>Deposit payable before surgery</span>
            <span className="font-semibold tabular-nums">{formatNaira(est.depositKobo)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <button
          onClick={downloadPdf} disabled={busy}
          className="inline-flex items-center gap-2 rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>

        {est.status === 'DRAFT' && (
          <button
            onClick={() => send({ action: 'APPROVE', validDays: 30 })}
            disabled={busy || est.totalKobo <= 0}
            title={est.totalKobo <= 0 ? 'Nothing has been costed yet' : undefined}
            className="inline-flex items-center gap-2 rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Approve
          </button>
        )}

        {est.status === 'APPROVED' && (
          <button
            onClick={shareWhatsApp} disabled={busy}
            className="inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Send on WhatsApp
          </button>
        )}

        {editable && (
          <button
            onClick={() => {
              const reason = window.prompt('Why is this estimate being cancelled?');
              if (reason) void send({ action: 'CANCEL', cancelReason: reason });
            }}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
          >
            <Ban className="w-4 h-4" /> Cancel estimate
          </button>
        )}
      </div>

      {!editable && (
        <p className="text-xs text-gray-500">
          This estimate is {est.status.replace(/_/g, ' ').toLowerCase()} and can no longer be edited.
          {est.approvedByName && <> Approved by {est.approvedByName}.</>}
          {' '}To change the figures, create a revision so what the patient was already told stays on record.
        </p>
      )}
    </div>
  );
}
