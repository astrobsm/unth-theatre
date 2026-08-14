import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * Where scanned clinical documents live.
 *
 * NOT in Postgres. Every other uploaded artefact in ORM is a base64 data URL in
 * a text column — consent files, signatures, incident photos, imprest receipts.
 * That convention cannot extend to scanned documents: the database is 210 MB
 * today, a scan costs ~2.7 MB stored that way, and the specification requires
 * the original, the processed image and every version. A thousand documents is
 * 8-11 GB of row data that `pg_dump` and, worse, the local<->cloud sync journal
 * would have to carry. Sync moves surgical cases between the theatre server and
 * the cloud and is already the most fragile part of this system.
 *
 * So documents go to a store outside the database, and Postgres keeps metadata
 * and a reference. Two implementations, one interface:
 *
 *   - the theatre server writes to its own disk, so scanning keeps working with
 *     the hospital's internet down, which is the case that matters most;
 *   - the cloud writes to Supabase Storage, which adds no vendor and no new
 *     processor because Supabase already holds the database.
 *
 * Content-addressed by SHA-256. That is not a detail: it makes the duplicate
 * detection of specification §22 fall out for free, makes writes idempotent
 * under the offline queue's retries, and means a document can never be
 * corrupted by a partial overwrite.
 */

export interface StoredObject {
  /** Content address. The key IS the hash, so identical bytes store once. */
  sha256: string;
  /** Path within the store, derived from the hash. Never caller-supplied. */
  key: string;
  size: number;
  contentType: string;
  /** True when these exact bytes were already present. */
  deduplicated: boolean;
}

export interface DocumentStore {
  readonly name: string;
  put(bytes: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /**
   * A URL the browser can use, valid briefly.
   *
   * Never a public URL: §34 forbids it and a permanent link to a signed consent
   * form is a leak that outlives the session that created it.
   */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

/** 25 MB. A photographed page is 1-4 MB; a multi-page PDF is the outlier. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/tiff',
  'application/pdf',
]);

export class DocumentTooLargeError extends Error {}
export class UnsupportedDocumentTypeError extends Error {}
export class DocumentNotFoundError extends Error {}

export function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Shard by the first two hex characters.
 *
 * A single directory with a hundred thousand files is slow to list and awkward
 * to back up; 256 subdirectories keeps that manageable on the theatre server's
 * filesystem.
 */
export function keyFor(hash: string, contentType: string): string {
  const ext = extensionFor(contentType);
  return `${hash.slice(0, 2)}/${hash}${ext}`;
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/heic': return '.heic';
    case 'image/tiff': return '.tif';
    case 'application/pdf': return '.pdf';
    default: return '.bin';
  }
}

export function validate(bytes: Buffer, contentType: string): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new UnsupportedDocumentTypeError(
      `${contentType} is not a document type this system stores.`,
    );
  }
  if (bytes.length === 0) {
    throw new UnsupportedDocumentTypeError('That document was empty.');
  }
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentTooLargeError(
      `That document is ${(bytes.length / 1e6).toFixed(1)} MB; the limit is ${MAX_DOCUMENT_BYTES / 1e6} MB.`,
    );
  }
}

/**
 * A key is only ever produced by keyFor(), but it makes a round trip through
 * the database and an HTTP request before it comes back here. Anything that
 * does not look like one we generated is refused rather than resolved — an
 * attacker-supplied "../../.env" must not become a filesystem read.
 */
const KEY_SHAPE = /^[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]{3,4}$/;

export function assertSafeKey(key: string): void {
  if (!KEY_SHAPE.test(key)) {
    throw new DocumentNotFoundError('Not a document reference.');
  }
}

// ---------------------------------------------------------------------------

/**
 * The theatre server's own disk.
 *
 * Also what a developer machine uses, so nothing about this needs the internet.
 */
export class FilesystemDocumentStore implements DocumentStore {
  readonly name = 'filesystem';

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    // Belt and braces: even with the shape check above, never read outside root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new DocumentNotFoundError('Not a document reference.');
    }
    return full;
  }

  async put(bytes: Buffer, contentType: string): Promise<StoredObject> {
    validate(bytes, contentType);
    const hash = sha256(bytes);
    const key = keyFor(hash, contentType);
    const full = this.resolve(key);

    if (await this.exists(key)) {
      return { sha256: hash, key, size: bytes.length, contentType, deduplicated: true };
    }

    await fs.mkdir(path.dirname(full), { recursive: true });
    // Written under a temporary name and renamed, so a crash or a full disk
    // cannot leave a truncated file sitting at a content address that claims to
    // be complete. A half-written consent form that reads as valid is worse
    // than one that is absent.
    const tmp = `${full}.${crypto.randomBytes(6).toString('hex')}.partial`;
    try {
      await fs.writeFile(tmp, bytes, { mode: 0o640 });
      await fs.rename(tmp, full);
    } catch (err) {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }

    return { sha256: hash, key, size: bytes.length, contentType, deduplicated: false };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new DocumentNotFoundError('That document is not in this store.');
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * There is no signing here: the file is on this machine, and the route that
   * serves it does the authorisation. Returning an app URL rather than a
   * file:// path keeps callers identical across both stores.
   */
  async signedUrl(key: string, _ttlSeconds: number): Promise<string> {
    assertSafeKey(key);
    return `/api/ocr/objects/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Supabase Storage, over its REST API.
 *
 * Deliberately no @supabase/storage-js: the three calls needed here are plain
 * HTTP, and the app has no Supabase client anywhere else — it reaches Postgres
 * through Prisma. Adding a client library for this would be a dependency, a
 * bundle cost and a second way of talking to a service we already talk to.
 *
 * The bucket must be PRIVATE. A public bucket would make every scanned consent
 * form world-readable to anyone who learned its hash, which is precisely what
 * §34 forbids.
 */
export class SupabaseDocumentStore implements DocumentStore {
  readonly name = 'supabase';

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private endpoint(op: string, key: string): string {
    return `${this.url.replace(/\/$/, '')}/storage/v1/${op}/${this.bucket}/${key}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
      ...extra,
    };
  }

  async put(bytes: Buffer, contentType: string): Promise<StoredObject> {
    validate(bytes, contentType);
    const hash = sha256(bytes);
    const key = keyFor(hash, contentType);

    if (await this.exists(key)) {
      return { sha256: hash, key, size: bytes.length, contentType, deduplicated: true };
    }

    const res = await fetch(this.endpoint('object', key), {
      method: 'POST',
      headers: this.headers({
        'content-type': contentType,
        // Content-addressed, so an existing object has identical bytes and
        // overwriting it would be pointless work, not a correction.
        'x-upsert': 'false',
      }),
      body: new Uint8Array(bytes),
    });

    // 409 means another request stored the same bytes first. Under the offline
    // queue's retries that is the expected outcome, not a failure.
    if (!res.ok && res.status !== 409) {
      throw new Error(`Supabase Storage refused the upload: ${res.status} ${await res.text()}`);
    }

    return {
      sha256: hash, key, size: bytes.length, contentType,
      deduplicated: res.status === 409,
    };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const res = await fetch(this.endpoint('object', key), { headers: this.headers() });
    if (res.status === 404) throw new DocumentNotFoundError('That document is not in this store.');
    if (!res.ok) throw new Error(`Supabase Storage read failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    const res = await fetch(this.endpoint('object', key), {
      method: 'HEAD',
      headers: this.headers(),
    });
    return res.ok;
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    assertSafeKey(key);
    const res = await fetch(this.endpoint('object/sign', key), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    });
    if (!res.ok) throw new Error(`Could not sign a document URL: ${res.status}`);
    const body = (await res.json()) as { signedURL?: string };
    if (!body.signedURL) throw new Error('Supabase returned no signed URL.');
    return `${this.url.replace(/\/$/, '')}/storage/v1${body.signedURL}`;
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const res = await fetch(this.endpoint('object', key), {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase Storage delete failed: ${res.status}`);
    }
  }
}

// ---------------------------------------------------------------------------

let cached: DocumentStore | null = null;

/**
 * Which store this node uses.
 *
 * Chosen from configuration rather than guessed, and it FAILS rather than
 * falling back. A silent fallback would mean the cloud quietly writing scans to
 * a serverless container's temporary disk, where they vanish when it recycles —
 * clinical evidence lost with nothing logged. Refusing to start is the safer
 * failure.
 */
export function resolveDocumentStore(env: NodeJS.ProcessEnv = process.env): DocumentStore {
  const configured = env.DOCUMENT_STORE?.trim().toLowerCase();

  if (configured === 'filesystem' || (!configured && env.DOCUMENT_STORE_PATH)) {
    const root = env.DOCUMENT_STORE_PATH;
    if (!root) {
      throw new Error('DOCUMENT_STORE=filesystem needs DOCUMENT_STORE_PATH.');
    }
    return new FilesystemDocumentStore(root);
  }

  if (configured === 'supabase' || !configured) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = env.DOCUMENT_STORE_BUCKET || 'clinical-documents';
    if (!url || !key) {
      throw new Error(
        'Scanned documents need somewhere to live. Set SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY, or DOCUMENT_STORE_PATH on a server with a disk.',
      );
    }
    return new SupabaseDocumentStore(url, key, bucket);
  }

  throw new Error(`DOCUMENT_STORE=${configured} is not a store this system has.`);
}

export function documentStore(): DocumentStore {
  if (!cached) cached = resolveDocumentStore();
  return cached;
}

/** Tests only. */
export function __resetDocumentStore(): void {
  cached = null;
}
