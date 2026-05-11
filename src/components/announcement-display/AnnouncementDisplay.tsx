'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// Generic Announcement TV Kiosk
// ----------------------------------------------------------------------------
// Polls a public API every `pollIntervalMs` for active items. For each item
// that is still active, plays a chime + spoken announcement. Repeats the
// announcement every `repeatIntervalMs` until the item disappears from the
// API response (i.e. the underlying record was marked complete in the DB).
// ============================================================================

export interface AnnouncementItem {
  id: string;
  patientName: string;
  ward?: string;
  diagnosis?: string;
  folderNumber?: string;
  priority?: string;
  // Free-form extra fields (rendered by `renderExtra`)
  [key: string]: any;
}

export interface AnnouncementDisplayProps {
  title: string;
  subtitle: string;
  emoji: string;
  accentColorClass: string; // e.g. 'from-cyan-600 to-blue-700'
  cardAccentClass: string; // e.g. 'border-cyan-500 bg-cyan-950/40'
  badgeClass: string; // e.g. 'bg-cyan-500 text-cyan-50'
  endpoint: string; // e.g. '/api/announcement-display/lab'
  buildAnnouncement: (item: AnnouncementItem) => string;
  emptyHint: string;
  renderExtra?: (item: AnnouncementItem) => React.ReactNode;
  pollIntervalMs?: number;
  repeatIntervalMs?: number;
}

const DEFAULT_POLL_MS = 15_000; // refresh list every 15s
const DEFAULT_REPEAT_MS = 5 * 60_000; // re-announce each item every 5 min

export default function AnnouncementDisplay({
  title,
  subtitle,
  emoji,
  accentColorClass,
  cardAccentClass,
  badgeClass,
  endpoint,
  buildAnnouncement,
  emptyHint,
  renderExtra,
  pollIntervalMs = DEFAULT_POLL_MS,
  repeatIntervalMs = DEFAULT_REPEAT_MS,
}: AnnouncementDisplayProps) {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [now, setNow] = useState<Date>(new Date());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastAnnouncedRef = useRef<Map<string, number>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const speakingRef = useRef(false);

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the endpoint
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      const data = await res.json();
      const next: AnnouncementItem[] = data.items || [];
      setItems(next);
      setLastError(data.error || null);
      // Drop announcement timers for items that are no longer active
      const activeIds = new Set(next.map((i) => i.id));
      const map = lastAnnouncedRef.current;
      Array.from(map.keys()).forEach((id) => {
        if (!activeIds.has(id)) map.delete(id);
      });
    } catch (e: any) {
      setLastError(e?.message || String(e));
    }
  }, [endpoint]);

  useEffect(() => {
    fetchItems();
    const t = setInterval(fetchItems, pollIntervalMs);
    return () => clearInterval(t);
  }, [fetchItems, pollIntervalMs]);

  // ----- Audio engine -----
  const enableAudio = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      // Unlock TTS on iOS/Chrome via a silent utterance
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      setAudioEnabled(true);
    } catch (e) {
      console.error('[AnnouncementDisplay] enableAudio failed', e);
    }
  }, []);

  const playChime = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { return; }
    }
    const tones: [number, number, number][] = [
      [523, 0.3, 1.0],
      [659, 0.3, 1.0],
      [784, 0.45, 1.0],
    ];
    const start = ctx.currentTime + 0.05;
    let t = start;
    for (const [freq, dur, vol] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.04);
      gain.gain.setValueAtTime(vol, t + dur - 0.1);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + 0.12;
    }
    const waitMs = Math.max(0, (t - ctx.currentTime) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1.0;
        u.volume = 1.0;
        // Prefer an English voice when available
        const voices = synth.getVoices();
        const enVoice = voices.find((v) => /en[-_]/i.test(v.lang));
        if (enVoice) u.voice = enVoice;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.cancel();
        synth.speak(u);
      } catch {
        resolve();
      }
    });
  }, []);

  const announce = useCallback(
    async (item: AnnouncementItem) => {
      if (!audioEnabled || speakingRef.current) return;
      speakingRef.current = true;
      // Duck background music while we chime + speak.
      try { window.dispatchEvent(new CustomEvent('radio:active')); } catch {}
      try {
        await playChime();
        await speak(buildAnnouncement(item));
      } finally {
        speakingRef.current = false;
        try { window.dispatchEvent(new CustomEvent('radio:idle')); } catch {}
      }
    },
    [audioEnabled, playChime, speak, buildAnnouncement]
  );

  // Drive the announcement loop: every 5s, walk items and announce if due
  useEffect(() => {
    if (!audioEnabled) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || speakingRef.current) return;
      const map = lastAnnouncedRef.current;
      const nowMs = Date.now();
      // Sort by priority then insertion to give CRITICAL items first turn
      const queue = [...items].sort((a, b) => {
        const pa = priorityRank(a.priority);
        const pb = priorityRank(b.priority);
        return pa - pb;
      });
      for (const item of queue) {
        const last = map.get(item.id) ?? 0;
        if (nowMs - last >= (last === 0 ? 0 : repeatIntervalMs)) {
          map.set(item.id, nowMs);
          await announce(item);
          break; // announce one per tick to avoid overlap
        }
      }
    };
    const t = setInterval(tick, 5_000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [items, audioEnabled, announce, repeatIntervalMs]);

  const headerGradient = useMemo(
    () => `bg-gradient-to-r ${accentColorClass}`,
    [accentColorClass]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className={`${headerGradient} px-8 py-6 shadow-lg`}>
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="text-6xl drop-shadow-lg">{emoji}</div>
            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{title}</h1>
              <p className="text-lg md:text-xl opacity-90">{subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl md:text-4xl font-mono font-bold">
              {now.toLocaleTimeString()}
            </div>
            <div className="text-sm opacity-80">
              {now.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="mt-1 text-sm font-semibold">
              Active: <span className="text-yellow-200">{items.length}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Audio enable banner */}
      {!audioEnabled && (
        <div className="bg-yellow-500 text-slate-900 px-6 py-4 flex items-center justify-between gap-4">
          <div className="font-semibold">
            🔊 Click anywhere to enable audio announcements (browser policy
            requires a user gesture).
          </div>
          <button
            onClick={enableAudio}
            className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
          >
            Enable audio
          </button>
        </div>
      )}

      {lastError && (
        <div className="bg-red-900/60 text-red-100 px-6 py-3 text-sm">
          ⚠ {lastError}
        </div>
      )}

      {/* Body */}
      <main className="flex-1 p-6 md:p-10" onClick={!audioEnabled ? enableAudio : undefined}>
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-24">
            <div className="text-7xl mb-4 opacity-60">✓</div>
            <div className="text-3xl font-semibold mb-2">All clear</div>
            <div className="text-lg max-w-xl">{emptyHint}</div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className={`rounded-2xl border-2 p-6 shadow-2xl ${cardAccentClass} ${
                  item.priority === 'CRITICAL' ? 'animate-pulse-slow' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeClass}`}>
                    {item.priority || 'EMERGENCY'}
                  </span>
                  <span className="text-xs text-slate-300">
                    {timeSince(item.createdAt || item.requestedAt)}
                  </span>
                </div>
                <h2 className="text-3xl font-extrabold mb-1 leading-tight">
                  {item.patientName}
                </h2>
                {item.folderNumber ? (
                  <div className="text-sm text-slate-300 mb-3">
                    Folder #{item.folderNumber}
                  </div>
                ) : null}

                <dl className="space-y-2 text-base">
                  {item.diagnosis && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Diagnosis
                      </dt>
                      <dd className="text-xl font-semibold">{item.diagnosis}</dd>
                    </div>
                  )}
                  {item.ward && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-slate-400">
                        Ward / location
                      </dt>
                      <dd className="text-xl font-semibold">{item.ward}</dd>
                    </div>
                  )}
                </dl>

                {renderExtra ? <div className="mt-4">{renderExtra(item)}</div> : null}

                <div className="mt-4 pt-3 border-t border-slate-700/60 text-xs text-slate-400">
                  Status: <span className="text-slate-200 font-semibold">{item.status}</span>
                  {' · '}
                  Repeats every {Math.round(repeatIntervalMs / 60000)} min until cleared
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
          50% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
        }
        .animate-pulse-slow { animation: pulse-slow 2.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function priorityRank(p?: string): number {
  switch ((p || '').toUpperCase()) {
    case 'CRITICAL':
    case 'EMERGENCY':
      return 0;
    case 'HIGH':
    case 'URGENT':
      return 1;
    case 'MEDIUM':
      return 2;
    default:
      return 3;
  }
}

function timeSince(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}
