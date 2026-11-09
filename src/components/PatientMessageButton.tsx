'use client';

/**
 * "Tell the patient."
 *
 * Sits on a case, beside the other things a person does while standing in a
 * corridor. Four messages, each a tap: the safety notice about people selling
 * lists, a delay that is still going ahead, a new date, and a cancellation.
 *
 * THREE THINGS THIS SCREEN IS CAREFUL ABOUT.
 *
 * 1. IT SAYS WHOSE PHONE IT IS, before anything is composed. A number on a
 *    patient's file is often a son's or a daughter's, and "this goes to Ngozi
 *    Eze (next of kin)" is a different decision from "this goes to the
 *    patient". When there is no number at all it says so at the top and offers
 *    nothing to press, rather than letting somebody write a message to nobody.
 *
 * 2. IT SHOWS THE EXACT WORDS BEFORE SENDING. These go out over the hospital's
 *    name to a frightened person. The preview is the message, rendered by the
 *    server from the same template the record will hold — not an approximation
 *    of it.
 *
 * 3. THE REASONS ARE A LIST, NOT A BOX. There is nowhere here to type, because
 *    the honest answer to "what is delaying it" is often clinical and this
 *    message ends up on a phone. See lib/patients/notices.ts.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare, Loader2, X, ShieldAlert, Clock, CalendarDays, Ban,
  ExternalLink, Copy, Check, AlertTriangle, Receipt,
} from 'lucide-react';
import type { NoticeKind, Choice } from '@/lib/patients/notices';

interface Props {
  surgeryId: string;
  patientName?: string | null;
  status?: string | null;
}

interface Contact {
  owner: 'PATIENT' | 'CAREGIVER';
  ownerLabel: string;
  number: string;
}

interface Options {
  patientName: string | null;
  contact: Contact | null;
  noContactMessage: string | null;
  delayReasons: Choice[];
  changeReasons: Choice[];
  eatingInstructions: Choice[];
  /** Whether a drug/consumable deposit has been set for this case. */
  depositActive: boolean;
  depositSentence: string | null;
}

interface Sent {
  to: string;
  text: string;
  handoff: string;
  queued: boolean;
  queueNote: string | null;
}

const KINDS: Array<{
  kind: NoticeKind;
  label: string;
  hint: string;
  Icon: typeof ShieldAlert;
}> = [
  {
    kind: 'SAFETY',
    label: 'Safety notice about lists and money',
    hint: 'Only ward nurses and the hospital pharmacist may hand them a list to buy.',
    Icon: ShieldAlert,
  },
  {
    kind: 'PAYMENT_WARNING',
    label: 'Pay only the revenue unit — never a person',
    hint: 'Names the deposit and where it is paid. Only once a deposit has been set.',
    Icon: Receipt,
  },
  {
    kind: 'STILL_HOLDING',
    label: 'Still going ahead — this is what is delaying it',
    hint: 'For a patient who has been waiting and has heard nothing.',
    Icon: Clock,
  },
  {
    kind: 'RESCHEDULED',
    label: 'Moved to a new date',
    hint: 'Carries the new date and what to do about eating and drinking.',
    Icon: CalendarDays,
  },
  {
    kind: 'CANCELLED',
    label: 'Will not go ahead as planned',
    hint: 'No new date yet. Says what to do now, including about eating.',
    Icon: Ban,
  },
];

export default function PatientMessageButton({ surgeryId, patientName, status }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [kind, setKind] = useState<NoticeKind | null>(null);
  const [reasonKey, setReasonKey] = useState('');
  const [instructionKey, setInstructionKey] = useState('');
  const [expected, setExpected] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/patient-message`, { cache: 'no-store' });
      if (!r.ok) { setLoadFailed(true); setOptions(null); return; }
      setOptions(await r.json());
    } catch {
      // A failed lookup is not an empty record. Without this the screen would
      // say the patient has no phone number, and somebody would go and type one
      // in on top of the one already there.
      setLoadFailed(true);
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [surgeryId]);

  useEffect(() => { if (open && !options && !loading) void load(); }, [open, options, loading, load]);

  const reset = () => {
    setKind(null); setReasonKey(''); setInstructionKey('');
    setExpected(''); setNewDate(''); setError(null); setSent(null); setCopied(false);
  };

  const close = () => { setOpen(false); reset(); };

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/patient-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, reasonKey, instructionKey, expected, newDate }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? 'That message could not be prepared.');
        return;
      }
      setSent({
        to: d.to, text: d.text, handoff: d.handoff,
        queued: Boolean(d.queued), queueNote: d.queueNote ?? null,
      });
    } catch {
      setError('Could not reach the server. Nothing has been sent.');
    } finally {
      setBusy(false);
    }
  };

  // Nothing to tell a patient about a case that is finished with.
  if (status === 'COMPLETED') return null;

  const reasons = kind === 'STILL_HOLDING'
    ? options?.delayReasons ?? []
    : options?.changeReasons ?? [];
  const needsReason = kind !== null && kind !== 'SAFETY';
  const needsEating = kind === 'RESCHEDULED' || kind === 'CANCELLED';
  const ready = kind !== null
    && (!needsReason || reasonKey !== '')
    && (!needsEating || instructionKey !== '')
    && (kind !== 'STILL_HOLDING' || expected.trim() !== '')
    && (kind !== 'RESCHEDULED' || newDate.trim() !== '');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-100"
        title="Send this patient the safety notice, a delay, a new date or a cancellation"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Tell the patient
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-xl">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Tell the patient</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {patientName ?? options?.patientName ?? 'This patient'}
                  {options?.contact && ` · goes to ${options.contact.ownerLabel}`}
                </p>
              </div>
              <button type="button" onClick={close} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {loading && (
                <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking how this patient can be reached…
                </p>
              )}

              {loadFailed && (
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
                  <p className="font-semibold">Could not check this patient&apos;s number.</p>
                  <p className="mt-1">
                    That is a problem with the lookup, not a sign that there is no number on file.
                  </p>
                  <button type="button" onClick={() => void load()} className="btn-secondary mt-2 text-xs">
                    Try again
                  </button>
                </div>
              )}

              {/* No number: say so at the top and offer nothing to press. */}
              {options && !options.contact && (
                <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4" /> This patient cannot be reached
                  </p>
                  <p className="mt-1 text-sm text-amber-900">{options.noContactMessage}</p>
                </div>
              )}

              {options?.contact && !sent && (
                <>
                  {options.contact.owner === 'CAREGIVER' && (
                    <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      There is no number for the patient themselves, so this goes to{' '}
                      <strong>{options.contact.ownerLabel}</strong>.
                    </p>
                  )}

                  <fieldset>
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      What do they need to know?
                    </legend>
                    <div className="grid gap-1.5">
                      {KINDS.map(({ kind: k, label, hint, Icon }) => {
                        // The payment warning tells the patient what their
                        // deposit is and where to pay it. Before a deposit
                        // exists there is no amount, so it is not offered —
                        // rather than offered and then refused after somebody
                        // has chosen it.
                        const blocked = k === 'PAYMENT_WARNING' && !options.depositActive;
                        return (
                        <label
                          key={k}
                          title={blocked
                            ? 'No drug or consumable deposit has been set for this case yet.'
                            : undefined}
                          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                            blocked
                              ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                              : kind === k
                                ? 'cursor-pointer border-sky-600 bg-sky-50 font-medium text-sky-900'
                                : 'cursor-pointer border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="notice-kind"
                            value={k}
                            disabled={blocked}
                            checked={kind === k}
                            onChange={() => {
                              setKind(k); setReasonKey(''); setInstructionKey('');
                              setError(null);
                            }}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>
                            <span className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5" /> {label}
                            </span>
                            <span className={`mt-0.5 block text-xs font-normal ${
                              blocked ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {blocked
                                ? 'Available once the drug and consumable deposit is set.'
                                : hint}
                            </span>
                          </span>
                        </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {needsReason && (
                    <fieldset className="mt-4">
                      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        What may the patient be told?
                      </legend>
                      <div className="grid gap-1.5">
                        {reasons.map((r) => (
                          <label
                            key={r.key}
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                              reasonKey === r.key
                                ? 'border-sky-600 bg-sky-50 font-medium text-sky-900'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="notice-reason"
                              value={r.key}
                              checked={reasonKey === r.key}
                              onChange={(e) => setReasonKey(e.target.value)}
                              className="mr-2 h-4 w-4"
                            />
                            {r.label}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-gray-500">
                        A fixed list on purpose — nothing about the patient&apos;s condition goes
                        out on a phone. The ward nurse explains the rest in person.
                      </p>
                    </fieldset>
                  )}

                  {kind === 'STILL_HOLDING' && (
                    <label className="mt-4 block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        When do you expect to send for them?
                      </span>
                      <input
                        type="text"
                        value={expected}
                        onChange={(e) => setExpected(e.target.value)}
                        placeholder="e.g. within the next two hours"
                        className="input-field mt-1"
                        maxLength={120}
                      />
                      <span className="mt-1 block text-[11px] text-gray-500">
                        Even roughly. They already know they are waiting; what they do not know
                        is until when.
                      </span>
                    </label>
                  )}

                  {kind === 'RESCHEDULED' && (
                    <label className="mt-4 block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        The new date, as the patient should read it
                      </span>
                      <input
                        type="text"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        placeholder="e.g. Monday 16 November, come to the ward by 7 a.m."
                        className="input-field mt-1"
                        maxLength={120}
                      />
                    </label>
                  )}

                  {needsEating && (
                    <fieldset className="mt-4">
                      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Eating and drinking
                      </legend>
                      <div className="grid gap-1.5">
                        {(options.eatingInstructions ?? []).map((i) => (
                          <label
                            key={i.key}
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                              instructionKey === i.key
                                ? 'border-sky-600 bg-sky-50 font-medium text-sky-900'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="notice-eating"
                              value={i.key}
                              checked={instructionKey === i.key}
                              onChange={(e) => setInstructionKey(e.target.value)}
                              className="mr-2 h-4 w-4"
                            />
                            {i.label}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-gray-500">
                        The message tells them to follow their ward nurse if the two differ.
                      </p>
                    </fieldset>
                  )}

                  {error && (
                    <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {error}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={close} className="btn-secondary flex-1 text-sm">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={!ready || busy}
                      className="btn-primary flex-1 text-sm disabled:opacity-50"
                    >
                      {busy ? 'Preparing…' : 'Prepare the message'}
                    </button>
                  </div>
                </>
              )}

              {/* Prepared. The words, then the way to actually deliver them. */}
              {sent && (
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    This is what {sent.to} will read:
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-800">
                    {sent.text}
                  </pre>

                  {/* Honest about what the queue did and did not do. */}
                  <p className="mt-2 text-xs text-gray-500">
                    {sent.queued
                      ? 'Queued to send automatically, and recorded against this case.'
                      : `Recorded against this case, but not sent automatically${
                        sent.queueNote ? ` — ${sent.queueNote}` : ''
                      } Send it yourself with the button below.`}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <a
                      href={sent.handoff}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary flex flex-1 items-center justify-center gap-1.5 text-sm"
                    >
                      <ExternalLink className="h-4 w-4" /> Send on WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(sent.text);
                        setCopied(true);
                      }}
                      className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <button type="button" onClick={reset} className="btn-secondary mt-2 w-full text-sm">
                    Send something else
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
