'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, MapPin, RefreshCw, Clock } from 'lucide-react';

/**
 * MY PATIENTS — PERIOPERATIVE TRACKER
 *
 * A surgeon books a case and then loses sight of it. The patient is in
 * somebody else's hands at every step between the ward and the table, and the
 * only way to find out where was to telephone the holding area — which is why
 * the question usually gets asked once it has already become a problem.
 *
 * Deliberately shows LOCATION and TIME rather than a feed of events. The
 * surgeon's questions are "where is my patient", "how long has she been
 * there", and "who am I waiting on"; a chronological list of everything that
 * happened answers none of them without being read end to end.
 */

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'NORMAL';
  title: string;
  detail: string;
}

interface TrackedPatient {
  surgeryId: string;
  procedureName: string;
  patientName: string;
  folderNumber: string | null;
  theatreName: string | null;
  scheduledFor: string | null;
  currentPhase: string | null;
  currentLabel: string;
  state: string;
  responsible: string | null;
  since: string | null;
  minutesInPhase: number | null;
  lastUpdate: string | null;
  alerts: Alert[];
}

interface Response {
  patients: TrackedPatient[];
  summary: {
    total: number; inHolding: number; inTheatre: number;
    complete: number; alerts: number; critical: number;
  };
}

const TONE: Record<string, string> = {
  CRITICAL: 'border-red-300 bg-red-50 text-red-900',
  HIGH: 'border-amber-300 bg-amber-50 text-amber-900',
  NORMAL: 'border-slate-200 bg-slate-50 text-slate-800',
};

function duration(mins: number | null): string {
  if (mins === null) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function clockOf(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(11, 16);
}

export default function PerioperativeTracker() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/my-patients', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      // A broken tracker and an empty one look identical, and one of them
      // means a surgeon believes nothing needs him.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">Loading your patients…</div>;
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">The tracker could not be loaded.</p>
        <p className="mt-1">
          This is not the same as having no patients. Refresh, and if it persists tell
          the theatre office rather than assuming your list is clear.
        </p>
        <button onClick={load} className="mt-2 inline-flex items-center gap-1 font-medium underline">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const patients = data?.patients ?? [];
  const s = data?.summary;

  // Nothing to show, so show nothing. The API returns only cases this person is
  // named on, which means a pharmacist or a porter gets an empty list — and a
  // section headed "my patients" reading "none" on every non-surgeon's
  // dashboard is exactly the noise the personal board exists to avoid. A
  // surgeon with a clear list loses a small confirmation; everybody else loses
  // a permanent empty box.
  if (patients.length === 0) return null;

  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">My patients — perioperative tracker</h2>
        <button onClick={load} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {s && s.total > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: 'Today', value: s.total },
            { label: 'In holding', value: s.inHolding },
            { label: 'In theatre', value: s.inTheatre },
            { label: 'Complete', value: s.complete },
            { label: 'Needing you', value: s.critical, urgent: s.critical > 0 },
          ].map((c) => (
            <div
              key={c.label}
              className={`rounded-lg border p-2 text-center ${
                c.urgent ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <p className={`text-xl font-bold ${c.urgent ? 'text-red-700' : 'text-gray-900'}`}>{c.value}</p>
              <p className="text-xs text-gray-600">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {patients.map((p) => {
            const worst = p.alerts[0]?.severity;
            return (
              <div
                key={p.surgeryId}
                className={`rounded-lg border p-3 ${worst ? TONE[worst] : 'border-gray-200 bg-white'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <div>
                    <p className="font-semibold">
                      {p.patientName}
                      {p.folderNumber && <span className="ml-1 font-normal opacity-70">({p.folderNumber})</span>}
                    </p>
                    <p className="text-sm opacity-80">{p.procedureName}</p>
                  </div>
                  <p className="text-sm opacity-80">
                    {clockOf(p.scheduledFor)} · {p.theatreName ?? 'Theatre not allocated'}
                  </p>
                </div>

                {/* Where, since when, and who is next — the three questions. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <MapPin className="h-4 w-4" /> {p.currentLabel}
                  </span>
                  {p.minutesInPhase !== null && (
                    <span className="inline-flex items-center gap-1 opacity-80">
                      <Clock className="h-4 w-4" /> {duration(p.minutesInPhase)} · since {clockOf(p.since)}
                    </span>
                  )}
                  {p.responsible && <span className="opacity-80">Waiting on: {p.responsible}</span>}
                </div>

                {p.alerts.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {p.alerts.map((a) => (
                      <li key={a.id} className="flex gap-2 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <span className="font-medium">{a.title}.</span> {a.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <Link
                  href={`/dashboard/surgeries/${p.surgeryId}`}
                  className="mt-2 inline-block text-sm font-medium underline"
                >
                  Open the case
                </Link>
              </div>
            );
        })}
      </div>
    </section>
  );
}
