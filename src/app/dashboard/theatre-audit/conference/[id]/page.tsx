'use client';

// ============================================================
// One conference: the working document
// ------------------------------------------------------------
// The sitting, who was in the room, every point with its decision beside it,
// and the analysis underneath.
//
// It is one page on purpose. A committee minuting live does not want to
// navigate — it wants to work down the agenda, record what was resolved, and
// see immediately what that did to the rest of the sitting.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, ChevronLeft, Loader2, Lock, MapPin, Plus, UserPlus, Users, X,
} from 'lucide-react';
import PointRow, { type Point, type PointDecision } from '@/components/conference/PointRow';
import AnalysisPanel, { type Analysis } from '@/components/conference/AnalysisPanel';

interface Attendee {
  id: string;
  name: string;
  roleAtSitting: string | null;
  present: boolean;
  apologies: boolean;
}

interface Conference {
  id: string;
  title: string;
  sittingDate: string;
  venue: string | null;
  purpose: string | null;
  chairName: string;
  secretaryName: string | null;
  status: string;
  adoptedAt: string | null;
  adoptedByName: string | null;
  attendees: Attendee[];
  issues: Point[];
}

export default function ConferencePage({ params }: { params: { id: string } }) {
  const [conference, setConference] = useState<Conference | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [resolution, setResolution] = useState('');
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);

  const [newPoint, setNewPoint] = useState('');
  const [addingPoint, setAddingPoint] = useState(false);
  const [newAttendee, setNewAttendee] = useState({ name: '', roleAtSitting: '' });
  const [showAttendance, setShowAttendance] = useState(false);

  const base = `/api/theatre-audit/conference/${params.id}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'This conference could not be loaded.');
        return;
      }
      const data = await res.json();
      setConference(data.conference);
      setAnalysis(data.analysis);
      setResolution(data.resolution ?? '');
      setEditable(!!data.editable);
      setError(null);
    } catch {
      setError('This conference could not be loaded — check the connection.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  /** Every write reloads the whole document, because every write can change
   *  the analysis — a decision recorded on point 9 can contradict point 2. */
  const after = async (ok: boolean) => { if (ok) await load(); return ok; };

  const savePoint = async (issueId: string, patch: Partial<Point>) => {
    const res = await fetch(`${base}/issues`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId, ...patch }),
    });
    return after(res.ok);
  };

  const saveDecision = async (issueId: string, d: PointDecision) => {
    const res = await fetch(`${base}/decision`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId, ...d }),
    });
    return after(res.ok);
  };

  const withdrawDecision = async (issueId: string) => {
    if (!window.confirm('Withdraw the decision recorded on this point? The point stays on the agenda.')) return;
    await fetch(`${base}/decision?issueId=${encodeURIComponent(issueId)}`, { method: 'DELETE' });
    await load();
  };

  const removePoint = async (issueId: string) => {
    if (!window.confirm('Take this point off the agenda?')) return;
    const res = await fetch(`${base}/issues?issueId=${encodeURIComponent(issueId)}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'That point could not be removed.');
      return;
    }
    await load();
  };

  const movePoint = async (issueId: string, move: 'up' | 'down') => {
    await fetch(`${base}/issues`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId, move }),
    });
    await load();
  };

  const addPoint = async () => {
    if (!newPoint.trim()) return;
    setAddingPoint(true);
    const res = await fetch(`${base}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newPoint.trim() }),
    });
    if (res.ok) { setNewPoint(''); await load(); }
    setAddingPoint(false);
  };

  const addAttendee = async () => {
    if (!newAttendee.name.trim()) return;
    const res = await fetch(`${base}/attendees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAttendee),
    });
    if (res.ok) { setNewAttendee({ name: '', roleAtSitting: '' }); await load(); }
  };

  const removeAttendee = async (attendeeId: string) => {
    await fetch(`${base}/attendees?attendeeId=${encodeURIComponent(attendeeId)}`, { method: 'DELETE' });
    await load();
  };

  const adopt = async () => {
    if (!window.confirm(
      'Adopt this resolution?\n\nThe points and decisions will be sealed and can no longer be edited. '
      + 'Revisiting any of them means convening a further sitting.',
    )) return;
    setAdopting(true);
    const res = await fetch(`${base}/adopt`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'The resolution could not be adopted.');
    }
    setAdopting(false);
    await load();
  };

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!conference) {
    return (
      <div className="space-y-3">
        <Link href="/dashboard/theatre-audit/conference" className="inline-flex items-center gap-1 text-sm text-gray-600">
          <ChevronLeft className="h-4 w-4" /> All conferences
        </Link>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error ?? 'Not found.'}</p>
      </div>
    );
  }

  const adopted = conference.status === 'ADOPTED';
  const siblings = conference.issues.map((i) => ({ id: i.id, ordinal: i.ordinal, title: i.title }));

  /** Findings that named a given point, so trouble shows next to its cause. */
  const flagsFor = (ordinal: number) =>
    (analysis?.findings ?? [])
      .filter((f) => f.ordinals.includes(ordinal))
      .map((f) => ({ level: f.level, message: f.message }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/theatre-audit/conference" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" /> All conferences
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{conference.title}</h1>
            <p className="text-gray-600">
              <CalendarDays className="mr-1 inline h-4 w-4" />
              {new Date(conference.sittingDate).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
              {conference.venue && <> · <MapPin className="inline h-4 w-4" /> {conference.venue}</>}
            </p>
            <p className="text-sm text-gray-600">
              Chaired by {conference.chairName}
              {conference.secretaryName ? ` · recorded by ${conference.secretaryName}` : ''}
            </p>
          </div>
          {adopted && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-900">
              <Lock className="h-4 w-4" /> Adopted and sealed
            </span>
          )}
        </div>
        {conference.purpose && (
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{conference.purpose}</p>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {/* ── Attendance ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <button
          type="button"
          onClick={() => setShowAttendance((s) => !s)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 font-bold text-gray-900">
            <Users className="h-4 w-4 text-gray-500" />
            Present ({conference.attendees.filter((a) => a.present).length})
            {conference.attendees.some((a) => a.apologies) && (
              <span className="text-sm font-normal text-gray-500">
                · {conference.attendees.filter((a) => a.apologies).length} apologies
              </span>
            )}
          </span>
          <span className="text-sm text-blue-600">{showAttendance ? 'Hide' : 'Show'}</span>
        </button>

        {showAttendance && (
          <div className="mt-3 space-y-2">
            {conference.attendees.length === 0 && (
              <p className="text-sm text-gray-500">Nobody recorded yet.</p>
            )}
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {conference.attendees.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                  <span>
                    <span className="font-medium text-gray-900">{a.name}</span>
                    {a.roleAtSitting && <span className="text-gray-500"> · {a.roleAtSitting}</span>}
                    {a.apologies && <span className="text-amber-700"> · apologies</span>}
                  </span>
                  {editable && (
                    <button type="button" onClick={() => void removeAttendee(a.id)} className="rounded p-1 hover:bg-gray-200">
                      <X className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {editable && (
              <div className="flex flex-wrap gap-2">
                <input
                  value={newAttendee.name}
                  onChange={(e) => setNewAttendee({ ...newAttendee, name: e.target.value })}
                  placeholder="Name"
                  className="min-w-[10rem] flex-1 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  value={newAttendee.roleAtSitting}
                  onChange={(e) => setNewAttendee({ ...newAttendee, roleAtSitting: e.target.value })}
                  placeholder="Post, e.g. Head of Anaesthesia"
                  className="min-w-[10rem] flex-1 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void addAttendee()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white"
                >
                  <UserPlus className="h-4 w-4" /> Add
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── The agenda, point beside decision ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-gray-900">Points and decisions</h2>
          <p className="text-sm text-gray-600">
            The point as raised on the left, what the conference resolved on the right.
          </p>
        </div>

        {conference.issues.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
            Nothing on the agenda yet.
          </p>
        ) : (
          conference.issues.map((p) => (
            <PointRow
              key={p.id}
              point={p}
              siblings={siblings.filter((s) => s.id !== p.id)}
              editable={editable}
              flags={flagsFor(p.ordinal)}
              onSavePoint={(patch) => savePoint(p.id, patch)}
              onSaveDecision={(d) => saveDecision(p.id, d)}
              onWithdrawDecision={() => withdrawDecision(p.id)}
              onRemovePoint={() => removePoint(p.id)}
              onMove={(dir) => movePoint(p.id, dir)}
            />
          ))
        )}

        {editable && (
          <div className="flex flex-wrap gap-2 rounded-xl border-2 border-dashed border-gray-300 p-3">
            <input
              value={newPoint}
              onChange={(e) => setNewPoint(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addPoint(); }}
              placeholder="Add a point to the agenda"
              className="min-w-[14rem] flex-1 rounded-lg border-2 border-gray-300 px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void addPoint()}
              disabled={!newPoint.trim() || addingPoint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {addingPoint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add point
            </button>
          </div>
        )}
      </section>

      {/* ── The analysis ── */}
      {analysis && (
        <AnalysisPanel
          analysis={analysis}
          resolution={resolution}
          adopted={adopted}
          adoptedByName={conference.adoptedByName}
          adoptedAt={conference.adoptedAt}
          canAdopt={editable}
          onAdopt={adopt}
          adopting={adopting}
        />
      )}
    </div>
  );
}
