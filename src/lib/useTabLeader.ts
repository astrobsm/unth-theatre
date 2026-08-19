'use client';

/**
 * Cross-tab "primary window" (leader) election.
 *
 * When ORM is open in several tabs or windows on one device, exactly one is
 * elected leader, and only the leader produces audio — otherwise an emergency
 * arrives as a chorus.
 *
 * WHAT CHANGED, AND WHY IT MATTERED
 *
 * This used to elect on liveness alone: whichever window claimed the heartbeat
 * first held it until it was closed. A background tab is perfectly alive and
 * rewrites a timestamp quite happily while being unable to make any sound at
 * all — no user gesture has ever reached it, so the browser refuses it audio.
 * It held the lock; the window a nurse was actually looking at displayed
 * "being announced in your other open window" and said nothing. The
 * announcement was shown and heard by nobody, which is the one outcome this
 * component exists to prevent.
 *
 * A VISIBLE window now takes the lock from a hidden one immediately. Waiting
 * for the hidden window to go stale would never have worked: it was refreshing
 * on time. The rules are in lib/audioLeader.ts, kept pure and tested, because
 * this is the code that decides whether an emergency is audible.
 */

import { useEffect, useRef, useState } from 'react';
import {
  evaluateClaim,
  isLeaderRecord,
  HEARTBEAT_MS,
  type LeaderRecord,
} from '@/lib/audioLeader';

const LEADER_KEY = 'theatreAudio.leader';

function readRecord(): LeaderRecord | null {
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as unknown;
    return isLeaderRecord(rec) ? rec : null;
  } catch {
    return null;
  }
}

function writeRecord(rec: LeaderRecord) {
  try {
    window.localStorage.setItem(LEADER_KEY, JSON.stringify(rec));
  } catch {
    /* storage may be blocked */
  }
}

export function useTabLeader(): boolean {
  const [isLeader, setIsLeader] = useState(false);
  const tabIdRef = useRef<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    tabIdRef.current =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const myId = tabIdRef.current;

    let timer: ReturnType<typeof setInterval> | null = null;

    const evaluate = () => {
      const iAmVisible = typeof document === 'undefined' || !document.hidden;
      const { claim } = evaluateClaim({
        record: readRecord(),
        myId,
        iAmVisible,
        now: Date.now(),
      });

      if (claim) {
        // The visibility of the holder travels WITH the record, so another
        // window can see that the current leader cannot be heard. Without it
        // there is no way to distinguish "alive" from "audible".
        writeRecord({ id: myId, ts: Date.now(), visible: iAmVisible });
      }
      setIsLeader(claim);
    };

    evaluate();
    timer = setInterval(evaluate, HEARTBEAT_MS);

    const onStorage = (e: StorageEvent) => {
      if (e.key === LEADER_KEY) evaluate();
    };
    window.addEventListener('storage', onStorage);

    // Coming to the foreground is the moment this window becomes able to speak,
    // so it is also the moment to take the lock — not two seconds later on the
    // next heartbeat, by which time the announcement may have been and gone.
    const onVisibility = () => evaluate();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    // An explicit user action (pressing Play) always wins: the controls must be
    // responsive in the window the person is actually touching.
    const onClaim = () => {
      writeRecord({ id: myId, ts: Date.now(), visible: true });
      setIsLeader(true);
    };
    window.addEventListener('audio:claim-leadership', onClaim as EventListener);

    const onUnload = () => {
      const rec = readRecord();
      if (rec && rec.id === myId) {
        try {
          window.localStorage.removeItem(LEADER_KEY);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('audio:claim-leadership', onClaim as EventListener);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
  }, []);

  return isLeader;
}
