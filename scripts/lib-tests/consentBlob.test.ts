/**
 * The consent scan must not be fetched to answer a yes/no question.
 *
 * Surgery.consentFileData holds a scanned consent form as base64 TEXT. The sync
 * migration recorded the cost: the surgeries table is 58 MB for 481 rows,
 * almost entirely these blobs, and a scanned A4 page is commonly two to five
 * megabytes once base64 has inflated it.
 *
 * Two screens were selecting that column to compute `!!consentFileData` — one
 * boolean. The Medical Scribe moved several megabytes across a hospital
 * connection to decide whether to print a single line, which is the whole of
 * why it took so long to open.
 *
 * This holds the line. A route that genuinely SERVES the file may select it;
 * anything else must ask the database the question instead of asking for the
 * answer's evidence. The failure it prevents is silent — nothing breaks, the
 * screen just becomes slow again, and nobody connects the two.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const API = path.resolve(__dirname, '..', '..', 'src', 'app', 'api');

/** Routes whose whole purpose is to hand over the file itself. */
const MAY_SELECT = [
  path.join('surgeries', '[id]', 'consent', 'route.ts'),
  path.join('surgeries', '[id]', 'consent-form', 'route.ts'),
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : (e.name === 'route.ts' ? [full] : []);
  });
}

describe('the consent blob', () => {
  const routes = walk(API);

  it('finds the API routes to check', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('is selected only by the routes that serve the file', () => {
    const offenders = routes.filter((file) => {
      const rel = path.relative(API, file);
      if (MAY_SELECT.some((allowed) => rel.endsWith(allowed))) return false;
      return /consentFileData:\s*true/.test(fs.readFileSync(file, 'utf8'));
    }).map((f) => path.relative(API, f));

    expect(offenders).toEqual([]);
  });

  it('gives the rest a way to ask without fetching it', () => {
    const helper = path.resolve(__dirname, '..', '..', 'src', 'lib', 'consentPresence.ts');
    expect(fs.existsSync(helper)).toBe(true);
    const src = fs.readFileSync(helper, 'utf8');
    // The length check must run in the database, not in JavaScript over a
    // column that has already crossed the wire.
    expect(src).toMatch(/length\("consentFileData"\)/);
    expect(src).toMatch(/\$queryRaw/);
  });

  it('treats an empty string as no file on record', () => {
    // '' is what a failed upload leaves behind, and reading it as a consent
    // document on file is the worst direction to be wrong in.
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'lib', 'consentPresence.ts'), 'utf8',
    );
    expect(src).toMatch(/length\("consentFileData"\) > 0/);
  });
});
