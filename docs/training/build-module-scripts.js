/**
 * A NexoraVision script per MODULE, matched to the screenshots that were
 * captured for it.
 *
 * The role-based handbook tells a story across screens. This is the other axis:
 * one short script per module, so a demo can be assembled screen by screen with
 * the picture for each shot already named.
 *
 * The narration is built from what each page ACTUALLY SAYS — its heading and
 * its own one-line description, read out of the source — rather than from a
 * template with the module name dropped in. A script that says "this is the
 * Theatre Readiness module, use it to manage theatre readiness" teaches nothing
 * and everybody can tell.
 *
 * Output format is the one parseNarrationScript() accepts:
 *
 *     SHOT 1 — hold
 *     <narration>
 *
 * with the still for each shot named beside the block, never inside it — an
 * IMAGE: line would be read aloud by the narrator.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const ROUTES = 'C:/Users/HomePC/Documents/routes.txt';
const SHOTS = 'C:/Users/HomePC/Documents/phone and desktop screenshots';
const OUT_TXT = path.join(SHOTS, 'MODULE-SCRIPTS.txt');
const OUT_HTML = path.join(__dirname, 'orm-module-scripts.html');

const routes = fs.readFileSync(ROUTES, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

const titleCase = (s) =>
  s
    .replace(/[-/]/g, ' ')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bCssd\b/g, 'CSSD')
    .replace(/\bPacu\b/g, 'PACU')
    .replace(/\bQa\b/g, 'QA')
    .replace(/\bRx\b/g, 'Rx');

/** Pull the page's own heading and description out of its source. */
function describe(route) {
  const file = path.join(REPO, 'src', 'app', 'dashboard', route, 'page.tsx');
  let src = '';
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return { heading: null, blurb: null };
  }

  const clean = (s) =>
    s
      // `${expr}` FIRST, dollar included. Stripping `{...}` on its own leaves a
      // bare `$` behind, which is how "Date: $ · $ case$" reached a script.
      .replace(/\$\{[^}]*\}/g, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&rsquo;/g, '’')
      .replace(/&mdash;/g, '—')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

  /**
   * Is this a usable sentence, or the wreckage of an interpolated one?
   *
   * A heading built from template literals reduces to punctuation and stray
   * separators once the expressions are removed. Better to fall back to the
   * module's own name than to narrate debris.
   */
  const usable = (t) =>
    Boolean(t) &&
    t.length > 3 &&
    !t.includes('$') &&
    !/^[\s·—–\-:,.]+$/.test(t) &&
    !/(·\s*·|:\s*$|:\s*·)/.test(t) &&
    /[a-z]{3}/.test(t);

  // The first literal <h1> on the page.
  const h1 = src.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/);
  const rawHeading = h1 ? clean(h1[1]) : null;
  const heading = usable(rawHeading) ? rawHeading : null;

  // The first descriptive <p> after it — these pages nearly all carry one.
  let blurb = null;
  const after = h1 ? src.slice(src.indexOf(h1[0]) + h1[0].length) : src;
  const ps = [...after.matchAll(/<p[^>]*>([\s\S]{0,320}?)<\/p>/g)];
  for (const m of ps) {
    const t = clean(m[1]);
    if (t.length > 25 && usable(t) && !/^\d/.test(t)) { blurb = t; break; }
  }

  return { heading, blurb };
}

/**
 * Where this module's work is actually done.
 *
 * 'floor'   — standing up, on a phone, during a list.
 * 'booking' — clinical data entry, often one-handed but not necessarily moving.
 * 'desk'    — administration and reporting, done sitting down.
 */
function classify(route) {
  const r = route || '';
  if (/^(admin|reports|research|presentation|imprest|finance-desk|vendor-desk|inventory-desk|theatre-billing|estimates|users|settings|announcements|music-library|catalog-contribute|surgical-unit-calendar|roster|staff-availability|theatre-audit|disciplinary)/.test(r)) {
    return 'desk';
  }
  if (/^(surgeries|emergency-booking|patients|pre-operative-visit|preop-reviews|anaesthetist-board|anesthesia-setup|blood-bank|prescriptions|prescription-approvals|emergency-lab-workup|mortality|cancellations)/.test(r)) {
    return 'booking';
  }
  return 'floor';
}

const shotFile = (n, slug, view) => `${n}-${slug}__${view}.png`;
const exists = (f) => fs.existsSync(path.join(SHOTS, f));

const modules = [];

routes.forEach((route, i) => {
  const n = String(i + 1).padStart(3, '0');
  const slug = route === '' ? 'dashboard-home' : route.replace(/\//g, '-');
  const desktop = shotFile(n, slug, 'desktop');
  const mobile = shotFile(n, slug, 'mobile');
  if (!exists(desktop) && !exists(mobile)) return;

  const { heading, blurb } = describe(route);
  const name = heading || titleCase(slug);

  // Narration. Built from the page's own words where it has them, and honest
  // about the screen where it does not.
  const line1 = blurb
    ? `${name}. ${blurb}`
    : `${name}. This is where that work is recorded, so everybody who needs it can see the same thing at the same time.`;

  // Where the work is actually done decides what shots 2 and 3 can honestly
  // say. Telling an administrator that module access is managed "beside a
  // trolley" is nonsense, and one wrong sentence costs the viewer's trust in
  // the other two.
  const kind = classify(route);

  const line2 = {
    floor:
      `The same screen on a phone. Everything fits — nothing hidden behind a scroll — because this is done standing up, ` +
      `in a corridor or beside a trolley, not at a desk.`,
    booking:
      `The same screen on a phone. It is built to be completed one-handed, because it often is: ` +
      `on a ward round, between cases, or at ten at night.`,
    desk:
      `It works on a phone too. You would normally do this at a desk, but when somebody rings you at home about it, ` +
      `you are not stuck until Monday.`,
  }[kind];

  const line3 = {
    floor:
      `Record it here as it happens, not from memory at the end of the shift. ` +
      `The moment you do, it reaches everybody waiting on it — and that is usually somebody who would otherwise telephone you.`,
    booking:
      `What you enter here is the instruction the rest of the hospital follows. ` +
      `Fill in what you have and leave what you do not: anything missing comes back as an outstanding item rather than blocking the case.`,
    desk:
      `Change it here and it is changed everywhere, immediately. There is no second list to circulate ` +
      `and no version for people to disagree about, which is where most of the arguments used to start.`,
  }[kind];

  const shots = [];
  if (exists(desktop)) shots.push({ motion: 'hold', narration: line1, still: desktop });
  if (exists(mobile)) shots.push({ motion: 'hold', narration: line2, still: mobile });
  shots.push({
    motion: 'push in',
    narration: line3,
    still: exists(desktop) ? desktop : mobile,
  });

  modules.push({ n, slug, route: route || '(dashboard home)', name, blurb, shots });
});

// ── plain text, for pasting ────────────────────────────────────────────────
const txt = [];
txt.push('ORM MODULE SCRIPTS — one per module, for NexoraVision Produce');
txt.push('');
txt.push('For each module: the stills to load, then a block to paste into the');
txt.push('narration box. The app reads "SHOT n — motion" as a heading and every');
txt.push('other line as narration. Do not paste the STILLS lines.');
txt.push('');

for (const m of modules) {
  txt.push('='.repeat(76));
  txt.push(`${m.n}  ${m.name}`);
  txt.push(`      /dashboard/${m.route}`);
  txt.push('='.repeat(76));
  txt.push('STILLS, in order:');
  m.shots.forEach((s, i) => txt.push(`  shot ${i + 1}: ${s.still}`));
  txt.push('');
  txt.push('PASTE THIS:');
  txt.push('');
  m.shots.forEach((s, i) => {
    txt.push(`SHOT ${i + 1} — ${s.motion}`);
    txt.push(s.narration);
    txt.push('');
  });
}

txt.push(`${modules.length} modules.`);
fs.writeFileSync(OUT_TXT, txt.join('\n'), 'utf8');

// ── printable version ──────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = [];
html.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ORM Module Scripts</title><style>
@page{size:A4;margin:15mm 14mm}
body{font-family:Georgia,serif;font-size:10.5pt;line-height:1.45;color:#111827;margin:0}
h1{font-size:22pt;margin:0 0 4pt}
h2{font-size:12.5pt;margin:0 0 2pt;color:#1d4ed8}
.mod{page-break-inside:avoid;border-top:1px solid #d1d5db;padding-top:9pt;margin-top:11pt}
.route{font-family:'Courier New',monospace;font-size:8.5pt;color:#6b7280;margin:0 0 4pt}
.stills{font-family:Arial,sans-serif;font-size:8.5pt;color:#4b5563;margin:0 0 5pt}
.prompt{font-family:'Courier New',monospace;font-size:8.5pt;background:#f3f4f6;border:1px dashed #9ca3af;padding:6pt 8pt;white-space:pre-wrap;border-radius:3pt}
.lead{color:#4b5563;font-size:11pt}
</style></head><body>`);
html.push(`<h1>ORM Module Scripts</h1><p class="lead">One narration script per module, matched to the captured screenshots. ${modules.length} modules. Paste each block into NexoraVision &rarr; Produce &rarr; Narrated sequence.</p>`);
for (const m of modules) {
  html.push(`<div class="mod"><h2>${m.n} &middot; ${esc(m.name)}</h2>`);
  html.push(`<p class="route">/dashboard/${esc(m.route)}</p>`);
  html.push(`<p class="stills">Stills: ${m.shots.map((s, i) => `shot ${i + 1} = ${esc(s.still)}`).join(' &middot; ')}</p>`);
  html.push(`<div class="prompt">${m.shots.map((s, i) => `SHOT ${i + 1} — ${s.motion}\n${esc(s.narration)}`).join('\n\n')}</div></div>`);
}
html.push('</body></html>');
fs.writeFileSync(OUT_HTML, html.join('\n'), 'utf8');

console.log(`${modules.length} module scripts written`);
console.log(`  ${OUT_TXT}`);
console.log(`  ${OUT_HTML}`);
