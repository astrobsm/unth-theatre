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
    // The app's "@/..." path alias. Without it this harness dies with an
    // opaque node_modules/@/... error that says nothing about the real cause.
    if (id.startsWith('@/')) return loadTs(path.join('src', id.slice(2)) + '.ts');
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
    status: 'UNDER_REVIEW',
    currentStage: 'CHIEF_ACCOUNTANT_REVIEW',
    // ₦450,000 received; ₦387,500 spent; ₦62,500 returned — balances exactly.
    amountReceived: 45_000_000,
    totalExpenditure: 38_750_000,
    balanceReturned: 6_250_000,
    expenditureCount: 3,
    receiptCount: 3,
    refundDue: 0,
    imprest: {
      imprestNumber: 'IMP/2026/0007',
      purpose: 'Theatre consumables and generator diesel for July',
      quarter: 'Q3',
      financialYear: { label: '2026' },
      treasuryVoucherNumber: 'TV/2026/0442',
      department: { code: 'TCU', name: 'Theatre Commercialized Unit' },
    },
    preparedBy: { fullName: 'A. Okeke' },
    checkedBy: { fullName: 'B. Nwosu' },
    lines: [
      { date: '2026-07-05', expenseNumber: 'IMP-2026-0007-001', description: 'Surgical gloves, 20 boxes', vendorName: 'Medplus Supplies', totalCost: 18_000_000, receiptNumber: 'R-1021', paymentVoucherNumber: 'PV/0091', attachmentCount: 2 },
      { date: '2026-07-12', expenseNumber: 'IMP-2026-0007-002', description: 'Diesel, 200 litres', vendorName: 'Ozalla Fuels', totalCost: 15_750_000, receiptNumber: 'R-1044', paymentVoucherNumber: 'PV/0092', attachmentCount: 1 },
      { date: '2026-07-20', expenseNumber: 'IMP-2026-0007-003', description: 'Sutures assorted', vendorName: 'Medplus Supplies', totalCost: 5_000_000, receiptNumber: 'R-1067', paymentVoucherNumber: 'PV/0093', attachmentCount: 1 },
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

  // The statutory form carries five signature blocks, an index of supporting
  // documents and page numbers. jsPDF compresses page content, so the text
  // cannot simply be grepped — but each of those is drawn work, and a form
  // rendered without the index must therefore be materially smaller.
  console.log('\n6. The statutory panels are drawn, not merely declared');
  calls.length = 0;
  const noIndex = await generateRetirementForm({
    retirementNumber: 'RET/2026/0003',
    retirementDate: '2026-07-31',
    status: 'UNDER_REVIEW',
    currentStage: 'CHIEF_ACCOUNTANT_REVIEW',
    amountReceived: 45_000_000,
    totalExpenditure: 38_750_000,
    balanceReturned: 6_250_000,
    expenditureCount: 3,
    receiptCount: 3,
    imprest: { imprestNumber: 'IMP/2026/0009', purpose: 'Same lines, no attachment counts' },
    // Identical lines but no attachmentCount anywhere, so the index is skipped.
    lines: [
      { date: '2026-07-05', expenseNumber: 'IMP-2026-0007-001', description: 'Surgical gloves, 20 boxes', vendorName: 'Medplus Supplies', totalCost: 18_000_000, receiptNumber: 'R-1021', paymentVoucherNumber: 'PV/0091' },
      { date: '2026-07-12', expenseNumber: 'IMP-2026-0007-002', description: 'Diesel, 200 litres', vendorName: 'Ozalla Fuels', totalCost: 15_750_000, receiptNumber: 'R-1044', paymentVoucherNumber: 'PV/0092' },
      { date: '2026-07-20', expenseNumber: 'IMP-2026-0007-003', description: 'Sutures assorted', vendorName: 'Medplus Supplies', totalCost: 5_000_000, receiptNumber: 'R-1067', paymentVoucherNumber: 'PV/0093' },
    ],
  });
  const noIndexBuf = Buffer.from(await noIndex.blob.arrayBuffer());
  check('the index of supporting documents is really drawn',
    buf.length > noIndexBuf.length + 300, `${buf.length} vs ${noIndexBuf.length}`);

  // A long retirement must spill onto a second sheet, and the footer must say
  // so — that is what tells an auditor no page has been removed from a bundle.
  calls.length = 0;
  const many = [];
  for (let i = 1; i <= 45; i += 1) {
    many.push({
      date: '2026-07-05',
      expenseNumber: `IMP-2026-0010-${String(i).padStart(3, '0')}`,
      description: `Consumable item number ${i} purchased for theatre use`,
      vendorName: 'Medplus Supplies',
      totalCost: 100_000,
      receiptNumber: `R-${2000 + i}`,
      paymentVoucherNumber: `PV/${1000 + i}`,
      attachmentCount: 1,
    });
  }
  const long = await generateRetirementForm({
    retirementNumber: 'RET/2026/0004',
    retirementDate: '2026-07-31',
    status: 'UNDER_REVIEW',
    currentStage: 'INTERNAL_AUDIT',
    amountReceived: 45_000_000,
    totalExpenditure: 4_500_000,
    balanceReturned: 40_500_000,
    expenditureCount: many.length,
    receiptCount: many.length,
    imprest: { imprestNumber: 'IMP/2026/0010', purpose: 'A retirement long enough to paginate' },
    lines: many,
  });
  const longRegistered = calls.find((c) => c.method === 'PATCH')?.body ?? {};
  check('a 45-line retirement runs to more than one page', longRegistered.pageCount > 1,
    `pageCount ${longRegistered.pageCount}`);
  check('it is still a valid PDF', Buffer.from(await long.blob.arrayBuffer()).subarray(0, 5).toString() === '%PDF-');

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
