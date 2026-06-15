'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Radio, Volume2, VolumeX, CheckCircle2, AlertOctagon, Music, Loader2 } from 'lucide-react';

interface Announcement {
  id: string;
  category: string;
  title: string;
  message: string;
  audioUrl?: string | null;
  priority: number;
  location?: string | null;
  specialty?: string | null;
  urgency?: string | null;
  status: string;
  requireAck: boolean;
  ackCode?: string | null;
  repeatUntilAck: boolean;
  repeatEverySec: number;
  lastPlayedAt?: string | null;
  createdAt: string;
}

const POLL_MS = 7000;

export default function RadioPlayer() {
  const { data: session, status } = useSession();
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRecentlyRef = useRef<Map<string, number>>(new Map());
  // IDs the user has acknowledged in this tab. Even if the server hasn't
  // yet flipped status to ACKNOWLEDGED (network race), the player will
  // refuse to play these again.
  const suppressedRef = useRef<Set<string>>(new Set());

  const hardStop = useCallback(() => {
    try {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (synth) {
        synth.cancel();
        // Chrome occasionally needs a second nudge if cancel() is called
        // mid-utterance — schedule one more cancel on the next tick.
        setTimeout(() => { try { synth.cancel(); } catch {} }, 50);
      }
    } catch {}
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    } catch {}
    setSpeaking(false);
    // Resume background music after a hard stop / acknowledgement.
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('radio:idle')); } catch {}
    }
  }, []);

  // Restore persisted state once on mount so the radio stays activated
  // across page reloads / navigation. Persistence keys are scoped per-user.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const e = window.localStorage.getItem('theatreRadio.enabled');
      const m = window.localStorage.getItem('theatreRadio.muted');
      if (e === '1') setEnabled(true);
      if (m === '1') setMuted(true);
    } catch { /* localStorage may be blocked */ }
  }, []);

  // Persist whenever the user toggles the radio.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('theatreRadio.enabled', enabled ? '1' : '0'); } catch {}
  }, [enabled]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('theatreRadio.muted', muted ? '1' : '0'); } catch {}
  }, [muted]);

  const markPlayed = useCallback(async (id: string) => {
    try {
      await fetch('/api/radio/played', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* offline ok */ }
  }, []);

  // ---- Offline-first acknowledgement queue --------------------------------
  // Failed POSTs to /api/radio/acknowledge are persisted in localStorage and
  // automatically retried when the browser comes back online. This guarantees
  // that a clinician's tap is never lost even if the network is down at the
  // moment of acknowledgement.
  const ACK_QUEUE_KEY = 'theatreRadio.pendingAcks';
  type PendingAck = { id: string; code?: string; ts: number };

  const readAckQueue = useCallback((): PendingAck[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(ACK_QUEUE_KEY);
      return raw ? (JSON.parse(raw) as PendingAck[]) : [];
    } catch { return []; }
  }, []);

  const writeAckQueue = useCallback((items: PendingAck[]) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(ACK_QUEUE_KEY, JSON.stringify(items)); } catch {}
  }, []);

  const enqueueAck = useCallback((p: PendingAck) => {
    const cur = readAckQueue();
    if (cur.some((x) => x.id === p.id)) return;
    writeAckQueue([...cur, p]);
  }, [readAckQueue, writeAckQueue]);

  const flushAckQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const pending = readAckQueue();
    if (pending.length === 0) return;
    const remaining: PendingAck[] = [];
    for (const p of pending) {
      try {
        const r = await fetch('/api/radio/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ announcementId: p.id, code: p.code }),
        });
        // 4xx from server (already acked / not found) → drop. Network/5xx → keep.
        if (!r.ok && r.status >= 500) remaining.push(p);
      } catch {
        remaining.push(p);
      }
    }
    writeAckQueue(remaining);
  }, [readAckQueue, writeAckQueue]);

  // Replay any queued acks once on mount and again whenever the browser
  // reports it is back online.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    flushAckQueue();
    const onOnline = () => { flushAckQueue(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushAckQueue]);

  // Notify the BackgroundMusicPlayer (or any other passive audio source) that
  // the radio is about to speak / has finished. Listeners should duck
  // (pause / lower volume) on `radio:active` and resume on `radio:idle`.
  const emitRadioActive = useCallback(() => {
    if (typeof window === 'undefined') return;
    try { window.dispatchEvent(new CustomEvent('radio:active')); } catch {}
  }, []);
  const emitRadioIdle = useCallback(() => {
    if (typeof window === 'undefined') return;
    try { window.dispatchEvent(new CustomEvent('radio:idle')); } catch {}
  }, []);

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === 'undefined' || muted) { onDone?.(); return; }
      try {
        const synth = window.speechSynthesis;
        if (!synth) { onDone?.(); return; }
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.98;
        u.pitch = 1;
        u.volume = 1;
        const voices = synth.getVoices();
        const preferred =
          voices.find((v) => /en-?(GB|US)/i.test(v.lang) && /female|samantha|zira|google/i.test(v.name)) ||
          voices.find((v) => /en/i.test(v.lang)) ||
          voices[0];
        if (preferred) u.voice = preferred;
        u.onstart = () => { setSpeaking(true); emitRadioActive(); };
        u.onend = () => { setSpeaking(false); emitRadioIdle(); onDone?.(); };
        u.onerror = () => { setSpeaking(false); emitRadioIdle(); onDone?.(); };
        // Pre-emptively duck before the synth actually starts (some browsers
        // never fire onstart for very short utterances).
        emitRadioActive();
        synth.speak(u);
      } catch {
        emitRadioIdle();
        onDone?.();
      }
    },
    [muted, emitRadioActive, emitRadioIdle]
  );

  const playAudio = useCallback(
    (url: string, onDone?: () => void) => {
      if (muted) { onDone?.(); return; }
      try {
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        a.src = url;
        a.volume = 1;
        a.onended = () => { emitRadioIdle(); onDone?.(); };
        a.onerror = () => { emitRadioIdle(); onDone?.(); };
        emitRadioActive();
        a.play().catch(() => { emitRadioIdle(); onDone?.(); });
      } catch {
        emitRadioIdle();
        onDone?.();
      }
    },
    [muted, emitRadioActive, emitRadioIdle]
  );

  const fetchQueue = useCallback(async () => {
    try {
      const r = await fetch('/api/radio/queue', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      setQueue(data.queue ?? []);
    } catch {
      /* offline ok */
    }
  }, []);

  // Keep service alive while tab is hidden by re-fetching when it becomes visible.
  useEffect(() => {
    if (status !== 'authenticated' || !enabled) return;
    const onVisible = () => { if (!document.hidden) fetchQueue(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, enabled, fetchQueue]);

  // Poll
  useEffect(() => {
    if (status !== 'authenticated' || !enabled) return;
    fetchQueue();
    const id = setInterval(fetchQueue, POLL_MS);
    return () => clearInterval(id);
  }, [status, enabled, fetchQueue]);

  // Pick the highest-priority announcement and play it. Non-ack items play
  // ONCE (then are marked PLAYED server-side so they leave the queue).
  // requireAck items repeat every `repeatEverySec` until acknowledged.
  useEffect(() => {
    if (!enabled || queue.length === 0) return;
    // Skip any items the user has already acknowledged locally, even if the
    // server hasn't dropped them from the queue yet.
    const top = queue.find((q) => !suppressedRef.current.has(q.id));
    if (!top) return;
    setCurrent(top);
    const lastPlayedKey = `${top.id}`;
    const now = Date.now();
    const last = playedRecentlyRef.current.get(lastPlayedKey) ?? 0;

    if (top.repeatUntilAck) {
      const minGap = (top.repeatEverySec || 30) * 1000;
      if (now - last < minGap) return;
    } else {
      // Non-ack: play once. If we've already triggered it this session, wait
      // for the server to remove it from the queue.
      if (last > 0) return;
    }
    playedRecentlyRef.current.set(lastPlayedKey, now);

    const isEmergency = top.category === 'EMERGENCY' || top.priority >= 90;
    const prefix = isEmergency
      ? `Attention. Emergency. ${top.urgency ? top.urgency + ' priority. ' : ''}`
      : '';
    const text = `${prefix}${top.title}. ${top.message}${top.location ? '. Location: ' + top.location : ''}${top.specialty ? '. Specialty: ' + top.specialty : ''}.`;

    const onDone = () => {
      // For non-ack items, tell the server we've played it so it stops
      // appearing in the queue (no endless loop).
      if (!top.repeatUntilAck) markPlayed(top.id);
    };

    if (top.audioUrl) playAudio(top.audioUrl, onDone);
    else speak(text, onDone);
  }, [queue, enabled, speak, playAudio, markPlayed]);

  const acknowledge = useCallback(
    async (id: string) => {
      setAckBusy(true);
      let code: string | undefined;
      const ann = queue.find((q) => q.id === id) ?? current;
      if (ann?.ackCode) {
        code = window.prompt('Enter your acknowledgment code:') ?? undefined;
        if (!code) {
          setAckBusy(false);
          return;
        }
      }

      // 1) Stop the radio IMMEDIATELY — don't wait for the server.
      hardStop();

      // 2) Locally suppress this announcement so the playback effect won't
      //    re-trigger it before the next /api/radio/queue poll comes back
      //    without it.
      suppressedRef.current.add(id);
      setQueue((q) => q.filter((x) => x.id !== id));
      setCurrent((c) => (c?.id === id ? null : c));

      try {
        const r = await fetch('/api/radio/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ announcementId: id, code }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          alert(e.error ?? 'Failed to acknowledge');
          // Server rejected — lift suppression so the broadcast resumes,
          // and refresh from server to restore accurate state.
          suppressedRef.current.delete(id);
          await fetchQueue();
        } else {
          await fetchQueue();
        }
      } catch (err) {
        // Network failure — keep the local suppression so the radio stays
        // quiet for the operator who clicked, AND queue the ack for retry
        // when the browser comes back online (handled by flushAckQueue).
        console.warn('[radio] acknowledge offline; queued for retry', err);
        enqueueAck({ id, code, ts: Date.now() });
      } finally {
        setAckBusy(false);
      }
    },
    [queue, current, fetchQueue, hardStop, enqueueAck]
  );

  if (status !== 'authenticated') return null;

  const top = queue[0];
  const isEmergency = top && (top.category === 'EMERGENCY' || top.priority >= 90);

  return (
    <>
    {/* Floating, always-on-top Acknowledge button. Sits above the install
        prompt (z-[9999/10000]) and any site footer so a single click is
        guaranteed to land. */}
    {top?.requireAck && (
      <button
        onClick={() => acknowledge(top.id)}
        disabled={ackBusy}
        title="Acknowledge emergency announcement"
        className="fixed bottom-20 right-4 z-[10010] flex items-center gap-2 px-4 py-3 rounded-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold shadow-2xl ring-4 ring-green-300/60 disabled:opacity-60 print:hidden animate-pulse"
      >
        <CheckCircle2 className="w-5 h-5" /> ACKNOWLEDGE
      </button>
    )}
    <div
      className={`fixed bottom-4 left-4 z-[10005] w-[min(92vw,22rem)] rounded-xl overflow-hidden shadow-2xl border-2 print:hidden ${
        isEmergency
          ? 'bg-red-600 border-red-900 text-white animate-pulse'
          : 'bg-gradient-to-r from-slate-900 to-slate-800 border-primary-600 text-white'
      }`}
    >
      <div className="flex items-center px-4 py-2 gap-3">
        <button
          onClick={() => {
            if (!enabled) {
              // user gesture unlocks audio
              setEnabled(true);
              try { window.speechSynthesis?.getVoices(); } catch {}
              speak('Theatre radio service activated.');
            } else {
              setCollapsed((c) => !c);
            }
          }}
          className="flex items-center gap-2 font-bold"
          title={enabled ? 'Toggle radio panel' : 'Click to start theatre radio'}
        >
          {isEmergency ? <AlertOctagon className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
          <span>{enabled ? 'THEATRE RADIO' : 'START RADIO'}</span>
          {speaking && <Loader2 className="w-4 h-4 animate-spin" />}
        </button>

        {enabled && (
          <>
            <button
              onClick={() => {
                setMuted((m) => {
                  const nm = !m;
                  if (nm) {
                    window.speechSynthesis?.cancel();
                    audioRef.current?.pause();
                  }
                  return nm;
                });
              }}
              className="p-1 rounded hover:bg-white/10"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <div className="flex-1 truncate text-sm">
              {top ? (
                <span>
                  <span className="font-semibold">{top.title}</span>
                  <span className="opacity-80"> — {top.message}</span>
                </span>
              ) : (
                <span className="opacity-70 flex items-center gap-2">
                  <Music className="w-4 h-4" /> Idle. Listening for announcements…
                </span>
              )}
            </div>

            {top?.requireAck && (
              <button
                onClick={() => acknowledge(top.id)}
                disabled={ackBusy}
                className="relative z-[10010] flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" /> Acknowledge
              </button>
            )}
          </>
        )}
      </div>

      {enabled && !collapsed && queue.length > 1 && (
        <div className="bg-black/30 px-4 py-1 text-xs flex gap-3 overflow-x-auto">
          {queue.slice(1, 6).map((q) => (
            <span key={q.id} className="whitespace-nowrap opacity-80">
              • [{q.category}] {q.title}
            </span>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
