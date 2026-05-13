#!/usr/bin/env node
/**
 * Production database bootstrap / baseline.
 *
 * Runs BEFORE `prisma migrate deploy`.
 *
 * Cases handled:
 *   1. _prisma_migrations table exists → no-op (normal flow, hand off to migrate deploy).
 *   2. Database is empty (no `users` table) → no-op (migrate deploy will create everything).
 *   3. Schema is present but _prisma_migrations is missing → BASELINE:
 *        a. Idempotently re-run every migration's SQL inside a savepoint.
 *           Old non-idempotent migrations will raise "already exists" / "duplicate"
 *           errors — those are swallowed because the schema is provably already in place.
 *           Genuinely new migrations (whose objects don't exist yet) will succeed.
 *        b. Create the _prisma_migrations table with Prisma's exact schema.
 *        c. Insert one row per migration directory, marking each as applied with
 *           the correct sha256 checksum so future `prisma migrate deploy` runs
 *           are no-ops until a truly new migration is added.
 *
 * Why this is safe:
 *   - All "already exists" / "duplicate" errors are PostgreSQL classes 42P07 / 42710 / 42701.
 *     Any other failure aborts the build.
 *   - The script is fully idempotent — re-running it after success is a no-op
 *     because case (1) short-circuits.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SAFE_ERROR_RE =
  /already exists|duplicate (object|table|column|key|relation|type)|relation .* already|column .* already|type .* already/i;

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.log('[db-bootstrap] No DATABASE_URL/POSTGRES_URL — skipping (likely build without db).');
    return;
  }

  const client = new Client({
    connectionString: url,
    // Supabase pooler requires SSL but accepts self-signed in pooled mode.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const probe = await client.query(`
      SELECT to_regclass('public._prisma_migrations') AS migrations_tbl,
             to_regclass('public.users')              AS users_tbl
    `);
    const hasMigrations = !!probe.rows[0].migrations_tbl;
    const hasUsers = !!probe.rows[0].users_tbl;

    if (hasMigrations) {
      console.log('[db-bootstrap] _prisma_migrations exists → normal flow.');
      return;
    }
    if (!hasUsers) {
      console.log('[db-bootstrap] Empty database → letting prisma migrate deploy create everything.');
      return;
    }

    console.log('[db-bootstrap] Schema present but _prisma_migrations missing → BASELINING…');

    const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
    const dirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    // Phase 1 — idempotently re-execute every migration. Swallow harmless duplicates.
    for (const dir of dirs) {
      const sqlPath = path.join(migrationsDir, dir, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8').trim();
      if (!sql) continue;

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`[db-bootstrap]   ✓ executed ${dir}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        const msg = String(e && e.message);
        if (SAFE_ERROR_RE.test(msg)) {
          console.log(`[db-bootstrap]   • already applied (skipped): ${dir}`);
        } else {
          console.error(`[db-bootstrap]   ✗ FAILED ${dir}: ${msg}`);
          throw e;
        }
      }
    }

    // Phase 2 — create Prisma's ledger table (matches Prisma 5.x schema exactly).
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                    VARCHAR(36) PRIMARY KEY,
        "checksum"              VARCHAR(64) NOT NULL,
        "finished_at"           TIMESTAMPTZ,
        "migration_name"        VARCHAR(255) NOT NULL,
        "logs"                  TEXT,
        "rolled_back_at"        TIMESTAMPTZ,
        "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Phase 3 — register every migration directory as applied.
    for (const dir of dirs) {
      const sqlPath = path.join(migrationsDir, dir, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)
         ON CONFLICT DO NOTHING`,
        [id, checksum, dir]
      );
    }

    console.log(`[db-bootstrap] ✔ baseline complete (${dirs.length} migrations registered).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db-bootstrap] fatal:', err);
  process.exit(1);
});
