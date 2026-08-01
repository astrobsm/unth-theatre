'use client';

// ============================================================
// Team check-in
// ------------------------------------------------------------
// Two audiences on one screen. A surgeon opens it to answer for their own
// cases; a coordinator opens it to see which theatres are short. The page
// leads with "your cases" because that is the action, and shows the whole
// day below it because that is the picture.
//
// The position is requested from the browser and sent with the answer. It is
// never displayed back and never stored — the server keeps a verdict and a
// coarse distance. The page says so, in words, where the person can read it.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  UserX,
  Users,
} from 'lucide-react';
import { CHECK_IN_META, CHECK_IN_STATUSES, checkInMeta, type CheckInStatus } from '@/lib/theatreOps/checkIn';

interface TeamRow {
  userId: string;
  name: string | null;
  roleOnCase: string;
  status: CheckInStatus | null;
  reason: string | null;
  replacementName: string | null;
  fixVerdict: string | null;
  distanceM: number | null;
  etaMinutes: number | null;
  checkedInAt: string | null;
  isMe: boolean;
}

interface CaseRow {
  id: string;
  procedureName: string;
  scheduledTime: string;
  theatre: string | null;
  unit: string | null;
  patientName: string | null;
  ward: string | null;
  surgeryType: string;
  team: TeamRow[];
  readiness: { assigned: number; silent: number; ready: boolean; gaps: string[] };
  summary: string;
  myRole: string | null;
  myStatus: CheckInStatus | null;
}

const FIX_NOTE: Record<string, string> = {
  ON_SITE: 'on site',
  OFF_SITE: 'off site',
  IMPRECISE: 'position unclear',
  NO_FIX: 'position not confirmed',
};

export default function TeamCheckInPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Per-case draft answers for the statuses that need more than a tap.
  const [draft, setDraft] = useState<Record<string, { reason: string; replacementName: string; eta: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/theatre-ops/check-in?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setCases(data.cases || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load the board');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  /** Ask the browser for a fix, but never let it hold up a check-in. */
  const currentFix = (): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({});
      const done = (v: any) => resolve(v);
      navigator.geolocation.getCurrentPosition(
        (p) =>
          done({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracyM: p.coords.accuracy,
          }),
        // A refused or unavailable fix is not an error. The check-in stands
        // without it; the board simply says the position was not confirmed.
        () => done({}),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
      );
    });

  const submit = async (c: CaseRow, status: CheckInStatus) => {
    const d = draft[c.id] || { reason: '', replacementName: '', eta: '' };
    setSaving(c.id);
    setError(null);
    try {
      const fix = await currentFix();
      const res = await fetch('/api/theatre-ops/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: c.id,
          status,
          reason: d.reason || undefined,
          replacementName: d.replacementName || undefined,
          etaMinutes: d.eta ? Number(d.eta) : undefined,
          deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined,
          ...fix,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to check in');
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to record your check-in');
    } finally {
      setSaving(null);
    }
  };

  const mine = cases.filter((c) => c.myRole);
  const setDraftFor = (id: string, patch: Partial<{ reason: string; replacementName: string; eta: string }>) =>
    setDraft((prev) => ({
      ...prev,
      [id]: { ...{ reason: '', replacementName: '', eta: '' }, ...prev[id], ...patch },
    }));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Team Check-in
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Say whether you are coming, before the theatre finds out by waiting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="p-2 rounded-lg border hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 flex items-start gap-1.5 mb-6">
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Your phone is asked for its position when you check in. It is compared against the
          hospital site and then discarded — the record keeps whether you were on site and roughly
          how far away, never where you are. Checking in works fine without it.
        </span>
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading the day&apos;s list…
        </div>
      ) : (
        <>
          {/* ---- Your cases ------------------------------------------- */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Your cases {mine.length > 0 && <span className="text-gray-400">({mine.length})</span>}
            </h2>

            {mine.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed text-sm text-gray-500 text-center">
                You are not on the team for any case on this date.
              </div>
            ) : (
              <div className="space-y-4">
                {mine.map((c) => {
                  const d = draft[c.id] || { reason: '', replacementName: '', eta: '' };
                  return (
                    <div key={c.id} className="rounded-xl border bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="font-semibold text-gray-900">{c.procedureName}</div>
                          <div className="text-sm text-gray-600">
                            {c.scheduledTime} · {c.theatre || 'Theatre not allocated'} · you are the{' '}
                            <span className="font-medium">{c.myRole}</span>
                          </div>
                        </div>
                        {c.myStatus && (
                          <span className={`text-xs px-2 py-1 rounded-full border ${checkInMeta(c.myStatus).chip}`}>
                            {checkInMeta(c.myStatus).indicator} {checkInMeta(c.myStatus).label}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        {CHECK_IN_STATUSES.map((s) => (
                          <button
                            key={s}
                            disabled={saving === c.id}
                            onClick={() => submit(c, s)}
                            className={`px-3 py-2 rounded-lg text-sm border transition disabled:opacity-50 ${
                              c.myStatus === s
                                ? `${CHECK_IN_META[s].chip} font-semibold`
                                : 'bg-white hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            {CHECK_IN_META[s].indicator} {CHECK_IN_META[s].label}
                          </button>
                        ))}
                        {saving === c.id && (
                          <span className="inline-flex items-center text-sm text-gray-500 gap-1">
                            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                          </span>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-3 gap-2">
                        <input
                          value={d.reason}
                          onChange={(e) => setDraftFor(c.id, { reason: e.target.value })}
                          placeholder="Reason (needed if delayed, unavailable or replaced)"
                          className="border rounded-lg px-3 py-2 text-sm sm:col-span-2"
                        />
                        <input
                          value={d.eta}
                          onChange={(e) => setDraftFor(c.id, { eta: e.target.value })}
                          inputMode="numeric"
                          placeholder="Minutes away"
                          className="border rounded-lg px-3 py-2 text-sm"
                        />
                        <input
                          value={d.replacementName}
                          onChange={(e) => setDraftFor(c.id, { replacementName: e.target.value })}
                          placeholder="Who is covering instead (if replaced)"
                          className="border rounded-lg px-3 py-2 text-sm sm:col-span-3"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- The whole day ---------------------------------------- */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Every case today <span className="text-gray-400">({cases.length})</span>
            </h2>

            {cases.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed text-sm text-gray-500 text-center">
                No cases booked for this date.
              </div>
            ) : (
              <div className="space-y-3">
                {cases.map((c) => (
                  <div key={c.id} className="rounded-xl border bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-medium text-gray-900">
                          {c.scheduledTime} · {c.procedureName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {c.theatre || 'Theatre not allocated'}
                          {c.unit ? ` · ${c.unit}` : ''}
                          {c.ward ? ` · ${c.ward}` : ''}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full border ${
                          c.readiness.ready
                            ? 'bg-green-50 text-green-800 border-green-200'
                            : c.readiness.gaps.length
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {c.readiness.ready ? (
                          <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        ) : c.readiness.gaps.length ? (
                          <UserX className="w-3 h-3 inline mr-1" />
                        ) : (
                          <Clock className="w-3 h-3 inline mr-1" />
                        )}
                        {c.summary}
                      </span>
                    </div>

                    {c.team.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        Nobody with an account is assigned to this case, so there is nobody to check in.
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {c.team.map((t) => {
                          const meta = checkInMeta(t.status);
                          return (
                            <div
                              key={t.userId}
                              className={`text-xs rounded-lg border px-2.5 py-2 ${
                                t.isMe ? 'ring-1 ring-blue-300' : ''
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                                <span className="font-medium text-gray-800 truncate">
                                  {t.name || 'Unnamed'}
                                </span>
                                {t.isMe && <span className="text-blue-600">(you)</span>}
                              </div>
                              <div className="text-gray-500 mt-0.5">{t.roleOnCase}</div>
                              <div className="text-gray-600 mt-0.5">
                                {meta.label}
                                {t.etaMinutes ? ` · ${t.etaMinutes} min away` : ''}
                              </div>
                              {t.reason && <div className="text-gray-500 mt-0.5 italic">{t.reason}</div>}
                              {t.replacementName && (
                                <div className="text-gray-700 mt-0.5">Covered by {t.replacementName}</div>
                              )}
                              {t.status && t.fixVerdict && (
                                <div className="text-gray-400 mt-0.5">
                                  {FIX_NOTE[t.fixVerdict] ?? t.fixVerdict}
                                  {t.distanceM !== null && t.fixVerdict === 'OFF_SITE'
                                    ? ` · about ${(t.distanceM / 1000).toFixed(1)} km out`
                                    : ''}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <div className="mt-8 text-xs text-gray-400">
        <Link href="/dashboard/theatre-ops" className="hover:underline">
          ← Theatre operations board
        </Link>
      </div>
    </div>
  );
}
