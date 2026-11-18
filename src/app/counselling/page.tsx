'use client';

// ============================================================
// The page a patient lands on from their WhatsApp message
// ------------------------------------------------------------
// Public and token-gated. Read on a phone, on mobile data, often by somebody
// who is anxious and not used to reading medical documents — so: one column,
// large type, no app chrome, no login, nothing to tap before the words start.
//
// THE REFUSAL IS SHOWN ABOVE A PAGE THAT STILL WORKS. An expired or withdrawn
// link does not produce an error screen; it produces an explanation and the
// instruction to ask the ward. The same shape as /feedback, for the same
// reason: a patient who lands on a browser error concludes the hospital is
// broken and tells nobody.
//
// THE TWO BOXED SECTIONS are eating and drinking, and the warning signs. They
// are tinted and bordered because they are the two that cause harm when
// skimmed — one decides whether tomorrow's operation is safe, the other
// whether somebody comes back in time.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, Loader2, Printer } from 'lucide-react';
import type { Leaflet } from '@/lib/counselling/leaflet';

export const dynamic = 'force-dynamic';

export default function CounsellingPage() {
  const [leaflet, setLeaflet] = useState<Leaflet | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Read client-side: the token must not travel through a server component
    // render and end up in a log.
    const t = new URLSearchParams(window.location.search).get('t') ?? '';
    (async () => {
      try {
        const res = await fetch(`/api/counselling?t=${encodeURIComponent(t)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data?.ok && data.leaflet) setLeaflet(data.leaflet as Leaflet);
        else setProblem(data?.message ?? 'This link could not be opened.');
      } catch {
        setProblem(
          'We could not open your information sheet. Please check your connection and try '
          + 'again, or ask your ward nurse for a printed copy.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const download = useCallback(async () => {
    if (!leaflet) return;
    setSaving(true);
    try {
      // Loaded only when asked for: jsPDF is large and most readers will
      // simply read the page on the phone they opened it on.
      const { downloadLeafletPdf } = await import('@/lib/counselling/leafletPdf');
      await downloadLeafletPdf(leaflet);
    } catch {
      setProblem('The PDF could not be made on this device. You can still print this page.');
    } finally {
      setSaving(false);
    }
  }, [leaflet]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-5 py-8 print:px-0 print:py-0">
        <header className="border-b border-gray-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            University of Nigeria Teaching Hospital, Ituku-Ozalla
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {leaflet?.title ?? 'Information about your operation'}
          </h1>
          {leaflet?.patientName && (
            <p className="mt-1 text-sm text-gray-700">
              For {leaflet.patientName}
              {leaflet.patientIdentifier ? ` · ${leaflet.patientIdentifier}` : ''}
            </p>
          )}
        </header>

        {problem && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{problem}</span>
            </p>
          </div>
        )}

        {leaflet && (
          <>
            <div className="mt-5 rounded-xl bg-gray-50 p-4">
              <dl className="space-y-1.5">
                {leaflet.facts.map((f) => (
                  <div key={f.label} className="flex flex-wrap gap-x-2 text-sm">
                    <dt className="font-semibold text-gray-600">{f.label}:</dt>
                    <dd className="text-gray-900">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="mt-5 rounded-xl border border-gray-300 p-4 text-sm leading-relaxed text-gray-800">
              {leaflet.purpose}
            </p>

            {/* Offered early. A patient on a borrowed phone wants it saved
                before they hand the phone back. */}
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={download}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {saving ? 'Preparing…' : 'Save as PDF'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>

            {leaflet.sections.map((s) => (
              <section
                key={s.id}
                className={
                  s.emphasis
                    ? 'mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4'
                    : 'mt-6'
                }
              >
                <h2
                  className={
                    s.emphasis
                      ? 'text-lg font-bold text-red-900'
                      : 'text-lg font-bold text-gray-900'
                  }
                >
                  {s.heading}
                </h2>
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className={`mt-2 text-[15px] leading-relaxed ${
                      s.emphasis ? 'text-red-950' : 'text-gray-800'
                    }`}
                  >
                    {p}
                  </p>
                ))}
                {(s.points?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {s.points!.map((p, i) => (
                      <li
                        key={i}
                        className={`flex gap-2 text-[15px] leading-relaxed ${
                          s.emphasis ? 'text-red-950' : 'text-gray-800'
                        }`}
                      >
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <section className="mt-6">
              <h2 className="text-lg font-bold text-gray-900">Questions to bring with you</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-800">
                {leaflet.questionsPrompt}
              </p>
            </section>

            <p className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-[15px] font-semibold text-red-900">
              {leaflet.emergencyLine}
            </p>

            <footer className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">
              <p>{leaflet.privacyNote}</p>
              <p className="mt-1">Information sheet version {leaflet.version}.</p>
              <p className="mt-1">
                This sheet does not replace what your surgeon tells you about your own case.
              </p>
            </footer>
          </>
        )}

        {!leaflet && !problem && (
          <p className="mt-6 text-sm text-gray-600">
            Please ask your ward nurse for a copy of your information sheet.
          </p>
        )}
      </div>
    </main>
  );
}
