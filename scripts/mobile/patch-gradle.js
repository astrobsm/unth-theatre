/**
 * Install the version and signing configuration into the generated project.
 *
 *   node scripts/mobile/patch-gradle.js
 *
 * Run AFTER `cap sync`/`cap add`, which build-apk.sh does for you.
 *
 * android/ is gitignored and regenerated, so anything edited directly into
 * android/app/build.gradle is lost without warning on the next regeneration —
 * and a release that quietly loses its signing config, or its versionCode,
 * fails on the phone rather than at the build. So the configuration lives in
 * tracked files under mobile/ and is applied on top, leaving the generated
 * file generated.
 *
 * Idempotent: running it twice changes nothing the second time.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'android', 'app');
const GRADLE = path.join(APP, 'build.gradle');
const APPLY = "apply from: 'orm-release.gradle'";

const fail = (...m) => { console.error('FAILED:', ...m); process.exit(1); };

if (!fs.existsSync(GRADLE)) fail(`no generated build.gradle at ${GRADLE}`);

for (const name of ['orm-release.gradle', 'version.properties']) {
  const src = path.join(ROOT, 'mobile', name);
  if (!fs.existsSync(src)) fail(`mobile/${name} is missing — it is tracked, so restore it`);
  fs.copyFileSync(src, path.join(APP, name));
}

let gradle = fs.readFileSync(GRADLE, 'utf8');

// A build.gradle still carrying the old hand-edits would fight the applied
// script — two signingConfigs blocks, two versionCodes — so say so rather
// than producing a build whose configuration is anyone's guess.
if (gradle.includes('ORM-signing/keystore.properties')) {
  fail(
    'android/app/build.gradle still has the signing block edited into it.\n' +
    '        Delete android/ and re-run build-apk.sh, which regenerates it clean.',
  );
}

if (!gradle.includes(APPLY)) {
  gradle = `${gradle.replace(/\s*$/, '')}\n\n${APPLY}\n`;
  fs.writeFileSync(GRADLE, gradle);
}

const props = fs.readFileSync(path.join(ROOT, 'mobile', 'version.properties'), 'utf8');
const read = (k) => (props.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1];
console.log(`version ${read('versionName')} (versionCode ${read('versionCode')})`);
console.log(`applied orm-release.gradle`);
