/**
 * A pack list in sections.
 *
 * Asked for: "the bundle pack list should be so organised in categories eg
 * sutures, infusions, so it will be easy for the users to open and edit after
 * booking, delete or add what is needed, and every modification reflects for
 * the case."
 *
 * A composed pack runs past forty lines. As one flat column, answering "did
 * anybody order sutures?" means reading all forty; the sections make a missing
 * one visible, because an absent heading is noticed where an absent line is
 * not.
 *
 * WHAT THESE TESTS ARE REALLY FOR. Grouping is a filter, and a filter is how a
 * line disappears. The category on a row is written by a booking form, by a
 * standards library whose vocabulary is wider than the enum, and by a backfill
 * script — so an unrecognised value is not hypothetical. A list that silently
 * drops a line it cannot classify is WORSE than an ungrouped one: the item was
 * ordered, somebody is counting on it, and nobody can see it is gone.
 *
 * So the central property, asserted several ways below: grouping conserves
 * lines. Every input comes out somewhere.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  CONSUMABLE_CATEGORY_LABEL,
  DRUG_TYPE_LABEL,
  CONSUMABLE_CATEGORY_ORDER,
  DRUG_TYPE_ORDER,
  CONSUMABLE_CATEGORY_OPTIONS,
  DRUG_TYPE_OPTIONS,
  groupConsumables,
  groupPharmacy,
  groupPackLines,
} from '../../src/lib/packs/labels';

const REPO = path.join(__dirname, '..', '..');
const SCHEMA = path.resolve(REPO, 'prisma', 'schema.prisma');
const EDITOR = fs.readFileSync(path.join(REPO, 'src/components/SurgeryPackEditor.tsx'), 'utf8');

/** The values an enum actually has, from the schema rather than from memory. */
function schemaEnum(name: string): string[] {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const header = `enum ${name} {`;
  const at = src.indexOf(header);
  if (at < 0) throw new Error(`enum ${name} not found in schema.prisma`);
  const bodyStart = at + header.length;
  const bodyEnd = src.indexOf('\n}', bodyStart);
  return src.slice(bodyStart, bodyEnd)
    .split('\n')
    .map((line) => {
      const comment = line.indexOf('//');
      return (comment >= 0 ? line.slice(0, comment) : line).trim();
    })
    .filter((line) => line.length > 0 && /^[A-Z_]+$/.test(line));
}

describe('every value the database can hold has a section', () => {
  it('labels every consumable category in the schema', () => {
    // Read from schema.prisma, not from the enums module, so that adding a
    // category to the database and forgetting it here fails HERE rather than
    // quietly tipping those rows into Other on a live theatre list.
    for (const v of schemaEnum('SurgicalConsumableCategory')) {
      expect(CONSUMABLE_CATEGORY_LABEL[v as keyof typeof CONSUMABLE_CATEGORY_LABEL], v).toBeTruthy();
      expect(CONSUMABLE_CATEGORY_ORDER, v).toContain(v);
    }
  });

  it('labels every drug type in the schema', () => {
    for (const v of schemaEnum('SurgicalDrugDressingType')) {
      expect(DRUG_TYPE_LABEL[v as keyof typeof DRUG_TYPE_LABEL], v).toBeTruthy();
      expect(DRUG_TYPE_ORDER, v).toContain(v);
    }
  });

  it('orders each value exactly once', () => {
    expect(new Set(CONSUMABLE_CATEGORY_ORDER).size).toBe(CONSUMABLE_CATEGORY_ORDER.length);
    expect(new Set(DRUG_TYPE_ORDER).size).toBe(DRUG_TYPE_ORDER.length);
  });

  it('ends both orders with the bucket', () => {
    // groupPackLines puts anything it cannot place in the LAST entry. If OTHER
    // stops being last, unrecognised lines start landing in whatever is —
    // sutures, say — which is worse than Other because it looks deliberate.
    expect(CONSUMABLE_CATEGORY_ORDER[CONSUMABLE_CATEGORY_ORDER.length - 1]).toBe('OTHER');
    expect(DRUG_TYPE_ORDER[DRUG_TYPE_ORDER.length - 1]).toBe('OTHER');
  });

  it('uses the words the theatre uses', () => {
    // The request named two sections by the words people say.
    expect(CONSUMABLE_CATEGORY_LABEL.SUTURES).toBe('Sutures');
    expect(DRUG_TYPE_LABEL.IV_FLUID).toMatch(/infusion/i);
    // And nothing is left reading like a column name.
    for (const label of Object.values(CONSUMABLE_CATEGORY_LABEL)) {
      expect(label).not.toMatch(/_/);
    }
    for (const label of Object.values(DRUG_TYPE_LABEL)) {
      expect(label).not.toMatch(/_/);
    }
  });
});

describe('grouping conserves lines', () => {
  const lines = [
    { id: '1', category: 'SUTURES' },
    { id: '2', category: 'GLOVES' },
    { id: '3', category: 'SUTURES' },
  ];

  it('keeps every line that has a known category', () => {
    const out = groupConsumables(lines);
    expect(out.flatMap((s) => s.lines)).toHaveLength(3);
  });

  it('keeps a line whose category is null, blank or unknown', () => {
    // All three happen: a row written before the column was filled, a free-text
    // line, and a value from the standards library the enum never had.
    const odd = [
      { id: 'a', category: null },
      { id: 'b', category: '' },
      { id: 'c', category: 'DRAINS' },
      { id: 'd' },
    ];
    const out = groupConsumables(odd as { category?: string | null }[]);
    const kept = out.flatMap((s) => s.lines);
    expect(kept).toHaveLength(4);
    // All of them under the bucket, and the bucket is last.
    expect(out[out.length - 1].key).toBe('OTHER');
  });

  it('matches a category whatever case it arrives in', () => {
    const out = groupConsumables([{ id: '1', category: 'sutures' }]);
    expect(out[0].key).toBe('SUTURES');
  });

  it('drops empty sections rather than printing fourteen headings', () => {
    const out = groupConsumables(lines);
    expect(out.map((s) => s.key)).toEqual(['GLOVES', 'SUTURES']);
  });

  it('keeps the order within a section', () => {
    const out = groupConsumables(lines);
    const sutures = out.find((s) => s.key === 'SUTURES');
    expect(sutures?.lines.map((l: { id: string }) => l.id)).toEqual(['1', '3']);
  });

  it('groups a pharmacy list on its own column', () => {
    const out = groupPharmacy([
      { id: '1', type: 'IV_FLUID' },
      { id: '2', type: 'ANTIBIOTIC' },
    ]);
    // Antibiotics are read first, infusions after.
    expect(out.map((s) => s.key)).toEqual(['ANTIBIOTIC', 'IV_FLUID']);
    expect(out[1].label).toMatch(/infusion/i);
  });

  it('returns nothing for nothing, rather than an empty Other', () => {
    expect(groupConsumables([])).toEqual([]);
  });

  it('conserves lines for any mixture at all', () => {
    // The property, stated directly: whatever goes in comes out.
    const messy = ['SUTURES', null, 'nonsense', '', 'GLOVES', 'PPE', 'DRAINS', undefined]
      .map((category, i) => ({ id: String(i), category }));
    const out = groupPackLines(
      messy,
      (l) => l.category,
      CONSUMABLE_CATEGORY_ORDER,
      (k) => k,
    );
    expect(out.flatMap((s) => s.lines)).toHaveLength(messy.length);
    expect(new Set(out.flatMap((s) => s.lines.map((l) => l.id))).size).toBe(messy.length);
  });
});

describe('the editor on the case page', () => {
  it('renders both lists in sections', () => {
    expect(EDITOR).toContain('groupConsumables(consumables)');
    expect(EDITOR).toContain('groupPharmacy(pharmacy)');
  });

  it('reads the category off the row it was always sent', () => {
    // The GET returns whole rows, so category and type were on the wire all
    // along — the interface simply did not declare them and the list showed
    // one flat column.
    expect(EDITOR).toContain('category?: string | null;');
    expect(EDITOR).toContain('type?: string | null;');
  });

  it('asks which section a new item belongs in', () => {
    // The API defaults a missing category to OTHER. Without this control every
    // added item lands in Other, and the flat column comes back one heading at
    // a time.
    expect(EDITOR).toContain('CONSUMABLE_CATEGORY_OPTIONS');
    expect(EDITOR).toContain('DRUG_TYPE_OPTIONS');
    expect(EDITOR).toContain("...(a.list === 'CONSUMABLE' ? { category: a.group } : { type: a.group }),");
  });

  it('opens its sections rather than hiding the list behind clicks', () => {
    // `collapsed` is keyed by section and absent means open, so the default
    // state of a freshly loaded pack is every section visible. The question
    // this screen answers most often is "what is on the list".
    expect(EDITOR).toContain('const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});');
    expect(EDITOR).toContain('const shut = !!collapsed[id];');
  });

  it('says on a shut section that something was withdrawn from it', () => {
    // Otherwise closing a section hides the one fact that most needs seeing.
    expect(EDITOR).toContain('withdrawn');
    expect(EDITOR).toMatch(/\{withdrawn\} withdrawn/);
  });

  it('still requires a reason for every change', () => {
    // Unchanged by this work, and asserted because it is the thing a grouping
    // refactor could quietly drop.
    expect(EDITOR).toContain('MIN_PACK_REASON');
    expect(EDITOR).toContain('readyToSend');
  });
});
