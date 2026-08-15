import crypto from 'crypto';
import type { OcrProvider, OcrResult, OcrWord } from '../providers';

/**
 * Google Document AI — the OCR processor, which reads handwriting.
 *
 * Reached over plain HTTPS with a service-account JWT exchanged for an access
 * token. No googleapis dependency: that package is large, pulls a great deal
 * with it, and everything needed here is two HTTP calls and a signature Node's
 * own crypto can produce.
 *
 * WHY THIS AND NOT A LANGUAGE MODEL: an OCR engine that cannot read something
 * returns nonsense, which a clinician distrusts instantly. A language model
 * returns something plausible instead — faced with a smudged dose it writes a
 * sensible one. Document AI returns words, bounding boxes and per-word
 * confidence, which is what the verification screen needs to highlight an
 * uncertain word and show the clinician that region of the original.
 *
 * This provider SENDS DOCUMENTS OUTSIDE THE HOSPITAL. The registry refuses to
 * run it until OCR_EXTERNAL_PROCESSING_ACCEPTED=yes is set deliberately.
 *
 * Setup: docs/google-document-ai-setup.md
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface GoogleDocAIOptions {
  projectId?: string;
  /** "eu" or "us". Decides where documents are processed. */
  location?: string;
  processorId?: string;
  serviceAccountJson?: string;
}

export class GoogleDocumentAiProvider implements OcrProvider {
  readonly name = 'googledocai';
  readonly kind = 'CLOUD' as const;
  readonly supportsHandwriting = true;
  readonly sendsDataExternally = true;

  private readonly projectId?: string;
  private readonly location: string;
  private readonly processorId?: string;
  private readonly rawKey?: string;

  private token: { value: string; expiresAt: number } | null = null;

  constructor(options: GoogleDocAIOptions = {}) {
    this.projectId = options.projectId ?? process.env.GOOGLE_DOCAI_PROJECT_ID;
    this.location = options.location ?? process.env.GOOGLE_DOCAI_LOCATION ?? 'eu';
    this.processorId = options.processorId ?? process.env.GOOGLE_DOCAI_PROCESSOR_ID;
    this.rawKey = options.serviceAccountJson ?? process.env.GOOGLE_DOCAI_CREDENTIALS;
  }

  private serviceAccount(): ServiceAccount {
    if (!this.rawKey) throw new Error('GOOGLE_DOCAI_CREDENTIALS is not set.');
    // Accepts the JSON directly or base64-encoded, because a multi-line private
    // key pasted into an environment variable is a reliable source of misery.
    const text = this.rawKey.trim().startsWith('{')
      ? this.rawKey
      : Buffer.from(this.rawKey, 'base64').toString('utf8');
    const parsed = JSON.parse(text) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('That service account JSON has no client_email or private_key.');
    }
    return parsed;
  }

  async available(): Promise<boolean> {
    // Configuration only. A live check would cost a network round trip on every
    // scan, and the registry already reports the real error if a call fails.
    return Boolean(this.projectId && this.processorId && this.rawKey);
  }

  /** Signed JWT exchanged for an access token, cached until shortly before expiry. */
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const account = this.serviceAccount();
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }));

    const signature = base64url(
      crypto.createSign('RSA-SHA256')
        .update(`${header}.${claims}`)
        .sign(account.private_key.replace(/\\n/g, '\n')),
    );

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Google refused the service account: ${res.status} ${await res.text()}`);
    }
    const body = await res.json() as { access_token: string; expires_in: number };
    this.token = {
      value: body.access_token,
      // Renewed a minute early, so a request never starts with a token that
      // expires mid-flight.
      expiresAt: Date.now() + (body.expires_in - 60) * 1000,
    };
    return body.access_token;
  }

  async recognise(image: Buffer, mimeType: string): Promise<OcrResult> {
    const started = Date.now();
    const token = await this.accessToken();

    const url = `https://${this.location}-documentai.googleapis.com/v1/projects/`
      + `${this.projectId}/locations/${this.location}/processors/${this.processorId}:process`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        rawDocument: { content: image.toString('base64'), mimeType },
        // Handwriting is the reason this provider exists; without this the
        // processor treats the page as printed and does markedly worse.
        processOptions: { ocrConfig: { enableSymbol: false, premiumFeatures: { enableSelectionMarkDetection: true } } },
        skipHumanReview: true,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Document AI returned ${res.status}: ${detail.slice(0, 300)}`);
    }

    const body = await res.json() as {
      document?: {
        text?: string;
        pages?: Array<{
          tokens?: Array<{
            layout?: {
              confidence?: number;
              textAnchor?: { textSegments?: Array<{ startIndex?: string; endIndex?: string }> };
              boundingPoly?: { vertices?: Array<{ x?: number; y?: number }> };
            };
          }>;
        }>;
      };
    };

    const fullText = body.document?.text ?? '';
    const words: OcrWord[] = [];

    for (const page of body.document?.pages ?? []) {
      for (const tokenBox of page.tokens ?? []) {
        const segment = tokenBox.layout?.textAnchor?.textSegments?.[0];
        if (!segment) continue;
        // Document AI returns OFFSETS into the full text rather than the words
        // themselves. startIndex is absent for offset zero, which reads as
        // undefined and would silently drop the first word of every page.
        const start = parseInt(segment.startIndex ?? '0', 10);
        const end = parseInt(segment.endIndex ?? '0', 10);
        const text = fullText.slice(start, end).trim();
        if (!text) continue;

        const vertices = tokenBox.layout?.boundingPoly?.vertices ?? [];
        const xs = vertices.map((v) => v.x ?? 0);
        const ys = vertices.map((v) => v.y ?? 0);

        words.push({
          text,
          confidence: typeof tokenBox.layout?.confidence === 'number'
            ? tokenBox.layout.confidence : null,
          bbox: vertices.length
            ? {
              x: Math.min(...xs), y: Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            }
            : undefined,
        });
      }
    }

    const scored = words.filter((w) => w.confidence !== null);
    return {
      provider: this.name,
      modelVersion: `documentai-ocr/${this.location}`,
      text: fullText,
      words,
      confidence: scored.length
        ? scored.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / scored.length
        : null,
      durationMs: Date.now() - started,
    };
  }
}
