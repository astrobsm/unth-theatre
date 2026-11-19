#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// Settle two records claiming one emergency booking
// -----------------------------------------------------------------------------
//   node scripts/local-server/settle-rival-booking.js <local-id>
//   node scripts/local-server/settle-rival-booking.js <local-id> --status CANCELLED --apply
//   node scripts/local-server/settle-rival-booking.js <local-id> --keep-cloud --apply
//
// THE SHAPE OF THE PROBLEM. A backfill on 2 September created emergency
// bookings on the theatre server for operations the cloud already held. Each
// pair shares one surgeryId, which is UNIQUE, so the server's copy can never
// be inserted on the cloud: it is refused, re-sent, refused again. One of them
// reached 12,488 attempts and sat at the head of the outbound queue from
// August until 19 November, timing the cloud out on every batch and taking
// that morning's theatre list down with it.
//
// Retrying cannot settle this and neither can a rule. Which record is true is
// a clinical question, so this tool does not decide it — it applies a decision
// somebody has already made, and writes down that they made it.
//
// --keep-cloud        the cloud's record stands; the server's stops trying
// --status <X>        set the cloud's record to this status, then stop trying
//
// WHAT IS NEVER DONE. The cloud's other fields are not blanked. If the cloud
// holds an anaesthetist, an alert id and thirteen notified roles and the
// server's copy holds nulls, those things still happened and the record of
// them is not a casualty of a status correction. Only the status moves.
//
// The server's own row is left exactly as it is. It is the journal ENTRY that
// is acknowledged, so the change stops being offered to a peer that can never
// take it. The row, and the history of both, stay on both sides.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const LOCAL_ID = args.find((a) => !a.startsWith('--')) ?? null;
const APPLY = args.includes('--apply');
const KEEP_CLOUD = args.includes('--keep-cloud');
const STATUS = (() => {
  const i = args.indexOf('--status');
  return i >= 0 ? (args[i + 1] ?? '').toUpperCase() : null;
})();
const WHO = (() => {
  const i = args.indexOf('--by');
  return i >= 0 ? args[i + 1] : (process.env.USER || process.env.USERNAME || 'operator');
})();

function urls() {
  // .env.local is the node; .env points at the cloud on this box.
  const local = (() => {
    const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const l = t.split(/\r?\n/).filter((x) => x.startsWith('DATABASE_URL=')).pop();
    return l.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  })();
  const cloud = (() => {
    const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const l = t.split(/\r?\n/).filter((x) => x.startsWith('DATABASE_URL=')).pop();
    return l.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  })();
  if (/localhost|127\.0\.0\.1/.test(cloud)) throw new Error('.env does not point at the cloud.');
  return { local, cloud };
}

async function main() {
  if (!LOCAL_ID) {
    console.error('Usage: settle-rival-booking.js <local-id> [--keep-cloud | --status X] [--apply]');
    process.exit(2);
  }
  if (KEEP_CLOUD && STATUS) {
    console.error('Choose one: --keep-cloud or --status.');
    process.exit(2);
  }

  const { local, cloud } = urls();
  const l = new Client({ connectionString: local, connectionTimeoutMillis: 15000 });
  const c = new Client({ connectionString: cloud, connectionTimeoutMillis: 25000 });
  await l.connect();
  await c.connect();

  try {
    const { rows: mine } = await l.query(
      'select * from emergency_surgery_bookings where id = $1', [LOCAL_ID]);
    if (!mine.length) throw new Error(`No booking ${LOCAL_ID} on the theatre server.`);
    const surgeryId = mine[0].surgeryId;

    const { rows: theirs } = await c.query(
      'select * from emergency_surgery_bookings where "surgeryId" = $1', [surgeryId]);
    if (!theirs.length) throw new Error('The cloud holds no booking for that surgery — nothing rival.');

    console.log(`surgery  ${surgeryId}`);
    console.log(`server   ${mine[0].id}  status=${mine[0].status}`);
    console.log(`cloud    ${theirs[0].id}  status=${theirs[0].status}`);
    console.log('');

    if (!KEEP_CLOUD && !STATUS) {
      console.log('No decision given. Add --keep-cloud, or --status <STATUS>.');
      return;
    }

    if (STATUS) {
      console.log(`Would set the CLOUD record ${theirs[0].id} to ${STATUS}.`);
      console.log('Every other field on it is left alone — the alert, the anaesthetist and the');
      console.log('roles that were notified all happened, and a status correction does not');
      console.log('unmake them.');
    } else {
      console.log('Would leave the cloud record exactly as it is.');
    }
    console.log(`Would then acknowledge the server's journal entry so it stops being offered.`);
    console.log('');

    if (!APPLY) {
      console.log('Dry run. Nothing has changed. Add --apply.');
      return;
    }

    if (STATUS) {
      await c.query('BEGIN');
      // Not journalled back: this is a decision being recorded, not a change
      // originating on the cloud that the node needs to hear about.
      await c.query(`SET LOCAL "orm.sync_applying" = 'on'`);
      await c.query(
        'update emergency_surgery_bookings set status = $2, "updatedAt" = now() where id = $1',
        [theirs[0].id, STATUS]);
      await c.query('COMMIT');
      console.log(`Cloud record ${theirs[0].id} set to ${STATUS}.`);
    }

    const res = await l.query(
      `update sync_journal
          set ack_at = now(),
              last_error = $2
        where ack_at is null and table_name = 'emergency_surgery_bookings' and row_id = $1`,
      [LOCAL_ID,
        `Settled by ${WHO}: ${STATUS ? `cloud set to ${STATUS}` : 'cloud record kept'}`]);
    console.log(`Acknowledged ${res.rowCount} journal entr(y/ies). It will not be offered again.`);
    console.log('Both rows remain on both sides; only the attempt to replicate has stopped.');
  } finally {
    await l.end().catch(() => {});
    await c.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
