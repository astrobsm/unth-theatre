'use client';

/**
 * Cross-tab "primary window" (leader) election.
 *
 * When the app is open in several tabs/windows on the SAME computer, exactly
 * one of them is elected the leader. Audio sources (background music + radio
 * service) only play in the leader tab, so the user never hears overlapping
 * playback from multiple windows.
 *
 * Mechanism: a heartbeat record `{ id, ts }` is kept in localStorage. The
 * current leader rewrites it every HEARTBEAT_MS. Any tab that finds the record
 * missing or stale (older than STALE_MS) claims leadership. `storage` events
 * let other tabs react immediately when the record changes or is cleared on
 * unload. The first window opened therefore becomes — and stays — the leader
 * until it is closed, at which point another open tab takes over within a
 * couple of seconds.
 */

import { useEffect, useRef, useState } from 'react';

const LEADER_KEY = 'theatreAudio.leader';
const HEARTBEAT_MS = 2000;
const STALE_MS = 5000;

type LeaderRecord = { id: string; ts: number };

function readRecord(): LeaderRecord | null {
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as LeaderRecord;
    if (rec && typeof rec.id === 'string' && typeof rec.ts === 'number') return rec;
    return null;
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

    // Unique id for this tab/window for the lifetime of the page.
    tabIdRef.current =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const myId = tabIdRef.current;

    let timer: ReturnType<typeof setInterval> | null = null;

    const evaluate = () => {
      const rec = readRecord();
      const now = Date.now();
      const stale = !rec || now - rec.ts > STALE_MS;

      if (!rec || stale || rec.id === myId) {
        // Claim or refresh leadership.
        writeRecord({ id: myId, ts: now });
        setIsLeader(true);
      } else {
        setIsLeader(false);
      }
    };

    // Initial claim attempt + periodic heartbeat.
    evaluate();
    timer = setInterval(evaluate, HEARTBEAT_MS);

    // React instantly when another tab rewrites or clears the record.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LEADER_KEY) evaluate();
    };
    window.addEventListener('storage', onStorage);

    // Allow this tab to forcibly become the leader on an explicit user action
    // (e.g. pressing Play). This guarantees the playback controls are always
    // responsive in the window the user is actually interacting with.
    const onClaim = () => {
      writeRecord({ id: myId, ts: Date.now() });
      setIsLeader(true);
    };
    window.addEventListener('audio:claim-leadership', onClaim as EventListener);

    // Release leadership on close so another tab can take over immediately.
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
      window.removeEventListener('audio:claim-leadership', onClaim as EventListener);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
  }, []);

  return isLeader;
}
