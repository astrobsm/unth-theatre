#!/usr/bin/env node
/**
 * Compare engines on the working corpus.
 *
 *   node ocr-benchmark/scripts/compare-engines.js --engine trocr --limit 10
 *   node ocr-benchmark/scripts/compare-engines.js --engine easyocr
 *   node ocr-benchmark/scripts/compare-engines.js --engine tesseract
 *
 * Ranks by accuracy on numbers, doses and drug names — not by character error
 * rate, which cannot tell a misread dose from a harmless typo.
 *
 * Runs only against the TUNING split by default. The locked test split is for
 * one measurement at the end; using it while choosing an engine would turn the
 * benchmark into a description of itself.
 *
 * Corpus: African Medical Records (CC-BY-4.0). An external proxy for UNTH,
 * never a substitute — results are labelled as such wherever they are written.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.resolve(__dirname, '..', 'external', 'african-medical-records');
const SPLITS = path.resolve(__dirname, '..', 'unth', 'splits');

function requireTs(rel) {
  const file = path.resolve(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(js, file);
  return m.exports;
}
const { score, pool, isSafeForClinicalUse } = requireTs('src/lib/ocr/metrics.ts');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}

const PYTHON = process.env.OCR_PYTHON || 'python';

/** Each returns { text } or throws. */
const ENGINES = {
  async tesseract(imagePaths) {
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng', 1, {
      langPath: path.join(ROOT, 'public', 'tesseract'),
      gzip: true,
      cachePath: path.join(ROOT, '.ocr-bench-cache', 'tesseract-fast'),
    });
    await worker.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' });
    const out = [];
    for (const p of imagePaths) out.push((await worker.recognize(p)).data.text || '');
    await worker.terminate();
    return out.join('\n');
  },

  async trocr(imagePaths) { return runSidecar(imagePaths, []); },

  // Sends documents to Google. Refuses to run without the same explicit
  // acceptance the application requires, so a benchmark cannot become the
  // route by which patient documents first leave the hospital.
  async googledocai(imagePaths) {
    if (process.env.OCR_EXTERNAL_PROCESSING_ACCEPTED !== 'yes') {
      throw new Error(
        'This engine sends documents outside the hospital. Set '
        + 'OCR_EXTERNAL_PROCESSING_ACCEPTED=yes only once UNTH has accepted that.',
      );
    }
    const { GoogleDocumentAiProvider } = requireTs('src/lib/ocr/providers/googleDocAI.ts');
    const provider = new GoogleDocumentAiProvider();
    if (!(await provider.available())) {
      throw new Error('Set GOOGLE_DOCAI_PROJECT_ID, GOOGLE_DOCAI_PROCESSOR_ID and GOOGLE_DOCAI_CREDENTIALS.');
    }
    const out = [];
    for (const p of imagePaths) {
      const bytes = fs.readFileSync(p);
      const mime = p.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      out.push((await provider.recognise(bytes, mime)).text);
    }
    return out.join('\n');
  },
  async easyocr(imagePaths) { return runSidecar(imagePaths, ['--easyocr-only']); },
};

function runSidecar(imagePaths, extraArgs) {
  const texts = [];
  for (const image of imagePaths) {
    const res = spawnSync(PYTHON, [
      path.join(ROOT, 'scripts', 'ocr', 'trocr_ocr.py'), image, ...extraArgs,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: ROOT });

    if (res.error) throw new Error(`could not start ${PYTHON}: ${res.error.message}`);
    if (res.status !== 0) {
      // stderr, not a summary: the traceback names the real cause.
      throw new Error((res.stderr || '').trim().split('\n').slice(-2).join(' ') || `exit ${res.status}`);
    }
    const parsed = JSON.parse(res.stdout);
    if (parsed.error) throw new Error(parsed.error);
    texts.push(parsed.text || '');
  }
  return texts.join('\n');
}

function readCsv(file) {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',').map((c) => c.trim());
  return rows.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]));
  });
}

function readSplit(name) {
  const file = path.join(SPLITS, name);
  if (!fs.existsSync(file)) return null;
  return new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#')));
}

async function main() {
  const engineName = (arg('engine') || 'tesseract').toLowerCase();
  const engine = ENGINES[engineName];
  if (!engine) {
    console.error(`Unknown engine "${engineName}". One of: ${Object.keys(ENGINES).join(', ')}`);
    process.exit(1);
  }

  const useLocked = process.argv.includes('--locked-test-set');
  const split = readSplit(useLocked ? 'test-locked.txt' : 'tune.txt');
  const limit = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;

  if (useLocked) {
    console.log('\n*** LOCKED TEST SET. This is the final measurement, not a tuning run. ***');
  }

  const rows = readCsv(path.join(DATA, 'metadata.csv'))
    .filter((r) => !split || split.has(r.pair_id));

  console.log(`\n${engineName} — ${Math.min(rows.length, limit)} document(s) of ${rows.length} in the ${useLocked ? 'LOCKED' : 'tuning'} split\n`);

  const results = [];
  let done = 0;

  for (const row of rows) {
    if (done >= limit) break;
    const truthPath = path.join(DATA, row.truth_file || `truth/${row.pair_id}.txt`);
    if (!fs.existsSync(truthPath)) continue;

    const pages = fs.readdirSync(path.join(DATA, 'htr'))
      .filter((f) => f.startsWith(`${row.pair_id}_HTR`)).sort()
      .map((f) => path.join(DATA, 'htr', f));
    if (!pages.length) continue;

    const truth = fs.readFileSync(truthPath, 'utf8');
    const t0 = Date.now();
    let text = '';
    let failure = null;
    try { text = await engine(pages); } catch (err) { failure = err.message; }
    const ms = Date.now() - t0;

    const s = failure ? null : score(truth, text);
    results.push({ pairId: row.pair_id, ms, failure, score: s });
    done++;

    if (s) {
      console.log(`  ${row.pair_id.padEnd(9)} CER ${(s.cer * 100).toFixed(1).padStart(6)}%  `
        + `numbers/drugs ${(s.criticalAccuracy * 100).toFixed(1).padStart(5)}%  ${(ms / 1000).toFixed(1)}s`);
    } else {
      console.log(`  ${row.pair_id.padEnd(9)} FAILED: ${failure}`);
    }
  }

  const ok = results.filter((r) => r.score).map((r) => r.score);
  if (ok.length === 0) {
    console.error('\nNOTHING WAS SCORED. No verdict is given, because none was earned.');
    process.exit(1);
  }

  const pooled = pool(ok);
  const verdict = isSafeForClinicalUse(pooled);
  const magnitude = pooled.criticalErrors.filter((e) => e.orderOfMagnitude);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${engineName}  —  African Medical Records (external proxy, NOT UNTH)`);
  console.log('='.repeat(70));
  console.log(`documents            ${results.length} (${results.filter((r) => r.failure).length} failed)`);
  console.log(`character error rate ${(pooled.cer * 100).toFixed(1)}%`);
  console.log(`word error rate      ${(pooled.wer * 100).toFixed(1)}%`);
  console.log(`numbers/doses/drugs  ${(pooled.criticalAccuracy * 100).toFixed(1)}%  (${pooled.criticalCorrect}/${pooled.criticalTotal})`);
  console.log(`order-of-magnitude   ${magnitude.length}`);
  console.log(`\n${verdict.safe ? 'WITHIN THRESHOLDS' : 'NOT SAFE'} — ${verdict.reason}`);
  console.log('\nBaseline to beat — tesseract on the full corpus: 4.7% on numbers and drugs.\n');

  const out = arg('json');
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), JSON.stringify({
      engine: engineName,
      dataset: 'African Medical Records (CC-BY-4.0) — external proxy, NOT UNTH',
      split: useLocked ? 'test-locked' : 'tune',
      pooled, verdict, results,
    }, null, 2));
    console.log(`Report: ${out}\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
