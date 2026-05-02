import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/training/tts
 * Body: { text: string, voice?: string, format?: string }
 *
 * Proxies Azure Cognitive Services Speech "text-to-speech" REST API and returns
 * an MP3 audio stream. Requires:
 *   AZURE_SPEECH_KEY    - Azure Speech resource key (Keys & Endpoint blade)
 *   AZURE_SPEECH_REGION - e.g. "northeurope", "uksouth", "eastus"
 *
 * Optional defaults:
 *   AZURE_SPEECH_DEFAULT_VOICE  (default: en-NG-EzinneNeural)
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_VOICES = new Set([
  'en-NG-EzinneNeural',
  'en-NG-AbeoNeural',
  'en-GB-SoniaNeural',
  'en-GB-RyanNeural',
  'en-US-AriaNeural',
  'en-US-GuyNeural',
  'en-US-JennyNeural',
  'en-US-DavisNeural',
]);

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c] as string));
}

export async function POST(req: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return NextResponse.json(
      { error: 'Azure Speech not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars.' },
      { status: 503 },
    );
  }

  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (text.length > 8000) {
    return NextResponse.json({ error: 'text exceeds 8000-character limit per request' }, { status: 413 });
  }

  const requested = body.voice || process.env.AZURE_SPEECH_DEFAULT_VOICE || 'en-NG-EzinneNeural';
  const voice = ALLOWED_VOICES.has(requested) ? requested : 'en-NG-EzinneNeural';
  const lang = voice.split('-').slice(0, 2).join('-'); // e.g. en-NG

  const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voice}">
    <prosody rate="-5%" pitch="0%">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'unth-orm-training',
    },
    body: ssml,
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: `Azure TTS responded ${upstream.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const audio = await upstream.arrayBuffer();
  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
