/**
 * Who pays, and which counter picks each line.
 *
 * On instruction, 25 November 2026: a mandatory payer category at booking, a
 * second pharmacy for the scheme, and per-item routing between the three
 * fulfilment units.
 *
 * THE TWO PROPERTIES WORTH DEFENDING, and everything here serves one of them:
 *
 *   A PRIVATE CASE MUST BEHAVE EXACTLY AS IT DID BEFORE. So must a case
 *   booked before this field existed. If that ever stops being true, the
 *   change has broken every theatre list in the hospital to serve the
 *   minority of cases that are insured.
 *
 *   AN ITEM MUST NEVER END UP WITH NOBODY. Every line gets exactly one
 *   counter, routing never drops a line, and a line nobody has classified
 *   goes where it goes today rather than to a counter that will refuse it.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  ALL_PAYER_CATEGORIES,
  BOOKABLE_PAYER_CATEGORIES,
  PAYER_BADGE,
  PAYER_LABEL,
  PAYER_REQUIRED_MESSAGE,
  coverageSchemeFor,
  isInsuredPayer,
  parsePayerCategory,
  payerIsSet,
  type PayerCategory,
} from '../../src/lib/payer/categories';
import {
  FULFILMENT_LABEL,
  coverageOf,
  groupByUnit,
  routeItem,
  routeRequestItems,
  uninsuredUnitFor,
  unitsVisibleTo,
} from '../../src/lib/payer/routing';
import {
  MIN_REASSIGN_NOTE,
  REASSIGN_REASONS,
  canOverrideRouting,
  canReassign,
  checkReassign,
  reassignNote,
  reassignTargetFor,
  splitQuantities,
} from '../../src/lib/payer/reassign';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const covered = { coveredByNHIA: true, coveredByCEmONC: true, fromCatalogue: true };
const notCovered = { coveredByNHIA: false, coveredByCEmONC: false, fromCatalogue: true };
const unlisted = { fromCatalogue: false };

describe('who pays', () => {
  it('offers four choices and never UNSPECIFIED', () => {
    // A required field with an escape hatch is not required. UNSPECIFIED is
    // a fact about cases booked before the question existed.
    expect(BOOKABLE_PAYER_CATEGORIES).toEqual(['NHIA', 'NHIS', 'CEmONC', 'PRIVATE']);
    expect(BOOKABLE_PAYER_CATEGORIES).not.toContain('UNSPECIFIED');
    expect(ALL_PAYER_CATEGORIES).toContain('UNSPECIFIED');
  });

  it('knows which of them is a scheme', () => {
    expect(isInsuredPayer('NHIA')).toBe(true);
    expect(isInsuredPayer('NHIS')).toBe(true);
    expect(isInsuredPayer('CEmONC')).toBe(true);
    expect(isInsuredPayer('PRIVATE')).toBe(false);
    // The one that matters: an unanswered case is not an insured case.
    expect(isInsuredPayer('UNSPECIFIED')).toBe(false);
    expect(isInsuredPayer(null)).toBe(false);
  });

  it('reads NHIS cover against the NHIA list', () => {
    // The one simplification this module makes, in one place so there is a
    // single line to change if the two ever diverge again.
    expect(coverageSchemeFor('NHIS')).toBe('NHIA');
    expect(coverageSchemeFor('NHIA')).toBe('NHIA');
    expect(coverageSchemeFor('CEmONC')).toBe('CEmONC');
    expect(coverageSchemeFor('PRIVATE')).toBeNull();
  });

  it('says plainly when it has not been answered', () => {
    expect(payerIsSet('UNSPECIFIED')).toBe(false);
    expect(payerIsSet('PRIVATE')).toBe(true);
    expect(PAYER_BADGE.UNSPECIFIED).toContain('not set');
    expect(PAYER_LABEL.UNSPECIFIED).toContain('not set');
  });

  it('refuses a value that is not one of ours', () => {
    expect(parsePayerCategory('NHIA')).toBe('NHIA');
    expect(parsePayerCategory('nhia')).toBeNull();
    expect(parsePayerCategory('HMO')).toBeNull();
    expect(parsePayerCategory(undefined)).toBeNull();
  });
});

describe('the routing table', () => {
  // The seven rows of the table in the brief, each as its own expectation.
  it('sends an insured patient’s covered drug to the NHIA Pharmacy', () => {
    expect(routeItem('NHIA', { list: 'PHARMACY', ...covered }).routedTo).toBe('NHIA_PHARMACY');
    expect(routeItem('NHIS', { list: 'PHARMACY', ...covered }).routedTo).toBe('NHIA_PHARMACY');
    expect(routeItem('CEmONC', { list: 'PHARMACY', ...covered }).routedTo).toBe('NHIA_PHARMACY');
  });

  it('sends an insured patient’s covered consumable to the NHIA Pharmacy', () => {
    expect(routeItem('NHIA', { list: 'CONSUMABLE', ...covered }).routedTo).toBe('NHIA_PHARMACY');
    expect(routeItem('CEmONC', { list: 'CONSUMABLE', ...covered }).routedTo).toBe('NHIA_PHARMACY');
  });

  it('sends an uncovered drug to the Theatre Pharmacy', () => {
    const d = routeItem('NHIA', { list: 'PHARMACY', ...notCovered });
    expect(d.routedTo).toBe('THEATRE_PHARMACY');
    expect(d.coverageNote).toBe('Not covered by NHIA. Patient pays.');
  });

  it('sends an uncovered consumable to the pack providers', () => {
    const c = routeItem('CEmONC', { list: 'CONSUMABLE', ...notCovered });
    expect(c.routedTo).toBe('CONSUMABLE_PACK');
    expect(c.coverageNote).toBe('Not covered by CEmONC. Patient pays.');
  });

  it('leaves a PRIVATE case exactly as it was', () => {
    // Acceptance criterion 3, and the one that would hurt most if it broke:
    // most cases are private, so a mistake here is every theatre list.
    const drug = routeItem('PRIVATE', { list: 'PHARMACY', ...covered });
    const cons = routeItem('PRIVATE', { list: 'CONSUMABLE', ...covered });
    expect(drug.routedTo).toBe('THEATRE_PHARMACY');
    expect(cons.routedTo).toBe('CONSUMABLE_PACK');
    // And says nothing about cover, because on a private case everything is
    // the patient's and a note on every line makes the words invisible.
    expect(drug.coverageNote).toBeNull();
    expect(cons.coverageNote).toBeNull();
  });

  it('leaves a case booked before the question existed exactly as it was', () => {
    // Acceptance criterion 6. UNSPECIFIED routes like PRIVATE -- which is
    // "as before" -- and differs only in what the screen says about it.
    for (const list of ['PHARMACY', 'CONSUMABLE'] as const) {
      expect(routeItem('UNSPECIFIED', { list, ...covered }).routedTo)
        .toBe(routeItem('PRIVATE', { list, ...covered }).routedTo);
      expect(routeItem('UNSPECIFIED', { list, ...covered }).coverageNote).toBeNull();
    }
  });
});

describe('an item the catalogue has never heard of', () => {
  it('is not covered, and is not pretended to be', () => {
    // Treating an unknown item as covered sends it to a counter that will
    // refuse it, with the patient already on the list.
    const r = routeItem('NHIA', { list: 'PHARMACY', ...unlisted });
    expect(r.routedTo).toBe('THEATRE_PHARMACY');
    expect(coverageOf('NHIA', { list: 'PHARMACY', ...unlisted })).toEqual({ covered: false, known: false });
  });

  it('is flagged for the NHIA Pharmacy rather than silently charged', () => {
    // "Not classified" and "not covered" are different facts. Only the
    // first one is somebody's job to fix.
    const r = routeItem('NHIA', { list: 'CONSUMABLE', ...unlisted });
    expect(r.needsCoverageReview).toBe(true);
    expect(r.coverageNote).toContain('NHIA Pharmacy to confirm');
    expect(routeItem('NHIA', { list: 'CONSUMABLE', ...notCovered }).needsCoverageReview).toBe(false);
  });

  it('is not a review item on a private case, because there is nothing to review', () => {
    expect(routeItem('PRIVATE', { list: 'CONSUMABLE', ...unlisted }).needsCoverageReview).toBe(false);
  });
});

describe('routing a whole list', () => {
  it('answers for every line, in order, and drops none', () => {
    // A routing that silently lost a line would be a line nobody is picking.
    const items = [
      { list: 'PHARMACY' as const, ...covered },
      { list: 'PHARMACY' as const, ...notCovered },
      { list: 'CONSUMABLE' as const, ...covered },
      { list: 'CONSUMABLE' as const, ...unlisted },
    ];
    const out = routeRequestItems('NHIA', items);
    expect(out).toHaveLength(items.length);
    expect(out.map((r) => r.routedTo)).toEqual([
      'NHIA_PHARMACY', 'THEATRE_PHARMACY', 'NHIA_PHARMACY', 'CONSUMABLE_PACK',
    ]);
  });

  it('splits one booking across all three counters', () => {
    // Acceptance criterion 2, as the data would actually look.
    const rows = routeRequestItems('NHIA', [
      { list: 'PHARMACY', ...covered },
      { list: 'PHARMACY', ...notCovered },
      { list: 'CONSUMABLE', ...notCovered },
    ]).map((r) => ({ routedTo: r.routedTo }));
    const groups = groupByUnit(rows);
    expect(groups.map((g) => g.unit)).toEqual([
      'NHIA_PHARMACY', 'THEATRE_PHARMACY', 'CONSUMABLE_PACK',
    ]);
  });

  it('knows where an uncovered line of each kind belongs', () => {
    expect(uninsuredUnitFor('PHARMACY')).toBe('THEATRE_PHARMACY');
    expect(uninsuredUnitFor('CONSUMABLE')).toBe('CONSUMABLE_PACK');
  });
});

describe('who sees which queue', () => {
  it('shows each unit only its own lines', () => {
    // Acceptance criterion 8.
    expect(unitsVisibleTo('NHIA_PHARMACY')).toEqual(['NHIA_PHARMACY']);
    expect(unitsVisibleTo('PHARMACIST')).toEqual(['THEATRE_PHARMACY']);
    expect(unitsVisibleTo('CONSUMABLE_PACK_PROVIDER')).toEqual(['CONSUMABLE_PACK']);
  });

  it('shows the booking team everything for their case', () => {
    for (const role of ['SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'THEATRE_MANAGER']) {
      expect(unitsVisibleTo(role), role).toHaveLength(3);
    }
  });

  it('follows role inheritance rather than a bare list', () => {
    // A Head of Surgery stands in for CONSULTANT_SURGEON, and a house
    // officer for SURGEON. A raw includes would show them an empty pack.
    expect(unitsVisibleTo('HEAD_OF_SURGERY')).toHaveLength(3);
    expect(unitsVisibleTo('HOUSE_OFFICER')).toHaveLength(3);
    // The Head of Pharmacy stands in for the pharmacist, and gets that
    // queue -- not the scheme's.
    expect(unitsVisibleTo('HEAD_OF_PHARMACY')).toContain('THEATRE_PHARMACY');
  });

  it('shows a porter nothing', () => {
    expect(unitsVisibleTo('PORTER')).toEqual([]);
    expect(unitsVisibleTo(null)).toEqual([]);
  });
});

describe('the NHIA Pharmacy sending a line on', () => {
  const BY = { byId: 'u1', byRole: 'NHIA_PHARMACY' };
  const LINE = {
    currentUnit: 'NHIA_PHARMACY' as const,
    currentStatus: 'REQUESTED',
    currentQuantity: 5,
  };

  it('is allowed to the scheme’s own counter and nobody else', () => {
    expect(canReassign('NHIA_PHARMACY')).toBe(true);
    for (const role of ['PHARMACIST', 'CONSUMABLE_PACK_PROVIDER', 'SURGEON', 'ADMIN']) {
      expect(canReassign(role), role).toBe(false);
    }
  });

  it('is one-directional, and the rule is in the core not the screen', () => {
    // Two counters each insisting the other owns an item is how a patient
    // waits for both. The receiving unit cannot push it back.
    for (const unit of ['THEATRE_PHARMACY', 'CONSUMABLE_PACK'] as const) {
      const r = checkReassign({ ...LINE, currentUnit: unit, reasonCode: 'NOT_COVERED', ...BY });
      expect(r.ok, unit).toBe(false);
      expect(r.problem, unit).toContain('never back');
    }
    // An administrator is the only way back, and it is a separate power.
    expect(canOverrideRouting('ADMIN')).toBe(true);
    expect(canOverrideRouting('NHIA_PHARMACY')).toBe(false);
  });

  it('sends a drug to the Theatre Pharmacy and a consumable to the packs', () => {
    expect(reassignTargetFor('PHARMACY')).toBe('THEATRE_PHARMACY');
    expect(reassignTargetFor('CONSUMABLE')).toBe('CONSUMABLE_PACK');
  });

  it('insists on one of the four reasons', () => {
    expect(REASSIGN_REASONS.map((r) => r.code)).toEqual([
      'NOT_COVERED', 'OUT_OF_STOCK', 'EXCEEDS_LIMIT', 'OTHER',
    ]);
    expect(checkReassign({ ...LINE, reasonCode: 'BECAUSE', ...BY }).ok).toBe(false);
    expect(checkReassign({ ...LINE, reasonCode: 'OUT_OF_STOCK', ...BY }).ok).toBe(true);
  });

  it('makes "Other" say what it means', () => {
    // The receiving unit reads it to decide what to do. "Other" alone
    // answers nothing.
    expect(checkReassign({ ...LINE, reasonCode: 'OTHER', ...BY }).ok).toBe(false);
    expect(checkReassign({ ...LINE, reasonCode: 'OTHER', detail: 'short', ...BY }).ok).toBe(false);
    expect(checkReassign({
      ...LINE, reasonCode: 'OTHER', detail: 'Scheme suspended for this enrolee this month.', ...BY,
    }).ok).toBe(true);
    expect(MIN_REASSIGN_NOTE).toBeGreaterThan(5);
  });

  it('will not move a withdrawn or delivered line', () => {
    expect(checkReassign({ ...LINE, currentStatus: 'CANCELLED', reasonCode: 'NOT_COVERED', ...BY }).ok)
      .toBe(false);
    const d = checkReassign({ ...LINE, currentStatus: 'DELIVERED', reasonCode: 'NOT_COVERED', ...BY });
    expect(d.ok).toBe(false);
    expect(d.problem).toContain('already been delivered');
  });

  it('splits the line when the scheme covers only part of it', () => {
    // "Covers 2 of 5" is not "not covered". It is two lines.
    const r = checkReassign({ ...LINE, moveQuantity: 3, reasonCode: 'EXCEEDS_LIMIT', ...BY });
    expect(r.ok).toBe(true);
    expect(r.splits).toBe(true);
    expect(splitQuantities(5, 3)).toEqual({ stays: 2, moves: 3 });
    // The whole line is not a split.
    expect(checkReassign({ ...LINE, moveQuantity: 5, reasonCode: 'NOT_COVERED', ...BY }).splits)
      .toBe(false);
    expect(splitQuantities(5, null)).toEqual({ stays: 0, moves: 5 });
  });

  it('refuses to move more than there are', () => {
    const r = checkReassign({ ...LINE, moveQuantity: 9, reasonCode: 'NOT_COVERED', ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain('only 5');
  });

  it('writes a reason the receiving unit can read', () => {
    expect(reassignNote('NOT_COVERED')).toBe('Not covered by scheme');
    expect(reassignNote('OTHER', 'Scheme suspended this month'))
      .toBe('Other (specify) — Scheme suspended this month');
  });
});

/**
 * The parts that cannot be seen from the pure core.
 *
 * Each of these is a silent failure if it regresses: a booking that saves
 * without an answer, a legacy case whose routing moves, a dispensed line
 * re-routed to a second counter, or a pharmacist's decision quietly
 * overruled by the next edit.
 */
describe('the wiring', () => {
  it('refuses a booking with no payer category, in the same words on both sides', () => {
    const api = read('src/app/api/surgeries/route.ts');
    const form = read('src/app/dashboard/surgeries/new/page.tsx');
    expect(PAYER_REQUIRED_MESSAGE).toContain('NHIA, NHIS, CEmONC or Private');
    expect(api).toContain("payerCategory: z.enum(['NHIA', 'NHIS', 'CEmONC', 'PRIVATE']");
    expect(api).toContain('required_error: PAYER_REQUIRED_MESSAGE');
    // The form says it too, so the surgeon is not told by the server after
    // filling in everything else -- and says it in the SAME words.
    expect(form).toContain('if (!payerCategory) {');
    expect(form).toContain('setError(PAYER_REQUIRED_MESSAGE)');
  });

  it('keeps every existing case on its current routing', () => {
    const migration = read(
      'prisma/migrations/20261125140000_payer_category_and_nhia_pharmacy/migration.sql',
    );
    expect(migration).toContain('"payerCategory"    "PayerCategory" NOT NULL DEFAULT \'UNSPECIFIED\'');
    // Consumables default to the pack providers, drugs are moved to the
    // Theatre Pharmacy -- which is exactly where each goes today.
    expect(migration).toContain('"routedTo"         "FulfilmentUnit" NOT NULL DEFAULT \'CONSUMABLE_PACK\'');
    expect(migration).toContain('UPDATE "surgery_drug_dressing_requests"');
    expect(migration).toContain("SET \"routedTo\" = 'THEATRE_PHARMACY'");
  });

  it('starts every catalogue item as not covered', () => {
    const migration = read(
      'prisma/migrations/20261125140000_payer_category_and_nhia_pharmacy/migration.sql',
    );
    // A wrong `true` sends an item to a counter that will refuse it. False
    // sends it where it already goes, and is ticked as cover is confirmed.
    expect(migration).toContain('"coveredByNHIA"   BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"coveredByCEmONC" BOOLEAN NOT NULL DEFAULT false');
  });

  it('routes through the one service, from every caller', () => {
    const api = read('src/app/api/surgeries/route.ts');
    expect(api).toContain('applyRoutingToSurgery(surgery.id)');
    const service = read('src/lib/payer/applyRouting.ts');
    expect(service).toContain('routeItem(');
  });

  it('never re-routes a line that has left the shelf', () => {
    const service = read('src/lib/payer/applyRouting.ts');
    expect(service).toContain("const DISPENSED = ['DELIVERED']");
    expect(service.match(/DISPENSED\.includes/g) ?? []).toHaveLength(2);
  });

  it('never overrules the pharmacist who sent a line on', () => {
    // Recomputing it from the catalogue flags would undo their decision,
    // then do it again at the next edit, until they stopped using the
    // button. An administrator can force it; nothing else can.
    const service = read('src/lib/payer/applyRouting.ts');
    expect(service.match(/row\.reassignedFrom && !opts\.force/g) ?? []).toHaveLength(2);
  });

  it('shows each provider queue only its own unit', () => {
    for (const p of [
      'src/app/api/drug-dressing-requests/route.ts',
      'src/app/api/consumable-requests/route.ts',
    ]) {
      const src = read(p);
      expect(src, p).toContain('unitsVisibleTo(');
      expect(src, p).toContain('where.routedTo = { in: visible }');
    }
  });

  it('gives the NHIA desk a role, a page, a menu entry and a duty sheet', () => {
    // The four lists that have drifted apart before, plus the guard that
    // fails the suite when a role has no duties.
    expect(read('prisma/schema.prisma')).toContain('NHIA_PHARMACY');
    expect(read('src/lib/onboarding-roles.ts')).toContain("'NHIA_PHARMACY'");
    expect(read('src/app/api/users/bulk-upload/route.ts')).toContain("'NHIA_PHARMACY'");
    expect(read('src/app/dashboard/users/page.tsx')).toContain("'NHIA_PHARMACY'");
    expect(read('src/app/role-guide/page.tsx')).toContain("id: 'NHIA_PHARMACY'");
    expect(read('src/lib/workflowDuties.ts')).toContain("roles: ['NHIA_PHARMACY']");
    expect(read('src/lib/modules.ts')).toContain("id: 'nhia-pharmacy'");
    expect(read('src/app/dashboard/layout.tsx')).toContain("'/dashboard/nhia-pharmacy'");
  });

  it('renames the existing pharmacy without touching its identity', () => {
    // Acceptance criterion 4: a label change, not a delete-and-recreate.
    // The module id, the path and the role are untouched, so every grant
    // and every row of history still points at the same thing.
    const modules = read('src/lib/modules.ts');
    expect(modules).toContain("id: 'prescriptions', label: 'Theatre Pharmacy'");
    expect(modules).toContain("paths: ['/dashboard/prescriptions']");
    expect(read('src/app/dashboard/prescriptions/page.tsx')).toContain('Theatre Pharmacy');
    expect(read('src/lib/workflowDuties.ts')).toContain("title: 'Theatre Pharmacy'");
    // PHARMACIST is still PHARMACIST. Renaming the enum value would orphan
    // every existing account.
    expect(read('src/lib/onboarding-roles.ts')).toContain("value: 'PHARMACIST'");
  });

  it('labels the three counters the way people say them', () => {
    expect(FULFILMENT_LABEL.NHIA_PHARMACY).toBe('NHIA Pharmacy');
    expect(FULFILMENT_LABEL.THEATRE_PHARMACY).toBe('Theatre Pharmacy');
    expect(FULFILMENT_LABEL.CONSUMABLE_PACK).toBe('Consumable Pack Providers');
  });
});
