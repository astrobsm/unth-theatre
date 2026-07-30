/**
 * Exercises the REAL src/lib/offlineAuth.ts (transpiled on the fly) against an
 * in-memory stand-in for the IndexedDB layer, so the vault's crypto and its
 * lockout/expiry state machine are tested as written — not re-implemented here.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

// Browser globals the module expects.
global.window = { crypto: globalThis.crypto };
global.crypto = globalThis.crypto;
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');

// In-memory stand-in for lib/offlineStore.
const vaults = new Map();
const cache = new Map();
const fakeStore = {
  putAuthVault: async (r) => { vaults.set(r.username, r); },
  getAuthVault: async (u) => vaults.get(u.trim().toLowerCase()) ?? null,
  listAuthVaults: async () => [...vaults.values()],
  deleteAuthVault: async (u) => { vaults.delete(u.trim().toLowerCase()); },
  setCachedData: async (k, d) => { cache.set(k, d); },
  removeCachedData: async (k) => { cache.delete(k); },
};

const src = fs.readFileSync(path.join(ROOT, 'src/lib/offlineAuth.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const m = new Module('offlineAuth');
m.require = (id) => (id === './offlineStore' ? fakeStore : require(id));
m._compile(js, path.join(ROOT, 'src/lib/offlineAuth.js'));
const auth = m.exports;

const SESSION = {
  user: { id: 'u1', name: 'Dr Test Anaesthetist', role: 'ANAESTHETIST', extraModules: ['roster'] },
  expires: '2026-08-30T00:00:00.000Z',
};

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
}

(async () => {
  console.log('\n1. Support detection + enrolment');
  check('WebCrypto detected as supported', auth.isOfflineAuthSupported() === true);
  const enrolled = await auth.enrollOfflineCredentials('DrTest', 'CorrectHorse42', SESSION);
  check('enrolment succeeds', enrolled === true);
  const rec = vaults.get('drtest');
  check('username normalised to lowercase key', !!rec);
  check('password is NOT stored anywhere in the record',
    !JSON.stringify(rec).includes('CorrectHorse42'));
  // displayName is intentionally plaintext (the login screen must name the
  // enrolled account before a password exists). Nothing else may be.
  check('user id is not stored in plaintext', !JSON.stringify(rec).includes('"u1"'));
  check('role is not stored in plaintext', !JSON.stringify(rec).includes('ANAESTHETIST'));
  check('module grants are not stored in plaintext', !JSON.stringify(rec).includes('roster'));
  check('the only plaintext identity is displayName',
    rec.displayName === 'Dr Test Anaesthetist' && !rec.ciphertext.includes('Anaesthetist'));
  check('salt and IV are unique random values', rec.salt.length > 0 && rec.iv.length > 0);

  console.log('\n2. Correct password (case-insensitive username)');
  const ok = await auth.offlineLogin('  DRTEST ', 'CorrectHorse42');
  check('login succeeds', ok.ok === true, JSON.stringify(ok));
  check('decrypted session round-trips', ok.ok && ok.session.user.name === 'Dr Test Anaesthetist');
  check('role preserved', ok.ok && ok.session.user.role === 'ANAESTHETIST');
  check('extraModules preserved', ok.ok && ok.session.user.extraModules[0] === 'roster');
  check('session written to the offline cache', cache.has('session') && cache.has('currentUser'));
  check('session expiry refreshed forward', new Date(cache.get('session').expires) > new Date());

  console.log('\n3. Wrong password is rejected');
  const bad = await auth.offlineLogin('drtest', 'WrongPassword');
  check('rejected', bad.ok === false && bad.reason === 'wrong-password', JSON.stringify(bad));
  check('reports remaining attempts', bad.attemptsLeft === 4);
  check('failure counter persisted', vaults.get('drtest').failedAttempts === 1);

  console.log('\n4. Correct password resets the failure counter');
  await auth.offlineLogin('drtest', 'CorrectHorse42');
  check('counter reset to 0', vaults.get('drtest').failedAttempts === 0);

  console.log('\n5. Lockout after 5 wrong attempts');
  let last;
  for (let i = 0; i < 5; i++) last = await auth.offlineLogin('drtest', 'nope');
  check('locks on the 5th attempt', last.ok === false && last.reason === 'locked', JSON.stringify(last));
  const whileLocked = await auth.offlineLogin('drtest', 'CorrectHorse42');
  check('correct password refused while locked',
    whileLocked.ok === false && whileLocked.reason === 'locked');
  check('lockout window ~15 min', Math.round(whileLocked.retryAfterMs / 60000) === 15);

  console.log('\n6. Lock expiry lets the right password back in');
  vaults.get('drtest').lockedUntil = Date.now() - 1;
  const afterLock = await auth.offlineLogin('drtest', 'CorrectHorse42');
  check('login works once the lock elapses', afterLock.ok === true, JSON.stringify(afterLock));

  console.log('\n7. Enrolment expiry');
  vaults.get('drtest').expiresAt = Date.now() - 1;
  const expired = await auth.offlineLogin('drtest', 'CorrectHorse42');
  check('expired vault refuses login', expired.ok === false && expired.reason === 'expired');
  check('message tells the user to go online once',
    auth.describeOfflineFailure(expired).includes('Connect to the internet'));

  console.log('\n8. Unknown account');
  const unknown = await auth.offlineLogin('someone.else', 'whatever');
  check('not-enrolled reported', unknown.ok === false && unknown.reason === 'not-enrolled');

  console.log('\n9. Re-enrolment after a password change');
  await auth.enrollOfflineCredentials('DrTest', 'BrandNewPass99', SESSION);
  const oldPw = await auth.offlineLogin('drtest', 'CorrectHorse42');
  const newPw = await auth.offlineLogin('drtest', 'BrandNewPass99');
  check('old password no longer works', oldPw.ok === false);
  check('new password works', newPw.ok === true, JSON.stringify(newPw));

  console.log('\n10. Multi-user device + revocation');
  await auth.enrollOfflineCredentials('nurse.b', 'NursePass77', {
    user: { id: 'u2', name: 'Nurse B', role: 'SCRUB_NURSE' },
  });
  const list = await auth.listOfflineEnrolments();
  check('both accounts enrolled', list.length === 2, JSON.stringify(list.map((l) => l.username)));
  check('each user only opens their own vault',
    (await auth.offlineLogin('nurse.b', 'BrandNewPass99')).ok === false);
  await auth.revokeOfflineCredentials('nurse.b');
  check('revoked account cannot sign in',
    (await auth.offlineLogin('nurse.b', 'NursePass77')).reason === 'not-enrolled');
  check('revocation clears the cached session', !cache.has('session'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('HARNESS ERROR', e); process.exitCode = 1; });
