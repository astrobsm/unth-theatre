'use client';

/**
 * Emergencies that were booked and never started, and the committee
 * invitations waiting to be sent.
 *
 * The system drafts an invitation for each person named on a case that is three
 * hours late. It does NOT send them: calling somebody before a committee is a
 * decision a person takes, and this is where they take it.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, AlertTriangle, Send, Loader2, RefreshCw, CheckCircle2, Clock, MessageCircle,
} from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
import { committeeInvitationWhatsApp } from '@/lib/emergencyEscalationMessages';
import { describeLateness } from '@/lib/emergencyEscalation';

interface Invitation {
  id: string;
  userId: string;
  personName: string;
  roleOnCase: string;
  phoneNumber: string | null;
  message: string;
  appearAt: string | null;
  sentAt: string | null;
  channel: string | null;
}
interface Escalation {
  id: string;
  bookingId: string;
  stage3At: string | null;
  minutesLateAtLastStage: number | null;
  reasonAtLastStage: string | null;
  resolvedAt: string | null;
  booking: {
    patientName: string; folderNumber: string | null; procedureName: string;
    theatreName: string | null; requiredByTime: string | null; requestedAt: string; status: string;
  };
  invitations: Invitation[];
}

const SENDER_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

export default function EmergencyEscalationsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const maySend = !!role && SENDER_ROLES.includes(role);

  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showSent, setShowSent] = useState(false);

  /** One appearance time per case: the committee sees the team together. */
  const [appearAt, setAppearAt] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/emergency-escalation/invitations?sent=${showSent ? 1 : 0}`, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setEscalations(Array.isArray(d.escalations) ? d.escalations : []);
      } else if (r.status === 403) {
        setError('Only an administrator or theatre manager may send committee invitations.');
      }
    } catch {
      setError('Could not load the invitations.');
    } finally {
      setLoading(false);
    }
  }, [showSent]);

  useEffect(() => { void load(); }, [load]);

  const checkNow = async () => {
    setChecking(true); setError('');
    try {
      const r = await fetch('/api/emergency-escalation/run', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'The check failed.'); return; }
      await load();
    } finally {
      setChecking(false);
    }
  };

  const send = async (esc: Escalation, inv: Invitation) => {
    const when = appearAt[esc.id];
    if (!when) {
      setError('Set the date and time they should attend before sending.');
      return;
    }
    setBusy(inv.id); setError('');
    try {
      const r = await fetch('/api/emergency-escalation/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: inv.id, appearAt: when, channel: 'WHATSAPP' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Could not record that as sent.'); return; }

      // Open WhatsApp with the message, the appearance time now in it. The
      // record is written first, so a blocked pop-up cannot leave a message
      // sent and unrecorded.
      const text = committeeInvitationWhatsApp(
        { userId: inv.userId, name: inv.personName, roleOnCase: inv.roleOnCase },
        {
          patientName: esc.booking.patientName,
          folderNumber: esc.booking.folderNumber,
          procedureName: esc.booking.procedureName,
          theatreName: esc.booking.theatreName,
          dueAt: new Date(esc.booking.requiredByTime ?? esc.booking.requestedAt),
          minutesLate: esc.minutesLateAtLastStage ?? 0,
          reasonGiven: esc.reasonAtLastStage,
        },
        new Date(when),
      );
      const link = whatsappLink(inv.phoneNumber, text);
      if (link) window.open(link, '_blank', 'noopener');
      else setError(`${inv.personName} has no phone number on file — the invitation is recorded and is on their dashboard.`);

      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <Link href="/dashboard/emergency-booking" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Emergency board
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <AlertTriangle className="w-7 h-7 text-red-600" /> Emergencies that did not start
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            A booked emergency is expected to start within the hour. After three hours an invitation to
            the Theatre Audit Committee is drafted for everyone named on the case. Nothing is sent until
            you send it.
          </p>
        </div>
        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <button type="button" onClick={() => setShowSent(false)} className={`rounded-lg px-3 py-1.5 ${!showSent ? 'bg-red-600 text-white' : 'border border-gray-300'}`}>To send</button>
        <button type="button" onClick={() => setShowSent(true)} className={`rounded-lg px-3 py-1.5 ${showSent ? 'bg-gray-800 text-white' : 'border border-gray-300'}`}>Already sent</button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-5 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : escalations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-gray-500">
            {showSent ? 'No invitations have been sent.' : 'Nothing outstanding. No emergency has gone three hours without starting.'}
          </div>
        ) : (
          escalations.map((esc) => (
            <div key={esc.id} className="rounded-xl border border-red-200 bg-white">
              <div className="border-b border-gray-100 bg-red-50/60 px-4 py-3">
                <p className="font-semibold text-gray-900">
                  {esc.booking.patientName}
                  {esc.booking.folderNumber && <span className="ml-2 text-xs text-gray-500">{esc.booking.folderNumber}</span>}
                </p>
                <p className="text-sm text-gray-700">{esc.booking.procedureName}{esc.booking.theatreName ? ` · ${esc.booking.theatreName}` : ''}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {esc.minutesLateAtLastStage != null ? describeLateness(esc.minutesLateAtLastStage) : 'late'}
                  </span>
                  <span>status: {esc.booking.status}</span>
                  {esc.resolvedAt && <span className="text-green-700">since started or closed</span>}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {esc.reasonAtLastStage
                    ? <>Reason recorded: <em>{esc.reasonAtLastStage}</em></>
                    : <span className="text-amber-800">No reason was ever recorded for this delay.</span>}
                </p>
              </div>

              {!showSent && (
                <div className="border-b border-gray-100 px-4 py-2">
                  <label className="text-xs font-medium text-gray-600">
                    Date and time to appear before the committee
                    <input
                      type="datetime-local"
                      value={appearAt[esc.id] ?? ''}
                      onChange={(e) => setAppearAt((a) => ({ ...a, [esc.id]: e.target.value }))}
                      className="input-field mt-1 py-1.5 text-sm sm:w-64"
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Added to each message as it is sent. The whole team is asked for the same sitting.
                  </p>
                </div>
              )}

              <div className="divide-y divide-gray-100">
                {esc.invitations.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{inv.personName}</p>
                      <p className="text-xs text-gray-500">
                        {inv.roleOnCase}
                        {inv.phoneNumber ? ` · ${inv.phoneNumber}` : ' · no phone number on file'}
                        {inv.sentAt && ` · sent ${new Date(inv.sentAt).toLocaleString('en-GB')}`}
                        {inv.appearAt && ` · to attend ${new Date(inv.appearAt).toLocaleString('en-GB')}`}
                      </p>
                    </div>
                    {maySend && (inv.sentAt ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-4 w-4" /> Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => send(esc, inv)}
                        disabled={busy === inv.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {busy === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                        Send on WhatsApp
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
