#!/usr/bin/env node
/**
 * Everything about the WhatsApp setup that can be done without Meta.
 *
 *   node scripts/whatsapp-setup.js            # worksheet, with a generated token
 *   node scripts/whatsapp-setup.js --verify   # test credentials once they exist
 *
 * The account itself cannot be automated: Meta has no API for creating a
 * Business Manager, it requires a human to pass identity verification and
 * upload documents, and automating it breaches their terms. This handles the
 * parts around it — the value you have to invent, the wording to paste, and a
 * check that the credentials actually work before anyone trusts them.
 */
const crypto = require('crypto');

const VERIFY = process.argv.includes('--verify');

const TEMPLATES = [
  {
    name: 'theatre_setup_overdue',
    category: 'UTILITY',
    body: 'Theatre {{1}} setup is overdue. The case is due at {{2}}. Please attend immediately.',
    note: 'Staff only. Names no patient.',
  },
  {
    name: 'vendor_request_reminder',
    category: 'UTILITY',
    body: 'Reminder: request {{1}} has not been confirmed. It was required by {{2}}. Please respond.',
    note: 'Staff and suppliers. No clinical detail.',
  },
  {
    name: 'patient_appointment_update',
    category: 'UTILITY',
    body: 'Dear {{1}}, there is an update about your procedure on {{2}}. Please contact {{3}}.',
    note: 'BLOCKED until consent capture exists. Says that something changed, never what.',
  },
];

async function verify() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const api = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';

  if (!token || !phoneId) {
    console.error('\nSet WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID first.\n');
    process.exit(1);
  }

  console.log('\nChecking the credentials against Meta...\n');

  // Reads only. Nothing is sent to anybody.
  const res = await fetch(`${api}/${phoneId}?fields=verified_name,display_phone_number,quality_rating`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json();

  if (!res.ok) {
    const err = body.error || {};
    console.error(`  FAILED ${res.status}: ${err.message || JSON.stringify(body)}`);
    if (err.code === 190) {
      console.error('\n  Code 190 is an expired or invalid token. If everything worked');
      console.error('  yesterday and stopped today, the 24-hour dashboard token was used');
      console.error('  instead of a System User token. That is the commonest failure here.');
    }
    process.exit(1);
  }

  console.log(`  number      ${body.display_phone_number || '(none)'}`);
  console.log(`  shows as    ${body.verified_name || '(not yet approved)'}`);
  console.log(`  quality     ${body.quality_rating || 'n/a'}`);

  // A token that expires is the failure this checks for specifically.
  const debug = await fetch(`${api.replace(/\/v[\d.]+$/, '')}/debug_token?input_token=${token}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json()).catch(() => null);

  const expires = debug?.data?.expires_at;
  if (expires === 0 || expires === undefined) {
    console.log('  token       does not expire — correct, this is a System User token');
  } else {
    const when = new Date(expires * 1000);
    console.log(`  token       EXPIRES ${when.toISOString()}`);
    console.log('\n  ! This is a temporary token. Everything will work until then and');
    console.log('    stop afterwards. Replace it with a System User token now.');
  }

  const killed = process.env.COMMUNICATION_DISABLED === 'true';
  const channels = process.env.COMMUNICATION_DISABLED_CHANNELS || '';
  console.log(`\n  sending     ${killed ? 'ALL DISABLED'
    : channels.includes('WHATSAPP') ? 'WhatsApp disabled — safe'
      : 'LIVE — messages will reach real numbers'}`);
  console.log('');
}

function worksheet() {
  const token = crypto.randomBytes(24).toString('hex');

  console.log(`
WhatsApp setup — the parts that do not need Meta
================================================

The account, verification and phone number must be done by a person at
business.facebook.com. Nothing here can do that. See docs/whatsapp-setup.md.

1. YOUR WEBHOOK VERIFY TOKEN — generated, use this one
------------------------------------------------------

  ${token}

  Paste it in BOTH places, identical:
    - Vercel:  WHATSAPP_WEBHOOK_VERIFY_TOKEN
    - Meta:    WhatsApp > Configuration > Webhook > Verify token

2. WEBHOOK CALLBACK URL
-----------------------

  https://unth-theatre.link/api/webhooks/whatsapp

  Subscribe to the "messages" field. That carries delivery receipts and read
  receipts as well as inbound replies.

3. TEMPLATES — paste these exactly into WhatsApp Manager
--------------------------------------------------------`);

  for (const t of TEMPLATES) {
    console.log(`
  Name:     ${t.name}
  Category: ${t.category}
  Body:     ${t.body}
  ${t.note}`);
  }

  console.log(`
4. VERCEL ENVIRONMENT — set the kill switch BEFORE anything else
----------------------------------------------------------------

  COMMUNICATION_DISABLED_CHANNELS=WHATSAPP
  WHATSAPP_API_URL=https://graph.facebook.com/v21.0
  WHATSAPP_WEBHOOK_VERIFY_TOKEN=${token}
  WHATSAPP_ACCESS_TOKEN=          <- System User token, NOT the dashboard one
  WHATSAPP_PHONE_NUMBER_ID=       <- WhatsApp > API Setup, not the phone number
  WHATSAPP_APP_SECRET=            <- App Settings > Basic

  Sending is cloud-only. Do not set these on the theatre server: Meta's
  webhooks cannot reach it, and if both nodes could send, a message queued
  locally and then synced would go out twice.

5. WHEN THE CREDENTIALS EXIST
------------------------------

  node scripts/whatsapp-setup.js --verify

  Reads only. It sends no message and checks the one thing that silently
  breaks later: whether the token expires.
`);
}

(VERIFY ? verify() : Promise.resolve(worksheet())).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
