'use client';

// ============================================================
// The back link
// ------------------------------------------------------------
// One component, so "back" means the same thing on every screen: the page you
// actually came from, named out loud, with your work saved before you leave.
//
// Reported from theatre on 3 November — press Surgical Count on the Theatre
// Reception board, press back, and you are on Surgery Details, a page you
// were never on. See src/lib/navigation/returnTo.ts for why a hard-coded
// parent cannot be right: these sub-pages are reached from eight places.
//
// THE LABEL IS NOT DECORATION. It is how somebody mid-case can tell, without
// pressing it, whether this will take them back to their board or somewhere
// else. A back link that says "Surgery" and lands on Theatre Reception is
// the same defect wearing different clothes, so the label is derived from
// the destination rather than written by hand at each call site.
//
// BEFORE LEAVING, THE WORK IS SAVED. Pages here save as you type, but a
// debounced save has a window — up to a second and a bit on the operation
// note — in which the text is in the browser and nowhere else. Leaving by a
// link inside the app is a client-side navigation: beforeunload does not
// fire, React unmounts the page, and the pending save goes with it. `onLeave`
// is awaited before navigating, so that window is closed.
// ============================================================

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { readReturnTo, labelForPath } from '@/lib/navigation/returnTo';
import { markReturningTo } from '@/components/ScrollMemory';

interface Props {
  /**
   * Where to go when the caller did not say — a bookmark, a notification
   * link, or a page that has not been taught to pass ?from= yet.
   */
  fallback: string;
  /** Overrides the name worked out from the destination. Rarely needed. */
  label?: string;
  /**
   * Run before navigating: flush a pending save. Return false to stay put
   * (for example, the save failed and the work would be lost).
   *
   * Errors thrown here are deliberately NOT swallowed into a silent
   * navigation — see onClick.
   */
  onLeave?: () => void | boolean | Promise<void | boolean>;
  className?: string;
}

export default function BackLink({ fallback, label, onLeave, className }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [leaving, setLeaving] = useState(false);

  const href = readReturnTo(params, fallback);
  const name = label ?? labelForPath(href);

  const go = async (e: React.MouseEvent) => {
    // Ctrl/cmd/shift-click and middle-click mean "open this somewhere else",
    // and the browser does that better than we can. Left out of this, the
    // handler below would swallow them and open nothing at all.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (leaving) return;

    if (onLeave) {
      setLeaving(true);
      try {
        const ok = await onLeave();
        if (ok === false) {
          setLeaving(false);
          return;
        }
      } catch {
        // The save failed. Going anyway would lose the work silently, which
        // is the failure this exists to prevent; staying leaves it on screen
        // where the page's own error can be seen and the save retried.
        setLeaving(false);
        return;
      }
    }

    // Tells ScrollMemory this is a return, so the page we land on comes back
    // at the position it was left at rather than at the top.
    markReturningTo(href);
    router.push(href);
  };

  return (
    <a
      href={href}
      onClick={go}
      className={
        className
        ?? 'inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline print:hidden'
      }
    >
      <ArrowLeft className="h-4 w-4" />
      {leaving ? 'Saving…' : `Back to ${name}`}
    </a>
  );
}
