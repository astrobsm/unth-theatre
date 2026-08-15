import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ProviderRegistry, policyFromEnv } from '@/lib/ocr/providers';
import { TesseractProvider } from '@/lib/ocr/providers/tesseract';
import { GoogleDocumentAiProvider } from '@/lib/ocr/providers/googleDocAI';
import { assessTokens, assessDocument } from '@/lib/ocr/confidence';
import { apiError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ocr   { image: "data:image/jpeg;base64,..." }
 *
 * Read text from a photograph, on the server, using whichever engine the
 * administrator has enabled.
 *
 * This used to call tesseract directly. It now goes through the registry, so
 * configuring GOOGLE_DOCAI_* and OCR_PROVIDERS changes what the scan button
 * uses with no code change — and so the rule that a cloud engine cannot run
 * without explicit acceptance is enforced in one place rather than here.
 *
 * The response now carries per-word assessment as well as text. A caller that
 * only wants the text can ignore it; a caller that means to put this in a
 * clinical record must not, because it is the only thing that says which words
 * a person has to check.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Built once per process. Registration is cheap; the engines themselves are
// lazy, so nothing loads a model until a request actually selects it.
let registry: ProviderRegistry | null = null;
function getRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry()
      .register(new TesseractProvider())
      .register(new GoogleDocumentAiProvider());
  }
  return registry;
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

  const mimeType = image.slice(5, image.indexOf(';')) || 'image/jpeg';
  const buffer = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');

  if (buffer.length === 0) {
    return NextResponse.json({ error: 'That image was empty.' }, { status: 400 });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({
      error: 'That photograph is too large. Take it again at a lower resolution.',
    }, { status: 413 });
  }

  try {
    const result = await getRegistry().recognise(buffer, mimeType, policyFromEnv());

    // Word-level assessment: which words were uncertain, and which are
    // high-risk regardless of how certain the engine was. A dose at 100%
    // confidence still requires a human, because a recogniser's confidence is
    // a statement about pixels and not about medicine.
    const assessed = assessTokens(
      result.words.map((w) => ({ text: w.text, confidence: w.confidence })),
    );
    const document = assessDocument(assessed);

    if (!result.text.trim()) {
      // Not an error. A blank or unreadable page is a real answer, and calling
      // it a failure sends somebody to re-photograph a page with nothing
      // legible on it.
      return NextResponse.json({
        text: '', confidence: 0, provider: result.provider,
        requiresReview: true,
        message: 'No text could be made out. Try a straighter, better-lit photograph.',
      });
    }

    return NextResponse.json({
      text: result.text,
      provider: result.provider,
      modelVersion: result.modelVersion,
      confidence: result.confidence === null ? null : Math.round(result.confidence * 100),
      durationMs: result.durationMs,
      requiresReview: document.requiresReview,
      reviewReason: document.reviewReason,
      uncertainCount: document.uncertainCount,
      highRiskCount: document.highRiskCount,
      words: assessed.map((a, i) => ({
        text: a.text,
        confidence: a.confidence,
        band: a.band,
        isUncertain: a.isUncertain,
        highRisk: a.highRisk,
        reason: a.reason,
        bbox: result.words[i]?.bbox ?? null,
      })),
    });
  } catch (err) {
    // The real reason, logged in full and summarised to the caller. Three
    // rounds of OCR faults in this system were prolonged by error handling
    // that replaced the cause with a guess.
    return apiError('ocr', err);
  }
}
