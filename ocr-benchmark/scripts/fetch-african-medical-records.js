#!/usr/bin/env node
/**
 * Fetch the African Medical Records dataset.
 *
 *   node ocr-benchmark/scripts/fetch-african-medical-records.js
 *
 * CC-BY-4.0, verified 14 Aug 2026 — see ../DATASET-LICENCES.md. 62 Nigerian
 * handwritten clinical documents with exact ground truth: the closest external
 * proxy to UNTH's own documents that exists publicly.
 *
 * It is a PROXY, not a substitute. Different hospital, writers, forms and
 * phones. It lives in external/ and never merges into unth/.
 *
 * Idempotent: files already present are skipped, so this can be re-run after an
 * interrupted download without re-fetching ~300 MB.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'Nigeria-Health-data-OCR-pipeline/African-Medical-Records';
const OUT = path.resolve(__dirname, '..', 'external', 'african-medical-records');

// Modest concurrency deliberately. The first attempt opened connections as fast
// as it could and was met with ECONNRESET on most of them.
const agent = new https.Agent({ keepAlive: true, maxSockets: 3 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url, dest, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      agent,
      headers: { 'user-agent': 'unth-orm-benchmark/1.0', accept: '*/*' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirectsLeft) return reject(new Error('too many redirects'));
        // HuggingFace sends RELATIVE Location headers. Handing one straight to
        // https.get throws "Invalid URL", which is what silently failed every
        // markdown and CSV file on the first run while the images succeeded.
        const next = new URL(res.headers.location, url).href;
        return resolve(get(next, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.part`;
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      file.on('error', (err) => fs.unlink(tmp, () => reject(err)));
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => req.destroy(new Error('timeout')));
  });
}

function listFiles() {
  return new Promise((resolve, reject) => {
    https.get(`https://huggingface.co/api/datasets/${REPO}`, { agent }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const meta = JSON.parse(body);
          const licence = meta.cardData && meta.cardData.license;
          // Refuse rather than proceed if the licence is not what was audited.
          // A dataset's terms can change, and downloading a hospital's
          // benchmark data under terms nobody checked is how this goes wrong.
          if (licence !== 'cc-by-4.0') {
            return reject(new Error(
              `Licence is now "${licence}", not the cc-by-4.0 that was audited. ` +
              'Stopping. Re-audit before downloading.',
            ));
          }
          resolve(meta.siblings.map((s) => s.rfilename).filter((f) => !f.startsWith('.git')));
        } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const files = await listFiles();
  console.log(`${files.length} files listed, licence cc-by-4.0 confirmed\n`);

  let present = 0;
  const failed = [];

  for (const name of files) {
    const dest = path.join(OUT, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { present++; continue; }

    const url = `https://huggingface.co/datasets/${REPO}/resolve/main/`
      + name.split('/').map(encodeURIComponent).join('/');

    let done = false;
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        await get(url, dest);
        present++;
        done = true;
        if (present % 10 === 0) console.log(`  ${present}/${files.length}`);
      } catch (err) {
        if (attempt === 4) failed.push(`${name} :: ${err.message}`);
        else await sleep(500 * attempt * attempt);
      }
    }
    await sleep(150);
  }

  console.log(`\npresent: ${present}/${files.length}   failed: ${failed.length}`);
  failed.slice(0, 10).forEach((f) => console.log(`  ${f}`));
  if (failed.length) console.log('\nRe-run to retry the failures; completed files are skipped.');

  fs.writeFileSync(path.join(OUT, 'PROVENANCE.md'),
    `# African Medical Records\n\n`
    + `Source: https://huggingface.co/datasets/${REPO}\n`
    + `Licence: CC-BY-4.0 (verified at download time)\n`
    + `Files present: ${present}/${files.length}\n\n`
    + `Nigerian handwritten clinical documents with exact ground truth.\n`
    + `An external PROXY for UNTH documents, never a substitute: different\n`
    + `hospital, writers, forms and phones. Results from this dataset must\n`
    + `always be reported as African Medical Records results, never as evidence\n`
    + `about UNTH.\n\n`
    + `Attribution is required by CC-BY-4.0 wherever results are published.\n`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
