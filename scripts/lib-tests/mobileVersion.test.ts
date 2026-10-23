import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Everything the Android build needs that a fresh clone would otherwise lose.
//
// android/ is gitignored and regenerated, so the version and the signing
// config are declared in tracked files under mobile/ and applied on top of
// Capacitor's generated build.gradle. The failure mode this guards is the
// quiet one: the build succeeds, the APK installs on a clean phone, and it is
// only on a phone that already has the app that Android refuses it — with a
// message ("package appears to be invalid") that names neither the version
// nor the signature.

const root = (...p: string[]) => join(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(root(...p), 'utf8');

const versionProps = read('mobile', 'version.properties');
const releaseGradle = read('mobile', 'orm-release.gradle');
const buildScript = read('scripts', 'mobile', 'build-apk.sh');
const downloads = read('src', 'app', 'downloads', 'page.tsx');

const prop = (k: string) => {
  const m = versionProps.match(new RegExp(`^${k}=(.+)$`, 'm'));
  if (!m) throw new Error(`mobile/version.properties has no ${k}`);
  return m[1].trim();
};

describe('version — declared once, advertised once', () => {
  it('matches the version the download page advertises', () => {
    const advertised = downloads.match(/const APK_VERSION = '([^']+)'/);
    expect(advertised, 'APK_VERSION not found on the download page').toBeTruthy();
    expect(prop('versionName')).toBe(advertised![1]);
  });

  it('has moved past the first release', () => {
    // versionCode 1 shipped. Anything still claiming 1 cannot replace it.
    expect(Number(prop('versionCode'))).toBeGreaterThan(1);
  });

  it('declares versionCode as a plain integer', () => {
    expect(prop('versionCode')).toMatch(/^\d+$/);
  });
});

describe('signing — all four schemes, and the key stays out of the repository', () => {
  it('enables v1 through v4 explicitly', () => {
    for (const scheme of ['enableV1Signing', 'enableV2Signing', 'enableV3Signing', 'enableV4Signing']) {
      expect(releaseGradle, `${scheme} is not enabled`).toContain(`${scheme} true`);
    }
  });

  it('reads the keystore from outside the working tree', () => {
    expect(releaseGradle).toContain('ORM-signing/keystore.properties');
    expect(releaseGradle).toContain('System.getProperty("user.home")');
  });

  it('carries no password of its own', () => {
    // The file is tracked. Every credential in it must be a lookup, never a
    // literal, or committing it publishes the signing key's passwords.
    const literals = releaseGradle.match(/(storePassword|keyPassword)\s+"[^"]*"/g);
    expect(literals, `hard-coded password in mobile/orm-release.gradle: ${literals}`).toBeNull();
  });
});

describe('the build script applies all of it', () => {
  it('runs the gradle patcher, and fails the build if it cannot', () => {
    expect(buildScript).toContain('patch-gradle.js');
    // A warning here would let an unsigned, un-versioned release through.
    expect(buildScript).toMatch(/patch-gradle\.js \|\| \{ say "FAILED/);
  });

  it('regenerates the launcher icon and shrinks the splash', () => {
    expect(buildScript).toContain('capacitor-assets generate --android');
    expect(buildScript).toContain('shrink-splash.js');
  });

  it('still restores the Firebase client config', () => {
    expect(buildScript).toContain('mobile/google-services.json');
  });
});
