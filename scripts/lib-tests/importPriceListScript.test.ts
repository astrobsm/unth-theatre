import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

// The terminal price-list importer, and the one thing it must never get
// wrong: which database it opens.
//
// The theatre server keeps two env files pointing at two different
// databases. A script that resolves that for itself is how `npm run build`
// came to migrate the cloud twice and the node never — with a green build
// and the message "No pending migrations to apply". So the resolution lives
// in one module and these tests assert that it still does.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
// Absence assertions run against the code, never the comments: a comment
// explaining why something was removed contains the thing that was removed.
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

describe('which database this node uses is resolved in exactly one place', () => {
  it('the migrator reads it from the shared module', () => {
    const code = codeOf('scripts/migrate-node-db.js');
    expect(code).toContain("require('./lib/nodeDatabase')");
    expect(code).toContain('resolveNodeDatabase()');
  });

  it('the migrator no longer carries its own copy', () => {
    const code = codeOf('scripts/migrate-node-db.js');
    expect(code).not.toContain('function readEnvFile');
    expect(code).not.toContain('function describe(');
  });

  it('the importer reads it from the same module', () => {
    const code = codeOf('scripts/import-price-list.ts');
    expect(code).toContain("require('./lib/nodeDatabase')");
    expect(code).toContain('resolveNodeDatabase()');
    expect(code).not.toContain('function readEnvFile');
  });

  it("keeps the app's precedence, not the Prisma CLI's", () => {
    // .env.local FIRST. Reversing these two lines is the original bug.
    const code = codeOf('scripts/lib/nodeDatabase.js');
    expect(code.indexOf('localEnv.DATABASE_URL')).toBeLessThan(
      code.indexOf('process.env.DATABASE_URL'),
    );
    expect(code.indexOf('process.env.DATABASE_URL')).toBeLessThan(
      code.indexOf("readEnvFile('.env').DATABASE_URL"),
    );
  });

  it('never returns or logs a password', () => {
    const code = codeOf('scripts/lib/nodeDatabase.js');
    // describe() is the only thing a caller is given to print, and it is
    // built from host and pathname alone.
    expect(code).toContain('${u.host}${u.pathname}');
    expect(code).not.toContain('u.password');
  });
});

describe('the importer will not write unless told to', () => {
  it('previews by default and needs --apply to load anything', () => {
    const code = codeOf('scripts/import-price-list.ts');
    expect(code).toContain("const apply = argv.includes('--apply')");
    expect(code).toContain('if (!args.apply)');
    // The write itself is behind that check.
    expect(code.indexOf('if (!args.apply)')).toBeLessThan(code.indexOf('importPriceList({'));
  });

  it('refuses --overwrite-prices on its own rather than quietly previewing', () => {
    const code = codeOf('scripts/import-price-list.ts');
    expect(code).toContain('if (overwrite && !apply)');
    expect(code).toContain('process.exit(2)');
  });

  it('defaults to filling blanks, not overwriting', () => {
    const code = codeOf('scripts/import-price-list.ts');
    expect(code).toContain("const overwrite = argv.includes('--overwrite-prices')");
    expect(code).toContain('importPriceList({ overwritePrices: args.overwrite');
  });

  it('prints the database before it writes to it', () => {
    const code = codeOf('scripts/import-price-list.ts');
    expect(code).toContain('describeDb(resolved.url)');
    expect(code.indexOf('describeDb(resolved.url)')).toBeLessThan(
      code.indexOf('importPriceList({'),
    );
  });

  it('calls the route\'s own importer rather than reimplementing it', () => {
    const code = codeOf('scripts/import-price-list.ts');
    expect(code).toContain("await import('../src/lib/specialNeeds/importPriceList')");
    // No second copy of the matching rules.
    expect(code).not.toContain('comparisonForm');
    expect(code).not.toContain('upsert');
  });

  it('sets the database before the Prisma singleton is constructed', () => {
    // Which is why every app module is loaded with await import(). A static
    // import would build the client against the wrong DATABASE_URL.
    const code = codeOf('scripts/import-price-list.ts');
    expect(code.indexOf('process.env.DATABASE_URL = resolved.url')).toBeLessThan(
      code.indexOf("await import('../src/lib/prisma')"),
    );
    expect(code).not.toMatch(/^import .* from '\.\.\/src\//m);
  });
});
