// Client-side helper for voicing announcements.
// -----------------------------------------------
// Every radio / emergency / workflow announcement is voiced by, in order:
//   1) Kokoro TTS   — free, in-browser neural voice (PRIMARY, see kokoroTts.ts)
//   2) ElevenLabs   — server proxy (/api/radio/tts), only if a key is configured
//   3) speechSynthesis — the built-in browser voice (caller fallback), picked
//      via lib/humanVoice.ts so it lands on the device's neural voice rather
//      than whichever legacy formant synth happens to be first in the list
// This makes natural speech work with no paid credits, while keeping graceful
// degradation on old browsers / blocked model downloads.

import {
  speakViaKokoro,
  isKokoroAvailable,
  isKokoroReady,
  preloadKokoro,
  whenKokoroReady,
  type KokoroSpeakHooks,
} from './kokoroTts';

export { preloadKokoro };

// Per-text in-flight object URL cache so repeated announcements reuse the blob.
const urlCache = new Map<string, string>();
const URL_CACHE_MAX = 40;

async function getAudioUrl(text: string): Promise<string | null> {
  const cached = urlCache.get(text);
  if (cached) return cached;
  try {
    const res = await fetch('/api/radio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // Surface a clear, one-time reason so the natural voice not working is
      // easy to diagnose (almost always a missing/invalid ELEVENLABS_API_KEY).
      warnTtsUnavailableOnce(res.status);
      return null;
    }
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(text, url);
    while (urlCache.size > URL_CACHE_MAX) {
      const oldest = urlCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const old = urlCache.get(oldest);
      urlCache.delete(oldest);
      if (old) {
        try { URL.revokeObjectURL(old); } catch { /* ignore */ }
      }
    }
    return url;
  } catch {
    return null;
  }
}

let ttsWarned = false;
function warnTtsUnavailableOnce(status: number): void {
  if (ttsWarned) return;
  ttsWarned = true;
  const reason =
    status === 503
      ? 'ElevenLabs is not configured on the server — set ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL_ID) in the deployment environment.'
      : `ElevenLabs TTS request failed (HTTP ${status}). The API key may be invalid, out of quota, or the voice ID rejected.`;
  console.warn(`[radio] Natural voice unavailable — falling back to the built-in browser voice. ${reason}`);
}

export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  /** Provide an existing <audio> element to reuse (helps with autoplay unlock). */
  getAudio?: () => HTMLAudioElement;
  /** 0..1 playback volume (default 1). */
  volume?: number;
  /**
   * How long this announcement may wait for a cold neural engine to finish
   * warming before falling through to a lesser voice (default 0 — no wait).
   * Non-urgent surfaces set a second or two so their first announcement is
   * still spoken in the natural voice; emergency paths leave it at 0.
   */
  warmupWaitMs?: number;
}

/**
 * Voice `text` using the ElevenLabs proxy. Resolves `true` when the audio
 * played to completion, or `false` if ElevenLabs was unavailable / failed
 * (the caller should then fall back to speechSynthesis). `onStart`/`onEnd`
 * always fire so ducking stays balanced.
 */
export async function speakViaElevenLabs(text: string, hooks: SpeakHooks = {}): Promise<boolean> {
  const clean = (text || '').trim();
  if (!clean || typeof window === 'undefined') return false;

  const url = await getAudioUrl(clean);
  if (!url) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      hooks.onEnd?.();
      resolve(ok);
    };
    try {
      const audio = hooks.getAudio?.() ?? new Audio();
      audio.src = url;
      audio.volume = typeof hooks.volume === 'number' ? hooks.volume : 1;
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      hooks.onStart?.();
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => finish(false));
      }
    } catch {
      finish(false);
    }
  });
}

/**
 * Voice `text` for a radio / workflow / emergency announcement using the best
 * available engine: Kokoro (free, in-browser) first, then the ElevenLabs proxy,
 * resolving `false` only when BOTH fail (the caller then uses speechSynthesis).
 *
 * All calls are GLOBALLY SERIALISED through a single queue, so no matter how
 * many surfaces (theatre radio, emergency display, announcement kiosk) fire at
 * once, announcements never overlap or talk over each other — each one waits
 * for the previous to finish. Hooks (`onStart`/`onEnd`, ducking volume, shared
 * <audio>) are forwarded to whichever engine actually plays.
 */
let speechChain: Promise<unknown> = Promise.resolve();

async function speakAnnouncementNow(
  text: string,
  hooks: SpeakHooks & KokoroSpeakHooks
): Promise<boolean> {
  const clean = (text || '').trim();
  if (!clean || typeof window === 'undefined') return false;

  // 1) Kokoro — free neural voice, but ONLY when the engine is already loaded.
  //
  // Awaiting a cold load here used to block the announcement behind an ~86 MB
  // model download that initialises WASM on the main thread. That froze the UI
  // (including the Acknowledge button) at precisely the moment an emergency
  // needed to be heard and actioned. A voice that arrives late is worse than a
  // plainer voice that arrives now, so warm the engine in the background and
  // let this announcement fall through to something that is ready.
  //
  // Callers that can afford a moment pass `warmupWaitMs`, which waits out a
  // cold load up to that bound only — so a page's first announcement still
  // gets the natural voice, without any caller ever waiting indefinitely.
  let ready = isKokoroReady();
  if (!ready && isKokoroAvailable()) {
    preloadKokoro(); // background warm-up; never awaited
    if (hooks.warmupWaitMs && hooks.warmupWaitMs > 0) {
      ready = await whenKokoroReady(hooks.warmupWaitMs);
    }
  }
  if (ready) {
    try {
      const ok = await speakViaKokoro(clean, hooks);
      if (ok) return true;
    } catch { /* fall through to ElevenLabs */ }
  }

  // 2) ElevenLabs proxy (only does anything if a key is configured server-side).
  try {
    const ok = await speakViaElevenLabs(clean, hooks);
    if (ok) return true;
  } catch { /* fall through */ }

  // 3) Signal the caller to use the built-in browser voice.
  return false;
}

export async function speakAnnouncement(
  text: string,
  hooks: SpeakHooks & KokoroSpeakHooks = {}
): Promise<boolean> {
  // Chain this announcement after any currently-playing/queued one so they are
  // spoken strictly one at a time (never simultaneously).
  const run = speechChain.then(() => speakAnnouncementNow(text, hooks));
  // Keep the chain alive regardless of this call's success/failure.
  speechChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
