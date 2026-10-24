'use client';

/**
 * Honours "Keep me signed in on this device".
 *
 * The session itself is thirty days and always has been, which is why there
 * was never a checkbox: staying signed in was simply what happened. The
 * checkbox is therefore not about EXTENDING anything — it is about being
 * able to say no, on a phone somebody else might pick up.
 *
 *   ticked (the default)  — nothing happens. Thirty days, as before.
 *   unticked              — signed out the next time the app is opened cold.
 *
 * FAILS SAFE TOWARDS STAYING SIGNED IN. It acts only when the flag is
 * explicitly '0'. A missing flag, unreadable storage, a private window, an
 * older install that never wrote one — all of those mean "keep me signed
 * in", because signing a surgeon out mid-list on the strength of a storage
 * read that returned nothing is the far worse failure.
 */

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';

const KEEP_KEY = 'orm.keepSignedIn';
/** Marks this launch as already checked, so navigation does not re-trigger it. */
const LAUNCH_KEY = 'orm.sessionLaunchChecked';

export default function SessionLifetimeGuard() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;

    let keep = '1';
    let alreadyChecked = true;
    try {
      // Absent means keep — see the note above about failing safe.
      keep = localStorage.getItem(KEEP_KEY) ?? '1';
      alreadyChecked = sessionStorage.getItem(LAUNCH_KEY) === '1';
    } catch {
      return; // storage unavailable: do nothing at all
    }

    if (alreadyChecked) return;

    try {
      sessionStorage.setItem(LAUNCH_KEY, '1');
    } catch {
      /* if we cannot mark it, we may re-check on navigation; harmless */
    }

    // sessionStorage is empty on a cold start and survives in-app navigation,
    // which is exactly the distinction between "opened the app" and "moved
    // to another page".
    if (keep === '0') {
      void signOut({ callbackUrl: '/auth/login' });
    }
  }, [status]);

  return null;
}
