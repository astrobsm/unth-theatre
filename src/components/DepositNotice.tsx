'use client';

/**
 * The drug-and-consumable deposit notice.
 *
 * Shown at the top of the booking form and of the anaesthesia review, where
 * it is read before anybody starts writing rather than after.
 *
 * OFF UNTIL AN ADMINISTRATOR TURNS IT ON. The notice tells wards to stop
 * handing patients prescriptions, and that instruction is only safe once the
 * hospital is actually supplying the drugs. Announcing it a day early sends
 * a patient away with nothing to buy and nothing issued — so it ships
 * disabled, and Settings decides the day.
 *
 * It renders nothing at all while loading. A notice of this weight appearing
 * a second late, after somebody has started typing, is worse than one that
 * was never there: it reads as something that has just changed.
 */

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';

export default function DepositNotice() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/theatre-settings', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.depositNoticeEnabled && data?.depositNoticeText) {
          setText(String(data.depositNoticeText));
        }
      } catch {
        // Offline, or the settings could not be read. Say nothing rather
        // than guess: a notice shown when it should not be is a patient
        // sent away empty-handed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!text) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4"
    >
      <Megaphone className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
      <p className="text-base font-bold uppercase leading-snug tracking-wide text-amber-900">
        {text}
      </p>
    </div>
  );
}
