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
  AlertTriangle, CalendarClock, Check, Eye, FileClock, FileText, Loader2, MessageCircle, Send,
  UserPlus,
} from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';

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
  tally: {
    periods: number; late: number; missing: number; onTime: number;
    failures: number; runningStreak: number; worstStreak: number; totalDaysLate: number;
  };
  nobodyToWriteTo: boolean;
  candidateCount: number;
  recipients: Recipient[];
}

interface Board {
  periodKey: string;
  periodKind: 'week' | 'month';
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
  // The board opens on THIS WEEK. It used to open on the calendar month,
  // which is how a department with no roster for the coming week could sit on
  // this screen looking up to date.
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ text: string; headline: string; to: string[] } | null>(null);

  /**
   * The WhatsApp messages waiting to be opened.
   *
   * KEPT ON SCREEN AFTER THE FIRST IS OPENED AUTOMATICALLY, for the two cases
   * that would otherwise lose the message: a browser that blocked the pop-up,
   * and a department whose roster is owned by two people — one wa.me link can
   * only address one of them, so the second needs a button of its own.
   */
  const [handoff, setHandoff] = useState<
    { name: string; href: string | null; alreadySent: boolean }[]
  >([]);

  const load = useCallback(async (w?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/roster-chase${w ? `?week=${w}` : ''}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not read the board.');
        return;
      }
      setBoard(d);
      setWeekStart(d.period?.start ?? '');
    } catch {
      setError('Could not read the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Step a YYYY-MM-DD by whole days. Noon, so no offset can cross a date. */
  const shiftWeek = (day: string, by: number): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!m) return day;
    const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    t.setUTCDate(t.getUTCDate() + by);
    return t.toISOString().slice(0, 10);
  };

  const act = async (dept: Dept, asPreview: boolean, personId?: string, asLetter = false) => {
    setBusy(`${dept.slug}-${asLetter ? 'l' : asPreview ? 'p' : 's'}-${personId ?? 'all'}`);
    setError('');
    setResult('');
    setHandoff([]);
    try {
      const res = await fetch('/api/roster-chase/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: weekStart, dept: dept.slug, personId: personId ?? null,
          note: note || null, preview: asPreview, letter: asLetter,
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

      // Hand the letter to WhatsApp.
      //
      // The in-app notification is already written by this point — the server
      // does that before it answers — so a blocked pop-up can only leave the
      // message unsent, never sent and unrecorded. It is also why the list
      // below stays on screen: the manager can open it by hand afterwards.
      const outgoing: { name: string; href: string | null; alreadySent: boolean }[] =
        (d.whatsapp ?? []).map((w: {
          name: string; number: string | null; text: string; alreadySent: boolean;
        }) => ({
          name: w.name,
          href: w.number ? whatsappLink(w.number, w.text) : null,
          alreadySent: w.alreadySent,
        }));
      setHandoff(outgoing);

      // Opened straight away so the ordinary case — one head of department —
      // is a single press, which is what the button has always promised.
      const first = outgoing.find((o) => o.href);
      if (first?.href) window.open(first.href, '_blank', 'noopener,noreferrer');

      await load(weekStart);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(shiftWeek(weekStart, -7))}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            aria-label="Previous week"
          >←</button>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => { setWeekStart(e.target.value); void load(e.target.value); }}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
            aria-label="Any day in the week to show"
            title="Any day in the week — the board snaps to its Monday"
          />
          <button
            type="button"
            onClick={() => void load(shiftWeek(weekStart, 7))}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
            aria-label="Next week"
          >→</button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-gray-300 px-2 py-2 text-xs font-medium"
          >This week</button>
        </div>
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
                </p>
                {d.tally && d.tally.failures > 0 && (
                  <p className="mt-0.5 text-xs font-medium text-red-700">
                    Record: {d.tally.failures} of the last {d.tally.periods} weeks
                    {d.tally.missing > 0 && ` · ${d.tally.missing} with no roster`}
                    {d.tally.late > 0 && ` · ${d.tally.late} late`}
                    {d.tally.runningStreak > 1 && ` · ${d.tally.runningStreak} weeks running`}
                  </p>
                )}
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
                  {/* The letter is the instrument for when asking has stopped
                      working, so it is offered once there is a record to cite
                      — and not before, because a formal letter about a first
                      oversight is how a chase loses its weight. */}
                  {d.tally && d.tally.failures > 1 && (
                    <button
                      type="button"
                      disabled={busy !== ''}
                      onClick={() => void act(d, true, undefined, true)}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50"
                      title={`${d.tally.failures} failures in the last ${d.tally.periods} weeks`}
                    >
                      {busy === `${d.slug}-l-all`
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <FileText className="h-3.5 w-3.5" />}
                      Chase letter
                    </button>
                  )}
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

      {/*
        WHY THE LINKS STAY HERE after WhatsApp has been opened.

        Three things go wrong with a pop-up that nothing else recovers from: a
        browser blocks it silently, the manager closes WhatsApp before pressing
        send, or the roster has two owners and one wa.me link can only address
        one of them. In all three the letter is already on the colleague's ORM
        dashboard and only the WhatsApp copy is missing — so the way back to it
        has to be visible, not a matter of pressing the green button again.
      */}
      {handoff.length > 0 && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
            <MessageCircle className="h-4 w-4" />
            Send on WhatsApp
          </p>
          <p className="mt-0.5 text-xs text-green-800">
            Everybody below already has this on their ORM dashboard. WhatsApp opens
            with the same wording — you press send.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {handoff.map((h) => (h.href ? (
              <a
                key={h.name}
                href={h.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {h.name}
              </a>
            ) : (
              <span
                key={h.name}
                className="flex items-center gap-1.5 rounded-xl border border-green-300 bg-white px-3 py-2 text-xs font-medium text-gray-600"
              >
                {h.name} — no phone number on file
              </span>
            )))}
          </div>
        </div>
      )}

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
