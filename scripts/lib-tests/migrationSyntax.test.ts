/**
 * Mechanical mistakes in a migration that fail the DEPLOY rather than the build.
 *
 * WHAT HAPPENED. A migration was written with `///` as a comment inside a
 * CREATE TABLE. That is Prisma schema syntax; SQL uses `--`. Postgres rejected
 * it, `prisma migrate deploy` failed, `npm run build` failed with it, and
 * Vercel never deployed — so a feature that type-checked, linted, passed 2,663
 * tests and built locally simply was not there. The only symptom was a 404 on
 * the new page, a day later, reported by the user as "I can't find it".
 *
 * Nothing in the pipeline could catch it. The test suite never executes a
 * migration, and `next build` does not parse SQL. The failure surfaced only on
 * a deployment nobody was watching.
 *
 * So the handful of SQL mistakes that are detectable by reading the file are
 * detected here, where they cost seconds instead of a day.
 *
 * This is not a SQL parser and does not pretend to be. It catches the specific
 * class of error that comes from writing SQL in a repository where Prisma
 * schema syntax is also in the fingers.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.join(__dirname, '../../prisma/migrations');

interface Migration { name: string; sql: string }

function allMigrations(): Migration[] {
  const out: Migration[] = [];
  for (const dir of fs.readdirSync(MIGRATIONS).sort()) {
    const file = path.join(MIGRATIONS, dir, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    out.push({ name: dir, sql: fs.readFileSync(file, 'utf8') });
  }
  return out;
}

/**
 * Strip string literals and dollar-quoted bodies before looking for syntax.
 *
 * A function body legitimately contains almost anything, and `'--'` inside a
 * string is not a comment. Without this the checks below produce false
 * positives on every migration that declares a trigger, which is most of the
 * interesting ones.
 */
function outsideLiterals(sql: string): string {
  return sql
    // $$ ... $$ function bodies, non-greedy across lines.
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    // Ordinary single-quoted strings, including '' escapes.
    .replace(/'(?:[^']|'')*'/g, "' '");
}

describe('migrations are valid SQL, mechanically', () => {
  const migrations = allMigrations();

  it('reads the migrations at all', () => {
    // Every assertion below is vacuous on an empty read.
    expect(migrations.length).toBeGreaterThan(50);
    expect(migrations.some((m) => /CREATE TABLE/i.test(m.sql))).toBe(true);
  });

  it('never uses /// as a comment', () => {
    // The exact mistake. `///` is a Prisma doc comment and a syntax error in
    // SQL; it fails migrate deploy, which fails the build, which means the
    // deployment silently does not happen.
    const offenders: string[] = [];
    for (const m of migrations) {
      const body = outsideLiterals(m.sql);
      body.split('\n').forEach((line, i) => {
        if (/\/\/\//.test(line)) offenders.push(`${m.name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('never uses // as a comment either', () => {
    // The same slip one character shorter, and equally fatal. Excludes `://`
    // so a URL inside a comment does not trip it.
    const offenders: string[] = [];
    for (const m of migrations) {
      const body = outsideLiterals(m.sql);
      body.split('\n').forEach((line, i) => {
        const withoutUrls = line.replace(/[a-z]+:\/\//gi, ' ');
        // A `--` comment may legitimately discuss anything, including "//".
        const code = withoutUrls.split('--')[0];
        if (/\/\//.test(code)) offenders.push(`${m.name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // THERE IS NO PARENTHESIS-BALANCE CHECK HERE, and that is deliberate.
  //
  // One was written and removed. Counting brackets outside string literals
  // requires understanding dollar-quoting — `$$`, `$tag$`, and `$$` appearing
  // inside an ordinary `--` comment — and the approximation flagged three
  // migrations that are demonstrably valid and have been applied in production
  // for months. A guardrail with false positives is worse than none: it trains
  // whoever meets it to add an exception rather than to look, and the next real
  // failure gets the same treatment.
  //
  // The checks above are exact, which is why they are the ones kept. For
  // anything structural, run the file: `npx prisma db execute --file <path>`
  // against a scratch database answers the question properly in seconds.

  it('ends every migration with a statement terminator', () => {
    // A file whose last statement has no semicolon applies its final statement
    // only by luck of the runner.
    const offenders: string[] = [];
    for (const m of migrations) {
      const trimmed = m.sql.replace(/--[^\n]*/g, '').trim();
      if (trimmed.length && !trimmed.endsWith(';')) offenders.push(m.name);
    }
    expect(offenders).toEqual([]);
  });
});
