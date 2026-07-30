/**
 * Regression guard for the offline sign-in redirect loop.
 *
 * Symptom: on a phone with data switched off, opening the app looped between
 * /dashboard and /auth/login, visibly blinking.
 *
 * Cause: two sources of truth. The dashboard trusted NextAuth's `status`
 * (which reports "unauthenticated" offline merely because /api/auth/session is
 * unreachable) and pushed to /auth/login; the login page trusted the cached
 * session in IndexedDB and pushed straight back to /dashboard.
 *
 * These assertions are structural — they fail if either side starts redirecting
 * on its own again, or if the supporting pieces regress.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const layout = read('src/app/dashboard/layout.tsx');
const login = read('src/app/auth/login/page.tsx');
const provider = read('src/components/OfflineProvider.tsx');
const interceptor = read('src/lib/globalFetchInterceptor.ts');
const sw = read('public/sw.js');

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

console.log('\n1. The login screen never navigates on its own');
{
  // It may navigate as the RESULT of a submitted sign-in, but must not redirect
  // merely because a session happens to be cached — that was one half of the loop
  // (and also let anyone reaching the login screen offline straight in).
  const autoRedirect =
    /getCachedData<[^>]*>\('session'\)[\s\S]{0,400}?router\.push\('\/dashboard/.test(login) ||
    /checkOfflineLogin[\s\S]{0,600}?router\.push\('\/dashboard/.test(login);
  check('no auto-redirect to /dashboard from a cached session', !autoRedirect);
  check('offline sign-in still verifies the password against the vault',
    /await offlineLogin\(username, password\)/.test(login));
  check('and only navigates once that verification succeeds',
    /if \(!result\.ok\)[\s\S]{0,200}?return;/.test(login));
}

console.log('\n2. The dashboard does not bounce a signed-in offline user');
{
  check('redirect waits for the identity lookup to finish', /if \(!identityChecked\) return;/.test(layout));
  check('redirect is skipped when offline with a cached identity',
    /!navigator\.onLine && cachedUser\) return;/.test(layout));
  check('the identity lookup always resolves (finally)', /\.finally\(\(\) => \{[\s\S]{0,120}setIdentityChecked\(true\)/.test(layout));
  check('the redirect effect depends on both new inputs',
    /\[status, router, identityChecked, cachedUser\]/.test(layout));
}

console.log('\n3. No request can escape the interceptor');
{
  check('installed during render, not on a timer',
    /if \(typeof window !== 'undefined'\) installFetchInterceptor\(\);/.test(provider));
  check('not installed inside the deferred setTimeout any more',
    !/setTimeout\(\(\) => \{[\s\S]{0,200}installFetchInterceptor\(\)/.test(provider));
  check('not torn down on unmount (StrictMode remount would lose it)',
    !/uninstallFetchInterceptor\(\)/.test(provider));
}

console.log('\n4. A user-less 200 is not treated as "signed out" while offline');
{
  // Scope the assertion to the session handler so it reads the real control
  // flow rather than depending on how much comment sits between the branches.
  const sessionHandler = (interceptor.split('async function handleSessionFetch')[1] || '').split('\n}')[0];
  check('a session naming a user is cached and returned as-is',
    /if \(session\?\.user\)[\s\S]{0,200}setCachedData\('session'/.test(sessionHandler));
  check('interceptor falls back to the stored session on a user-less 200',
    /!navigator\.onLine\)[\s\S]{0,200}getCachedData<\{ user\?: unknown \}>\('session'\)[\s\S]{0,200}cached\?\.data\?\.user/.test(sessionHandler));
  check('and only does so while offline (never resurrects a dead session online)',
    /Only while offline/.test(interceptor));
  check('service worker prefers a session that names a user',
    /hasUser = !!\(parsed && parsed\.user\)/.test(sw));
  check('service worker falls through to IndexedDB when the cached copy is empty',
    /idbSession && idbSession\.user/.test(sw));
}

console.log('\n5. Offline page reads the database it can actually open');
{
  const offlineHtml = read('public/offline.html');
  check('no version pin on indexedDB.open', /indexedDB\.open\('orm-offline'\)/.test(offlineHtml));
  check('reloads only on the online event, never in a loop',
    /addEventListener\('online', \(\) => window\.location\.reload\(\)\)/.test(offlineHtml));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
