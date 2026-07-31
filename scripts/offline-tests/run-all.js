/**
 * Offline-first + role-model regression suite.
 *
 *     npm run test:offline
 *
 * The project has no test runner, so these are self-contained harnesses. Each
 * one transpiles the REAL module from src/lib with the project's own TypeScript
 * and exercises it against in-memory stand-ins — so they test the shipped code,
 * not a copy of its logic.
 *
 *   test-offline-auth.js   encrypted offline sign-in: password verification,
 *                          lockout, enrolment expiry, multi-user devices
 *   test-offline-merge.js  showing work saved offline in lists and detail pages
 *   test-concurrency.js    refusing to overwrite a record someone else changed
 *   test-role-groups.js    surgeon/consultant-surgeon split: promoting a user
 *                          must never remove access
 *   test-module-paths.js   the offline warm-up only prefetches routes that exist
 *   test-offline-coverage.js  read coverage wiring: prefetch list is real, all
 *                          writers agree on one cache keyspace, nothing
 *                          bypasses the fetch interceptor
 *
 * These cover logic only. Service-worker behaviour, IndexedDB upgrades and the
 * login screen still need a manual pass in a browser with DevTools offline.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'test-offline-auth.js',
  'test-offline-merge.js',
  'test-concurrency.js',
  'test-role-groups.js',
  'test-offline-coverage.js',
  'test-no-redirect-loop.js',
  'test-module-paths.js',
  'test-auto-update.js',
];

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n${'='.repeat(60)}\n${suite}\n${'='.repeat(60)}`);
  try {
    console.log(execFileSync(process.execPath, [path.join(__dirname, suite)], { encoding: 'utf8' }));
  } catch (err) {
    failed++;
    console.log(err.stdout || '');
    console.error(err.stderr || '');
  }
}

console.log(failed ? `\n${failed} suite(s) FAILED` : '\nAll offline suites passed.');
process.exitCode = failed ? 1 : 0;
