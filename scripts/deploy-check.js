#!/usr/bin/env node
/**
 * What is configured, what is missing, and what each gap actually means.
 *
 *   node scripts/deploy-check.js
 *
 * Reads configuration and the filesystem. Sends nothing anywhere, contacts no
 * service, and prints no secret — a fingerprint where a value exists, never the
 * value. Safe to run on a live server and safe to paste the output.
 *
 * Exit 0 when nothing is blocking, 1 otherwise, so it can gate a deploy script.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

// A plain node script does not get .env the way Next.js does, so without this
// the check reports every variable missing and three false blocks — which
// would be worse than not checking, because somebody would act on it.
for (const file of ['.env.local', '.env']) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  for (const rawLine of fs.readFileSync(full, "utf8").split(String.fromCharCode(10))) {
    const raw = rawLine.replace(/[\r]+$/, "");
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

const env = process.env;
const fp = (v) => (v ? crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 8) : '');

let blocking = 0;
let waiting = 0;

const line = (state, label, note = '') => {
  const mark = { ok: '  ok    ', block: '  BLOCK ', wait: '  wait  ', off: '  off   ' }[state];
  console.log(`${mark}${label.padEnd(34)}${note}`);
  if (state === 'block') blocking++;
  if (state === 'wait') waiting++;
};

const has = (name) => Boolean(env[name] && String(env[name]).trim());

console.log('\nCORE\n');
line(has('DATABASE_URL') ? 'ok' : 'block', 'DATABASE_URL',
  has('DATABASE_URL') ? fp(env.DATABASE_URL) : 'the app cannot start without it');
line(has('NEXTAUTH_SECRET') ? 'ok' : 'block', 'NEXTAUTH_SECRET',
  has('NEXTAUTH_SECRET') ? `${fp(env.NEXTAUTH_SECRET)} — must match on both nodes` : 'nobody can log in');
line(has('NEXTAUTH_URL') ? 'ok' : 'block', 'NEXTAUTH_URL', env.NEXTAUTH_URL || 'sessions will not persist');

// Migrations present in the repo. Whether they are APPLIED needs the database,
// which this deliberately does not contact.
const migrations = fs.existsSync(path.join(ROOT, 'prisma', 'migrations'))
  ? fs.readdirSync(path.join(ROOT, 'prisma', 'migrations')).filter((d) => /^\d/.test(d))
  : [];
console.log(`\n  ${migrations.length} migration(s) in the repository. The four most recent:`);
migrations.slice(-4).forEach((m) => console.log(`      ${m}`));
console.log('  `npm run build` applies any that are outstanding.');

console.log('\nOCR\n');
const tessData = path.join(ROOT, 'public', 'tesseract', 'eng.traineddata.gz');
line(fs.existsSync(tessData) ? 'ok' : 'block', 'tesseract language data',
  fs.existsSync(tessData) ? 'printed documents will read' : 'run npm run build');

const googleReady = has('GOOGLE_DOCAI_PROJECT_ID') && has('GOOGLE_DOCAI_PROCESSOR_ID') && has('GOOGLE_DOCAI_CREDENTIALS');
const accepted = env.OCR_EXTERNAL_PROCESSING_ACCEPTED === 'yes';
const providers = env.OCR_PROVIDERS || 'tesseract';

line(googleReady ? 'ok' : 'wait', 'Google Document AI configured',
  googleReady ? 'project, processor and key present' : 'handwriting will not work');

if (googleReady && env.GOOGLE_DOCAI_CREDENTIALS) {
  const raw = env.GOOGLE_DOCAI_CREDENTIALS.trim();
  try {
    const key = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    line(key.private_key && key.client_email ? 'ok' : 'block', 'credentials shape',
      key.client_email || 'no client_email — wrong JSON file');
  } catch {
    line('block', 'credentials shape', 'not valid JSON or base64 — use: base64 -w0 key.json');
  }
}

line(accepted ? 'ok' : 'off', 'external processing accepted',
  accepted ? 'documents WILL be sent to Google' : 'cloud engines stay off — this is the safe default');
if (env.OCR_EXTERNAL_PROCESSING_ACCEPTED && !accepted) {
  console.log(`          ! "${env.OCR_EXTERNAL_PROCESSING_ACCEPTED}" is not "yes", so it counts as no.`);
}
console.log(`  providers in order: ${providers}`);
if (providers.includes('googledocai') && !accepted) {
  line('wait', 'googledocai listed but not permitted', 'will be skipped; falls back to tesseract');
}

console.log('\nCOMMUNICATIONS\n');
const waKeys = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
const waSet = waKeys.filter(has);
line(waSet.length === waKeys.length ? 'ok' : 'wait', 'WhatsApp credentials',
  `${waSet.length}/${waKeys.length} set${waSet.length ? '' : ' — needs a Meta business account'}`);
if (waSet.length === waKeys.length && !has('WHATSAPP_APP_SECRET')) {
  line('block', 'WHATSAPP_APP_SECRET', 'webhooks fail closed without it');
}
const killed = env.COMMUNICATION_DISABLED === 'true';
const channelsOff = env.COMMUNICATION_DISABLED_CHANNELS || '';
// "live" must mean it can actually send. Reporting live with no credentials
// would tell somebody a channel is working when nothing could leave the
// building.
const canSend = waSet.length === waKeys.length && !killed && !channelsOff.includes('WHATSAPP');
line(canSend ? 'ok' : 'off', 'WhatsApp sending',
  killed ? 'ALL channels disabled by kill switch'
    : channelsOff.includes('WHATSAPP') ? 'disabled by COMMUNICATION_DISABLED_CHANNELS'
      : canSend ? 'LIVE — messages will go to real numbers'
        : 'not configured, nothing can send');

console.log('\nPUSH AND SYNC\n');
line(has('FCM_SERVICE_ACCOUNT') ? 'ok' : 'wait', 'FCM_SERVICE_ACCOUNT',
  has('FCM_SERVICE_ACCOUNT') ? '' : 'push notifications will not send');
line(has('SYNC_SERVICE_TOKEN') ? 'ok' : 'wait', 'SYNC_SERVICE_TOKEN',
  has('SYNC_SERVICE_TOKEN') ? fp(env.SYNC_SERVICE_TOKEN) : 'local/cloud sync will not authenticate');
line(has('SYNC_PEER_URL') ? 'ok' : 'wait', 'SYNC_PEER_URL', env.SYNC_PEER_URL || 'no peer configured');

console.log('\n' + '-'.repeat(70));
if (blocking) {
  console.log(`${blocking} thing(s) BLOCKING. The app will not work correctly until these are fixed.`);
} else {
  console.log('Nothing blocking. The app will run.');
}
if (waiting) {
  console.log(`${waiting} feature(s) waiting on configuration — see docs/STATUS.md.`);
}
console.log('-'.repeat(70) + '\n');
process.exit(blocking ? 1 : 0);
