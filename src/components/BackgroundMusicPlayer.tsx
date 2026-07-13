'use client';

/**
 * Background music player with priority-queue ducking and shuffle playlist.
 *
 * - Fetches /audio/background/manifest.json (built by scripts/build-music-manifest.ps1).
 *   Each track is a public URL on Supabase Storage.
 * - Plays a shuffled queue at low volume; auto-advances on track end.
 * - Listens for `radio:active` to fade out (over ~1.2s) and `radio:idle` to fade back in (~1.5s),
 *   triggered by theatre radio, pharmacy/announcement TVs and emergency surgery alerts.
 * - Persists enabled / volume / collapsed / shuffle in localStorage.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Music, Pause, Play, Volume2, VolumeX, ChevronDown,
  SkipForward, SkipBack, Shuffle,
} from 'lucide-react';
import { useMediaHub } from '@/components/MediaHub';
import { useTabLeader } from '@/lib/useTabLeader';

const LS_ENABLED   = 'bgMusic.enabled';
const LS_VOLUME    = 'bgMusic.volume';
const LS_COLLAPSED = 'bgMusic.collapsed';
const LS_SHUFFLE   = 'bgMusic.shuffle';
const LS_PLAYING   = 'bgMusic.playing';     // play intent persisted across reloads
const LS_RESUME_URL  = 'bgMusic.resumeUrl'; // track url to resume after refresh
const LS_RESUME_TIME = 'bgMusic.resumeTime';// playback position (seconds)

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
  const { mode, collapse, setMusicActive } = useMediaHub();
  const isLeader = useTabLeader();
  // Music is ON by default; only the primary (leader) window actually plays.
  const [enabled,   setEnabled]   = useState(true);
  const [playing,   setPlaying]   = useState(false);
  const [ducked,    setDucked]    = useState(false);
  const [volume,    setVolume]    = useState(0.25);
  const [collapsed, setCollapsed] = useState(true);
  const [shuffle,   setShuffle]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [queue,    setQueue]    = useState<Track[]>([]);
  const [idx,      setIdx]      = useState(0);
  // Music network/audio work is deferred until the user actually wants it
  // (opens the music panel, presses play, or was actively playing before a
  // refresh). This keeps the manifest fetch + audio buffering off the hot
  // path of every page load.
  const [wantsMusic, setWantsMusic] = useState(false);

  const audioRef             = useRef<HTMLAudioElement | null>(null);
  const wasPlayingBeforeDuck = useRef(false);
  const fadeTimerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const duckCountRef         = useRef(0); // supports nested/overlapping duck triggers
  // Music auto-starts by default in the primary window. This ref tracks the
  // user's play/pause intent so it survives track changes and page reloads;
  // it is cleared only when the user explicitly presses Pause/Off.
  const playIntentRef        = useRef(true);
  // Track to resume (and its position) after a page refresh.
  const resumeRef            = useRef<{ url: string; time: number } | null>(null);
  const resumedRef           = useRef(false);
  const manifestFetchedRef   = useRef(false);
  // Counts consecutive track load failures so we can auto-skip a bad track but
  // stop (with a clear message) if the whole library is unreachable.
  const loadFailuresRef      = useRef(0);

  // Smoothly ramp the audio element volume to `target` over `durationMs`.
  // Cancels any in-flight fade. Calls `onDone` when finished. If the audio
  // element disappears mid-fade the timer self-clears.
  const fadeTo = useCallback((target: number, durationMs: number, onDone?: () => void) => {
    const a = audioRef.current;
    if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
    if (!a) { onDone?.(); return; }
    const stepMs = 50;
    const startVol = a.volume;
    const delta    = target - startVol;
    if (Math.abs(delta) < 0.001 || durationMs <= 0) {
      a.volume = Math.max(0, Math.min(1, target));
      onDone?.();
      return;
    }
    const steps = Math.max(1, Math.round(durationMs / stepMs));
    let i = 0;
    fadeTimerRef.current = setInterval(() => {
      i++;
      const aNow = audioRef.current;
      if (!aNow) {
        if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
        return;
      }
      const next = startVol + delta * (i / steps);
      aNow.volume = Math.max(0, Math.min(1, next));
      if (i >= steps) {
        if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
        aNow.volume = Math.max(0, Math.min(1, target));
        onDone?.();
      }
    }, stepMs);
  }, []);

  // ---- restore localStorage --------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // Default ON: only disable if the user explicitly turned music off.
      if (window.localStorage.getItem(LS_ENABLED) === '0') setEnabled(false);
      const v = parseFloat(window.localStorage.getItem(LS_VOLUME) || '');
      if (!isNaN(v)) setVolume(Math.min(1, Math.max(0, v)));
      if (window.localStorage.getItem(LS_COLLAPSED) === '0') setCollapsed(false);
      if (window.localStorage.getItem(LS_SHUFFLE) === '0') setShuffle(false);
      // Default play intent ON; only honor an explicit prior Pause.
      if (window.localStorage.getItem(LS_PLAYING) === '0') playIntentRef.current = false;
      // Only resume (and therefore load) music automatically for users who
      // were actively listening before the refresh — never for first loads.
      else if (window.localStorage.getItem(LS_PLAYING) === '1') setWantsMusic(true);
      // Resume the same track + position after a refresh.
      const rUrl = window.localStorage.getItem(LS_RESUME_URL) || '';
      const rTime = parseFloat(window.localStorage.getItem(LS_RESUME_TIME) || '0');
      if (rUrl) resumeRef.current = { url: rUrl, time: isNaN(rTime) ? 0 : rTime };
    } catch {}
  }, []);
  useEffect(() => { try { window.localStorage.setItem(LS_ENABLED,   enabled   ? '1' : '0'); } catch {} }, [enabled]);
  useEffect(() => { try { window.localStorage.setItem(LS_VOLUME,    String(volume));         } catch {} }, [volume]);
  useEffect(() => { try { window.localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0'); } catch {} }, [collapsed]);
  useEffect(() => { try { window.localStorage.setItem(LS_SHUFFLE,   shuffle   ? '1' : '0'); } catch {} }, [shuffle]);

  // ---- fetch manifest --------------------------------------------------------
  // Move the resume track (if any, after a refresh) to the front of the list so
  // playback continues from where it left off before the reload.
  const orderWithResume = useCallback((list: Track[]): Track[] => {
    const r = resumeRef.current;
    if (!r || resumedRef.current) return list;
    const i = list.findIndex((t) => t.url === r.url);
    if (i > 0) {
      const copy = list.slice();
      const [t] = copy.splice(i, 1);
      copy.unshift(t);
      return copy;
    }
    return list;
  }, []);

  useEffect(() => {
    if (!wantsMusic || manifestFetchedRef.current) return;
    manifestFetchedRef.current = true;
    let cancelled = false;
    // Allow normal HTTP/service-worker caching — the manifest is a static
    // build artefact, so there is no need to bypass the cache on every load.
    fetch('/audio/background/manifest.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m: Manifest) => {
        if (cancelled) return;
        setManifest(m);
        const list = Array.isArray(m.tracks) ? m.tracks : [];
        setQueue(orderWithResume(shuffle ? shuffleArray(list) : list));
        setIdx(0);
      })
      .catch((e) => {
        if (!cancelled) setError(`Music library not available: ${e?.message || e}`);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsMusic]);

  // The user opening the music (or split) panel counts as intent to listen, so
  // begin loading the library at that point.
  useEffect(() => {
    if (mode === 'music' || mode === 'split') setWantsMusic(true);
  }, [mode]);

  // re-shuffle when toggle changes or manifest reloads
  useEffect(() => {
    if (!manifest) return;
    const list = manifest.tracks || [];
    setQueue(orderWithResume(shuffle ? shuffleArray(list) : list));
    setIdx(0);
  }, [shuffle, manifest, orderWithResume]);

  const currentTrack = queue[idx];

  const advance = useCallback((step: 1 | -1) => {
    if (!queue.length) return;
    setIdx((i) => (i + step + queue.length) % queue.length);
  }, [queue.length]);

  // ---- (re)create audio element on track or enable change --------------------
  useEffect(() => {
    // Only the primary (leader) window plays. Non-leader tabs stay silent so
    // there is never overlapping audio across windows on the same computer.
    if (!enabled || !currentTrack || !isLeader) {
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

    // When a track's source can't be loaded (e.g. the host is unreachable or
    // over quota), auto-skip to the next track. If several tracks in a row fail
    // we conclude the whole library is unavailable and stop with a clear
    // message instead of surfacing the raw "no supported sources" error.
    const onMediaError = () => {
      if (cancelled) return;
      loadFailuresRef.current += 1;
      const limit = Math.min(queue.length || 1, 4);
      if (loadFailuresRef.current < limit) {
        advance(1); // try the next track
      } else {
        setPlaying(false);
        setError('Background music is temporarily unavailable.');
      }
    };
    const onCanPlay = () => { loadFailuresRef.current = 0; };
    a.addEventListener('error', onMediaError);
    a.addEventListener('canplay', onCanPlay);

    // Resume from the saved position after a refresh (once).
    if (!resumedRef.current && resumeRef.current && currentTrack.url === resumeRef.current.url) {
      const seek = resumeRef.current.time;
      const onMeta = () => {
        try {
          if (seek > 0 && seek < (a.duration || Infinity)) a.currentTime = seek;
        } catch {}
        resumedRef.current = true;
        a.removeEventListener('loadedmetadata', onMeta);
      };
      a.addEventListener('loadedmetadata', onMeta);
    }

    // Auto-start in the primary window unless the user explicitly paused.
    if (!playIntentRef.current) {
      setPlaying(false);
      return () => {
        cancelled = true;
        a.removeEventListener('error', onMediaError);
        a.removeEventListener('canplay', onCanPlay);
      };
    }
    a.play()
      .then(() => { if (!cancelled) { setPlaying(true); setError(null); loadFailuresRef.current = 0; } })
      .catch((e) => {
        if (cancelled) return;
        setPlaying(false);
        // A rejected play() on a track that failed to load reports "no supported
        // sources" — the onMediaError handler already deals with that case, so
        // only surface the autoplay-blocked hint here.
        const msg = e?.name === 'NotAllowedError'
          ? 'Tap anywhere to start music (browser blocks autoplay).'
          : null;
        if (msg) setError(msg);
      });
    return () => {
      cancelled = true;
      a.removeEventListener('error', onMediaError);
      a.removeEventListener('canplay', onCanPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentTrack?.url, isLeader]);

  // Persist the current track + position so playback resumes after a refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const a = audioRef.current;
    if (!a || !currentTrack) return;
    const save = () => {
      try {
        window.localStorage.setItem(LS_RESUME_URL, currentTrack.url);
        window.localStorage.setItem(LS_RESUME_TIME, String(Math.floor(a.currentTime || 0)));
        // Persist the play intent too, so the track auto-resumes after a refresh.
        if (playIntentRef.current && !a.paused) {
          window.localStorage.setItem(LS_PLAYING, '1');
        }
      } catch {}
    };
    // Save on a light interval AND right before the page unloads / is hidden,
    // so a refresh resumes from the exact position with no gap.
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    const id = setInterval(save, 3000);
    a.addEventListener('pause', save);
    a.addEventListener('ended', save);
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      a.removeEventListener('pause', save);
      a.removeEventListener('ended', save);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [currentTrack?.url]);

  // If the browser blocked autoplay, start music on the first user interaction
  // in the primary window.
  useEffect(() => {
    if (typeof window === 'undefined' || !isLeader) return;
    const tryResume = () => {
      const a = audioRef.current;
      if (a && enabled && playIntentRef.current && a.paused) {
        a.play().then(() => setPlaying(true)).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', tryResume);
    window.addEventListener('keydown', tryResume);
    return () => {
      window.removeEventListener('pointerdown', tryResume);
      window.removeEventListener('keydown', tryResume);
    };
  }, [isLeader, enabled]);

  // auto-advance on end
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => advance(1);
    a.addEventListener('ended', onEnded);
    return () => a.removeEventListener('ended', onEnded);
  }, [advance]);

  // volume + duck (instant when not fading; fades are driven by radio events below)
  useEffect(() => {
    if (fadeTimerRef.current) return; // a fade is in flight; let it finish
    if (audioRef.current) audioRef.current.volume = ducked ? 0 : volume;
  }, [volume, ducked]);

  // Ducking via radio / announcement / emergency events.
  // Fades music down (~1.2s) before pausing, then fades back up (~1.5s) on resume.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const FADE_OUT_MS = 1200;
    const FADE_IN_MS  = 1500;

    const onActive = () => {
      duckCountRef.current += 1;
      if (duckCountRef.current > 1) return; // already ducked
      setDucked(true);
      const a = audioRef.current;
      if (!a) return;
      wasPlayingBeforeDuck.current = !a.paused;
      if (a.paused) return;
      fadeTo(0, FADE_OUT_MS, () => {
        try { audioRef.current?.pause(); } catch {}
      });
    };

    const onIdle = () => {
      duckCountRef.current = Math.max(0, duckCountRef.current - 1);
      if (duckCountRef.current > 0) return; // another announcement still active
      setDucked(false);
      const a = audioRef.current;
      if (!a || !enabled) return;
      if (!wasPlayingBeforeDuck.current) return;
      a.volume = 0;
      a.play()
        .then(() => {
          setPlaying(true);
          fadeTo(volume, FADE_IN_MS);
        })
        .catch(() => setPlaying(false));
    };

    window.addEventListener('radio:active', onActive as EventListener);
    window.addEventListener('radio:idle',   onIdle   as EventListener);
    return () => {
      window.removeEventListener('radio:active', onActive as EventListener);
      window.removeEventListener('radio:idle',   onIdle   as EventListener);
    };
  }, [enabled, volume, fadeTo]);

  // Cleanup any pending fade on unmount
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
    };
  }, []);

  const togglePlay = useCallback(async () => {
    // Pressing Play is explicit intent to listen — make sure the library loads.
    setWantsMusic(true);
    // Pressing Play makes THIS window the primary playback window, so the
    // control always works even when another tab currently holds leadership
    // (or a stale leader record is lingering).
    const claimLeadership = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('audio:claim-leadership'));
      }
    };
    if (!enabled) {
      claimLeadership();
      playIntentRef.current = true; try { window.localStorage.setItem(LS_PLAYING, '1'); } catch {}
      setEnabled(true);
      return;
    }
    const a = audioRef.current;
    if (!a) {
      // Audio element not created yet (this tab wasn't the leader). Claim
      // leadership and record play intent; the audio effect will create the
      // element and start playback once leadership is granted.
      claimLeadership();
      playIntentRef.current = true; try { window.localStorage.setItem(LS_PLAYING, '1'); } catch {}
      return;
    }
    if (a.paused) {
      claimLeadership();
      playIntentRef.current = true;
      try { window.localStorage.setItem(LS_PLAYING, '1'); } catch {}
      try { await a.play(); setPlaying(true); setError(null); }
      catch (e: any) { setError(e?.message || 'Playback blocked.'); }
    } else {
      playIntentRef.current = false;
      try { window.localStorage.setItem(LS_PLAYING, '0'); } catch {}
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

  // ---- autohide: re-collapse the expanded panel after a short idle period ----
  const AUTOHIDE_MS = 5000;
  const autohideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutohide = useCallback(() => {
    if (autohideTimerRef.current) {
      clearTimeout(autohideTimerRef.current);
      autohideTimerRef.current = null;
    }
  }, []);

  const armAutohide = useCallback(() => {
    clearAutohide();
    autohideTimerRef.current = setTimeout(() => collapse(), AUTOHIDE_MS);
  }, [clearAutohide, collapse]);

  // Re-arm whenever the panel is visible (mode === 'music') or relevant state changes.
  useEffect(() => {
    if (mode !== 'music') { clearAutohide(); return; }
    armAutohide();
    return clearAutohide;
  }, [mode, enabled, playing, idx, volume, shuffle, armAutohide, clearAutohide]);

  // Cleanup on unmount
  useEffect(() => clearAutohide, [clearAutohide]);

  // Report active-playing state to the combined media hub so the launcher icon
  // can reflect it (green music badge).
  useEffect(() => {
    setMusicActive(enabled && playing && !ducked);
  }, [enabled, playing, ducked, setMusicActive]);

  return (
    <div
      className="fixed bottom-20 right-4 z-[10006] print:hidden"
      onMouseEnter={clearAutohide}
      onMouseLeave={armAutohide}
    >
      {mode === 'music' && (
        <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={collapse}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-50 max-w-[20rem]"
          >
            <Music className={`w-4 h-4 flex-shrink-0 ${ducked ? 'text-amber-500' : enabled && playing ? 'text-green-600' : 'text-gray-400'}`} />
            <span className="text-xs font-semibold text-gray-700">Background music</span>
            <span className="ml-auto text-[10px] text-gray-500 truncate max-w-[10rem]" title={headerLabel}>{headerLabel}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          <div className="px-3 pb-3 pt-1 space-y-2 w-80 max-w-[88vw]" onClick={clearAutohide}>
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
        </div>
      )}
    </div>
  );
}
