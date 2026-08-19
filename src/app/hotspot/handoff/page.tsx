'use client';

// ============================================================
// Redeeming the Wi-Fi handoff, in the browser the person will actually use
// ------------------------------------------------------------
// Opened by the "Open ORM" button on /hotspot/connected. By the time this runs
// we are out of the captive-portal window and in Safari or Chrome, where a
// session is worth having because it will still be there tomorrow.
//
// The token is spent here and only here. See lib/hotspot/handoff.ts.
// ============================================================

import { Suspense, useEffect, useRef, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';

function Redeem() {
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const token = params.get('t') || '';
  const [error, setError] = useState<string | null>(null);

  // Strict mode mounts effects twice in development. Without this the second
  // run redeems a token the first run already spent, and the page reports a
  // failure for a handoff that actually worked.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (status === 'loading') return;

    // Already signed in on this browser — the common case when somebody taps a
    // link twice, or returns to it later. There is nothing to redeem and no
    // reason to burn a token; just go.
    if (status === 'authenticated') {
      started.current = true;
      router.replace('/dashboard');
      return;
    }

    if (!token) {
      setError('This link is not valid. Sign in with your ORM details to continue.');
      return;
    }

    started.current = true;
    (async () => {
      const res = await signIn('handoff', { token, redirect: false });
      if (res?.ok) {
        // replace, not push: the handoff URL holds a spent token and must not
        // sit in history where Back would return to a failure page.
        router.replace('/dashboard');
      } else {
        setError(res?.error || 'This link could not be used. Sign in with your ORM details to continue.');
      }
    })();
  }, [token, status, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 grid place-items-center mb-3">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Sign in to continue</h1>
          <p className="text-sm text-gray-600 mt-1.5 mb-5">{error}</p>
          <a
            href="/auth/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 text-white font-medium py-3 hover:bg-emerald-700"
          >
            Go to sign in
          </a>
          <p className="text-xs text-gray-500 mt-4">
            Your Wi-Fi connection is not affected &mdash; you are still online.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 grid place-items-center p-4">
      <div className="text-center">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-3" />
        <p className="text-sm text-gray-600">Opening ORM&hellip;</p>
      </div>
    </div>
  );
}

export default function HotspotHandoffPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-gray-500">Opening&hellip;</div>}>
      <Redeem />
    </Suspense>
  );
}
