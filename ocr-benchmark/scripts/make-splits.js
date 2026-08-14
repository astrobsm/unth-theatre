#!/usr/bin/env node
/**
 * Split the working corpus into a tuning set and a locked test set, by WRITER.
 *
 *   node ocr-benchmark/scripts/make-splits.js
 *   node ocr-benchmark/scripts/make-splits.js --test-writers 5
 *
 * Writer-disjoint, per §12: no contributor appears in both halves. Splitting by
 * document instead would let an engine — or a person tuning thresholds against
 * the results — fit to a particular hand and then be tested on that same hand,
 * which reports memorisation as accuracy.
 *
 * The test half is LOCKED. Tune preprocessing, thresholds and engine settings
 * against the tuning half only, then measure once on the test half. Anything
 * else turns the benchmark into a description of itself.
 *
 * Deterministic: the same corpus always produces the same split, so a result
 * can be reproduced and nobody can reshuffle until the numbers look better.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'external', 'african-medical-records');
const OUT = path.join(ROOT, 'unth', 'splits');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readCsv(file) {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',').map((c) => c.trim());
  return rows.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]));
  });
}

/** Stable anonymous ID, so no contributor name reaches the split files. */
function writerId(name) {
  const digest = crypto.createHash('sha256').update((name || 'unknown').toLowerCase()).digest('hex');
  return `WRITER-${parseInt(digest.slice(0, 6), 16) % 900 + 100}`;
}

function main() {
  const testWriterCount = parseInt(arg('test-writers', '6'), 10);
  const rows = readCsv(path.join(DATA, 'metadata.csv'));

  const byWriter = new Map();
  for (const row of rows) {
    const id = writerId(row.contributor);
    if (!byWriter.has(id)) byWriter.set(id, []);
    byWriter.get(id).push(row.pair_id);
  }

  // Ordered by the anonymous ID, not by page count and not at random: a
  // deterministic order nobody can nudge. Sorting by size would put every
  // prolific writer on one side.
  const writers = [...byWriter.keys()].sort();
  if (writers.length < 2) {
    console.error('Need at least two writers to split by writer.');
    process.exit(1);
  }
  const testCount = Math.min(Math.max(1, testWriterCount), writers.length - 1);

  // Interleave so both halves get a spread of writers rather than the test set
  // being whichever names happen to hash low.
  const test = writers.filter((_, i) => i % Math.round(writers.length / testCount) === 0)
    .slice(0, testCount);
  const testSet = new Set(test);
  const tune = writers.filter((w) => !testSet.has(w));

  const docsIn = (list) => list.flatMap((w) => byWriter.get(w)).sort();
  const tuneDocs = docsIn(tune);
  const testDocs = docsIn(test);

  fs.mkdirSync(OUT, { recursive: true });
  const header = [
    '# Working corpus: African Medical Records (CC-BY-4.0).',
    '# EXTERNAL PROXY, not UNTH. Results describe this dataset.',
    '# Writer-disjoint: no contributor appears in both files.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(OUT, 'tune.txt'),
    `${header}# ${tune.length} writers, ${tuneDocs.length} documents\n${tuneDocs.join('\n')}\n`);
  fs.writeFileSync(path.join(OUT, 'test-locked.txt'),
    `${header}# ${test.length} writers, ${testDocs.length} documents\n`
    + '# LOCKED. Measure once, at the end. Do not tune against these.\n'
    + `${testDocs.join('\n')}\n`);

  const overlap = tune.filter((w) => testSet.has(w));

  console.log('\nWriter-disjoint split\n');
  console.log(`  tuning        ${String(tuneDocs.length).padStart(2)} documents, ${tune.length} writers`);
  console.log(`  test (locked) ${String(testDocs.length).padStart(2)} documents, ${test.length} writers`);
  console.log(`  writer overlap ${overlap.length}${overlap.length ? '  ← BROKEN' : '  (correct)'}`);
  console.log(`\n  ${path.relative(process.cwd(), path.join(OUT, 'tune.txt'))}`);
  console.log(`  ${path.relative(process.cwd(), path.join(OUT, 'test-locked.txt'))}`);
  console.log('\nTune against the first. Measure once against the second.\n');

  if (overlap.length) process.exit(1);
}

main();
