'use client';

// ============================================================
// Coming back to the same place on the page, not just the same page
// ------------------------------------------------------------
// Half of "back took me somewhere I had never been" is the destination, which
// BackLink fixes. The other half is arriving at the right page scrolled to
// the top of it: a scrub nurse who opened a checklist from the eleventh case
// on the board comes back and has to find case eleven again.
//
// The position is written down as you scroll, not when you leave. Leaving
// happens in several ways — a link, the browser's own back button, the app
// being closed — and only one of them gives us a chance to run code.
//
// IT ONLY RESTORES AFTER A BACK LINK, never on an ordinary visit. Opening the
// theatre board fresh should start at the top; silently scrolling somebody
// halfway down a list they have just opened is its own kind of lost.
// ============================================================

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const posKey = (path: string) => `orm.scroll:${path}`;
const RETURNING_KEY = 'orm.returningTo';

/** Called by BackLink just before it navigates. */
export function markReturningTo(href: string): void {
  try {
    sessionStorage.setItem(RETURNING_KEY, href);
  } catch {
    // Private browsing, or storage full. Losing the scroll position is a
    // small thing; throwing out of a navigation is not.
  }
}

export default function ScrollMemory() {
  const pathname = usePathname();

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      // One write per painted frame. A scroll event can fire sixty times a
      // second and sessionStorage is synchronous.
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          sessionStorage.setItem(posKey(pathname), String(Math.round(window.scrollY)));
        } catch { /* see markReturningTo */ }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem(RETURNING_KEY);
      if (target) sessionStorage.removeItem(RETURNING_KEY);
    } catch { return; }
    if (!target || target.split('?')[0] !== pathname) return;

    let y = 0;
    try { y = Number(sessionStorage.getItem(posKey(pathname)) || 0); } catch { return; }
    if (!y) return;

    // The page we are returning to fetches its list before there is anything
    // to scroll through, so scrolling once, now, would scroll an empty page.
    // Wait for the page to be tall enough, and give up rather than fight a
    // list that came back shorter than it was.
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (document.documentElement.scrollHeight >= y + window.innerHeight) {
        window.scrollTo(0, y);
        clearInterval(id);
      } else if (tries >= 30) {
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [pathname]);

  return null;
}
