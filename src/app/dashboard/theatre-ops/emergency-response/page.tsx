'use client';

// ============================================================
// Emergency response monitoring
// ------------------------------------------------------------
// One question, asked continuously: who has not answered yet?
//
// So the layout leads with the departments that are silent rather than the
// people who replied. A board that opens with a reassuring list of names is
// the failure mode this screen exists to avoid — the case is held up by the
// rows that are empty.
//
// Positions are not shown as a map or a pin. Distance and ETA are what a
// coordinator can act on; where a surgeon physically is at 02:00 is not the
// theatre's business.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Ambulance,
  CheckCircle2,
  Clock,
  Loader2,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';

interface Row {
  role: string;
  label: string;
  state: 'RESPONDED' | 'AWAITING' | 'OVERDUE';
  answer: string | null;
  answerLabel: string | null;
  userName: string | null;
  minutesToRespond: number | null;
  etaMinutes: number | null;
  distanceKm: number | null;
  coming: boolean;
  core: boolean;
}

interface Board {
  elapsedMinutes: number;
  rows: Row[];
  responded: number;
  awaiting: number;
  overdue: number;
  coming: number;
  blocking: string[];
  canProceed: boolean;
  slowestMinutes: number | null;
  closed: boolean;
}

interface EmergencyCase {
  id: string;
  patientName: string;
  folderNumber: string;
  procedureName: string;
  diagnosis: string;
  unit: string;
  theatre: string | null;
  surgeonName: string;
  priority: string;
  classification: string | null;
  status: string;
  requestedAt: string;
  requiredByTime: string | null;
  board: Board;
  summary: string;
}

const STATE_STYLE: Record<Row['state'], string> = {
  RESPONDED: 'bg-white border-gray-200',
  AWAITING: 'bg-amber-50 border-amber-200',
  OVERDUE: 'bg-red-50 border-red-300',
};

function elapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export default function EmergencyResponsePage() {
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [totals, setTotals] = useState({ emergencies: 0, blocked: 0, awaitingAnyone: 0 });
  const [overdueMinutes, setOverdueMinutes] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/theatre-ops/emergency-response?hours=24${showSettled ? '&all=1' : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setCases(data.cases || []);
      setTotals(data.totals || { emergencies: 0, blocked: 0, awaitingAnyone: 0 });
      setOverdueMinutes(data.overdueMinutes ?? 20);
    } catch (e: any) {
      setError(e.message || 'Failed to load the board');
    } finally {
      setLoading(false);
    }
  }, [showSettled]);

  useEffect(() => {
    load();
    // A clock that does not move is worse than no clock. Sixty seconds is
    // often enough to be current and rare enough not to hammer the database
    // from a screen left open on a wall.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Ambulance className="w-6 h-6 text-red-600" />
            Emergency Response
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Who has not answered yet, and how long we have been waiting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showSettled}
              onChange={(e) => setShowSettled(e.target.checked)}
            />
            Include closed
          </label>
          <button onClick={load} className="p-2 rounded-lg border hover:bg-gray-50" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border bg-white p-3">
          <div className="text-2xl font-bold text-gray-900">{totals.emergencies}</div>
          <div className="text-xs text-gray-500">In the last 24 hours</div>
        </div>
        <div className={`rounded-xl border p-3 ${totals.blocked ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <div className={`text-2xl font-bold ${totals.blocked ? 'text-red-700' : 'text-gray-900'}`}>
            {totals.blocked}
          </div>
          <div className="text-xs text-gray-500">Cannot start yet</div>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <div className="text-2xl font-bold text-gray-900">{totals.awaitingAnyone}</div>
          <div className="text-xs text-gray-500">Still awaiting someone</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && cases.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : cases.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed text-center text-sm text-gray-500">
          No emergency bookings in the last 24 hours.
        </div>
      ) : (
        <div className="space-y-5">
          {cases.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border-2 bg-white p-4 ${
                c.board.closed || c.board.canProceed ? 'border-gray-200' : 'border-red-300'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold text-gray-900">{c.procedureName}</div>
                  <div className="text-sm text-gray-600">
                    {c.patientName} ({c.folderNumber}) · {c.unit}
                    {c.theatre ? ` · ${c.theatre}` : ' · theatre not assigned'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.diagnosis}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    booked {elapsed(c.board.elapsedMinutes)} ago
                  </div>
                  <div
                    className={`mt-1 text-xs px-2 py-1 rounded-full border inline-block ${
                      c.board.closed
                        ? 'bg-gray-50 text-gray-600 border-gray-200'
                        : c.board.canProceed
                        ? 'bg-green-50 text-green-800 border-green-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                  >
                    {c.board.closed || c.board.canProceed ? (
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                    ) : (
                      <PhoneCall className="w-3 h-3 inline mr-1" />
                    )}
                    {c.summary}
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {c.board.rows.map((r) => (
                  <div
                    key={r.role}
                    className={`rounded-lg border px-2.5 py-2 text-xs ${
                      c.board.closed ? 'bg-white border-gray-200' : STATE_STYLE[r.state]
                    } ${r.core ? 'ring-1 ring-gray-300' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800">{r.label}</span>
                      {r.core && <span className="text-[10px] text-gray-400 uppercase">core</span>}
                    </div>

                    {r.state === 'RESPONDED' ? (
                      <>
                        <div className={`mt-0.5 ${r.coming ? 'text-green-700' : 'text-gray-600'}`}>
                          {r.answerLabel}
                        </div>
                        <div className="text-gray-500">
                          {r.userName || 'Unnamed'}
                          {r.minutesToRespond !== null ? ` · answered in ${r.minutesToRespond} min` : ''}
                        </div>
                        {(r.etaMinutes || r.distanceKm) && (
                          <div className="text-gray-500">
                            {r.etaMinutes ? `${r.etaMinutes} min away` : ''}
                            {r.etaMinutes && r.distanceKm ? ' · ' : ''}
                            {r.distanceKm ? `${r.distanceKm} km` : ''}
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className={`mt-0.5 font-medium ${
                          c.board.closed
                            ? 'text-gray-500'
                            : r.state === 'OVERDUE'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {c.board.closed
                          ? 'Never acknowledged'
                          : r.state === 'OVERDUE'
                          ? `No answer after ${overdueMinutes} min — ring them`
                          : 'Awaiting an answer'}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {c.board.slowestMinutes !== null && (
                <p className="mt-3 text-xs text-gray-400">
                  Slowest answer so far: {c.board.slowestMinutes} min · {c.board.responded} of{' '}
                  {c.board.rows.length} departments have replied
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 text-xs text-gray-400">
        <Link href="/dashboard/theatre-ops" className="hover:underline">
          ← Theatre operations board
        </Link>
      </div>
    </div>
  );
}
