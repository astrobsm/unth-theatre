import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  FilesystemDocumentStore, resolveDocumentStore, keyFor, sha256, validate,
  assertSafeKey, MAX_DOCUMENT_BYTES,
  DocumentTooLargeError, UnsupportedDocumentTypeError, DocumentNotFoundError,
} from '../../src/lib/documents/store';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orm-docstore-'));
}

const JPEG = 'image/jpeg';
const page = (s: string) => Buffer.from(s, 'utf8');

describe('content addressing', () => {
  it('gives identical bytes the same key', () => {
    const a = sha256(page('an anaesthetic chart'));
    const b = sha256(page('an anaesthetic chart'));
    expect(a).toBe(b);
    expect(keyFor(a, JPEG)).toBe(keyFor(b, JPEG));
  });

  it('shards by the first two characters', () => {
    const h = sha256(page('x'));
    expect(keyFor(h, JPEG)).toBe(`${h.slice(0, 2)}/${h}.jpg`);
  });

  it('keeps the extension of the content type', () => {
    const h = sha256(page('x'));
    expect(keyFor(h, 'application/pdf').endsWith('.pdf')).toBe(true);
    expect(keyFor(h, 'image/png').endsWith('.png')).toBe(true);
  });
});

describe('validation', () => {
  it('refuses a type this system does not store', () => {
    expect(() => validate(page('x'), 'text/html'))
      .toThrow(UnsupportedDocumentTypeError);
  });

  it('refuses an empty document', () => {
    expect(() => validate(Buffer.alloc(0), JPEG))
      .toThrow(UnsupportedDocumentTypeError);
  });

  it('refuses one over the limit', () => {
    expect(() => validate(Buffer.alloc(MAX_DOCUMENT_BYTES + 1), JPEG))
      .toThrow(DocumentTooLargeError);
  });

  it('accepts a document at exactly the limit', () => {
    expect(() => validate(Buffer.alloc(MAX_DOCUMENT_BYTES), JPEG)).not.toThrow();
  });
});

describe('key safety — a key makes a round trip through HTTP before it comes back', () => {
  it('refuses path traversal', () => {
    expect(() => assertSafeKey('../../.env')).toThrow(DocumentNotFoundError);
    expect(() => assertSafeKey('ab/../../../etc/passwd')).toThrow(DocumentNotFoundError);
  });

  it('refuses an absolute path', () => {
    expect(() => assertSafeKey('/etc/passwd')).toThrow(DocumentNotFoundError);
  });

  it('refuses a key that is not a hash', () => {
    expect(() => assertSafeKey('ab/not-a-hash.jpg')).toThrow(DocumentNotFoundError);
  });

  it('accepts a key it generated', () => {
    expect(() => assertSafeKey(keyFor(sha256(page('x')), JPEG))).not.toThrow();
  });
});

describe('FilesystemDocumentStore', () => {
  it('stores and reads back the same bytes', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    const bytes = page('consent form, signed');
    const put = await store.put(bytes, JPEG);
    expect(put.deduplicated).toBe(false);
    expect(Buffer.compare(await store.get(put.key), bytes)).toBe(0);
  });

  it('stores identical bytes once — this is §22 duplicate detection', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    const bytes = page('the same page photographed twice');
    const first = await store.put(bytes, JPEG);
    const second = await store.put(bytes, JPEG);
    expect(second.deduplicated).toBe(true);
    expect(second.key).toBe(first.key);
  });

  it('is idempotent under the offline queue retrying a write', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    const bytes = page('queued while offline');
    const results = await Promise.all([
      store.put(bytes, JPEG), store.put(bytes, JPEG), store.put(bytes, JPEG),
    ]);
    expect(new Set(results.map((r) => r.key)).size).toBe(1);
    expect(Buffer.compare(await store.get(results[0].key), bytes)).toBe(0);
  });

  it('leaves no .partial file behind after a successful write', async () => {
    const root = tmpRoot();
    const store = new FilesystemDocumentStore(root);
    const put = await store.put(page('a page'), JPEG);
    const dir = path.join(root, put.key.slice(0, 2));
    expect(fs.readdirSync(dir).filter((f) => f.includes('.partial'))).toEqual([]);
  });

  it('reports a missing document as missing rather than as a crash', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    const absent = keyFor(sha256(page('never stored')), JPEG);
    await expect(store.get(absent)).rejects.toThrow(DocumentNotFoundError);
  });

  it('refuses to read outside its root', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    await expect(store.get('../../../etc/passwd')).rejects.toThrow(DocumentNotFoundError);
  });

  it('deleting something absent is not an error', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    await expect(store.delete(keyFor(sha256(page('gone')), JPEG))).resolves.toBeUndefined();
  });

  it('never returns a public URL', async () => {
    const store = new FilesystemDocumentStore(tmpRoot());
    const put = await store.put(page('a signed consent'), JPEG);
    const url = await store.signedUrl(put.key, 60);
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).not.toMatch(/^https?:/);
  });
});

describe('resolveDocumentStore — must fail rather than lose documents', () => {
  it('uses the filesystem when a path is configured', () => {
    const store = resolveDocumentStore({ DOCUMENT_STORE_PATH: tmpRoot() } as NodeJS.ProcessEnv);
    expect(store.name).toBe('filesystem');
  });

  it('uses Supabase when credentials are configured', () => {
    const store = resolveDocumentStore({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    } as NodeJS.ProcessEnv);
    expect(store.name).toBe('supabase');
  });

  it('REFUSES to start with nothing configured', () => {
    // The alternative would be a silent fallback to a serverless container's
    // temporary disk, where scanned evidence disappears when it recycles.
    expect(() => resolveDocumentStore({} as NodeJS.ProcessEnv))
      .toThrow(/somewhere to live/);
  });

  it('refuses filesystem without a path rather than inventing one', () => {
    expect(() => resolveDocumentStore({ DOCUMENT_STORE: 'filesystem' } as NodeJS.ProcessEnv))
      .toThrow(/DOCUMENT_STORE_PATH/);
  });

  it('refuses a store it does not have', () => {
    expect(() => resolveDocumentStore({ DOCUMENT_STORE: 's3' } as NodeJS.ProcessEnv))
      .toThrow(/not a store/);
  });
});
