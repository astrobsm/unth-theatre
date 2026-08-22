'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, MapPin } from 'lucide-react';
import {
  CHECK_IN_STATUSES,
  CHECK_IN_META,
  requiresReason,
  requiresReplacement,
  type CheckInStatus,
} from '@/lib/theatreOps/checkIn';

/**
 * "Am I coming?", on every dashboard.
 *
 * The check-in board already existed at /dashboard/theatre-ops/check-in, and
 * the people whose answer the theatre needs were the least likely to go
 * looking for it. A surgeon signs in, sees their list, and leaves. So the
 * question follows them instead: this sits at the top of whichever dashboard
 * page their role lands on.
 *
 * Shows ONLY the cases the signed-in person is actually on the team for, and
 * renders nothing at all otherwise — a permanent empty panel on 200 dashboards
 * is how people learn to scroll past a thing.
 *
 * Position is requested at check-in, compared against the hospital site, and
 * discarded; what is stored is a verdict and a coarse distance. Checking in
 * works perfectly well if the browser refuses.
 */

interface MyCase {
  id: string;
  procedureName: string | null;
  scheduledTime: string | null;
  theatre: string | null;
  unit: string | null;
  patientName: string | null;
  myRole: string | null;
  myStatus: CheckInStatus | null;
  readiness: { assigned: number; responded: number; ready: boolean; gaps: string[] };
  summary: string;
}

export default function TeamCheckInCard() {
  const [cases, setCases] = useState<MyCase[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<CheckInStatus | null>(null);
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/theatre-ops/check-in', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      setCases(Array.isArray(d.mine) ? d.mine : []);
    } catch {
      // A dashboard panel that cannot load is not worth an error to somebody
      // about to start a list.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * Ask the browser for a position, but never wait long and never fail on it.
   * A check-in without a fix is a check-in; a check-in that never happened
   * because the phone was in a corridor with no signal is not.
   */
  const fix = (): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> =>
    new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({});
      const done = (v: { latitude?: number; longitude?: number; accuracyM?: number }) => resolve(v);
      const timer = setTimeout(() => done({}), 6000);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          done({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracyM: p.coords.accuracy,
          });
        },
        () => { clearTimeout(timer); done({}); },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
      );
    });

  const submit = async (surgeryId: string, status: CheckInStatus) => {
    if (requiresReason(status) && reason.trim().length < 3) {
      setNote((n) => ({ ...n, [surgeryId]: 'Say briefly why — one line is enough.' }));
      return;
    }
    if (requiresReplacement(status) && !replacement.trim()) {
      setNote((n) => ({ ...n, [surgeryId]: 'Name who is covering the case instead.' }));
      return;
    }

    setBusy(surgeryId);
    setNote((n) => ({ ...n, [surgeryId]: '' }));
    try {
      const position = await fix();
      const res = await fetch('/api/theatre-ops/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId,
          status,
          reason: reason.trim() || undefined,
          replacementName: replacement.trim() || undefined,
          deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          ...position,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote((n) => ({ ...n, [surgeryId]: d.error ?? 'Could not record that. Please try again.' }));
        return;
      }
      // Tell them what the geofence made of it. Their check-in is recorded
      // either way — a phone that cannot see satellites through a theatre
      // ceiling is not a reason to refuse somebody's word that they are here.
      const verdict = d?.fix?.verdict as string | undefined;
      setNote((n) => ({
        ...n,
        [surgeryId]:
          verdict === 'ON_SITE'
            ? 'Recorded — your phone confirms you are in the hospital.'
            : verdict === 'OFF_SITE'
              ? 'Recorded. Your phone places you away from the hospital, which the board will show.'
              : verdict === 'IMPRECISE'
                ? 'Recorded. Your phone could not place you precisely — that is common indoors and does not affect your check-in.'
                : 'Recorded.',
      }));
      setOpen(null);
      setPicked(null);
      setReason('');
      setReplacement('');
      await load();
    } catch {
      setNote((n) => ({ ...n, [surgeryId]: 'Could not record that. Please try again.' }));
    } finally {
      setBusy(null);
    }
  };

  if (cases.length === 0) return null;

  const unanswered = cases.filter((c) => !c.myStatus).length;

  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
          <Users className="h-4 w-4" />
          Your cases today ({cases.length})
        </h2>
        <Link
          href="/dashboard/theatre-ops/check-in"
          className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-900"
        >
          Full check-in board
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-emerald-800">
        {unanswered > 0
          ? 'Say whether you are coming, before the theatre finds out by waiting.'
          : 'You have answered for every case today. Change an answer if anything shifts.'}
      </p>

      <div className="mt-3 space-y-3">
        {cases.map((c) => {
          const meta = c.myStatus ? CHECK_IN_META[c.myStatus] : null;
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rounded-lg border border-emerald-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {c.scheduledTime ? `${c.scheduledTime} · ` : ''}{c.procedureName ?? 'Procedure not stated'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {c.myRole ?? 'On the team'}
                    {c.theatre ? ` · ${c.theatre}` : ' · Theatre not allocated'}
                    {c.unit ? ` · ${c.unit}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    meta ? meta.chip : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  {meta ? meta.label : 'Not answered'}
                </span>
              </div>

              {/* How the rest of the team stands. A surgeon deciding whether to
                  set off is helped more by "2 of 5 yet to respond" than by
                  their own status echoed back at them. */}
              <p className="mt-1.5 text-[11px] text-gray-500">{c.summary}</p>

              {!isOpen ? (
                <button
                  type="button"
                  onClick={() => { setOpen(c.id); setPicked(null); setReason(''); setReplacement(''); }}
                  className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {c.myStatus ? 'Change my answer' : 'Check in'}
                </button>
              ) : (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {CHECK_IN_STATUSES.map((s) => {
                      const m = CHECK_IN_META[s];
                      const active = picked === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={busy === c.id}
                          onClick={() => {
                            setPicked(s);
                            // Statuses that need nothing further are recorded on
                            // the tap. Making somebody press "confirm" to say
                            // "I am here" is how a one-tap answer becomes a
                            // three-tap one nobody bothers with.
                            if (!requiresReason(s) && !requiresReplacement(s)) {
                              void submit(c.id, s);
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                            active ? m.chip : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <span aria-hidden>{m.indicator}</span> {m.label}
                        </button>
                      );
                    })}
                  </div>

                  {picked && requiresReplacement(picked) && (
                    <input
                      type="text"
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                      placeholder="Who is covering the case?"
                      className="mt-2 w-full rounded-lg border border-gray-300 p-2 text-sm"
                    />
                  )}

                  {picked && requiresReason(picked) && (
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder={
                        picked === 'DELAYED'
                          ? 'What is delaying you? e.g. "Finishing an emergency in Theatre 2, about 40 minutes."'
                          : 'Say briefly why.'
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 p-2 text-sm"
                    />
                  )}

                  {picked && (requiresReason(picked) || requiresReplacement(picked)) && (
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => void submit(c.id, picked)}
                      className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {busy === c.id ? 'Recording…' : 'Record my answer'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { setOpen(null); setPicked(null); }}
                    className="mt-2 ml-2 text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Cancel
                  </button>

                  <p className="mt-2 flex items-start gap-1 text-[11px] text-gray-400">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    Your phone is asked for its position and it is compared against the hospital
                    site, then discarded. Checking in works fine without it.
                  </p>
                </div>
              )}

              {note[c.id] && (
                <p className={`mt-2 text-xs ${
                  note[c.id].startsWith('Recorded') ? 'text-green-700' : 'text-red-600'
                }`}>
                  {note[c.id]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
