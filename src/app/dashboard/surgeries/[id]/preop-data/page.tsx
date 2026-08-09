'use client';

// ============================================================
// Recording the pre-operative clinical values after booking
// ------------------------------------------------------------
// The safety check flags a missing haemoglobin and always did — the FBC is
// rarely back when a case is booked. But the only screen that could record one
// was the booking form, which cannot be reopened, and the edit page covers
// ward and scheduling and has no clinical fields at all. So the finding was
// true, unarguable and impossible to close.
//
// This is the missing screen. It carries exactly the values the check reads,
// nothing else, and it opens with the field you were sent here for already
// focused, so a house officer with one result in hand types one number.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FlaskConical, Loader2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { PREOP_FIELDS, CODE_TO_FIELD, type PreopField } from '@/lib/preopData';
import { safeReturnTo } from '@/lib/scribeResolutions';

interface Loaded {
  procedureName?: string;
  surgeryType?: string;
  scheduledDate?: string;
  patient?: { name?: string; folderNumber?: string; age?: number; ageUnit?: string; gender?: string };
  [key: string]: unknown;
}

/** A datetime-local input needs "YYYY-MM-DDTHH:mm" in LOCAL time. */
function toLocalInput(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PreopDataPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [values, setValues] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Where the safety check sent us from, and which finding it was about.
  const [returnTo, setReturnTo] = useState('');
  const [focusField, setFocusField] = useState('');
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnTo(q.get('returnTo'), ''));
    const code = q.get('code') ?? '';
    setFocusField(CODE_TO_FIELD[code] ?? q.get('field') ?? '');
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/surgeries/${id}/preop-data`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Loaded) => {
        setInfo(d);
        const next: Record<string, string> = {};
        for (const f of PREOP_FIELDS) {
          const v = d[f.name];
          next[f.name] = f.kind === 'datetime' ? toLocalInput(v) : v === null || v === undefined ? '' : String(v);
        }
        setValues(next);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Put the cursor in the field they came for, once the data has loaded.
  useEffect(() => {
    if (!loading && focusField && firstRef.current) {
      firstRef.current.focus();
      firstRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading, focusField]);

  const groups = useMemo(() => {
    const m = new Map<string, PreopField[]>();
    for (const f of PREOP_FIELDS) m.set(f.group, [...(m.get(f.group) ?? []), f]);
    return Array.from(m.entries());
  }, []);

  const set = (name: string, v: string) => {
    setValues((s) => ({ ...s, [name]: v }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      // Everything is sent, including blanks: an empty field clears a value,
      // which is how a result entered against the wrong patient is removed.
      const payload: Record<string, string> = {};
      for (const f of PREOP_FIELDS) payload[f.name] = values[f.name] ?? '';

      const res = await fetch(`/api/surgeries/${id}/preop-data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const patient = info?.patient;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-indigo-100 flex items-center justify-center">
          <FlaskConical className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pre-op clinical data</h1>
          <p className="text-sm text-gray-500">Laboratory results and risk assessments the safety check reads</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && info && (
        <>
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4 text-sm">
            <div className="grid sm:grid-cols-3 gap-3">
              <div><div className="text-xs text-gray-400">Patient</div><div className="font-medium">{patient?.name ?? '—'}</div></div>
              <div><div className="text-xs text-gray-400">Folder</div><div className="font-medium">{patient?.folderNumber ?? '—'}</div></div>
              <div><div className="text-xs text-gray-400">Procedure</div><div className="font-medium">{info.procedureName ?? '—'}</div></div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          {saved && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Saved.</div>
              {returnTo && (
                <a href={returnTo} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800">
                  Back to the safety check
                </a>
              )}
            </div>
          )}

          <form onSubmit={save} className="space-y-4">
            {groups.map(([group, fields]) => (
              <div key={group} className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
                <h2 className="font-semibold text-gray-900 mb-3">{group}</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {fields.map((f) => {
                    const isTarget = f.name === focusField;
                    const common = {
                      id: f.name,
                      value: values[f.name] ?? '',
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(f.name, e.target.value),
                      className: `w-full rounded-lg border px-3 py-2.5 text-base focus:ring-1 ${
                        isTarget ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/40' : 'border-gray-300'
                      } focus:border-indigo-500 focus:ring-indigo-500`,
                    };
                    return (
                      <div key={f.name}>
                        <label htmlFor={f.name} className="block text-sm font-medium text-gray-800 mb-1">
                          {f.label}{f.unit ? <span className="text-gray-400 font-normal"> ({f.unit})</span> : null}
                        </label>
                        {f.kind === 'choice' ? (
                          <select {...common} ref={isTarget ? (el) => { firstRef.current = el; } : undefined}>
                            <option value="">Not recorded</option>
                            {f.choices!.map((c) => (
                              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            {...common}
                            ref={isTarget ? (el) => { firstRef.current = el; } : undefined}
                            type={f.kind === 'datetime' ? 'datetime-local' : 'number'}
                            step={f.kind === 'number' ? '0.1' : '1'}
                            inputMode={f.kind === 'integer' ? 'numeric' : 'decimal'}
                            placeholder="Not recorded"
                          />
                        )}
                        {f.hint && <p className="text-xs text-gray-500 mt-1">{f.hint}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              <p className="text-xs text-gray-500">
                An empty field clears the recorded value. Changes are written to the audit log.
              </p>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
