'use client';

/**
 * Kokoro TTS — in-browser neural speech engine.
 * ---------------------------------------------
 * Runs the open-weight Kokoro-82M model entirely in the browser via kokoro-js
 * (transformers.js + onnxruntime-web). This is FREE — no API key, no per-use
 * credits — and after the first load the model is cached by the browser, so
 * subsequent announcements are instant and work without any paid service.
 *
 * It is the PRIMARY voice for all workflow / radio / emergency announcements
 * (patient arrival at the holding area, calls for patients, etc.). If the model
 * cannot load (very old browser, model download blocked), callers fall back to
 * the ElevenLabs proxy and finally the built-in browser voice.
 */

// The model + a natural, human-sounding default voice. "af_heart" is Kokoro's
// top-rated (grade A) voice. Overridable at runtime via setKokoroVoice().
const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let KOKORO_VOICE = 'af_heart';

// A curated shortlist of Kokoro's best humanoid voices, in case callers want to
// switch. (Full list is available on the model card.)
export const KOKORO_VOICES = {
  heart: 'af_heart', // warm female (A)
  bella: 'af_bella', // expressive female (A-)
  nicole: 'af_nicole', // soft female
  sarah: 'af_sarah', // clear female
  michael: 'am_michael', // natural male
  fenrir: 'am_fenrir', // deep male
  emma: 'bf_emma', // British female
} as const;

export function setKokoroVoice(voice: string) {
  if (voice && typeof voice === 'string') KOKORO_VOICE = voice;
}

// Whether Kokoro has been permanently disabled this session (e.g. the model
// failed to load). Prevents repeated slow load attempts on every announcement.
let kokoroDisabled = false;

// Singleton model promise so the ~80 MB model is only downloaded / initialised
// once per page session.
let ttsPromise: Promise<any> | null = null;

async function getKokoro(): Promise<any> {
  if (kokoroDisabled) throw new Error('Kokoro disabled');
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    // Load kokoro-js (and its heavy deps: transformers.js + onnxruntime-web) as
    // native ESM from a CDN at runtime. We deliberately do NOT bundle it: the
    // onnxruntime WASM build uses `import.meta`, which breaks webpack/Terser at
    // build time. `webpackIgnore` keeps the bundler out of it entirely; the
    // browser fetches the module directly (and the browser + transformers.js
    // cache it afterwards, so later loads are fast and work offline).
    const cdnUrl = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
    const mod: any = await import(/* webpackIgnore: true */ cdnUrl);
    const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS || mod.default;
    if (!KokoroTTS || typeof KokoroTTS.from_pretrained !== 'function') {
      throw new Error('kokoro-js module did not expose KokoroTTS');
    }
    // Prefer WebGPU (much faster) when available; otherwise fall back to WASM,
    // which is universally supported.
    const hasWebGPU =
      typeof navigator !== 'undefined' && (navigator as any).gpu != null;
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: hasWebGPU ? 'fp32' : 'q8',
      device: hasWebGPU ? 'webgpu' : 'wasm',
    });
    return tts;
  })().catch((err) => {
    // Reset so a later attempt can retry, but mark disabled to avoid hammering.
    ttsPromise = null;
    kokoroDisabled = true;
    console.warn('[kokoro] Failed to initialise in-browser TTS — falling back.', err);
    throw err;
  });
  return ttsPromise;
}

/**
 * Kick off model loading in the background (e.g. right after login on a radio /
 * announcement display) so the first real announcement plays without delay.
 */
export function preloadKokoro(): void {
  if (kokoroDisabled || ttsPromise) return;
  // Fire and forget — never throws to the caller.
  getKokoro().catch(() => {});
}

export function isKokoroAvailable(): boolean {
  return !kokoroDisabled;
}

// Cache rendered audio object URLs by text so repeated announcements (emergency
// calls repeat every few minutes) reuse the same blob instead of re-generating.
const urlCache = new Map<string, string>();
const URL_CACHE_MAX = 40;

function rememberUrl(text: string, url: string) {
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
}

async function getKokoroAudioUrl(text: string): Promise<string | null> {
  const cached = urlCache.get(text);
  if (cached) return cached;
  try {
    const tts = await getKokoro();
    const audio = await tts.generate(text, { voice: KOKORO_VOICE });
    // kokoro-js RawAudio exposes toBlob() → a WAV Blob.
    const blob: Blob = typeof audio.toBlob === 'function' ? audio.toBlob() : audio;
    if (!blob || (blob as Blob).size === 0) return null;
    const url = URL.createObjectURL(blob as Blob);
    rememberUrl(text, url);
    return url;
  } catch {
    return null;
  }
}

export interface KokoroSpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  /** Reuse an existing <audio> element (helps with autoplay unlock on kiosks). */
  getAudio?: () => HTMLAudioElement;
  /** 0..1 playback volume (default 1). */
  volume?: number;
}

/**
 * Voice `text` with Kokoro. Resolves `true` when the audio played to
 * completion, or `false` if Kokoro was unavailable / failed (the caller should
 * then try the next engine). `onStart`/`onEnd` always fire so audio ducking
 * stays balanced.
 */
export async function speakViaKokoro(
  text: string,
  hooks: KokoroSpeakHooks = {}
): Promise<boolean> {
  const clean = (text || '').trim();
  if (!clean || typeof window === 'undefined' || kokoroDisabled) return false;

  const url = await getKokoroAudioUrl(clean);
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
