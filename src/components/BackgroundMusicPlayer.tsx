'use client';

/**
 * Background music player with priority-queue ducking and shuffle playlist.
 *
 * - Fetches /audio/background/manifest.json (built by scripts/build-music-manifest.ps1).
 *   Each track is a public URL on Supabase Storage.
 * - Plays a shuffled queue at low volume; auto-advances on track end.
 * - Listens for `radio:active` to pause (ducking) and `radio:idle` to resume.
 * - Persists enabled / volume / collapsed / shuffle in localStorage.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Music, Pause, Play, Volume2, VolumeX, ChevronUp, ChevronDown,
  SkipForward, SkipBack, Shuffle,
} from 'lucide-react';

const LS_ENABLED   = 'bgMusic.enabled';
const LS_VOLUME    = 'bgMusic.volume';
const LS_COLLAPSED = 'bgMusic.collapsed';
const LS_SHUFFLE   = 'bgMusic.shuffle';

interface Track {
  title:  string;
  artist: string;
  album:  string;
  file:   string;
  url:    string;
  sizeMB?: number;
}

interface Manifest {
  bucket:  string;
  baseUrl: string;
  count:   number;
  totalMB: number;
  tracks:  Track[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BackgroundMusicPlayer() {
  const [enabled,   setEnabled]   = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [ducked,    setDucked]    = useState(false);
  const [volume,    setVolume]    = useState(0.25);
  const [collapsed, setCollapsed] = useState(true);
  const [shuffle,   setShuffle]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [queue,    setQueue]    = useState<Track[]>([]);
  const [idx,      setIdx]      = useState(0);

  const audioRef             = useRef<HTMLAudioElement | null>(null);
  const wasPlayingBeforeDuck = useRef(false);

  // ---- restore localStorage --------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(LS_ENABLED) === '1') setEnabled(true);
      const v = parseFloat(window.localStorage.getItem(LS_VOLUME) || '');
      if (!isNaN(v)) setVolume(Math.min(1, Math.max(0, v)));
      if (window.localStorage.getItem(LS_COLLAPSED) === '0') setCollapsed(false);
      if (window.localStorage.getItem(LS_SHUFFLE) === '0') setShuffle(false);
    } catch {}
  }, []);
  useEffect(() => { try { window.localStorage.setItem(LS_ENABLED,   enabled   ? '1' : '0'); } catch {} }, [enabled]);
  useEffect(() => { try { window.localStorage.setItem(LS_VOLUME,    String(volume));         } catch {} }, [volume]);
  useEffect(() => { try { window.localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0'); } catch {} }, [collapsed]);
  useEffect(() => { try { window.localStorage.setItem(LS_SHUFFLE,   shuffle   ? '1' : '0'); } catch {} }, [shuffle]);

  // ---- fetch manifest --------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetch('/audio/background/manifest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m: Manifest) => {
        if (cancelled) return;
        setManifest(m);
        const list = Array.isArray(m.tracks) ? m.tracks : [];
        setQueue(shuffle ? shuffleArray(list) : list);
        setIdx(0);
      })
      .catch((e) => {
        if (!cancelled) setError(`Music library not available: ${e?.message || e}`);
      });
    return () => { cancelled = true; };
    // run once on mount; shuffle handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-shuffle when toggle changes or manifest reloads
  useEffect(() => {
    if (!manifest) return;
    const list = manifest.tracks || [];
    setQueue(shuffle ? shuffleArray(list) : list);
    setIdx(0);
  }, [shuffle, manifest]);

  const currentTrack = queue[idx];

  const advance = useCallback((step: 1 | -1) => {
    if (!queue.length) return;
    setIdx((i) => (i + step + queue.length) % queue.length);
  }, [queue.length]);

  // ---- (re)create audio element on track or enable change --------------------
  useEffect(() => {
    if (!enabled || !currentTrack) {
      if (audioRef.current) audioRef.current.pause();
      setPlaying(false);
      return;
    }
    let cancelled = false;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src    = currentTrack.url;
    a.loop   = false; // playlist auto-advances instead of looping single
    a.volume = ducked ? 0 : volume;
    setError(null);
    a.play()
      .then(() => { if (!cancelled) { setPlaying(true); setError(null); } })
      .catch((e) => {
        if (cancelled) return;
        setPlaying(false);
        setError(e?.message || 'Tap "Play" to start music (browser blocks autoplay).');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentTrack?.url]);

  // auto-advance on end
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => advance(1);
    a.addEventListener('ended', onEnded);
    return () => a.removeEventListener('ended', onEnded);
  }, [advance]);

  // volume + duck
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = ducked ? 0 : volume;
  }, [volume, ducked]);

  // ducking via radio events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onActive = () => {
      setDucked(true);
      const a = audioRef.current;
      if (!a) return;
      wasPlayingBeforeDuck.current = !a.paused;
      try { a.pause(); } catch {}
    };
    const onIdle = () => {
      setDucked(false);
      const a = audioRef.current;
      if (!a || !enabled) return;
      if (wasPlayingBeforeDuck.current) {
        a.volume = volume;
        a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    };
    window.addEventListener('radio:active', onActive as EventListener);
    window.addEventListener('radio:idle',   onIdle   as EventListener);
    return () => {
      window.removeEventListener('radio:active', onActive as EventListener);
      window.removeEventListener('radio:idle',   onIdle   as EventListener);
    };
  }, [enabled, volume]);

  const togglePlay = useCallback(async () => {
    if (!enabled) { setEnabled(true); return; }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try { await a.play(); setPlaying(true); setError(null); }
      catch (e: any) { setError(e?.message || 'Playback blocked.'); }
    } else {
      a.pause(); setPlaying(false);
    }
  }, [enabled]);

  const reshuffle = useCallback(() => {
    if (!manifest) return;
    setQueue(shuffleArray(manifest.tracks || []));
    setIdx(0);
  }, [manifest]);

  const headerLabel = useMemo(() => {
    if (ducked)              return 'Ducked (radio)';
    if (enabled && playing)  return currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : 'Playing';
    if (enabled)             return 'Paused';
    return 'Off';
  }, [ducked, enabled, playing, currentTrack]);

  return (
    <div className="fixed bottom-20 left-4 z-[10006] print:hidden">
      <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-50 max-w-[20rem]"
        >
          <Music className={`w-4 h-4 flex-shrink-0 ${ducked ? 'text-amber-500' : enabled && playing ? 'text-green-600' : 'text-gray-400'}`} />
          <span className="text-xs font-semibold text-gray-700">Background music</span>
          <span className="ml-auto text-[10px] text-gray-500 truncate max-w-[10rem]" title={headerLabel}>{headerLabel}</span>
          {collapsed ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2 w-80">
            <div className="text-[11px] text-gray-700 leading-tight min-h-[2.2rem]">
              {currentTrack ? (
                <>
                  <div className="font-semibold truncate" title={currentTrack.title}>{currentTrack.title}</div>
                  <div className="text-gray-500 truncate" title={`${currentTrack.artist} • ${currentTrack.album}`}>
                    {currentTrack.artist} • {currentTrack.album}
                  </div>
                </>
              ) : (
                <div className="text-gray-400 italic">{manifest ? 'No tracks in library' : 'Loading library…'}</div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button type="button" onClick={() => advance(-1)} disabled={!queue.length}
                className="p-1.5 rounded border text-xs hover:bg-gray-50 disabled:opacity-40" title="Previous">
                <SkipBack className="w-3 h-3" />
              </button>
              <button type="button" onClick={togglePlay}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 hover:bg-gray-50 flex-1 justify-center">
                {enabled && playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {enabled && playing ? 'Pause' : enabled ? 'Play' : 'Enable'}
              </button>
              <button type="button" onClick={() => advance(1)} disabled={!queue.length}
                className="p-1.5 rounded border text-xs hover:bg-gray-50 disabled:opacity-40" title="Next">
                <SkipForward className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => setShuffle((s) => !s)}
                className={`p-1.5 rounded border text-xs ${shuffle ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'hover:bg-gray-50'}`}
                title={shuffle ? 'Shuffle on' : 'Shuffle off'}>
                <Shuffle className="w-3 h-3" />
              </button>
              <button type="button" onClick={reshuffle} disabled={!manifest}
                className="px-2 py-1 rounded border text-[10px] hover:bg-gray-50 disabled:opacity-40" title="Reshuffle queue">
                ↻
              </button>
            </div>

            <div className="flex items-center gap-2">
              {volume === 0 ? <VolumeX className="w-3 h-3 text-gray-500" /> : <Volume2 className="w-3 h-3 text-gray-500" />}
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1" aria-label="Background music volume" />
              <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round(volume * 100)}%</span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>{manifest ? `${idx + 1} / ${queue.length} of ${manifest.count} tracks` : '—'}</span>
              <button type="button" onClick={() => setEnabled(false)} disabled={!enabled}
                className="px-2 py-0.5 rounded border hover:bg-gray-50 disabled:opacity-40">
                Off
              </button>
            </div>

            <p className="text-[10px] text-gray-500 leading-snug">
              Music is paused automatically while the radio plays an announcement or emergency alert.
            </p>
            {error && <p className="text-[10px] text-amber-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
