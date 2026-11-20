#!/usr/bin/env node
/**
 * What a case of each magnitude has ACTUALLY cost, from the records.
 *
 *   node scripts/maintenance/deposit-band-report.js
 *   node scripts/maintenance/deposit-band-report.js --json
 *
 * Read-only. It writes nothing and changes nothing.
 *
 * WHY THIS EXISTS. The deposit the app asks for is computed per case — the
 * magnitude bundle plus whatever the surgeon added, priced line by line — and
 * that is the right way round. But a guide figure per band is still needed, in
 * three places where a per-case figure does not exist yet: quoting a patient
 * in clinic before anything is booked, sanity-checking a computed deposit that
 * looks wrong, and the cashier's floor. Those figures have until now been
 * somebody's recollection.
 *
 * NO PATIENT IDENTIFIER IS READ OR PRINTED. Not a name, not a folder number,
 * not a surgery id. This is a report about money and item names; everything it
 * touches is an aggregate. That is deliberate, because its output is meant to
 * be pasted into a committee paper.
 *
 * WHAT IT WILL NOT DO. It will not treat an unpriced line as a free one. Every
 * figure it prints is accompanied by how many lines had no price behind it,
 * because a confident median built over half-priced packs is worse than no
 * median at all — it is wrong in a direction nobody can see.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { PrismaClient } = require(path.join(ROOT, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const asJson = process.argv.includes('--json');

const MAGNITUDES = ['MINOR', 'INTERMEDIATE', 'MAJOR', 'SUPER_MAJOR'];

const naira = (kobo) =>
  kobo === null || kobo === undefined
    ? '—'
    : `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

/** Decimal | string | null -> whole kobo, or null when nobody has priced it. */
function toKobo(price) {
  if (price === null || price === undefined || price === '') return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Order statistics. Medians, not means: one aortic graft drags a mean. */
function stats(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))))];
  return {
    n: v.length,
    min: v[0],
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    max: v[v.length - 1],
  };
}

async function main() {
  const out = { generatedAt: new Date().toISOString() };

  // ---- 1. How many cases are there at all, and do they carry a magnitude? ---
  const byMagnitude = await prisma.surgery.groupBy({
    by: ['magnitude'],
    _count: { _all: true },
  });
  out.surgeriesByMagnitude = byMagnitude
    .map((r) => ({ magnitude: r.magnitude ?? '(not recorded)', cases: r._count._all }))
    .sort((a, b) => b.cases - a.cases);

  const byStatus = await prisma.surgery.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  out.surgeriesByStatus = byStatus
    .map((r) => ({ status: r.status, cases: r._count._all }))
    .sort((a, b) => b.cases - a.cases);

  // The post-operative complexity assessment is a DIFFERENT answer to the same
  // question — scored from eight criteria after the fact rather than declared
  // at booking. Where both exist they can be compared; where only one does,
  // that is itself the finding.
  const byComplexity = await prisma.surgery.groupBy({
    by: ['complexityClass'],
    _count: { _all: true },
    where: { complexityClass: { not: null } },
  });
  out.surgeriesByComplexityClass = byComplexity
    .map((r) => ({ complexityClass: r.complexityClass, cases: r._count._all }))
    .sort((a, b) => b.cases - a.cases);

  // ---- 2. The price master: how much of the catalogue has a price at all? --
  const items = await prisma.specialNeedItem.findMany({
    select: {
      id: true, name: true, category: true, unitPrice: true,
      dispensedByPharmacy: true, isActive: true,
    },
  });
  const priceById = new Map(items.map((i) => [i.id, i]));
  const priced = items.filter((i) => toKobo(i.unitPrice) !== null);
  out.catalogue = {
    items: items.length,
    active: items.filter((i) => i.isActive).length,
    priced: priced.length,
    unpriced: items.length - priced.length,
    pricedPercent: items.length ? Math.round((priced.length / items.length) * 100) : 0,
  };

  // ---- 3. What a case of each magnitude actually carried, priced ------------
  // surgery_special_needs is the itemised list the deposit is computed from:
  // the magnitude bundle plus the surgeon's additions. It is the closest thing
  // the records hold to "what this case consumed".
  const needs = await prisma.surgerySpecialNeed.findMany({
    select: {
      surgeryId: true, itemId: true, quantity: true, fromBundle: true,
      surgery: { select: { magnitude: true, status: true } },
    },
  });

  const perCase = new Map(); // surgeryId -> accumulator
  const itemFrequency = new Map(); // `${magnitude}::${name}` -> count
  for (const n of needs) {
    const magnitude = (n.surgery?.magnitude ?? '').toUpperCase() || '(not recorded)';
    let acc = perCase.get(n.surgeryId);
    if (!acc) {
      acc = {
        magnitude,
        status: n.surgery?.status ?? null,
        consumableKobo: 0, pharmacyKobo: 0,
        lines: 0, unpricedLines: 0,
      };
      perCase.set(n.surgeryId, acc);
    }
    acc.lines += 1;

    const item = priceById.get(n.itemId);
    const unit = item ? toKobo(item.unitPrice) : null;
    if (unit === null) {
      acc.unpricedLines += 1;
    } else if (item.dispensedByPharmacy) {
      acc.pharmacyKobo += unit * n.quantity;
    } else {
      acc.consumableKobo += unit * n.quantity;
    }

    if (item) {
      const key = `${magnitude}::${item.name}`;
      itemFrequency.set(key, (itemFrequency.get(key) ?? 0) + 1);
    }
  }

  out.bands = [];
  for (const m of [...MAGNITUDES, '(not recorded)']) {
    const cases = [...perCase.values()].filter((c) => c.magnitude === m);
    if (!cases.length) {
      out.bands.push({ magnitude: m, cases: 0, note: 'No case in the records carries this magnitude with an itemised list.' });
      continue;
    }
    // A case with ANY unpriced line produces a total that is knowingly short.
    // Counted separately rather than silently included — this is the whole
    // reason the figures below can or cannot be trusted.
    const complete = cases.filter((c) => c.unpricedLines === 0);
    const totals = complete.map((c) => c.consumableKobo + c.pharmacyKobo);

    out.bands.push({
      magnitude: m,
      cases: cases.length,
      casesFullyPriced: complete.length,
      medianLines: stats(cases.map((c) => c.lines))?.median ?? null,
      unpricedLineShare: (() => {
        const total = cases.reduce((s, c) => s + c.lines, 0);
        const un = cases.reduce((s, c) => s + c.unpricedLines, 0);
        return total ? Math.round((un / total) * 100) : 0;
      })(),
      totalKobo: stats(totals),
      consumableKobo: stats(complete.map((c) => c.consumableKobo)),
      pharmacyKobo: stats(complete.map((c) => c.pharmacyKobo)),
      commonestItems: [...itemFrequency.entries()]
        .filter(([k]) => k.startsWith(`${m}::`))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, v]) => ({ item: k.split('::')[1], cases: v })),
    });
  }

  // ---- 4. Deposits the app has actually asked for --------------------------
  const deposits = await prisma.caseDepositStatus.findMany({
    select: {
      magnitude: true, consumableSubtotal: true, pharmacySubtotal: true,
      consumableContingency: true,
    },
  });
  const depositBands = new Map();
  for (const d of deposits) {
    const m = (d.magnitude ?? '').toUpperCase() || '(not recorded)';
    const total = (toKobo(d.consumableSubtotal) ?? 0)
      + (toKobo(d.pharmacySubtotal) ?? 0)
      + (toKobo(d.consumableContingency) ?? 0);
    if (!depositBands.has(m)) depositBands.set(m, []);
    if (total > 0) depositBands.get(m).push(total);
  }
  out.depositsAsked = {
    rows: deposits.length,
    byMagnitude: [...depositBands.entries()].map(([magnitude, v]) => ({
      magnitude, withAnAmount: v.length, kobo: stats(v),
    })),
  };

  // ---- 5. The pack lists, which are the other source of truth --------------
  const consumableLines = await prisma.surgeryConsumableRequest.count();
  const drugLines = await prisma.surgeryDrugDressingRequest.count();
  out.packLines = { consumables: consumableLines, pharmacy: drugLines };

  // ---- 6. Anaesthesia, which drives the pharmacy side ----------------------
  const byAnaesthesia = await prisma.surgery.groupBy({
    by: ['anesthesiaType'],
    _count: { _all: true },
  }).catch(() => []);
  out.anaesthesiaTypes = byAnaesthesia
    .map((r) => ({ type: r.anesthesiaType ?? '(not recorded)', cases: r._count._all }))
    .sort((a, b) => b.cases - a.cases);

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // ---- Human-readable -------------------------------------------------------
  const line = (s = '') => console.log(s);
  line('='.repeat(72));
  line('DEPOSIT BANDS — what the records actually show');
  line(`Generated ${out.generatedAt}`);
  line('='.repeat(72));

  line();
  line('1. CASES BY MAGNITUDE (declared at booking)');
  for (const r of out.surgeriesByMagnitude) line(`   ${String(r.magnitude).padEnd(18)} ${r.cases}`);

  line();
  line('2. CASES BY POST-OP COMPLEXITY CLASS (scored after the fact)');
  if (!out.surgeriesByComplexityClass.length) {
    line('   NONE. No case has a complexity assessment recorded.');
  } else {
    for (const r of out.surgeriesByComplexityClass) line(`   ${String(r.complexityClass).padEnd(18)} ${r.cases}`);
  }

  line();
  line('3. PRICE MASTER COVERAGE');
  line(`   ${out.catalogue.priced} of ${out.catalogue.items} catalogue items priced (${out.catalogue.pricedPercent}%)`);
  line(`   ${out.catalogue.unpriced} have NO price — those lines are excluded, not zeroed.`);

  line();
  line('4. PER-CASE COST BY BAND (itemised special-needs lines, priced)');
  for (const b of out.bands) {
    line();
    line(`   ── ${b.magnitude} ──`);
    if (!b.cases) { line(`      ${b.note}`); continue; }
    line(`      cases with an itemised list: ${b.cases}   fully priced: ${b.casesFullyPriced}`);
    line(`      median lines per case: ${b.medianLines}   unpriced lines: ${b.unpricedLineShare}%`);
    if (!b.totalKobo) { line('      No fully-priced case in this band — no figure can be given.'); continue; }
    const t = b.totalKobo;
    line(`      total   min ${naira(t.min)}  p25 ${naira(t.p25)}  MEDIAN ${naira(t.median)}  p75 ${naira(t.p75)}  p90 ${naira(t.p90)}  max ${naira(t.max)}`);
    if (b.consumableKobo) line(`      of which consumables median ${naira(b.consumableKobo.median)}`);
    if (b.pharmacyKobo) line(`      of which pharmacy    median ${naira(b.pharmacyKobo.median)}`);
    if (b.commonestItems.length) {
      line(`      commonest items: ${b.commonestItems.slice(0, 6).map((i) => `${i.item} (${i.cases})`).join(', ')}`);
    }
  }

  line();
  line('5. DEPOSITS THE APP HAS ASKED FOR');
  line(`   ${out.depositsAsked.rows} deposit rows exist.`);
  for (const d of out.depositsAsked.byMagnitude) {
    line(`   ${String(d.magnitude).padEnd(18)} ${d.withAnAmount} with an amount` +
      (d.kobo ? `   median ${naira(d.kobo.median)}  range ${naira(d.kobo.min)}–${naira(d.kobo.max)}` : ''));
  }

  line();
  line('6. PACK LINES ON RECORD');
  line(`   consumables ${out.packLines.consumables}   pharmacy ${out.packLines.pharmacy}`);

  line();
  line('7. ANAESTHESIA TYPE');
  for (const r of out.anaesthesiaTypes.slice(0, 10)) line(`   ${String(r.type).padEnd(22)} ${r.cases}`);
  line();
}

main()
  .catch((e) => { console.error('deposit-band-report failed:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
