'use client';

/**
 * FloatingDock — one owner for every floating widget on the screen.
 *
 * Why this exists
 * ---------------
 * Each floating widget used to position itself: `fixed bottom-4 right-4
 * z-[10004]`, `fixed bottom-20 right-5 z-[55]`, and so on. Nothing coordinated
 * those numbers, so widgets landed on top of each other, swallowed each other's
 * taps, and every new widget had to guess an unused offset. On a phone the
 * radio panel (min(92vw,22rem) — nearly full width) covered the Acknowledge
 * button entirely.
 *
 * Instead, widgets declare WHERE they belong and the dock lays them out. Each
 * anchor is a flex container with a gap, so children stack automatically:
 * nothing overlaps, order is explicit, and adding a widget cannot collide with
 * an existing one. Show/hide a widget and the rest reflow on their own — no
 * offsets to maintain.
 *
 * Usage:
 *   <DockSlot anchor="bottom-right" order={DOCK_ORDER.radio}>…</DockSlot>
 *
 * Widgets keep their own look; they just stop choosing coordinates.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type DockAnchor = 'top-center' | 'bottom-left' | 'bottom-right';

/**
 * Vertical order within an anchor, low number = closest to the screen edge.
 * Named so intent survives reordering, and spaced so widgets can be inserted
 * between existing ones without renumbering.
 */
export const DOCK_ORDER = {
  acknowledge: 10,
  install: 10,
  update: 20,
  mediaHub: 10,
  radio: 20,
  music: 30,
  assistant: 40,
} as const;

const ANCHOR_CLASS: Record<DockAnchor, string> = {
  // Emergency acknowledgement lives top-centre: it is the highest-priority
  // control in the app, it is never covered by the media cluster in the
  // corners, and it stays visible without scrolling.
  'top-center': 'top-0 left-1/2 -translate-x-1/2 flex-col items-center',
  'bottom-left': 'bottom-0 left-0 flex-col-reverse items-start',
  'bottom-right': 'bottom-0 right-0 flex-col-reverse items-end',
};

/** Container is inert; only the widgets inside it receive pointer events. */
const BASE_CLASS =
  'fixed z-[10000] flex gap-3 p-4 pointer-events-none print:hidden max-w-full';

/**
 * Mount once, near the root. Renders the anchor containers that DockSlot
 * portals into.
 */
export function FloatingDockRoot() {
  return (
    <>
      {(Object.keys(ANCHOR_CLASS) as DockAnchor[]).map((anchor) => (
        <div
          key={anchor}
          id={`dock-${anchor}`}
          className={`${BASE_CLASS} ${ANCHOR_CLASS[anchor]}`}
          style={{
            // Respect notches / gesture bars so widgets are never cut off or
            // stranded under the system UI on a phone.
            paddingBottom: anchor === 'top-center' ? undefined : 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            paddingTop: anchor === 'top-center' ? 'calc(1rem + env(safe-area-inset-top, 0px))' : undefined,
          }}
        />
      ))}
    </>
  );
}

/**
 * Places `children` into a dock anchor. Renders nothing until the anchor exists
 * in the DOM, so it is safe during SSR and first paint.
 */
export function DockSlot({
  anchor,
  order = 50,
  children,
}: {
  anchor: DockAnchor;
  order?: number;
  children: React.ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // The dock root mounts in the same commit; retry on the next frame if it is
    // not there yet rather than dropping the widget for the whole session.
    const find = () => document.getElementById(`dock-${anchor}`);
    const el = find();
    if (el) {
      setHost(el);
      return;
    }
    const raf = requestAnimationFrame(() => setHost(find()));
    return () => cancelAnimationFrame(raf);
  }, [anchor]);

  if (!host) return null;

  return createPortal(
    <div className="pointer-events-auto max-w-full" style={{ order }}>
      {children}
    </div>,
    host
  );
}
