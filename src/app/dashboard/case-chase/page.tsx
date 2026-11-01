'use client';

/**
 * Booked cases still missing something, and who to ask about them.
 *
 * TWO LISTS OF THE SAME CASES. The surgeons, who can close the gap, and the
 * unit consultants, who can change why it keeps happening. A screen with only
 * the first produces the same list next week; one with only the second asks a
 * consultant to do clerical work.
 *
 * FORWARD-LOOKING BY DEFAULT — today through the next seven days. A gap found
 * on Friday's case can still be closed; one found on yesterday's cannot, and a
 * board that opens on last week teaches people it is a report rather than
 * something to act on.
 *
 * THE PREVIEW MATTERS HERE MORE THAN ANYWHERE. These letters name patients and
 * folder numbers, and they go out over WhatsApp. Whoever presses send should
 * have read exactly what the surgeon will read.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarClock, Check, ClipboardList, Eye, FileWarning,
  Loader2, Send, UserCog, Users,
} from 'lucide-react';

interface Row {
  personId: string;
  personName: string;
  roleLabel: string;
  hasPhone: boolean;
  active: boolean;
  units: string[];
  caseCount: number;
  counts: { LATE_BOOKING: number; CONSENT: number; PRESCRIPTION: number; CONSUMABLES: number };
  fixable: number;
  lateCount: number;
  headline: string;
  sentAt: string | null;
  cases: {
    id: string;
    when: string;
    patient: string;
    procedureName: string;
    gaps: string[];
    bookedByName: string | null;
  }[];
}

interface Board {
  from: string;
  to: string;
  today: string;
  periodLabel: string;
  totals: Record<string, number>;
  gapLabels: { code: string; label: string }[];
  surgeons: Row[];
  consultants: Row[];
  unattributed: {
    noSurgeon: number;
    noConsultant: number;
    cases: { id: string; when: string; patient: string; procedureName: string; unit: string | null; missing: string }[];
  };
}

export default function CaseChasePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<'surgeon' | 'consultant'>('surgeon');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string>('');
  const [preview, setPreview] = useState<{ text: string; headline: string } | null>(null);

  const load = useCallback(async (a?: string, b?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = a && b ? `?from=${a}&to=${b}` : '';
      const res = await fetch(`/api/case-chase${qs}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not read the board.');
        return;
      }
      setBoard(d);
      setFrom(d.from);
      setTo(d.to);
    } catch {
      setError('Could not read the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (row: Row, kind: 'surgeon' | 'consultant', asPreview: boolean) => {
    setBusy(`${kind}-${row.personId}-${asPreview ? 'p' : 's'}`);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/case-chase/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, personId: row.personId, from, to, preview: asPreview }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not do that.');
        return;
      }
      if (asPreview) {
        setPreview({ text: d.text, headline: d.headline });
        return;
      }
      setResult(d.message ?? (d.alreadySent ? 'Already sent.' : 'Sent.'));
      await load(from, to);
    } catch {
      setError('Could not do that.');
    } finally {
      setBusy('');
    }
  };

  const rows = board ? (tab === 'surgeon' ? board.surgeons : board.consultants) : [];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-primary-50 p-2.5 text-primary-700">
          <ClipboardList className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cases awaiting paperwork</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Booked cases with no consent on the ORM, no pharmacy prescription, no consumable
            pack request, or booked after the 15:00 cut-off. Computed live from the case
            records, not from the flag stored at booking.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-gray-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load(from, to)}
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white"
        >
          Show
        </button>
        {board && (
          <span className="ml-auto text-xs text-gray-500">{board.periodLabel}</span>
        )}
      </div>

      {board && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Cases with gaps" value={board.totals.cases ?? 0} />
          <Stat label="No consent" value={board.totals.CONSENT ?? 0} />
          <Stat label="No pharmacy list" value={board.totals.PRESCRIPTION ?? 0} />
          <Stat label="No pack request" value={board.totals.CONSUMABLES ?? 0} />
          <Stat label="Booked late" value={board.totals.LATE_BOOKING ?? 0} />
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <Check className="h-4 w-4" /> {result}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('surgeon')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${
            tab === 'surgeon' ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-700'
          }`}
        >
          <Users className="h-4 w-4" /> Surgeons {board ? `(${board.surgeons.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('consultant')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${
            tab === 'consultant' ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-700'
          }`}
        >
          <UserCog className="h-4 w-4" /> Unit consultants {board ? `(${board.consultants.length})` : ''}
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {tab === 'surgeon'
          ? 'Asked to close the gap on their own cases, with the patients named, and asked to have a word with the residents who entered the booking.'
          : 'Asked for the one thing only they can do: raise it with their residents and house officers. The cases are grouped by whoever entered them.'}
      </p>

      {loading && !board && (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the cases…
        </p>
      )}

      {board && rows.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Nothing outstanding for anybody in this period. That is worth knowing too.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.personId} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">
                  {r.personName}
                  {r.sentAt && (
                    <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                      written to {r.sentAt.slice(0, 10)}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {r.roleLabel || 'Surgeon'}
                  {r.units.length ? ` · ${r.units.join(', ')}` : ''}
                  {!r.hasPhone && ' · no phone number on file'}
                  {!r.active && ' · account not active'}
                </p>
                <p className="mt-1.5 text-sm text-gray-800">{r.headline}</p>
                <button
                  type="button"
                  onClick={() => setOpen(open === r.personId ? '' : r.personId)}
                  className="mt-1 text-xs font-semibold text-primary-700 underline"
                >
                  {open === r.personId ? 'Hide the cases' : `Show the ${r.caseCount} cases`}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => void act(r, tab, true)}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === `${tab}-${r.personId}-p`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Eye className="h-3.5 w-3.5" />}
                  Preview
                </button>
                <button
                  type="button"
                  disabled={busy !== '' || !r.active}
                  onClick={() => void act(r, tab, false)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {busy === `${tab}-${r.personId}-s`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  {r.sentAt ? 'Send again' : 'Send'}
                </button>
              </div>
            </div>

            {open === r.personId && (
              <ul className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/60">
                {r.cases.map((c) => (
                  <li key={c.id} className="px-4 py-2 text-xs text-gray-700">
                    <span className="font-semibold">{c.when}</span> — {c.patient} — {c.procedureName}
                    <span className="ml-1 text-red-700">
                      {' · '}{c.gaps.map((g) => g.toLowerCase().replace(/_/g, ' ')).join(', ')}
                    </span>
                    {c.bookedByName && (
                      <span className="ml-1 text-gray-500">· entered by {c.bookedByName}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Cases nobody can be written to about. The more serious half. */}
      {board && (board.unattributed.noSurgeon > 0 || board.unattributed.noConsultant > 0) && (
        <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Cases with nobody to write to
          </h2>
          <p className="mt-1 text-xs text-amber-900">
            {board.unattributed.noSurgeon} with no surgeon recorded and{' '}
            {board.unattributed.noConsultant} with no supervising consultant. A case with
            paperwork missing and no owner cannot be chased at all — the record needs a name
            on it first.
          </p>
          <ul className="mt-2 space-y-1">
            {board.unattributed.cases.map((c) => (
              <li key={`${c.id}-${c.missing}`} className="text-xs text-amber-900">
                <FileWarning className="mr-1 inline h-3.5 w-3.5" />
                <span className="font-semibold">{c.when}</span> — {c.patient} — {c.procedureName}
                {c.unit ? ` · ${c.unit}` : ''} · {c.missing}
              </li>
            ))}
          </ul>
        </section>
      )}

      {board && (
        <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A late booking cannot be undone, so it is reported as context rather than as
          something to fix. Consent, the pharmacy prescription and the pack request can all
          still be closed, and those are what the letters ask for.
        </p>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-gray-900">As it will reach them</h3>
            <p className="mt-0.5 text-xs text-gray-500">{preview.headline}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
              {preview.text}
            </pre>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
