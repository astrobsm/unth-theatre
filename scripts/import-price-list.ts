/**
 * LOAD THE HOSPITAL'S PRICE LIST INTO THIS NODE'S CATALOGUE.
 *
 * The same thing the button in Settings -> "The hospital's consumable and
 * drug price list" does, run from a terminal, for the case the button cannot
 * cover: the theatre server's own Postgres, which is reachable from the node
 * itself and from nowhere else.
 *
 * IT CALLS THE ROUTE'S OWN FUNCTION. `importPriceList()` is imported, not
 * reimplemented, so this cannot drift away from what the button does. The
 * only thing this file decides is which database to open and whether to
 * write at all.
 *
 * WHY A PREVIEW BY DEFAULT. This sets what every patient is asked to
 * deposit. So it reports and exits unless told to write:
 *
 *     npx tsx scripts/import-price-list.ts                 # preview, no writes
 *     npx tsx scripts/import-price-list.ts --apply         # fill blanks
 *     npx tsx scripts/import-price-list.ts --apply --overwrite-prices
 *
 * FILLING BLANKS IS NOT OVERWRITING. By default an item with no price gets
 * one and an item somebody has already priced is left exactly as it is, with
 * the difference reported. --overwrite-prices replaces stored prices with the
 * list's, and is a deliberate second run after reading those differences --
 * a pharmacist's correction in the app is usually more current than a sheet
 * exported months earlier.
 *
 * WHICH DATABASE. Resolved through scripts/lib/nodeDatabase.js, the same
 * module `npm run build` migrates with, and PRINTED before anything is
 * written. The theatre server keeps two env files pointing at two different
 * databases; a run that silently addressed the wrong one is the failure worth
 * most effort to prevent.
 */

// require, not import: this module is CommonJS and shared with
// scripts/migrate-node-db.js, which `npm run build` runs as plain node.
const { describe: describeDb, resolveNodeDatabase } = require('./lib/nodeDatabase');

type Args = { apply: boolean; overwrite: boolean; by: string };

function parseArgs(argv: string[]): Args {
  const unknown = argv.filter(
    (a) => !['--apply', '--overwrite-prices', '--help', '-h'].includes(a) && !a.startsWith('--by='),
  );
  if (unknown.length) {
    console.error(`Unrecognised argument(s): ${unknown.join(' ')}`);
    console.error('Usage: npx tsx scripts/import-price-list.ts [--apply] [--overwrite-prices] [--by="Name"]');
    process.exit(2);
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: npx tsx scripts/import-price-list.ts [--apply] [--overwrite-prices] [--by="Name"]');
    process.exit(0);
  }

  const apply = argv.includes('--apply');
  const overwrite = argv.includes('--overwrite-prices');

  // Refused rather than ignored. Someone who typed --overwrite-prices meant
  // to change prices; silently previewing instead would read as "done".
  if (overwrite && !apply) {
    console.error('--overwrite-prices needs --apply as well. Nothing was written.');
    process.exit(2);
  }

  const byArg = argv.find((a) => a.startsWith('--by='));
  return { apply, overwrite, by: byArg ? byArg.slice('--by='.length) : 'UNTH price list (terminal)' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const resolved = resolveNodeDatabase();
  if (!resolved.url) {
    console.error('No DATABASE_URL anywhere. Nothing to import into.');
    process.exit(1);
  }

  // Set BEFORE the Prisma singleton is imported, which is why every app
  // module below is loaded with await import() rather than a static import.
  process.env.DATABASE_URL = resolved.url;
  if (resolved.isNodeLocal && resolved.directUrl) process.env.DIRECT_URL = resolved.directUrl;

  console.log('');
  console.log(`  database : ${describeDb(resolved.url)}`);
  console.log(`  taken from: ${resolved.source}`);
  console.log(`  mode     : ${args.apply ? (args.overwrite ? 'APPLY + OVERWRITE PRICES' : 'APPLY (fill blanks only)') : 'PREVIEW ONLY — nothing will be written'}`);
  console.log('');

  const { currentPriceListSummary, mergeSummary } = await import('../src/lib/specialNeeds/priceList');
  const summary = currentPriceListSummary();
  const merge = mergeSummary();

  console.log('  The list to be loaded (merged from both tariff sheets):');
  console.log(`    rows            : ${summary.total}`);
  console.log(`    carrying a price: ${summary.priced}`);
  console.log(`    no price yet    : ${summary.total - summary.priced}`);
  console.log(`    same item on both sheets: ${merge.matched2025}`);
  console.log(`    only on the 2026 sheet  : ${merge.newIn2026}`);
  console.log(`    newly priced by 2026    : ${merge.newlyPriced}`);
  console.log(`    repriced by 2026        : ${merge.repriced.length}`);
  console.log(`    blank on the 2026 sheet : ${merge.blankOn2026}`);
  console.log('');

  const { default: prisma } = await import('../src/lib/prisma');

  const before = {
    items: await prisma.specialNeedItem.count(),
    active: await prisma.specialNeedItem.count({ where: { isActive: true } }),
    unpriced: await prisma.specialNeedItem.count({ where: { isActive: true, unitPrice: null } }),
  };
  console.log('  The catalogue as it stands:');
  console.log(`    items        : ${before.items} (${before.active} active)`);
  console.log(`    without price: ${before.unpriced}`);
  console.log('');

  if (!args.apply) {
    console.log('  PREVIEW ONLY. Nothing was written. Re-run with --apply to load it.');
    await prisma.$disconnect();
    return;
  }

  const { importPriceList } = await import('../src/lib/specialNeeds/importPriceList');
  const result = await importPriceList({ overwritePrices: args.overwrite, byName: args.by });

  console.log('  Done:');
  console.log(`    items created          : ${result.added}`);
  console.log(`    already in the catalogue: ${result.alreadyPresent}`);
  console.log(`      of which matched only by spelling: ${result.matchedBySpelling}  (duplicates NOT created)`);
  console.log(`    prices filled in       : ${result.pricesSet}`);
  console.log(`      of which by equivalence (one price, several sizes): ${result.pricedByEquivalence}`);
  console.log(`    prices already agreeing: ${result.pricesAgreed}`);
  console.log(`    prices differing       : ${result.pricesDiffering}${args.overwrite ? '' : '  (LEFT ALONE)'}`);
  console.log(`    prices overwritten     : ${result.pricesOverwritten}`);
  console.log(`    rows with no price on the list: ${result.unpricedOnList}`);
  console.log(`    existing rows stamped with a list code: ${result.codesStamped}`);
  console.log('');

  if (result.differences.length) {
    console.log(`  ${result.differences.length} price(s) differ from the list${args.overwrite ? ' and were replaced' : ' and were NOT changed'}:`);
    result.differences.slice(0, 40).forEach((d) => {
      console.log(`    ${d.name}: stored ${d.currentPrice}, list ${d.listPrice}${d.pricedByName ? ` (priced by ${d.pricedByName})` : ''}`);
    });
    if (result.differences.length > 40) console.log(`    ... and ${result.differences.length - 40} more`);
    if (!args.overwrite) {
      console.log('  Re-run with --apply --overwrite-prices to take the list\'s figures instead.');
    }
    console.log('');
  }

  const after = {
    items: await prisma.specialNeedItem.count(),
    active: await prisma.specialNeedItem.count({ where: { isActive: true } }),
    unpriced: await prisma.specialNeedItem.count({ where: { isActive: true, unitPrice: null } }),
  };
  console.log('  The catalogue now:');
  console.log(`    items        : ${after.items} (${after.active} active)`);
  console.log(`    without price: ${after.unpriced}  (was ${before.unpriced})`);
  console.log('');
  console.log('  An item with no price is still offered, still bundled and still picked.');
  console.log('  What it changes is what the deposit SAYS: the quote names it and reports');
  console.log('  that the deposit is not the full amount.');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('');
  console.error('Import failed. Nothing that was already priced was changed.');
  console.error(err);
  process.exit(1);
});
