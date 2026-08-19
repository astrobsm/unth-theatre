'use client';

// ============================================================
// The last page the captive-portal window ever shows
// ------------------------------------------------------------
// The router sends the browser here once it has granted network access. This
// used to be /dashboard, which is why staff saw the app "flash and disappear":
// the dashboard was being loaded into the operating system's captive-network
// assistant, and the OS closes that window the instant the phone's connectivity
// probe succeeds — which is precisely the moment access is granted.
//
// So this page does not try to be the app. It assumes it is about to be closed
// and spends its one moment getting the app open somewhere that will survive.
//
// IT MUST NOT REDIRECT BY ITSELF. Following the handoff link here would redeem
// the one-time token inside the very window that is about to be destroyed,
// leaving the person with a spent token and no app — the same failure as
// before, wearing a new page. The tap is not laziness; a user gesture is also
// the only thing that lets a link escape into the real browser at all.
// ============================================================

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ExternalLink, Wifi } from 'lucide-react';

function Connected() {
  const params = useSearchParams();
  const token = params.get('t') || '';

  // Built in the browser so this keeps working whatever hostname the hospital
  // serves the app on, exactly as the portal page does.
  const [openUrl, setOpenUrl] = useState('/dashboard');
  useEffect(() => {
    const base = window.location.origin;
    setOpenUrl(token ? `${base}/hotspot/handoff?t=${encodeURIComponent(token)}` : `${base}/dashboard`);
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 grid place-items-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>

        <h1 className="text-xl font-bold text-gray-900">You&rsquo;re connected</h1>
        <p className="text-sm text-gray-600 mt-1.5 mb-6">
          The Wi-Fi is ready. Tap below to open ORM &mdash; it will open in your
          normal browser, already signed in.
        </p>

        {/*
          A real link, opened in a new context. This is the only reliable way out
          of the captive-portal window on both iOS and Android: the system hands
          a user-tapped external link to the actual browser, where the app can
          stay open and where its session will still be there tomorrow.
        */}
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white font-semibold py-3.5 text-base hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <ExternalLink className="w-4 h-4" />
          Open ORM
        </a>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-3.5 text-left flex gap-2.5">
          <Wifi className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">
            This little window closes on its own once your phone notices the
            internet is working &mdash; that is your phone, not the app. If it
            closes before you tap, just open ORM from your home screen; you are
            connected either way.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HotspotConnectedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-gray-500">Connecting&hellip;</div>}>
      <Connected />
    </Suspense>
  );
}
