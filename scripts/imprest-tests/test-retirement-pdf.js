/**
 * Renders a REAL retirement form through the shipped module.
 *
 * The PDF path could not be checked in a browser from here, but jsPDF,
 * jspdf-autotable and qrcode all run under Node — so the actual
 * src/lib/imprest/retirementPdf.ts is transpiled and executed, with only the
 * two network calls stubbed. That exercises what a browser check would: the
 * autoTable import shape (which needed a type cast), the QR encode, the page
 * layout, the SHA-256 of the finished bytes, and the two-step issue protocol.
 *
 * Output is written to scripts/imprest-tests/out/ so the PDF can be opened.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

// ---------------------------------------------------------------------------
// Stub only what leaves the machine: the allocate and register calls.
// ---------------------------------------------------------------------------
const calls = [];
const DOC_ID = 'RET-2026-A3F9C21B08';
const VERIFY_URL = `https://unth-theatre-mai.vercel.app/verify/imprest/${DOC_ID}`;

global.fetch = async (url, init) => {
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(init.body) : null;
  calls.push({ url, method, body });

  if (method === 'POST') {
    return {
      ok: true,
      json: async () => ({
        document: { documentId: DOC_ID, title: body.title, documentType: body.documentType },
        verifyUrl: VERIFY_URL,
      }),
    };
  }
  return { ok: true, json: async () => ({ success: true }) };
};

// Deliberately NO `global.window` stub: jsPDF picks its Node build when window
// is absent, and a half-populated window makes it take the browser path and
// fail on a DOM API that is not there.

function loadTs(rel) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    if (id.startsWith('.')) {
      const p = path.resolve(path.dirname(file), id);
      return loadTs(path.relative(ROOT, fs.existsSync(p + '.ts') ? p + '.ts' : p));
    }
    return require(path.join(ROOT, 'node_modules', id));
  };
  m._compile(js, file);
  return m.exports;
}

(async () => {
  console.log('Rendering a retirement form through the shipped module\n');

  const { generateRetirementForm } = loadTs('src/lib/imprest/retirementPdf.ts');

  const result = await generateRetirementForm({
    retirementNumber: 'RET/2026/0001',
    retirementDate: '2026-07-31',
    status: 'IN_REVIEW',
    currentStage: 'CHAIRMAN_REVIEW',
    // ₦450,000 received; ₦387,500 spent; ₦62,500 returned — balances exactly.
    amountReceived: 45_000_000,
    totalExpenditure: 38_750_000,
    balanceReturned: 6_250_000,
    expenditureCount: 3,
    receiptCount: 3,
    imprest: {
      imprestNumber: 'IMP/2026/0007',
      purpose: 'Theatre consumables and generator diesel for July',
      department: { code: 'TCU', name: 'Theatre Commercialized Unit' },
    },
    preparedBy: { fullName: 'A. Okeke' },
    checkedBy: { fullName: 'B. Nwosu' },
    lines: [
      { date: '2026-07-05', expenseNumber: 'IMP-2026-0007-001', description: 'Surgical gloves, 20 boxes', vendorName: 'Medplus Supplies', totalCost: 18_000_000, receiptNumber: 'R-1021' },
      { date: '2026-07-12', expenseNumber: 'IMP-2026-0007-002', description: 'Diesel, 200 litres', vendorName: 'Ozalla Fuels', totalCost: 15_750_000, receiptNumber: 'R-1044' },
      { date: '2026-07-20', expenseNumber: 'IMP-2026-0007-003', description: 'Sutures assorted', vendorName: 'Medplus Supplies', totalCost: 5_000_000, receiptNumber: 'R-1067' },
    ],
  });

  console.log('1. The document was produced');
  const buf = Buffer.from(await result.blob.arrayBuffer());
  check('a PDF came back', buf.length > 0);
  check('it really is a PDF (%PDF- header)', buf.subarray(0, 5).toString() === '%PDF-');
  check('it is a substantive document, not a blank page', buf.length > 8000, `${buf.length} bytes`);
  check('it ends properly (%%EOF)', buf.subarray(-1024).toString().includes('%%EOF'));

  console.log('\n2. The two-step issue protocol was followed');
  check('exactly two calls were made', calls.length === 2, JSON.stringify(calls.map((c) => c.method)));
  check('step 1 allocated the identifier BEFORE drawing', calls[0]?.method === 'POST');
  check('it asked for a RETIREMENT_FORM', calls[0]?.body?.documentType === 'RETIREMENT_FORM');
  check('unclosed retirements are watermarked DRAFT', calls[0]?.body?.watermark === 'DRAFT');
  check('step 2 registered the finished bytes', calls[1]?.method === 'PATCH');
  check('and reported it as certified', result.certified === true);

  console.log('\n3. The checksum genuinely covers the bytes that were produced');
  const registered = calls[1]?.body ?? {};
  check('a SHA-256 was registered', /^[a-f0-9]{64}$/.test(registered.checksum ?? ''));
  const { createHash } = require('crypto');
  const independent = createHash('sha256').update(buf).digest('hex');
  check('it matches an independent hash of the returned PDF', registered.checksum === independent,
    `${registered.checksum} vs ${independent}`);
  check('the byte size was reported honestly', registered.byteSize === buf.length,
    `${registered.byteSize} vs ${buf.length}`);
  check('the issued PDF itself was stored', String(registered.dataUrl ?? '').startsWith('data:application/pdf'));
  check('page count was reported', registered.pageCount >= 1);

  console.log('\n4. What the page has to say');
  const text = buf.toString('latin1');
  check('the QR image was embedded', text.includes('/Image') || text.includes('/XObject'));
  check('the document id was returned to the caller', result.documentId === DOC_ID);
  check('the verify URL was returned to the caller', result.verifyUrl === VERIFY_URL);

  // autoTable is reached through a cast (its ESM/CJS default export shape is not
  // typed usefully). A wrong cast could throw — or, worse, silently draw
  // nothing, leaving a form with no expenditure on it. Rendering the same
  // retirement WITHOUT lines must therefore produce a materially smaller file.
  console.log('\n5. autoTable actually drew the expenditure (not a silent no-op)');
  calls.length = 0;
  const bare = await generateRetirementForm({
    retirementNumber: 'RET/2026/0002',
    retirementDate: '2026-07-31',
    status: 'IN_REVIEW',
    currentStage: 'CHAIRMAN_REVIEW',
    amountReceived: 45_000_000,
    totalExpenditure: 38_750_000,
    balanceReturned: 6_250_000,
    expenditureCount: 0,
    receiptCount: 0,
    imprest: { imprestNumber: 'IMP/2026/0008', purpose: 'Control render with no lines' },
    // no `lines` — the second table is skipped entirely
  });
  const bareBuf = Buffer.from(await bare.blob.arrayBuffer());
  check('the form with expenditure lines is larger than the one without',
    buf.length > bareBuf.length, `${buf.length} vs ${bareBuf.length}`);
  check('the difference is real content, not noise',
    buf.length - bareBuf.length > 500, `difference ${buf.length - bareBuf.length} bytes`);
  check('the control render is still a valid PDF', bareBuf.subarray(0, 5).toString() === '%PDF-');

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'retirement-form.pdf');
  fs.writeFileSync(outFile, buf);
  console.log(`\nWrote ${outFile} (${(buf.length / 1024).toFixed(1)} KB) — open it to inspect the layout.`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((err) => {
  console.error('\nHARNESS ERROR:', err?.message ?? err);
  console.error(err?.stack?.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
});
