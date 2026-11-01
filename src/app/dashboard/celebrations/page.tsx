'use client';

/**
 * Celebrations: the days the theatre says something kind on.
 *
 * ONE SCREEN, THREE SOURCES. The calendar (the first of the month, the
 * national holidays, the professional days), the days colleagues entered
 * themselves, and the occasions the calendar cannot know about — Eid moves
 * with the moon and is announced days ahead, so it is sent from the custom
 * form rather than guessed at in code.
 *
 * NOTHING SENDS ITSELF. A greeting that arrives automatically at one minute
 * past midnight is a greeting from a database and everybody can tell. This
 * screen shows what there is to mark; a person reads it and presses send.
 *
 * THE PREVIEW IS NOT DECORATION. It renders with a real colleague's name and
 * their real role, because the only question the reader has is what this will
 * actually say to them — and these messages name the work each cadre does,
 * which is the part worth checking before two hundred of them go out.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Cake, CalendarHeart, Check, Clock, Eye, Gift, Loader2, PartyPopper,
  Send, Sparkles, Users,
} from 'lucide-react';

interface BoardOccasion {
  key: string;
  kind: string;
  title: string;
  date: string;
  audience: 'ALL' | 'ROLES';
  audienceLabel: string | null;
  recipientCount: number;
  sentCount: number;
  remaining: number;
  withoutPhone: number;
}

interface BoardPersonal {
  id: string;
  kind: string;
  label: string | null;
  title: string;
  sinceYear: number | null;
  years: number | null;
  sent: boolean;
  person: {
    id: string;
    fullName: string;
    role: string | null;
    department: string | null;
    hasPhone: boolean;
  };
}

interface Board {
  on: string;
  today: string;
  dayLabel: string;
  monthLabel: string;
  occasions: BoardOccasion[];
  personal: BoardPersonal[];
  upcoming: { date: string; dayLabel: string; title: string; kind: string; key: string }[];
  coverage: { staffTotal: number; answered: number; notAsked: number; daysRecorded: number };
  sentToday: number;
}

const roleWords = (role: string | null) => (role || '')
  .split('_').filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

export default function CelebrationsPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [on, setOn] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ title: string; text: string; for?: string | null } | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  const load = useCallback(async (day?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = day ? `?on=${day}&ahead=21` : '?ahead=21';
      const res = await fetch(`/api/celebrations${qs}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not read the board.');
        return;
      }
      setBoard(d);
      setOn(d.on);
    } catch {
      setError('Could not read the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const previewIt = async (payload: Record<string, unknown>, key: string) => {
    setBusyKey(key);
    setResult('');
    try {
      const res = await fetch('/api/celebrations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, on, note: note || null, preview: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not build the preview.');
        return;
      }
      setPreview({
        title: d.title,
        text: d.text,
        for: d.sampleFor ? `${d.sampleFor.name} — ${roleWords(d.sampleFor.role)}` : null,
      });
    } catch {
      setError('Could not build the preview.');
    } finally {
      setBusyKey('');
    }
  };

  /**
   * Send, and keep sending.
   *
   * The route takes a batch at a time so that six hundred colleagues do not
   * time out one request; this loop asks again until nothing is left, telling
   * the person how far it has got. Capped, so a bug cannot turn a button into
   * an endless sender.
   */
  const sendIt = async (payload: Record<string, unknown>, key: string, all: boolean) => {
    setBusyKey(key);
    setError('');
    setResult('');
    setProgress('');
    let total = 0;
    let rounds = 0;
    try {
      for (;;) {
        rounds += 1;
        const res = await fetch('/api/celebrations/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, on, note: note || null }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error ?? 'Could not send it.');
          break;
        }
        const outcome = d.outcome ?? { sent: 0, remaining: 0 };
        total += outcome.sent ?? 0;
        if (!all || !outcome.remaining || rounds >= 40) {
          setResult(
            d.message
              ? (all ? `Sent to ${total} ${total === 1 ? 'colleague' : 'colleagues'}.` : d.message)
              : `Sent to ${total}.`,
          );
          break;
        }
        setProgress(`Sent ${total}… ${outcome.remaining} to go`);
      }
    } catch {
      setError('Could not send it.');
    } finally {
      setBusyKey('');
      setProgress('');
      await load(on);
    }
  };

  const isToday = board && board.on === board.today;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-primary-50 p-2.5 text-primary-700">
            <PartyPopper className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Celebrations</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Every greeting goes out individually, addressed to the colleague by name and
              naming the work they actually do. Nothing is sent automatically — you read it
              here and you press send.
            </p>
          </div>
        </div>
        <input
          type="date"
          value={on}
          onChange={(e) => { setOn(e.target.value); void load(e.target.value); }}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          aria-label="Which day"
        />
      </div>

      {board && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={isToday ? 'Today' : 'Showing'} value={board.dayLabel} />
          <Stat label="Greetings sent for this day" value={String(board.sentToday)} />
          <Stat
            label="Staff who have told us their days"
            value={`${board.coverage.answered} of ${board.coverage.staffTotal}`}
          />
          <Stat label="Days on record" value={String(board.coverage.daysRecorded)} />
        </div>
      )}

      {board && board.coverage.notAsked > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          {board.coverage.notAsked} colleagues have not yet answered the prompt about their
          own special days — it appears the next time each of them signs in, so this number
          falls on its own. A thin birthday list is usually that, and not a quiet month.
        </p>
      )}

      {/* A note from management, carried into whichever message is sent next. */}
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label htmlFor="celebration-note" className="text-sm font-semibold text-gray-900">
          Add a line of your own (optional)
        </label>
        <p className="mt-0.5 text-xs text-gray-500">
          Appears near the end of every message you send from this screen, in your words.
        </p>
        <textarea
          id="celebration-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={600}
          rows={2}
          placeholder="e.g. The theatre complex will be closed from 2pm. Enjoy the day."
          className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <Check className="h-4 w-4" /> {result}
        </p>
      )}
      {progress && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" /> {progress}
        </p>
      )}

      {loading && !board && (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the board…
        </p>
      )}

      {/* ── The calendar's occasions ─────────────────────────────────── */}
      {board && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
            <CalendarHeart className="h-4 w-4" /> On this day
          </h2>

          {board.occasions.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No national, monthly or professional occasion falls on this date. You can still
              send one below — that is how Eid is sent, on the day the hospital is told.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {board.occasions.map((o) => (
                <div key={o.key} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 font-bold text-gray-900">
                        <Sparkles className="h-4 w-4 text-primary-600" />
                        {o.title}
                      </h3>
                      <p className="mt-1 text-xs text-gray-600">
                        <Users className="mr-1 inline h-3.5 w-3.5" />
                        {o.audience === 'ALL'
                          ? `All ${o.recipientCount} members of staff`
                          : `${o.recipientCount} in ${o.audienceLabel ?? 'this group'}`}
                        {o.sentCount > 0 && ` · ${o.sentCount} already written to`}
                        {o.withoutPhone > 0 && ` · ${o.withoutPhone} with no phone number (in-app only)`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyKey !== ''}
                        onClick={() => void previewIt({ kind: 'occasion', occasionKey: o.key }, `p-${o.key}`)}
                        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busyKey === `p-${o.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        Preview
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== '' || o.remaining === 0}
                        onClick={() => void sendIt({ kind: 'occasion', occasionKey: o.key }, `s-${o.key}`, true)}
                        className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {busyKey === `s-${o.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {o.remaining === 0
                          ? 'All sent'
                          : `Send to ${o.remaining}`}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Personal days ────────────────────────────────────────────── */}
      {board && (
        <section className="mt-7">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
            <Cake className="h-4 w-4" /> Whose own day it is
          </h2>

          {board.personal.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Nobody has a birthday or anniversary recorded for this date.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {board.personal.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {p.person.fullName}
                      <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                        {p.title}
                      </span>
                      {p.years && p.years > 0 && (
                        <span className="ml-1.5 text-xs text-gray-500">{p.years} years</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {roleWords(p.person.role) || 'Staff'}
                      {p.person.department ? ` · ${p.person.department}` : ''}
                      {!p.person.hasPhone && ' · no phone number on file'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyKey !== ''}
                      onClick={() => void previewIt({ kind: 'personal', celebrationId: p.id }, `pp-${p.id}`)}
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </button>
                    {p.sent ? (
                      <span className="flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
                        <Check className="h-3.5 w-3.5" /> Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyKey !== ''}
                        onClick={() => void sendIt({ kind: 'personal', celebrationId: p.id }, `sp-${p.id}`, false)}
                        className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {busyKey === `sp-${p.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                        Send
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── An occasion the calendar cannot know about ───────────────── */}
      <section className="mt-7 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">Send another occasion</h2>
        <p className="mt-1 text-xs text-gray-600">
          For the days no calendar can hold in advance. Eid al-Fitr and Eid al-Adha follow
          the moon and are announced a few days ahead, so they are deliberately not guessed
          at in code — name the occasion here on the day the hospital is told, and every
          member of staff is written to individually, as always.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={customTitle}
            maxLength={80}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="e.g. Eid al-Fitr"
            className="min-w-[14rem] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busyKey !== '' || !customTitle.trim()}
            onClick={() => void previewIt({ kind: 'custom', title: customTitle.trim() }, 'p-custom')}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            type="button"
            disabled={busyKey !== '' || !customTitle.trim()}
            onClick={() => void sendIt({ kind: 'custom', title: customTitle.trim() }, 's-custom', true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busyKey === 's-custom' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send to all staff
          </button>
        </div>
      </section>

      {/* ── Coming up ────────────────────────────────────────────────── */}
      {board && board.upcoming.length > 0 && (
        <section className="mt-7">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500">
            <Clock className="h-4 w-4" /> Coming up
          </h2>
          <ul className="mt-2 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {board.upcoming.map((u) => (
              <li key={`${u.date}-${u.key}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-gray-800">{u.title}</span>
                <button
                  type="button"
                  onClick={() => { setOn(u.date); void load(u.date); }}
                  className="shrink-0 text-xs font-semibold text-primary-700 underline"
                >
                  {u.dayLabel}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The preview ──────────────────────────────────────────────── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-gray-900">{preview.title}</h3>
            {preview.for && (
              <p className="mt-0.5 text-xs text-gray-500">As it will reach {preview.for}</p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}
