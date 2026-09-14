/**
 * Does the form's idea of a field match the database's?
 *
 * The operation note form is generated from CORE_SECTIONS. Every field there
 * that is not marked `extra` is saved into a COLUMN OF THE SAME NAME on
 * post_op_notes, and nothing enforces that at compile time — the payload parser
 * builds its whitelist from the template, so an invented key sails through
 * TypeScript and fails at runtime, on the surgeon's machine, at the end of a
 * list, with the note unsaved.
 *
 * That is the exact failure this file exists to make impossible. Adding a field
 * to a core section now forces a choice: give it a column in the migration, or
 * mark it `extra` and let it live in the extras document. Either is fine.
 * Silently doing neither is not.
 *
 * It reads schema.prisma rather than importing the generated client, so it
 * stays true whether or not `prisma generate` has been run — and so a developer
 * who has only edited the schema still sees the failure.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { CORE_SECTIONS, PROCEDURE_TEMPLATES, resolveTemplate, allFields } from '../../src/lib/postop/templates';
import { CATALOGUES } from '../../src/lib/postop/vocabulary';

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');

/** The scalar field names declared on a model. */
function modelFields(name: string): string[] {
  const block = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(SCHEMA);
  if (!block) throw new Error(`model ${name} not found in schema.prisma`);
  return block[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('/') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0]);
}

const NOTE_COLUMNS = modelFields('PostOpNote');

describe('the core note fields all have somewhere to be stored', () => {
  it('gives every core field a column on PostOpNote', () => {
    const missing = CORE_SECTIONS
      .filter((s) => !s.repeat)
      .flatMap((s) => s.fields)
      .filter((f) => !f.extra)
      .map((f) => f.key)
      .filter((key) => !NOTE_COLUMNS.includes(key));

    expect(missing).toEqual([]);
  });

  it('gives every repeating-section field a column on its child model', () => {
    const models: Record<string, string> = {
      prepSteps: 'PostOpPrepStep',
      drains: 'PostOpDrain',
      specimens: 'PostOpSpecimen',
      heldMedications: 'PostOpHeldMedication',
    };

    const missing: string[] = [];
    for (const section of CORE_SECTIONS) {
      if (!section.repeat) continue;
      const columns = modelFields(models[section.repeat]);
      for (const f of section.fields) {
        if (!f.extra && !columns.includes(f.key)) missing.push(`${section.repeat}.${f.key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('procedure templates stay out of the schema', () => {
  it('marks every field a procedure template adds as an extra', () => {
    // A template field with a column would mean adding a template requires a
    // migration on two databases, which is the thing the design exists to
    // avoid. If one of these really is asked of every operation, promote it
    // into CORE_SECTIONS and give it a column — do not quietly un-mark it.
    const leaked: string[] = [];
    for (const t of PROCEDURE_TEMPLATES) {
      for (const s of t.sections ?? []) {
        for (const f of s.fields) {
          if (!f.extra) leaked.push(`${t.key}.${f.key}`);
        }
      }
      for (const fields of Object.values(t.extend ?? {})) {
        for (const f of fields) {
          if (!f.extra) leaked.push(`${t.key}.${f.key}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });

  it('does not let a template field collide with a core column', () => {
    // Two fields with one key would overwrite each other: the core one into a
    // column, the template one into extras, and noteToValues would then let
    // extras win on read while the column held something else.
    const core = new Set(
      CORE_SECTIONS.flatMap((s) => s.fields).map((f) => f.key),
    );
    const collisions: string[] = [];
    for (const t of PROCEDURE_TEMPLATES) {
      for (const s of t.sections ?? []) {
        for (const f of s.fields) {
          if (core.has(f.key)) collisions.push(`${t.key}.${f.key}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('every field points at a catalogue that exists', () => {
  it('names a real catalogue on every single- and multi-select', () => {
    const templates = [null, ...PROCEDURE_TEMPLATES].map((t) => resolveTemplate(t));
    const bad: string[] = [];
    for (const resolved of templates) {
      for (const f of allFields(resolved)) {
        if (f.kind !== 'single' && f.kind !== 'multi') continue;
        if (!f.catalogue) { bad.push(`${resolved.key}.${f.key}: no catalogue`); continue; }
        if (!CATALOGUES[f.catalogue]) bad.push(`${resolved.key}.${f.key}: ${f.catalogue}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps every catalogue value unique within its list', () => {
    // A duplicated value makes one option unselectable and quietly merges two
    // answers into one in every count afterwards.
    const dupes: string[] = [];
    for (const [name, options] of Object.entries(CATALOGUES)) {
      const seen = new Set<string>();
      for (const o of options) {
        if (seen.has(o.value)) dupes.push(`${name}.${o.value}`);
        seen.add(o.value);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('uses the same wound classes the infection-surveillance module does', () => {
    // A note seeds an SSI surveillance record with this value. If the two lists
    // ever diverge, that hand-off starts failing on a foreign enum value.
    const enumBlock = /enum WoundClass \{([\s\S]*?)\n\}/.exec(SCHEMA);
    expect(enumBlock).toBeTruthy();
    const schemaValues = enumBlock![1]
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
    const ours = CATALOGUES.WOUND_CLASSES.map((o) => o.value);
    expect(ours.slice().sort()).toEqual(schemaValues.slice().sort());
  });
});

describe('the sync layer knows about the new tables', () => {
  it('classifies all five, and enables capture for each', () => {
    // syncCapture.test.ts already proves policy and triggers agree in general.
    // This is the narrower claim that these particular tables were not missed,
    // since a clinical table that replicates on one node only is the failure
    // this repo has already had three times.
    const policy = fs.readFileSync(path.join(ROOT, 'src/lib/sync/syncPolicy.ts'), 'utf8');
    const migration = fs.readFileSync(
      path.join(ROOT, 'prisma/migrations/20260914120000_structured_post_op_notes/migration.sql'),
      'utf8',
    );
    const tables = [
      'post_op_notes', 'post_op_prep_steps', 'post_op_drains',
      'post_op_specimens', 'post_op_held_medications',
    ];
    for (const t of tables) {
      expect(policy).toContain(`table: '${t}'`);
      expect(migration).toContain(`sync_enable_table('${t}')`);
    }
  });
});
