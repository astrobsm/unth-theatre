'use client';

// ============================================================
// "Who actually operated?" — asked once, after the case is closed
// ------------------------------------------------------------
// The surgery row names the surgeon who was BOOKED. On most lists here that is
// the consultant who put the case up, and the person who held the knife was a
// senior registrar — and the assistants were never confirmed at all, only
// intended. This panel is where that is put right.
//
// IT OPENS PRE-FILLED WITH THE BOOKING and changes nothing until somebody
// presses confirm. Both halves of that matter: most of the time the booking is
// right and retyping four names to change one is how a form stops being filled
// in, but an unconfirmed case counts for NOBODY on the board, which is the only
// reason a confirmed figure means anything.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Users, Check, Pencil, AlertCircle, Clock } from 'lucide-react';
import {
  ACTUAL_ROLE_LABEL,
  ROLE_ORDER,
  type ActualTeamRole,
} from '@/lib/surgery/actualTeam';
import { TEAM_GRADES } from '@/lib/surgery/assistants';

interface Member {
  userId?: string | null;
  memberName: string;
  staffCode?: string | null;
  role: ActualTeamRole;
  grade?: string | null;
  notes?: string | null;
  position?: number;
}

interface Confirmed {
  confirmedAt: string;
  confirmedByName: string;
  members: Member[];
  correctionCount: number;
}

const GRADE_LABEL: Record<string, string> = {
  CONSULTANT: 'Consultant',
  SENIOR_REGISTRAR: 'Senior registrar',
  REGISTRAR: 'Registrar',
  HOUSE_OFFICER: 'House officer',
};

export default function ActualTeamPanel({
  surgeryId,
  surgeryStatus,
}: {
  surgeryId: string;
  surgeryStatus?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [mayConfirm, setMayConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [changed, setChanged] = useState<string | null>(null);
  const [draft, setDraft] = useState<Member[]>([]);
  const [booked, setBooked] = useState<Member[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/actual-team`);
      if (!r.ok) return;
      const d = await r.json();
      setConfirmed(d.confirmed ?? null);
      setChanged(d.changedFromBooking ?? null);
      setBooked(d.booked ?? []);
      setMayConfirm(!!d.mayConfirm);
      setDraft((d.confirmed?.members ?? d.booked ?? []).map((m: Member) => ({ ...m })));
    } catch {
      /* the panel is additive; a failure here must not break the page */
    } finally {
      setLoading(false);
    }
  }, [surgeryId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/actual-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: draft }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || 'Could not save the operating team');
        return;
      }
      setConfirmed(d.confirmed ?? null);
      setEditing(false);
      await load();
    } catch {
      setError('A network error stopped this saving. Nothing was recorded.');
    } finally {
      setSaving(false);
    }
  };

  const setRow = (i: number, patch: Partial<Member>) =>
    setDraft((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addRow = (role: ActualTeamRole) =>
    setDraft((rows) => [...rows, { memberName: '', role, userId: null, grade: null }]);

  if (loading) return null;

  // Nothing to confirm on a case that has not happened. Offering it on a
  // scheduled case would invite a team to be "confirmed" in advance, which is
  // the booking again under a name that claims more than it knows.
  if (surgeryStatus && !['COMPLETED', 'IN_PROGRESS'].includes(surgeryStatus)) return null;

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    rows: draft.map((m, i) => ({ m, i })).filter(({ m }) => m.role === role),
  }));

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-600" />
          Who actually operated
        </h2>
        {mayConfirm && !editing && (
          <button
            type="button"
            onClick={() => { setEditing(true); setError(''); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <Pencil className="w-4 h-4" />
            {confirmed ? 'Correct this' : 'Confirm the team'}
          </button>
        )}
      </div>

      {!confirmed && !editing && (
        <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Not yet confirmed — this case counts for nobody.</p>
          <p className="mt-1">
            The record still names the team that was <strong>booked</strong>. Until somebody
            confirms who was actually in the room, this case appears on no one&rsquo;s operating
            record.
          </p>
        </div>
      )}

      {confirmed && !editing && (
        <>
          <ul className="mt-3 divide-y divide-gray-100">
            {confirmed.members.map((m, i) => (
              <li key={`${m.memberName}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
                <div>
                  <span className="font-medium text-gray-900">{m.memberName}</span>
                  {m.grade && (
                    <span className="ml-2 text-sm text-gray-500">{GRADE_LABEL[m.grade] ?? m.grade}</span>
                  )}
                  {m.notes && <p className="text-sm text-gray-500">{m.notes}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {ACTUAL_ROLE_LABEL[m.role] ?? m.role}
                </span>
              </li>
            ))}
          </ul>

          {changed && (
            <p className="mt-2 rounded-lg bg-sky-50 border border-sky-200 p-2 text-sm text-sky-900">
              Different from the booking: {changed}.
            </p>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Check className="w-3.5 h-3.5" />
            Confirmed by {confirmed.confirmedByName} on{' '}
            {new Date(confirmed.confirmedAt).toLocaleString()}
            {confirmed.correctionCount > 0 && (
              <>
                {' · '}
                <Clock className="w-3.5 h-3.5" />
                corrected {confirmed.correctionCount} time
                {confirmed.correctionCount === 1 ? '' : 's'}
              </>
            )}
          </p>
        </>
      )}

      {editing && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-600">
            Pre-filled from the booking. Change only what was different &mdash; the booking
            itself is never overwritten, so the record keeps both whose list this was and who
            did it.
          </p>

          {grouped.map(({ role, rows }) => (
            <div key={role}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{ACTUAL_ROLE_LABEL[role]}</h3>
                <button
                  type="button"
                  onClick={() => addRow(role)}
                  className="text-xs text-primary-600 hover:underline"
                >
                  + Add
                </button>
              </div>
              {rows.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  {role === 'ANAESTHETIST'
                    ? 'None — a case done under local anaesthetic has no anaesthetist.'
                    : 'None recorded.'}
                </p>
              )}
              {rows.map(({ m, i }) => (
                <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={m.memberName}
                    onChange={(e) => setRow(i, { memberName: e.target.value })}
                    placeholder="Name"
                    aria-label={`${ACTUAL_ROLE_LABEL[role]} name`}
                    className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                  />
                  <select
                    value={m.grade ?? ''}
                    onChange={(e) => setRow(i, { grade: e.target.value || null })}
                    aria-label={`${ACTUAL_ROLE_LABEL[role]} grade`}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Grade…</option>
                    {TEAM_GRADES.map((g) => (
                      <option key={g} value={g}>{GRADE_LABEL[g] ?? g}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={m.notes ?? ''}
                    onChange={(e) => setRow(i, { notes: e.target.value })}
                    placeholder="Note (e.g. took over at closure)"
                    aria-label={`${ACTUAL_ROLE_LABEL[role]} note`}
                    className="min-w-[10rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setDraft((rows2) => rows2.filter((_, j) => j !== i))}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ))}

          {error && (
            <p className="flex items-start gap-1.5 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 w-4 h-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300"
            >
              {saving ? 'Saving…' : 'Confirm the team'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError('');
                setDraft((confirmed?.members ?? booked).map((m) => ({ ...m })));
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
