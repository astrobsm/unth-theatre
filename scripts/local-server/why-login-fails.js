#!/usr/bin/env node
/* eslint-disable no-console */
// =============================================================================
// A password was reset and the user still cannot get in. Why?
// -----------------------------------------------------------------------------
//   node scripts/local-server/why-login-fails.js <username or phone>
//   node scripts/local-server/why-login-fails.js <username> --check
//
// Sign-in is not the suspect. It hashes with bcrypt and compares with bcrypt,
// and there is no second code path. What goes wrong is almost always one of
// two things, and they need different answers:
//
//   TWO ACCOUNTS. The reset landed on one record and the person signs in
//   against the other. Duplicate registrations are common here — the users
//   page has a "Find duplicate registrations" button for exactly this reason —
//   and a reset by name in an admin screen picks ONE of them.
//
//   TWO NODES. The theatre server and the cloud each hold a users row. A reset
//   made on one has to travel to the other, and this week it frequently did
//   not. Worse, `users` is CLOUD_AUTHORITATIVE: a reset performed ON THE
//   THEATRE SERVER is refused by the cloud and then overwritten by it, so it
//   works locally until the next sync and then stops.
//
// So the question is answered by looking at both databases at once and
// comparing what they hold, per account.
//
// It never prints a password hash. Equality between nodes is shown with a
// short SHA-256 fingerprint of the hash, which proves "same" or "different"
// and reveals nothing.
//
// Read-only. --check additionally asks for a password on the terminal (never
// on the command line, where it would land in shell history) and reports which
// accounts it would open.
// =============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const IDENT = args.find((a) => !a.startsWith('--'));
const CHECK = args.includes('--check');

if (!IDENT) {
  console.error('\nUsage: node scripts/local-server/why-login-fails.js <username or phone> [--check]\n');
  process.exit(2);
}

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

const localEnv = readEnvFile('.env.local');
const cloudEnv = readEnvFile('.env');
const NODES = [
  { name: 'theatre server (local)', url: localEnv.DATABASE_URL },
  { name: 'cloud', url: cloudEnv.DIRECT_URL || cloudEnv.DATABASE_URL },
].filter((n) => n.url);

if (NODES.length === 0) {
  console.error('No database URL in .env.local or .env.');
  process.exit(2);
}
// Same file on both sides means this is not the theatre server; still useful,
// just say so rather than reporting one database as two.
const distinct = new Set(NODES.map((n) => n.url));
const singleNode = distinct.size === 1;

/** Proves two nodes hold the same hash without disclosing any of it. */
const fingerprint = (hash) =>
  hash ? crypto.createHash('sha256').update(hash).digest('hex').slice(0, 10) : '(none)';

const looksLikePhone = (s) => /[0-9]/.test(s) && /^[0-9+()\-\s]+$/.test(s);
const last10 = (s) => s.replace(/\D/g, '').slice(-10);

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Not echoed: an admin diagnostic should not leave the password on screen
    // for whoever walks past next.
    const onData = (ch) => {
      if (['\n', '\r', ''].includes(ch.toString('utf8'))) {
        process.stdin.removeListener('data', onData);
      } else {
        process.stdout.write('[2K[200D Password to test: ');
      }
    };
    process.stdin.on('data', onData);
    rl.question(' Password to test: ', (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  console.log(`\nLooking up "${IDENT}"`);
  if (singleNode) console.log('  (one database configured — the two-node comparison is skipped)');
  console.log();

  const password = CHECK ? await askPassword() : null;
  let bcrypt = null;
  if (CHECK) {
    try { bcrypt = require('bcryptjs'); }
    catch { console.error('bcryptjs not installed here; --check unavailable.'); process.exit(2); }
  }

  const byNode = [];

  for (const node of singleNode ? [NODES[0]] : NODES) {
    const c = new Client({ connectionString: node.url, connectionTimeoutMillis: 20000 });
    try {
      await c.connect();
    } catch (e) {
      console.log(`${node.name}: UNREACHABLE — ${e.message.split('\n')[0]}`);
      byNode.push({ node: node.name, rows: null });
      continue;
    }
    try {
      const { rows } = looksLikePhone(IDENT)
        ? await c.query(
            `select id, username, "fullName", role, status, password, "phoneNumber",
                    "updatedAt", "mustChangePassword", sync_version, sync_origin
               from users where "phoneNumber" like $1 order by "updatedAt" desc`,
            [`%${last10(IDENT)}`])
        : await c.query(
            `select id, username, "fullName", role, status, password, "phoneNumber",
                    "updatedAt", "mustChangePassword", sync_version, sync_origin
               from users where lower(username) = lower($1) order by "updatedAt" desc`,
            [IDENT]);
      byNode.push({ node: node.name, rows });
    } catch (e) {
      console.log(`${node.name}: query failed — ${e.message.split('\n')[0]}`);
      byNode.push({ node: node.name, rows: null });
    } finally {
      await c.end().catch(() => {});
    }
  }

  for (const { node, rows } of byNode) {
    if (rows === null) continue;
    console.log(`── ${node} ${'─'.repeat(Math.max(0, 58 - node.length))}`);
    if (rows.length === 0) { console.log('  no account matches\n'); continue; }
    for (const r of rows) {
      const opens = CHECK && r.password
        ? (await bcrypt.compare(password, r.password) ? '  <<< THIS PASSWORD OPENS THIS ACCOUNT' : '  password does NOT match')
        : '';
      console.log(`  ${r.username}  (${r.fullName})`);
      console.log(`    id ${r.id}`);
      console.log(`    role ${r.role} · status ${r.status}${r.status !== 'APPROVED' ? '  <<< NOT APPROVED — cannot sign in' : ''}`);
      console.log(`    phone ${r.phoneNumber ?? '—'}`);
      console.log(`    password fingerprint ${fingerprint(r.password)} · changed ${new Date(r.updatedAt).toLocaleString('en-GB')}`);
      console.log(`    mustChangePassword ${r.mustChangePassword} · sync v${r.sync_version} from ${r.sync_origin ?? '—'}`);
      if (opens) console.log(`  ${opens}`);
      console.log();
    }
  }

  // ── What it means ───────────────────────────────────────────────────────
  console.log('── What this shows ────────────────────────────────────────');

  const all = byNode.filter((b) => b.rows);

  // "Nothing found" and "could not look" are different answers, and reporting
  // the second as the first sends somebody hunting for an account that is
  // sitting there perfectly intact behind a database they could not reach.
  if (all.length === 0) {
    console.log('  No database could be reached, so nothing was checked.');
    console.log('  On the theatre server run this from /home/emmanuel/unth-theatre.');
    console.log('  Elsewhere, DATABASE_URL must point at a database you can actually open.\n');
    return;
  }

  const anyRows = all.some((b) => b.rows.length);
  if (!anyRows) {
    const checked = all.map((b) => b.node).join(' and ');
    console.log(`  No account with that username or phone number on ${checked}.`);
    console.log('  Sign-in would report NOT_FOUND, which the screen shows as incorrect details.');
    if (byNode.length > all.length) {
      console.log('  NOTE: another node could not be reached, so the account may exist there.');
    }
    console.log();
    return;
  }

  let saidSomething = false;

  // Duplicates on any single node.
  for (const { node, rows } of all) {
    const approved = rows.filter((r) => r.status === 'APPROVED');
    if (rows.length > 1) {
      saidSomething = true;
      console.log(`  ${rows.length} accounts match on ${node}${approved.length > 1 ? `, ${approved.length} of them approved` : ''}.`);
      const prints = new Set(approved.map((r) => fingerprint(r.password)));
      if (prints.size > 1) {
        console.log('    They hold DIFFERENT passwords. A reset by name in an admin screen sets');
        console.log('    one of them; signing in with the other username still fails. This is the');
        console.log('    commonest cause of exactly this complaint.');
        console.log('    Fix: merge or suspend the duplicate, or reset the account they actually use.');
      }
      if (approved.length > 1) {
        console.log('    Note: signing in BY PHONE against several approved duplicates is refused');
        console.log('    as ambiguous if the password matches more than one of them.');
      }
    }
  }

  // Divergence between nodes.
  if (!singleNode && all.length === 2 && all[0].rows.length && all[1].rows.length) {
    const [a, b] = all;
    const mapB = new Map(b.rows.map((r) => [r.id, r]));
    for (const ra of a.rows) {
      const rb = mapB.get(ra.id);
      if (!rb) {
        saidSomething = true;
        console.log(`  Account ${ra.username} exists on ${a.node} but NOT on ${b.node}.`);
        continue;
      }
      if (fingerprint(ra.password) !== fingerprint(rb.password)) {
        saidSomething = true;
        console.log(`  Account ${ra.username} holds a DIFFERENT password on each node.`);
        console.log(`    ${a.node}: ${fingerprint(ra.password)} (changed ${new Date(ra.updatedAt).toLocaleString('en-GB')})`);
        console.log(`    ${b.node}: ${fingerprint(rb.password)} (changed ${new Date(rb.updatedAt).toLocaleString('en-GB')})`);
        console.log('    The reset has not reached both sides. Users signing in at the theatre hit');
        console.log('    the local server; users on unth-theatre.link hit the cloud.');
        console.log('    IMPORTANT: `users` is CLOUD_AUTHORITATIVE — a reset made on the theatre');
        console.log('    server is refused by the cloud and then overwritten by it. Reset on the');
        console.log('    CLOUD and let it flow down.');
      }
      if (ra.status !== rb.status) {
        saidSomething = true;
        console.log(`  Account ${ra.username} is ${ra.status} on ${a.node} but ${rb.status} on ${b.node}.`);
      }
    }
  }

  for (const { node, rows } of all) {
    for (const r of rows) {
      if (r.status !== 'APPROVED') {
        saidSomething = true;
        console.log(`  ${r.username} is ${r.status} on ${node} — sign-in refuses it whatever the password.`);
      }
    }
  }

  if (!saidSomething) {
    console.log('  One account, same password on every node, approved. Nothing here explains a');
    console.log('  rejected sign-in — re-run with --check to test the actual password against it.');
  }
  console.log();
})().catch((e) => { console.error('\nFAILED:', e.message, '\n'); process.exit(1); });
