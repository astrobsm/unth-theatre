'use client';

// ============================================================
// The Wi-Fi captive portal — one form, two doors
// ------------------------------------------------------------
// A staff member joins UNTH-THEATRE-ORM, the MikroTik hotspot intercepts their
// first request and sends them here with its own parameters attached. They
// enter their ORM username (or phone number) and password once, and:
//
//   1. the application signs them in, setting the ORM session cookie, and
//   2. the same credentials are posted to the hotspot, which asks the RADIUS
//      bridge, which asks this same database — and the network opens.
//
// The order matters. The app sign-in happens FIRST, because it is the one that
// can report a useful error while the browser is still on this page. Once the
// hotspot form is submitted the browser leaves for the router, and anything
// that goes wrong after that is reported by the router in its own words.
//
// WHY THIS PAGE MUST BE IN THE WALLED GARDEN
//
// Before authenticating, a hotspot client can reach nothing. The router must be
// told to allow this host through in advance, or staff meet a portal that
// cannot load the portal. The commands are in scripts/local-server/README.md.
// ============================================================

import { Suspense, useEffect, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Lock, Wifi, AlertCircle, Eye, EyeOff } from 'lucide-react';

/** Remembers the tick itself, so unticking it does not have to be done twice. */
const KEEP_KEY = 'orm.keepOnWifi';

function PortalForm() {
  const params = useSearchParams();

  // MikroTik substitutes these into its redirect. `link-login-only` is the URL
  // its login form must be posted to.
  const linkLoginOnly = params.get('link-login-only') || '';
  const routerError = params.get('error') || '';
  const mac = params.get('mac') || '';

  // Where the router sends the browser once the network login succeeds.
  //
  // NOT `link-orig`, which is what MikroTik offers and what this used to use.
  // On a captive portal link-orig is never a page anyone wanted: it is whatever
  // connectivity check the phone fired off in the background —
  // connectivitycheck.gstatic.com and friends — so honouring it dumps the user
  // on a blank page having just signed in, and the app they were sent here for
  // never appears.
  //
  // And NOT /dashboard either, which is what it was until staff reported the
  // app "flashing and then disappearing". That report was exactly right. The
  // whole of this flow happens inside the operating system's captive-network
  // assistant, and the OS closes that window the moment the phone's
  // connectivity probe succeeds — which is the same moment the router grants
  // access. The dashboard was loading correctly into a window already
  // condemned. Its cookie jar dies with it too, so the session set below is not
  // one Safari or Chrome can ever see.
  //
  // So the destination is a page whose only job is to get the app open
  // somewhere that survives, carrying a one-time token that moves the session
  // across. See lib/hotspot/handoff.ts.
  //
  // Built from the current origin rather than hardcoded, so this keeps working
  // if the hospital moves to a different hostname or to https.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep this device on the network.
  //
  // DEFAULTS TO ON, which is a decision and not a default-by-accident. The
  // request that produced this was that staff stop meeting the portal every
  // morning, and an opt-in box most people never see would not change that
  // for anybody. The person who does not want it unticks it, once, and the
  // choice is remembered below.
  const [keepConnected, setKeepConnected] = useState(true);
  useEffect(() => {
    try {
      // Only an explicit "no" overrides the default. An empty store — a new
      // phone, a cleared browser — means nobody has said anything yet.
      if (localStorage.getItem(KEEP_KEY) === '0') setKeepConnected(false);
    } catch {
      /* captive-portal browsers may refuse storage entirely */
    }
  }, []);

  // With no link-login-only the page was opened directly rather than by the
  // hotspot. Signing into the app still works; the network part cannot.
  const viaHotspot = useMemo(() => linkLoginOnly.startsWith('http'), [linkLoginOnly]);

  useEffect(() => {
    if (routerError) setError(routerError);
  }, [routerError]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // 1. The application. Errors here are legible and worth showing.
    const res = await signIn('credentials', {
      username: identifier.trim(),
      password,
      redirect: false,
    });

    if (!res?.ok) {
      // NextAuth passes our own message through, e.g. the one telling somebody
      // with duplicated accounts to use their username instead.
      setError(res?.error || 'Could not sign in. Check your details and try again.');
      setBusy(false);
      return;
    }

    // 2. Whether this device is to be kept on the network.
    //
    // RECORDED HERE, in the seconds between the app sign-in succeeding and the
    // browser leaving for the router, because this is the last moment anything
    // of ours runs. The router asks RADIUS next, and RADIUS reads this row to
    // decide which hotspot profile the session belongs to — which is what
    // decides whether the phone is remembered. A row written afterwards would
    // be read for the first time a week later.
    //
    // Never fatal, and deliberately not reported. The cost of a failure is one
    // extra sign-in next week; refusing somebody the hospital network over it
    // would be absurd.
    try {
      localStorage.setItem(KEEP_KEY, keepConnected ? '1' : '0');
    } catch {
      /* storage unavailable: the choice still applies to this sign-in */
    }
    try {
      await fetch('/api/hotspot/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, remember: keepConnected }),
      });
    } catch {
      /* offline or slow — carry on and connect them */
    }

    // 3. A one-time link that can carry this session into the real browser.
    //
    // Minted HERE, in the two seconds between signing in and leaving for the
    // router, because this is the only moment the session exists in the
    // captive-portal browser. A failure is not fatal: the person still gets
    // online and still reaches the app, they just have to sign in once more.
    // Refusing to connect them to hospital Wi-Fi over it would be absurd.
    const base = origin || window.location.origin;
    let destination = `${base}/hotspot/connected`;
    try {
      const handoff = await fetch('/api/hotspot/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac }),
      });
      if (handoff.ok) {
        const { token } = await handoff.json();
        if (token) destination = `${base}/hotspot/connected?t=${encodeURIComponent(token)}`;
      }
    } catch {
      /* offline or slow — carry on without the handoff */
    }

    // 4. The network. Submitting a real form (not fetch) because the browser
    // must follow the router's redirect for the session to be established
    // against this client.
    if (viaHotspot) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = linkLoginOnly;
      for (const [name, value] of Object.entries({
        username: identifier.trim(),
        password,
        // Where the router sends the browser once it grants access.
        dst: destination,
      })) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      return;
    }

    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/unth-orm-logo.png" alt="" className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900">UNTH Theatre Wi-Fi</h1>
          <p className="text-sm text-gray-600 mt-1">
            Sign in with your ORM details to join the network.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-800 mb-1">
              Username or phone number
            </label>
            <input
              id="identifier"
              name="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. jdoe or 08031234567"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1">
              Password
            </label>
            {/*
              The eye is not a convenience here.

              This password is typed on a phone, one-handed, often in a
              corridor, into a captive-portal window that shows no error until
              the whole form is submitted and the browser has left for the
              router. A mistyped character costs a full round trip to find out
              about. Being able to read back what you typed is the cheapest
              fix there is, and the main application login already has it —
              this page was simply never given the same.
            */}
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-12 text-base focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              The same password you use for the ORM application.
            </p>
          </div>

          {/*
            Staying on the network.

            WHAT IT HONESTLY DOES, because a promise a router cannot keep is
            worse than no promise: the phone is recognised by the hotspot when
            it comes back into range, so the portal does not appear. It does
            NOT make the phone join the Wi-Fi — only the handset can do that,
            from its own network settings, and only if the network is saved
            there. Both sentences are below, in that order.

            THE SHARED-HANDSET CAVEAT is stated rather than buried. Eight
            phones are shared between ten people in this theatre, and one of
            them has signed in as two different nurses five hours apart. The
            network remembers the DEVICE; the ORM application still asks who
            is holding it. Somebody reading this box needs to know that is the
            arrangement, not discover it.
          */}
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <input
              type="checkbox"
              name="keepConnected"
              checked={keepConnected}
              onChange={(e) => setKeepConnected(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-shrink-0 accent-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-emerald-900">
                Keep this phone signed in to the Wi-Fi
              </span>
              <span className="block text-xs text-emerald-800 mt-0.5">
                You will not be asked for your password again on this device.
                Whenever it is back in the theatre and joins the network, it
                reconnects on its own.
              </span>
              <span className="block text-xs text-emerald-700 mt-1">
                Leave this unticked on a phone you share.
              </span>
            </span>
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 text-white font-medium py-3 hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {busy ? 'Signing in…' : 'Connect and sign in'}
          </button>

          {!viaHotspot && (
            <p className="text-xs text-gray-500 text-center">
              Opened directly rather than by the Wi-Fi. This will sign you into the
              application, but will not connect you to the network.
            </p>
          )}
        </form>

        {/*
          The half of "reconnects automatically" that no web page can do.

          Said only when the person has asked to be kept signed in, because
          that is the moment the expectation is set — and the moment they
          would otherwise be let down by it. A phone that has not saved
          UNTH-THEATRE-ORM will not rejoin whatever the router remembers, and
          the person would reasonably blame this page for it.
        */}
        {keepConnected && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
            <p className="text-xs text-gray-700">
              <strong className="text-gray-900">One thing to check on the phone itself.</strong>{' '}
              Open its Wi-Fi settings, tap <strong>UNTH-THEATRE-ORM</strong>, and make
              sure <strong>Auto-join</strong> (iPhone) or <strong>Connect
              automatically</strong> (Android) is on. No website can set that — the
              hospital network remembers your phone, but only the phone can decide
              to join.
            </p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2">
          <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            This connects you to the hospital network <strong>and</strong> the ORM
            application at the same time. Do not share your password — everything
            recorded under your name is attributed to you.
          </p>
        </div>

        {mac && <p className="text-[10px] text-gray-400 text-center mt-3">Device {mac}</p>}
      </div>
    </div>
  );
}

export default function HotspotLoginPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>}>
      <PortalForm />
    </Suspense>
  );
}
