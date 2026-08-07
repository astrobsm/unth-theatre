/**
 * Runs the imprest domain tests that came with the original monorepo.
 *
 *     npm run test:imprest
 *
 * Those tests were written for vitest, which this project does not use. Rather
 * than rewrite ~880 lines of assertions (and risk changing their meaning), this
 * runner provides the small slice of the vitest API they actually use —
 * describe/it/test and 8 matchers — and executes the ORIGINAL test files
 * verbatim against the ported modules in src/lib/imprest.
 *
 * These cover the financial core: kobo money arithmetic, document numbering,
 * the approval workflow state machine, and retirement calculations.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

let passed = 0;
let failed = 0;
const failures = [];
const stack = [];

// ---------------------------------------------------------------------------
// Minimal vitest-compatible surface
// ---------------------------------------------------------------------------
function makeExpect() {
  const fail = (msg) => { throw new Error(msg); };
  const show = (v) => {
    if (typeof v === 'bigint') return `${v}n`;
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  const matchers = (actual, negated) => {
    const check = (ok, describeExpectation) => {
      if (negated ? ok : !ok) {
        fail(`expected ${show(actual)}${negated ? ' NOT' : ''} ${describeExpectation}`);
      }
    };
    return {
      toBe: (e) => check(Object.is(actual, e) || actual === e, `to be ${show(e)}`),
      toEqual: (e) => check(JSON.stringify(actual) === JSON.stringify(e), `to equal ${show(e)}`),
      toStrictEqual: (e) => check(JSON.stringify(actual) === JSON.stringify(e), `to equal ${show(e)}`),
      toBeNull: () => check(actual === null, 'to be null'),
      toBeUndefined: () => check(actual === undefined, 'to be undefined'),
      toBeTruthy: () => check(Boolean(actual), 'to be truthy'),
      toBeFalsy: () => check(!actual, 'to be falsy'),
      toHaveLength: (n) => check(actual != null && actual.length === n,
        `to have length ${n} (got ${actual == null ? 'null' : actual.length})`),
      toContain: (x) => check(
        typeof actual === 'string' ? actual.includes(x) : Array.isArray(actual) && actual.includes(x),
        `to contain ${show(x)}`),
      toBeGreaterThan: (n) => check(actual > n, `to be > ${show(n)}`),
      toBeLessThan: (n) => check(actual < n, `to be < ${show(n)}`),
      toBeGreaterThanOrEqual: (n) => check(actual >= n, `to be >= ${show(n)}`),
      toBeLessThanOrEqual: (n) => check(actual <= n, `to be <= ${show(n)}`),
      toBeCloseTo: (n, digits = 2) => check(Math.abs(actual - n) < Math.pow(10, -digits) / 2,
        `to be close to ${n}`),
      toBeInstanceOf: (C) => check(actual instanceof C, `to be instance of ${C.name}`),
      toMatchObject: (e) => check(
        Object.entries(e).every(([k, v]) => JSON.stringify(actual?.[k]) === JSON.stringify(v)),
        `to match ${show(e)}`),
      toThrow: (expected) => {
        let threw = false;
        let message = '';
        try { actual(); } catch (err) { threw = true; message = err?.message ?? String(err); }
        if (negated) {
          if (threw) fail(`expected not to throw, but threw: ${message}`);
          return;
        }
        if (!threw) fail('expected function to throw, but it did not');
        if (expected instanceof RegExp && !expected.test(message)) {
          fail(`expected throw matching ${expected}, got "${message}"`);
        } else if (typeof expected === 'string' && !message.includes(expected)) {
          fail(`expected throw containing "${expected}", got "${message}"`);
        }
      },
    };
  };

  const expect = (actual) => ({ ...matchers(actual, false), not: matchers(actual, true) });
  return expect;
}

function describe(name, fn) {
  stack.push(name);
  try { fn(); } finally { stack.pop(); }
}

function it(name, fn) {
  const label = [...stack, name].join(' › ');
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      throw new Error('async test encountered — this runner is synchronous only');
    }
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${label}\n      ${err?.message ?? err}`);
  }
}
it.each = undefined; // not used by these suites; fail loudly if that changes

const VITEST = { describe, it, test: it, expect: makeExpect() };

// ---------------------------------------------------------------------------
// Load a TS module (and its relative imports) through the TypeScript compiler
// ---------------------------------------------------------------------------
const cache = new Map();

/** Where the ported domain modules live. */
const LIB = path.join(ROOT, 'src/lib/imprest');

function resolveTs(absNoExt) {
  return [absNoExt, absNoExt + '.ts', path.join(absNoExt, 'index.ts')].find(
    (p) => fs.existsSync(p) && fs.statSync(p).isFile()
  );
}

function loadTs(absNoExt) {
  // The test files still import './money', './enums' and so on, as they did in
  // the original package. They now live beside this runner rather than beside
  // the modules, so an import that does not resolve locally is looked up in
  // src/lib/imprest — which keeps the test sources byte-identical to the ones
  // that shipped with the imprest system.
  // Fall back to the app lib, PRESERVING any subdirectory: basename alone
  // flattened ./theatreOps/durations to durations and failed to resolve it.
  const file =
    resolveTs(absNoExt) ||
    resolveTs(path.join(LIB, path.relative(__dirname, absNoExt))) ||
    resolveTs(path.join(LIB, path.basename(absNoExt)));
  if (!file) throw new Error(`cannot resolve ${absNoExt}`);
  if (cache.has(file)) return cache.get(file);

  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;

  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, m.exports);
  m.require = (id) => {
    if (id === 'vitest') return VITEST;
    if (id.startsWith('.')) return loadTs(path.resolve(path.dirname(file), id));
    // The app's "@/..." path alias. Without it a harness dies with an opaque
    // node_modules/@/... error that says nothing about the real cause.
    if (id.startsWith('@/')) return loadTs(path.join(ROOT, 'src', id.slice(2)));
    // Node builtins resolve by name; only packages live under node_modules.
    // Without this, a suite that reads a file (`fs`, `path`) fails to load.
    if (Module.builtinModules.includes(id) || id.startsWith('node:')) return require(id);
    return require(path.join(ROOT, 'node_modules', id));
  };
  m._compile(js, file);
  cache.set(file, m.exports);
  return m.exports;
}

const SUITES = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

/**
 * Suites that are ordinary Node scripts rather than vitest sources. They are
 * async and keep their own counters, so they run as child processes and their
 * exit code decides the outcome.
 */
const SCRIPT_SUITES = ['test-retirement-pdf.js'];

console.log(`Imprest domain tests (${SUITES.length} suites, run against src/lib/imprest)\n`);

for (const suite of SUITES) {
  const before = { passed, failed };
  try {
    loadTs(path.join(__dirname, suite));
  } catch (err) {
    failed++;
    failures.push(`${suite} (failed to load)\n      ${err?.message ?? err}`);
  }
  const p = passed - before.passed;
  const f = failed - before.failed;
  console.log(`  ${f ? 'FAIL' : 'ok  '}  ${suite.padEnd(24)} ${p} passed${f ? `, ${f} failed` : ''}`);
}

// ---------------------------------------------------------------------------
// Script suites (async, own counters) — run out-of-process.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
for (const suite of SCRIPT_SUITES) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, suite)], { encoding: 'utf8' });
    const m = out.match(/(\d+) passed, (\d+) failed/);
    const p = m ? Number(m[1]) : 0;
    const f = m ? Number(m[2]) : 0;
    passed += p;
    failed += f;
    console.log(`  ${f ? 'FAIL' : 'ok  '}  ${suite.padEnd(24)} ${p} passed${f ? `, ${f} failed` : ''}`);
  } catch (err) {
    failed++;
    failures.push(`${suite}\n      ${(err.stdout || err.message || '').toString().slice(-400)}`);
    console.log(`  FAIL  ${suite}`);
  }
}

if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  • ${f}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
