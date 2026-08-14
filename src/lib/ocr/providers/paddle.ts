import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import type { OcrProvider, OcrResult, OcrWord } from '../providers';

/**
 * PaddleOCR, through a Python sidecar.
 *
 * Why a sidecar rather than a library: PaddleOCR is Python and there is no
 * usable Node binding. It cannot run on Vercel at all, and on the theatre
 * server it means a Python runtime plus roughly a gigabyte of dependencies.
 * That cost is worth stating plainly — it is a real burden on a machine that
 * also runs the hospital's theatre system.
 *
 * What it buys: handwriting recognition that runs INSIDE the hospital, with no
 * document leaving the building and no per-page charge. The alternatives that
 * read handwriting well are all cloud services, and every one of them needs a
 * data-processing decision from UNTH before a single consent form may be sent.
 *
 * Whether it is actually better than tesseract on these documents is a measured
 * question, not an assumption. Install it and run the benchmark; the harness
 * ranks by accuracy on numbers, doses and drug names, and if PaddleOCR does not
 * beat 4.7% it does not go in.
 *
 * Install: docs/paddleocr-setup.md
 */

/** Where the sidecar lives, relative to the repository root. */
const SIDECAR = path.join('scripts', 'ocr', 'paddle_ocr.py');

/** A page should not take this long. Beyond it, something has hung. */
const TIMEOUT_MS = 120_000;

export interface PaddleOptions {
  /** Python executable. A virtualenv path on the theatre server. */
  python?: string;
  root?: string;
}

export class PaddleOcrProvider implements OcrProvider {
  readonly name = 'paddleocr';
  readonly kind = 'LOCAL' as const;
  readonly supportsHandwriting = true;
  /** Runs on this machine. Nothing leaves the hospital. */
  readonly sendsDataExternally = false;

  private readonly python: string;
  private readonly root: string;
  private availability: boolean | null = null;

  constructor(options: PaddleOptions = {}) {
    this.python = options.python ?? process.env.PADDLE_PYTHON ?? 'python3';
    this.root = options.root ?? process.cwd();
  }

  private get sidecarPath(): string {
    return path.join(this.root, SIDECAR);
  }

  /**
   * Cached after the first check.
   *
   * Starting Python and importing paddleocr costs seconds; doing it on every
   * request would put a noticeable pause in front of every scan for an answer
   * that changes only when somebody installs something.
   */
  async available(): Promise<boolean> {
    if (this.availability !== null) return this.availability;
    if (!fs.existsSync(this.sidecarPath)) {
      this.availability = false;
      return false;
    }
    try {
      const probe = await this.run(['--probe'], 15_000);
      this.availability = probe.trim() === 'ok';
    } catch {
      this.availability = false;
    }
    return this.availability;
  }

  async recognise(image: Buffer, mimeType: string): Promise<OcrResult> {
    const started = Date.now();

    // Written to a file rather than piped: a multi-megabyte image through stdin
    // deadlocks when the child writes to stdout before draining stdin, and that
    // deadlock looks exactly like a slow engine.
    const suffix = mimeType === 'image/png' ? '.png' : '.jpg';
    const tmp = path.join(
      os.tmpdir(),
      `orm-ocr-${crypto.randomBytes(8).toString('hex')}${suffix}`,
    );
    await fs.promises.writeFile(tmp, image);

    try {
      const stdout = await this.run([tmp], TIMEOUT_MS);
      const parsed = JSON.parse(stdout) as {
        text?: string;
        words?: Array<{ text: string; confidence: number; bbox?: number[] }>;
        model?: string;
        error?: string;
      };

      if (parsed.error) throw new Error(parsed.error);

      const words: OcrWord[] = (parsed.words ?? []).map((w) => ({
        text: w.text,
        // PaddleOCR reports 0-1 already. Not rescaled, because guessing at a
        // scale would corrupt every threshold downstream.
        confidence: typeof w.confidence === 'number' ? w.confidence : null,
        bbox: w.bbox && w.bbox.length === 4
          ? { x: w.bbox[0], y: w.bbox[1], width: w.bbox[2], height: w.bbox[3] }
          : undefined,
        isHandwritten: true,
      }));

      const scored = words.filter((w) => w.confidence !== null);
      return {
        provider: this.name,
        modelVersion: parsed.model ?? null,
        text: parsed.text ?? words.map((w) => w.text).join(' '),
        words,
        // Null rather than 0 when nothing was scored: absent confidence and no
        // confidence mean different things and must not render alike.
        confidence: scored.length
          ? scored.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / scored.length
          : null,
        durationMs: Date.now() - started,
      };
    } finally {
      await fs.promises.unlink(tmp).catch(() => {});
    }
  }

  private run(args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [this.sidecarPath, ...args], {
        cwd: this.root,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`PaddleOCR did not answer within ${Math.round(timeoutMs / 1000)}s.`));
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Could not start ${this.python}: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve(stdout);
        // stderr, not a summary. Python's traceback names the missing module or
        // the corrupt weight file, and replacing it with "PaddleOCR failed"
        // would throw away the only thing that identifies the problem.
        reject(new Error(
          `PaddleOCR exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' ') || 'no output'}`,
        ));
      });
    });
  }
}
