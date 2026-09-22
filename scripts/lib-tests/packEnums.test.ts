/**
 * Every value the standards emit must be one the database accepts.
 *
 * This test exists because of a live 500. The standard pack library describes
 * items the way a theatre does — blades, swabs, drains, haemostatics — and the
 * schema stores a narrower enum written years earlier. Handing Prisma an
 * unrecognised enum value is not a soft failure: it rejects the whole insert,
 * so pressing "Request standard packs" returned "The packs could not be
 * generated" and nothing was saved.
 *
 * Nothing in the type system catches it. The rows reach Prisma as `any`, the
 * value is a plain string, and it only fails at the database — in production,
 * on a real case, in front of a surgeon.
 *
 * So both enums are read out of schema.prisma here, and every category and drug
 * type the library can produce is put through the mapper and checked against
 * them. Adding a new item with a new category is fine; adding one the mapper
 * does not know, and that does not fall back, is not.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  toConsumableCategory, toDrugType, CONSUMABLE_CATEGORIES, DRUG_TYPES,
} from '../../src/lib/packs/enums';
import { APPROACH_ITEMS, FAMILY_ITEMS, THEATRE_PHARMACY } from '../../src/lib/packs/standards';
import { generatePacks } from '../../src/lib/packs/generate';

const SCHEMA = path.resolve(__dirname, '..', '..', 'prisma', 'schema.prisma');

/** The values an enum actually has, from the schema rather than from memory. */
function schemaEnum(name: string): string[] {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const header = `enum ${name} {`;
  const at = src.indexOf(header);
  if (at < 0) throw new Error(`enum ${name} not found in schema.prisma`);

  const bodyStart = at + header.length;
  const bodyEnd = src.indexOf('\n}', bodyStart);
  if (bodyEnd < 0) throw new Error(`enum ${name} is not closed in schema.prisma`);

  return src.slice(bodyStart, bodyEnd)
    .split('\n')
    .map((line) => {
      const comment = line.indexOf('//');
      return (comment >= 0 ? line.slice(0, comment) : line).trim();
    })
    .filter((line) => line.length > 0 && /^[A-Z_]+$/.test(line));
}

describe('the enum lists here match the schema', () => {
  it('has the same consumable categories the database has', () => {
    expect([...CONSUMABLE_CATEGORIES].sort())
      .toEqual(schemaEnum('SurgicalConsumableCategory').sort());
  });

  it('has the same drug types the database has', () => {
    expect([...DRUG_TYPES].sort()).toEqual(schemaEnum('SurgicalDrugDressingType').sort());
  });
});

describe('every value the standards emit survives the mapper', () => {
  const dbCategories = schemaEnum('SurgicalConsumableCategory');
  const dbTypes = schemaEnum('SurgicalDrugDressingType');

  it('maps every category used anywhere in the library', () => {
    const used = new Set<string>();
    Object.values(APPROACH_ITEMS).flat().forEach((i) => used.add(i.category));
    Object.values(FAMILY_ITEMS).forEach((list) => (list ?? []).forEach((i) => used.add(i.category)));
    THEATRE_PHARMACY.forEach((i) => used.add(i.category));
    // Sutures are added by the generator rather than the tables.
    used.add('SUTURES');

    expect(used.size).toBeGreaterThan(8);
    used.forEach((c) => expect(dbCategories).toContain(toConsumableCategory(c)));
  });

  it('maps every category and type a generated pack actually carries', () => {
    // The end-to-end check: whatever a real case produces must be insertable.
    const cases = [
      { procedureName: 'Exploratory laparotomy', subspecialty: 'General Surgery' },
      { procedureName: 'Emergency caesarean section', subspecialty: 'Obstetrics & Gynaecology' },
      { procedureName: 'Total hip arthroplasty', subspecialty: 'Orthopaedics' },
      { procedureName: 'Craniotomy for evacuation of haematoma', subspecialty: 'Neurosurgery' },
      { procedureName: 'TURP', subspecialty: 'Urology' },
      { procedureName: 'Cataract extraction with IOL', subspecialty: 'Ophthalmology' },
      { procedureName: 'Oro-cutaneous fistula reconstruction using pectoralis major pedicle flap', subspecialty: 'Maxillofacial Surgery' },
      { procedureName: 'Laparoscopic cholecystectomy', subspecialty: 'General Surgery' },
      { procedureName: 'Coronary artery bypass graft', subspecialty: 'Cardiothoracic Surgery' },
      { procedureName: 'Split skin graft to leg', subspecialty: 'Plastic Surgery' },
      { procedureName: 'Tonsillectomy', subspecialty: 'ENT (Otorhinolaryngology)' },
    ];

    for (const c of cases) {
      for (const magnitude of ['MINOR', 'INTERMEDIATE', 'MAJOR']) {
        const p = generatePacks({ ...c, magnitude });
        p.consumables.forEach((i) => {
          expect(dbCategories).toContain(toConsumableCategory(i.category));
        });
        p.pharmacy.forEach((i) => {
          expect(dbTypes).toContain(toDrugType(i.drugType ?? i.category));
        });
      }
    }
  });

  it('never returns something outside the enum, whatever it is given', () => {
    // The fallback is what stops an unknown value taking down the whole insert.
    for (const junk of ['', null, undefined, 'NOT_A_CATEGORY', '  gloves  ', 'Gloves']) {
      expect(dbCategories).toContain(toConsumableCategory(junk as string));
      expect(dbTypes).toContain(toDrugType(junk as string));
    }
  });

  it('translates rather than flattening where the schema has an equivalent', () => {
    // Losing the distinction between a drain and a catheter on the pack a
    // provider reads would be the lazy fix.
    expect(toConsumableCategory('TUBES_CATHETERS')).toBe('CATHETERS_TUBING');
    expect(toConsumableCategory('DRAINS')).toBe('CATHETERS_TUBING');
    expect(toConsumableCategory('DRESSINGS')).toBe('STERILE_DRESSINGS');
    expect(toConsumableCategory('GAUZE_SWABS')).toBe('DRESSING_PACKS');
    expect(toDrugType('LOCAL_ANAESTHETIC')).toBe('ANAESTHETIC_ADJUNCT');
    // And passes through what is already right.
    expect(toConsumableCategory('SUTURES')).toBe('SUTURES');
    expect(toDrugType('ANTIBIOTIC')).toBe('ANTIBIOTIC');
  });
});

describe('the route that writes the packs', () => {
  const ROUTE = path.resolve(
    __dirname, '..', '..', 'src', 'app', 'api', 'surgeries', '[id]', 'pack', 'generate', 'route.ts',
  );

  it('maps fields explicitly instead of spreading rows into Prisma', () => {
    // THE regression guard. The mapper above cannot catch this on its own,
    // because it is only protective if it is actually called. The original 500
    // was a spread — `...c` — carrying the library's own field names and
    // category values straight into createMany, where Prisma rejected the
    // whole insert rather than ignoring the extras.
    const src = fs.readFileSync(ROUTE, 'utf8');

    const createManyBlocks = src.split('createMany(').slice(1);
    expect(createManyBlocks.length).toBe(2);

    for (const block of createManyBlocks) {
      const body = block.slice(0, block.indexOf('});'));
      expect(body).not.toMatch(/\.\.\.[cd]/);
    }

    // And the mapper is the thing producing the enum values.
    expect(src).toMatch(/toConsumableCategory\(/);
    expect(src).toMatch(/toDrugType\(/);
  });
});
