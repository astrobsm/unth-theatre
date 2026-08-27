'use client';

/**
 * Plays the theatre's own music files, and gets out of the way when somebody
 * speaks.
 *
 * The existing background player synthesises ambience through the Web Audio
 * API — no files, no licensing, works offline. Excellent for a hum; it is not
 * Bach. This adds real recordings from the library folder, alongside it rather
 * than instead of it, so a theatre that prefers the generated soundscape keeps
 * it.
 *
 * TWO RULES THIS MUST NEVER BREAK
 *
 * 1. It ducks for the radio. Announcements, the send-for-patient call and every
 *    emergency alert raise `radio:active` and lower `radio:idle`. Music drops to
 *    a background level while any of them is speaking and comes back after. It
 *    does not pause: a track stopping dead is itself a distraction in a theatre.
 *
 * 2. Only the leader window plays. The same election the ambient player and the
 *    radio use, so three open tabs on one desk cannot play three tracks.
 *
 * Ducking is REFERENCE COUNTED. Two announcements overlapping raise two
 * `radio:active` events, and music must stay down until the second one ends —
 * a naive boolean comes back up under the tail of the first.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string | null;
  category: string;
  url: string;
  sizeBytes: number;
}

/** How far music drops while something is being announced. */
const DUCK_GAIN = 0.15;
/** Seconds to fade, so the drop is noticed as "something is being said". */
const FADE_MS = 400;

export function useMusicLibrary(opts: {
  enabled: boolean;
  isLeader: boolean;
  volume: number;
  category?: string | null;
}) {
  const { enabled, isLeader, volume, category } = opts;

  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ducked, setDucked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const duckCountRef = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const filtered = category
    ? tracks.filter((t) => t.category === category)
    : tracks;

  // ---- the library ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetch('/api/music/library', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tracks: [], categories: [] }))
      .then((d) => {
        if (cancelled) return;
        setTracks(Array.isArray(d.tracks) ? d.tracks : []);
        setCategories(Array.isArray(d.categories) ? d.categories : []);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // ---- the element ---------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = new Audio();
    el.preload = 'none'; // a library is not downloaded until somebody plays it
    el.volume = volumeRef.current;
    audioRef.current = el;
    return () => { el.pause(); el.src = ''; audioRef.current = null; };
  }, []);

  /** Fade rather than jump — an abrupt level change reads as a fault. */
  const rampTo = useCallback((target: number) => {
    const el = audioRef.current;
    if (!el) return;
    const from = el.volume;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  // ---- ducking -------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onActive = () => {
      duckCountRef.current += 1;
      if (duckCountRef.current > 1) return;
      setDucked(true);
      rampTo(volumeRef.current * DUCK_GAIN);
    };
    const onIdle = () => {
      duckCountRef.current = Math.max(0, duckCountRef.current - 1);
      if (duckCountRef.current > 0) return; // another announcement still running
      setDucked(false);
      rampTo(volumeRef.current);
    };
    window.addEventListener('radio:active', onActive as EventListener);
    window.addEventListener('radio:idle', onIdle as EventListener);
    return () => {
      window.removeEventListener('radio:active', onActive as EventListener);
      window.removeEventListener('radio:idle', onIdle as EventListener);
    };
  }, [rampTo]);

  // Volume changes respect whatever ducking state we are in.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = duckCountRef.current > 0 ? volume * DUCK_GAIN : volume;
  }, [volume]);

  const next = useCallback(() => {
    setIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
  }, [filtered.length]);

  const previous = useCallback(() => {
    setIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
  }, [filtered.length]);

  // ---- play / advance ------------------------------------------------------
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    // Not the leader, switched off, or nothing in the folder: silence.
    if (!enabled || !isLeader || filtered.length === 0) {
      el.pause();
      setPlaying(false);
      return;
    }

    const track = filtered[Math.min(index, filtered.length - 1)];
    if (!track) return;

    const wanted = track.url;
    if (!el.src.endsWith(encodeURI(wanted)) && !el.src.endsWith(wanted)) {
      el.src = wanted;
    }

    const onEnded = () => next();
    // A missing or unplayable file skips on rather than stopping the library.
    // One bad upload must not silence the theatre for the rest of the day.
    const onError = () => {
      setError(`Could not play "${track.title}" — skipping.`);
      next();
    };
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    el.play()
      .then(() => { setPlaying(true); setError(null); })
      .catch(() => {
        // Autoplay refused until the page is touched. Expected, not a failure.
        setPlaying(false);
      });

    return () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [enabled, isLeader, index, filtered, next]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  return {
    tracks: filtered,
    categories,
    loaded,
    /** Null when the folder is empty — the caller shows "no music installed". */
    current: filtered[Math.min(index, Math.max(0, filtered.length - 1))] ?? null,
    playing,
    ducked,
    error,
    next,
    previous,
    stop,
  };
}
