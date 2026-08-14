#!/usr/bin/env node
/**
 * Take photographs and transcriptions from a staging folder into the UNTH
 * corpus: check them, anonymise the writers, and build the manifest.
 *
 *   node ocr-benchmark/scripts/ingest-unth-corpus.js --from "D:/theatre-scans"
 *   node ocr-benchmark/scripts/ingest-unth-corpus.js --from ... --apply
 *
 * Without --apply it reports what it WOULD do and changes nothing. Run it that
 * way first: it is the cheapest moment to catch a page that still has a
 * patient's name on it.
 *
 * Staging layout — one image, one transcription, same base name:
 *
 *   anaesthetic-chart-01.jpg
 *   anaesthetic-chart-01.txt
 *
 * Writer attribution goes in a plain text file alongside them, if you have it:
 *
 *   writers.txt      anaesthetic-chart-01 = Dr A
 *                    ward-note-03 = Sister B
 *
 * That file is READ and never copied. The corpus records WRITER-001 and the
 * mapping stays wherever you keep it, outside this repository — see
 * UNTH-DATA-GOVERNANCE.md §3 for why a table linking colleagues to how badly
 * engines read their handwriting is a document nobody should create.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const UNTH = path.join(ROOT, 'unth');
const IMAGES = path.join(UNTH, 'images', 'original');
const TRUTH = path.join(UNTH, 'ground-truth');
const META = path.join(UNTH, 'metadata');
const MANIFEST = path.join(UNTH, 'manifests', 'UNTH-CORPUS-MANIFEST.csv');

const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?|heic)$/i;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}
const APPLY = process.argv.includes('--apply');

/**
 * Patterns that suggest a transcription still carries an identifier.
 *
 * Deliberately noisy. A false alarm costs somebody five seconds of reading; a
 * miss puts a patient's hospital number in a Git history for good. The check
 * runs on the TRANSCRIPTION because that is machine-readable — the image cannot
 * be checked automatically, which is exactly why de-identification has to happen
 * before the shutter closes.
 */
const IDENTIFIER_HINTS = [
  { re: /\b\d{4}\/[A-Z]{2,3}\/\d{3,}\b/i, why: 'looks like a hospital number' },
  { re: /\b(folder|hospital)\s*(no\.?|number|#)?\s*[:=]?\s*\d{4,}/i, why: 'folder or hospital number' },
  { re: /\b(0[789][01]\d{8})\b/, why: 'looks like a Nigerian mobile number' },
  { re: /\bd\.?o\.?b\.?\s*[:=]/i, why: 'date of birth field' },
  // The /i was missing here, so "Name: Adaeze Okafor" went undetected while a
  // phone number was caught — the most sensitive field of the three was the one
  // slipping through. Found by testing with a deliberately leaky transcript.
  { re: /\b(patient\s+)?name\s*[:=]\s*[A-Z][a-z]+(\s+[A-Z][a-z.]+)+/i, why: 'a full name after "Name:"' },
  { re: /\b(patient\s+)?name\s*[:=]\s*\S/i, why: 'a name field with something in it' },
  { re: /\bnext\s+of\s+kin\b/i, why: 'next of kin details' },
];

const DOCUMENT_TYPES = {
  anaesthetic_chart: { match: /an?a?esth/i, target: 6 },
  operative_note: { match: /oper|surg/i, target: 5 },
  consent_form: { match: /consent/i, target: 4 },
  nursing_note: { match: /nurs|ward|observation/i, target: 4 },
  laboratory_report: { match: /lab|result/i, target: 3 },
  referral_letter: { match: /referr|consult/i, target: 3 },
  other: { match: /.*/, target: 0 },
};

function classify(basename) {
  for (const [type, spec] of Object.entries(DOCUMENT_TYPES)) {
    if (type !== 'other' && spec.match.test(basename)) return type;
  }
  return 'other';
}

function readWriterMap(fromDir) {
  const file = path.join(fromDir, 'writers.txt');
  if (!fs.existsSync(file)) return {};
  const map = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^=#]+?)\s*=\s*(.+?)\s*$/);
    if (m) map[m[1].trim()] = m[2].trim();
  }
  return map;
}

/**
 * A stable anonymous ID per writer.
 *
 * Derived by hashing the name, so re-running gives the same ID without any
 * lookup table being stored — and the ID cannot be reversed to a name.
 */
const writerIds = new Map();
function writerIdFor(name) {
  if (!name) return 'WRITER-UNKNOWN';
  if (!writerIds.has(name)) {
    const digest = crypto.createHash('sha256').update(name.toLowerCase()).digest('hex');
    writerIds.set(name, `WRITER-${parseInt(digest.slice(0, 6), 16) % 900 + 100}`);
  }
  return writerIds.get(name);
}

function checkTranscription(text, base, problems, warnings) {
  if (!text.trim()) {
    problems.push(`${base}: the transcription is empty.`);
    return;
  }
  for (const hint of IDENTIFIER_HINTS) {
    if (hint.re.test(text)) {
      warnings.push(`${base}: ${hint.why} — check it is an invented test value, not a real one.`);
    }
  }
  // A page with no [illegible] and no [signature] anywhere is possible, but on
  // handwritten clinical notes it more often means somebody guessed rather than
  // marking what they could not read. Worth a nudge, not a refusal.
  if (/^[\x20-\x7E\s]+$/.test(text) && text.length > 400
      && !/\[illegible\]|\[signature\]/i.test(text)) {
    warnings.push(`${base}: long transcription with no [illegible] or [signature] markers — was anything guessed?`);
  }
}

function main() {
  const from = arg('from');
  if (!from) {
    console.error('Which folder? --from "D:/theatre-scans"');
    process.exit(1);
  }
  if (!fs.existsSync(from)) {
    console.error(`${from} does not exist.`);
    process.exit(1);
  }

  const writerNames = readWriterMap(from);
  const files = fs.readdirSync(from).filter((f) => IMAGE_EXT.test(f));

  if (!files.length) {
    console.error(`No images in ${from}.`);
    process.exit(1);
  }

  const problems = [];
  const warnings = [];
  const entries = [];

  for (const file of files.sort()) {
    const base = file.replace(IMAGE_EXT, '');
    const truthPath = path.join(from, `${base}.txt`);

    if (!fs.existsSync(truthPath)) {
      problems.push(`${base}: no ${base}.txt saying what the page says. Skipped.`);
      continue;
    }

    const text = fs.readFileSync(truthPath, 'utf8');
    checkTranscription(text, base, problems, warnings);

    const bytes = fs.readFileSync(path.join(from, file));
    const type = classify(base);
    const writer = writerIdFor(writerNames[base]);

    entries.push({
      id: `UNTH-${type.slice(0, 3).toUpperCase()}-${String(entries.length + 1).padStart(3, '0')}`,
      filename: file,
      base,
      document_type: type,
      writer_id: writer,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      ground_truth_file: `${base}.txt`,
      source: path.join(from, file),
      truthSource: truthPath,
    });
  }

  // ---- report ----------------------------------------------------------
  console.log(`\n${entries.length} page(s) ready, from ${files.length} image(s) found.\n`);

  const byType = {};
  const byWriter = {};
  for (const e of entries) {
    byType[e.document_type] = (byType[e.document_type] || 0) + 1;
    byWriter[e.writer_id] = (byWriter[e.writer_id] || 0) + 1;
  }

  console.log('Document types');
  for (const [type, spec] of Object.entries(DOCUMENT_TYPES)) {
    if (type === 'other' && !byType.other) continue;
    const have = byType[type] || 0;
    const flag = spec.target && have < spec.target ? `  short of ${spec.target}` : '';
    console.log(`  ${type.padEnd(20)} ${String(have).padStart(2)}${flag}`);
  }

  console.log(`\nWriters: ${Object.keys(byWriter).length}`);
  const unknown = byWriter['WRITER-UNKNOWN'] || 0;
  if (unknown) {
    console.log(`  ${unknown} page(s) with no writer recorded — add a writers.txt so the`);
    console.log('  corpus can show whether it covers more than one hand.');
  }
  const dominant = Object.entries(byWriter).sort((a, b) => b[1] - a[1])[0];
  if (dominant && entries.length >= 5 && dominant[1] / entries.length > 0.5) {
    warnings.push(
      `${dominant[1]} of ${entries.length} pages are from one writer. `
      + 'A corpus dominated by one hand measures that person, not the hospital.',
    );
  }

  const duplicates = entries.filter((e, i) => entries.findIndex((x) => x.sha256 === e.sha256) !== i);
  duplicates.forEach((d) => warnings.push(`${d.base}: identical to an earlier page.`));

  if (warnings.length) {
    console.log('\nWorth checking');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
  if (problems.length) {
    console.log('\nProblems');
    problems.forEach((p) => console.log(`  - ${p}`));
  }

  if (!APPLY) {
    console.log('\nNothing has been changed. Re-run with --apply to bring these in.');
    console.log('Read the warnings first — this is the cheapest moment to catch a page');
    console.log('that still has a patient identifier on it.\n');
    return;
  }

  // ---- apply -----------------------------------------------------------
  for (const dir of [IMAGES, TRUTH, META]) fs.mkdirSync(dir, { recursive: true });

  for (const e of entries) {
    fs.copyFileSync(e.source, path.join(IMAGES, e.filename));
    fs.copyFileSync(e.truthSource, path.join(TRUTH, e.ground_truth_file));
    fs.writeFileSync(path.join(META, `${e.base}.json`), JSON.stringify({
      id: e.id,
      filename: e.filename,
      document_type: e.document_type,
      writer_id: e.writer_id,
      handwritten: true,
      photographed: true,
      sha256: e.sha256,
      deidentified: true,
      ground_truth_file: e.ground_truth_file,
      // Left for a person to fill in: only somebody who saw the page can say
      // whether it was dim, glared or folded, and guessing here would corrupt
      // the analysis of which conditions engines cope with.
      lighting: null, perspective: null, glare: null, folded: null,
      poor_quality: null,
    }, null, 2) + '\n');
  }

  const columns = ['id', 'filename', 'document_type', 'writer_id', 'sha256', 'bytes', 'ground_truth_file'];
  fs.writeFileSync(MANIFEST,
    columns.join(',') + '\n'
    + entries.map((e) => columns.map((c) => e[c]).join(',')).join('\n') + '\n');

  console.log(`\nBrought in ${entries.length} page(s).`);
  console.log(`  images        ${path.relative(ROOT, IMAGES)}`);
  console.log(`  transcripts   ${path.relative(ROOT, TRUTH)}`);
  console.log(`  manifest      ${path.relative(ROOT, MANIFEST)}`);
  console.log('\nImages and transcriptions are gitignored and stay that way.');
  console.log('Fill in the lighting/glare/folded fields in metadata/ — only somebody');
  console.log('who saw the page can say, and it decides what the analysis can show.\n');
  console.log('Then:  node ocr-benchmark/scripts/run-unth-benchmark.js\n');
}

main();
