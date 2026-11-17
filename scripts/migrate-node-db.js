#!/usr/bin/env node
/**
 * Apply migrations to the database THIS NODE ACTUALLY RUNS ON.
 *
 * WHY THIS EXISTS
 *
 * The theatre server keeps two env files. `.env.local` points at its own
 * Postgres on localhost, `.env` points at Supabase. Next.js loads `.env.local`
 * FIRST, so the running app uses the local database — but the Prisma CLI does
 * not read `.env.local` at all, and `directUrl` in schema.prisma resolves from
 * `.env`. So `npm run build` on the theatre server was applying every migration
 * to the CLOUD, twice over (Vercel had already done it), and never once to the
 * database the theatre is actually served from.
 *
 * It said so, too, in the most misleading way available: running
 * `prisma migrate deploy` there printed "No pending migrations to apply" — true
 * of the cloud, and nothing whatever to do with the node it was run on. The
 * theatre server's database sat two migrations behind with a green build.
 *
 * That was caught by checking pg_trigger directly after a migration claimed to
 * have been applied. It should not need catching twice, hence this file.
 *
 * WHAT IT DOES
 *
 * Resolves the node's own DATABASE_URL exactly the way the running app does —
 * `.env.local` if it defines one, otherwise the ambient environment / `.env` —
 * then runs the bootstrap and `prisma migrate deploy` against THAT, with
 * DIRECT_URL pinned to the same database so migrations cannot quietly go
 * somewhere else.
 *
 * On Vercel there is no `.env.local`, so this falls through to exactly the
 * behaviour it had before: migrate whatever DATABASE_URL the platform provides.
 *
 * It PRINTS the host it is migrating. A deployment that silently targets the
 * wrong database is the failure being fixed; saying which one out loud is most
 * of the fix.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ONE answer to "which database does this node use", shared with everything
// else that writes to it. See the header of scripts/lib/nodeDatabase.js: a
// second script resolving it independently is this same bug under a new name.
const { ROOT, describe, resolveNodeDatabase } = require('./lib/nodeDatabase');

function main() {
  const resolved = resolveNodeDatabase();
  const url = resolved.url;

  if (!url) {
    console.log('[migrate-node-db] No DATABASE_URL anywhere — skipping (build without a database).');
    return;
  }

  console.log(`[migrate-node-db] migrating ${describe(url)}`);
  console.log(`[migrate-node-db] url taken from: ${resolved.source}`);

  // DIRECT_URL is pinned to the same database ONLY when we chose the url
  // ourselves, from .env.local. That is the theatre server's own Postgres,
  // which has no separate direct connection — and leaving DIRECT_URL alone
  // there is exactly how migrations went to the cloud instead.
  //
  // It must NOT be pinned otherwise. On Vercel, DATABASE_URL is the pgbouncer
  // pooler and DIRECT_URL is the direct connection, deliberately different:
  // migrations take advisory locks and use prepared statements, neither of
  // which survives a transaction pooler. Overriding it there fails the build,
  // which is precisely what it did.
  const env = { ...process.env, DATABASE_URL: url };
  if (resolved.isNodeLocal) {
    env.DIRECT_URL = resolved.directUrl;
  }

  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'db-bootstrap.js')], { stdio: 'inherit', env, cwd: ROOT });

  // Run the SAME binary the npm script used to: node_modules/.bin/prisma,
  // resolved directly. Going through npx was a second change riding along with
  // this one, and when the Vercel build failed there was no way to tell which
  // of the two had broken it. Falling back to npx only if the binary is absent.
  const localPrisma = path.join(
    ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  if (fs.existsSync(localPrisma)) {
    execFileSync(localPrisma, ['migrate', 'deploy'], { stdio: 'inherit', env, cwd: ROOT, shell: process.platform === 'win32' });
  } else {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env, cwd: ROOT, shell: true });
  }

  console.log(`[migrate-node-db] done: ${describe(url)}`);
}

main();
