/**
 * Which tables replicate, and which silently do not.
 *
 * Three incidents now have had the same shape: a table absent from the sync
 * policy, so a row created on one node is invisible on the other. The emergency
 * board on 27 August. Patient call-ups and the holding area on 1 September —
 * a patient admitted on one node and simply not there on the other, which is
 * the worst version of this because the nurse concludes the app is broken and
 * goes back to paper.
 *
 * Guessing table by table is how the first two were missed. This lists every
 * table in the schema, every table in the policy, and the difference.
 *
 * IT ALSO CHECKS FOR AN `id` COLUMN, which is not cosmetic: the capture trigger
 * takes row_id from to_jsonb(NEW)->>'id'. A table keyed on something else gets
 * a NULL row_id and every INSERT fails — that is exactly what breaks
 * idempotency_keys today. Enabling capture on such a table would take the
 * feature down rather than sync it.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(REPO, 'prisma', 'schema.prisma'), 'utf8');
const policy = fs.readFileSync(path.join(REPO, 'src', 'lib', 'sync', 'syncPolicy.ts'), 'utf8');

// model Foo { ... @@map("foo_table") ... }
const models = [];
const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
let m;
while ((m = modelRe.exec(schema))) {
  const [, name, body] = m;
  const mapped = body.match(/@@map\("([^"]+)"\)/);
  const table = mapped ? mapped[1] : name;
  const hasId = /^\s*id\s+\w/m.test(body);
  const hasSyncCols = /syncVersion/.test(body);
  models.push({ name, table, hasId, hasSyncCols });
}

// { table: 'foo', cls: 'LWW', ... }
const inPolicy = new Set();
const polRe = /\{\s*table:\s*'([^']+)'/g;
while ((m = polRe.exec(policy))) inPolicy.add(m[1]);

const missing = models.filter((x) => !inPolicy.has(x.table));
const covered = models.filter((x) => inPolicy.has(x.table));

console.log(`models in schema : ${models.length}`);
console.log(`tables in policy : ${inPolicy.size}`);
console.log(`covered          : ${covered.length}`);
console.log(`NOT covered      : ${missing.length}`);
console.log();

const unsafe = missing.filter((x) => !x.hasId);
const safe = missing.filter((x) => x.hasId);

console.log('=== UNSAFE to enable: no `id` column, capture trigger would fail ===');
if (!unsafe.length) console.log('  (none)');
for (const x of unsafe) console.log(`  ${x.table.padEnd(42)} (model ${x.name})`);
console.log();

console.log('=== Not replicated, but has an id so it could be ===');
for (const x of safe) {
  console.log(`  ${x.table.padEnd(42)} ${x.hasSyncCols ? 'sync cols declared' : ''}`);
}
