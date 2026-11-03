import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

// "Sir it opened I saw the duty roster but sign me out and I can't sign in
// again." Two separate faults wearing one sentence, and these hold both of
// them shut.

describe('nobody is signed out because a request failed', () => {
  const layout = read('src/app/dashboard/layout.tsx');

  it('asks the server before redirecting to the login page', () => {
    // useSession reports "unauthenticated" when its own call to
    // /api/auth/session FAILED, not only when the session ended. On this
    // hospital's Wi-Fi that happens mid-shift with a perfectly valid cookie.
    const effect = layout.slice(
      layout.indexOf("if (status !== 'unauthenticated') return;"),
      layout.indexOf('[status, router, identityChecked, cachedUser]'),
    );
    expect(effect).toContain("fetch('/api/auth/session'");
    // The redirect must come AFTER the question, not before it.
    expect(effect.indexOf("fetch('/api/auth/session'"))
      .toBeLessThan(effect.indexOf("router.push('/auth/login')"));
  });

  it('treats an unreachable server as "stay put", not as "signed out"', () => {
    const effect = layout.slice(
      layout.indexOf("if (status !== 'unauthenticated') return;"),
      layout.indexOf('[status, router, identityChecked, cachedUser]'),
    );
    // A failed request returns early; only a live answer with no user
    // reaches the redirect.
    expect(effect).toMatch(/if \(!res\.ok\) return;/);
    expect(effect).toMatch(/if \(session && session\.user\) return;/);
    // And a thrown fetch must not fall through into a redirect.
    const catchBlock = effect.slice(effect.lastIndexOf('} catch {'));
    expect(catchBlock).not.toContain("router.push('/auth/login')");
  });

  it('does not rely on navigator.onLine alone', () => {
    // It is true whenever the device has ANY interface, so a handset on
    // theatre Wi-Fi with a dead uplink reports itself online while every
    // request fails -- the exact condition here.
    const effect = layout.slice(
      layout.indexOf("if (status !== 'unauthenticated') return;"),
      layout.indexOf('[status, router, identityChecked, cachedUser]'),
    );
    expect(effect).toContain('navigator.onLine'); // the offline case still short-circuits
    expect(effect).toContain("fetch('/api/auth/session'"); // but it is not the only guard
  });
});

describe('a device that cannot sign in can repair itself', () => {
  const recovery = read('src/lib/auth/signInRecovery.ts');
  const login = read('src/app/auth/login/page.tsx');

  it('deletes queued and failed sign-in attempts, not just queued ones', () => {
    // A queued /api/auth/ entry is a staff password sitting in IndexedDB.
    // Nothing should ever have put one there, and on the pre-fix bundle it
    // was replayed on reconnect.
    expect(recovery).toContain('getOfflineQueue');
    expect(recovery).toContain('removeFromOfflineQueue');
    expect(recovery).toContain('getFailedMutations');
    expect(recovery).toContain('discardFailedMutation');
  });

  it('never throws on the page somebody is trying to sign in on', () => {
    // Storage can be blocked, absent or in a private window. A cleanup
    // failure must not become the reason they cannot log in.
    const purge = recovery.slice(
      recovery.indexOf('export async function purgeQueuedAuthMutations'),
      recovery.indexOf('export async function refreshAppShellForSignIn'),
    );
    expect(purge.split('catch {').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('keeps the data cache and drops only the app shell', () => {
    // orm-data-* is the work people did offline. It is not ours to discard
    // to fix a login.
    expect(recovery).toMatch(/orm-\(static\|pages\|rsc\)-/);
    expect(recovery).not.toMatch(/caches\.delete\(k\)[\s\S]{0,40}orm-data/);
    expect(recovery).toContain('orm-data-'); // mentioned, in the comment that spares it
  });

  it('activates a waiting service worker', () => {
    // public/sw.js deliberately never calls skipWaiting() on install, so a
    // desktop app nobody closes runs weeks-old JavaScript and stays broken
    // however many times the fix is deployed.
    expect(recovery).toContain('SKIP_WAITING');
    expect(recovery).toContain('reg.update()');
  });

  it('runs on the login page, and only reloads once', () => {
    expect(login).toContain('purgeQueuedAuthMutations');
    expect(login).toContain('refreshAppShellForSignIn');
    // A sign-in page that refreshes itself every visit is its own fault.
    expect(login).toContain("sessionStorage.getItem('orm.signInRefreshed')");
  });

  it('does not clear the shell while the device is offline', () => {
    // There IS an offline sign-in on that screen -- an encrypted local vault
    // -- and dropping the shell with no server to reach could leave somebody
    // with neither way in.
    const effect = login.slice(login.indexOf('purgeQueuedAuthMutations'));
    const guard = effect.indexOf('navigator.onLine === false');
    const refresh = effect.indexOf('refreshAppShellForSignIn()');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(refresh);
  });

  it('tells the person their device was at fault, not them', () => {
    // They have been pressing a button to no effect, possibly for days.
    expect(login).toMatch(/Cleared \$\{removed\} stuck sign-in attempt/);
    expect(login).toContain('recoveryNote');
  });
});

describe('the sign-in machinery is still exempt from the offline queue', () => {
  it('the interceptor sends /api/auth/ straight to the network', () => {
    // The original fault, from d1e7d51. If this regresses, every device
    // breaks again and the recovery above is all that stands between staff
    // and a dead login form.
    const interceptor = read('src/lib/globalFetchInterceptor.ts');
    expect(interceptor).toContain('isAuthEndpoint');
    expect(interceptor).toMatch(/ALWAYS_LIVE[\s\S]{0,200}'\/api\/auth\/'/);
  });

  it('the service worker does not touch the sign-in callback', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("url.pathname.startsWith('/api/auth/callback')");
  });
});
