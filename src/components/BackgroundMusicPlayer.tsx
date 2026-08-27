'use client';

/**
 * Background ambient player.
 *
 * - Plays procedurally generated, royalty-free ambient soundscapes via the Web
 *   Audio API (see `@/lib/ambientEngine`). No audio files, no hosting/bandwidth,
 *   no licensing concerns, and it works fully offline.
 * - Only the primary (leader) window/tab produces sound, so there is never
 *   overlapping audio on the same computer.
 * - Ducks automatically while the theatre radio / announcements / emergency
 *   alerts speak (listens for `radio:active` / `radio:idle`).
 * - Persists enabled / volume / collapsed / play-intent / soundscape in
 *   localStorage.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Music, Pause, Play, Volume2, VolumeX, ChevronDown,
  SkipForward, SkipBack,
} from 'lucide-react';
import { useMediaHub } from '@/components/MediaHub';
import { useTabLeader } from '@/lib/useTabLeader';
import { AmbientEngine } from '@/lib/ambientEngine';
import { useMusicLibrary } from '@/lib/useMusicLibrary';
import { DockSlot, DOCK_ORDER } from '@/components/FloatingDock';

const LS_ENABLED   = 'bgMusic.enabled';
const LS_VOLUME    = 'bgMusic.volume';
const LS_COLLAPSED = 'bgMusic.collapsed';
const LS_PLAYING   = 'bgMusic.playing'; // play intent persisted across reloads
const LS_PRESET    = 'bgMusic.preset';  // selected soundscape index
/** 'ambient' = the generated soundscape, 'library' = the theatre's own files. */
const LS_SOURCE    = 'bgMusic.source';
const LS_CATEGORY  = 'bgMusic.category';

const PRESET_NAMES = AmbientEngine.presetNames();

type MusicSource = 'ambient' | 'library';

export default function BackgroundMusicPlayer() {
  const { mode, collapse, setMusicActive } = useMediaHub();
  const isLeader = useTabLeader();
  /**
   * Which source is playing.
   *
   * The generated soundscape stays the default and the fallback: it needs no
   * files, no licensing and no disk, so a theatre with an empty library still
   * has something. The library is chosen deliberately by somebody who has put
   * music on the server.
   */
  const [source, setSource] = useState<MusicSource>('ambient');
  const [category, setCategory] = useState<string | null>(null);
  // Ambient is ON by default; only the primary (leader) window actually plays.
  const [enabled,   setEnabled]   = useState(true);
  const [playing,   setPlaying]   = useState(false);
  const [ducked,    setDucked]    = useState(false);
  const [volume,    setVolume]    = useState(0.25);
  const [collapsed, setCollapsed] = useState(true);
  const [preset,    setPreset]    = useState(0);
  const [error,     setError]     = useState<string | null>(null);

  const engineRef      = useRef<AmbientEngine | null>(null);
  const duckCountRef   = useRef(0); // supports nested/overlapping duck triggers
  // Play/pause intent survives soundscape changes and reloads; cleared only
  // when the user explicitly presses Pause/Off.
  const playIntentRef  = useRef(true);
  const presetRef      = useRef(0);
  // Read inside callbacks that must not capture a stale source.
  const sourceRef      = useRef<MusicSource>('ambient');
  sourceRef.current    = source;

  const getEngine = useCallback((): AmbientEngine => {
    if (!engineRef.current) engineRef.current = new AmbientEngine();
    return engineRef.current;
  }, []);

  // ---- restore localStorage --------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(LS_ENABLED) === '0') setEnabled(false);
      const v = parseFloat(window.localStorage.getItem(LS_VOLUME) || '');
      if (!isNaN(v)) setVolume(Math.min(1, Math.max(0, v)));
      if (window.localStorage.getItem(LS_COLLAPSED) === '0') setCollapsed(false);
      if (window.localStorage.getItem(LS_PLAYING) === '0') playIntentRef.current = false;
      const p = parseInt(window.localStorage.getItem(LS_PRESET) || '', 10);
      if (!isNaN(p) && p >= 0 && p < PRESET_NAMES.length) { setPreset(p); presetRef.current = p; }
      if (window.localStorage.getItem(LS_SOURCE) === 'library') setSource('library');
      const cat = window.localStorage.getItem(LS_CATEGORY);
      if (cat) setCategory(cat);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { window.localStorage.setItem(LS_ENABLED,   enabled   ? '1' : '0'); } catch { /* ignore */ } }, [enabled]);
  useEffect(() => { try { window.localStorage.setItem(LS_VOLUME,    String(volume));        } catch { /* ignore */ } }, [volume]);
  useEffect(() => { try { window.localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => { presetRef.current = preset; try { window.localStorage.setItem(LS_PRESET, String(preset)); } catch { /* ignore */ } }, [preset]);
  useEffect(() => { try { window.localStorage.setItem(LS_SOURCE, source); } catch { /* ignore */ } }, [source]);
  useEffect(() => {
    try {
      if (category) window.localStorage.setItem(LS_CATEGORY, category);
      else window.localStorage.removeItem(LS_CATEGORY);
    } catch { /* ignore */ }
  }, [category]);

  /**
   * The theatre's own recordings. Mounted always so the library list is known
   * before somebody switches to it, but it only produces sound when `enabled`
   * AND the source is 'library' AND this is the leader window.
   */
  const library = useMusicLibrary({
    enabled: enabled && source === 'library' && playing,
    isLeader,
    volume,
    category,
  });

  /**
   * One source at a time. Switching to the library silences the generated
   * soundscape and the other way round — two things playing at once in a
   * theatre is worse than either alone.
   */
  useEffect(() => {
    if (source === 'library') {
      engineRef.current?.pause();
    } else {
      library.stop();
    }
    // library.stop is stable; depending on it would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ---- start / stop the engine based on leader + enabled + intent ------------
  const startEngine = useCallback(async () => {
    if (!isLeader || !enabled || !playIntentRef.current) return;
    // The generated soundscape must not start underneath the library. Every
    // path into here — the leader effect, opening the panel, the first tap that
    // unblocks audio — would otherwise give a theatre two things playing at
    // once, one of which nobody chose.
    if (sourceRef.current === 'library') return;
    try {
      const eng = getEngine();
      eng.setVolume(volume);
      const audible = await eng.start(presetRef.current);
      setPlaying(audible);
      setError(audible ? null : 'Tap anywhere to start the ambient sound.');
    } catch {
      setError('Ambient sound is unavailable on this device.');
    }
  }, [isLeader, enabled, volume, getEngine]);

  // Non-leader tabs (or disabled) must be silent.
  useEffect(() => {
    if (!isLeader || !enabled) {
      engineRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (playIntentRef.current) void startEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader, enabled]);

  // Opening the music/split panel counts as intent to listen.
  useEffect(() => {
    if ((mode === 'music' || mode === 'split') && enabled && playIntentRef.current) {
      void startEngine();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Browsers block audio until a user gesture — start/resume on first interaction.
  useEffect(() => {
    if (typeof window === 'undefined' || !isLeader) return;
    const tryResume = async () => {
      if (!enabled || !playIntentRef.current) return;
      // In library mode the <audio> element handles its own resume; waking the
      // ambient engine here would start a second sound over the music.
      if (sourceRef.current === 'library') { setPlaying(true); return; }
      const eng = engineRef.current;
      if (eng && eng.audible()) return;
      if (eng) {
        const ok = await eng.resume();
        if (ok && !eng.audible()) { await eng.start(presetRef.current); }
        setPlaying(eng.audible());
        if (eng.audible()) setError(null);
      } else {
        await startEngine();
      }
    };
    window.addEventListener('pointerdown', tryResume);
    window.addEventListener('keydown', tryResume);
    return () => {
      window.removeEventListener('pointerdown', tryResume);
      window.removeEventListener('keydown', tryResume);
    };
  }, [isLeader, enabled, startEngine]);

  // ---- volume ----------------------------------------------------------------
  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  // ---- ducking via radio / announcement / emergency events -------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onActive = () => {
      duckCountRef.current += 1;
      if (duckCountRef.current > 1) return; // already ducked
      setDucked(true);
      engineRef.current?.duck(true);
    };
    const onIdle = () => {
      duckCountRef.current = Math.max(0, duckCountRef.current - 1);
      if (duckCountRef.current > 0) return; // another announcement still active
      setDucked(false);
      engineRef.current?.duck(false);
    };
    window.addEventListener('radio:active', onActive as EventListener);
    window.addEventListener('radio:idle',   onIdle   as EventListener);
    return () => {
      window.removeEventListener('radio:active', onActive as EventListener);
      window.removeEventListener('radio:idle',   onIdle   as EventListener);
    };
  }, []);

  // Dispose the engine on unmount.
  useEffect(() => {
    return () => { engineRef.current?.dispose(); engineRef.current = null; };
  }, []);

  // ---- controls --------------------------------------------------------------
  const claimLeadership = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('audio:claim-leadership'));
  };

  const togglePlay = useCallback(async () => {
    if (!enabled) {
      claimLeadership();
      playIntentRef.current = true; try { window.localStorage.setItem(LS_PLAYING, '1'); } catch { /* ignore */ }
      setEnabled(true);
      return;
    }
    // The library is an <audio> element, not the ambient engine, so Play/Pause
    // has to act on whichever source is selected. Without this the button did
    // nothing at all in library mode.
    if (sourceRef.current === 'library') {
      if (playing) {
        playIntentRef.current = false;
        try { window.localStorage.setItem(LS_PLAYING, '0'); } catch { /* ignore */ }
        library.stop();
        setPlaying(false);
      } else {
        claimLeadership();
        playIntentRef.current = true;
        try { window.localStorage.setItem(LS_PLAYING, '1'); } catch { /* ignore */ }
        // Enabling the hook is what starts playback; it owns the element.
        setPlaying(true);
      }
      return;
    }

    const eng = engineRef.current;
    if (eng && eng.audible()) {
      // Pause
      playIntentRef.current = false;
      try { window.localStorage.setItem(LS_PLAYING, '0'); } catch { /* ignore */ }
      eng.pause();
      setPlaying(false);
    } else {
      // Play
      claimLeadership();
      playIntentRef.current = true;
      try { window.localStorage.setItem(LS_PLAYING, '1'); } catch { /* ignore */ }
      await startEngine();
    }
  }, [enabled, startEngine, playing, library]);

  const changePreset = useCallback(async (step: 1 | -1) => {
    const next = (presetRef.current + step + PRESET_NAMES.length) % PRESET_NAMES.length;
    setPreset(next);
    presetRef.current = next;
    if (!enabled) return;
    claimLeadership();
    playIntentRef.current = true;
    try { window.localStorage.setItem(LS_PLAYING, '1'); } catch { /* ignore */ }
    const eng = getEngine();
    eng.setVolume(volume);
    const audible = await eng.start(next);
    setPlaying(audible);
    setError(audible ? null : 'Tap anywhere to start the ambient sound.');
  }, [enabled, volume, getEngine]);

  const headerLabel = useMemo(() => {
    if (ducked)             return 'Ducked (radio)';
    if (enabled && playing) return PRESET_NAMES[preset] || 'Playing';
    if (enabled)            return 'Paused';
    return 'Off';
  }, [ducked, enabled, playing, preset]);

  // ---- autohide: re-collapse the expanded panel after a short idle period ----
  const AUTOHIDE_MS = 5000;
  const autohideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutohide = useCallback(() => {
    if (autohideTimerRef.current) { clearTimeout(autohideTimerRef.current); autohideTimerRef.current = null; }
  }, []);
  const armAutohide = useCallback(() => {
    clearAutohide();
    autohideTimerRef.current = setTimeout(() => collapse(), AUTOHIDE_MS);
  }, [clearAutohide, collapse]);
  useEffect(() => {
    if (mode !== 'music') { clearAutohide(); return; }
    armAutohide();
    return clearAutohide;
  }, [mode, enabled, playing, preset, volume, armAutohide, clearAutohide]);
  useEffect(() => clearAutohide, [clearAutohide]);

  // Report active-playing state to the combined media hub (green badge).
  useEffect(() => {
    setMusicActive(enabled && playing && !ducked);
  }, [enabled, playing, ducked, setMusicActive]);

  return (
    <DockSlot anchor="bottom-right" order={DOCK_ORDER.music}>
    <div onMouseEnter={clearAutohide} onMouseLeave={armAutohide}>
      {mode === 'music' && (
        <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={collapse}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-gray-50 max-w-[20rem]"
          >
            <Music className={`w-4 h-4 flex-shrink-0 ${ducked ? 'text-amber-500' : enabled && playing ? 'text-green-600' : 'text-gray-400'}`} />
            <span className="text-xs font-semibold text-gray-700">{source === 'library' ? 'Theatre music' : 'Ambient sound'}</span>
            <span className="ml-auto text-[10px] text-gray-500 truncate max-w-[10rem]" title={headerLabel}>{headerLabel}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          <div className="px-3 pb-3 pt-1 space-y-2 w-80 max-w-[88vw]" onClick={clearAutohide}>
            {/* Source. The generated soundscape needs nothing installed, so it
                stays the default; the library appears as a choice only when
                somebody has actually put music on the server. */}
            <div className="flex rounded-lg border border-gray-200 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setSource('ambient')}
                className={`flex-1 rounded px-2 py-1 font-medium ${source === 'ambient' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Ambient
              </button>
              <button
                type="button"
                onClick={() => setSource('library')}
                disabled={library.loaded && library.tracks.length === 0 && !category}
                title={library.loaded && library.tracks.length === 0 ? 'No music files installed on this server yet' : undefined}
                className={`flex-1 rounded px-2 py-1 font-medium disabled:opacity-40 ${source === 'library' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Music library
              </button>
            </div>

            {source === 'ambient' ? (
              <div className="text-[11px] text-gray-700 leading-tight min-h-[2.2rem]">
                <div className="font-semibold truncate" title={PRESET_NAMES[preset]}>{PRESET_NAMES[preset]}</div>
                <div className="text-gray-500 truncate">Royalty-free ambient soundscape</div>
              </div>
            ) : (
              <div className="text-[11px] text-gray-700 leading-tight min-h-[2.2rem]">
                {!library.loaded ? (
                  <div className="text-gray-500">Reading the library…</div>
                ) : library.tracks.length === 0 ? (
                  // Says where to put the files rather than just reporting empty.
                  <div className="text-gray-500">
                    No music installed. Copy audio files into
                    {' '}<code className="text-[10px]">public/audio/library/</code>.
                  </div>
                ) : (
                  <>
                    <div className="font-semibold truncate" title={library.current?.title}>
                      {library.current?.title ?? '—'}
                    </div>
                    <div className="text-gray-500 truncate">
                      {[library.current?.artist, library.current?.category].filter(Boolean).join(' · ') || 'Theatre library'}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Category picker, only when the library holds more than one. */}
            {source === 'library' && library.categories.length > 1 && (
              <select
                value={category ?? ''}
                onChange={(e) => setCategory(e.target.value || null)}
                aria-label="Music category"
                className="w-full rounded border border-gray-200 px-2 py-1 text-[11px]"
              >
                <option value="">All categories</option>
                {library.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            <div className="flex items-center gap-1">
              <button type="button"
                onClick={() => (source === 'library' ? library.previous() : changePreset(-1))}
                className="p-1.5 rounded border text-xs hover:bg-gray-50"
                title={source === 'library' ? 'Previous track' : 'Previous soundscape'}>
                <SkipBack className="w-3 h-3" />
              </button>
              <button type="button" onClick={togglePlay}
                className="px-2 py-1 rounded border text-xs flex items-center gap-1 hover:bg-gray-50 flex-1 justify-center">
                {enabled && playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {enabled && playing ? 'Pause' : enabled ? 'Play' : 'Enable'}
              </button>
              <button type="button"
                onClick={() => (source === 'library' ? library.next() : changePreset(1))}
                className="p-1.5 rounded border text-xs hover:bg-gray-50"
                title={source === 'library' ? 'Next track' : 'Next soundscape'}>
                <SkipForward className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {volume === 0 ? <VolumeX className="w-3 h-3 text-gray-500" /> : <Volume2 className="w-3 h-3 text-gray-500" />}
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1" aria-label="Ambient volume" />
              <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round(volume * 100)}%</span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>
                {source === 'library'
                  ? `${library.tracks.length} track${library.tracks.length === 1 ? '' : 's'}${category ? ` in ${category}` : ''}`
                  : `${preset + 1} / ${PRESET_NAMES.length} soundscapes`}
              </span>
              <button type="button" onClick={() => setEnabled(false)} disabled={!enabled}
                className="px-2 py-0.5 rounded border hover:bg-gray-50 disabled:opacity-40">
                Off
              </button>
            </div>

            <p className="text-[10px] text-gray-500 leading-snug">
              Ambient sound softens automatically while the radio plays an announcement or emergency alert.
            </p>
            {error && <p className="text-[10px] text-amber-600">{error}</p>}
            {source === 'library' && library.error && (
              <p className="text-[10px] text-amber-600">{library.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
    </DockSlot>
  );
}
