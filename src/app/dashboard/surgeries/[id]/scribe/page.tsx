'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Stethoscope, AlertTriangle, AlertCircle, Info, CheckCircle2, Loader2, RefreshCw, ShieldAlert,
} from 'lucide-react';

type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'OK';
interface Finding { severity: Severity; category: string; title: string; detail: string; recommendation: string }
interface ScribeResponse {
  surgery: { id: string; procedureName: string; surgeryType: string; subspecialty?: string; unit?: string; scheduledDate?: string; scheduledTime?: string; patient?: { name?: string; age?: number; ageUnit?: string; gender?: string; folderNumber?: string } };
  overall: Severity; headline: string; counts: { CRITICAL: number; WARNING: number; INFO: number };
  findings: Finding[]; generatedAt: string; disclaimer: string;
}

const SEV = {
  CRITICAL: { icon: ShieldAlert, chip: 'bg-red-100 text-red-800 border-red-200', bar: 'bg-red-500', text: 'text-red-700', label: 'Critical' },
  WARNING: { icon: AlertTriangle, chip: 'bg-amber-100 text-amber-800 border-amber-200', bar: 'bg-amber-500', text: 'text-amber-700', label: 'Caution' },
  INFO: { icon: Info, chip: 'bg-blue-100 text-blue-800 border-blue-200', bar: 'bg-blue-500', text: 'text-blue-700', label: 'Advisory' },
  OK: { icon: CheckCircle2, chip: 'bg-green-100 text-green-800 border-green-200', bar: 'bg-green-500', text: 'text-green-700', label: 'OK' },
} as const;

export default function MedicalScribePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ScribeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    fetch(`/api/surgeries/${id}/scribe`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`); return r.json(); })
      .then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  const overall = data ? SEV[data.overall] : SEV.OK;
  const showFindings = data?.findings.filter((x) => x.severity !== 'OK') ?? [];
  const okFindings = data?.findings.filter((x) => x.severity === 'OK') ?? [];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-indigo-100 flex items-center justify-center"><Stethoscope className="w-6 h-6 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Medical Scribe — Pre-op Safety Check</h1>
            <p className="text-sm text-gray-500">Automated analysis of recorded clinical data & consent</p>
          </div>
        </div>
        <button onClick={load} className="btn-secondary text-sm inline-flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Re-run</button>
      </div>

      {loading && <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Analysing…</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

      {data && !loading && (
        <>
          {/* Patient / case header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div><div className="text-xs text-gray-400">Patient</div><div className="font-medium">{data.surgery.patient?.name ?? '—'}</div></div>
              <div><div className="text-xs text-gray-400">Folder / Age / Sex</div><div className="font-medium">{data.surgery.patient?.folderNumber ?? '—'} · {data.surgery.patient?.age ?? '?'} {(data.surgery.patient?.ageUnit ?? 'YEARS').toLowerCase()} · {data.surgery.patient?.gender ?? '—'}</div></div>
              <div><div className="text-xs text-gray-400">Procedure</div><div className="font-medium">{data.surgery.procedureName}</div></div>
              <div><div className="text-xs text-gray-400">Type / Unit</div><div className="font-medium">{data.surgery.surgeryType} · {data.surgery.unit ?? data.surgery.subspecialty ?? '—'}</div></div>
            </div>
          </div>

          {/* Overall banner */}
          <div className={`rounded-lg border p-4 flex items-start gap-3 ${overall.chip}`}>
            <overall.icon className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{data.headline}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-white/70 border border-red-200 text-red-700">{data.counts.CRITICAL} critical</span>
                <span className="px-2 py-0.5 rounded-full bg-white/70 border border-amber-200 text-amber-700">{data.counts.WARNING} caution</span>
                <span className="px-2 py-0.5 rounded-full bg-white/70 border border-blue-200 text-blue-700">{data.counts.INFO} advisory</span>
              </div>
            </div>
          </div>

          {/* Findings */}
          <div className="space-y-3">
            {showFindings.length === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> No abnormal or missing findings in the recorded data.
              </div>
            )}
            {showFindings.map((x, i) => {
              const sev = SEV[x.severity];
              return (
                <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex">
                  <div className={`w-1.5 ${sev.bar}`} />
                  <div className="p-4 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <sev.icon className={`w-4 h-4 ${sev.text}`} />
                      <span className="font-semibold text-gray-900">{x.title}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${sev.chip}`}>{sev.label}</span>
                      <span className="text-[11px] text-gray-400">{x.category}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{x.detail}</p>
                    <p className="text-sm mt-2"><span className="font-medium text-gray-800">Action:</span> <span className="text-gray-700">{x.recommendation}</span></p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Normal / documented items */}
          {okFindings.length > 0 && (
            <details className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">{okFindings.length} item(s) documented & within normal limits</summary>
              <ul className="mt-2 space-y-1">
                {okFindings.map((x, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {x.title}</li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-xs text-gray-400">
            Generated {new Date(data.generatedAt).toLocaleString()}. {data.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}
