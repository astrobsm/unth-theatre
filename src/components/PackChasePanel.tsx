'use client';

/**
 * Asking the pack provider and the pharmacy to get on with it.
 *
 * The editor beside this one has let the surgical team see and change both
 * lists for some time. What there has never been is a way to chase the two
 * people who have to fill them. On an emergency that is the whole gap: the
 * team is chased, the blood is chased, and the pack is waited for in silence
 * by somebody standing outside a theatre.
 *
 * The telephone numbers are shown BEFORE anything is sent, and they stay on
 * screen whether or not a message is warranted. When the WhatsApp gateway is
 * down — which it has been — the number is the feature and the queued message
 * is the nicety.
 */

import { useCallback, useEffect, useState } from 'react';
import { Phone, MessageCircle, Send, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';
import { packChaseMessage, type PackChaseState, type PackList } from '@/lib/packs/chase';

interface Recipient {
  id: string;
  fullName: string;
  role: string;
  phoneNumber: string | null;
  list: PackList;
}

interface ChasePayload {
  state: PackChaseState;
  summary: string;
  canChase: boolean;
  cooldownMinutes: number;
  lastChasedAt: string | null;
  lastChasedBy: string | null;
  cooldown: string | null;
  recipients: Recipient[];
  surgery: {
    procedureName: string | null;
    theatreName: string | null;
    patientName: string | null;
    folderNumber: string | null;
  };
}

export default function PackChasePanel({
  surgeryId,
  emergency = false,
  priority = null,
  requiredBy = null,
  onChased,
}: {
  surgeryId: string;
  emergency?: boolean;
  priority?: string | null;
  requiredBy?: string | null;
  onChased?: () => void;
}) {
  const [data, setData] = useState<ChasePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/pack/chase`, { cache: 'no-store' });
      if (!r.ok) return;
      setData(await r.json());
    } catch {
      /* the panel is additive; its absence must not break the dialog */
    } finally {
      setLoading(false);
    }
  }, [surgeryId]);

  useEffect(() => { void load(); }, [load]);

  const chase = async () => {
    setSending(true); setError(null); setResult(null);
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/pack/chase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'The chase could not be sent.'); return; }
      setResult(d.message ?? 'Sent.');
      setNote('');
      onChased?.();
      await load();
    } catch {
      setError('The chase could not be sent. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Checking what is outstanding…</p>;
  }
  if (!data) return null;

  const { state, recipients, surgery } = data;

  /** The message as the provider will read it — built here so the wa.me
   *  fallback carries exactly what the queued message does. */
  const textFor = (list: PackList) => packChaseMessage({
    list,
    state,
    patientName: surgery.patientName,
    folderNumber: surgery.folderNumber,
    procedureName: surgery.procedureName,
    theatreName: surgery.theatreName,
    requiredBy: requiredBy ? new Date(requiredBy) : null,
    emergency,
    priority,
    fromName: 'the theatre team',
  }) + (note.trim() ? `\n\n"${note.trim()}"` : '');

  const blocked = !state.worth || !!data.cooldown || !data.canChase;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-orange-900">Chase the providers</p>
          <p className="text-xs text-orange-900">{data.summary}</p>
        </div>
      </div>

      {/* What each side still owes, counted separately — the pharmacist cannot
          do anything about a missing drape and vice versa. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-white p-2 ring-1 ring-orange-200">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Consumables</p>
          <p className="text-sm font-semibold text-gray-900">
            {state.consumables.outstanding} of {state.consumables.total} outstanding
          </p>
        </div>
        <div className="rounded bg-white p-2 ring-1 ring-orange-200">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Pharmacy</p>
          <p className="text-sm font-semibold text-gray-900">
            {state.pharmacy.outstanding} of {state.pharmacy.total} outstanding
          </p>
        </div>
      </div>

      {/* Who to ring. Always shown, even when a message is not warranted. */}
      {recipients.length ? (
        <div className="space-y-1.5">
          {recipients.map((p) => {
            const wa = whatsappChatLink(p.phoneNumber, textFor(p.list));
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-1.5 rounded bg-white px-2 py-1.5 ring-1 ring-orange-200">
                <span className="text-xs font-medium text-gray-900">{p.fullName}</span>
                <span className="text-[11px] text-gray-500">{p.role.replace(/_/g, ' ').toLowerCase()}</span>
                {p.phoneNumber ? (
                  <span className="ml-auto flex items-center gap-1">
                    <a
                      href={`tel:${p.phoneNumber}`}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800 hover:bg-gray-200"
                    >
                      <Phone className="h-3 w-3" />{p.phoneNumber}
                    </a>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 hover:bg-green-200"
                      >
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                  </span>
                ) : (
                  <span className="ml-auto text-[11px] text-gray-500">no number on file</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-orange-900">
          No pack provider or pharmacist account is approved on the system, so there is nobody
          to write to. The careline numbers at the top of every dashboard still reach them.
        </p>
      )}

      {state.problem ? (
        <p className="flex items-start gap-1.5 text-xs text-orange-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {state.problem}
        </p>
      ) : (
        <>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — anything they should know (e.g. “patient already in the room”)"
            className="w-full rounded border border-orange-200 px-2 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={chase}
              disabled={sending || blocked}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Chase now'}
            </button>
            {!data.canChase && (
              <span className="text-xs text-orange-900">Your role cannot send a chase.</span>
            )}
            {data.cooldown && <span className="text-xs text-orange-900">{data.cooldown}</span>}
          </div>
        </>
      )}

      {data.lastChasedAt && (
        <p className="text-[11px] text-gray-600">
          Last chased {new Date(data.lastChasedAt).toLocaleString()}
          {data.lastChasedBy ? ` by ${data.lastChasedBy}` : ''}.
        </p>
      )}

      {result && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{result}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
