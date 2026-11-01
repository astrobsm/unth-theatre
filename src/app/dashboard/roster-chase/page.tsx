'use client';

/**
 * Which departments' rosters are late, and who to ask.
 *
 * ONE ROW PER STANDING ROSTER DEPARTMENT, worst first. The states are kept
 * apart deliberately: "nothing submitted", "drafted but never published" and
 * "submitted eleven days late" are three different conversations, and the
 * middle one is the commonest and the most easily fixed — somebody has done
 * the whole job and does not know the last button exists.
 *
 * A DEPARTMENT WITH NOBODY TO WRITE TO IS SHOWN AS SUCH, not quietly dropped.
 * A roster with no owner is a worse problem than a roster that is late, and no
 * message can fix it — it needs a supervisor assigned.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, Check, Eye, FileClock, Loader2, Send, UserPlus,
} from 'lucide-react';

interface Recipient {
  id: string;
  fullName: string;
  role: string | null;
  hasPhone: boolean;
  active: boolean;
  source: 'SUPERVISOR' | 'ROLE';
  sentAt: string | null;
}

interface Dept {
  slug: string;
  label: string;
  state: 'ON_TIME' | 'LATE' | 'DRAFTED_NOT_PUBLISHED' | 'MISSING';
  stateLabel: string;
  headline: string;
  dueDay: string;
  firstPublishedDay: string | null;
  daysLate: number | null;
  daysOverdue: number | null;
  version: number | null;
  publishedByName: string | null;
  draftRows: number;
  publishedRows: number;
  notYetDue: boolean;
  priorLateMonths: number;
  nobodyToWriteTo: boolean;
  candidateCount: number;
  recipients: Recipient[];
}

interface Board {
  month: string;
  today: string;
  period: { start: string; end: string; label: string };
  counts: Record<string, number>;
  ownerless: string[];
  departments: Dept[];
}

const TONE: Record<Dept['state'], string> = {
  MISSING: 'border-red-200 bg-red-50',
  DRAFTED_NOT_PUBLISHED: 'border-amber-200 bg-amber-50',
  LATE: 'border-orange-200 bg-orange-50',
  ON_TIME: 'border-green-200 bg-green-50',
};

const roleWords = (role: string | null) => (role || '')
  .split('_').filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

export default function RosterChasePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ text: string; headline: string; to: string[] } | null>(null);

  const load = useCallback(async (m?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/roster-chase${m ? `?month=${m}` : ''}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not read the board.');
        return;
      }
      setBoard(d);
      setMonth(d.month);
    } catch {
      setError('Could not read the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (dept: Dept, asPreview: boolean, personId?: string) => {
    setBusy(`${dept.slug}-${asPreview ? 'p' : 's'}-${personId ?? 'all'}`);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/roster-chase/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, dept: dept.slug, personId: personId ?? null,
          note: note || null, preview: asPreview,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not do that.');
        return;
      }
      if (asPreview) {
        setPreview({ text: d.text, headline: d.headline, to: d.recipients ?? [] });
        return;
      }
      setResult(d.message ?? 'Sent.');
      if (d.skipped?.length) {
        setResult(`${d.message ?? 'Sent.'} Skipped: ${d.skipped
          .map((s: { name: string; reason: string }) => `${s.name} (${s.reason})`)
          .join('; ')}.`);
      }
      await load(month);
    } catch {
      setError('Could not do that.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-primary-50 p-2.5 text-primary-700">
            <FileClock className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Roster submissions</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              A roster counts as submitted when it is <strong>published</strong> — nothing in
              this hospital reads draft rows. Due a week before the period begins.
            </p>
          </div>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => { setMonth(e.target.value); void load(e.target.value); }}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          aria-label="Which month"
        />
      </div>

      {board && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Nothing submitted" value={board.counts.MISSING ?? 0} tone="text-red-700" />
          <Stat label="Drafted, not published" value={board.counts.DRAFTED_NOT_PUBLISHED ?? 0} tone="text-amber-700" />
          <Stat label="Submitted late" value={board.counts.LATE ?? 0} tone="text-orange-700" />
          <Stat label="In on time" value={board.counts.ON_TIME ?? 0} tone="text-green-700" />
        </div>
      )}

      {board && board.ownerless.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <UserPlus className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No roster supervisor is assigned for {board.ownerless.join(', ')}. Nobody can be
            written to about those, and a roster with no owner is the more urgent problem —{' '}
            <Link href="/dashboard/roster/supervisors" className="font-semibold underline">
              assign one
            </Link>
            .
          </span>
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label htmlFor="roster-note" className="text-sm font-semibold text-gray-900">
          Add a line of your own (optional)
        </label>
        <textarea
          id="roster-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder="e.g. The theatre meal count for next week is being ordered on Thursday."
          className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> {result}
        </p>
      )}

      {loading && !board && (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the rosters…
        </p>
      )}

      <div className="mt-4 space-y-3">
        {board?.departments.map((d) => (
          <div key={d.slug} className={`rounded-2xl border p-4 ${TONE[d.state]}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900">
                  {d.label}
                  <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-gray-700">
                    {d.stateLabel}
                  </span>
                  {d.notYetDue && d.state !== 'ON_TIME' && (
                    <span className="ml-1.5 text-xs font-medium text-gray-600">not due yet</span>
                  )}
                </h3>
                <p className="mt-1 text-xs text-gray-700">
                  Due {d.dueDay}
                  {d.firstPublishedDay && ` · first published ${d.firstPublishedDay}`}
                  {d.version !== null && ` · version ${d.version}`}
                  {d.publishedByName && ` by ${d.publishedByName}`}
                </p>
                <p className="mt-0.5 text-xs text-gray-700">
                  {d.draftRows > 0 && `${d.draftRows} draft rows · `}
                  {d.publishedRows} published rows
                  {d.priorLateMonths > 0 && ' · the previous month was late too'}
                </p>
                {d.recipients.length > 0 ? (
                  <p className="mt-1.5 text-xs text-gray-600">
                    {d.recipients.map((r) => (
                      <span key={r.id} className="mr-2">
                        {r.fullName}
                        <span className="text-gray-400">
                          {' '}({r.source === 'SUPERVISOR' ? 'supervisor' : roleWords(r.role) || 'by role'}
                          {r.sentAt ? `, written to ${r.sentAt.slice(0, 10)}` : ''}
                          {!r.hasPhone ? ', no phone' : ''})
                        </span>
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {d.candidateCount > 0
                      ? `Nobody owns this roster — ${d.candidateCount} could`
                      : 'Nobody owns this roster'}
                  </p>
                )}
              </div>

              {d.state !== 'ON_TIME' && !d.notYetDue && d.recipients.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => void act(d, true)}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
                  >
                    {busy === `${d.slug}-p-all`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Eye className="h-3.5 w-3.5" />}
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => void act(d, false)}
                    className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {busy === `${d.slug}-s-all`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    Write to {d.recipients.length === 1 ? 'the head' : `all ${d.recipients.length}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Lateness is judged on the <strong>first</strong> publication for the period, not the
        latest. A department that published a week early and then corrected it twice during
        the month was on time — measuring the most recent version would report the
        departments that maintain their rosters properly as the worst offenders.
      </p>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-gray-900">{preview.headline}</h3>
            {preview.to.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-500">To {preview.to.join(', ')}</p>
            )}
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}
