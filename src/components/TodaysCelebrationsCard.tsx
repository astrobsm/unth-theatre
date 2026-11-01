'use client';

/**
 * What there is to celebrate today, on the dashboard itself.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING, and nothing at all for anybody
 * without the role — the endpoint refuses them and the card simply does not
 * appear. A permanent empty panel on everybody's dashboard would be one more
 * thing to scroll past, and the whole value of this card is that on the
 * morning it does appear, somebody notices.
 *
 * The birthdays can be sent from here in one tap, because that is the action
 * the card exists to prompt and sending it later in the day is the same as
 * forgetting. Anything that goes to the whole hospital is a link to the full
 * screen instead: two hundred messages should be sent by somebody who has
 * read them, not by somebody passing their dashboard.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Cake, Check, ChevronRight, Gift, Loader2, PartyPopper } from 'lucide-react';

interface Occasion {
  key: string;
  title: string;
  recipientCount: number;
  remaining: number;
  audienceLabel: string | null;
  audience: 'ALL' | 'ROLES';
}

interface Personal {
  id: string;
  title: string;
  years: number | null;
  sent: boolean;
  person: { fullName: string; role: string | null };
}

const roleWords = (role: string | null) => (role || '')
  .split('_').filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

export default function TodaysCelebrationsCard() {
  const [on, setOn] = useState('');
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/celebrations?ahead=0', { cache: 'no-store' });
      if (!res.ok) return; // Not for this person, or not available. Say nothing.
      const d = await res.json();
      setOn(d.on ?? '');
      setOccasions(d.occasions ?? []);
      setPersonal(d.personal ?? []);
    } catch {
      // Never let a greeting break a dashboard.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const send = async (celebrationId: string) => {
    setBusy(celebrationId);
    setNote('');
    try {
      const res = await fetch('/api/celebrations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'personal', celebrationId, on }),
      });
      const d = await res.json();
      setNote(d.error ?? d.message ?? 'Sent.');
      await load();
    } catch {
      setNote('Could not send it.');
    } finally {
      setBusy('');
    }
  };

  const unsent = personal.filter((p) => !p.sent);
  if (occasions.length === 0 && personal.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <PartyPopper className="h-4 w-4" />
          Today there is something to mark
        </h2>
        <Link
          href="/dashboard/celebrations"
          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-900 underline"
        >
          Open celebrations <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {occasions.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {occasions.map((o) => (
            <li key={o.key} className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
              <span className="font-semibold">{o.title}</span>
              <span className="text-xs text-amber-800">
                {o.remaining === 0
                  ? 'everybody has been written to'
                  : `${o.remaining} of ${o.recipientCount} still to be written to`
                    + (o.audience === 'ROLES' && o.audienceLabel ? ` in ${o.audienceLabel}` : '')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {personal.length > 0 && (
        <div className="mt-3 space-y-2">
          {personal.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2.5"
            >
              <p className="min-w-0 text-sm text-gray-900">
                <Cake className="mr-1.5 inline h-4 w-4 text-amber-600" />
                <span className="font-semibold">{p.person.fullName}</span>
                <span className="ml-1.5 text-xs text-gray-500">
                  {p.title}
                  {p.years && p.years > 0 ? ` · ${p.years} years` : ''}
                  {p.person.role ? ` · ${roleWords(p.person.role)}` : ''}
                </span>
              </p>
              {p.sent ? (
                <span className="flex items-center gap-1 text-xs font-bold text-green-700">
                  <Check className="h-3.5 w-3.5" /> Sent
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => void send(p.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy === p.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Gift className="h-3.5 w-3.5" />}
                  Send
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {note && <p className="mt-2 text-xs font-medium text-amber-900">{note}</p>}

      {unsent.length === 0 && occasions.every((o) => o.remaining === 0) && (
        <p className="mt-2 text-xs text-amber-800">
          Everything for today has gone out.
        </p>
      )}
    </div>
  );
}
