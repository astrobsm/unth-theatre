import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ANAESTHESIA_TYPES,
  ANAESTHESIA_TYPE_VALUES,
  ANAESTHESIA_TYPE_LABELS,
  ANAESTHESIA_PACK_TECHNIQUE,
} from '../../src/lib/anaesthesiaTypes';

/**
 * What the form offers, what the API accepts, and what the column can store must
 * be the same set.
 *
 * They were not. The review form offered eight techniques; the create and update
 * APIs each validated against a hand-written list of five. Choosing Epidural or
 * Combined Spinal-Epidural — both with anaesthesia packs seeded in the database —
 * failed validation with a 400 at the final step, and because the error banner
 * sits at the top of a seven-section form, the anaesthetist saw the review stop
 * for no visible reason. A fourth option, GENERAL_WITH_REGIONAL, existed in no
 * enum at all and could never have been saved.
 */

const REPO = path.join(__dirname, '..', '..');

/** The AnesthesiaType enum as the database actually defines it. */
function prismaAnaesthesiaEnum(): string[] {
  const schema = fs.readFileSync(path.join(REPO, 'prisma', 'schema.prisma'), 'utf8');
  const m = schema.match(/enum\s+AnesthesiaType\s*\{([\s\S]*?)\}/);
  if (!m) throw new Error('AnesthesiaType enum not found in schema.prisma');
  return m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
}

describe('anaesthesia techniques agree across form, API and database', () => {
  it('offers exactly the values the column can store', () => {
    // THE LOAD-BEARING TEST. Anything offered but not in the enum is a review
    // that will be rejected; anything in the enum but not offered is a technique
    // nobody can choose.
    expect([...ANAESTHESIA_TYPES].sort()).toEqual(prismaAnaesthesiaEnum().sort());
  });

  it('includes the techniques that used to be rejected', () => {
    expect(ANAESTHESIA_TYPES).toContain('EPIDURAL');
    expect(ANAESTHESIA_TYPES).toContain('COMBINED_SPINAL_EPIDURAL');
  });

  it('does not offer GENERAL_WITH_REGIONAL, which no enum has', () => {
    // Offering it produced a 400 on every review that chose it. If it is wanted
    // as a distinct value it needs a migration adding it to AnesthesiaType — at
    // which point the first test here starts failing until it is added above.
    expect(ANAESTHESIA_TYPES as readonly string[]).not.toContain('GENERAL_WITH_REGIONAL');
    expect(prismaAnaesthesiaEnum()).not.toContain('GENERAL_WITH_REGIONAL');
  });

  it('gives the zod tuple the same members as the list', () => {
    expect([...ANAESTHESIA_TYPE_VALUES].sort()).toEqual([...ANAESTHESIA_TYPES].sort());
    expect(ANAESTHESIA_TYPE_VALUES.length).toBeGreaterThan(0); // z.enum needs non-empty
  });

  it('has a label and a pack technique for every value', () => {
    // A missing label renders an empty dropdown row; a missing pack technique
    // stops the picker highlighting the packs for the chosen technique.
    for (const t of ANAESTHESIA_TYPES) {
      expect(ANAESTHESIA_TYPE_LABELS[t], `label for ${t}`).toBeTruthy();
      expect(ANAESTHESIA_PACK_TECHNIQUE[t], `pack technique for ${t}`).toBeTruthy();
    }
    expect(Object.keys(ANAESTHESIA_TYPE_LABELS).sort()).toEqual([...ANAESTHESIA_TYPES].sort());
    expect(Object.keys(ANAESTHESIA_PACK_TECHNIQUE).sort()).toEqual([...ANAESTHESIA_TYPES].sort());
  });
});

describe('nothing hard-codes its own copy of the list any more', () => {
  const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

  it('the create and update APIs validate against the shared list', () => {
    for (const p of [
      'src/app/api/preop-reviews/route.ts',
      'src/app/api/preop-reviews/[id]/route.ts',
    ]) {
      const src = read(p);
      expect(src, `${p} should import the shared list`).toContain('ANAESTHESIA_TYPE_VALUES');
      // The five-value list that caused this.
      expect(src, `${p} still has a hand-written enum`).not.toContain(
        "'GENERAL', 'SPINAL', 'LOCAL', 'REGIONAL', 'SEDATION'",
      );
    }
  });

  it('neither review form hard-codes technique options', () => {
    for (const p of [
      'src/app/dashboard/preop-reviews/new/page.tsx',
      'src/app/dashboard/preop-reviews/[id]/edit/page.tsx',
    ]) {
      const src = read(p);
      expect(src, `${p} should render from the shared list`).toContain('ANAESTHESIA_TYPES.map');
      expect(src, `${p} still hard-codes an option`).not.toContain('<option value="GENERAL">');
      expect(src, `${p} still offers the unstorable option`).not.toContain('GENERAL_WITH_REGIONAL');
    }
  });
});
