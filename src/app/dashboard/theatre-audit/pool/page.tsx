'use client';

// ============================================================
// The week's pool, and convening the sitting
// ------------------------------------------------------------
// The chairman sees the week before filling the room. Convening sends a
// summons to everybody on it, and a summons cannot be unsent — so the
// preview is the feature, not the decoration: the number of people and the
// number of matters are stated before the button, not after it.
//
// Mode is asked for explicitly because a summons has to say where to go or
// what to join, and the form will not let a sitting be convened without the
// one its mode needs.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Gavel, Loader2, Users, XCircle,
} from 'lucide-react';

interface PoolCancellation {
  id: string; reason: string; category: string; cancelledAt: string;
  user: { id: string; fullName: string } | null;
  surgery: {
    id: string; procedureName: string; scheduledDate: string; unit: string | null;
    patient: { name: string; folderNumber: string } | null;
    surgeon: { id: string; fullName: string } | null;
    anesthetist: { id: string; fullName: string } | null;
  } | null;
}

interface PoolLapse {
  id: string; surgeryId: string; surgeryDate: string; lapseGround: string | null;
  expectedReviewerName: string | null; assignmentSource: string | null;
  surgery: {
    procedureName: string;
    patient: { name: string; folderNumber: string } | null;
  } | null;
}

interface Pool {
  week: { start: string; end: string; label: string };
  cancellations: PoolCancellation[];
  lapses: PoolLapse[];
  wouldSummon: { userId: string; name: string; matters: number }[];
  serviceRoles: string[];
  alreadyConvened: { id: string; title: string; sittingDate: string; status: string } | null;
  canConvene: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  PATIENT_CONDITION: 'Patient condition',
  EQUIPMENT_FAILURE: 'Equipment failure',
  STAFF_UNAVAILABILITY: 'Staff unavailable',
  EMERGENCY_PRIORITY: 'Displaced by an emergency',
  PATIENT_REQUEST: 'Patient declined',
  ADMINISTRATIVE: 'Administrative',
  OTHER: 'Other',
};

const GROUND_LABEL: Record<string, string> = {
  'did-not-review': 'Assigned, did not review',
  'reassigned-and-did-not-review': 'Reassigned, did not review',
  'handed-back-too-late': 'Handed back after 7pm',
  'hod-did-not-reassign': 'Handed back in time, nobody named',
  'rota-gap': 'Nobody rostered to review',
  'booked-too-late': 'Booked too late to review',
};

export default function AuditPoolPage() {
  const [pool, setPool] = useState<Pool | null>(null);
  const [week, setWeek] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [sittingDate, setSittingDate] = useState('');
  const [mode, setMode] = useState<'PHYSICAL' | 'VIRTUAL' | 'HYBRID'>('PHYSICAL');
  const [venue, setVenue] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [convening, setConvening] = useState(false);

  const load = useCallback(async (w: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/theatre-audit/pool${w ? `?week=${w}` : ''}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Could not load the pool.'); return; }
      setPool(d);
      setWeek(d.week.start);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(''); }, [load]);

  const convene = async () => {
    setConvening(true);
    setError(null);
    setDone(null);
    try {
      const r = await fetch('/api/theatre-audit/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, sittingDate, mode, venue, meetingLink }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'The sitting could not be convened.'); return; }
      setDone(`Convened. ${d.summonsesRaised} summons${d.summonsesRaised === 1 ? '' : 'es'} raised`
        + `${d.lapsesAttached ? `, ${d.lapsesAttached} review lapse(s) attached` : ''}.`);
      await load(week);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setConvening(false);
    }
  };

  const shiftWeek = (days: number) => {
    if (!pool) return;
    const [y, m, d] = pool.week.start.split('-').map(Number);
    const n = new Date(Date.UTC(y, m - 1, d + days));
    void load(n.toISOString().slice(0, 10));
  };

  const people = pool?.wouldSummon.length ?? 0;
  const matters = (pool?.cancellations.length ?? 0) + (pool?.lapses.length ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Gavel className="h-6 w-6 text-indigo-600" /> The week&rsquo;s audit pool
          </h1>
          <p className="mt-1 text-gray-600">
            Every case that did not hold, and every preoperative review missed, in one week.
          </p>
        </div>
        <Link href="/dashboard/theatre-audit/summonses"
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
          Summonses
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-gray-200">
        <button type="button" onClick={() => shiftWeek(-7)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
          ← Earlier week
        </button>
        <span className="px-2 font-semibold text-gray-900">{pool?.week.label ?? '…'}</span>
        <button type="button" onClick={() => shiftWeek(7)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
          Later week →
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </p>
      )}
      {done && (
        <p className="flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{done}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading&hellip;
        </p>
      ) : !pool ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
              <p className="text-2xl font-bold text-gray-900">{pool.cancellations.length}</p>
              <p className="text-sm text-gray-600">cases did not hold</p>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
              <p className="text-2xl font-bold text-gray-900">{pool.lapses.length}</p>
              <p className="text-sm text-gray-600">reviews missed the 9pm deadline</p>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
              <p className="text-2xl font-bold text-gray-900">{people}</p>
              <p className="text-sm text-gray-600">people would be summoned</p>
            </div>
          </div>

          {/* Convening */}
          {pool.alreadyConvened ? (
            <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200">
              <p className="font-semibold text-blue-900">
                A sitting for this week has already been convened.
              </p>
              <p className="text-sm text-blue-800">
                {pool.alreadyConvened.title} ·{' '}
                {new Date(pool.alreadyConvened.sittingDate).toLocaleString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
              <Link href={`/dashboard/theatre-audit/conference/${pool.alreadyConvened.id}`}
                className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">
                Open the sitting →
              </Link>
            </div>
          ) : pool.canConvene ? (
            <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                <CalendarClock className="h-5 w-5 text-indigo-600" /> Convene the sitting
              </h2>

              {/* Said before the button, not after it. */}
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Users className="mt-0.5 h-4 w-4 shrink-0" />
                This will summon <strong>{people}</strong> people over <strong>{matters}</strong> matters.
                A summons cannot be unsent.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-800">Date and time</span>
                  <input type="datetime-local" value={sittingDate}
                    onChange={(e) => setSittingDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-800">How it is held</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="PHYSICAL">Physical — in a room</option>
                    <option value="VIRTUAL">Virtual — online only</option>
                    <option value="HYBRID">Hybrid — both</option>
                  </select>
                </label>
                {mode !== 'VIRTUAL' && (
                  <label className="block">
                    <span className="block text-sm font-semibold text-gray-800">Venue</span>
                    <input value={venue} onChange={(e) => setVenue(e.target.value)}
                      placeholder="e.g. Theatre Complex Seminar Room"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>
                )}
                {mode !== 'PHYSICAL' && (
                  <label className="block">
                    <span className="block text-sm font-semibold text-gray-800">Joining link</span>
                    <input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>
                )}
              </div>

              <div className="flex justify-end">
                <button type="button" disabled={convening || !sittingDate || matters === 0}
                  onClick={() => void convene()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                  {convening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                  Convene and summon
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Convening the sitting is the chairman&rsquo;s. You can read the pool.
            </p>
          )}

          {/* The cases */}
          <div className="rounded-2xl bg-white ring-1 ring-gray-200">
            <h2 className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 font-semibold text-gray-900">
              <XCircle className="h-5 w-5 text-red-600" /> Cases that did not hold
            </h2>
            {pool.cancellations.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">None this week.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pool.cancellations.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                      </span>
                      <span className="font-medium text-gray-900">
                        {c.surgery?.patient?.name ?? 'Patient'}{' '}
                        <span className="font-normal text-gray-500">
                          ({c.surgery?.patient?.folderNumber ?? '—'})
                        </span>
                      </span>
                      <span className="text-sm text-gray-600">{c.surgery?.procedureName}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-700">{c.reason}</p>
                    <p className="text-xs text-gray-500">
                      {c.surgery?.surgeon?.fullName ?? 'No surgeon named'}
                      {c.surgery?.anesthetist ? ` · ${c.surgery.anesthetist.fullName}` : ''}
                      {c.user ? ` · recorded by ${c.user.fullName}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-gray-200">
            <h2 className="border-b border-gray-100 px-5 py-3 font-semibold text-gray-900">
              Preoperative reviews missed
            </h2>
            {pool.lapses.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">None this week.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pool.lapses.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {GROUND_LABEL[l.lapseGround ?? ''] ?? l.lapseGround ?? 'Not reviewed'}
                      </span>
                      <span className="font-medium text-gray-900">
                        {l.surgery?.patient?.name ?? 'Patient'}
                      </span>
                      <span className="text-sm text-gray-600">{l.surgery?.procedureName}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Listed {new Date(l.surgeryDate).toLocaleDateString('en-GB')}
                      {l.expectedReviewerName ? ` · expected: ${l.expectedReviewerName}` : ''}
                      {l.assignmentSource ? ` (${l.assignmentSource})` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {people > 0 && (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
              <h2 className="font-semibold text-gray-900">Who would be summoned</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {pool.wouldSummon.map((p) => (
                  <li key={p.userId}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800">
                    {p.name}
                    {p.matters > 1 && (
                      <span className="ml-1 font-semibold text-gray-600">×{p.matters}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
