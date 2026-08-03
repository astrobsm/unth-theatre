/**
 * Kokoro TTS worker — neural speech OFF the main thread.
 * ------------------------------------------------------
 * Why this file exists, and why it is a plain file in `public/` rather than a
 * bundled module:
 *
 * Kokoro is an 82M-parameter model executed through onnxruntime WASM. Run on
 * the main thread it blocks everything while it synthesises — on a mid-range
 * Android that is seconds per announcement, during which the page is frozen
 * and the emergency Acknowledge button cannot be tapped. That was reported
 * from a phone and is the reason this worker exists.
 *
 * A worker has its own thread. The model loads and synthesises there; the main
 * thread only receives finished audio bytes and plays them. The interface
 * stays responsive throughout, and the voice stays human.
 *
 * It is NOT bundled because onnxruntime's WASM build uses `import.meta`, which
 * breaks webpack/Terser at build time — the same reason the main-thread path
 * loads it from a CDN with `webpackIgnore`. A static module worker can use a
 * native dynamic import, so the bundler never sees it.
 *
 * Protocol (main thread -> worker):
 *   { type: 'init',     voice? }
 *   { type: 'generate', id, text, voice? }
 * (worker -> main thread):
 *   { type: 'ready' }
 *   { type: 'error',  stage, message }
 *   { type: 'audio',  id, buffer }      // ArrayBuffer of a WAV, transferred
 *   { type: 'failed', id, message }
 */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
  'https://esm.sh/kokoro-js@1.2.1',
];

let voice = 'af_heart';
let ttsPromise = null;

async function importKokoro() {
  let lastErr = null;
  for (const url of CDN_URLS) {
    try {
      const mod = await import(url);
      const KokoroTTS = mod.KokoroTTS || mod.default?.KokoroTTS || mod.default;
      if (KokoroTTS && typeof KokoroTTS.from_pretrained === 'function') {
        return { mod, KokoroTTS };
      }
      lastErr = new Error('kokoro-js did not expose KokoroTTS');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('kokoro-js could not be loaded from any CDN');
}

function loadEngine() {
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    const { mod, KokoroTTS } = await importKokoro();

    // Quieten onnxruntime's benign notices, which it routes through
    // console.error and which otherwise look like failures.
    try {
      const env = mod.env || mod.default?.env;
      if (env?.backends?.onnx) env.backends.onnx.logLevel = 'error';
      if (env?.backends?.onnx?.wasm) env.backends.onnx.wasm.logLevel = 'error';
    } catch { /* best effort */ }

    // WASM q8 first: it works everywhere. WebGPU is faster but its adapter is
    // unreliable across drivers, and a half-initialised engine used to disable
    // the natural voice entirely.
    const configs = [{ device: 'wasm', dtype: 'q8' }];
    if (typeof navigator !== 'undefined' && navigator.gpu != null) {
      configs.push({ device: 'webgpu', dtype: 'fp32' });
    }

    let lastErr = null;
    for (const cfg of configs) {
      try {
        return await KokoroTTS.from_pretrained(MODEL_ID, cfg);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Kokoro model failed to load');
  })().catch((err) => {
    // Allow a later retry rather than poisoning the worker for its lifetime.
    ttsPromise = null;
    throw err;
  });
  return ttsPromise;
}

self.onmessage = async (event) => {
  const msg = event.data || {};

  if (msg.type === 'init') {
    if (msg.voice) voice = msg.voice;
    try {
      await loadEngine();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'error',
        stage: 'init',
        message: String(err && err.message ? err.message : err),
      });
    }
    return;
  }

  if (msg.type === 'generate') {
    const { id, text } = msg;
    try {
      const tts = await loadEngine();
      const audio = await tts.generate(text, { voice: msg.voice || voice });
      const blob = typeof audio.toBlob === 'function' ? audio.toBlob() : audio;
      const buffer = await blob.arrayBuffer();
      // Transferred, not copied: a few hundred kilobytes of WAV should not be
      // duplicated across the thread boundary.
      self.postMessage({ type: 'audio', id, buffer }, [buffer]);
    } catch (err) {
      self.postMessage({
        type: 'failed',
        id,
        message: String(err && err.message ? err.message : err),
      });
    }
  }
};
