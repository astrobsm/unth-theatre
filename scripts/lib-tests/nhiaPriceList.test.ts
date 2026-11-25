/**
 * The NHIA Medicines Price List, and matching this hospital's catalogue to it.
 *
 * Transcribed from the Authority's published list of April 2025, which is the
 * document that finally answers the question this application could not: what
 * does the scheme actually cover? Until it arrived every catalogue item was
 * flagged not-covered, because a wrong `true` sends an item to a counter that
 * will refuse it with the patient already on the list.
 *
 * TWO THINGS THESE TESTS DEFEND, and both are about the same asymmetry.
 *
 *   THE TRANSCRIPTION IS A SOURCE DOCUMENT. Prices and codes are quoted to a
 *   family and to the Authority. A duplicated code or a price that drifted in
 *   an edit is a figure somebody acts on.
 *
 *   THE MATCHING NEVER GUESSES. An unmatched item routes where it already
 *   routes and costs a minute of somebody's attention. A wrongly matched one
 *   costs a cancelled case. So: exact names and named aliases only, and the
 *   tests below try hard to make it match something it should not.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  NHIA_LIST_SOURCE,
  NHIA_LIST_VERSION,
  NHIA_PRICE_LIST,
  nhiaItemByCode,
} from '../../src/lib/payer/nhiaPriceList';
import {
  NHIA_ALIASES, isCoveredByNhia, matchNhia, normaliseDrugName,
} from '../../src/lib/payer/nhiaMatch';
import { routeItem } from '../../src/lib/payer/routing';

describe('the transcribed list', () => {
  it('says where it came from and when', () => {
    // The Authority revises it periodically — 2024, then 2025. A coverage
    // figure with no date on it is a figure nobody can check.
    expect(NHIA_LIST_VERSION).toBe('April 2025');
    expect(NHIA_LIST_SOURCE).toContain('National Health Insurance Authority');
  });

  it('has no duplicate codes', () => {
    const codes = NHIA_PRICE_LIST.map((i) => i.code);
    const seen = new Set<string>();
    const dupes = codes.filter((c) => (seen.has(c) ? true : (seen.add(c), false)));
    expect(dupes).toEqual([]);
  });

  it('gives every row a code in the Authority’s own format', () => {
    for (const item of NHIA_PRICE_LIST) {
      expect(item.code, item.name).toMatch(/^NHIA-\d{2}-\d{2}-\d{2,3}$/);
      expect(item.name.trim(), item.code).not.toBe('');
      expect(item.group.trim(), item.code).not.toBe('');
    }
  });

  it('prices everything it says is covered, or leaves the price out honestly', () => {
    // The list itself leaves some prices blank. What must never happen is a
    // zero standing in for "we do not know", because nought is a number
    // somebody will quote.
    for (const item of NHIA_PRICE_LIST) {
      if (item.price === undefined) continue;
      expect(item.price, `${item.code} ${item.name}`).toBeGreaterThan(0);
    }
  });

  it('carries the three coverage states, not two', () => {
    const states = new Set(NHIA_PRICE_LIST.map((i) => i.coverage));
    expect(states.has('FULL')).toBe(true);
    expect(states.has('PARTIAL')).toBe(true);
    expect(states.has('EXCLUDED')).toBe(true);
  });

  it('keeps the anti-retrovirals on the exclusion list the document puts them on', () => {
    // Section 6.11 is headed "(Exclusion List)". Treating them as covered
    // would send a patient's ARVs to a counter that will not supply them.
    for (const code of ['NHIA-06-11-12', 'NHIA-06-11-30', 'NHIA-06-11-32']) {
      expect(nhiaItemByCode(code)?.coverage, code).toBe('EXCLUDED');
    }
  });

  it('marks sections 29 to 36 as partial, because the patient pays a share', () => {
    for (const code of ['NHIA-29-00-01', 'NHIA-33-01-03']) {
      expect(nhiaItemByCode(code)?.coverage, code).toBe('PARTIAL');
    }
  });

  it('quotes a handful of prices exactly as published', () => {
    // Spot checks against the document, so a careless edit to the data is
    // caught by something other than a reader's memory.
    expect(nhiaItemByCode('NHIA-01-01-02')?.price).toBe(2700);       // Ketamine
    expect(nhiaItemByCode('NHIA-01-03-07')?.price).toBe(3285);       // Propofol 1%
    expect(nhiaItemByCode('NHIA-06-07-38')?.price).toBe(2123);       // Ceftriaxone 1g IV
    expect(nhiaItemByCode('NHIA-20-01-03')?.price).toBe(1537);       // Oxytocin
    expect(nhiaItemByCode('NHIA-28-02-16')?.price).toBe(482);        // Surgical gloves
    expect(nhiaItemByCode('NHIA-29-00-01')?.price).toBe(13176);      // Meropenem 1g
  });

  it('covers every part of a theatre pack it reasonably can', () => {
    const groups = new Set(NHIA_PRICE_LIST.map((i) => i.group));
    for (const g of [
      'General anaesthetics', 'Muscle relaxants', 'Local anaesthetics',
      'Narcotic analgesics', 'Antibacterials', 'Antiseptics', 'Oxytocics',
      'Infusions', 'Consumables',
    ]) {
      expect(groups.has(g), g).toBe(true);
    }
  });
});

describe('matching a catalogue name to the list', () => {
  it('matches a plain name', () => {
    const m = matchNhia('Propofol');
    expect(m.how).toBe('EXACT');
    expect(m.item?.code).toBe('NHIA-01-03-07');
  });

  it('ignores the dosage form a catalogue tacks on', () => {
    // "Ceftriaxone injection" and "Ceftriaxone" are one drug.
    expect(matchNhia('Oxytocin injection').item?.code).toBe('NHIA-20-01-03');
    expect(matchNhia('Metronidazole IV infusion').item).toBeTruthy();
  });

  it('knows the spellings this theatre actually uses', () => {
    expect(matchNhia('Lignocaine').how).toBe('ALIAS');
    expect(matchNhia('Amoxicillin').item?.name).toBe('Amoxycillin');
    expect(matchNhia('Adrenaline').item?.name).toContain('Epinephrine');
    expect(matchNhia('Normal saline').item?.name).toBe('Sodium chloride');
    expect(matchNhia('Scoline').item?.name).toBe('Suxamethonium');
  });

  it('REFUSES to match a different medicine that merely starts the same', () => {
    // The failure that would hurt. Co-amoxiclav is not amoxycillin, and
    // ceftriaxone/sulbactam is not ceftriaxone — different drugs, different
    // prices, and in one case a patient told the wrong thing about money.
    expect(normaliseDrugName('Amoxycillin plus Clavulanic Acid (Co-amoxiclav)'))
      .not.toBe(normaliseDrugName('Amoxycillin'));
    expect(matchNhia('Ceftriaxone/Sulbactam').item?.code).toBe('NHIA-06-07-39');
    expect(matchNhia('Ceftriaxone').item?.code).not.toBe('NHIA-06-07-39');
  });

  it('refuses a name it has never heard of', () => {
    // Genuinely not on the Authority's list: a proprietary wound gel, a
    // mesh, a haemostat, an inhalational agent it does not carry.
    for (const name of ['Hera wound gel', 'Mesh, heavyweight', 'Surgicel', 'Sevoflurane', 'Bone wax', '']) {
      expect(matchNhia(name).how, name).toBe('NONE');
      expect(matchNhia(name).item, name).toBeNull();
    }
  });

  it('knows the trade names this theatre writes on a pack', () => {
    // Sofratulle IS framycetin gauze, and the Authority lists it under the
    // generic. An alias is a clinical equivalence somebody can check, which
    // is the only kind this file is allowed to hold.
    expect(matchNhia('Sofratulle Gauze (Framycetin)').item?.name).toBe('Framycetin');
    expect(matchNhia('Dermazine cream').item?.name).toBe('Silver sulphadiazine');
    expect(matchNhia('Fortum (1g)').item?.name).toBe('Ceftazidime');
  });

  it('pulls the medicine out of a line written for a trolley', () => {
    // "Paracetamol 1 g IV (100 ml) (1 g IV)" is how a catalogue writes it;
    // "Paracetamol" is how the Authority does. 19 of 90 pharmacy items
    // matched before this worked.
    expect(matchNhia('Paracetamol 1 g IV (100 ml) (1 g IV)').item?.name).toBe('Paracetamol');
    expect(matchNhia("Ringer's Lactate (1 L)").item?.name).toBe("Ringer's lactate");
    expect(matchNhia('Gentamicin 80 mg (Ampoule) (80 mg IV stat)').item?.name).toBe('Gentamycin');
    expect(matchNhia('Metronidazole 500 mg / 100 ml IV (500 mg IV stat)').item?.name).toBe('Metronidazole');
  });

  it('still will not let a strength turn one drug into another', () => {
    // Stripping "1 g" from a name must never strip the name as well.
    expect(matchNhia('Amoxicillin-Clavulanate 1.2 g IV').item?.name).toContain('Clavulanic');
    expect(matchNhia('Amoxicillin-Clavulanate 1.2 g IV').item?.name).not.toBe('Amoxycillin');
  });

  it('picks the form the line is actually talking about', () => {
    // The failure the first run on real data produced: "Frusemide 20 mg /
    // 2 ml (Ampoule)" matched the 40mg TABLET at twenty-nine naira, because
    // the strength did not line up and the cheapest row won. Right drug,
    // right coverage, wrong row — and the row carries the price the NHIA
    // desk reads.
    expect(matchNhia('Frusemide 20 mg / 2 ml (Ampoule)').item?.code).toBe('NHIA-12-03-04');
    expect(matchNhia('Diclofenac 75 mg IM (Ampoule)').item?.code).toBe('NHIA-02-04-07');
    expect(matchNhia('Diclofenac 100mg Suppository').item?.code).toBe('NHIA-02-04-24');
    expect(matchNhia('Gentamicin 80 mg (Ampoule)').item?.name).toBe('Gentamycin');
  });

  it('lets a strength break a tie between two rows of the same form', () => {
    // Both cefuroxime vials say "vial"; only one says 750.
    expect(matchNhia('Cefuroxime 750 mg (Vial)').item?.code).toBe('NHIA-06-07-43');
    expect(matchNhia('Cefuroxime 250 mg (Vial)').item?.code).toBe('NHIA-06-07-44');
    expect(matchNhia('Ceftriaxone 1g IV').item?.code).toBe('NHIA-06-07-38');
  });

  it('does not match a name made only of form words', () => {
    // "Injection" normalises to nothing useful; it must fail rather than
    // match whatever happens to sort first.
    expect(matchNhia('Injection').item).toBeNull();
    expect(matchNhia('Tablet').item).toBeNull();
  });

  it('narrows between strengths of one drug when it is told one', () => {
    expect(matchNhia('Ceftriaxone', '1g IV').item?.code).toBe('NHIA-06-07-38');
    expect(matchNhia('Ceftriaxone', '250mg').item?.code).toBe('NHIA-06-07-36');
  });

  it('takes the CHEAPEST when it cannot choose, and hands back the rest', () => {
    // An automatic run must never overstate what the scheme owes, and the
    // person correcting it needs to see what the alternatives were.
    const m = matchNhia('Ceftriaxone');
    expect(m.alternatives.length).toBeGreaterThan(1);
    const prices = m.alternatives.map((a) => a.price ?? 0);
    expect(m.item?.price).toBe(Math.min(...prices));
  });

  it('calls a partial match covered, because the scheme is paying something', () => {
    const m = matchNhia('Meropenem');
    expect(m.item?.coverage).toBe('PARTIAL');
    expect(isCoveredByNhia(m)).toBe(true);
  });

  it('calls an excluded match NOT covered', () => {
    const m = matchNhia('Nevirapine (NVP)');
    expect(m.item?.coverage).toBe('EXCLUDED');
    expect(isCoveredByNhia(m)).toBe(false);
  });

  it('keeps every alias pointing at something real', () => {
    // An alias to a name that is not on the list is a silent dead end.
    for (const [from, to] of Object.entries(NHIA_ALIASES)) {
      expect(matchNhia(to).item, `${from} -> ${to}`).toBeTruthy();
    }
  });
});

describe('what a partially covered line tells the family', () => {
  it('still goes to the NHIA desk', () => {
    const d = routeItem('NHIA', {
      list: 'PHARMACY', coveredByNHIA: true, fromCatalogue: true, nhiaPartial: true,
    });
    expect(d.routedTo).toBe('NHIA_PHARMACY');
  });

  it('says the patient owes a share, and says it early', () => {
    // Meropenem is thirteen thousand naira. Half of that, found out at the
    // theatre door, is a case that does not happen.
    const d = routeItem('NHIA', {
      list: 'PHARMACY', coveredByNHIA: true, fromCatalogue: true, nhiaPartial: true,
    });
    expect(d.coverageNote).toContain('in part only');
    expect(d.coverageNote).toContain('patient pays a share');
    expect(d.coverageNote).toContain('before the day');
  });

  it('says nothing on a fully covered line', () => {
    // A note on every covered line makes the words invisible on the ones
    // that cost a family money.
    const d = routeItem('NHIA', {
      list: 'PHARMACY', coveredByNHIA: true, fromCatalogue: true, nhiaPartial: false,
    });
    expect(d.coverageNote).toBeNull();
  });
});

describe('the script that writes the flags', () => {
  const script = fs.readFileSync(
    path.join(process.cwd(), 'scripts/maintenance/apply-nhia-coverage.ts'), 'utf8',
  );

  it('uses the application’s own matcher, not a copy of it', () => {
    // The first version re-implemented normaliseDrugName in plain JavaScript
    // so it could run without a TypeScript runtime. That is two copies of a
    // clinical rule kept in step by hand, and it lasted one afternoon.
    expect(script).toContain("from '../../src/lib/payer/nhiaMatch'");
    expect(script).toContain('matchNhia(row.name, row.strength)');
    expect(script).not.toContain('FORM_WORDS');
    expect(script).not.toContain('function normalise');
  });

  it('changes nothing without being told to', () => {
    expect(script).toContain("const APPLY = process.argv.includes('--apply')");
    expect(script).toContain('Nothing changed.');
    expect(script).toContain('re-run with --apply');
  });

  it('never unsets a flag a pharmacist set by hand', () => {
    // They have the circular in front of them and this file does not.
    expect(script).toContain('keptByHand');
    expect(script).toContain('covered by hand, kept');
  });

  it('leaves an unmatched item exactly where it is', () => {
    // An unmatched item costs a minute of attention; a wrongly matched one
    // costs a cancelled case.
    expect(script).toContain('no match, left as it is');
    expect(script).toContain('--unmatched');
  });

  it('says that booked cases are not re-routed', () => {
    expect(script).toContain('Cases already booked are NOT re-routed');
  });
});
