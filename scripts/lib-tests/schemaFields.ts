// A reader for prisma/schema.prisma, shared by the tests that check an
// include tree against it.
//
// Scanned line by line rather than with a regex, deliberately. A regex over
// this file needs escaped braces and character classes, and one swallowed
// backslash turns it into a pattern that matches nothing - which makes the
// test pass by finding no fields at all. For a test whose whole job is to
// find bad field names, that is the worst failure available.
import fs from 'fs';
import path from 'path';

const SCHEMA = fs.readFileSync(
  path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8',
);

function parse(src: string): Map<string, Map<string, string>> {
  const models = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('model ') && line.endsWith('{')) {
      current = new Map();
      models.set(line.slice('model '.length, -1).trim(), current);
      continue;
    }
    if (line === '}') { current = null; continue; }
    if (!current || !line || line.startsWith('//') || line.startsWith('@@')) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && !parts[0].startsWith('@')) current.set(parts[0], parts[1]);
  }
  return models;
}

export const MODELS = parse(SCHEMA);

export const fieldsOf = (model: string): Set<string> =>
  new Set(Array.from(MODELS.get(model)?.keys() ?? []));

export function relationTarget(model: string, relation: string): string | null {
  const type = MODELS.get(model)?.get(relation);
  if (!type) return null;
  const bare = type.replace(/[[\]?]/g, '');
  return MODELS.has(bare) ? bare : null;
}

/**
 * Every field an include tree selects that the schema does not declare.
 *
 * Returns them named one by one: "the include tree is wrong" is not something
 * anybody can act on at two in the morning.
 */
export function badFields(
  rootModel: string,
  include: Record<string, unknown>,
): string[] {
  const problems: string[] = [];
  const rootFields = fieldsOf(rootModel);

  Object.entries(include).forEach(([relation, node]) => {
    if (!rootFields.has(relation)) {
      problems.push(`${rootModel} has no relation "${relation}"`);
      return;
    }
    const target = relationTarget(rootModel, relation);
    if (!target) { problems.push(`${rootModel}.${relation}: cannot resolve target model`); return; }
    const select = (node as { select?: Record<string, unknown> })?.select ?? {};
    const fields = fieldsOf(target);
    Object.entries(select).forEach(([field, value]) => {
      if (!fields.has(field)) {
        problems.push(`${target}.${field} (via ${rootModel}.${relation})`);
        return;
      }
      if (value && typeof value === 'object') {
        const nested = relationTarget(target, field);
        if (!nested) return;
        const nestedFields = fieldsOf(nested);
        const nestedSelect = (value as { select?: Record<string, unknown> }).select ?? {};
        Object.keys(nestedSelect).forEach((nf) => {
          if (!nestedFields.has(nf)) problems.push(`${nested}.${nf} (via ${target}.${field})`);
        });
      }
    });
  });

  return problems;
}
