/* eslint-disable no-console */
/**
 * The screens the route sweep cannot reach.
 *
 * capture-screenshots.js walks routes.txt, which holds only pages with no
 * dynamic segment — a `[id]` route needs a real record, and the sweep has no
 * opinion about which. It also cannot open a dialog, because a dialog is not a
 * URL.
 *
 * Both matter for the awareness decks: the operation note and the scheduling
 * conflict dialog are the two screens this week's work added, and a deck that
 * describes them without showing them is the deck we started with.
 *
 * Runs against the THROWAWAY screenshot database only. Every patient on these
 * pictures is invented; see scripts/seed-screenshot-demo.ts.
 *
 *   node scripts/training/capture-extra-screens.js
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.SHOT_BASE || 'http://localhost:3111';
const OUT = process.env.SHOT_OUT || 'C:/Users/HomePC/Documents/ORM-Screens';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER = process.env.SHOT_USER || 'admin';
const PASS = process.env.SHOT_PASS || 'admin123';

/** Retina density, matching the route sweep. */
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 };

/** The page has settled when the loading banner has gone and text has arrived. */
async function settled(page) {
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
  await new Promise((r) => setTimeout(r, 1500));
}

/** Click the first element whose visible text matches, and say whether it worked. */
async function clickByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const hit = nodes.find((n) => (n.textContent || '').trim().toLowerCase().includes(needle.toLowerCase()));
    if (!hit) return false;
    hit.scrollIntoView({ block: 'center' });
    hit.click();
    return true;
  }, text);
  if (clicked) await new Promise((r) => setTimeout(r, 2500));
  return clicked;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport(DESKTOP);

  // ---- Sign in -----------------------------------------------------------
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('input[name="username"], input#username', USER, { delay: 15 });
  await page.type('input[name="password"], input#password, input[type="password"]', PASS, { delay: 15 });
  await page.click('button[type="submit"]');

  let signedIn = false;
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = await page
      .evaluate(async () => {
        const r = await fetch('/api/auth/session');
        return r.ok ? await r.json() : null;
      })
      .catch(() => null);
    if (s && s.user) { signedIn = true; break; }
  }
  if (!signedIn) {
    console.error('SIGN-IN FAILED — nothing captured.');
    await browser.close();
    process.exit(1);
  }
  console.log('signed in');

  // ---- A case to hang the dynamic routes off -----------------------------
  const surgeryId = await page.evaluate(async () => {
    const r = await fetch('/api/surgeries?limit=5');
    if (!r.ok) return null;
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : rows.surgeries ?? [];
    return list[0]?.id ?? null;
  });
  if (!surgeryId) {
    console.error('No surgery in the demo database — seed it first.');
    await browser.close();
    process.exit(1);
  }
  console.log('using case', surgeryId);

  const shots = [];
  const save = async (name) => {
    const file = path.join(OUT, `${name}__desktop.png`);
    await page.screenshot({ path: file });
    const kb = Math.round(fs.statSync(file).size / 1024);
    shots.push(`${name} (${kb} KB)`);
    console.log(`  ${String(kb).padStart(4)} KB  ${name}`);
  };

  // ---- 0. Plain routes the last sweep missed ------------------------------
  // The sweep read its route list from outside the repository, so every page
  // added since that file was last touched was absent from the capture with
  // nothing to say so. The path is fixed now; these are named explicitly here
  // rather than renumbering 280 files to slot six pages in.
  const LATE_ROUTES = [
    'case-blockers',
    'emergency-escalations',
    'infection-control',
    'radiology',
    'research/surgical-practice',
    'roster/supervisors',
  ];
  for (const route of LATE_ROUTES) {
    await page.goto(`${BASE}/dashboard/${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await settled(page);
    await save(route.replace(/\//g, '-'));
  }

  // ---- 1. The structured operation note ----------------------------------
  await page.goto(`${BASE}/dashboard/surgeries/${surgeryId}/post-op-notes`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await settled(page);
  // The form only appears once a note is started; without this the picture is
  // of an empty page telling you to press a button, which teaches nothing.
  await clickByText(page, 'Start the operation note');
  await settled(page);
  await save('surgeries-post-op-notes');

  // ---- 2. The nursing summary it produces --------------------------------
  if (await clickByText(page, 'Nursing summary')) {
    await save('surgeries-post-op-notes-nursing-summary');
  }

  // ---- 3. The scheduling conflict dialog ---------------------------------
  // Opened from the booking form rather than provoked by a clash: the dialog is
  // the same either way, and asking for the list is the habit worth teaching.
  await page.goto(`${BASE}/dashboard/surgeries/new`, { waitUntil: 'networkidle2', timeout: 60000 });
  await settled(page);
  if (await clickByText(page, 'See the theatre list')) {
    await new Promise((r) => setTimeout(r, 2500));
    await save('surgeries-new-schedule-dialog');
  } else {
    console.log('  (could not open the theatre list dialog — button not found)');
  }

  await browser.close();
  console.log(`\n${shots.length} extra screens captured into ${OUT}`);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
