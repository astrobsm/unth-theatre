#!/usr/bin/env node
/**
 * What is configured, what is missing, and what it means.
 *
 *   node scripts/ocr/check-config.js
 *
 * Reads the environment only. Sends nothing anywhere and prints no secret —
 * a fingerprint where a value exists, never the value.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const fp = (v) => (v ? crypto.createHash('sha256').update(v).digest('hex').slice(0, 8) : null);
const rows = [];
let blocking = 0;

function check(name, value, { required = false, note = '' } = {}) {
  const present = Boolean(value && String(value).trim());
  if (!present && required) blocking++;
  rows.push({ name, present, required, note });
}

const env = process.env;

check('GOOGLE_DOCAI_PROJECT_ID', env.GOOGLE_DOCAI_PROJECT_ID, { required: true, note: 'e.g. theatre-orm' });
check('GOOGLE_DOCAI_LOCATION', env.GOOGLE_DOCAI_LOCATION, { note: 'defaults to eu' });
check('GOOGLE_DOCAI_PROCESSOR_ID', env.GOOGLE_DOCAI_PROCESSOR_ID, { required: true, note: 'from the processor page' });
check('GOOGLE_DOCAI_CREDENTIALS', env.GOOGLE_DOCAI_CREDENTIALS, { required: true, note: 'service account JSON, base64' });

console.log('\nGoogle Document AI\n');
for (const r of rows) {
  const mark = r.present ? 'set   ' : (r.required ? 'MISSING' : 'unset ');
  console.log(`  ${mark}  ${r.name.padEnd(28)} ${r.present ? '' : r.note}`);
}

// The credentials are the one that fails in a confusing way, so check the shape.
if (env.GOOGLE_DOCAI_CREDENTIALS) {
  const raw = env.GOOGLE_DOCAI_CREDENTIALS.trim();
  try {
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const key = JSON.parse(text);
    if (!key.private_key || !key.client_email) {
      console.log('\n  ! The credentials parse but have no private_key or client_email.');
      console.log('    That is probably the wrong file — you want the service account KEY,');
      console.log('    not the project or OAuth client JSON.');
      blocking++;
    } else {
      console.log(`\n  credentials look right — service account ${key.client_email}`);
      console.log(`  fingerprint ${fp(key.private_key)} (compare between machines; never paste the key)`);
    }
  } catch {
    console.log('\n  ! The credentials are set but could not be read as JSON or base64.');
    console.log('    A PEM private key pasted raw loses its newlines. Use:');
    console.log('      base64 -w0 key.json');
    blocking++;
  }
}

console.log('\nPolicy\n');
const providers = env.OCR_PROVIDERS || '(unset — defaults to tesseract only)';
console.log(`  OCR_PROVIDERS                 ${providers}`);
const accepted = env.OCR_EXTERNAL_PROCESSING_ACCEPTED;
console.log(`  OCR_EXTERNAL_PROCESSING_ACCEPTED  ${accepted || '(unset)'}`);

if (accepted && accepted !== 'yes') {
  console.log(`\n  ! "${accepted}" is not "yes", so it counts as NO. The check is exact on`);
  console.log('    purpose: a typo must fail closed when the consequence is a consent');
  console.log('    form leaving the hospital.');
}

const usingGoogle = (env.OCR_PROVIDERS || '').includes('googledocai');
if (usingGoogle && accepted !== 'yes') {
  console.log('\n  ! googledocai is listed but external processing has not been accepted.');
  console.log('    It will be skipped and scanning will fall back to tesseract.');
  blocking++;
}
if (!usingGoogle && blocking === 0) {
  console.log('\n  Google is configured but not enabled. To use it:');
  console.log('    OCR_PROVIDERS=googledocai,tesseract');
  console.log('    OCR_EXTERNAL_PROCESSING_ACCEPTED=yes');
}

// Tesseract is the fallback and must actually be present.
const lang = path.join(process.cwd(), 'public', 'tesseract', 'eng.traineddata.gz');
console.log(`\nTesseract fallback\n\n  ${fs.existsSync(lang) ? 'present' : 'MISSING — run npm run build'}  ${lang}`);

console.log(blocking === 0
  ? '\nNothing blocking.\n'
  : `\n${blocking} thing(s) to fix before this engine can run.\n`);
process.exit(blocking === 0 ? 0 : 1);
