/**
 * WHICH DATABASE DOES THIS NODE ACTUALLY USE?
 *
 * Extracted from scripts/migrate-node-db.js so that there is exactly one
 * answer to that question. That file's header explains at length how the
 * theatre server came to migrate the cloud twice and its own Postgres never:
 * `.env.local` points at localhost, `.env` points at Supabase, Next.js reads
 * `.env.local` first and the Prisma CLI does not read it at all.
 *
 * The lesson of that bug is not "be careful" — it is "resolve it in one
 * place". A second script that works out the node's database for itself is
 * the same bug waiting with a different name, so anything that writes to
 * this node's database resolves it through here.
 *
 * Nothing in this file prints or returns a password. `describe()` exists
 * precisely so that a script can say which database it is about to write to
 * without putting a credential in a terminal or a log.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** KEY=value / KEY="value" out of a dotenv file. Absent file -> {}. */
function readEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Host and database, with the password removed, for logging.
 *
 * A deployment or an import that silently targets the wrong database is the
 * failure this module exists to prevent; saying which one out loud is most
 * of the fix.
 */
function describe(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(unparseable url)';
  }
}

/**
 * The database THIS NODE's running app opens, and where the value came from.
 *
 * The precedence is the app's own, not the Prisma CLI's: `.env.local` wins,
 * because that is what Next.js loads. Anything else here would address a
 * database the app never opens.
 *
 * On Vercel there is no `.env.local`, so this falls through to the platform's
 * own DATABASE_URL — the behaviour every caller had before this existed.
 *
 * @returns {{ url: string | null, source: string, isNodeLocal: boolean, directUrl: string | null }}
 */
function resolveNodeDatabase() {
  const localEnv = readEnvFile('.env.local');
  const url =
    localEnv.DATABASE_URL ||
    process.env.DATABASE_URL ||
    readEnvFile('.env').DATABASE_URL ||
    process.env.POSTGRES_URL ||
    null;

  const isNodeLocal = Boolean(localEnv.DATABASE_URL);
  return {
    url,
    source: isNodeLocal ? ".env.local (this node's own database)" : 'ambient environment / .env',
    isNodeLocal,
    // Pinned to the same database ONLY when we chose the url ourselves. On
    // Vercel DATABASE_URL is the pooler and DIRECT_URL is deliberately a
    // different, direct connection; overriding it there breaks the build.
    directUrl: isNodeLocal ? localEnv.DIRECT_URL || url : null,
  };
}

module.exports = { ROOT, readEnvFile, describe, resolveNodeDatabase };
