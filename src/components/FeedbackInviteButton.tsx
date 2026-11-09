'use client';

/**
 * "Ask how it went."
 *
 * Offered on a case whose care is finished. Mints a one-time anonymous link,
 * shows the message to send with it, and offers the WhatsApp hand-off, the
 * copy, and a QR code for a patient standing at the desk with no phone of
 * their own.
 *
 * THE TOKEN IS SHOWN ONCE AND NEVER AGAIN. Only its hash is stored, so there
 * is no way to reprint it. If a patient loses the link, the honest options are
 * to send the same message again from WhatsApp — where it still is — or to
 * issue a fresh invitation, which this says plainly rather than quietly
 * minting a second one every time the dialog is opened.
 *
 * It will not say what a patient wrote, or whether what they wrote was kind.
 * It says only whether somebody has answered, because that is a fact about the
 * case; what they said is deliberately not joinable back to them, and a screen
 * that undid that would undo the feature.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquareHeart, Loader2, X, ExternalLink, Copy, Check, QrCode, AlertTriangle,
} from 'lucide-react';

interface Props {
  surgeryId: string;
  patientName?: string | null;
  status?: string | null;
}

interface State {
  finished: boolean;
  status: string;
  patientName: string | null;
  contact: { ownerLabel: string; number: string } | null;
  openInvite: { requestedAt: string; requestedByName: string | null; expiresAt: string } | null;
  alreadyAnswered: boolean;
  ttlDays: number;
}

interface Issued {
  url: string;
  text: string;
  to: string | null;
  handoff: string | null;
  ttlDays: number;
}

const FINISHED = ['COMPLETED', 'CANCELLED'];

export default function FeedbackInviteButton({ surgeryId, patientName, status }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /**
   * The QR, drawn HERE and never fetched.
   *
   * An obvious shortcut is a QR service that takes the data in the URL —
   * api.qrserver.com and the rest. That hands this invitation's token to a
   * third party, who could then open the patient's form and submit in their
   * name. The token is the one secret in this whole feature; it does not leave
   * the hospital. `qrcode` is already a dependency and is imported on demand,
   * so the dialog does not carry it until somebody asks for a code.
   */
  const [qr, setQr] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const makeQr = useCallback(async (url: string) => {
    setQrBusy(true);
    setQrFailed(false);
    try {
      const QRCode = (await import('qrcode')).default;
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }));
    } catch {
      // The link itself still works and is on the screen above. A QR that
      // could not be drawn must not read as an invitation that failed.
      setQrFailed(true);
    } finally {
      setQrBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/feedback-invite`, { cache: 'no-store' });
      if (!r.ok) { setLoadFailed(true); return; }
      setState(await r.json());
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [surgeryId]);

  useEffect(() => { if (open && !state && !loading) void load(); }, [open, state, loading, load]);

  const issue = async (replace: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/surgeries/${surgeryId}/feedback-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replace }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? 'An invitation could not be created.');
        return;
      }
      setIssued({ url: d.url, text: d.text, to: d.to, handoff: d.handoff, ttlDays: d.ttlDays });
    } catch {
      setError('Could not reach the server. No invitation was created.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setIssued(null);
    setError(null);
    setCopied(false);
    setShowQr(false);
    // Reload next time: another person may have invited them meanwhile.
    setState(null);
  };

  // Offered only where care has actually ended. Asking a patient who is still
  // on the table buys an answer about half an experience, and the invitation
  // works once.
  if (!FINISHED.includes(String(status ?? ''))) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 transition hover:bg-violet-100"
        title="Give this patient an anonymous link to say how their care went"
      >
        <MessageSquareHeart className="h-3.5 w-3.5" />
        Ask how it went
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-xl">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Ask how the care went</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {patientName ?? state?.patientName ?? 'This patient'} · anonymous, one link, {state?.ttlDays ?? 30} days
                </p>
              </div>
              <button type="button" onClick={close} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {loading && (
                <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking this case…
                </p>
              )}

              {loadFailed && (
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
                  <p className="font-semibold">Could not check this case.</p>
                  <p className="mt-1">
                    That is the lookup failing, not a sign that nobody has been invited.
                  </p>
                  <button type="button" onClick={() => void load()} className="btn-secondary mt-2 text-xs">
                    Try again
                  </button>
                </div>
              )}

              {state && !issued && (
                <>
                  {state.alreadyAnswered && (
                    <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                      This patient has already sent feedback. What they wrote is not linked
                      back to them, so it cannot be shown here — it is on the feedback board
                      with their unit.
                    </p>
                  )}

                  {state.openInvite && (
                    <div className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
                      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                        <AlertTriangle className="h-4 w-4" /> They have already been invited
                      </p>
                      <p className="mt-1 text-sm text-amber-900">
                        On {new Date(state.openInvite.requestedAt).toLocaleDateString()}
                        {state.openInvite.requestedByName && ` by ${state.openInvite.requestedByName}`},
                        open until {new Date(state.openInvite.expiresAt).toLocaleDateString()}.
                        The link itself cannot be shown again — only its fingerprint is kept —
                        so if they lost it, send the original message again, or issue a new one.
                      </p>
                    </div>
                  )}

                  <p className="text-sm text-gray-700">
                    This creates a link that works once and asks for nothing that identifies
                    them. Their unit travels with the answer so it reaches the right team;
                    their name, file number and phone number do not.
                  </p>
                  {state.contact && (
                    <p className="mt-2 text-xs text-gray-500">
                      Can be sent on WhatsApp to {state.contact.ownerLabel}.
                    </p>
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
                      onClick={() => void issue(Boolean(state.openInvite))}
                      disabled={busy}
                      className="btn-primary flex-1 text-sm disabled:opacity-50"
                    >
                      {busy ? 'Creating…' : state.openInvite ? 'Issue a new link' : 'Create the link'}
                    </button>
                  </div>
                </>
              )}

              {issued && (
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Give this to {issued.to ?? 'the patient'}. It works once, for {issued.ttlDays} days.
                  </p>

                  <p className="mt-2 break-all rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[13px] font-medium text-violet-900">
                    {issued.url}
                  </p>

                  <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-800">
                    {issued.text}
                  </pre>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {issued.handoff ? (
                      <a
                        href={issued.handoff}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary flex flex-1 items-center justify-center gap-1.5 text-sm"
                      >
                        <ExternalLink className="h-4 w-4" /> Send on WhatsApp
                      </a>
                    ) : (
                      // Not an error. A patient with no phone is shown the QR
                      // code or writes the link down.
                      <p className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        No WhatsApp number on file — show the QR code or write the link down.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(issued.text);
                        setCopied(true);
                      }}
                      className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showQr;
                        setShowQr(next);
                        if (next && !qr && !qrBusy) void makeQr(issued.url);
                      }}
                      className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
                    >
                      <QrCode className="h-4 w-4" /> {showQr ? 'Hide code' : 'QR code'}
                    </button>
                  </div>

                  {showQr && (
                    <div className="mt-3 flex flex-col items-center rounded-lg border border-gray-200 p-3">
                      {qrBusy && (
                        <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" /> Drawing the code…
                        </p>
                      )}
                      {qrFailed && (
                        <p className="py-4 text-center text-sm text-gray-600">
                          The code could not be drawn. The link above still works — the
                          patient can type it in or you can send it on WhatsApp.
                        </p>
                      )}
                      {qr && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr} alt="QR code for the feedback link" width={220} height={220} />
                          <p className="mt-2 text-center text-xs text-gray-500">
                            Hold this up for the patient to scan with their phone camera.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-gray-500">
                    Keep this screen open until it is sent. The link cannot be shown again —
                    only its fingerprint is stored, which is what stops anybody at the
                    hospital opening the patient&apos;s form.
                  </p>

                  <button type="button" onClick={close} className="btn-secondary mt-3 w-full text-sm">
                    Done
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
