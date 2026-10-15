/**
 * Match every handbook shot to a screenshot file.
 *
 * The handbook describes what is on screen in prose; the capture writes files
 * named after routes. This joins the two, so picking the picture for a shot is
 * reading a filename rather than hunting through 274 images.
 *
 * A shot that is a corridor, a patient or a presenter has NO app screen, and
 * says so — that distinction is the useful part. Guessing a screenshot for a
 * shot that should be filmed is worse than admitting there isn't one.
 */

const fs = require('fs');
const path = require('path');

const HANDBOOK = path.join(__dirname, 'orm-video-handbook.html');
const ROUTES = 'C:/Users/HomePC/Documents/routes.txt';
const SHOTS_DIR = 'C:/Users/HomePC/Documents/phone and desktop screenshots';

/**
 * Words in a shot description that name a module, mapped to its route.
 * Ordered longest-first at match time so "theatre readiness" wins over
 * "theatre".
 */
const HINTS = {
  'anaesthetist board': 'anaesthetist-board',
  'anaesthetist coverage': 'roster-anaesthetist-coverage',
  'technician coverage': 'roster-technician-coverage',
  'anesthesia setup': 'anesthesia-setup',
  'anaesthesia setup': 'anesthesia-setup',
  'theatre readiness': 'theatre-readiness',
  'case pack readiness': 'case-readiness',
  'team check-in': 'theatre-ops-check-in',
  'record milestones': 'theatre-ops-capture',
  'theatre operations': 'theatre-ops',
  'emergency response': 'theatre-ops-emergency-response',
  'qa review': 'theatre-ops-review',
  'theatre reception': 'theatre-reception',
  'holding area': 'holding-area',
  'call for patient': 'call-for-patient',
  'nurse handover': 'nurse-handover',
  'pacu': 'pacu',
  'who checklist': 'checklists',
  'checklists screen': 'checklists',
  'emergency booking': 'emergency-booking',
  'book surgery': 'surgeries',
  'surgeries': 'surgeries',
  'pre-operative visit': 'pre-operative-visit',
  'pre-op review': 'preop-reviews',
  'rx approvals': 'prescription-approvals',
  'pharmacy': 'prescriptions',
  'med tracking': 'medication-tracking',
  'blood bank': 'blood-bank',
  'emergency lab workup': 'emergency-lab-workup',
  'cssd inventory': 'cssd-inventory',
  'sterilization': 'cssd-sterilization',
  'cssd readiness': 'cssd-readiness',
  'theatre supply': 'theatre-supply',
  'sub-stores': 'sub-stores',
  'inventory desk': 'inventory-desk',
  'vendor accounts': 'vendor-desk',
  'finance desk': 'finance-desk',
  'theatre billing': 'theatre-billing',
  'cost estimates': 'estimates',
  'consumable pack': 'consumable-pack-provider',
  'patient transfers': 'transfers',
  'equipment checkout': 'equipment-checkout',
  'fault alerts': 'fault-alerts',
  'power status': 'power-house-status',
  'power maintenance': 'power-house-maintenance',
  'power readiness': 'power-house-readiness',
  'oxygen control': 'oxygen-control',
  'plumbing': 'plumbing-water-supply',
  'laundry': 'laundry',
  'theatre meals': 'theatre-meals',
  'order meal': 'meals-order',
  'duty roster': 'roster',
  'staff availability': 'staff-availability',
  'surgical unit calendar': 'surgical-unit-calendar',
  'duty flyers': 'duty-flyers',
  'my practice': 'my-practice',
  'mortality': 'mortality',
  'reports': 'reports',
  'research': 'research',
  'presentation': 'presentation',
  'staff effectiveness': 'reports-staff-effectiveness',
  'user management': 'users',
  'module access': 'admin-access',
  'announcements': 'announcements',
  'theatre music': 'music-library',
  'imprest register': 'imprest',
  'quarterly position': 'imprest-quarterly',
  'retirements': 'imprest-retirement',
  'imprest duties': 'imprest-duties',
  'anonymous tips': 'anonymous-tips',
  'feedback': 'feedback',
  'security reports': 'security-reports',
  'alerts': 'alerts',
  'scrub management': 'scrub-management',
  'cancellations': 'cancellations',
  'patients': 'patients',
};

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, ' — ')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();

// Route -> the numeric prefix the capture used, so the filename can be rebuilt.
const routes = fs.readFileSync(ROUTES, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const prefixOf = new Map();
routes.forEach((r, i) => {
  const slug = r === '' ? 'dashboard-home' : r.replace(/\//g, '-');
  prefixOf.set(slug, String(i + 1).padStart(3, '0'));
});

// Phrases that look like a module but are not: a phone's own Wi-Fi settings
// is not the app's Settings page, and matching it sends the producer to the
// wrong picture with no way of knowing.
const NOT_A_MODULE = /wi-?fi settings|phone settings|browser settings/i;

const hintKeys = Object.keys(HINTS).sort((a, b) => b.length - a.length);

function fileFor(visual) {
  if (NOT_A_MODULE.test(visual)) return null;
  const v = visual.toLowerCase();
  for (const key of hintKeys) {
    if (v.includes(key)) {
      const slug = HINTS[key];
      const n = prefixOf.get(slug);
      if (!n) continue;
      return `${n}-${slug}`;
    }
  }
  return null;
}

const html = fs.readFileSync(HANDBOOK, 'utf8');
const videos = html.split('<div class="video">').slice(1);

const lines = [];
lines.push('SHOT → SCREENSHOT INDEX');
lines.push('ORM Video Training Handbook');
lines.push('');
lines.push('Each shot below either names a screenshot file or says the shot has no app');
lines.push('screen and must be filmed or generated. Files are in this folder, as');
lines.push('<name>__desktop.png and <name>__mobile.png — use mobile wherever the script');
lines.push('says the task is done standing up.');
lines.push('');

let matched = 0;
let unmatched = 0;

for (const body of videos) {
  const title = decode((body.match(/<h3>([^<]+)<\/h3>/) || [, 'Untitled'])[1]);
  const rows = [...body.matchAll(
    /<tr><td class="scene">([\s\S]*?)<\/td><td class="visual">([\s\S]*?)<\/td>\s*<td class="narr">([\s\S]*?)<\/td><\/tr>/g,
  )];
  if (!rows.length) continue;

  lines.push('='.repeat(74));
  lines.push(title);
  lines.push('='.repeat(74));
  rows.forEach((m, i) => {
    const visual = decode(m[2]);
    const file = fileFor(visual);
    if (file) matched += 1; else unmatched += 1;
    lines.push(
      `SHOT ${String(i + 1).padStart(2, ' ')}  ${
        file ? `${file}__desktop.png / __mobile.png` : 'NO APP SCREEN — film or generate'
      }`,
    );
    lines.push(`         ${visual.slice(0, 150)}${visual.length > 150 ? '…' : ''}`);
  });
  lines.push('');
}

lines.push(`${matched} shots have a screenshot; ${unmatched} must be filmed or generated.`);

fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.writeFileSync(path.join(SHOTS_DIR, 'SHOT-IMAGE-INDEX.txt'), lines.join('\n'), 'utf8');
console.log(`index written: ${matched} matched, ${unmatched} need filming`);
