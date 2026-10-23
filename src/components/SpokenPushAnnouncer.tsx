'use client';

// ============================================================
// Reading a push notification out loud
// ------------------------------------------------------------
// A notification tone says that something happened and nothing about what,
// so whoever hears it stops and looks. The words are already in the push.
// This reads them, in the same voice the theatre radio uses.
//
// WHAT THIS CANNOT DO, and the limit is the operating system's rather than
// a shortcoming here: speak when the app is CLOSED. A closed app has no
// process to run a voice in, and FCM's sound field takes the name of a file
// bundled in the APK, never text. So a closed phone gets the tone and the
// written notice, and the words are spoken the moment somebody opens it.
//
// NEVER OVER THE RADIO. The player emits radio:active and radio:idle around
// everything it says, and this waits. Two voices reading different things at
// once is the fault that was reported from theatre last week, and it would
// be careless to reintroduce it from a second source.
//
// AND NEVER TWICE. A push often arrives alongside the same message on the
// radio queue — the same event reaching a person by two routes. Repeats of
// one tag inside a short window are dropped, so the room hears it once.
// ============================================================

import { useEffect, useRef } from 'react';
import { speakAnnouncement } from '@/lib/radioTts';

/**
 * How long the same notification stays "already said".
 *
 * Long enough to cover the gap between a push and the radio queue carrying
 * the same event, short enough that a genuine repeat — an emergency being
 * re-announced because nobody came — is still heard.
 */
const REPEAT_WINDOW_MS = 90_000;

/** Waits this long for the radio to finish before giving up on speaking. */
const MAX_WAIT_FOR_RADIO_MS = 30_000;

interface SpeakMessage {
  type: string;
  title?: string;
  body?: string;
  priority?: string | null;
  tag?: string;
}

export default function SpokenPushAnnouncer() {
  const saidRef = useRef<Map<string, number>>(new Map());
  const radioBusyRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const onActive = () => { radioBusyRef.current = true; };
    const onIdle = () => { radioBusyRef.current = false; };
    window.addEventListener('radio:active', onActive);
    window.addEventListener('radio:idle', onIdle);

    const speak = (m: SpeakMessage) => {
      const title = (m.title ?? '').trim();
      const body = (m.body ?? '').trim();
      if (!title && !body) return;

      // The written notice already reads as a sentence; spoken, the title
      // and body run together without a pause and sound like one long
      // phrase. The full stop is what makes it land as two.
      const text = [title, body].filter(Boolean).join('. ').replace(/\.\.+/g, '.');

      const key = (m.tag || text).slice(0, 120);
      const now = Date.now();
      const last = saidRef.current.get(key) ?? 0;
      if (now - last < REPEAT_WINDOW_MS) return;
      saidRef.current.set(key, now);

      // Keep the map from growing for the life of a long shift.
      if (saidRef.current.size > 60) {
        for (const [k, t] of Array.from(saidRef.current.entries())) {
          if (now - t > REPEAT_WINDOW_MS) saidRef.current.delete(k);
        }
      }

      const urgent = m.priority === 'CRITICAL' || m.priority === 'URGENT' || m.priority === 'HIGH';

      const attempt = (waitedMs: number) => {
        if (radioBusyRef.current) {
          // The radio is mid-sentence. Wait rather than talk over it, and
          // give up eventually: an announcement read ten minutes late is
          // worse than one not read at all.
          if (waitedMs >= MAX_WAIT_FOR_RADIO_MS) return;
          window.setTimeout(() => attempt(waitedMs + 1000), 1000);
          return;
        }
        void speakAnnouncement(text, { urgent }).catch(() => undefined);
      };
      attempt(0);
    };

    const onMessage = (event: MessageEvent) => {
      const d = event.data as SpeakMessage | undefined;
      if (d?.type === 'PUSH_SPEAK') speak(d);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('radio:active', onActive);
      window.removeEventListener('radio:idle', onIdle);
    };
  }, []);

  return null;
}
