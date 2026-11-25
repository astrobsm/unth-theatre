/**
 * Emit the NHIA list as JSON, for the plain-node script on the server.
 *
 *   npx tsx scripts/maintenance/export-nhia-list.ts
 *
 * ONE COPY OF A CLINICAL LIST. apply-nhia-coverage.js runs under plain node
 * on the theatre server and cannot import TypeScript; keeping a second hand
 * copy of several hundred medicines in step with the first is a job nobody
 * would do twice. So the JSON is generated from the TypeScript and committed
 * beside it, and a test fails if the two drift apart.
 */
import fs from 'fs';
import path from 'path';

import { NHIA_PRICE_LIST, NHIA_LIST_VERSION, NHIA_LIST_SOURCE } from '../../src/lib/payer/nhiaPriceList';
import { NHIA_ALIASES } from '../../src/lib/payer/nhiaMatch';

export function buildExport() {
  return {
    version: NHIA_LIST_VERSION,
    source: NHIA_LIST_SOURCE,
    aliases: NHIA_ALIASES,
    items: NHIA_PRICE_LIST.map((i) => ({
      code: i.code,
      name: i.name,
      group: i.group,
      ...(i.form ? { form: i.form } : {}),
      ...(i.strength ? { strength: i.strength } : {}),
      ...(i.presentation ? { presentation: i.presentation } : {}),
      ...(i.price !== undefined ? { price: i.price } : {}),
      coverage: i.coverage,
    })),
  };
}

export const EXPORT_PATH = path.join(
  process.cwd(), 'scripts', 'maintenance', 'nhia-price-list.json',
);

if (require.main === module) {
  const out = buildExport();
  fs.writeFileSync(EXPORT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${out.items.length} items to ${path.relative(process.cwd(), EXPORT_PATH)}`);
}
