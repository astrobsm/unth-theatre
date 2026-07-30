/**
 * Guards the offline READ coverage wiring:
 *   • every endpoint in the prefetch list is a real GET collection route
 *   • the prefetch cache key matches the key the fetch interceptor reads
 *     (they were different keyspaces once, which made prefetched data invisible)
 *   • the service worker agrees on that same key
 *   • no form submission bypasses the interceptor (axios / XHR / sendBeacon)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

const manager = fs.readFileSync(path.join(ROOT, 'src/lib/offlineDataManager.ts'), 'utf8');
const interceptor = fs.readFileSync(path.join(ROOT, 'src/lib/globalFetchInterceptor.ts'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');

console.log('\n1. Prefetch list points at real endpoints');
{
  const block = manager.split('const OFFLINE_COLLECTIONS = [')[1].split('];')[0];
  const names = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  check(`list is populated (${names.length} collections)`, names.length > 50);

  const missing = names.filter((n) => !fs.existsSync(path.join(ROOT, 'src/app/api', n, 'route.ts')));
  check('every endpoint has a route file', missing.length === 0, missing.join(', '));

  const noGet = names.filter((n) => {
    const p = path.join(ROOT, 'src/app/api', n, 'route.ts');
    return fs.existsSync(p) && !fs.readFileSync(p, 'utf8').includes('export async function GET');
  });
  check('every endpoint exposes GET', noGet.length === 0, noGet.join(', '));

  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  check('no duplicates', dupes.length === 0, dupes.join(', '));

  // Coverage sanity: the big clinical collections must be in there.
  for (const must of ['surgeries', 'patients', 'roster', 'inventory', 'preop-reviews', 'checklists']) {
    check(`covers ${must}`, names.includes(must));
  }
}

console.log('\n2. One cache keyspace, agreed by all three writers');
{
  check('interceptor builds api-cache:{pathname}{search}',
    /api-cache:\$\{parsed\.pathname\}\$\{parsed\.search\}/.test(interceptor));
  check('prefetcher writes the same api-cache:/api/... key',
    /key: `api-cache:\/api\/\$\{name\}`/.test(manager));
  check('service worker builds the same key',
    /return `api-cache:\$\{url\.pathname\}\$\{url\.search\}`/.test(sw));
  check('prefetcher no longer uses bare keys',
    !/\{ key: 'surgeries'/.test(manager) && !/\{ key: 'patients'/.test(manager));
}

console.log('\n3. Service worker cannot fight the app over the database version');
{
  check('SW opens IndexedDB without pinning a version',
    /indexedDB\.open\('orm-offline'\)/.test(sw));
  check('SW no longer requests a fixed version',
    !/indexedDB\.open\('orm-offline',\s*\d+\)/.test(sw));
  check('SW guards against a missing object store',
    /objectStoreNames\.contains\(storeName\)/.test(sw));
}

console.log('\n4. Nothing bypasses the fetch interceptor');
{
  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }
  const offenders = [];
  for (const f of walk(path.join(ROOT, 'src'))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/\bnew XMLHttpRequest\b|\bfrom 'axios'|navigator\.sendBeacon/.test(s)) {
      offenders.push(path.relative(ROOT, f));
    }
  }
  check('no XHR / axios / sendBeacon anywhere in src', offenders.length === 0, offenders.join(', '));
}

console.log('\n5. Detail requests fall back to the cached list');
{
  check('interceptor implements findInCachedList', /async function findInCachedList/.test(interceptor));
  check('and marks those responses as partial', /X-Offline-Partial/.test(interceptor));
  check('records that exist only on this device are served locally',
    /async function servePendingRecord/.test(interceptor));
}

console.log('\n6. Cache writes survive a full disk');
{
  const store = fs.readFileSync(path.join(ROOT, 'src/lib/offlineStore.ts'), 'utf8');
  check('QuotaExceededError triggers eviction and one retry',
    /QuotaExceededError/.test(store) && /clearExpiredCache\(\)/.test(store));
  check('a failed cache write never throws to the caller',
    /cache write failed/.test(store));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
