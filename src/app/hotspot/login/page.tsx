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
import { Loader2, Lock, Wifi, AlertCircle } from 'lucide-react';

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
  // Built from the current origin rather than hardcoded, so this keeps working
  // if the hospital moves to a different hostname or to https.
  const [appDestination, setAppDestination] = useState('/dashboard');
  useEffect(() => {
    setAppDestination(`${window.location.origin}/dashboard`);
  }, []);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // 2. The network. Submitting a real form (not fetch) because the browser
    // must follow the router's redirect for the session to be established
    // against this client.
    if (viaHotspot) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = linkLoginOnly;
      for (const [name, value] of Object.entries({
        username: identifier.trim(),
        password,
        // The router redirects here after it grants network access. The app
        // session cookie was set moments ago, so the dashboard opens already
        // signed in — which is the whole point of doing both in one form.
        dst: appDestination,
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
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              The same password you use for the ORM application.
            </p>
          </div>

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
