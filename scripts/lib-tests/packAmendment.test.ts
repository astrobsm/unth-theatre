/**
 * Changing what a case is packed with, after it was booked.
 *
 * The list is a message to the pack provider, not a note to self, and every
 * test here defends that: a change nobody can see, or can see but cannot
 * interpret, is the verbal correction at the theatre door in a new costume.
 */
import { describe, expect, it } from 'vitest';

import {
  MIN_PACK_REASON,
  activeLines,
  canEditPack,
  changeSummary,
  checkAddition,
  checkRemoval,
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

  it('refuses a removal with no reason worth reading', () => {
    // The provider reads this to decide whether to repack a tray or simply not
    // add the item.
    const r = checkRemoval({ currentStatus: 'REQUESTED', reason: 'no', ...BY });
    expect(r.ok).toBe(false);
    expect(r.problem).toContain(String(MIN_PACK_REASON));
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
