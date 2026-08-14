import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import path from 'path';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
// Reading a page can take a while on modest hardware; the default would cut it
// off mid-recognition.
export const maxDuration = 60;

/**
 * POST /api/ocr   { image: "data:image/jpeg;base64,..." }
 *
 * Read text from a photograph, ON THE SERVER.
 *
 * The client used to do this. That meant every phone downloaded about 22 MB of
 * recogniser before it could read its first page — minutes on a theatre
 * connection, repeated for every device and every cleared cache, and impossible
 * on a handset with no storage to spare. It was reported as broken three times
 * and it was really just slow, which amounts to the same thing at a bedside.
 *
 * Doing it here inverts the economics: the phone uploads a couple of hundred
 * kilobytes, the server holds the recogniser in memory between requests, and a
 * theatre PC does the arithmetic instead of a phone. It also works on a device
 * that could never have run it.
 *
 * The local theatre server does this over the LAN with no internet at all, which
 * is the case that matters most here.
 */

/** ~8 MP JPEG. Beyond this the camera is being used wrongly, not the OCR. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * One worker for the whole process, kept warm.
 *
 * Building it costs seconds and loads the language data; doing that per request
 * would put the old per-device cost back, just on the server.
 */
type OcrWorker = Awaited<ReturnType<typeof buildWorker>>;
let workerPromise: Promise<OcrWorker> | null = null;

async function buildWorker() {
  const { createWorker } = await import('tesseract.js');
  // The language data sits in public/tesseract, put there at build time. Read
  // from disk rather than fetched, so this works with no internet.
  //
  // This is the "fast" model, and it stays that way. The accurate float model
  // was tried and measured: on both a clean render and a deliberately degraded
  // one it scored identically (98.1% of characters correct), and on the server
  // it aborted outright —
  //   Aborted(missing function: _ZN9tesseract13DotProductSSEEPKfS1_i)
  // because the float model needs SIMD dot-product entry points that the LSTM
  // WASM core we ship does not export. It would have cost 12.8 MB per deploy to
  // turn imperfect recognition into none.
  const langPath = path.join(process.cwd(), 'public', 'tesseract');

  const worker = await createWorker('eng', 1, { langPath, gzip: true });

  await worker.setParameters({
    // A photograph carries no DPI, so tesseract guesses from pixel dimensions.
    // Its guess is what produced "Image too small to scale!! (1x36)" — telling
    // it 300 removes the guess and with it a whole class of segmentation
    // failure on pages photographed close up.
    user_defined_dpi: '300',
    // Clinical notes are full of numbers that matter (doses, folder numbers).
    // Without this, runs of digits get glued to neighbouring words.
    preserve_interword_spaces: '1',
  });

  return worker;
}

function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = buildWorker().catch((err) => {
      // Cleared on failure, or one bad start would poison every later request
      // for the life of the process.
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { image?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const image = body.image ?? '';
  if (!image.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Send an image as a data URL.' }, { status: 400 });
  }

  const base64 = image.slice(image.indexOf(',') + 1);
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length === 0) {
    return NextResponse.json({ error: 'That image was empty.' }, { status: 400 });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({
      error: 'That photograph is too large. Take it again at a lower resolution.',
    }, { status: 413 });
  }

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(buffer);

    const text = (data.text ?? '').trim();
    if (!text) {
      // Not an error: a blank page or an unreadable photograph is a real answer,
      // and telling somebody "failed" would send them to retry a photograph that
      // genuinely has nothing legible on it.
      return NextResponse.json({
        text: '',
        confidence: 0,
        message: 'No text could be made out. Try a straighter, better-lit photograph.',
      });
    }

    return NextResponse.json({
      text,
      // 0–100 as tesseract reports it. Shown so a clinician can judge whether to
      // trust what came back rather than assume it.
      confidence: Math.round(data.confidence ?? 0),
    });
  } catch (err) {
    // The real reason, logged in full and summarised to the caller. Three
    // rounds of this fault were prolonged by error handling that replaced the
    // cause with a guess.
    console.error('[ocr] recognition failed', err);
    const detail = err instanceof Error ? err.message : '';
    return NextResponse.json({
      error: detail
        ? `Could not read the image: ${detail}`
        : 'Could not read the image.',
    }, { status: 500 });
  }
}
