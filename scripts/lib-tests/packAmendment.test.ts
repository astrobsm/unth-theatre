/**
 * Changing what a case is packed with, after it was booked.
 *
 * The list is a message to the pack provider, not a note to self, and every
 * test here defends that: a change nobody can see, or can see but cannot
 * interpret, is the verbal correction at the theatre door in a new costume.
 */
import { describe, expect, it } from 'vitest';

import fs from 'fs';
import path from 'path';

import {
  MAX_PACK_QUANTITY,
  MAX_SIZE_LENGTH,
  MAX_UNIT_LENGTH,
  MIN_PACK_REASON,
  activeLines,
  canEditPack,
  changeSummary,
  checkAddition,
  checkQuantityChange,
  checkRemoval,
  quantityChangeLabel,
  quantityChanged,
  unitsFor,
} from '../../src/lib/theatreOps/packAmendment';

const REASON = 'Switching to a lightweight mesh for this repair.';
const BY = { byId: 'u1', byRole: 'SURGEON' };

describe('who may change a pack list', () => {
  it('allows the surgical team, house officers included', () => {
    // House officers do most of the booking. Letting somebody create a list
    // but never correct it produces a verbal correction instead, which is the
    // failure being fixed.
    for (const r of ['SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'REGISTRAR']) {
      expect(canEditPack(r), r).toBe(true);
    }
  });

  it('does not allow the pack provider to change it', () => {
    // Spotting that something is missing is not the same as deciding what a
    // case needs; a provider quietly adding an item is how a tray and a record
    // diverge.
    expect(canEditPack('CONSUMABLE_PACK_PROVIDER')).toBe(false);
    expect(canEditPack('PHARMACIST')).toBe(false);
    expect(canEditPack(null)).toBe(false);
  });
});

describe('removing an item', () => {
  it('accepts a removal with a reason', () => {
    const r = checkRemoval({ currentStatus: 'REQUESTED', reason: REASON, ...BY });
    expect(r.ok).toBe(true);
  });

  it('ALLOWS a removal with no reason at all', () => {
    // This test used to demand the opposite, and the reasoning was sound:
    // the provider reads the reason to decide whether to repack a tray or
    // simply not add the item.
    //
    // It lost to how often the action happens. A pack composed from a
    // standard always carries something this patient does not need, so
    // removing a line is the commonest correction on the screen, and a
    // ten-character sentence demanded for each one made the quickest edit
    // the slowest. Asked for directly.
    //
    // The box is still offered and a reason still travels when it is given.
    // What has gone is the refusal.
    for (const reason of ['', 'no', '   ']) {
      const r = checkRemoval({ currentStatus: 'REQUESTED', reason, ...BY });
      expect(r.ok, JSON.stringify(reason)).toBe(true);
      expect(r.problem, JSON.stringify(reason)).toBeNull();
    }
  });

  it('still demands one for an ADDITION', () => {
    // The asymmetry is deliberate. Adding is rarer, it costs the hospital
    // money and the family a bigger deposit, and nobody downstream can guess
    // why a line appeared.
    const r = checkAddition({ name: 'Ceftriaxone 1 g', quantity: 1, reason: 'no', ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain(String(MIN_PACK_REASON));
  });

  it('still refuses a removal from somebody who may not edit the pack', () => {
    // Dropping the reason must not drop the authorisation with it.
    const r = checkRemoval({
      currentStatus: 'REQUESTED', reason: '', byId: 'u1', byRole: 'PORTER',
    });
    expect(r.ok).toBe(false);
  });

  it('refuses to remove something already removed', () => {
    const r = checkRemoval({ currentStatus: 'CANCELLED', reason: REASON, ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain('already been removed');
  });

  it('flags a removal the provider has already acted on', () => {
    // They may already have picked it. The change has to reach a person, not
    // just a screen.
    for (const s of ['PACKING', 'PACKED', 'DELIVERED']) {
      const r = checkRemoval({ currentStatus: s, reason: REASON, ...BY });
      expect(r.ok, s).toBe(true);
      expect(r.requiresProviderNotice, s).toBe(true);
    }
  });

  it('raises no notice for an item nobody has touched', () => {
    expect(checkRemoval({ currentStatus: 'REQUESTED', reason: REASON, ...BY }).requiresProviderNotice).toBe(false);
  });
});

describe('adding an item', () => {
  it('accepts a named item with a quantity and a reason', () => {
    const r = checkAddition({ name: 'Prolene 2/0', quantity: 3, reason: REASON, ...BY });
    expect(r.ok).toBe(true);
  });

  it('refuses an unnamed item', () => {
    expect(checkAddition({ name: '  ', quantity: 1, reason: REASON, ...BY }).ok).toBe(false);
  });

  it('refuses a nonsense quantity', () => {
    for (const q of [0, -2, 1.5]) {
      expect(checkAddition({ name: 'Mesh', quantity: q, reason: REASON, ...BY }).ok, String(q)).toBe(false);
    }
  });

  it('flags an addition made after the list was packed', () => {
    const r = checkAddition({
      name: 'Mesh', quantity: 1, reason: REASON, listAlreadyPacked: true, ...BY,
    });
    expect(r.ok).toBe(true);
    expect(r.requiresProviderNotice).toBe(true);
  });
});

describe('what the provider is asked for', () => {
  const lines = [
    { id: 'a', name: 'Gloves 7.5', quantity: 4, status: 'PACKED' },
    { id: 'b', name: 'Heavyweight mesh', quantity: 1, status: 'CANCELLED' },
    { id: 'c', name: 'Lightweight mesh', quantity: 1, status: 'REQUESTED', addedAfterBooking: true },
  ];

  it('excludes withdrawn lines from the live list', () => {
    expect(activeLines(lines).map((l) => l.id)).toEqual(['a', 'c']);
  });

  it('keeps the withdrawn line on the record', () => {
    // The provider may already have picked it, and a list that silently loses
    // a line looks like a list that never had it.
    expect(lines.find((l) => l.id === 'b')).toBeTruthy();
  });

  it('summarises a change as a sentence, not a diff', () => {
    // Read on a phone by somebody deciding whether to walk back to the store.
    const s = changeSummary(
      [lines[2]], [lines[1]], 'Theatre 2 · Hernia repair',
    );
    expect(s).toContain('1 item added (Lightweight mesh)');
    expect(s).toContain('1 withdrawn (Heavyweight mesh)');
  });

  it('says plainly when a resubmission changed nothing', () => {
    expect(changeSummary([], [], 'Theatre 2 · Hernia repair')).toContain('no changes');
  });
});


/**
 * CHANGING HOW MANY, asked for directly on 25 November 2026.
 *
 * A pack is composed from a standard and the standard is an average, so the
 * commonest thing a surgeon wants to say about a line is not "remove it" but
 * "eight of these, not one". Before this the only way to say it was to
 * withdraw the line and add it again -- two decisions in the provider's
 * notification where there was only one, and the connection between them
 * lost.
 */
describe('changing how many, and of what unit', () => {
  const LINE = { currentStatus: 'REQUESTED', currentQuantity: 1, currentUnit: 'pair' };

  it('lets the surgical team change a quantity', () => {
    const r = checkQuantityChange({ ...LINE, quantity: 8, ...BY });
    expect(r.ok).toBe(true);
    expect(r.problem).toBeNull();
  });

  it('asks for no reason, unlike adding', () => {
    // Following removal rather than addition. Correcting a number a standard
    // supplied is the ordinary business of this screen; a sentence demanded
    // for each one is what stops people correcting them at all.
    expect(checkQuantityChange({ ...LINE, quantity: 8, ...BY }).ok).toBe(true);
  });

  it('refuses anybody outside the surgical team', () => {
    // Including the pack provider. Spotting that a number looks wrong is not
    // the same as deciding what a case needs.
    for (const role of ['CONSUMABLE_PACK_PROVIDER', 'PORTER', 'CLEANER']) {
      const r = checkQuantityChange({ ...LINE, quantity: 8, byId: 'u1', byRole: role });
      expect(r.ok, role).toBe(false);
    }
  });

  it('lets a house officer change one', () => {
    // They do most of the booking, and since 25 November they hold a
    // surgeon's access. Through roleAllowed, so inheritance is seen.
    expect(checkQuantityChange({ ...LINE, quantity: 8, byId: 'u1', byRole: 'HOUSE_OFFICER' }).ok)
      .toBe(true);
  });

  it('will not change a line that has been withdrawn', () => {
    const r = checkQuantityChange({ ...LINE, currentStatus: 'CANCELLED', quantity: 8, ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain('withdrawn');
  });

  it('catches the missed keystroke', () => {
    // 80 pairs typed for 8 is a plausible slip on this screen and reaches
    // the store as a real order.
    const r = checkQuantityChange({ ...LINE, quantity: MAX_PACK_QUANTITY + 1, ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain(String(MAX_PACK_QUANTITY));
  });

  it('refuses a fraction, a zero and a negative', () => {
    for (const q of [0, -3, 2.5]) {
      expect(checkQuantityChange({ ...LINE, quantity: q, ...BY }).ok, String(q)).toBe(false);
    }
  });

  it('refuses a blank unit and a sentence pretending to be one', () => {
    expect(checkQuantityChange({ ...LINE, unit: '   ', ...BY }).ok).toBe(false);
    expect(checkQuantityChange({ ...LINE, unit: 'x'.repeat(MAX_UNIT_LENGTH + 1), ...BY }).ok)
      .toBe(false);
  });

  it('accepts a unit the standard list has never heard of', () => {
    // The catalogue holds units these lists do not name. Refusing to save
    // because a line already says "500ml bag" would turn a quantity
    // correction into a dead end.
    expect(checkQuantityChange({ ...LINE, unit: '500ml bag', ...BY }).ok).toBe(true);
  });

  it('tells the provider when the item was already being picked', () => {
    for (const status of ['PACKING', 'PACKED', 'DELIVERED']) {
      const r = checkQuantityChange({ ...LINE, currentStatus: status, quantity: 8, ...BY });
      expect(r.ok, status).toBe(true);
      expect(r.requiresProviderNotice, status).toBe(true);
    }
    expect(checkQuantityChange({ ...LINE, quantity: 8, ...BY }).requiresProviderNotice).toBe(false);
  });

  it('treats a line nobody actually changed as a no-op, not an error', () => {
    // Reporting "nothing was changed" for a line nobody meant to change
    // would bury the one problem that mattered under two that did not.
    expect(quantityChanged({ currentQuantity: 1, currentUnit: 'pair', quantity: 1, unit: 'pair' }))
      .toBe(false);
    expect(quantityChanged({ currentQuantity: 1, currentUnit: 'pair', quantity: 8 })).toBe(true);
    expect(quantityChanged({ currentQuantity: 1, currentUnit: 'pair', unit: 'pairs' })).toBe(true);
  });

  it('offers units that suit the list it is on', () => {
    expect(unitsFor('PHARMACY')).toContain('vial');
    expect(unitsFor('PHARMACY')).not.toContain('metre');
    expect(unitsFor('CONSUMABLE')).toContain('pair');
    expect(unitsFor('CONSUMABLE')).not.toContain('ampoule');
  });

  it('reads as the change it is', () => {
    expect(quantityChangeLabel(
      { quantity: 1, unit: 'pair' },
      { quantity: 8, unit: 'pairs' },
    )).toBe('1 pair \u2192 8 pairs');
    expect(quantityChangeLabel({ quantity: 2 }, { quantity: 1 })).toBe('2 \u2192 1');
    // And the size, because "8 x Syringe" says nothing a storekeeper can act on.
    expect(quantityChangeLabel(
      { quantity: 8, unit: 'piece', size: '5 mL' },
      { quantity: 10, unit: 'piece', size: '10 mL' },
    )).toBe('8 piece (5 mL) \u2192 10 piece (10 mL)');
  });

  it('changes the size, which is most of the point', () => {
    // A case carried three lines reading "8 x Syringe (piece)" and the only
    // way to say which was 2 mL and which was 10 mL was to stage three swaps.
    expect(checkQuantityChange({ ...LINE, size: '7.5', ...BY }).ok).toBe(true);
    expect(quantityChanged({
      currentQuantity: 1, currentUnit: 'pair', currentSize: '7', size: '7.5',
    })).toBe(true);
    expect(quantityChanged({
      currentQuantity: 1, currentUnit: 'pair', currentSize: '7', size: '7',
    })).toBe(false);
  });

  it('lets a size be cleared, and leaves it alone when nothing is said', () => {
    // The one place in this module where blank means something. A line that
    // should never have carried a size needs a way to say so; omitting the
    // field has to go on meaning "leave it".
    expect(quantityChanged({ currentQuantity: 1, currentSize: '7', size: '' })).toBe(true);
    expect(quantityChanged({ currentQuantity: 1, currentSize: '7' })).toBe(false);
    expect(checkQuantityChange({ ...LINE, size: '', ...BY }).ok).toBe(true);
  });

  it('refuses a sentence pretending to be a size', () => {
    const r = checkQuantityChange({ ...LINE, size: 'x'.repeat(MAX_SIZE_LENGTH + 1), ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain('too long');
  });

  it('names the change in the provider\u2019s notification', () => {
    // "2 changed" does not tell somebody on a phone whether to walk back to
    // the store. "Surgical gloves 1 pair -> 8 pairs" does.
    const s = changeSummary([], [], 'Theatre 2 \u00b7 Hernia repair', [
      { name: 'Surgical gloves', change: '1 pair \u2192 8 pairs' },
    ]);
    expect(s).toContain('1 quantity changed');
    expect(s).toContain('Surgical gloves 1 pair \u2192 8 pairs');
    expect(s).not.toContain('no changes');
  });

  it('still says plainly when a resubmission changed nothing', () => {
    expect(changeSummary([], [], 'Theatre 2', [])).toContain('no changes');
  });
});

/**
 * The route, read as source.
 *
 * Two properties that cannot be seen from the pure core and would both be
 * silent failures: that a quantity change is written IN PLACE rather than
 * staged as a withdrawal-and-add, and that the value the list carried at
 * booking survives a second correction.
 */
describe('the pack route applies a quantity change in place', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/surgeries/[id]/pack/route.ts'), 'utf8',
  );

  it('accepts a change list beside add and remove', () => {
    expect(route).toContain('change: z.array(');
    expect(route).toContain('checkQuantityChange({');
  });

  it('updates the row rather than cancelling it', () => {
    const block = route.slice(
      route.indexOf('for (const c of input.change ?? [])'),
      route.indexOf('const caseLabel ='),
    );
    expect(block).toContain('prisma.surgeryConsumableRequest.update');
    expect(block).toContain('prisma.surgeryDrugDressingRequest.update');
    // A quantity change must never read as a withdrawal: the provider has
    // not been told to put anything back.
    expect(block).not.toContain("status: 'CANCELLED'");
  });

  it('keeps the first value, not the most recent one', () => {
    const block = route.slice(
      route.indexOf('for (const c of input.change ?? [])'),
      route.indexOf('const caseLabel ='),
    );
    expect(block).toContain('originalQuantity: row.originalQuantity ?? row.quantity');
    expect(block).toContain('originalUnit: row.originalUnit ?? row.unit');
  });

  it('tells the providers when only a quantity moved', () => {
    expect(route).toContain('added.length || removed.length || changed.length');
    expect(route).toContain('changeSummary(added, removed, caseLabel, changed)');
  });

  it('records both sides in the audit trail', () => {
    // Where "who put 80 pairs of gloves on this case" is answered.
    expect(route).toContain('changed: changed.map((c) => ({ id: c.id, name: c.name, change: c.change }))');
  });
});

/** The screen, read as source: the control exists and is staged, not saved. */
describe('the pack editor offers the control', () => {
  const ui = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SurgeryPackEditor.tsx'), 'utf8',
  );

  it('has a quantity control beside change-the-item and remove-it', () => {
    expect(ui).toContain('Change how many, the unit or the size');
    expect(ui).toContain('Change how many, the unit or the dose');
    expect(ui).toContain('setQtyOpen');
  });

  it('shows the size on the line, which it never used to', () => {
    // The column existed on the row the whole time and nothing displayed it,
    // so three different syringes read identically.
    expect(ui).toContain('const sizeOf =');
    expect(ui).toContain("{size !== '' && (");
  });

  it('sends the size with a change, to whichever column holds it', () => {
    const body = ui.slice(ui.indexOf('change: Object.entries(quantities)'), ui.indexOf('remove: ['));
    expect(body).toContain('size: q.size.trim()');
  });

  it('stages it with the rest rather than saving per keystroke', () => {
    // A provider's phone buzzing four times while somebody edits a list is
    // how a notification channel stops being read.
    expect(ui).toContain('change: Object.entries(quantities).map');
    expect(ui).toContain('Object.keys(quantities).length');
  });

  it('shows what the line said at booking once it has moved', () => {
    expect(ui).toContain('was {l.originalQuantity}');
  });

  it('holds the stepper to the same ceiling the route enforces', () => {
    expect(ui).toContain('MAX_PACK_QUANTITY');
    expect(ui).not.toMatch(/max=\{999\}/);
  });
});
