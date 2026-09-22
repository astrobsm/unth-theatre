/**
 * Generating a case's draft packs.
 *
 * This file carries clinical content, so what it protects is mostly restraint.
 *
 * IT MUST NOT PRESCRIBE. The antibiotic is offered as the guideline's options
 * with the choice left open. No agent is picked silently, and — the one that
 * matters most — no adult dose is ever printed on a child's pack. Paediatric
 * prophylaxis is weight-based, and an adult dose sitting in the box for a
 * four-year-old is exactly the error a system should make impossible rather
 * than convenient.
 *
 * IT MUST NOT GO QUIET. Where the guideline says no routine prophylaxis is
 * indicated, the pack says so in words. A pack with no antibiotic and no
 * explanation reads as an oversight, and somebody adds one "to be safe" — which
 * is how a hospital ends up giving antibiotics for clean hand surgery.
 *
 * AND IT MUST BE RIGHT ABOUT THE OPERATION. 588 procedures are in the catalogue
 * and more are added at booking, so the family and approach are read from the
 * name. A caesarean routed to "general" gets no neonatal resuscitation set, and
 * nobody notices until the baby is out.
 */
import { describe, expect, it } from 'vitest';

import {
  familyOf, approachOf, suturesFor, PROPHYLAXIS, ETHICON, ANTIBIOTIC_BRANDS,
  FAMILY_LABEL, ALTERNATIVE_AGENTS,
  type ProcedureFamily,
} from '../../src/lib/packs/standards';
import { generatePacks } from '../../src/lib/packs/generate';

const gen = (over: Partial<Parameters<typeof generatePacks>[0]> = {}) => generatePacks({
  procedureName: 'Exploratory laparotomy',
  subspecialty: 'General Surgery',
  magnitude: 'MAJOR',
  ...over,
});

const names = (items: Array<{ name: string }>) => items.map((i) => i.name.toLowerCase());

// ── reading the operation ───────────────────────────────────────────────────

describe('working out what the operation is', () => {
  it('reads the family from the name', () => {
    const cases: Array<[string, ProcedureFamily]> = [
      ['Emergency caesarean section', 'CAESAREAN'],
      ['Appendicectomy', 'APPENDICECTOMY'],
      ['Laparoscopic cholecystectomy', 'BILIARY'],
      ['Right hemicolectomy', 'COLORECTAL'],
      ['Inguinal hernia repair with mesh', 'HERNIA'],
      ['Total abdominal hysterectomy', 'HYSTERECTOMY'],
      ['Total hip arthroplasty', 'ARTHROPLASTY'],
      ['ORIF of femur', 'FRACTURE_FIXATION'],
      ['Craniotomy for evacuation of haematoma', 'CRANIOTOMY'],
      ['Ventriculoperitoneal shunt insertion', 'CSF_SHUNT'],
      ['TURP', 'UROLOGY_ENDOSCOPIC'],
      ['Tonsillectomy', 'ENT_AERODIGESTIVE'],
      ['Cataract extraction with IOL', 'OPHTHALMIC'],
      ['Split skin graft to leg', 'SKIN_GRAFT_FLAP'],
      ['Incision and drainage of abscess', 'SUPERFICIAL'],
      ['Thoracotomy and decortication', 'THORACIC'],
    ];
    for (const [name, expected] of cases) {
      expect(familyOf(name, 'General Surgery')).toBe(expected);
    }
  });

  it('does not let a shared word send an operation to the wrong specialty', () => {
    // 'Evacuation' is in both "evacuation of retained products" and
    // "craniotomy for evacuation of haematoma". The gynaecology pattern once
    // matched first and would have sent a vaginal pack to a craniotomy — with
    // no bone wax, no haemostat and no head pins. Caught by a test, not in
    // theatre.
    expect(familyOf('Craniotomy for evacuation of haematoma', 'Neurosurgery')).toBe('CRANIOTOMY');
    expect(familyOf('Evacuation of extradural haematoma', 'Neurosurgery')).toBe('CRANIOTOMY');
    expect(familyOf('Evacuation of retained products of conception', 'Obstetrics & Gynaecology'))
      .toBe('GYNAE_VAGINAL');

    const cranial = generatePacks({
      procedureName: 'Craniotomy for evacuation of haematoma',
      subspecialty: 'Neurosurgery', magnitude: 'MAJOR',
    });
    expect(names(cranial.consumables).join(' ')).toMatch(/bone wax/);
    expect(names(cranial.consumables).join(' ')).not.toMatch(/vaginal pack/);
  });

  it('falls back to the subspecialty when the name says nothing', () => {
    expect(familyOf('Procedure', 'Ophthalmology')).toBe('OPHTHALMIC');
    expect(familyOf('', 'Neurosurgery')).toBe('CRANIOTOMY');
    expect(familyOf('Something new', 'Unknown speciality')).toBe('GENERAL');
  });

  it('keeps the approach separate from the family', () => {
    // "Laparoscopic appendicectomy" must get appendicectomy prophylaxis AND
    // laparoscopy consumables. Bundling them would need a family per pairing.
    expect(familyOf('Laparoscopic appendicectomy', 'General Surgery')).toBe('APPENDICECTOMY');
    expect(approachOf('Laparoscopic appendicectomy', 'APPENDICECTOMY')).toBe('LAPAROSCOPIC');
    expect(approachOf('Open appendicectomy', 'APPENDICECTOMY')).toBe('OPEN');
  });

  it('gives a brand new procedure a defensible pack anyway', () => {
    // Nothing has ever been booked under this name. It should still produce a
    // usable list rather than an empty one.
    const p = gen({ procedureName: 'Robotic-assisted retroperitoneal something', subspecialty: 'Urology' });
    expect(p.consumables.length).toBeGreaterThan(20);
    expect(p.basis.length).toBeGreaterThan(2);
  });
});

// ── what ends up on the consumables list ────────────────────────────────────

describe('the consumables draft', () => {
  it('always starts from the mandatory base theatre pack', () => {
    const p = gen();
    expect(p.consumables.some((i) => i.source === 'Mandatory base theatre pack')).toBe(true);
    expect(names(p.consumables)).toContain('sterile surgical gowns');
  });

  it('adds what the approach needs', () => {
    const lap = gen({ procedureName: 'Laparoscopic cholecystectomy' });
    expect(names(lap.consumables).join(' ')).toMatch(/insufflation/);
    expect(names(lap.consumables).join(' ')).toMatch(/trocar/);

    const open = gen({ procedureName: 'Open cholecystectomy' });
    expect(names(open.consumables).join(' ')).not.toMatch(/trocar/);
    expect(names(open.consumables).join(' ')).toMatch(/diathermy/);
  });

  it('adds what the operation needs', () => {
    const cs = gen({ procedureName: 'Emergency caesarean section', subspecialty: 'Obstetrics & Gynaecology' });
    // The one nobody can do without, and the reason family detection matters.
    expect(names(cs.consumables).join(' ')).toMatch(/neonatal resuscitation/);
    expect(names(cs.consumables).join(' ')).toMatch(/cord clamp/);

    const hip = gen({ procedureName: 'Total hip arthroplasty', subspecialty: 'Orthopaedics' });
    expect(names(hip.consumables).join(' ')).toMatch(/bone cement/);
  });

  it('scales with operative magnitude', () => {
    const major = gen({ magnitude: 'MAJOR' });
    const minor = gen({ magnitude: 'MINOR' });
    const gowns = (p: typeof major) => p.consumables.find((i) => /sterile surgical gowns/i.test(i.name))!.quantity;
    expect(gowns(major)).toBeGreaterThan(gowns(minor));
  });

  it('never lists an item and asks for none of it', () => {
    // A "0 ×" line reads as an omission somebody should correct, and somebody
    // corrects it.
    for (const m of ['MINOR', 'INTERMEDIATE', 'MAJOR']) {
      gen({ magnitude: m }).consumables.forEach((i) => expect(i.quantity).toBeGreaterThan(0));
    }
  });

  it('merges two procedures by the higher quantity, never the sum', () => {
    // One trip to theatre is one set of drapes.
    const one = gen({ procedureName: 'Excision of tumour' });
    const two = gen({ procedureName: 'Excision of tumour', additionalProcedures: 'Split skin graft to defect' });
    const drapes = (p: typeof one) => p.consumables.find((i) => i.name === 'Sterile drapes')!.quantity;
    expect(drapes(two)).toBe(drapes(one));
    // But the graft's own items are there.
    expect(names(two.consumables).join(' ')).toMatch(/paraffin gauze/);
    expect(two.warnings.join(' ')).toMatch(/merged by taking the higher/);
  });

  it('names the Ethicon product, not "suture 2/0"', () => {
    // A request nobody can read is a request somebody substitutes.
    const sutures = gen().consumables.filter((i) => i.category === 'SUTURES');
    expect(sutures.length).toBeGreaterThan(2);
    sutures.forEach((s) => {
      expect(s.name).toMatch(/VICRYL|MONOCRYL|PDS|PROLENE|ETHILON|ETHIBOND|MERSILK/);
      expect(s.note).toBeTruthy();
    });
  });
});

// ── the pharmacy draft, and what it refuses to do ───────────────────────────

describe('antibiotic prophylaxis', () => {
  it('offers the guideline options and picks none of them', () => {
    const p = gen({ procedureName: 'Appendicectomy' });
    const abx = p.pharmacy.filter((i) => i.drugType === 'ANTIBIOTIC');
    expect(abx.map((a) => a.name)).toEqual(['Cefazolin', 'Metronidazole']);
    // Every one is flagged as a decision, not a quantity.
    abx.forEach((a) => expect(a.needsChoice).toBe(true));
  });

  it('switches to the alternative where a beta-lactam allergy is recorded', () => {
    const p = gen({ procedureName: 'Appendicectomy', betaLactamAllergy: true });
    const abx = p.pharmacy.filter((i) => i.drugType === 'ANTIBIOTIC').map((a) => a.name);
    expect(abx).not.toContain('Cefazolin');
    expect(abx).toContain('Clindamycin');
    expect(p.warnings.join(' ')).toMatch(/beta-lactam allergy is recorded/);
  });

  it('PUTS NO DOSE ON A CHILD’S PACK', () => {
    // The single most important rule in this file. Paediatric prophylaxis is
    // weight-based; an adult dose in the box is an error waiting to be signed.
    const child = gen({ procedureName: 'Appendicectomy', patientAge: 4, patientAgeUnit: 'YEARS' });
    const abx = child.pharmacy.filter((i) => i.drugType === 'ANTIBIOTIC');
    expect(abx.length).toBeGreaterThan(0);
    abx.forEach((a) => {
      expect(a.dosage).toBeNull();
      expect(a.note).toMatch(/weight/i);
    });
    expect(child.warnings.join(' ')).toMatch(/This is a child/);
  });

  it('treats months and weeks as childhood too', () => {
    for (const unit of ['MONTHS', 'WEEKS', 'DAYS']) {
      const p = gen({ procedureName: 'Appendicectomy', patientAge: 6, patientAgeUnit: unit });
      p.pharmacy.filter((i) => i.drugType === 'ANTIBIOTIC')
        .forEach((a) => expect(a.dosage).toBeNull());
    }
  });

  it('still gives an adult a dose, marked to be confirmed', () => {
    const adult = gen({ procedureName: 'Appendicectomy', patientAge: 40, patientAgeUnit: 'YEARS' });
    const cefazolin = adult.pharmacy.find((i) => i.name === 'Cefazolin')!;
    expect(cefazolin.dosage).toBe('2 g');
    expect(cefazolin.note).toMatch(/Confirm|within 60 minutes/i);
  });

  it('says out loud when the guideline recommends none', () => {
    // Silence reads as an oversight, and somebody adds one "to be safe".
    const p = gen({ procedureName: 'Carpal tunnel release', subspecialty: 'Orthopaedics' });
    expect(p.pharmacy.filter((i) => i.drugType === 'ANTIBIOTIC')).toHaveLength(0);
    expect(p.warnings.join(' ')).toMatch(/does not recommend routine antibiotic prophylaxis/);
    expect(p.warnings.join(' ')).toMatch(/If this patient needs one, add it and say why/);
  });

  it('always says the pack is a draft', () => {
    expect(gen().warnings.join(' ')).toMatch(/draft.*until you submit it/i);
  });

  it('cites what each decision was based on', () => {
    const p = gen({ procedureName: 'Right hemicolectomy' });
    expect(p.basis.join(' ')).toMatch(/ASHP\/IDSA\/SIS\/SHEA/);
    expect(p.basis.join(' ')).toMatch(/Ethicon/);
  });
});

// ── the reference data itself ───────────────────────────────────────────────

describe('the standards behind it', () => {
  it('has prophylaxis advice for every family, with a stated basis', () => {
    (Object.keys(FAMILY_LABEL) as ProcedureFamily[]).forEach((f) => {
      const a = PROPHYLAXIS[f];
      expect(a).toBeTruthy();
      expect(a.basis.length).toBeGreaterThan(20);
      // A family with no first line must say so explicitly, not merely be empty.
      if (a.firstLine.length === 0) expect(a.routineNotIndicated).toBe(true);
    });
  });

  it('gives every family a suture set that names real Ethicon lines', () => {
    (Object.keys(FAMILY_LABEL) as ProcedureFamily[]).forEach((f) => {
      suturesFor(f, 'MAJOR').forEach(({ line, quantity }) => {
        expect(Object.values(ETHICON)).toContain(line);
        expect(quantity).toBeGreaterThan(0);
      });
    });
  });

  it('offers brands for every agent it can recommend', () => {
    // The surgeon chooses the brand; a recommended agent with no brand list
    // leaves that dropdown empty.
    const agents = new Set<string>();
    Object.values(PROPHYLAXIS).forEach((a) => {
      [...a.firstLine, ...a.betaLactamAllergy].forEach((o) => agents.add(o.agent));
    });
    ALTERNATIVE_AGENTS.forEach((o) => agents.add(o.agent));
    agents.forEach((agent) => {
      expect(ANTIBIOTIC_BRANDS[agent]).toBeTruthy();
      expect(ANTIBIOTIC_BRANDS[agent].length).toBeGreaterThan(1);
      // A generic must always be offerable — the tender changes and the brand
      // on the shelf is not always the one in the list.
      expect(ANTIBIOTIC_BRANDS[agent][0]).toMatch(/generic/i);
    });
  });

  it('marks each Ethicon line absorbable or not, and says what it is for', () => {
    Object.values(ETHICON).forEach((l) => {
      expect(typeof l.absorbable).toBe('boolean');
      expect(l.use.length).toBeGreaterThan(5);
      expect(l.material.length).toBeGreaterThan(5);
    });
  });
});
