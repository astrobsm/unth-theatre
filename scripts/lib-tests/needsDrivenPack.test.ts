/**
 * What a tick on the booking form actually buys.
 *
 * "Diathermy" and "Blood transfusion" have been tick boxes since the first
 * booking form. A tick put a line on the theatre list and raised a cross-match
 * request, and it put NOTHING in the store — so a diathermy case went to
 * theatre and the pack arrived without a pad, every time, and somebody was sent
 * out for one while the patient was on the table.
 *
 * These are quantities a pack provider fills from a shelf, so they are written
 * down twice — here and in the source — and made to agree.
 */
import { describe, expect, it } from 'vitest';
import {
  needsDrivenPack,
  resolveBasePack,
  MULTI_UNIT_TRANSFUSION,
  SURGERY_MAGNITUDES,
} from '../../src/lib/baseConsumablePack';

const names = (xs: { name: string }[]) => xs.map((x) => x.name);
const qty = (xs: { name: string; quantity: number }[], name: string) =>
  xs.find((x) => x.name === name)?.quantity ?? null;

describe('aprons, on every case', () => {
  it('issues six, whatever the operation', () => {
    for (const m of SURGERY_MAGNITUDES) {
      const line = resolveBasePack(m).find((i) => i.name === 'Disposable apron');
      expect(line, `missing from the ${m} pack`).toBeTruthy();
      expect(line!.quantity, `wrong count for ${m}`).toBe(6);
      expect(line!.unit).toBe('piece');
    }
  });

  it('does not taper them with the size of the case', () => {
    // The number is about how many people are at the table and how often one is
    // changed. A minor case has a scrub nurse and a circulating nurse the same
    // as a major one.
    const counts = SURGERY_MAGNITUDES.map(
      (m) => resolveBasePack(m).find((i) => i.name === 'Disposable apron')!.quantity,
    );
    expect(new Set(counts).size).toBe(1);
  });
});

describe('a case that was ticked for nothing', () => {
  it('earns nothing', () => {
    const none = needsDrivenPack({});
    expect(none.consumables).toEqual([]);
    expect(none.drugs).toEqual([]);
    expect(none.reasons).toEqual([]);
    expect(needsDrivenPack(null).consumables).toEqual([]);
    expect(needsDrivenPack(undefined).drugs).toEqual([]);
  });
});

describe('diathermy', () => {
  const pack = needsDrivenPack({ needDiathermy: true });

  it('adds the pad and the pencil, one each', () => {
    expect(names(pack.consumables)).toEqual([
      'Diathermy pad (patient plate)',
      'Diathermy pencil',
    ]);
    expect(qty(pack.consumables, 'Diathermy pad (patient plate)')).toBe(1);
    expect(qty(pack.consumables, 'Diathermy pencil')).toBe(1);
  });

  it('files them where the store will find them', () => {
    for (const c of pack.consumables) expect(c.category).toBe('DIATHERMY');
  });

  it('brings no drugs with it', () => {
    expect(pack.drugs).toEqual([]);
  });

  it('says why the lines are there', () => {
    expect(pack.reasons.join(' ')).toContain('diathermy');
  });
});

describe('blood transfusion', () => {
  it('adds a giving set and the cover for a reaction', () => {
    const one = needsDrivenPack({ needBloodTransfusion: true, bloodUnits: 1 });
    expect(names(one.consumables)).toEqual(['Blood giving set']);
    expect(names(one.drugs)).toEqual(['Inj. Hydrocortisone']);
    expect(qty(one.drugs, 'Inj. Hydrocortisone')).toBe(1);
  });

  it('adds the multi-unit cover at two units and not at one', () => {
    // Calcium gluconate is for citrate toxicity, which is a function of how
    // much stored blood goes in; tranexamic acid is there because a case
    // expecting two units is a case expecting to bleed.
    expect(MULTI_UNIT_TRANSFUSION).toBe(2);

    const one = needsDrivenPack({ needBloodTransfusion: true, bloodUnits: 1 });
    expect(names(one.drugs)).not.toContain('Inj. Calcium Gluconate');
    expect(names(one.drugs)).not.toContain('Tranexamic acid');
    expect(names(one.consumables)).not.toContain('Syringe');

    const two = needsDrivenPack({ needBloodTransfusion: true, bloodUnits: 2 });
    expect(names(two.drugs)).toEqual([
      'Inj. Hydrocortisone',
      'Inj. Calcium Gluconate',
      'Tranexamic acid',
    ]);
    expect(qty(two.drugs, 'Inj. Calcium Gluconate')).toBe(1);
    expect(qty(two.drugs, 'Tranexamic acid')).toBe(3);

    const syringe = two.consumables.find((c) => c.name === 'Syringe');
    expect(syringe?.size).toBe('20ml');
    expect(syringe?.quantity).toBe(1);
  });

  it('keeps the cover for anything above two units as well', () => {
    const six = needsDrivenPack({ needBloodTransfusion: true, bloodUnits: 6 });
    expect(names(six.drugs)).toContain('Tranexamic acid');
    expect(six.reasons.join(' ')).toContain('6 units');
  });

  it('treats an unstated amount as one unit, not as none and not as many', () => {
    // A case booked before the form asked gave no answer. Reading its silence
    // as "nought units" would be inventing one; reading it as "many" would send
    // out drugs nobody requested.
    const silent = needsDrivenPack({ needBloodTransfusion: true, bloodUnits: null });
    expect(names(silent.consumables)).toEqual(['Blood giving set']);
    expect(names(silent.drugs)).toEqual(['Inj. Hydrocortisone']);
  });

  it('adds nothing at all when transfusion was not requested', () => {
    // Units left over from a change of mind must not raise a pack on their own.
    const none = needsDrivenPack({ needBloodTransfusion: false, bloodUnits: 4 });
    expect(none.consumables).toEqual([]);
    expect(none.drugs).toEqual([]);
  });
});

describe('which list each line goes on', () => {
  it('sends the drugs to pharmacy and the hardware to the pack provider', () => {
    // The consumable pack provider does not stock drugs. A line they cannot
    // fill is a line that holds up the whole pack while somebody works out
    // whose it was.
    const both = needsDrivenPack({
      needDiathermy: true,
      needBloodTransfusion: true,
      bloodUnits: 3,
    });
    expect(names(both.consumables)).toEqual([
      'Diathermy pad (patient plate)',
      'Diathermy pencil',
      'Blood giving set',
      'Syringe',
    ]);
    expect(names(both.drugs)).toEqual([
      'Inj. Hydrocortisone',
      'Inj. Calcium Gluconate',
      'Tranexamic acid',
    ]);
  });

  it('gives every drug a type the pharmacy list recognises', () => {
    const both = needsDrivenPack({ needBloodTransfusion: true, bloodUnits: 2 });
    const DRUG_TYPES = new Set([
      'ANTIBIOTIC', 'ANALGESIC', 'ANAESTHETIC_ADJUNCT', 'IV_FLUID',
      'WOUND_DRESSING_AGENT', 'ANTISEPTIC', 'HAEMOSTATIC', 'OTHER',
    ]);
    for (const d of both.drugs) {
      expect(DRUG_TYPES.has(d.type), `${d.name} has type ${d.type}`).toBe(true);
    }
    // Tranexamic acid is a haemostatic and is filed as one, so a pharmacist
    // scanning the list by type finds it where they expect.
    expect(both.drugs.find((d) => d.name === 'Tranexamic acid')?.type).toBe('HAEMOSTATIC');
  });

  it('gives every consumable a category the store recognises', () => {
    const CONSUMABLE_CATEGORIES = new Set([
      'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
      'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
      'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
    ]);
    const both = needsDrivenPack({ needDiathermy: true, needBloodTransfusion: true, bloodUnits: 2 });
    for (const c of both.consumables) {
      expect(CONSUMABLE_CATEGORIES.has(c.category), `${c.name} is ${c.category}`).toBe(true);
    }
    // And the apron on every case, which goes through the base pack.
    const apron = resolveBasePack('MAJOR').find((i) => i.name === 'Disposable apron')!;
    expect(CONSUMABLE_CATEGORIES.has(apron.category)).toBe(true);
    expect(apron.category).toBe('PPE');
  });

  it('does not taper the needs-driven lines by magnitude', () => {
    // A diathermy pad is one pad whether the operation is minor or super-major,
    // and a patient having two units needs the same cover either way. The
    // function does not even take a magnitude, and this is the test that keeps
    // it that way.
    expect(needsDrivenPack.length).toBe(1);
  });
});
