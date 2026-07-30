/**
 * Guards the automatic content-update path.
 *
 * The installed Android and desktop apps load the live site, so a web deploy IS
 * the app update. AppUpdateChecker applies it without a tap — which makes two
 * safety properties load-bearing:
 *
 *   1. A CACHED /api/version response must never be mistaken for a new deploy.
 *      Offline, the offline layer can serve a stored copy of that endpoint; if a
 *      stale value counted as an update, the app would reload, read the stale
 *      value again, and loop.
 *   2. It must never reload while the user is mid-task or work is queued.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

const checker = fs.readFileSync(path.join(ROOT, 'src/components/AppUpdateChecker.tsx'), 'utf8');
const warmup = fs.readFileSync(path.join(ROOT, 'src/components/NativeOfflineWarmup.tsx'), 'utf8');
const capConfig = fs.readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

console.log('\n1. A cached version read can never trigger a reload loop');
{
  check('skips the check entirely while offline', /!navigator\.onLine\) return;/.test(checker));
  check('rejects a response served from the offline cache',
    /X-Offline-Cache'\) === 'true'[\s\S]{0,80}X-Offline'\) === 'true'/.test(checker));
  check('that guard runs BEFORE the version comparison',
    checker.indexOf("X-Offline-Cache") < checker.indexOf('version !== baseline.current'));
  check('first successful read only establishes a baseline',
    /baseline\.current === null[\s\S]{0,120}baseline\.current = version/.test(checker));
}

console.log('\n2. Never reloads out from under the user');
{
  check('refuses when anything is queued to sync', /getOfflineQueueCount\(\)\) > 0\) return false/.test(checker));
  check('refuses if the queue cannot be read (fails closed)',
    /catch \{[\s\S]{0,40}return false;[\s\S]{0,20}\}/.test(checker));
  check('applies freely while the app is hidden',
    /visibilityState === 'hidden'\) return true/.test(checker));
  check('when visible, requires a recent resume', /resumedRecently/.test(checker));
  check('and no recent typing', /typingRecently/.test(checker) && /return resumedRecently && !typingRecently/.test(checker));
  check('typing is tracked in the capture phase, app-wide',
    /addEventListener\('input', onInput, true\)/.test(checker) &&
    /addEventListener\('change', onInput, true\)/.test(checker));
  check('refuses while offline (no new assets to fetch)',
    /safeToApplyAutomatically[\s\S]{0,400}!navigator\.onLine\) return false/.test(checker));
}

console.log('\n3. Auto-apply is wired to background/resume, and cannot double-fire');
{
  check('re-attempts on visibilitychange', /const onVisibility = \(\) => \{ tryAuto\(\); \}/.test(checker));
  check('guarded against re-entry', /if \(applyingRef\.current\) return;/.test(checker));
  check('manual banner still available', /Update now/.test(checker));
  check('dismissal is still respected', /dismissed === updateVersion\) return/.test(checker));
}

console.log('\n4. Installed apps get the corrected offline cache');
{
  check('shell version bumped so every device re-warms', /SHELL_VERSION = 'v3-/.test(warmup));
  check('reason recorded for the bump', /68/.test(warmup));
}

console.log('\n5. The native shell really does load the live site');
{
  check('capacitor points at the deployed URL',
    /unth-theatre-mai\.vercel\.app/.test(capConfig) && /server:/.test(capConfig));
  check('so a web deploy updates the native apps', /Every web deploy instantly updates the mobile apps/.test(capConfig));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
