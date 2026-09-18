/**
 * Screenshot every module, desktop and mobile, for the training handbook.
 *
 * Runs against the throwaway screenshot database, never production: the
 * pictures end up in training material and a real folder number on a screen
 * cannot be recalled once the video is circulated.
 *
 * DPI IS SET EXPLICITLY, and that is not decoration. On this machine a capture
 * that inherits the OS scaling silently returns a top-left crop of the page —
 * it looks like a screenshot, it is the wrong screenshot, and the failure is
 * invisible until somebody tries to read the picture. deviceScaleFactor is
 * pinned to 2 so every image is a real retina-density capture of the WHOLE
 * viewport.
 *
 * Naming: <NN>-<slug>__desktop.png / __mobile.png, so the files sort in menu
 * order and a shot can be matched to a module by name alone.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.SHOT_BASE || 'http://localhost:3111';
const OUT = process.env.SHOT_OUT || 'C:/Users/HomePC/Documents/phone and desktop screenshots';
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER = process.env.SHOT_USER || 'admin';
const PASS = process.env.SHOT_PASS || 'admin123';

/** Retina density. See the note above — this is the DPI guard. */
const SCALE = 2;
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: SCALE };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true };

// routes.txt lives in the REPOSITORY, not the folder above it. It used to be
// read from ../../ — outside the repo, unversioned — so the sweep silently ran
// an old route list and every page added since was missing from the capture
// with nothing to say so.
const routes = fs
  .readFileSync(path.join(__dirname, '..', 'routes.txt'), 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const slug = (r) => (r === '' ? 'dashboard-home' : r.replace(/\//g, '-'));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  /**
   * A fresh browser, signed in, ready to capture.
   *
   * Chrome is restarted every so often because it does not survive 136 heavy
   * pages in one process: after roughly thirty routes it stops answering the
   * DevTools protocol at all and every later call fails with a timeout on
   * setDeviceMetricsOverride. Restarting is cheaper than diagnosing a wedged
   * renderer, and the sign-in is only a few seconds.
   */
  async function freshBrowser() {
    const b = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      protocolTimeout: 180000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
    });
    const pg = await b.newPage();
    await pg.setViewport(DESKTOP);
    await pg.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await pg.type('input[name="username"], input#username', USER, { delay: 15 });
    await pg.type('input[name="password"], input#password, input[type="password"]', PASS, { delay: 15 });
    await pg.click('button[type="submit"]');
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await pg
        .evaluate(async () => {
          const r = await fetch('/api/auth/session');
          return r.ok ? await r.json() : null;
        })
        .catch(() => null);
      if (s && s.user) return { b, pg };
    }
    throw new Error('sign-in failed');
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });

  const page = await browser.newPage();
  await page.setViewport(DESKTOP);

  // ── Sign in once; the cookie is reused for every capture ────────────────
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('input[name="username"], input#username', USER, { delay: 15 });
  await page.type('input[name="password"], input#password, input[type="password"]', PASS, { delay: 15 });
  await page.click('button[type="submit"]');

  // The form signs in through NextAuth and then routes client-side after a
  // first-login check, so the URL can still read /auth/login while the session
  // cookie already exists. Waiting for a navigation therefore proves nothing —
  // ask the session endpoint instead, which is the thing that actually matters.
  let signedIn = false;
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const session = await page
      .evaluate(async () => {
        const r = await fetch('/api/auth/session');
        return r.ok ? await r.json() : null;
      })
      .catch(() => null);
    if (session && session.user) {
      console.log('signed in as', session.user.username ?? session.user.name);
      signedIn = true;
      break;
    }
  }
  if (!signedIn) {
    console.error('SIGN-IN FAILED — no session after 20s. Nothing captured.');
    await browser.close();
    process.exit(1);
  }

  // The login screen itself is worth having: it is the first shot of V2.
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle2' }).catch(() => {});

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const manifest = [];

  // Restart the browser this often. See freshBrowser() above.
  const RESTART_EVERY = 25;
  let current = { b: browser, pg: page };
  let sinceRestart = 0;

  for (const [i, route] of routes.entries()) {
    const n = String(i + 1).padStart(3, '0');
    const name = `${n}-${slug(route)}`;
    const url = `${BASE}/dashboard${route ? `/${route}` : ''}`;

    if (sinceRestart >= RESTART_EVERY) {
      await current.b.close().catch(() => {});
      current = await freshBrowser();
      sinceRestart = 0;
      console.log('  (browser restarted)');
    }
    sinceRestart += 1;

    for (const [label, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
      const file = path.join(OUT, `${name}__${label}.png`);
      // Resumable: a run that died half way should not redo what it finished.
      // 40 kB is comfortably above a spinner and below any real page.
      if (fs.existsSync(file) && fs.statSync(file).size > 40 * 1024) { skipped += 1; continue; }
      const page = current.pg;
      try {
        await page.setViewport(viewport);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        // networkidle2 is NOT "the page is ready". This app resolves its
        // session and then fetches on the client, so the network can be quiet
        // while the screen still reads "Loading Theatre Manager…". Waiting a
        // fixed delay produced a folder full of spinners; the only honest
        // signal is the loading text going away and real content arriving.
        await page
          .waitForFunction(
            () => {
              const t = document.body?.innerText ?? '';
              if (/Loading Theatre Manager/i.test(t)) return false;
              return t.trim().length > 120;
            },
            { timeout: 40000, polling: 500 },
          )
          .catch(() => {});

        // Charts and images settle after the text does.
        await new Promise((r) => setTimeout(r, 1800));
        await page.screenshot({ path: file, fullPage: true });
        ok += 1;
      } catch (e) {
        failed += 1;
        console.log(`  FAILED ${name} ${label}: ${String(e.message).slice(0, 80)}`);
      }
    }
    manifest.push({ n, route: route || '(dashboard home)', name });
    if ((i + 1) % 20 === 0) console.log(`  …${i + 1}/${routes.length} routes`);
  }

  fs.writeFileSync(
    path.join(OUT, '_manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  await current.b.close().catch(() => {});
  console.log(`done:  written,  already present,  failed, into `);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
