/** Exercises the REAL src/lib/concurrency.ts guard (transpiled on the fly). */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

// Minimal stand-ins for the two next/server exports the module uses.
const fakeNextServer = {
  NextResponse: {
    json: (body, init) => ({ __response: true, status: init?.status ?? 200, body }),
  },
};

const src = fs.readFileSync(path.join(ROOT, 'src/lib/concurrency.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = new Module('concurrency');
m.require = (id) => (id === 'next/server' ? fakeNextServer : require(id));
m._compile(js, path.join(ROOT, 'src/lib/concurrency.js'));
const C = m.exports;

const req = (headers = {}) => ({
  headers: {
    get: (k) => {
      const hit = Object.keys(headers).find((h) => h.toLowerCase() === k.toLowerCase());
      return hit ? headers[hit] : null;
    },
  },
});

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

const T0 = new Date('2026-07-29T08:00:00.000Z');
const LATER = new Date('2026-07-29T09:30:00.000Z');

console.log('\n1. No version header = no check (existing online callers unaffected)');
check('null returned', C.detectConflict(req(), { updatedAt: LATER }) === null);

console.log('\n2. Editing the current version is allowed');
check('same version passes',
  C.detectConflict(req({ 'X-Base-Version': T0.toISOString() }), { updatedAt: T0 }) === null);
check('epoch-ms header also accepted',
  C.detectConflict(req({ 'X-Base-Version': String(T0.getTime()) }), { updatedAt: T0 }) === null);
check('sub-second rounding is not a conflict',
  C.detectConflict(
    req({ 'X-Base-Version': T0.toISOString() }),
    { updatedAt: new Date(T0.getTime() + 400) }
  ) === null);
check('a record changed BEFORE our copy is not a conflict',
  C.detectConflict(req({ 'X-Base-Version': LATER.toISOString() }), { updatedAt: T0 }) === null);

console.log('\n3. Someone else changed it first');
{
  const res = C.detectConflict(req({ 'X-Base-Version': T0.toISOString() }), { updatedAt: LATER, id: 's1', status: 'CANCELLED' }, 'surgery');
  check('409 returned', res && res.status === 409, JSON.stringify(res));
  check('flagged as a conflict', res.body.conflict === true);
  check('names the record type', String(res.body.error).includes('surgery'));
  check('states the change was NOT applied', String(res.body.error).includes('not applied'));
  check('returns the server version stamp', res.body.serverVersion === LATER.toISOString());
  check('returns the version the client held', res.body.yourVersion === T0.toISOString());
  check('returns the current server record for comparison', res.body.current.status === 'CANCELLED');
}

console.log('\n4. Deliberate overwrite is honoured');
check('overwrite header bypasses the check',
  C.detectConflict(
    req({ 'X-Base-Version': T0.toISOString(), 'X-Overwrite-Conflict': 'true' }),
    { updatedAt: LATER }
  ) === null);
check('a non-true value does NOT bypass',
  C.detectConflict(
    req({ 'X-Base-Version': T0.toISOString(), 'X-Overwrite-Conflict': 'false' }),
    { updatedAt: LATER }
  ) !== null);

console.log('\n5. Degrades safely on bad or missing data');
check('missing record -> no conflict', C.detectConflict(req({ 'X-Base-Version': T0.toISOString() }), null) === null);
check('model without updatedAt -> no conflict',
  C.detectConflict(req({ 'X-Base-Version': T0.toISOString() }), { id: 'x' }) === null);
check('unparseable header -> no conflict',
  C.detectConflict(req({ 'X-Base-Version': 'not-a-date' }), { updatedAt: LATER }) === null);
check('string updatedAt handled',
  C.detectConflict(req({ 'X-Base-Version': T0.toISOString() }), { updatedAt: LATER.toISOString() }).status === 409);
check('header casing is irrelevant',
  C.detectConflict(req({ 'x-base-version': T0.toISOString() }), { updatedAt: LATER }).status === 409);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
