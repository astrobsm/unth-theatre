// ============================================================
// prisma/data/unth-proposed-prices-2026.csv  ->  src/lib/specialNeeds/unthTariff2026.ts
// ------------------------------------------------------------
// Run with:  npx tsx scripts/build-tariff-2026.ts
//
// The hospital issues its tariff as a printed sheet. This turns that sheet
// into a module the app can read, and it exists so the TS file never has to
// be hand-edited: the CSV is the document, this is the transcription, and a
// reissued tariff is a new CSV and one command.
//
// THREE THINGS HAPPEN HERE THAT ARE NOT TRANSCRIPTION, and each is a
// decision somebody may want to disagree with, so each is visible:
//
//   A ZERO IS NOT A PRICE. "0.00" on the sheet means the committee has not
//   set one. Carried through as zero it would quote a case confidently and
//   far too low, and the family is asked for the difference at the theatre
//   door. It is carried through as BLANK, which the app already knows how
//   to declare.
//
//   THE SHEET'S SPELLING IS MAPPED ONTO THE CATALOGUE'S. "Lightweight
//   polypropylene mesh" and "Polypropylene mesh, lightweight" are one mesh.
//   Loading the sheet's spelling verbatim would create a priced duplicate
//   beside the unpriced row every bundle and picker already points at, and
//   the duplicate is the one nobody would ever choose. The sheet's own
//   wording is kept in `listedAs` so the mapping can be checked.
//
//   ONE ROW PER REAL THING. A description that resolves to a row already
//   emitted is dropped rather than emitted twice.
// ============================================================

import fs from 'fs';
import path from 'path';

const CSV = path.join(__dirname, '..', 'prisma', 'data', 'unth-proposed-prices-2026.csv');
const OUT = path.join(__dirname, '..', 'src', 'lib', 'specialNeeds', 'unthTariff2026.ts');

/**
 * How the store issues each kind of thing.
 *
 * The pick list and the out-of-stock prescription read this, so a nurse is
 * told "2 rolls" rather than "2 pieces". The sheet does not carry it, so it
 * comes from the category — and only for rows the catalogue does not
 * already describe, which keep whatever the store already called them.
 */
const UNIT_BY_CATEGORY: Record<string, string> = {
  GLOVES: 'pair',
  PLASTER: 'roll',
  BANDAGE: 'roll',
  CASTING: 'roll',
  LOCAL_ANAESTHETIC: 'vial',
  ANTIBIOTIC: 'vial',
  WATER_FOR_INJECTION: 'ampoule',
  TRANSFUSION_ADJUNCT: 'ampoule',
};

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
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function main() {
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`the CSV has no "${name}" column`);
    return i;
  };
  const iCategory = col('category');
  const iName = col('name');
  const iSize = col('size');
  const iPrice = col('price');
  const iListedAs = col('listed_as');

  const seen = new Set<string>();
  const out: string[] = [];
  let priced = 0;
  let dropped = 0;

  rows.slice(1).forEach((r) => {
    const category = r[iCategory].trim();
    const name = r[iName].trim();
    const size = r[iSize].trim();
    const rawPrice = r[iPrice].trim();
    const listedAs = r[iListedAs].trim();

    const key = `${category}\u0000${name.toLowerCase()}\u0000${size.toLowerCase()}`;
    if (seen.has(key)) { dropped += 1; return; }
    seen.add(key);

    // See the note at the top: a zero on the sheet is an unfilled cell.
    const unitPrice = rawPrice && Number(rawPrice) > 0 ? Number(rawPrice).toFixed(2) : '';
    if (unitPrice) priced += 1;

    const unit = UNIT_BY_CATEGORY[category] ?? 'piece';
    const code = `T26-${slug(category)}-${slug(name)}${size ? `-${slug(size)}` : ''}`;

    const q = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const parts = [
      `category: ${q(category)}`,
      `name: ${q(name)}`,
      ...(size ? [`size: ${q(size)}`] : []),
      ...(unitPrice ? [`unitPrice: ${q(unitPrice)}`] : []),
      `unit: ${q(unit)}`,
      `code: ${q(code)}`,
      ...(listedAs ? [`listedAs: ${q(listedAs)}`] : []),
    ];
    out.push(`  { ${parts.join(', ')} },`);
  });

  const body = `// ============================================================
// UNTH Ituku-Ozalla theatre tariff, 2026 revision
// ------------------------------------------------------------
// GENERATED from prisma/data/unth-proposed-prices-2026.csv by
// scripts/build-tariff-2026.ts. Do not hand-edit: edit the CSV and
// re-run the generator, or change prices in the app, which is where
// they are meant to be changed once the tariff is loaded.
//
// ${out.length} items, of which ${priced} carry a price.
//
// THE REST ARE DELIBERATELY BLANK. The sheet writes "0.00" or nothing
// against them, which means the committee has not set a figure — not
// that the item is free. Carried through as zero they would quote a
// case confidently and far too low. Carried through as blank they are
// counted, declared on the deposit, and listed in the pricing queue.
//
// \`listedAs\` records the sheet's own wording where it differs from the
// catalogue's, so the mapping that avoided a duplicate row can be read
// and disagreed with.
//
// Prices are naira strings, not numbers. Decimal money through a float
// loses kobo.
// ============================================================

import type { PricedSeedItem } from './unthPriceList';

/** A tariff line, shaped like the price list so one importer reads both. */
export type TariffRow = Omit<PricedSeedItem, 'maxQtyPerPack'> & {
  /** How the hospital's own sheet spelled it, where that differs. */
  listedAs?: string;
};

export const UNTH_TARIFF_2026: TariffRow[] = [
${out.join('\n')}
];

/** How much of the tariff carries a figure. Shown before importing. */
export function tariff2026Summary() {
  let withPrice = 0;
  UNTH_TARIFF_2026.forEach((i) => {
    if (i.unitPrice) withPrice += 1;
  });
  return {
    total: UNTH_TARIFF_2026.length,
    priced: withPrice,
    unpriced: UNTH_TARIFF_2026.length - withPrice,
  };
}
`;

  fs.writeFileSync(OUT, body.replace(/\n/g, '\n'), 'utf8');
  console.log(
    `wrote ${out.length} rows to ${path.relative(process.cwd(), OUT)} ` +
      `(${priced} priced, ${out.length - priced} left blank, ${dropped} dropped as duplicates)`,
  );
}

main();
