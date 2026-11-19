#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Take the permanently stuck entries out of the way of today's work
// -----------------------------------------------------------------------------
//   node scripts/local-server/stand-down-blockers.js              what it would do
//   node scripts/local-server/stand-down-blockers.js --apply      do it
//   node scripts/local-server/stand-down-blockers.js --attempts 50 --days 30
//   node scripts/local-server/stand-down-blockers.js --release --apply   retry the rest now
//   node scripts/local-server/stand-down-blockers.js --restore --apply   undo
//
// WHAT THIS IS FOR. The push queue drains strictly oldest-first. An entry the
// cloud will never accept therefore sits at the head of every batch, and the
// cloud spends its transaction budget on savepoints and rollbacks for it
// before it reaches anything useful — so the batch returns P2028 and
// EVERYTHING behind it fails too.
//
// On 19 November that was today's theatre list: two Ortho Unit I cases, tried
// 29 times and rejected 29 times, while four entries at 12,488 attempts and
// seven stranded since 8 September sat in front of them. The cases were booked
// correctly and were simply never going to get out.
//
// WHAT IT DOES, AND WHAT IT DOES NOT.
//
// It sets next_push_at into the future for entries that have failed more times
// than any transient fault explains. That is ALL. It does not delete them, it
// does not acknowledge them, it does not touch the row the entry describes,
// and it writes to no clinical table. The entries stay in the journal, stay
// counted by why-not-syncing.sh, and come back when the stand-down expires —
// so a problem that was never settled becomes visible again rather than
// quietly disappearing.
//
// Reversible: --restore puts next_push_at back to null.
//
// WHY A THRESHOLD AND NOT A LIST OF IDS. The ids change with every incident;
// the shape does not. An entry retried fifty times has not met a dropped
// connection — the worker's own backoff means fifty attempts span days. The
// default sits well above the attempts of anything booked this week, and the
// dry run prints exactly what is caught so it can be checked before anything
// moves.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
// Standing the blockers down does not get today's work moving on its own:
// everything that failed in a batch WITH them also carries a backoff of its
// own, and waits out the hour it was given for somebody else's fault.
//
// AND CLEARING THE TIMER IS NOT ENOUGH. The worker backs off after ten
// attempts (PUSH_BACKOFF_AFTER_ATTEMPTS) and the cap is an hour, so an entry
// sitting at 29 attempts is put straight back on an hourly retry by its very
// next try — whatever the outcome. Today's cases were released, tried once,
// and immediately given another hour for a problem that had already been
// solved.
//
// So this resets `attempts` as well. That counter means "how many times has
// this failed on its own merits", and these failures were not on their own
// merits: they were batch rejections caused by the blockers. Resetting it
// restores exactly that meaning. Only entries BELOW the threshold are
// touched, so the blockers keep their count and stay stood down.
const RELEASE = args.includes('--release');

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number.parseInt(args[i + 1], 10);
  return Number.isFinite(v) ? v : fallback;
}

const MIN_ATTEMPTS = flag('attempts', 50);
const STAND_DOWN_DAYS = flag('days', 30);

// The node's own database, read the way the other local-server tools read it.
// .env points at the cloud on this box; .env.local is the node, and only the
// node has an outbound queue of its own.
function localUrl() {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const line = fs.readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('DATABASE_URL='))
      .pop();
    if (!line) continue;
    const url = line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
    if (file === '.env.local' || /localhost|127\.0\.0\.1/.test(url)) return url;
  }
  throw new Error('No local DATABASE_URL found — run this on the theatre server.');
}

async function main() {
  const client = new Client({ connectionString: localUrl() });
  await client.connect();

  try {
    if (RELEASE) {
      const { rows } = await client.query(
        `select count(*)::int as n from sync_journal
          where ack_at is null and attempts < $1
            and (next_push_at is not null or attempts > 0)`,
        [MIN_ATTEMPTS]);
      console.log(`${rows[0].n} entr(y/ies) below ${MIN_ATTEMPTS} attempts are held back.`);
      if (!APPLY) {
        console.log('Dry run. Add --apply to clear their backoff AND their failure count,');
        console.log('so they are retried every cycle rather than once an hour.');
        return;
      }
      const res = await client.query(
        `update sync_journal set next_push_at = null, attempts = 0
          where ack_at is null and attempts < $1
            and (next_push_at is not null or attempts > 0)`,
        [MIN_ATTEMPTS]);
      console.log(`Released ${res.rowCount}. Backoff and failure count cleared;`);
      console.log('they go on the next cycle, and back off again only if they fail on their own.');
      return;
    }

    if (RESTORE) {
      const { rows } = await client.query(
        `select count(*)::int as n from sync_journal
          where ack_at is null and next_push_at > now() + interval '1 day'`);
      console.log(`${rows[0].n} entr(y/ies) are currently stood down.`);
      if (!APPLY) {
        console.log('Dry run. Add --apply to put them back in the queue.');
        return;
      }
      const res = await client.query(
        `update sync_journal set next_push_at = null
          where ack_at is null and next_push_at > now() + interval '1 day'`);
      console.log(`Restored ${res.rowCount}. They will be retried on the next cycle.`);
      return;
    }

    const { rows } = await client.query(
      `select id::text, table_name, row_id, attempts,
              left(coalesce(last_error, ''), 70) as last_error
         from sync_journal
        where ack_at is null and attempts >= $1
        order by attempts desc`,
      [MIN_ATTEMPTS]);

    if (!rows.length) {
      console.log(`Nothing has failed ${MIN_ATTEMPTS} or more times. Nothing to stand down.`);
      return;
    }

    console.log(`${rows.length} entr(y/ies) have failed ${MIN_ATTEMPTS}+ times:`);
    console.log('');
    for (const r of rows) {
      console.log(`  ${r.table_name}/${r.row_id.slice(0, 8)}   ${r.attempts} attempts`);
      if (r.last_error) console.log(`      peer said: ${r.last_error}`);
    }
    console.log('');

    // What is behind them, which is the whole point of doing this.
    const { rows: behind } = await client.query(
      `select table_name, count(*)::int as n
         from sync_journal
        where ack_at is null and attempts < $1
        group by table_name order by 2 desc`,
      [MIN_ATTEMPTS]);
    const total = behind.reduce((n, b) => n + b.n, 0);
    console.log(`Waiting behind them: ${total} entr(y/ies)`);
    for (const b of behind) console.log(`  ${String(b.n).padStart(4)}  ${b.table_name}`);
    console.log('');

    if (!APPLY) {
      console.log(`Dry run. Nothing has changed. Add --apply to stand the ${rows.length} down`);
      console.log(`for ${STAND_DOWN_DAYS} days so the ${total} behind them can go.`);
      return;
    }

    const res = await client.query(
      `update sync_journal
          set next_push_at = now() + ($2 || ' days')::interval
        where ack_at is null and attempts >= $1`,
      [MIN_ATTEMPTS, String(STAND_DOWN_DAYS)]);

    console.log(`Stood down ${res.rowCount} for ${STAND_DOWN_DAYS} days.`);
    console.log('They are still queued and still counted — nothing was deleted or acknowledged.');
    console.log('They reappear when the stand-down expires, unless they are settled first.');
    console.log('');
    console.log('Undo with:  node scripts/local-server/stand-down-blockers.js --restore --apply');
  } finally {
    await client.end().catch(() => { /* closing is best effort */ });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
