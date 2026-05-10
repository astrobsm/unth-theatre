'use client';

/**
 * Background music player with priority-queue ducking.
 *
 * - Plays a looped track from /audio/background/ at low volume.
 * - Listens for `radio:active` (any announcement / emergency starts) and
 *   pauses immediately so there is no overlap.
 * - Listens for `radio:idle` (announcement finished or acknowledged) and
 *   smoothly resumes.
 *
 * The audio file lives in `public/audio/background/`. Drop one or more
 * MP3/OGG files there and select the active track via the dropdown that
 * appears in the floating control. Defaults to `/audio/background/ambient.mp3`.
 *
 * Persists enabled / muted / volume / track choice in localStorage.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Music, Pause, Play, Volume2, VolumeX, ChevronUp, ChevronDown } from 'lucide-react';

const LS_ENABLED = 'bgMusic.enabled';
const LS_VOLUME = 'bgMusic.volume';
const LS_TRACK = 'bgMusic.track';
const LS_COLLAPSED = 'bgMusic.collapsed';

// Common candidate filenames the user might upload. The first one that
// loads successfully becomes the active track. Users can also pick a
// custom URL via the input.
const DEFAULT_TRACKS = [
  '/audio/background/ambient.mp3',
  '/audio/background/lobby.mp3',
  '/audio/background/calm.mp3',
];

export default function BackgroundMusicPlayer() {
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ducked, setDucked] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [track, setTrack] = useState<string>(DEFAULT_TRACKS[0]);
  const [collapsed, setCollapsed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wasPlayingBeforeDuckRef = useRef(false);

  // Restore persisted state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(LS_ENABLED) === '1') setEnabled(true);
      const v = parseFloat(window.localStorage.getItem(LS_VOLUME) || '');
      if (!isNaN(v)) setVolume(Math.min(1, Math.max(0, v)));
      const t = window.localStorage.getItem(LS_TRACK);
      if (t) setTrack(t);
      if (window.localStorage.getItem(LS_COLLAPSED) === '0') setCollapsed(false);
    } catch {}
  }, []);

  // Persist.
  useEffect(() => {
    try { window.localStorage.setItem(LS_ENABLED, enabled ? '1' : '0'); } catch {}
  }, [enabled]);
  useEffect(() => {
    try { window.localStorage.setItem(LS_VOLUME, String(volume)); } catch {}
  }, [volume]);
  useEffect(() => {
    try { window.localStorage.setItem(LS_TRACK, track); } catch {}
  }, [track]);
  useEffect(() => {
    try { window.localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  // Initialise / replace audio element when track or enabled changes.
  useEffect(() => {
    if (!enabled) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlaying(false);
      return;
    }
    let cancelled = false;
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }
    const a = audioRef.current;
    a.src = track;
    a.loop = true;
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
  }, [enabled, track]); // intentionally not dependent on volume/ducked

  // Apply volume / duck changes without restarting playback.
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = ducked ? 0 : volume;
  }, [volume, ducked]);

  // Listen for radio activity to duck.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onActive = () => {
      setDucked(true);
      const a = audioRef.current;
      if (!a) return;
      wasPlayingBeforeDuckRef.current = !a.paused;
      try { a.pause(); } catch {}
    };
    const onIdle = () => {
      setDucked(false);
      const a = audioRef.current;
      if (!a || !enabled) return;
      if (wasPlayingBeforeDuckRef.current) {
        a.volume = volume;
        a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    };
    window.addEventListener('radio:active', onActive as EventListener);
    window.addEventListener('radio:idle', onIdle as EventListener);
    return () => {
      window.removeEventListener('radio:active', onActive as EventListener);
      window.removeEventListener('radio:idle', onIdle as EventListener);
    };
  }, [enabled, volume]);

  // Manual play/pause (for autoplay-blocked browsers).
  const togglePlay = useCallback(async () => {
    if (!enabled) { setEnabled(true); return; }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
        setPlaying(true);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Playback blocked.');
      }
    } else {
      a.pause();
      setPlaying(false);
    }
  }, [enabled]);

  const tryNextDefaultTrack = useCallback(() => {
    const idx = DEFAULT_TRACKS.indexOf(track);
    const next = DEFAULT_TRACKS[(idx + 1) % DEFAULT_TRACKS.length];
    setTrack(next);
  }, [track]);

  return (
    <div className="fixed bottom-4 left-4 z-40 print:hidden">
      <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-50"
        >
          <Music className={`w-4 h-4 ${ducked ? 'text-amber-500' : enabled && playing ? 'text-green-600' : 'text-gray-400'}`} />
          <span className="text-xs font-semibold text-gray-700">
            Background music
          </span>
          <span className="ml-auto text-[10px] text-gray-500">
            {ducked ? 'Ducked (radio)' : enabled && playing ? 'Playing' : enabled ? 'Paused' : 'Off'}
          </span>
          {collapsed ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2 w-72">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 hover:bg-gray-50"
              >
                {enabled && playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {enabled && playing ? 'Pause' : enabled ? 'Play' : 'Enable'}
              </button>
              <button
                type="button"
                onClick={() => setEnabled(false)}
                className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                disabled={!enabled}
              >
                Off
              </button>
            </div>

            <div className="flex items-center gap-2">
              {volume === 0 ? <VolumeX className="w-3 h-3 text-gray-500" /> : <Volume2 className="w-3 h-3 text-gray-500" />}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1"
                aria-label="Background music volume"
              />
              <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round(volume * 100)}%</span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Track</label>
              <input
                type="text"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                placeholder="/audio/background/ambient.mp3"
                className="w-full text-xs px-2 py-1 border rounded"
              />
              <div className="flex gap-1 flex-wrap">
                {DEFAULT_TRACKS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrack(t)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${t === track ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    title={t}
                  >
                    {t.split('/').pop()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={tryNextDefaultTrack}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Try next
                </button>
              </div>
              <p className="text-[10px] text-gray-500 leading-snug">
                Upload music files to <code className="bg-gray-100 px-1 rounded">public/audio/background/</code> in the repo
                (e.g. <code className="bg-gray-100 px-1 rounded">ambient.mp3</code>) and redeploy. The track will be paused
                automatically while the radio plays an announcement or emergency alert.
              </p>
              {error && <p className="text-[10px] text-amber-600">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
