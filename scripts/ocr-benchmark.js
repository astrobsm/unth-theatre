#!/usr/bin/env node
/**
 * Rank OCR engines on UNTH's own documents.
 *
 *   node scripts/ocr-benchmark.js                    # every engine
 *   node scripts/ocr-benchmark.js --engine tesseract
 *   node scripts/ocr-benchmark.js --corpus path/to/corpus --json report.json
 *
 * Reads a corpus of real theatre documents with known correct text, runs each
 * engine over all of them, and reports CER, WER and — the figure that should
 * actually decide anything — how many numbers, doses and drug names each engine
 * got right.
 *
 * This exists because guessing about OCR quality has already cost this project
 * real time. The accurate Tesseract model looked like the obvious improvement,
 * measured identically to the fast one on synthetic text, and then aborted on
 * the server. Every claim about a provider is that kind of guess until it has
 * been run against handwriting from this hospital.
 *
 * Corpus layout — see docs/ocr-corpus/README.md:
 *
 *   docs/ocr-corpus/anaesthetic-chart-01.jpg
 *   docs/ocr-corpus/anaesthetic-chart-01.txt   <- what the page actually says
 */

const fs = require('fs');
const path = require('path');

// Transpiled with the TypeScript compiler the repo already depends on, rather
// than adding ts-node for one script. Same approach the test harness uses.
const ts = require('typescript');
const Module = require('module');

function requireTs(relPath) {
  const file = path.resolve(__dirname, relPath);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(js, file);
  return m.exports;
}

const { score, pool, isSafeForClinicalUse } = requireTs('../src/lib/ocr/metrics.ts');

const ROOT = path.resolve(__dirname, '..');
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|tif|tiff)$/i;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------------------
// Engines. Each is { name, available(), read(imagePath) -> text }.
//
// Adding a provider means adding an entry here and nothing else. Cloud
// providers must stay OFF unless explicitly configured: running the benchmark
// must never quietly upload patient documents to a third party.
// ---------------------------------------------------------------------------

const engines = [
  {
    name: 'tesseract-fast',
    available: () => fs.existsSync(path.join(ROOT, 'public/tesseract/eng.traineddata.gz')),
    why: 'The engine in production today, browser and server both.',
    async read(imagePath) {
      const { createWorker } = require('tesseract.js');
      const worker = await createWorker('eng', 1, {
        langPath: path.join(ROOT, 'public', 'tesseract'),
        gzip: true,
        // A cache path per engine. Without this tesseract reuses whatever
        // training data it extracted first, keyed only by language code — which
        // once made two different models report identical scores and very
        // nearly got the wrong one shipped.
        cachePath: path.join(ROOT, '.ocr-bench-cache', 'tesseract-fast'),
      });
      await worker.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1' });
      try {
        const { data } = await worker.recognize(imagePath);
        return { text: data.text || '', confidence: data.confidence ?? null };
      } finally {
        await worker.terminate();
      }
    },
  },
];

// ---------------------------------------------------------------------------

function loadCorpus(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => IMAGE_EXT.test(f))
    .map((f) => {
      const truthPath = path.join(dir, f.replace(IMAGE_EXT, '.txt'));
      return {
        name: f,
        image: path.join(dir, f),
        truth: fs.existsSync(truthPath) ? fs.readFileSync(truthPath, 'utf8') : null,
      };
    })
    .filter((d) => {
      if (d.truth === null) {
        console.warn(`  skip   ${d.name} — no matching .txt with the correct text`);
        return false;
      }
      return true;
    });
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const corpusDir = path.resolve(arg('corpus', path.join(ROOT, 'docs', 'ocr-corpus')));
  const only = arg('engine');
  const corpus = loadCorpus(corpusDir);

  if (corpus.length === 0) {
    console.log(`\nNo documents in ${path.relative(ROOT, corpusDir)}.\n`);
    console.log('This harness cannot rank anything without real UNTH pages and');
    console.log('their correct text. See docs/ocr-corpus/README.md — it takes');
    console.log('about an hour to assemble and it decides every later choice.\n');
    process.exit(0);
  }

  const selected = engines.filter((e) => (!only || e.name === only));
  const runnable = selected.filter((e) => e.available());
  for (const e of selected.filter((e) => !e.available())) {
    console.log(`  skip   ${e.name} — not configured on this machine`);
  }
  if (runnable.length === 0) {
    console.error('No engines available to run.');
    process.exit(1);
  }

  console.log(`\n${corpus.length} document(s), ${runnable.length} engine(s)\n`);

  const report = { corpus: corpusDir, documents: corpus.length, engines: {} };

  for (const engine of runnable) {
    const perDocument = [];
    let totalMs = 0;

    for (const doc of corpus) {
      const t0 = Date.now();
      let text = '';
      let failure = null;
      try {
        ({ text } = await engine.read(doc.image));
      } catch (err) {
        // A crash is a result, not an interruption. An engine that cannot read
        // one page of the corpus has told us something worth recording.
        failure = err.message || String(err);
      }
      const ms = Date.now() - t0;
      totalMs += ms;

      const s = failure ? null : score(doc.truth, text);
      perDocument.push({ document: doc.name, ms, failure, score: s });

      const label = doc.name.padEnd(34);
      if (failure) {
        console.log(`  ${engine.name.padEnd(16)} ${label} FAILED: ${failure.slice(0, 60)}`);
      } else {
        console.log(
          `  ${engine.name.padEnd(16)} ${label} CER ${pct(s.cer).padStart(6)}  ` +
          `WER ${pct(s.wer).padStart(6)}  numbers/drugs ${pct(s.criticalAccuracy).padStart(6)}  ${ms}ms`,
        );
      }
    }

    const ok = perDocument.filter((d) => d.score).map((d) => d.score);
    const pooled = pool(ok);
    const verdict = isSafeForClinicalUse(pooled);
    report.engines[engine.name] = {
      pooled, verdict,
      failures: perDocument.filter((d) => d.failure).length,
      avgMs: Math.round(totalMs / corpus.length),
      perDocument,
    };
  }

  console.log('\n' + '─'.repeat(96));
  console.log(
    'ENGINE'.padEnd(18) + 'CER'.padStart(8) + 'WER'.padStart(8) +
    'NUMBERS/DRUGS'.padStart(15) + 'DOSE ERRORS'.padStart(13) +
    'FAILED'.padStart(8) + 'AVG'.padStart(9),
  );
  console.log('─'.repeat(96));

  const ranked = Object.entries(report.engines).sort(
    // Ranked by clinical accuracy first, general accuracy only as a tiebreak.
    // An engine with a worse CER and perfect numbers is the better engine here.
    (a, b) => (b[1].pooled.criticalAccuracy - a[1].pooled.criticalAccuracy)
           || (a[1].pooled.cer - b[1].pooled.cer),
  );

  for (const [name, r] of ranked) {
    const magnitude = r.pooled.criticalErrors.filter((e) => e.orderOfMagnitude).length;
    console.log(
      name.padEnd(18) +
      pct(r.pooled.cer).padStart(8) +
      pct(r.pooled.wer).padStart(8) +
      pct(r.pooled.criticalAccuracy).padStart(15) +
      String(magnitude).padStart(13) +
      String(r.failures).padStart(8) +
      `${r.avgMs}ms`.padStart(9),
    );
  }
  console.log('─'.repeat(96));

  for (const [name, r] of ranked) {
    console.log(`\n${name}: ${r.verdict.safe ? 'within thresholds' : 'NOT SAFE'} — ${r.verdict.reason}`);
    const worst = r.pooled.criticalErrors
      .slice()
      .sort((a, b) => Number(b.orderOfMagnitude) - Number(a.orderOfMagnitude))
      .slice(0, 8);
    for (const e of worst) {
      const flag = e.orderOfMagnitude ? '  ORDER OF MAGNITUDE' : '';
      console.log(`    ${e.kind.padEnd(7)} "${e.expected}" read as "${e.got ?? '(dropped)'}"${flag}`);
      console.log(`            in: ${e.context}`);
    }
    if (r.pooled.criticalErrors.length > worst.length) {
      console.log(`    ... and ${r.pooled.criticalErrors.length - worst.length} more`);
    }
  }

  const jsonOut = arg('json');
  if (jsonOut) {
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(report, null, 2));
    console.log(`\nFull report: ${jsonOut}`);
  }

  console.log('\nRanked by accuracy on numbers, doses and drug names, not by CER.');
  console.log('A headline error rate cannot tell a misread dose from a harmless typo.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
