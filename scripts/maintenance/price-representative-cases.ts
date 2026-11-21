/**
 * What a real case of each magnitude costs in materials, on UNTH's own prices.
 *
 *   npx tsx scripts/maintenance/price-representative-cases.ts
 *   npx tsx scripts/maintenance/price-representative-cases.ts --json
 *
 * No database. It composes the pack the app would actually generate for a named
 * procedure — the mandatory base pack, the approach, the family, the sutures,
 * the prophylaxis — and prices it against the hospital's two published sheets.
 *
 * WHY REPRESENTATIVE PROCEDURES AND NOT AN AVERAGE. A mean over everything the
 * theatre does is dominated by whatever it does most of, which tells you about
 * the case mix rather than about the band. A named operation can be checked by
 * a surgeon who knows what that operation takes, and disagreed with line by
 * line. Every procedure below is one this hospital does regularly.
 *
 * WHAT IS STILL NOT IN THESE FIGURES: the surgeon's and anaesthetist's fees,
 * the theatre charge, the bed, the pre-operative investigations, and any
 * implant or mesh chosen for the individual patient. This is the MATERIALS
 * side only — which is precisely the side the hospital's own price sheets
 * cover, and the side a deposit is held against.
 *
 * AN UNPRICED LINE IS NOT A FREE LINE. Anything neither sheet prices is
 * excluded and counted, and the band total is declared short by exactly those
 * lines rather than quietly rounded down.
 */

import fs from 'fs';
import path from 'path';
import { generatePacks } from '../../src/lib/packs/generate';
import { UNTH_TARIFF_2026 } from '../../src/lib/specialNeeds/unthTariff2026';

const ROOT = path.join(__dirname, '..', '..');
const CONSUMABLE_CSV = path.join(ROOT, 'prisma', 'data', 'unth-consumable-prices.csv');
const asJson = process.argv.includes('--json');

/**
 * The cases the bands are read from.
 *
 * Chosen so that each is (a) done here routinely, (b) unambiguous about which
 * band it belongs to, and (c) spread across subspecialties, so one unit's
 * expensive habits do not set the figure for the whole hospital.
 */
const REPRESENTATIVE: Array<{
  band: string;
  procedureName: string;
  subspecialty: string;
  magnitude: string;
}> = [
  // ── MINOR: skin and soft tissue, local or short general, day case ──
  { band: 'MINOR', procedureName: 'Incision and drainage of abscess', subspecialty: 'General Surgery', magnitude: 'MINOR' },
  { band: 'MINOR', procedureName: 'Excision of lipoma', subspecialty: 'General Surgery', magnitude: 'MINOR' },
  { band: 'MINOR', procedureName: 'Circumcision', subspecialty: 'Paediatric Surgery', magnitude: 'MINOR' },
  { band: 'MINOR', procedureName: 'Wound debridement', subspecialty: 'Plastic Surgery', magnitude: 'MINOR' },

  // ── INTERMEDIATE: a cavity entered or a defect repaired, overnight stay ──
  { band: 'INTERMEDIATE', procedureName: 'Herniorrhaphy', subspecialty: 'General Surgery', magnitude: 'INTERMEDIATE' },
  { band: 'INTERMEDIATE', procedureName: 'Appendicectomy', subspecialty: 'General Surgery', magnitude: 'INTERMEDIATE' },
  { band: 'INTERMEDIATE', procedureName: 'Adenotonsillectomy', subspecialty: 'ENT (Otorhinolaryngology)', magnitude: 'INTERMEDIATE' },
  { band: 'INTERMEDIATE', procedureName: 'Open reduction and internal fixation of forearm fracture', subspecialty: 'Orthopaedics', magnitude: 'INTERMEDIATE' },

  // ── MAJOR: the modal theatre case here ──
  { band: 'MAJOR', procedureName: 'Caesarean section', subspecialty: 'Obstetrics & Gynaecology', magnitude: 'MAJOR' },
  { band: 'MAJOR', procedureName: 'Exploratory laparotomy', subspecialty: 'General Surgery', magnitude: 'MAJOR' },
  { band: 'MAJOR', procedureName: 'Total abdominal hysterectomy', subspecialty: 'Obstetrics & Gynaecology', magnitude: 'MAJOR' },
  { band: 'MAJOR', procedureName: 'Thyroidectomy', subspecialty: 'General Surgery', magnitude: 'MAJOR' },
  { band: 'MAJOR', procedureName: 'Mastectomy', subspecialty: 'General Surgery', magnitude: 'MAJOR' },

  // ── SUPER-MAJOR: a cavity plus an implant, or the skull, or the chest ──
  { band: 'SUPER_MAJOR', procedureName: 'Total hip arthroplasty', subspecialty: 'Orthopaedics', magnitude: 'SUPER_MAJOR' },
  { band: 'SUPER_MAJOR', procedureName: 'Craniotomy for intracranial tumour', subspecialty: 'Neurosurgery', magnitude: 'SUPER_MAJOR' },
  { band: 'SUPER_MAJOR', procedureName: 'Oesophagectomy', subspecialty: 'Cardiothoracic Surgery', magnitude: 'SUPER_MAJOR' },
  { band: 'SUPER_MAJOR', procedureName: 'Whipple pancreaticoduodenectomy', subspecialty: 'General Surgery', magnitude: 'SUPER_MAJOR' },
];

// ---- Price index, identical rules to price-magnitude-bundle.ts -------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function toKobo(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[₦,\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function key(name: string, size?: string | null): string {
  return `${name} ${size ?? ''}`.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const prices = new Map<string, { kobo: number; listed: string; sized: boolean; tokens: Set<string> }>();

const rows = parseCsv(fs.readFileSync(CONSUMABLE_CSV, 'utf8'));
const header = rows[0].map((h) => h.trim().toLowerCase());
const nameCol = header.indexOf('name');
const priceCol = header.findIndex((h) => h === 'price');
for (const r of rows.slice(1)) {
  const kobo = toKobo(r[priceCol]);
  const n = (r[nameCol] ?? '').trim();
  if (kobo === null || !n) continue;
  prices.set(key(n), { kobo, listed: n, sized: false, tokens: new Set(key(n).split(' ')) });
}
for (const t of UNTH_TARIFF_2026) {
  const kobo = toKobo(t.unitPrice ?? null);
  if (kobo === null) continue;
  prices.set(key(t.name, t.size), {
    kobo, listed: t.listedAs ?? t.name,
    sized: Boolean(t.size), tokens: new Set(key(t.name, t.size).split(' ')),
  });
}

/** Stated mappings — see price-magnitude-bundle.ts for why these are explicit. */
const NAME_MAP: Record<string, string> = {
  'SURGICAL GLOVES STERILE': 'Sterile gloves',
  'CHLORHEXIDINE SOLUTION': 'Chlorhexidine 0.5% in alcohol skin prep',
  'DIATHERMY PAD PATIENT PLATE': 'Diathermy patient plate (return electrode)',
};

function priceFor(item: { name: string; size?: string | null }): number | null {
  const mapped = NAME_MAP[key(item.name)];
  if (mapped) {
    const hit = prices.get(key(mapped));
    if (hit) return hit.kobo;
  }
  const exact = prices.get(key(item.name, item.size));
  if (exact) return exact.kobo;
  const bare = prices.get(key(item.name));
  if (bare) return bare.kobo;

  const wanted = new Set(key(item.name, item.size).split(' '));
  let best: { kobo: number; score: number } | null = null;
  for (const v of Array.from(prices.values())) {
    if (v.sized || v.tokens.size < 2) continue;
    let subset = true;
    for (const t of Array.from(v.tokens)) if (!wanted.has(t)) { subset = false; break; }
    if (subset && (!best || v.tokens.size > best.score)) best = { kobo: v.kobo, score: v.tokens.size };
  }
  if (best) return best.kobo;

  if (wanted.size >= 2) {
    let widest: { kobo: number; score: number } | null = null;
    for (const v of Array.from(prices.values())) {
      if (v.sized) continue;
      let subset = true;
      for (const t of Array.from(wanted)) if (!v.tokens.has(t)) { subset = false; break; }
      if (subset && (!widest || v.tokens.size < widest.score)) widest = { kobo: v.kobo, score: v.tokens.size };
    }
    if (widest) return widest.kobo;
  }
  return null;
}

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

interface CaseResult {
  band: string;
  procedureName: string;
  consumableKobo: number;
  pharmacyKobo: number;
  totalKobo: number;
  lines: number;
  unpricedLines: number;
  unpriced: string[];
}

const results: CaseResult[] = REPRESENTATIVE.map((c) => {
  const packs = generatePacks({
    procedureName: c.procedureName,
    subspecialty: c.subspecialty,
    magnitude: c.magnitude,
  });

  let consumableKobo = 0;
  let pharmacyKobo = 0;
  let unpricedLines = 0;
  const unpriced: string[] = [];

  const walk = (items: typeof packs.consumables, into: 'c' | 'p') => {
    for (const i of items) {
      // A line the surgeon must still choose between options is not a line
      // anybody can price yet. Counted as unpriced rather than guessed at.
      const p = i.needsChoice ? null : priceFor(i);
      if (p === null) {
        unpricedLines += 1;
        unpriced.push(`${i.name}${i.size ? ` ${i.size}` : ''}${i.needsChoice ? ' (choice not yet made)' : ''}`);
        continue;
      }
      if (into === 'c') consumableKobo += p * i.quantity;
      else pharmacyKobo += p * i.quantity;
    }
  };
  walk(packs.consumables, 'c');
  walk(packs.pharmacy, 'p');

  return {
    band: c.band,
    procedureName: c.procedureName,
    consumableKobo,
    pharmacyKobo,
    totalKobo: consumableKobo + pharmacyKobo,
    lines: packs.consumables.length + packs.pharmacy.length,
    unpricedLines,
    unpriced,
  };
});

const BANDS = ['MINOR', 'INTERMEDIATE', 'MAJOR', 'SUPER_MAJOR'];
const summary = BANDS.map((b) => {
  const cases = results.filter((r) => r.band === b);
  const totals = cases.map((r) => r.totalKobo).sort((a, x) => a - x);
  const median = totals[Math.floor((totals.length - 1) / 2)];
  const contingency = Math.round(median * 0.1);
  return {
    band: b,
    cases: cases.length,
    lowKobo: totals[0],
    medianKobo: median,
    highKobo: totals[totals.length - 1],
    contingencyKobo: contingency,
    medianWithContingencyKobo: median + contingency,
    medianConsumableKobo: cases.map((r) => r.consumableKobo).sort((a, x) => a - x)[Math.floor((cases.length - 1) / 2)],
    medianPharmacyKobo: cases.map((r) => r.pharmacyKobo).sort((a, x) => a - x)[Math.floor((cases.length - 1) / 2)],
    unpricedLinesTotal: cases.reduce((s, r) => s + r.unpricedLines, 0),
    linesTotal: cases.reduce((s, r) => s + r.lines, 0),
  };
});

if (asJson) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
} else {
  const line = (s = '') => console.log(s);
  line('='.repeat(78));
  line("REPRESENTATIVE CASES — materials costed on UNTH's own price sheets");
  line(`${prices.size} priced items available. Materials only: no fee, theatre, bed or implant.`);
  line('='.repeat(78));
  for (const b of BANDS) {
    const s = summary.find((x) => x.band === b)!;
    line();
    line(`── ${b} ──`);
    for (const r of results.filter((x) => x.band === b)) {
      line(`   ${r.procedureName.padEnd(52)} ${naira(r.totalKobo).padStart(12)}   ` +
        `(${r.lines - r.unpricedLines}/${r.lines} lines priced)`);
    }
    line(`   ${'—'.repeat(52)}`);
    line(`   ${'range'.padEnd(52)} ${naira(s.lowKobo)} – ${naira(s.highKobo)}`);
    line(`   ${'MEDIAN materials'.padEnd(52)} ${naira(s.medianKobo).padStart(12)}`);
    line(`   ${'  of which consumables'.padEnd(52)} ${naira(s.medianConsumableKobo).padStart(12)}`);
    line(`   ${'  of which pharmacy'.padEnd(52)} ${naira(s.medianPharmacyKobo).padStart(12)}`);
    line(`   ${'+ 10% contingency (refundable)'.padEnd(52)} ${naira(s.contingencyKobo).padStart(12)}`);
    line(`   ${'= MATERIALS DEPOSIT'.padEnd(52)} ${naira(s.medianWithContingencyKobo).padStart(12)}`);
    line(`   ${s.linesTotal - s.unpricedLinesTotal} of ${s.linesTotal} lines across this band carried a price.`);
  }
  line();
  line('Lines neither sheet prices are EXCLUDED, not zeroed. Each band total is');
  line('short by exactly those lines, which is why the coverage figure is printed');
  line('beside it rather than buried.');
  line();
}
