/**
 * The offline warm-up must only prefetch routes that exist.
 *
 * A module's `paths` are access-control PREFIXES. Several of them — the CSSD
 * and power-house groups, the imprest expenditure grant key — have no page of
 * their own. The warm-up used to prefetch all of them, so every load produced a
 * run of `?_rsc=` 404s in the browser console.
 *
 * PREFIX_ONLY_PATHS records which ones those are. A hand-kept list rots, so
 * this checks it against the filesystem in BOTH directions:
 *
 *   • every navigable path must have a page  — else the 404s come back;
 *   • every prefix-only path must NOT have one — else the list is stale and a
 *     real page is being kept out of the offline bundle.
 *
 *     node scripts/offline-tests/test-module-paths.js
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Load modules.ts through the TS compiler, stubbing its one import. */
function loadModules() {
  const file = path.join(ROOT, 'src/lib/modules.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;

  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => {
    // roleGroups only matters for access resolution, not for the path lists.
    if (id.includes('roleGroups')) return { effectiveRoles: (r) => [r] };
    if (Module.builtinModules.includes(id)) return require(id);
    return require(path.join(ROOT, 'node_modules', id));
  };
  m._compile(js, file);
  return m.exports;
}

/** Does /dashboard/x resolve to a real App Router page? */
function hasPage(routePath) {
  const rel = routePath.replace(/^\//, '');
  return (
    fs.existsSync(path.join(ROOT, 'src/app', rel, 'page.tsx')) ||
    fs.existsSync(path.join(ROOT, 'src/app', rel, 'page.jsx'))
  );
}

console.log('Module paths vs the pages that actually exist\n');

const { MODULES, PREFIX_ONLY_PATHS, NAVIGABLE_MODULE_PATHS } = loadModules();

console.log('1. The catalogue loaded');
check('MODULES is populated', Array.isArray(MODULES) && MODULES.length > 20, `${MODULES?.length} modules`);
check('PREFIX_ONLY_PATHS is a list', Array.isArray(PREFIX_ONLY_PATHS));
check('NAVIGABLE_MODULE_PATHS is a list', Array.isArray(NAVIGABLE_MODULE_PATHS));
check(
  'navigable + prefix-only accounts for every distinct path',
  NAVIGABLE_MODULE_PATHS.length + PREFIX_ONLY_PATHS.length ===
    new Set(MODULES.flatMap((m) => m.paths)).size,
  `${NAVIGABLE_MODULE_PATHS.length} + ${PREFIX_ONLY_PATHS.length} vs ${new Set(MODULES.flatMap((m) => m.paths)).size}`
);

console.log('\n2. Every route the warm-up prefetches exists');
const missing = NAVIGABLE_MODULE_PATHS.filter((p) => p.startsWith('/dashboard') && !hasPage(p));
check(
  'no navigable module path 404s',
  missing.length === 0,
  missing.length ? `no page for: ${missing.join(', ')}` : ''
);

console.log('\n3. Every prefix-only path really is page-less');
const nowReal = PREFIX_ONLY_PATHS.filter((p) => hasPage(p));
check(
  'the exclusion list has not gone stale',
  nowReal.length === 0,
  nowReal.length
    ? `these now HAVE a page and should be removed from PREFIX_ONLY_PATHS: ${nowReal.join(', ')}`
    : ''
);

console.log('\n4. The exclusion list is not a dumping ground');
const unknown = PREFIX_ONLY_PATHS.filter(
  (p) => !MODULES.some((m) => m.paths.includes(p))
);
check(
  'every excluded path is actually in the catalogue',
  unknown.length === 0,
  unknown.length ? `not a module path: ${unknown.join(', ')}` : ''
);
check(
  'the four reported 404s are covered',
  ['/dashboard/power-house', '/dashboard/cssd', '/dashboard/laundry-supervisor', '/dashboard/works-supervisor'].every(
    (p) => PREFIX_ONLY_PATHS.includes(p)
  )
);

console.log('\n5. The check has teeth');
check('hasPage finds a page that plainly exists', hasPage('/dashboard/imprest'));
check('hasPage rejects one that does not', !hasPage('/dashboard/definitely-not-a-page'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
