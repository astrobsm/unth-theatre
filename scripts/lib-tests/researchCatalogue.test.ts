// The research catalogue, and the one failure mode that would take the whole
// module down in production rather than in a test.
//
// THE INCLUDE TREE IS NOT TYPE-CHECKED BY TYPESCRIPT. It is written `as const`
// and handed to Prisma at runtime, so a mistyped column name compiles cleanly,
// passes review, and then returns a 500 the first time anybody opens the page.
// This test reads prisma/schema.prisma and resolves every selected field
// against the model it is selected from, which is the only check that exists.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RESEARCH_VARIABLES, RESEARCH_VARIABLE_COUNT, RESEARCH_DOMAINS,
  variable, variablesIn, variablesOfKind, catalogueForClient, readCase,
} from '../../src/lib/research/variables';
import { RESEARCH_INCLUDE } from '../../src/lib/research/include';

const root = path.join(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');

/**
 * Every model in the schema, as a map of field name to declared type.
 *
 * Scanned line by line rather than with a regex. A regex over this file has
 * to be written with escaped braces and character classes, and a heredoc or
 * an editor that eats one backslash turns it into a pattern that matches
 * nothing and a test that passes by finding no fields at all -- which is the
 * worst possible failure for a test whose whole job is to find bad fields.
 */
function parseSchema(src: string): Map<string, Map<string, string>> {
  const models = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('model ') && line.endsWith('{')) {
      const name = line.slice('model '.length, -1).trim();
      current = new Map();
      models.set(name, current);
      continue;
    }
    if (line === '}') { current = null; continue; }
    if (!current || !line || line.startsWith('//') || line.startsWith('@@')) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && !parts[0].startsWith('@')) {
      current.set(parts[0], parts[1]);
    }
  }
  return models;
}

const MODELS = parseSchema(schema);

/** The field names declared on one Prisma model. */
const fieldsOf = (model: string): Set<string> =>
  new Set(Array.from(MODELS.get(model)?.keys() ?? []));

/** The model a relation field points at, with list and optional markers off. */
function relationTarget(model: string, relation: string): string | null {
  const type = MODELS.get(model)?.get(relation);
  if (!type) return null;
  const bare = type.replace(/[\[\]?]/g, '');
  return MODELS.has(bare) ? bare : null;
}

describe('the catalogue holds together', () => {
  it('carries a substantial number of variables', () => {
    // The module it replaces offered four numeric variables and nine
    // categorical ones against a record carrying several hundred fields.
    expect(RESEARCH_VARIABLE_COUNT).toBeGreaterThan(150);
    expect(RESEARCH_VARIABLES).toHaveLength(RESEARCH_VARIABLE_COUNT);
  });

  it('has no duplicate keys', () => {
    const keys = RESEARCH_VARIABLES.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every variable a label, a help line and a source', () => {
    RESEARCH_VARIABLES.forEach((v) => {
      expect(v.label.trim().length).toBeGreaterThan(2);
      // A variable whose provenance cannot be stated is one no reviewer
      // should accept, so the source is not optional.
      expect(v.source.trim().length).toBeGreaterThan(3);
      expect(v.help.trim().length).toBeGreaterThan(15);
    });
  });

  it('files every variable in a domain the picker lists', () => {
    const known = new Set(RESEARCH_DOMAINS.map((d) => d.key));
    RESEARCH_VARIABLES.forEach((v) => expect(known.has(v.domain)).toBe(true));
  });

  it('covers every stage of the journey, not just the easy end', () => {
    // A module that is rich on booking and empty on recovery answers only
    // the questions that were easy to collect.
    RESEARCH_DOMAINS.forEach((d) => {
      expect(variablesIn(d.key).length).toBeGreaterThan(0);
    });
  });

  it('offers numeric and categorical variables in every usable quantity', () => {
    expect(variablesOfKind('numeric').length).toBeGreaterThan(40);
    expect(variablesOfKind('categorical').length).toBeGreaterThan(30);
    expect(variablesOfKind('boolean').length).toBeGreaterThan(40);
  });

  it('finds a variable by key and refuses one that does not exist', () => {
    expect(variable('ageYears')?.label).toBe('Age');
    expect(variable('no-such-variable')).toBeNull();
  });
});

describe('the include tree resolves against the real schema', () => {
  // Every relation selected off Surgery, and the model it points at.
  const relations = Object.keys(RESEARCH_INCLUDE);

  it('selects only relations that exist on Surgery', () => {
    const surgeryFields = fieldsOf('Surgery');
    relations.forEach((r) => {
      expect(surgeryFields.has(r), `Surgery has no relation "${r}"`).toBe(true);
    });
  });

  it('selects only columns that exist on each related model', () => {
    const problems: string[] = [];
    relations.forEach((relation) => {
      const target = relationTarget('Surgery', relation);
      if (!target) { problems.push(`Surgery.${relation}: cannot resolve target model`); return; }
      const fields = fieldsOf(target);
      if (fields.size === 0) { problems.push(`model ${target} not found in schema`); return; }
      const node = (RESEARCH_INCLUDE as Record<string, { select?: Record<string, unknown> }>)[relation];
      const select = node?.select ?? {};
      Object.entries(select).forEach(([field, value]) => {
        if (!fields.has(field)) {
          problems.push(`${target}.${field} (selected via Surgery.${relation})`);
          return;
        }
        // A nested select: resolve it one level further.
        if (value && typeof value === 'object') {
          const nestedTarget = relationTarget(target, field);
          const nestedSelect = (value as { select?: Record<string, unknown> }).select ?? {};
          if (nestedTarget) {
            const nestedFields = fieldsOf(nestedTarget);
            Object.keys(nestedSelect).forEach((nf) => {
              if (!nestedFields.has(nf)) {
                problems.push(`${nestedTarget}.${nf} (via ${target}.${field})`);
              }
            });
          }
        }
      });
    });
    // Named one by one: "the include tree is wrong" is not something anybody
    // can act on at two in the morning.
    expect(problems, `Fields that do not exist:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  it('does not load anything that identifies a patient', () => {
    // The research module exports anonymised data. A column that is never
    // loaded cannot leak, and this is the check that keeps it that way.
    const patientSelect = Object.keys(RESEARCH_INCLUDE.patient.select);
    ['name', 'folderNumber', 'ptNumber', 'phoneNumber', 'caregiverName', 'caregiverPhone']
      .forEach((forbidden) => {
        expect(patientSelect, `patient.${forbidden} must not be loaded`).not.toContain(forbidden);
      });
  });
});
