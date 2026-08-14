#!/usr/bin/env node
/**
 * Run the benchmark over the African Medical Records dataset.
 *
 *   node ocr-benchmark/scripts/run-african-benchmark.js [--limit N] [--json out.json]
 *
 * This dataset does not lay its files out the way the generic harness expects —
 * images in htr/, transcriptions in truth/, and seventeen documents split
 * across several pages sharing ONE transcription. So this adapter pairs them
 * from metadata.csv and concatenates a document's pages before scoring.
 *
 * Attribution, required by CC-BY-4.0: African Medical Records,
 * Nigeria-Health-data-OCR-pipeline, https://huggingface.co/datasets/
 * Nigeria-Health-data-OCR-pipeline/African-Medical-Records
 *
 * These results describe THIS dataset. They are the closest available proxy for
 * UNTH and they are not UNTH: different hospital, writers, forms and phones.
 * Nothing here may be reported as evidence about UNTH performance.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.resolve(__dirname, '..', 'external', 'african-medical-records');

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
const { assessQuality } = requireTs('src/lib/ocr/imageQuality.ts');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Minimal CSV reader; this file has no quoted commas. */
function readCsv(file) {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',');
  return rows.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c.trim(), (cells[i] ?? '').trim()]));
  });
}

function pagesFor(pairId, htrField) {
  // htr_file may name one file or several; fall back to globbing the directory,
  // because a manifest and a directory can disagree and the files are the truth.
  const all = fs.readdirSync(path.join(DATA, 'htr'))
    .filter((f) => f.startsWith(`${pairId}_HTR`))
    .sort();
  if (all.length) return all.map((f) => path.join(DATA, 'htr', f));
  return htrField ? [path.join(DATA, 'htr', htrField)] : [];
}

async function main() {
  const limit = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
  const rows = readCsv(path.join(DATA, 'metadata.csv'));
  const { createWorker } = require('tesseract.js');

  const worker = await createWorker('eng', 1, {
    langPath: path.join(ROOT, 'public', 'tesseract'),
    gzip: true,
    cachePath: path.join(ROOT, '.ocr-bench-cache', 'tesseract-fast'),
  });
  await worker.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' });

  const results = [];
  const contributors = new Set();
  let done = 0;

  for (const row of rows) {
    if (done >= limit) break;
    const pairId = row.pair_id;
    // truth_file is already "truth/AMR_001.txt" — prefixing the directory
    // again produced truth/truth/... and silently paired nothing at all.
    const truthPath = path.join(DATA, row.truth_file || `truth/${pairId}.txt`);
    if (!fs.existsSync(truthPath)) continue;

    const pages = pagesFor(pairId, row.htr_file);
    if (!pages.length) continue;

    const truth = fs.readFileSync(truthPath, 'utf8');
    contributors.add(row.contributor || 'unknown');

    const t0 = Date.now();
    const texts = [];
    let quality = null;
    let failure = null;
    try {
      for (const page of pages) {
        const { data } = await worker.recognize(page);
        texts.push(data.text || '');
      }
    } catch (err) {
      failure = err.message || String(err);
    }
    const ms = Date.now() - t0;

    const s = failure ? null : score(truth, texts.join('\n'));
    results.push({ pairId, contributor: row.contributor, pages: pages.length, ms, failure, score: s, quality });
    done++;

    if (s) {
      console.log(
        `  ${pairId.padEnd(9)} ${String(pages.length).padStart(2)}p  ` +
        `CER ${(s.cer * 100).toFixed(1).padStart(5)}%  WER ${(s.wer * 100).toFixed(1).padStart(5)}%  ` +
        `numbers/drugs ${(s.criticalAccuracy * 100).toFixed(1).padStart(5)}%  ${ms}ms`,
      );
    } else {
      console.log(`  ${pairId.padEnd(9)} FAILED: ${failure}`);
    }
  }

  await worker.terminate();

  const ok = results.filter((r) => r.score).map((r) => r.score);

  // An empty run must never print a verdict. The first version reported
  // "WITHIN THRESHOLDS - 100%" over zero documents, which is the most
  // dangerous output this script could produce: a pass that measured nothing.
  if (ok.length === 0) {
    console.error(`
NOTHING WAS SCORED. ${results.length} document(s) attempted.`);
    console.error('No verdict is given, because none was earned.');
    process.exit(1);
  }

  const pooled = pool(ok);
  const verdict = isSafeForClinicalUse(pooled);
  const magnitude = pooled.criticalErrors.filter((e) => e.orderOfMagnitude);

  console.log('\n' + '='.repeat(78));
  console.log('AFRICAN MEDICAL RECORDS — tesseract-fast');
  console.log('='.repeat(78));
  console.log(`documents            ${results.length} (${results.filter((r) => r.failure).length} failed)`);
  console.log(`contributors         ${contributors.size}`);
  console.log(`character error rate ${(pooled.cer * 100).toFixed(1)}%`);
  console.log(`word error rate      ${(pooled.wer * 100).toFixed(1)}%`);
  console.log(`numbers/doses/drugs  ${(pooled.criticalAccuracy * 100).toFixed(1)}%  (${pooled.criticalCorrect}/${pooled.criticalTotal})`);
  console.log(`order-of-magnitude   ${magnitude.length}`);
  console.log(`\n${verdict.safe ? 'WITHIN THRESHOLDS' : 'NOT SAFE'} — ${verdict.reason}`);

  if (magnitude.length) {
    console.log('\nOrder-of-magnitude errors — the ones that reach a coroner:');
    magnitude.slice(0, 10).forEach((e) => {
      console.log(`    "${e.expected}" read as "${e.got ?? '(dropped)'}"`);
      console.log(`        in: ${e.context}`);
    });
  }

  const out = arg('json');
  if (out) {
    fs.writeFileSync(path.resolve(out), JSON.stringify({
      dataset: 'African Medical Records (CC-BY-4.0)',
      engine: 'tesseract-fast',
      caveat: 'External proxy. NOT evidence about UNTH performance.',
      pooled, verdict, results,
    }, null, 2));
    console.log(`\nFull report: ${out}`);
  }

  console.log('\nThis is an EXTERNAL dataset. Different hospital, writers, forms');
  console.log('and phones. It cannot stand in for the UNTH corpus.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
