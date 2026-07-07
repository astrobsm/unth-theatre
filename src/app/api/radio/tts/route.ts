import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/radio/tts
 * Body: { text: string }
 *
 * Proxies the ElevenLabs text-to-speech API and returns an MP3 stream that the
 * Theatre Radio and emergency-alert players use to voice every announcement.
 *
 * Configuration (set in .env.local locally and in Vercel for production):
 *   ELEVENLABS_API_KEY   - required, the ElevenLabs API key (secret)
 *   ELEVENLABS_VOICE_ID  - optional, defaults to the shared library voice below
 *   ELEVENLABS_MODEL_ID  - optional, defaults to eleven_multilingual_v2
 *
 * If the API key is missing or ElevenLabs errors out, this route responds with
 * a non-200 status so the browser clients transparently fall back to the
 * built-in Web Speech (speechSynthesis) voice.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Voice ID from https://elevenlabs.io/app/voice-library?voiceId=ygEVplYAGZ9epkJkyj4V
// Voice IDs are shareable identifiers (not secrets); the API key is the secret.
// Overridable per-deployment via the ELEVENLABS_VOICE_ID env var.
const DEFAULT_VOICE_ID = 'ygEVplYAGZ9epkJkyj4V';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';

// Small in-memory LRU cache. Radio announcements repeat (e.g. emergency calls
// every 5 minutes), so caching the rendered audio by text avoids burning
// ElevenLabs quota on identical messages. Cleared on cold start.
const CACHE_MAX = 60;
const audioCache = new Map<string, ArrayBuffer>();

function cacheKey(voice: string, model: string, text: string): string {
  return `${voice}::${model}::${text}`;
}

function cacheGet(key: string): ArrayBuffer | undefined {
  const hit = audioCache.get(key);
  if (hit) {
    // refresh recency
    audioCache.delete(key);
    audioCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: ArrayBuffer): void {
  audioCache.set(key, value);
  while (audioCache.size > CACHE_MAX) {
    const oldest = audioCache.keys().next().value;
    if (oldest === undefined) break;
    audioCache.delete(oldest);
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'ElevenLabs not configured. Set ELEVENLABS_API_KEY env var.' },
      { status: 503 },
    );
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (text.length > 5000) {
    return NextResponse.json({ error: 'text exceeds 5000-character limit per request' }, { status: 413 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;
  const ck = cacheKey(voiceId, modelId, text);

  // Serve from cache when possible.
  const cached = cacheGet(ck);
  if (cached) {
    return new NextResponse(cached, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(cached.byteLength),
        'Cache-Control': 'public, max-age=86400',
        'X-TTS-Cache': 'HIT',
      },
    });
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
      cache: 'no-store',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to reach ElevenLabs: ${err?.message || 'network error'}` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `ElevenLabs responded ${upstream.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  cacheSet(ck, buf);

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'public, max-age=86400',
      'X-TTS-Cache': 'MISS',
    },
  });
}

/**
 * GET /api/radio/tts  — diagnostic (no audio).
 *
 * Reports whether the natural (ElevenLabs) voice is actually usable right now,
 * WITHOUT ever exposing the secret API key. Open this URL in the browser (while
 * signed in) to find out why announcements are using the robotic browser voice.
 *
 * Returns JSON like:
 *   { configured: true, ok: true,  voiceId, modelId }                      → natural voice working
 *   { configured: false, ok: false, reason: "ELEVENLABS_API_KEY not set" } → key missing on server
 *   { configured: true,  ok: false, upstreamStatus: 401, detail: "..." }   → key invalid / quota / voice rejected
 */
export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

  if (!key) {
    return NextResponse.json({
      configured: false,
      ok: false,
      voiceId,
      modelId,
      reason:
        'ELEVENLABS_API_KEY is not set on the server. All announcements fall back to the built-in robotic browser voice until it is configured in the deployment (e.g. Vercel → Settings → Environment Variables) and the app is redeployed.',
    });
  }

  // Tiny live probe so we can distinguish "key present but rejected" (invalid /
  // out of quota / bad voice) from a genuinely working configuration.
  try {
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text: 'test', model_id: modelId }),
      cache: 'no-store',
    });
    if (upstream.ok) {
      return NextResponse.json({
        configured: true,
        ok: true,
        voiceId,
        modelId,
        keyLength: key.length, // length only — never the value
        message: 'ElevenLabs is configured and responding. The natural voice is active.',
      });
    }
    const detail = await upstream.text().catch(() => '');
    return NextResponse.json({
      configured: true,
      ok: false,
      voiceId,
      modelId,
      upstreamStatus: upstream.status,
      detail: detail.slice(0, 500),
      reason:
        upstream.status === 401
          ? 'ElevenLabs rejected the API key (invalid or revoked). Announcements will use the robotic browser voice until a valid key is set.'
          : upstream.status === 429
          ? 'ElevenLabs quota/credits exhausted (HTTP 429). Announcements will use the robotic browser voice until the plan is topped up or reset.'
          : `ElevenLabs rejected the request (HTTP ${upstream.status}). Check the API key, plan, and voice ID.`,
    });
  } catch (err: any) {
    return NextResponse.json({
      configured: true,
      ok: false,
      voiceId,
      modelId,
      reason: `Could not reach ElevenLabs: ${err?.message || 'network error'}.`,
    });
  }
}
