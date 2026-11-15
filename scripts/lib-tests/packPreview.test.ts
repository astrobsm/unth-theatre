/**
 * "Where do I view all the bundle packs for review, so as to ensure every
 * procedure has the right bundled pack?"
 *
 * The honest answer was nowhere, and the two screens anybody would try first
 * are both the wrong screen:
 *
 *   Surgical Packs   the 77 packs authored per subspecialty. What CAN be
 *                    applied, not what any given operation gets.
 *   Procedure Packs  the procedure-to-pack mapping. Every one of its 382 rows
 *                    is unconfirmed, and only confirmed rows are read at
 *                    booking, so that screen describes nothing that happens.
 *
 * For all 628 procedures this hospital has booked, the pack comes from the
 * composed standard, computed per case from the name and the magnitude. The
 * only way to see it was to book a case and look — a poor way to review 628
 * operations, and a worse way to catch the one that packed a cervical spine
 * like a cervix.
 *
 * What these tests hold is that the review screen shows what a BOOKING would
 * produce, not a second opinion about it. A preview that disagrees with the
 * thing it previews is worse than no preview: somebody signs off a pack that
 * is not the pack.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generatePacks } from '../../src/lib/packs/generate';
import { resolveBasePack } from '../../src/lib/baseConsumablePack';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const API = read('src/app/api/packs/preview/route.ts');
const PAGE = read('src/app/dashboard/admin/pack-preview/page.tsx');
const LAYOUT = read('src/app/dashboard/layout.tsx');
const BOOKING = read('src/app/api/surgeries/route.ts');

describe('the preview is the same computation as the booking', () => {
  it('uses the helpers the booking route uses, not a second implementation', () => {
    // Two ways of deciding what a procedure needs is how a reviewer approves
    // one pack and a theatre receives another.
    expect(API).toContain("from '@/lib/packs/generate'");
    expect(API).toContain("from '@/lib/baseConsumablePack'");
    expect(API).toContain("from '@/lib/packRequests'");
    expect(BOOKING).toContain("from '@/lib/packs/fallback'");
  });

  it('includes the mandatory base pack, which the booking adds separately', () => {
    // Leaving it out would show a shorter pack than the case actually gets,
    // and the reviewer would sign off something they had not seen.
    expect(API).toContain('resolveBasePack(magnitude)');
    expect(PAGE).toContain('...(preview?.base ?? []), ...(preview?.consumables ?? [])');
  });

  it('drops base-pack duplicates from the composed list, as the booking does', () => {
    expect(API).toContain('baseNames.has(String(c.name).trim().toLowerCase())');
  });

  it('says which of the two a booking would really use', () => {
    // An authored mapping overrides the composed standard, but only once
    // somebody has confirmed it. A reviewer has to know which they are reading.
    expect(API).toContain("source: mapped.consumables.length || mapped.drugs.length ? 'mapping' : 'composed'");
    expect(PAGE).toContain('A mapping has been authored for this procedure but nobody has');
  });

  it('writes nothing', () => {
    // It is a review screen. The route may read, and must not create, update
    // or delete anything.
    for (const verb of ['prisma.surgeryConsumableRequest.create', 'prisma.surgeryDrugDressingRequest.create',
      '.update(', '.delete(', '.createMany(', '.upsert(']) {
      expect(API, verb).not.toContain(verb);
    }
  });
});

describe('the magnitude is part of the answer', () => {
  it('changes the pack, which is why the screen makes it a control', () => {
    // The same operation at two sizes is two packs; reviewing one size says
    // nothing about the others.
    const minor = generatePacks({ procedureName: 'Exploratory laparotomy', magnitude: 'MINOR' });
    const major = generatePacks({ procedureName: 'Exploratory laparotomy', magnitude: 'MAJOR' });
    const gauze = (p: typeof minor) =>
      p.consumables.find((c) => c.name.toLowerCase().includes('gauze'))?.quantity ?? 0;
    expect(gauze(major)).toBeGreaterThan(gauze(minor));
    expect(resolveBasePack('MAJOR').length).toBeGreaterThan(0);
  });

  it('is a control on the page rather than a default nobody sees', () => {
    expect(PAGE).toContain("const [magnitude, setMagnitude] = useState('MAJOR')");
    expect(PAGE).toContain('MAGNITUDES.map');
    // And changing it re-asks, so the comparison is one click.
    expect(PAGE).toContain('if (chosen) void run(chosen, magnitude, subspecialty);');
  });
});

describe('what the reviewer is asked to judge', () => {
  it('leads with the family, because everything else follows from it', () => {
    // A wrong family is not a wrong line: it is a wrong pack, and the fix
    // belongs in the classifier rather than in the list.
    expect(PAGE).toContain('Read this line first.');
    expect(PAGE).toContain('the whole pack is wrong and the');
  });

  it('shows where every line came from', () => {
    // A reviewer has to be able to tell a composed line from an authored one.
    expect(API).toContain("source: [c.source, c.note].filter(Boolean).join(' — ') || null");
    expect(PAGE).toContain('{l.source}');
  });

  it('shows the warnings rather than resolving them quietly', () => {
    // Chief among them: no antibiotic dose is ever filled in for a child.
    expect(PAGE).toContain('preview.warnings.length > 0');
    expect(PAGE).toContain('The prescriber must settle these');
  });

  it('says plainly when a pharmacy list comes out empty', () => {
    // "Nothing requested" reads as "this operation needs no drugs", and for
    // most operations that is wrong rather than correct.
    expect(PAGE).toContain('For most operations that is wrong rather than correct');
  });

  it('takes a procedure that is not in the catalogue', () => {
    // Free-text bookings are exactly the ones most worth checking, and a
    // picker that only offers catalogued names cannot review them.
    expect(PAGE).toContain('A name that is not in the catalogue still works');
    expect(PAGE).toContain("if (e.key === 'Enter')");
  });
});

describe('it can be found', () => {
  it('is in the sidebar beside the two screens that do not answer the question', () => {
    // The roster chase was built, shipped and reported missing because it was
    // reachable only by typing its URL. Not again.
    expect(LAYOUT).toContain("href: '/dashboard/admin/pack-preview'");
    expect(LAYOUT).toContain("'/dashboard/admin/pack-preview',");
  });

  it('is offered to the pack providers and pharmacists too', () => {
    // They are the people who notice a pack is wrong. It is read-only, so
    // there is nothing to keep them away from.
    const providerBlock = LAYOUT.slice(LAYOUT.indexOf("['CONSUMABLE_PACK_PROVIDER', 'PHARMACIST']"));
    expect(providerBlock.slice(0, 900)).toContain('/dashboard/admin/pack-preview');
  });
});
