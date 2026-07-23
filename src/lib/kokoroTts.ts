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

// Kokoro load-failure handling. Rather than disabling permanently after a
// single transient blip (which would leave every announcement on the robotic
// voice for the whole session), we retry a few times with a cool-down and only
// give up after repeated failures.
let kokoroFailures = 0;
let kokoroRetryAt = 0; // epoch ms before which we won't re-attempt a load
const KOKORO_MAX_FAILURES = 4;
const KOKORO_RETRY_COOLDOWN_MS = 30_000;

function kokoroGivenUp(): boolean {
  return kokoroFailures >= KOKORO_MAX_FAILURES;
}
function kokoroInCooldown(): boolean {
  return Date.now() < kokoroRetryAt;
}

// Singleton model promise so the ~80 MB model is only downloaded / initialised
// once per page session.
let ttsPromise: Promise<any> | null = null;
// True only once the engine has finished loading and can synthesise NOW.
// Callers use this to avoid awaiting a cold load on a latency-critical path.
let ttsReady = false;

// CDN sources for kokoro-js (native ESM, incl. transformers.js + onnxruntime).
// jsdelivr first, esm.sh as a fallback if the first host is blocked/slow.
const KOKORO_CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
  'https://esm.sh/kokoro-js@1.2.1',
];

async function importKokoroModule(): Promise<any> {
  let lastErr: unknown = null;
  for (const url of KOKORO_CDN_URLS) {
    try {
      const mod: any = await import(/* webpackIgnore: true */ url);
      const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS || mod.default;
      if (KokoroTTS && typeof KokoroTTS.from_pretrained === 'function') {
        return mod;
      }
      lastErr = new Error('kokoro-js module did not expose KokoroTTS');
    } catch (e) {
      lastErr = e;
      console.warn('[kokoro] CDN load failed, trying next source:', url, e);
    }
  }
  throw lastErr || new Error('kokoro-js could not be loaded from any CDN');
}

async function getKokoro(): Promise<any> {
  if (kokoroGivenUp()) throw new Error('Kokoro unavailable this session');
  if (kokoroInCooldown()) throw new Error('Kokoro cooling down after a failure');
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    // Load kokoro-js as native ESM from a CDN at runtime. We deliberately do
    // NOT bundle it: the onnxruntime WASM build uses `import.meta`, which breaks
    // webpack/Terser at build time. `webpackIgnore` keeps the bundler out of it
    // entirely; the browser fetches + caches the module for later fast loads.
    const mod: any = await importKokoroModule();
    const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS || mod.default;

    // Quieten the ONNX runtime's benign "warning" notices (routed through
    // console.error), so they don't look like failures.
    try {
      const env = mod.env || mod.default?.env;
      if (env?.backends?.onnx) env.backends.onnx.logLevel = 'error';
      if (env?.backends?.onnx?.wasm) env.backends.onnx.wasm.logLevel = 'error';
    } catch { /* best-effort */ }

    // Try each execution config in order and use the FIRST that loads. WASM
    // (q8) is listed first because it works on every device/browser reliably;
    // WebGPU is faster but flaky (adapter/driver issues) and previously caused
    // the engine to be disabled on devices where it half-initialised — which is
    // why every device fell back to the robotic voice. Loading a working
    // engine here guarantees the natural voice works everywhere.
    const configs: Array<{ device: 'wasm' | 'webgpu'; dtype: 'q8' | 'fp32' }> = [
      { device: 'wasm', dtype: 'q8' },
    ];
    // Offer WebGPU as a secondary (faster) attempt only if present.
    if (typeof navigator !== 'undefined' && (navigator as any).gpu != null) {
      configs.push({ device: 'webgpu', dtype: 'fp32' });
    }

    let lastErr: unknown = null;
    for (const cfg of configs) {
      try {
        const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, cfg);
        ttsReady = true;
        console.info(`[kokoro] TTS engine ready (${cfg.device}/${cfg.dtype}).`);
        return tts;
      } catch (e) {
        lastErr = e;
        console.warn(`[kokoro] from_pretrained failed for ${cfg.device}/${cfg.dtype}, trying next.`, e);
      }
    }
    throw lastErr || new Error('Kokoro model failed to load');
  })().catch((err) => {
    // Reset so a later attempt can retry after a cool-down; only give up after
    // several failures so a transient CDN/network blip doesn't force the
    // robotic voice for the whole session.
    ttsPromise = null;
    kokoroFailures += 1;
    kokoroRetryAt = Date.now() + KOKORO_RETRY_COOLDOWN_MS;
    console.warn(
      `[kokoro] Init failed (attempt ${kokoroFailures}/${KOKORO_MAX_FAILURES}) — using browser voice meanwhile.`,
      err
    );
    throw err;
  });
  return ttsPromise;
}

/**
 * Kick off model loading in the background (e.g. right after login on a radio /
 * announcement display) so the first real announcement plays without delay.
 */
export function preloadKokoro(): void {
  if (kokoroGivenUp() || kokoroInCooldown() || ttsPromise) return;
  if (!shouldAutoLoadModel()) return;
  // Fire and forget — never throws to the caller.
  getKokoro().catch(() => {});
}

/**
 * Whether it is reasonable to pull the model down automatically.
 *
 * It is ~86 MB and initialises onnxruntime WASM on the MAIN THREAD, so on a
 * metered link or a low-memory handset the automatic download costs the user
 * real money and janks the UI — a bad trade for a nicer voice. Those devices
 * keep the built-in browser voice, which is instant, free and always available.
 * An explicit user action can still load it via getKokoro().
 */
function shouldAutoLoadModel(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (conn?.saveData) return false;
  if (typeof conn?.effectiveType === 'string' && /2g|3g/.test(conn.effectiveType)) return false;
  const memGb = (navigator as any).deviceMemory;
  if (typeof memGb === 'number' && memGb > 0 && memGb < 4) return false;
  return true;
}

export function isKokoroAvailable(): boolean {
  // Available unless we've given up for the session or are briefly cooling down.
  return !kokoroGivenUp() && !kokoroInCooldown();
}

/**
 * True only when the engine is loaded and can synthesise immediately.
 *
 * `isKokoroAvailable()` means "worth trying eventually"; this means "will not
 * block". Latency-critical callers (emergency announcements) must use this one.
 */
export function isKokoroReady(): boolean {
  return ttsReady;
}

/**
 * Wait up to `timeoutMs` for the engine to become usable, starting a background
 * load if one is not already running. Resolves `true` only if it is ready in
 * time — never rejects, never waits longer than asked.
 *
 * This exists so a surface that can afford a moment (the theatre radio, the
 * announcement kiosk) gets the natural voice on its FIRST announcement instead
 * of the robotic one, while latency-critical callers (emergency alerts) keep
 * passing 0 and fall through immediately as before.
 */
export function whenKokoroReady(timeoutMs = 0): Promise<boolean> {
  if (ttsReady) return Promise.resolve(true);
  if (timeoutMs <= 0 || !isKokoroAvailable()) return Promise.resolve(false);
  if (!ttsPromise) {
    preloadKokoro();
    // Auto-load was declined (metered link / low-memory device) — don't stall.
    if (!ttsPromise) return Promise.resolve(false);
  }
  const pending = ttsPromise;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    pending.then(
      () => { clearTimeout(timer); finish(ttsReady); },
      () => { clearTimeout(timer); finish(false); }
    );
  });
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
  if (!clean || typeof window === 'undefined' || kokoroGivenUp()) return false;

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
