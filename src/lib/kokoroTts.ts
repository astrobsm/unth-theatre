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

// ---------------------------------------------------------------------------
// Worker-backed synthesis — the path that keeps the UI responsive
// ---------------------------------------------------------------------------
// Kokoro executes an 82M-parameter model through onnxruntime WASM. On the main
// thread that blocks everything while it synthesises: on a mid-range Android,
// seconds per announcement, during which the emergency Acknowledge button
// cannot be tapped. Reported from a phone.
//
// So synthesis happens in a worker whenever the browser supports module
// workers (Chrome/Edge/Android Chrome, Safari 15+, Firefox 114+ — i.e. every
// device this hospital uses). The main thread receives finished WAV bytes and
// plays them, and never runs the model itself.
//
// The main-thread path below is kept only for browsers without module workers,
// and urgent callers refuse it — see `speakViaKokoro`.

type PendingJob = {
  resolve: (buf: ArrayBuffer | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let workerReady = false;
let workerBroken = false;
let workerJobSeq = 0;
const workerJobs = new Map<number, PendingJob>();

/** Module workers are required for the CDN dynamic import inside the worker. */
function workerSupported(): boolean {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return false;
  if (workerBroken) return false;
  try {
    // Feature-detect `{ type: 'module' }` support without constructing a real
    // worker: browsers that ignore the option would silently run classic mode
    // and fail on the first import.
    let supported = false;
    const probe = { get type() { supported = true; return 'module'; } };
    // The probe constructs a real worker, so terminate it — otherwise every
    // capability check would leak a thread.
    const w = new Worker('data:text/javascript,', probe as WorkerOptions);
    w.terminate();
    return supported;
  } catch {
    return false;
  }
}

function ensureWorker(): Worker | null {
  if (worker || workerBroken) return worker;
  if (!workerSupported()) {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker('/kokoro-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data || {};
      if (msg.type === 'ready') {
        workerReady = true;
        ttsReady = true;
        console.info('[kokoro] TTS engine ready (worker).');
        return;
      }
      if (msg.type === 'error') {
        // Init failed inside the worker: fall back to the main-thread engine
        // for non-urgent speech rather than losing the natural voice entirely.
        workerBroken = true;
        console.warn('[kokoro] worker init failed; falling back.', msg.message);
        return;
      }
      if (msg.type === 'audio') {
        const job = workerJobs.get(msg.id);
        if (job) {
          clearTimeout(job.timer);
          workerJobs.delete(msg.id);
          job.resolve(msg.buffer as ArrayBuffer);
        }
        return;
      }
      if (msg.type === 'failed') {
        const job = workerJobs.get(msg.id);
        if (job) {
          clearTimeout(job.timer);
          workerJobs.delete(msg.id);
          job.resolve(null);
        }
      }
    };
    worker.onerror = () => {
      workerBroken = true;
      workerReady = false;
      // Array.from: this project has no `target` in tsconfig, so direct Map
      // iteration needs downlevelIteration. Same pattern as elsewhere.
      for (const job of Array.from(workerJobs.values())) {
        clearTimeout(job.timer);
        job.resolve(null);
      }
      workerJobs.clear();
    };
    worker.postMessage({ type: 'init', voice: KOKORO_VOICE });
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** True when synthesis can run without touching the main thread. */
export function isKokoroWorkerReady(): boolean {
  return workerReady && !workerBroken;
}

/** How long to wait for one sentence before giving up and using another voice. */
const WORKER_JOB_TIMEOUT_MS = 20_000;

function generateInWorker(text: string): Promise<ArrayBuffer | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = ++workerJobSeq;
  return new Promise<ArrayBuffer | null>((resolve) => {
    const timer = setTimeout(() => {
      workerJobs.delete(id);
      resolve(null);
    }, WORKER_JOB_TIMEOUT_MS);
    workerJobs.set(id, { resolve, timer });
    try {
      w.postMessage({ type: 'generate', id, text, voice: KOKORO_VOICE });
    } catch {
      clearTimeout(timer);
      workerJobs.delete(id);
      resolve(null);
    }
  });
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
  if (kokoroGivenUp() || kokoroInCooldown()) return;
  if (!shouldAutoLoadModel()) return;
  // Warm the WORKER first — that is the path that will actually be used, and
  // warming it costs the main thread nothing.
  if (!workerBroken && ensureWorker()) return;
  if (ttsPromise) return;
  // No module workers on this browser: warm the in-page engine so non-urgent
  // announcements still get the natural voice.
  getKokoro().catch(() => {});
}

/**
 * Whether it is reasonable to pull the model down automatically.
 *
 * This gate was written when synthesis ran on the main thread, and it refused
 * any handset reporting under 4 GB — which is most mid-range Android in this
 * hospital. The effect was that the devices staff actually carry never got the
 * natural voice at all.
 *
 * Now that the model runs in a worker, jank is no longer the reason to refuse
 * it. What remains is real: ~86 MB of download on a metered link costs the
 * user money, and a genuinely small device may have the tab killed for holding
 * the model. So the data checks stay and the memory floor drops to the point
 * where it is about survival rather than smoothness.
 */
function shouldAutoLoadModel(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  // Data saver on, or a genuinely slow link: the download is not a kindness.
  if (conn?.saveData) return false;
  if (typeof conn?.effectiveType === 'string' && /(^|[^3])2g/.test(conn.effectiveType)) return false;
  const memGb = (navigator as any).deviceMemory;
  if (typeof memGb === 'number' && memGb > 0 && memGb < 2) return false;
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

/**
 * @param allowMainThread false for urgent speech: better a plainer voice than
 *   a frozen Acknowledge button.
 */
async function getKokoroAudioUrl(text: string, allowMainThread = true): Promise<string | null> {
  const cached = urlCache.get(text);
  if (cached) return cached;

  // Preferred path: synthesise in the worker. The main thread stays free, so
  // this is safe even for an emergency that repeats every thirty seconds.
  if (!workerBroken && ensureWorker()) {
    const buf = await generateInWorker(text);
    if (buf && buf.byteLength > 0) {
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      rememberUrl(text, url);
      return url;
    }
    // Worker could not produce audio. Urgent callers stop here rather than
    // moving the model onto the thread that draws the interface.
    if (!allowMainThread) return null;
  }

  if (!allowMainThread) return null;

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
  /**
   * This announcement must not cost the interface a frame.
   *
   * Worker synthesis is still used — it does not touch the main thread. Only
   * the in-page fallback engine is refused.
   */
  urgent?: boolean;
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

  const url = await getKokoroAudioUrl(clean, !hooks.urgent);
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
