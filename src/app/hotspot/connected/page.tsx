// ============================================================
// The last page the captive-portal window ever shows
// ------------------------------------------------------------
// The router sends the browser here the moment it grants network access — which
// is the same moment the phone's connectivity probe starts succeeding and the
// operating system decides to close its captive-network assistant. This page
// has roughly one second to exist, and it must spend it escaping.
//
// THREE THINGS THIS PAGE MUST NOT DO, all learned the hard way:
//
//   IT MUST NOT NEED JAVASCRIPT TO RENDER. The first version was a client
//   component. It had to download a bundle and hydrate React before its button
//   existed, and in a window that lives a second it simply never appeared —
//   staff reported the app "still disappearing", and they were right. This is a
//   SERVER component: the HTML that arrives is already the whole page, and the
//   escape below runs as the parser reaches it, before React exists.
//
//   IT MUST NOT WAIT FOR A TAP. There is not time for one. The tap is kept, but
//   only as the fallback for when the automatic escape is refused.
//
//   IT MUST NOT REDIRECT ITSELF TO THE HANDOFF. Following that link *in this
//   window* would spend the one-time token inside the window about to be
//   destroyed, leaving the person with a dead token and no app. Every escape
//   below hands the URL to a DIFFERENT application — that is the whole point.
//
// WHY NOT LAUNCH THE INSTALLED ANDROID APP
//
// There is an APK, and an intent naming its package would launch it. It would
// also be wrong: the native shell is pinned to the CLOUD deployment, so
// launching it inside the hospital would quietly put a theatre nurse on the
// other database. The intent therefore names no package and resolves to the
// default browser, which loads this server. Being on the correct data matters
// considerably more than which icon appears.
// ============================================================

import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default function HotspotConnectedPage({
  searchParams,
}: {
  searchParams: { t?: string | string[] };
}) {
  const h = headers();
  const host = h.get('host') ?? 'unth-theatre.link';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const ua = h.get('user-agent') ?? '';

  const raw = searchParams?.t;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  const path = `/hotspot/handoff${token ? `?t=${encodeURIComponent(token)}` : ''}`;
  const httpsUrl = `${proto}://${host}${path}`;

  const isAndroid = /Android/i.test(ua);
  const isApple = /iPhone|iPad|iPod/i.test(ua);

  // The escape, chosen by platform on the SERVER so the decision is already
  // made by the time the HTML lands.
  //
  //   Android — an intent: URL is handed to the system, which resolves it to
  //   the default browser. No package named, deliberately (see the header).
  //   browser_fallback_url means a device that cannot resolve the intent still
  //   lands on the right page rather than nowhere.
  //
  //   iPhone/iPad — x-safari-https: is the long-standing way to force Safari to
  //   open a URL from inside a web view, which is exactly what the captive
  //   portal assistant is. It is not in any specification, and if the device
  //   ignores it nothing breaks: the page stays put and the button below is
  //   still there.
  const escapeUrl = isAndroid
    ? `intent://${host}${path}#Intent;scheme=${proto};S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`
    : isApple
      ? `x-safari-${proto}://${host}${path}`
      : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
      {/*
        Inline, and first. This runs while the document is still parsing —
        before hydration, before any bundle is fetched — which is the only
        timing that fits inside the life of this window.

        try/catch because an unsupported scheme throws on some builds, and a
        thrown error must not stop the visible fallback from rendering.
      */}
      {escapeUrl && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{window.location.replace(${JSON.stringify(escapeUrl)});}catch(e){}`,
          }}
        />
      )}

      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 grid place-items-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-emerald-600"
               aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900">You&rsquo;re connected</h1>
        <p className="text-sm text-gray-600 mt-1.5 mb-6">
          Opening ORM&hellip; if it does not open by itself, tap below.
        </p>

        {/*
          A plain anchor, present in the delivered HTML and tappable the instant
          it is painted. Not a button, not a client component, nothing to wait
          for. target=_blank because a user-tapped external link is the one
          thing the assistant will reliably hand to the real browser.
        */}
        <a
          href={httpsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white font-semibold py-3.5 text-base hover:bg-emerald-700"
        >
          Open ORM
        </a>

        <p className="text-xs text-gray-500 mt-5 leading-relaxed">
          This small window belongs to your phone, not to ORM, and it closes by
          itself once the phone notices the internet is working. You are
          connected either way &mdash; if it vanishes, open{' '}
          <span className="font-medium text-gray-700">{host}</span> in your
          browser and you will already be signed in.
        </p>

        <noscript>
          <p className="text-xs text-gray-500 mt-3">
            <a href={httpsUrl} className="underline">Tap here to open ORM.</a>
          </p>
        </noscript>
      </div>
    </div>
  );
}
