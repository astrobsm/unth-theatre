/**
 * Stage 2: correcting who pays, showing it, and counting it.
 *
 * THE ARITHMETIC IS THE POINT OF THE REPORT, so most of this file exercises
 * it against rows rather than against a screenshot. Two numbers are kept
 * apart on purpose and a test defends each: an item the NHIA desk SENT BACK
 * is not the same fact as an item that never reached it, because the first
 * says the scheme refused and the second says the catalogue never offered.
 * Merged, the report would say the schemes are difficult when the truth is
 * that nobody has ticked the flags.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  coverageRate,
  summariseCoverage,
  type SummaryRow,
} from '../../src/lib/payer/coverageSummary';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const row = (over: Partial<SummaryRow> = {}): SummaryRow => ({
  list: 'PHARMACY',
  name: 'Cefazolin',
  quantity: 1,
  payerCategory: 'NHIA',
  routedTo: 'NHIA_PHARMACY',
  status: 'REQUESTED',
  ...over,
});

describe('the coverage summary', () => {
  it('counts what was asked for, what was taken, and what came back', () => {
    const s = summariseCoverage([
      row(),                                             // covered
      row(),                                             // covered
      row({ routedTo: 'THEATRE_PHARMACY' }),             // never covered
      row({ routedTo: 'THEATRE_PHARMACY', reassignedFrom: 'NHIA_PHARMACY' }), // sent back
    ]);
    const nhia = s.schemes.find((x) => x.scheme === 'NHIA')!;
    expect(nhia.requested).toBe(4);
    expect(nhia.covered).toBe(2);
    expect(nhia.reassigned).toBe(1);
    expect(nhia.notCovered).toBe(1);
  });

  it('keeps "sent back by the desk" apart from "never covered"', () => {
    // The distinction the whole report turns on. One says the scheme
    // refused; the other says the catalogue never offered it. Merged, the
    // report blames the scheme for an untick.
    const sentBack = summariseCoverage([
      row({ routedTo: 'THEATRE_PHARMACY', reassignedFrom: 'NHIA_PHARMACY' }),
    ]).schemes.find((x) => x.scheme === 'NHIA')!;
    expect(sentBack.reassigned).toBe(1);
    expect(sentBack.notCovered).toBe(0);

    const neverCovered = summariseCoverage([
      row({ routedTo: 'THEATRE_PHARMACY' }),
    ]).schemes.find((x) => x.scheme === 'NHIA')!;
    expect(neverCovered.reassigned).toBe(0);
    expect(neverCovered.notCovered).toBe(1);
  });

  it('does not count a withdrawn line as a request', () => {
    // Counting them would flatter every figure in the report.
    const s = summariseCoverage([
      row(),
      row({ status: 'CANCELLED' }),
      row({ status: 'CANCELLED', routedTo: 'THEATRE_PHARMACY' }),
    ]);
    expect(s.schemes.find((x) => x.scheme === 'NHIA')!.requested).toBe(1);
    expect(s.totals.insuredLines).toBe(1);
  });

  it('ignores private cases entirely', () => {
    // They are not an insurance question, and including them would make
    // every coverage rate meaningless.
    const s = summariseCoverage([
      row({ payerCategory: 'PRIVATE', routedTo: 'THEATRE_PHARMACY' }),
      row({ payerCategory: 'UNSPECIFIED', routedTo: 'THEATRE_PHARMACY' }),
      row(),
    ]);
    expect(s.totals.insuredLines).toBe(1);
    expect(s.schemes.reduce((n, x) => n + x.requested, 0)).toBe(1);
  });

  it('counts each scheme on its own', () => {
    const s = summariseCoverage([
      row({ payerCategory: 'NHIA' }),
      row({ payerCategory: 'NHIS' }),
      row({ payerCategory: 'CEmONC' }),
      row({ payerCategory: 'CEmONC' }),
    ]);
    expect(s.schemes.map((x) => [x.scheme, x.requested])).toEqual([
      ['NHIA', 1], ['NHIS', 1], ['CEmONC', 2],
    ]);
  });

  it('counts units as well as lines, because the money follows units', () => {
    const s = summariseCoverage([
      row({ quantity: 10 }),
      row({ quantity: 4, routedTo: 'THEATRE_PHARMACY' }),
    ]);
    const nhia = s.schemes.find((x) => x.scheme === 'NHIA')!;
    expect(nhia.requestedUnits).toBe(14);
    expect(nhia.coveredUnits).toBe(10);
  });

  it('names what keeps coming back, most frequent first', () => {
    // The actionable half. Forty refusals of one item is either a booking
    // standard to change or a flag nobody has ticked -- both fixable, and
    // neither visible without counting.
    const rows = [
      ...Array.from({ length: 3 }, () => row({ name: 'Mesh', routedTo: 'THEATRE_PHARMACY' })),
      row({ name: 'Gauze', list: 'CONSUMABLE', routedTo: 'CONSUMABLE_PACK', quantity: 20 }),
      row(),
    ];
    const s = summariseCoverage(rows);
    expect(s.topNonCovered[0]).toMatchObject({ name: 'Mesh', times: 3 });
    expect(s.topNonCovered.map((i) => i.name)).not.toContain('Cefazolin');
    expect(s.topNonCovered.find((i) => i.name === 'Gauze')!.units).toBe(20);
  });

  it('breaks a tie on quantity, because twenty of a thing costs more', () => {
    const s = summariseCoverage([
      row({ name: 'A', routedTo: 'THEATRE_PHARMACY', quantity: 1 }),
      row({ name: 'B', routedTo: 'THEATRE_PHARMACY', quantity: 20 }),
    ]);
    expect(s.topNonCovered.map((i) => i.name)).toEqual(['B', 'A']);
  });

  it('reports the reasons the desk gave, where it gave any', () => {
    const s = summariseCoverage([
      row({ name: 'Mesh', routedTo: 'THEATRE_PHARMACY', reassignedFrom: 'NHIA_PHARMACY', reassignReason: 'Out of stock' }),
      row({ name: 'Mesh', routedTo: 'THEATRE_PHARMACY', reassignedFrom: 'NHIA_PHARMACY', reassignReason: 'Out of stock' }),
      row({ name: 'Mesh', routedTo: 'THEATRE_PHARMACY', reassignedFrom: 'NHIA_PHARMACY', reassignReason: 'Not covered by scheme' }),
    ]);
    expect(s.topNonCovered[0].reasons[0]).toBe('Out of stock');
  });

  it('gives a coverage rate, and nought rather than a division by zero', () => {
    expect(coverageRate({
      scheme: 'NHIA', requested: 4, covered: 1, reassigned: 0, notCovered: 3,
      requestedUnits: 0, coveredUnits: 0,
    })).toBe(25);
    expect(coverageRate({
      scheme: 'NHIA', requested: 0, covered: 0, reassigned: 0, notCovered: 0,
      requestedUnits: 0, coveredUnits: 0,
    })).toBe(0);
  });

  it('carries through the counts the route hands it', () => {
    const s = summariseCoverage([row()], {
      insuredCases: 7, unspecifiedCases: 3, unclassified: 12,
    });
    expect(s.totals.insuredCases).toBe(7);
    expect(s.unspecifiedCases).toBe(3);
    expect(s.unclassified).toBe(12);
  });
});

describe('correcting who pays', () => {
  const put = read('src/app/api/surgeries/[id]/route.ts');

  it('re-routes the pack list when the category changes', () => {
    // A correction that updated the column and left the rows where they
    // were would be worse than no correction: the screen would say one
    // thing and three pharmacies would do another.
    expect(put).toContain('const payerChanged =');
    expect(put).toContain('rerouted = await applyRoutingToSurgery(id)');
  });

  it('does not re-route when nothing about the payer moved', () => {
    expect(put).toContain('if (payerChanged) {');
    // The flag is built by comparing with what is already stored, not from
    // the presence of the field in the body: a form that posts every field
    // every time would otherwise re-route on every unrelated edit.
    expect(put).toContain("parsedPayer !== existingSurgery.payerCategory");
  });

  it('will not let an edit put a case back to UNSPECIFIED', () => {
    // That would silently return its pack list to the old routing and tell
    // nobody. UNSPECIFIED is a fact about history, not a choice.
    expect(put).toContain("parsedPayer === 'UNSPECIFIED'");
    expect(put).toContain('PAYER_REQUIRED_MESSAGE');
  });

  it('records the change and its consequences in the audit trail', () => {
    // "payerCategory moved from NHIA to PRIVATE" and "nine lines moved
    // counter as a result" are two questions somebody will ask later.
    expect(put).toContain('payerCategoryChange: {');
    expect(put).toContain('from: existingSurgery.payerCategory');
    expect(put).toContain('rerouted,');
  });

  it('coerces the corps-member tick rather than trusting a form string', () => {
    // A string "false" is truthy, and this one decides which counter a
    // corps member's drugs come from.
    expect(put).toContain('updateData.payerIsNyscCorps = payerIsNyscCorps === true');
  });
});

describe('showing who pays', () => {
  it('uses one badge everywhere, with one set of words', () => {
    // A badge that says NHIA on one screen and "Insured" on another is two
    // facts as far as the reader is concerned.
    const badge = read('src/components/PayerBadge.tsx');
    expect(badge).toContain('PAYER_BADGE[key]');
    expect(badge).not.toMatch(/'NHIA'\s*:\s*'/);
  });

  it('shows an unset category rather than hiding it', () => {
    // The only way legacy cases get fixed is by being visible on a list
    // somebody is already reading.
    const badge = read('src/components/PayerBadge.tsx');
    expect(badge).toContain('border-amber-300');
    expect(badge).toContain('PAYER_UNSET_PROMPT');
  });

  it('is on the case card, the case page and the printed list', () => {
    const list = read('src/app/dashboard/surgeries/page.tsx');
    const detail = read('src/app/dashboard/surgeries/[id]/page.tsx');
    expect(list).toContain('<PayerBadge');
    expect(detail).toContain('<PayerBadge');
    // The printout is plain HTML, so it carries the words rather than the
    // component.
    expect(list).toContain('<th style="width:5%">Payer</th>');
    expect(list).toContain('PAYER_BADGE[(s.payerCategory');
  });

  it('is on the wire for the list, not only the case page', () => {
    const api = read('src/app/api/surgeries/route.ts');
    expect(api).toContain('payerCategory: true, payerSchemeId: true, payerIsNyscCorps: true');
  });

  it('asks for a legacy case to be set, where somebody is already looking', () => {
    const detail = read('src/app/dashboard/surgeries/[id]/page.tsx');
    expect(detail).toContain("surgery.payerCategory === 'UNSPECIFIED'");
    expect(detail).toContain('PAYER_UNSET_PROMPT');
  });
});

describe('the report itself', () => {
  const route = read('src/app/api/reports/insurance-coverage/route.ts');
  const page = read('src/app/dashboard/reports/insurance-coverage/page.tsx');

  it('refuses to count the whole history of the hospital', () => {
    expect(route).toContain('Give a date range');
  });

  it('is readable by the desk whose work it describes', () => {
    // A report the NHIA Pharmacy cannot open is a report nobody acts on.
    const roles = route.slice(route.indexOf('const MAY_READ'), route.indexOf('];', route.indexOf('const MAY_READ')));
    expect(roles).toContain('NHIA_PHARMACY');
    expect(roles).toContain('THEATRE_MANAGER');
    expect(roles).not.toContain("'PORTER'");
  });

  it('counts only insured cases, in the database query', () => {
    expect(route).toContain("payerCategory: { in: ['NHIA', 'NHIS', 'CEmONC'] }");
  });

  it('can be taken away as a file', () => {
    expect(page).toContain('exportToCSV');
  });

  it('has a module, a page and a menu entry', () => {
    expect(read('src/lib/modules.ts')).toContain("id: 'insurance-coverage'");
    expect(read('src/app/dashboard/layout.tsx')).toContain("'/dashboard/reports/insurance-coverage'");
  });
});
