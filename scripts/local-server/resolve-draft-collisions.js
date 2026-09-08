#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Settle the surgery drafts that collide on userId
// -----------------------------------------------------------------------------
//   node scripts/local-server/resolve-draft-collisions.js           report only
//   node scripts/local-server/resolve-draft-collisions.js --apply   settle them
//
// surgery_drafts holds ONE unfinished booking per user — userId is UNIQUE. The
// sync policy files it as LWW: "An unfinished booking. The most recent draft is
// the only one anybody wants."
//
// LWW resolves by PRIMARY KEY. These collide on a SECONDARY unique key: the
// peer sends a draft with a different id for a user who already has one here,
// the insert violates surgery_drafts_userId_key, and no version comparison in
// applyEntry ever gets to run. 180 entries had been retried 522 times each
// against 16 users, and they could not have succeeded on any attempt.
//
// So the policy is applied by hand, at the level it was written for: per USER,
// the newest draft wins and the rest are discarded. That is not data loss in
// the sense that matters — the loser is an older half-filled form belonging to
// the same person, and the policy says so in as many words.
//
// Incoming rows are applied with orm.sync_applying set, exactly as applyEntry
// does, so accepting a draft from the peer does not journal an entry that
// ships straight back.
//
// Read-only unless --apply is given.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');

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

const LOCAL_URL = readEnvFile('.env.local').DATABASE_URL;
if (!LOCAL_URL) { console.error('No DATABASE_URL in .env.local — is this the theatre server?'); process.exit(2); }

const ts = (v) => (v ? new Date(v).getTime() : 0);

(async () => {
  const db = new Client({ connectionString: LOCAL_URL, connectionTimeoutMillis: 20000 });
  await db.connect();
  console.log(`\nResolving surgery_drafts collisions  (${APPLY ? 'APPLY — this writes' : 'dry run'})\n`);

  try {
    const { rows: pending } = await db.query(
      `select id, journal_id, row_id, entry
         from sync_deferred
        where resolved_at is null and table_name = 'surgery_drafts'`);

    if (!pending.length) { console.log('No pending draft collisions.\n'); return; }

    // Group the incoming drafts by the user they belong to; that is the key
    // the uniqueness is actually on, and the level the policy speaks about.
    const byUser = new Map();
    for (const p of pending) {
      const payload = p.entry?.payload ?? {};
      const uid = payload.userId;
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push({ deferredId: p.id, rowId: p.row_id, payload });
    }

    const { rows: locals } = await db.query(
      `select id, "userId", "updatedAt" from surgery_drafts`);
    const localByUser = new Map(locals.map((r) => [r.userId, r]));

    let replaced = 0; let keptLocal = 0; let settled = 0;

    for (const [uid, incoming] of byUser) {
      const localRow = localByUser.get(uid) ?? null;
      // The newest incoming draft for this user; the rest are superseded by it
      // before they are ever compared with the local one.
      const newestIncoming = incoming
        .slice()
        .sort((a, b) => ts(b.payload.updatedAt) - ts(a.payload.updatedAt))[0];

      const localTs = ts(localRow?.updatedAt);
      const incTs = ts(newestIncoming.payload.updatedAt);
      const incomingWins = incTs > localTs;

      const who = uid.slice(0, 8);
      console.log(
        `  user ${who}…  local ${localRow ? new Date(localTs).toISOString() : '(none)'}  `
        + `incoming ${new Date(incTs).toISOString()}  -> ${incomingWins ? 'TAKE INCOMING' : 'KEEP LOCAL'}`
        + `  (${incoming.length} entr${incoming.length === 1 ? 'y' : 'ies'})`);

      if (!APPLY) { incomingWins ? replaced++ : keptLocal++; settled += incoming.length; continue; }

      await db.query('BEGIN');
      try {
        if (incomingWins) {
          // orm.sync_applying stops the capture trigger journalling these
          // writes. The change came FROM the peer; shipping it back would be a
          // ping-pong, and the delete below is bookkeeping, not a decision the
          // peer needs told twice.
          await db.query(`SET LOCAL "orm.sync_applying" = 'on'`);
          if (localRow) {
            await db.query('DELETE FROM surgery_drafts WHERE id = $1', [localRow.id]);
          }
          const p = newestIncoming.payload;
          await db.query(
            `INSERT INTO surgery_drafts
               (id, "userId", data, step, "patientId", "patientName", "createdAt", "updatedAt",
                sync_version, sync_origin, sync_hlc)
             VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               "userId" = excluded."userId", data = excluded.data, step = excluded.step,
               "patientId" = excluded."patientId", "patientName" = excluded."patientName",
               "updatedAt" = excluded."updatedAt", sync_version = excluded.sync_version,
               sync_origin = excluded.sync_origin, sync_hlc = excluded.sync_hlc`,
            [p.id, p.userId, JSON.stringify(p.data ?? {}), p.step ?? 'patient',
             p.patientId ?? null, p.patientName ?? null,
             p.createdAt ?? new Date().toISOString(), p.updatedAt ?? new Date().toISOString(),
             p.sync_version ?? 1, p.sync_origin ?? null, p.sync_hlc ?? null]);
          replaced++;
        } else {
          keptLocal++;
        }

        // Every entry for this user is settled either way: the winner has been
        // applied, and the others are older drafts belonging to the same
        // person, which is precisely what the policy discards.
        const ids = incoming.map((i) => i.deferredId);
        const reason = incomingWins
          ? 'Resolved by LWW: newest draft for this user applied; older drafts discarded.'
          : 'Resolved by LWW: local draft is newer; incoming drafts discarded.';
        await db.query(
          `update sync_deferred set resolved_at = now(), last_error = $2 where id = any($1::uuid[])`,
          [ids, reason]);
        settled += ids.length;
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        console.error(`  ! user ${who}… failed, left pending: ${err.message.split('\n')[0]}`);
      }
    }

    console.log(`\n${byUser.size} user${byUser.size === 1 ? '' : 's'}: `
      + `${replaced} took the incoming draft, ${keptLocal} kept the local one.`);
    console.log(`${settled} deferred entr${settled === 1 ? 'y' : 'ies'} ${APPLY ? 'settled' : 'would be settled'}.`);
    if (!APPLY) console.log('\nRe-run with --apply to settle them.');
    console.log();
  } finally {
    await db.end().catch(() => {});
  }
})().catch((e) => { console.error('\nFAILED:', e.message, '\n'); process.exit(1); });
