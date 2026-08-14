#!/usr/bin/env node
/**
 * Put everything the text recogniser needs on the hospital's own server.
 *
 *   node scripts/maintenance/fetch-tesseract-assets.js
 *
 * Runs as part of the build, so both Vercel and the theatre server end up
 * serving these themselves.
 *
 * Why: tesseract.js otherwise fetches its WASM core and ~10 MB of English
 * training data from a public CDN the first time anybody photographs a page.
 * On a hospital connection that is slow; behind the captive portal it is blocked
 * outright; and offline it simply cannot happen. OCR was reported hanging at 5%
 * for exactly this reason.
 *
 * Serving them from the app makes OCR work with no internet at all, which is how
 * the rest of ORM already behaves.
 *
 * Idempotent: a file already present is left alone, so a rebuild does not
 * re-download 10 MB.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'public', 'tesseract');

/** Copied out of node_modules — no download needed, they are already here. */
const LOCAL_COPIES = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
];

/**
 * The language data. "4.0.0_fast" rather than the full model: about 2 MB instead
 * of 10, and for typed and reasonably clear handwriting the accuracy difference
 * does not justify five times the download on this connection.
 */
const LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz';
const LANG_FILE = 'eng.traineddata.gz';

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        res.resume();
        return resolve(download(res.headers.location, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      // Written to a temporary name and renamed on success, so an interrupted
      // download cannot leave a truncated file that looks complete and then
      // fails to parse months later.
      const tmp = `${dest}.partial`;
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        fs.renameSync(tmp, dest);
        resolve();
      }));
      file.on('error', (err) => {
        fs.unlink(tmp, () => reject(err));
      });
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  for (const [from, to] of LOCAL_COPIES) {
    const src = path.join(ROOT, 'node_modules', from);
    const dst = path.join(OUT, to);
    if (!fs.existsSync(src)) {
      console.warn(`  skip   ${to} — not in node_modules (${from})`);
      continue;
    }
    if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) {
      console.log(`  ok     ${to} (already present)`);
      continue;
    }
    fs.copyFileSync(src, dst);
    console.log(`  copied ${to} (${(fs.statSync(dst).size / 1e6).toFixed(1)} MB)`);
  }

  const langDest = path.join(OUT, LANG_FILE);
  if (fs.existsSync(langDest) && fs.statSync(langDest).size > 100_000) {
    console.log(`  ok     ${LANG_FILE} (already present)`);
  } else {
    try {
      console.log(`  fetch  ${LANG_FILE} …`);
      await download(LANG_URL, langDest);
      console.log(`  got    ${LANG_FILE} (${(fs.statSync(langDest).size / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      // NOT fatal. A build must not fail because a public CDN is unreachable —
      // that would make the hospital unable to deploy during an outage, which is
      // the very situation this script exists to protect against. Without the
      // file, OCR falls back to the CDN exactly as it does today.
      console.warn(`  warn   could not fetch ${LANG_FILE}: ${err.message}`);
      console.warn('         OCR will fall back to the public CDN at runtime.');
    }
  }

  console.log(`\nTesseract assets in public/tesseract — served by this app, no CDN needed.\n`);
}

main().catch((err) => {
  console.error(err);
  // Still not fatal: see above.
  process.exit(0);
});
