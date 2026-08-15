import path from 'path';
import fs from 'fs';
import type { OcrProvider, OcrResult, OcrWord } from '../providers';

/**
 * Tesseract, on the server.
 *
 * Kept as the floor rather than the answer. It measured 4.7% on numbers and
 * drug names across 62 real African clinical documents — useless for
 * handwriting — but it is adequate on printed text, needs no account, no
 * network and no agreement with anybody, and works when everything else is
 * unavailable.
 *
 * That last property is why it stays registered even after a better engine
 * arrives: a theatre with no internet still gets its printed lab reports read.
 */

type Worker = Awaited<ReturnType<typeof buildWorker>>;

async function buildWorker(langPath: string) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { langPath, gzip: true });
  await worker.setParameters({
    // A photograph carries no DPI, so tesseract guesses from pixel dimensions,
    // and its guess produced the one-pixel "lines" that started this work.
    user_defined_dpi: '300',
    preserve_interword_spaces: '1',
  });
  return worker;
}

export class TesseractProvider implements OcrProvider {
  readonly name = 'tesseract';
  readonly kind = 'LOCAL' as const;
  /** It will attempt handwriting. It should not be asked to. */
  readonly supportsHandwriting = false;
  readonly sendsDataExternally = false;

  private workerPromise: Promise<Worker> | null = null;
  private readonly langPath: string;

  constructor(root: string = process.cwd()) {
    this.langPath = path.join(root, 'public', 'tesseract');
  }

  async available(): Promise<boolean> {
    return fs.existsSync(path.join(this.langPath, 'eng.traineddata.gz'));
  }

  private worker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = buildWorker(this.langPath).catch((err) => {
        // Cleared on failure, or one bad start poisons every later request for
        // the life of the process.
        this.workerPromise = null;
        throw err;
      });
    }
    return this.workerPromise;
  }

  async recognise(image: Buffer): Promise<OcrResult> {
    const started = Date.now();
    const worker = await this.worker();
    const { data } = await worker.recognize(image);

    // tesseract.js's Page type does not declare `words`, but the recogniser
    // returns them. Narrowed here rather than loosening the shared OcrResult,
    // so one library's type gap does not weaken every other provider.
    type RawWord = {
      text: string; confidence: number;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
    };
    const rawWords = ((data as unknown as { words?: RawWord[] }).words) ?? [];

    const words: OcrWord[] = rawWords.map((w) => ({
      text: w.text,
      // Tesseract reports 0-100; everything downstream expects 0-1. Rescaled
      // here rather than downstream, so a threshold means the same thing
      // whichever engine produced the number.
      confidence: typeof w.confidence === 'number' ? w.confidence / 100 : null,
      bbox: w.bbox
        ? { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 }
        : undefined,
    }));

    return {
      provider: this.name,
      modelVersion: 'tesseract-4.0.0-fast',
      text: (data.text ?? '').trim(),
      words,
      confidence: typeof data.confidence === 'number' ? data.confidence / 100 : null,
      durationMs: Date.now() - started,
    };
  }
}
