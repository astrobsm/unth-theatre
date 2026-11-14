/**
 * The pack a case is booked with.
 *
 * Reported from the ward: "booked cases still have this old bundle instead of
 * the new one which the app is supposed to pick up once the procedure and the
 * complexity is selected during booking."
 *
 * WHAT WAS ACTUALLY WRONG. Three layers decide a case's pack and only one was
 * firing at booking:
 *
 *   1. The mandatory base pack, scaled to magnitude. Always attached, and it
 *      was working — the reported screenshot showed the INTERMEDIATE column of
 *      baseConsumablePack exactly (7 gowns, 3 non-sterile, 25 gloves, 5
 *      goggles).
 *   2. The confirmed procedure mapping. buildPackRequests reads only
 *      ProcedurePackMap rows a person has CONFIRMED, which is right: a
 *      name-match suggestion must never reach a theatre trolley on its own.
 *      Unconfirmed, it contributes nothing.
 *   3. The composed standard (fallbackPacks) for the procedures nobody has
 *      mapped — which is most of 588 catalogued procedures.
 *
 * The REGENERATE route called all three. BOOKING called only 1 and 2, and
 * emergency booking called only 1. So the pack a case ended up with depended
 * on whether somebody later found the Packs button on the list, and an
 * emergency — the case with the least time to prepare — got the least specific
 * pack of all.
 *
 * These tests hold the wiring. The clinical content of the generator is tested
 * in packGeneration.test.ts; what is asserted here is that both booking routes
 * reach it, in the right order, and that it stays a FLOOR rather than an
 * override.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fallbackPacks } from '../../src/lib/packs/fallback';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const BOOKING = read('src/app/api/surgeries/route.ts');
const EMERGENCY = read('src/app/api/emergency-booking/route.ts');
const GENERATE = read('src/app/api/surgeries/[id]/pack/generate/route.ts');

const base = {
  procedureName: 'Exploratory laparotomy',
  subspecialty: 'General Surgery',
  magnitude: 'MAJOR',
  surgeryType: 'ELECTIVE',
  patientAge: 40,
  patientAgeUnit: 'YEARS',
};

describe('the composed standard is a floor, not an override', () => {
  it('stays out of the way when both lists already have lines', () => {
    // A pack a surgeon applied, or a mapping a consultant confirmed, is the
    // clinical decision. This must never touch it.
    const r = fallbackPacks({ ...base, haveConsumables: 12, haveDrugs: 3 });
    expect(r.generated).toBe(false);
    expect(r.consumables).toHaveLength(0);
    expect(r.drugs).toHaveLength(0);
  });

  it('fills only the side that is empty', () => {
    // The common case, and the one that was reported: an authored consumable
    // pack and no pharmacy pack at all.
    const r = fallbackPacks({ ...base, haveConsumables: 12, haveDrugs: 0 });
    expect(r.consumables).toHaveLength(0);
    expect(r.drugs.length).toBeGreaterThan(0);
  });

  it('fills both when nothing at all was supplied', () => {
    const r = fallbackPacks({ ...base, haveConsumables: 0, haveDrugs: 0 });
    expect(r.generated).toBe(true);
    expect(r.consumables.length).toBeGreaterThan(0);
    expect(r.drugs.length).toBeGreaterThan(0);
  });

  it('answers to the complexity, not only to the procedure', () => {
    // "based on the planned procedure AND the complexity" — both arguments
    // reach the generator, so a minor case is not packed like a major one.
    const minor = fallbackPacks({ ...base, magnitude: 'MINOR', haveConsumables: 0, haveDrugs: 0 });
    const major = fallbackPacks({ ...base, magnitude: 'MAJOR', haveConsumables: 0, haveDrugs: 0 });
    const qty = (r: typeof minor, name: string) =>
      r.consumables.find((c) => c.name.toLowerCase().includes(name))?.quantity ?? 0;
    expect(qty(major, 'gauze')).toBeGreaterThan(qty(minor, 'gauze'));
  });

  it('says nothing rather than guessing when there is no procedure', () => {
    const r = fallbackPacks({ ...base, procedureName: '  ', haveConsumables: 0, haveDrugs: 0 });
    expect(r.generated).toBe(false);
  });

  it('carries the provenance of every line it composes', () => {
    // A pack provider reading a list has to be able to tell a composed line
    // from one a pharmacist authored.
    const r = fallbackPacks({ ...base, haveConsumables: 0, haveDrugs: 0 });
    expect(r.consumables.some((c) => !!c.notes)).toBe(true);
  });
});

describe('every route that books a case reaches it', () => {
  const ROUTES = [
    ['elective booking', BOOKING],
    ['emergency booking', EMERGENCY],
    ['regenerate', GENERATE],
  ] as const;

  it('calls the confirmed mapping and then the composed standard', () => {
    // One way of deciding what a procedure needs, not three. Two
    // implementations is how the store and the surgeon end up disagreeing
    // about what was asked for.
    for (const [name, src] of ROUTES) {
      expect(src, name).toContain('buildPackRequests');
      expect(src, name).toContain('fallbackPacks({');
      expect(src.indexOf('buildPackRequests('), name).toBeLessThan(src.indexOf('fallbackPacks({'));
    }
  });

  it('passes the procedure AND the magnitude to it', () => {
    for (const [name, src] of ROUTES) {
      const call = src.slice(src.indexOf('fallbackPacks({'), src.indexOf('fallbackPacks({') + 1200);
      expect(call, name).toContain('procedureName:');
      expect(call, name).toContain('magnitude:');
    }
  });

  it('treats what a person chose as the floor it must not cross', () => {
    // haveConsumables/haveDrugs are what the booker ticked OR what a confirmed
    // mapping produced. Passing 0 here would overwrite a clinical decision
    // with a generated list.
    for (const [name, src] of [['elective booking', BOOKING], ['emergency booking', EMERGENCY]] as const) {
      const call = src.slice(src.indexOf('fallbackPacks({'), src.indexOf('fallbackPacks({') + 1400);
      expect(call, name).toMatch(/haveConsumables[:,]/);
      expect(call, name).toMatch(/haveDrugs[:,]/);
    }
    expect(BOOKING).toContain('const haveConsumables = consumableRequests?.length || mapped.consumables.length;');
    expect(EMERGENCY).toContain('haveConsumables: consumableRequests.length || mapped.consumables.length,');
  });

  it('never lets a pack failure refuse a booking', () => {
    // A case on the list with a thin pack can be topped up in the morning. A
    // case that was refused cannot — and on the emergency route that is the
    // worst outcome available.
    for (const [name, src] of [['elective booking', BOOKING], ['emergency booking', EMERGENCY]] as const) {
      const before = src.slice(0, src.indexOf('fallbackPacks({'));
      expect(before.lastIndexOf('try {'), name).toBeGreaterThan(before.lastIndexOf('await prisma.surgery.create'));
    }
  });
});

describe('the enum vocabulary, which rejects the whole insert when it is wrong', () => {
  it('is coerced rather than spread, on both booking routes', () => {
    // The standards library names categories the column has never heard of.
    // Handing Prisma an unknown enum value does not skip the line: it rejects
    // the insert and returns a 500. The regenerate route learned this when the
    // standards first went live.
    for (const [name, src] of [['elective booking', BOOKING], ['emergency booking', EMERGENCY]] as const) {
      expect(src, name).toContain('toConsumableCategory(');
      expect(src, name).toContain('toDrugType(');
    }
  });

  it('keeps the base pack out of the composed list, and only the composed list', () => {
    // Deduplicating the whole list would silently drop a line a SURGEON asked
    // for because it collided with the base pack — they may want a second one.
    for (const [name, src] of [['elective booking', BOOKING], ['emergency booking', EMERGENCY]] as const) {
      expect(src, name).toContain('const basePackNames = new Set(basePackRows.map((r) => r.name.trim().toLowerCase()));');
      const filterAt = src.indexOf('basePackNames.has(');
      const composedAt = src.indexOf('composed.consumables');
      expect(filterAt, name).toBeGreaterThan(composedAt);
    }
  });
});

describe('pharmacy is told about a composed list too', () => {
  it('counts what was actually written, not what was ticked', () => {
    // The emergency pharmacy alert counted drugDressingRequests, which is zero
    // for every composed list — so pharmacy would have been told "0 item(s)"
    // about a list that had items in it, or not told at all.
    expect(EMERGENCY).toContain('if (effectiveDrugs.length > 0) {');
    expect(EMERGENCY).not.toContain('${drugDressingRequests.length} item(s) to pack.');
  });
});
