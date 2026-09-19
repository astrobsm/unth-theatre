'use client';

// ============================================================
// "Are you coming?" — asked once, answered once, seen by everybody
// ------------------------------------------------------------
// Shown on the dashboard on the days a person has a case, and on no other day.
// It renders NOTHING when there is nothing on the list, because a permanent
// empty panel saying "you have no cases" is a thing people learn to scroll
// past, and then they scroll past it on the morning it is not empty.
//
// One tap for the answer. Then the whole team, and what each of them has said,
// so the question "is the anaesthetist coming?" stops being a telephone call
// made by whoever is already standing in the theatre.
//
// NOBODY IS MARKED ABSENT HERE. No answer means no answer: people are
// operating, teaching, post-call, or have no signal. The board says "not yet
// said" and lets the reader draw their own conclusion, which is the only
// honest thing it can do.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock, Check, Clock, Loader2, Users, X, ChevronRight,
} from 'lucide-react';
import {
  statusLine, summaryLine, type AvailabilityStatus, type TeamAvailabilitySummary,
  type TeamMemberAvailability,
} from '@/lib/theatre/availability';

interface CaseRow {
  id: string;
  procedureName: string;
  scheduledTime: string;
  status: string;
  surgeryType: string;
  theatreName: string | null;
  patientName: string | null;
  folderNumber: string | null;
  team: TeamMemberAvailability[];
  myRole: string | null;
  myStatus: AvailabilityStatus | null;
  summary: TeamAvailabilitySummary;
}

const CHIP: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800 border-green-200',
  DELAYED: 'bg-amber-100 text-amber-900 border-amber-200',
  UNAVAILABLE: 'bg-red-100 text-red-800 border-red-200',
};
const SILENT_CHIP = 'bg-gray-100 text-gray-600 border-gray-200';

export default function TeamAvailabilityCard() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [etaFor, setEtaFor] = useState<string | null>(null);
  const [eta, setEta] = useState('20');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/case-availability');
      if (!res.ok) return;
      const data = await res.json();
      setCases(Array.isArray(data.cases) ? data.cases : []);
    } catch {
      /* silence: this panel is an aid, not the dashboard */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const answer = async (surgeryId: string, status: AvailabilityStatus, etaMinutes?: number) => {
    setSaving(surgeryId);
    setError(null);
    try {
      const res = await fetch('/api/case-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId, status, etaMinutes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'That could not be saved. Try again.');
        return;
      }
      const data = await res.json();
      // Patched in place rather than refetching the whole day: the person is
      // looking at this card and a full reload makes it jump.
      setCases((prev) => prev.map((c) => (
        c.id === surgeryId
          ? { ...c, team: data.team ?? c.team, summary: data.summary ?? c.summary, myStatus: status }
          : c
      )));
      setEtaFor(null);
    } catch {
      setError('That could not be saved — you may be offline. It will be kept and sent when you are back.');
    } finally {
      setSaving(null);
    }
  };

  // Nothing on the list, nothing on the dashboard.
  if (!loaded || cases.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-600 p-2.5">
          <CalendarClock className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">
            You are on {cases.length === 1 ? 'a case' : `${cases.length} cases`} today
          </h2>
          <p className="text-sm text-gray-600">
            Say whether you are available. Everyone else on the case sees your answer,
            so nobody has to ring round.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <div className="mt-4 space-y-4">
        {cases.map((c) => (
          <div key={c.id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">
                  {c.scheduledTime} — {c.procedureName}
                  {c.surgeryType === 'EMERGENCY' && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                      EMERGENCY
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  {c.patientName ?? 'Patient'}
                  {c.folderNumber ? ` (${c.folderNumber})` : ''}
                  {c.theatreName ? ` · ${c.theatreName}` : ' · theatre not allocated yet'}
                  {c.myRole ? ` · you are ${c.myRole.toLowerCase()}` : ''}
                </p>
              </div>
              <Link
                href={`/dashboard/surgeries/${c.id}`}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Open case <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* The answer. Three buttons, because three is the whole truth of
                it: coming, coming late, not coming. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void answer(c.id, 'AVAILABLE')}
                disabled={saving === c.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                  c.myStatus === 'AVAILABLE'
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-300 bg-white text-gray-800 hover:border-green-400'
                }`}
              >
                {saving === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                I am available
              </button>

              <button
                type="button"
                onClick={() => setEtaFor(etaFor === c.id ? null : c.id)}
                disabled={saving === c.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                  c.myStatus === 'DELAYED'
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-gray-300 bg-white text-gray-800 hover:border-amber-400'
                }`}
              >
                <Clock className="h-4 w-4" />
                On the way, delayed
              </button>

              <button
                type="button"
                onClick={() => void answer(c.id, 'UNAVAILABLE')}
                disabled={saving === c.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                  c.myStatus === 'UNAVAILABLE'
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-gray-300 bg-white text-gray-800 hover:border-red-400'
                }`}
              >
                <X className="h-4 w-4" />
                Not available
              </button>

              {c.myStatus && (
                <span className="text-xs text-gray-500">
                  You can change this at any time.
                </span>
              )}
            </div>

            {/* How late. Asked only when "delayed" is chosen, because a delay
                without a number tells the theatre nothing it can plan around. */}
            {etaFor === c.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                <label htmlFor={`eta-${c.id}`} className="text-sm font-medium text-amber-900">
                  About how many minutes away?
                </label>
                <input
                  id={`eta-${c.id}`}
                  type="number"
                  min={1}
                  max={720}
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                  className="w-24 rounded-lg border-2 border-amber-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void answer(c.id, 'DELAYED', Number(eta) || undefined)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Tell the team
                </button>
              </div>
            )}

            {/* Everybody else. */}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Users className="h-3.5 w-3.5" /> Team — {summaryLine(c.summary)}
              </p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {c.team.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-gray-900">{m.name}</span>
                      <span className="text-gray-500"> · {m.role}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        m.status ? CHIP[m.status] : SILENT_CHIP
                      }`}
                    >
                      {statusLine(m)}
                    </span>
                  </li>
                ))}
                {c.team.length === 0 && (
                  <li className="text-sm text-gray-500">
                    No team assigned to this case yet.
                  </li>
                )}
              </ul>
              {c.summary.silent > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  “Not yet said” is not a refusal — they may be operating, teaching or out of signal.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
