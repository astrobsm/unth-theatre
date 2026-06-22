// Client-side helper for voicing announcements through the ElevenLabs proxy
// (/api/radio/tts). Every radio + emergency announcement tries ElevenLabs
// first; if the API key is missing, quota is exhausted, the device is offline,
// or anything else fails, callers fall back to the browser's speechSynthesis.

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
    if (!res.ok) return null;
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

export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  /** Provide an existing <audio> element to reuse (helps with autoplay unlock). */
  getAudio?: () => HTMLAudioElement;
  /** 0..1 playback volume (default 1). */
  volume?: number;
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
