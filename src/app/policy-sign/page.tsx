'use client';

/**
 * A committee member reading the revised policy and signing it, on a phone.
 *
 * WHERE THIS PAGE LIVES AND WHY. Outside /dashboard, like /policy-review,
 * /onboarding and /feedback, because most of this committee are heads of
 * department with no ORM account. The link arrives in WhatsApp and must open
 * without a sign-in.
 *
 * THEY READ BEFORE THEY SIGN, and the page is built in that order: the revised
 * policy and the change log come first, the signature box is at the bottom. A
 * signature control above the document invites a signature without the
 * document, which is the one outcome that would make this whole module
 * pointless.
 *
 * THE CANVAS
 *
 * Pointer events, not mouse and touch separately: a single set of handlers
 * covers finger, stylus and mouse, and `touch-action: none` stops the page
 * scrolling underneath the stroke — without it, signing with a finger on a
 * phone scrolls the article instead of drawing, which reads as the box being
 * broken.
 *
 * The backing store is sized to the element's own CSS size multiplied by the
 * device pixel ratio, and the context scaled to match, or every stroke on a
 * modern phone lands offset from the finger drawing it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  PenLine,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

import PolicyMarkdown from '@/components/policy/PolicyMarkdown';
import { signProblem } from '@/lib/policy/signature';

interface SignState {
  ok: boolean;
  problem?: string;
  message?: string | null;
  alreadySigned?: boolean;
  signer?: {
    name: string; role: string | null; unit: string | null;
    signedAt: string | null; signedName: string | null;
  };
  policy?: {
    title: string; reviewVersion: string | null; version: string;
    body: string; changeLog: string; generatedAt: string;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local parts, never toLocaleDateString: the two nodes print it differently. */
const dayText = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export default function PolicySignPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<SignState | null>(null);
  const [loading, setLoading] = useState(true);
  const [typedName, setTypedName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  // The token is read from the URL on the client and never put into a route
  // parameter, so it does not end up in a server access log.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t');
    setToken(t);
  }, []);

  useEffect(() => {
    if (token === null) return;
    (async () => {
      try {
        const res = await fetch(`/api/policy/sign?t=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const body = await res.json();
        setState(body as SignState);
      } catch {
        setError('Could not open the document. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  /** Size the backing store to the element, or strokes land off the finger. */
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    if (!state?.ok || state.alreadySigned) return;
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
    return () => window.removeEventListener('resize', sizeCanvas);
  }, [state, sizeCanvas]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture, so a stroke that wanders outside the box keeps drawing instead
    // of ending mid-signature.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointAt(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasStroke(true);
  };

  const extendStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointAt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endStroke = () => { drawing.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const signatureDataUrl = (): string => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return '';
    return canvas.toDataURL('image/png');
  };

  const sign = async () => {
    if (!token || !state?.signer) return;

    // The same check the server runs. This one exists to tell them what is
    // wrong while they are looking at it; the server's is the rule.
    const problem = signProblem({
      typedName,
      signature: signatureDataUrl(),
      nameOnRecord: state.signer.name,
      confirmed,
    });
    if (problem) { setError(problem); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/policy/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          typedName: typedName.trim(),
          signature: signatureDataUrl(),
          confirmed: true,
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.ok === false) {
        setError(body?.message ?? 'Could not record that signature.');
        return;
      }
      setDone(body.message ?? 'Thank you. Your signature is on the record.');
    } catch {
      setError('Could not record that signature. Please check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Opening the document…</span>
        </div>
      </main>
    );
  }

  // A refusal, in words, on a page that still looks like the hospital's.
  if (!state?.ok) {
    return (
      <main className="min-h-screen bg-slate-50 p-5">
        <div className="mx-auto max-w-lg rounded-xl border border-amber-300 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            This signing link cannot be used
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {state?.message ?? error ?? 'Please ask the Committee Secretariat to send it again.'}
          </p>
        </div>
      </main>
    );
  }

  const { policy, signer } = state;

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 p-5">
        <div className="mx-auto max-w-lg rounded-xl border-2 border-emerald-300 bg-white p-5 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-2 text-base font-bold text-slate-900">Signed</h1>
          <p className="mt-2 text-sm text-slate-700">{done}</p>
          <p className="mt-3 text-xs text-slate-500">
            {policy?.title} · version {policy?.version}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            University of Nigeria Teaching Hospital, Ituku-Ozalla · Theatre Users Committee
          </p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">{policy?.title}</h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Revised after review · version {policy?.version}
            {policy?.generatedAt ? ` · prepared ${dayText(policy.generatedAt)}` : ''}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5">
        {signer && (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-600">
              This document is sent to you for signature because you reviewed the draft.
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{signer.name}</p>
            {(signer.role || signer.unit) && (
              <p className="text-xs text-slate-500">
                {[signer.role, signer.unit].filter(Boolean).join(', ')}
              </p>
            )}
          </section>
        )}

        {state.alreadySigned && (
          <section className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
              <Check className="h-4 w-4" />
              You have already signed this document
            </p>
            <p className="mt-1 text-xs text-emerald-900">{state.message}</p>
            {signer?.signedAt && (
              <p className="mt-1 text-xs text-emerald-900">
                Signed as {signer.signedName} on {dayText(signer.signedAt)}.
              </p>
            )}
          </section>
        )}

        {/* The document first. The signature box is below it, deliberately. */}
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <FileText className="h-4 w-4" />
            What the committee changed, and why
          </h2>
          <div className="mt-2 overflow-x-auto text-xs">
            <PolicyMarkdown markdown={policy?.changeLog ?? ''} highlightPlaceholders={false} />
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">The revised policy in full</h2>
          <div className="mt-2 text-sm">
            <PolicyMarkdown markdown={policy?.body ?? ''} highlightPlaceholders />
          </div>
        </section>

        {!state.alreadySigned && (
          <section className="mt-4 rounded-xl border-2 border-slate-300 bg-white p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <PenLine className="h-4 w-4" />
              Sign
            </h2>

            <label
              className="mt-3 block text-xs font-semibold text-slate-700"
              htmlFor="policy-sign-name"
            >
              Your full name
            </label>
            <input
              id="policy-sign-name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="name"
              placeholder={signer?.name ?? 'Full name'}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <p className="mt-3 text-xs font-semibold text-slate-700">Your signature</p>
            <div className="mt-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
              <canvas
                ref={canvasRef}
                onPointerDown={startStroke}
                onPointerMove={extendStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
                onPointerCancel={endStroke}
                // touch-action: none, or signing with a finger scrolls the page
                // instead of drawing and the box looks broken.
                className="h-40 w-full touch-none rounded-lg"
              />
            </div>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                Sign with your finger or mouse in the box above.
              </p>
              <button
                type="button"
                onClick={clearSignature}
                className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700"
              >
                <RotateCcw className="h-3 w-3" />
                Clear
              </button>
            </div>

            <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0"
              />
              <span>
                I have read the revised policy above and I endorse it as a member of the
                Theatre Users Committee.
              </span>
            </label>

            {error && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void sign()}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              {busy ? 'Recording your signature…' : 'Sign'}
            </button>

            <p className="mt-2 text-[11px] text-slate-500">
              This link is personal to you. Please do not forward it — a colleague signing
              from your link would be recorded as you.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
