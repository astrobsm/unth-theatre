'use client';

// ============================================================
// "My theatre is ready" — for the person standing in it
// ------------------------------------------------------------
// Pick the theatre, tick the list, press the button. That is the whole screen.
//
// It used to be impossible until somebody had first entered a material
// collection record, because readiness was a field on that record — so a nurse
// in a fully prepared theatre was told "No material collection recorded for
// today yet", which sounds like a statement about the theatre and is actually
// a statement about paperwork for the trolley.
//
// The scrub nurse and the theatre technician get separate lists, because the
// anaesthetic machine, the gases and the airway are not the scrub nurse's to
// vouch for, and a single list ticked by one person would put her name against
// a machine check she did not do.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Megaphone, Radio, AlertTriangle } from 'lucide-react';
import {
  listFor, progress, READINESS_LISTS, type ReadinessRole, type Ticks,
} from '@/lib/theatre/readiness';

interface Theatre { id: string; name: string; location?: string | null }

interface Confirmation {
  id: string;
  theatreId: string;
  role: string;
  complete: boolean;
  confirmedByName: string;
  completedAt?: string | null;
  announcedAt?: string | null;
  note?: string | null;
  ticks: Ticks;
}

interface Props {
  /** Pre-selects a list where the signed-in person clearly answers for one. */
  defaultRole?: ReadinessRole;
}

export default function ReadinessPanel({ defaultRole }: Props) {
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [theatreId, setTheatreId] = useState('');
  const [role, setRole] = useState<ReadinessRole>(defaultRole ?? 'SCRUB_NURSE');
  const [ticks, setTicks] = useState<Ticks>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad' | 'plain'; text: string } | null>(null);

  const list = listFor(role)!;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/theatre-readiness');
      if (!res.ok) return;
      const data = await res.json();
      setTheatres(Array.isArray(data.theatres) ? data.theatres : []);
      setConfirmations(Array.isArray(data.confirmations) ? data.confirmations : []);
    } catch {
      /* the panel still draws; the lists are usable without the day's state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Whatever is already recorded for this theatre and list today is shown
  // ticked. Somebody coming back to finish the list must not have to remember
  // which boxes they had already done.
  const existing = useMemo(
    () => confirmations.find((c) => c.theatreId === theatreId && c.role === role) ?? null,
    [confirmations, theatreId, role],
  );

  useEffect(() => {
    setTicks(existing?.ticks ?? {});
    setNote(existing?.note ?? '');
    setMessage(null);
  }, [existing]);

  const state = progress(role, ticks);

  const toggle = (id: string) =>
    setTicks((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });

  const submit = async () => {
    if (!theatreId) {
      setMessage({ tone: 'bad', text: 'Choose your theatre first.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/theatre-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theatreId, role, ticks, note }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The block dialog handles the rest; this keeps the answer on the panel
        // as well, where the person is looking.
        setMessage({ tone: 'bad', text: data.error || 'That could not be saved. Try again.' });
        return;
      }

      if (data.announced) {
        setMessage({
          tone: 'good',
          text: `Announced. The radio is telling the surgical team that ${
            theatres.find((t) => t.id === theatreId)?.name ?? 'your theatre'
          } is ready — the message is spoken three times.`,
        });
      } else if (data.announcementFailed) {
        setMessage({
          tone: 'bad',
          text: 'Saved and marked ready, but the radio announcement did not go out. '
            + 'Say it over the handset.',
        });
      } else if (data.confirmation?.complete) {
        setMessage({ tone: 'good', text: 'Saved. This theatre is already marked ready today.' });
      } else {
        const left = data.confirmation?.progress?.outstanding?.length ?? state.outstanding.length;
        setMessage({
          tone: 'plain',
          text: `Saved — ${left} still to tick. Nothing is announced until the list is complete.`,
        });
      }
      await load();
    } catch {
      setMessage({ tone: 'bad', text: 'That could not be saved. Your ticks are still on screen.' });
    } finally {
      setSaving(false);
    }
  };

  const otherRole: ReadinessRole = role === 'SCRUB_NURSE' ? 'THEATRE_TECHNICIAN' : 'SCRUB_NURSE';
  const otherSide = confirmations.find((c) => c.theatreId === theatreId && c.role === otherRole);

  return (
    <div className="rounded-2xl border-2 border-green-200 bg-green-50/60 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-green-600 p-2.5">
          <Megaphone className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">Confirm your theatre is ready</h2>
          <p className="text-sm text-gray-700">
            Tick what is true. When the list is complete the radio tells the surgical team,
            three times, that this theatre can receive patients.
          </p>
        </div>
      </div>

      {/* Which list. Two people answer for a theatre and they check different
          things, so this is not a detail — it decides whose name goes on it. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(READINESS_LISTS) as ReadinessRole[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
              role === r
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
            }`}
          >
            {READINESS_LISTS[r].who}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="readinessTheatre" className="mb-1 block text-sm font-semibold text-gray-800">
            Which theatre are you in?
          </label>
          <select
            id="readinessTheatre"
            name="readinessTheatre"
            value={theatreId}
            onChange={(e) => setTheatreId(e.target.value)}
            className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
          >
            <option value="">{loading ? 'Loading theatres…' : 'Select your theatre'}</option>
            {theatres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.location ? ` — ${t.location}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          {/* What the other half of the theatre has said. A nurse in a ready
              room beside an unchecked machine has done everything she can and
              the theatre is still not ready for a patient; she should be able
              to see that without ringing anybody. */}
          {theatreId && (
            <div className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
              <span className="font-semibold text-gray-800">
                {READINESS_LISTS[otherRole].who}:
              </span>{' '}
              {otherSide?.complete ? (
                <span className="text-green-700">
                  confirmed by {otherSide.confirmedByName}
                </span>
              ) : otherSide ? (
                <span className="text-amber-700">started, not finished</span>
              ) : (
                <span className="text-gray-500">not yet confirmed today</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The list itself. Big tap targets: this is used standing up, in gloves,
          on a phone. */}
      <ul className="mt-4 space-y-2">
        {list.checks.map((check) => {
          const on = !!ticks[check.id];
          return (
            <li key={check.id}>
              <button
                type="button"
                onClick={() => toggle(check.id)}
                aria-pressed={on}
                className={`flex w-full items-start gap-3 rounded-xl border-2 px-3 py-3 text-left transition ${
                  on ? 'border-green-500 bg-white' : 'border-gray-200 bg-white hover:border-green-300'
                }`}
              >
                {on
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />}
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${on ? 'text-gray-900' : 'text-gray-800'}`}>
                    {check.label}
                    {!check.required && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                        optional
                      </span>
                    )}
                  </span>
                  {check.hint && <span className="mt-0.5 block text-xs text-gray-600">{check.hint}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <label htmlFor="readinessNote" className="mb-1 block text-sm font-semibold text-gray-800">
          Anything short or faulty? <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="readinessNote"
          name="readinessNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. only two suction tubings left"
          className="w-full rounded-xl border-2 border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-600">
          This is read out with the announcement, so whoever can fix it hears about it
          before the patient is on the table.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-gray-800">
          {state.done} of {state.total} confirmed
          {state.outstanding.length > 0 && (
            <span className="text-gray-600"> — still to tick: {state.outstanding[0].label}
              {state.outstanding.length > 1 ? ` and ${state.outstanding.length - 1} more` : ''}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
          {/* Says what pressing it does. "Submit" would not distinguish saving
              four ticks from putting a theatre on the radio. */}
          {saving
            ? 'Saving…'
            : state.complete
              ? (existing?.announcedAt ? 'Save changes' : 'Confirm ready and announce')
              : 'Save what is ticked'}
        </button>
      </div>

      {message && (
        <p className={`mt-3 rounded-xl px-3 py-2.5 text-sm ${
          message.tone === 'good' ? 'bg-green-100 text-green-900'
            : message.tone === 'bad' ? 'bg-red-50 text-red-800'
            : 'bg-white text-gray-700'
        }`}>
          {message.tone === 'bad' && <AlertTriangle className="mr-1.5 inline h-4 w-4" />}
          {message.text}
        </p>
      )}

      {/* Every theatre confirmed today, so anybody on this screen can see the
          state of the floor without opening another one. */}
      {confirmations.length > 0 && (
        <div className="mt-5 border-t border-green-200 pt-4">
          <h3 className="text-sm font-bold text-gray-900">Confirmed today</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {confirmations.filter((c) => c.complete).map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <span className="font-semibold text-gray-900">
                  {theatres.find((t) => t.id === c.theatreId)?.name ?? 'Theatre'}
                </span>
                <span className="text-gray-600">
                  {' '}— {READINESS_LISTS[c.role as ReadinessRole]?.who ?? c.role}, {c.confirmedByName}
                </span>
                {c.note && <span className="block text-xs text-amber-800">Note: {c.note}</span>}
              </li>
            ))}
            {confirmations.every((c) => !c.complete) && (
              <li className="text-sm text-gray-600">Nothing confirmed complete yet today.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
