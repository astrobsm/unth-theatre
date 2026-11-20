/**
 * What the mandatory theatre pack costs at each magnitude, on UNTH's own prices.
 *
 *   npx tsx scripts/maintenance/price-magnitude-bundle.ts
 *   npx tsx scripts/maintenance/price-magnitude-bundle.ts --json
 *
 * No database. It reads the hospital's two published price sheets and the pack
 * definitions the app already builds every case from, and multiplies them out.
 * That makes it runnable by anybody, repeatable, and — more to the point —
 * checkable line by line by somebody who disagrees with the answer.
 *
 * WHAT IT IS AND IS NOT. This is the FLOOR of a deposit, not the deposit: the
 * mandatory base pack every case of that size gets, plus the lines a case earns
 * from what was ticked at booking. It contains no suture, no mesh, no implant,
 * no drug beyond the transfusion cover, and no professional fee. A real case
 * adds its own procedure pack on top, which is why the app prices each case
 * individually and why a flat tariff was abandoned.
 *
 * AN UNPRICED ITEM IS NOT A FREE ITEM. Anything the sheets do not price is
 * excluded from the total and listed by name, and the total is declared
 * incomplete by exactly those lines. A figure that quietly treats 0 as a price
 * is the failure this whole module exists to avoid: the family is asked for the
 * difference at the theatre door.
 */

import fs from 'fs';
import path from 'path';
import {
  SURGERY_MAGNITUDES, resolveBasePack, needsDrivenPack,
  type SurgeryMagnitude, type BasePackItem,
} from '../../src/lib/baseConsumablePack';
import { UNTH_TARIFF_2026 } from '../../src/lib/specialNeeds/unthTariff2026';

const ROOT = path.join(__dirname, '..', '..');
const CONSUMABLE_CSV = path.join(ROOT, 'prisma', 'data', 'unth-consumable-prices.csv');
const asJson = process.argv.includes('--json');

/** Minimal CSV reader — the sheets are quoted and contain commas in prices. */
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

/** "4,000.00" -> 400000 kobo. Blank, "0" and junk -> null, meaning UNPRICED. */
function toKobo(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[₦,\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** The same normalisation the estimate engine uses, so names match across sheets. */
function key(name: string, size?: string | null): string {
  const base = `${name} ${size ?? ''}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return base;
}

// ---- Build one price index from both sheets --------------------------------
// The 2026 tariff is the later document and wins where both carry an item.
const prices = new Map<string, {
  kobo: number; source: string; listed: string;
  /** Whether the SHEET row names a size. A row with none prices every size. */
  sized: boolean;
  tokens: Set<string>;
}>();

/**
 * Names the sheets use for things the pack calls something else.
 *
 * EVERY ENTRY IS A JUDGEMENT SOMEBODY MAY WANT TO OVERRULE, so each is
 * written out rather than inferred by a cleverer matcher. The same choice
 * build-tariff-2026.ts makes, and for the same reason: a mapping that happens
 * silently inside a string comparison is a mapping nobody can check.
 *
 * What is NOT here matters as much. 'Examination gloves' looks like the
 * sheet's 'Procedure glove, latex' at \u20a676, but the pack asks for a PACK and
 * the sheet prices a glove. Mapping them would quote a box of a hundred at
 * seventy-six naira, so it is left unpriced and reported.
 */
const NAME_MAP: Record<string, string> = {
  // The pack's wording; the consumable sheet's own row is 'Sterile gloves'.
  'SURGICAL GLOVES STERILE': 'Sterile gloves',
  // The only chlorhexidine skin prep either sheet prices.
  'CHLORHEXIDINE SOLUTION': 'Chlorhexidine 0.5% in alcohol skin prep',
  // The sheet names the return electrode; the pack calls it the pad. One thing.
  'DIATHERMY PAD PATIENT PLATE': 'Diathermy patient plate (return electrode)',
};

const consumableRows = parseCsv(fs.readFileSync(CONSUMABLE_CSV, 'utf8'));
const header = consumableRows[0].map((h) => h.trim().toLowerCase());
const nameCol = header.indexOf('name');
const priceCol = header.findIndex((h) => h === 'price');
for (const r of consumableRows.slice(1)) {
  const kobo = toKobo(r[priceCol]);
  if (kobo === null) continue;
  const n = (r[nameCol] ?? '').trim();
  if (!n) continue;
  prices.set(key(n), {
    kobo, source: 'consumable price sheet', listed: n,
    sized: false, tokens: new Set(key(n).split(' ')),
  });
}
for (const t of UNTH_TARIFF_2026) {
  const kobo = toKobo(t.unitPrice ?? null);
  if (kobo === null) continue;
  prices.set(key(t.name, t.size), {
    kobo, source: 'tariff 2026', listed: t.listedAs ?? t.name,
    sized: Boolean(t.size), tokens: new Set(key(t.name, t.size).split(' ')),
  });
}

/**
 * Find a price for a pack line.
 *
 * Exact normalised match first; then the name without its size, because the
 * sheets price "Sterile gloves" once while the pack asks for a size; then a
 * containment match, which is how "Assorted syringes (2/5/10/20 ml)" answers a
 * request for "Syringe 10ml". Each fallback is recorded so a reader can see
 * WHICH line was matched loosely and argue with it.
 */
function priceFor(item: { name: string; size?: string | null }): {
  kobo: number | null; how: string; listed: string | null;
} {
  // A stated mapping first, so it cannot be overridden by an accidental match.
  const mapped = NAME_MAP[key(item.name)];
  if (mapped) {
    const hit = prices.get(key(mapped));
    if (hit) return { kobo: hit.kobo, how: `mapped to "${hit.listed}"`, listed: hit.listed };
  }

  const exact = prices.get(key(item.name, item.size));
  if (exact) return { kobo: exact.kobo, how: 'exact', listed: exact.listed };

  const bare = prices.get(key(item.name));
  if (bare) return { kobo: bare.kobo, how: 'name only', listed: bare.listed };

  /**
   * A sheet row with NO size of its own prices every size of that thing.
   *
   * This is what the sheets actually do: one 'IV cannula' line at \u20a6300 covers
   * 16G to 24G, while syringes are priced per size and must not be collapsed.
   * Reading the candidate's own size, rather than the request's, is what tells
   * those two apart -- and getting it the other way round silently charges a
   * 2 ml syringe at the 20 ml price.
   */
  const wantedTokens = new Set(key(item.name, item.size).split(' '));
  let best: { kobo: number; listed: string; score: number } | null = null;
  for (const [, v] of prices) {
    if (v.sized) continue;
    if (v.tokens.size < 2) continue;
    let subset = true;
    for (const t of v.tokens) if (!wantedTokens.has(t)) { subset = false; break; }
    if (!subset) continue;
    // The longest candidate that is still wholly contained in the request is
    // the most specific one, and the least likely to be a coincidence.
    if (!best || v.tokens.size > best.score) {
      best = { kobo: v.kobo, listed: v.listed, score: v.tokens.size };
    }
  }
  if (best) return { kobo: best.kobo, how: `matched to "${best.listed}"`, listed: best.listed };

  /**
   * The other direction: the request named plainly, the sheet named fully.
   *
   * The pack asks for a "Diathermy pencil" and the sheet sells a "Diathermy
   * (monopolar) pencil with holster"; a "Blood giving set" is the sheet's
   * "Blood giving set (with filter)". Tried only after everything above,
   * because it is the loosest rule here -- two words of the request are
   * required, and a sized sheet row is still excluded so a 2 ml syringe can
   * never take the 20 ml price.
   */
  let widest: { kobo: number; listed: string; score: number } | null = null;
  if (wantedTokens.size >= 2) {
    for (const [, v] of prices) {
      if (v.sized) continue;
      let subset = true;
      for (const t of wantedTokens) if (!v.tokens.has(t)) { subset = false; break; }
      if (!subset) continue;
      // The SHORTEST sheet row containing the whole request is the closest fit.
      if (!widest || v.tokens.size < widest.score) {
        widest = { kobo: v.kobo, listed: v.listed, score: v.tokens.size };
      }
    }
  }
  if (widest) return { kobo: widest.kobo, how: `widened to "${widest.listed}"`, listed: widest.listed };

  return { kobo: null, how: 'NO PRICE ON EITHER SHEET', listed: null };
}
const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

interface Costed {
  line: string;
  quantity: number;
  unitKobo: number | null;
  totalKobo: number | null;
  how: string;
}

function cost(items: BasePackItem[]): { costed: Costed[]; totalKobo: number; unpriced: Costed[] } {
  const costed: Costed[] = items.map((i) => {
    const p = priceFor(i);
    return {
      line: `${i.name}${i.size ? ` ${i.size}` : ''}`,
      quantity: i.quantity,
      unitKobo: p.kobo,
      totalKobo: p.kobo === null ? null : p.kobo * i.quantity,
      how: p.how,
    };
  });
  const totalKobo = costed.reduce((s, c) => s + (c.totalKobo ?? 0), 0);
  return { costed, totalKobo, unpriced: costed.filter((c) => c.totalKobo === null) };
}

// ---- The needs-driven additions, costed once -------------------------------
const diathermy = cost(needsDrivenPack({ needDiathermy: true } as never).consumables);
const transfusion2 = cost(needsDrivenPack({
  needBloodTransfusion: true, bloodUnits: 2,
} as never).consumables);

const result: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  pricedItemsAvailable: prices.size,
  note: 'Mandatory base pack only. No suture, mesh, implant, procedure pack or professional fee.',
  magnitudes: {} as Record<string, unknown>,
  addOns: {
    diathermy: { totalKobo: diathermy.totalKobo, unpriced: diathermy.unpriced.map((u) => u.line) },
    transfusionTwoUnits: { totalKobo: transfusion2.totalKobo, unpriced: transfusion2.unpriced.map((u) => u.line) },
  },
};

for (const m of SURGERY_MAGNITUDES as SurgeryMagnitude[]) {
  const pack = resolveBasePack(m);
  const c = cost(pack);
  (result.magnitudes as Record<string, unknown>)[m] = {
    lines: pack.length,
    pricedLines: pack.length - c.unpriced.length,
    unpricedLines: c.unpriced.length,
    basePackKobo: c.totalKobo,
    // Ten per cent on the consumable side, refundable. The same rate the app
    // already applies — stated here so the two cannot drift.
    contingencyKobo: Math.round(c.totalKobo * 0.1),
    withContingencyKobo: c.totalKobo + Math.round(c.totalKobo * 0.1),
    unpriced: c.unpriced.map((u) => u.line),
    detail: c.costed,
  };
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const line = (s = '') => console.log(s);
  line('='.repeat(74));
  line('MANDATORY BASE THEATRE PACK — costed on UNTH\'s own price sheets');
  line(`${prices.size} priced items available across both sheets`);
  line('='.repeat(74));
  for (const m of SURGERY_MAGNITUDES as SurgeryMagnitude[]) {
    const r = (result.magnitudes as Record<string, any>)[m];
    line();
    line(`── ${m} ──`);
    line(`   ${r.pricedLines} of ${r.lines} lines priced`);
    line(`   base pack            ${naira(r.basePackKobo)}`);
    line(`   + 10% contingency    ${naira(r.contingencyKobo)}`);
    line(`   = consumable floor   ${naira(r.withContingencyKobo)}`);
    if (r.unpricedLines) {
      line(`   NOT INCLUDED (no price on either sheet), ${r.unpricedLines} lines:`);
      for (const u of r.unpriced) line(`      · ${u}`);
    }
    line('   lines:');
    for (const d of r.detail as Costed[]) {
      const amt = d.totalKobo === null ? 'NO PRICE' : naira(d.totalKobo);
      line(`      ${String(d.quantity).padStart(3)} × ${d.line.padEnd(44)} ${amt.padStart(12)}   ${d.how === 'exact' ? '' : d.how}`);
    }
  }
  line();
  line('── ADD-ONS (flat, not scaled by magnitude) ──');
  line(`   diathermy requested          ${naira(diathermy.totalKobo)}${diathermy.unpriced.length ? `  (${diathermy.unpriced.length} unpriced: ${diathermy.unpriced.map((u) => u.line).join(', ')})` : ''}`);
  line(`   transfusion, 2 units         ${naira(transfusion2.totalKobo)}${transfusion2.unpriced.length ? `  (${transfusion2.unpriced.length} unpriced: ${transfusion2.unpriced.map((u) => u.line).join(', ')})` : ''}`);
  line();
  line('This is a FLOOR, not a deposit. No suture, mesh, implant, procedure');
  line('pack, anaesthetic drug or professional fee is in these figures.');
  line();
}
