/**
 * Per-role desks.
 *
 * The access matrix is the part worth testing: four screens, one of which
 * (finance) admits people by an imprest duty rather than an ORM role, and one
 * of which (vendor) shows money owed to outside parties and must not be wide.
 */
import { describe, expect, it } from 'vitest';

import {
  canOpenDesk,
  daysUntil,
  DESKS,
  desksFor,
  expiryOrder,
  FINANCE_IMPREST_ROLES,
  isDesk,
  percentOf,
  roleOpensDesk,
} from '../../src/lib/dashboards/desks';

describe('the four desks', () => {
  it('are the ones asked for', () => {
    expect([...DESKS]).toEqual(['consultant', 'inventory', 'vendor', 'finance']);
  });

  it('recognises its own names and nothing else', () => {
    expect(isDesk('finance')).toBe(true);
    expect(isDesk('Finance')).toBe(false);
    expect(isDesk(null)).toBe(false);
  });
});

describe('who opens the consultant desk', () => {
  it('opens for a consultant surgeon', () => {
    expect(canOpenDesk('consultant', 'CONSULTANT_SURGEON')).toBe(true);
  });

  it('opens for a resident too — their list is their list', () => {
    expect(canOpenDesk('consultant', 'SURGEON')).toBe(true);
  });

  it('opens for anaesthetists, who also have a list', () => {
    expect(canOpenDesk('consultant', 'ANAESTHETIST')).toBe(true);
  });

  it('does not open for a porter', () => {
    expect(canOpenDesk('consultant', 'PORTER')).toBe(false);
  });
});

describe('who opens the inventory desk', () => {
  it('opens for the store keeper and procurement', () => {
    expect(canOpenDesk('inventory', 'THEATRE_STORE_KEEPER')).toBe(true);
    expect(canOpenDesk('inventory', 'PROCUREMENT_OFFICER')).toBe(true);
    expect(canOpenDesk('inventory', 'PHARMACIST')).toBe(true);
  });

  it('does not open for a surgeon', () => {
    // Surgeons can see stock levels through the supply pages. The desk is a
    // work queue for the people who move stock, not a second way to browse.
    expect(canOpenDesk('inventory', 'CONSULTANT_SURGEON')).toBe(false);
  });
});

describe('who opens the vendor and finance desks', () => {
  it('keeps money owed to outside parties narrow', () => {
    expect(canOpenDesk('vendor', 'PROCUREMENT_OFFICER')).toBe(true);
    expect(canOpenDesk('vendor', 'CHIEF_MEDICAL_DIRECTOR')).toBe(true);
    expect(canOpenDesk('vendor', 'SCRUB_NURSE')).toBe(false);
    expect(canOpenDesk('vendor', 'THEATRE_STORE_KEEPER')).toBe(false);
  });

  it('admits a chief accountant by their imprest duty', () => {
    // ORM has no FINANCE role. Rather than invent one and keep two lists of
    // finance staff in step, the desk reuses the imprest duty assignments
    // that already identify exactly these people.
    expect(canOpenDesk('finance', 'PHARMACIST')).toBe(false);
    expect(canOpenDesk('finance', 'PHARMACIST', ['CHIEF_ACCOUNTANT'])).toBe(true);
  });

  it('admits a cashier and an internal auditor the same way', () => {
    expect(canOpenDesk('finance', 'PORTER', ['CASHIER'])).toBe(true);
    expect(canOpenDesk('finance', 'PORTER', ['INTERNAL_AUDITOR'])).toBe(true);
  });

  it('does not let an unrelated imprest duty in', () => {
    expect(canOpenDesk('finance', 'PORTER', ['REQUESTER'])).toBe(false);
  });

  it('does not let an imprest duty open any OTHER desk', () => {
    // The fallback is finance-specific. A cashier is not thereby a surgeon.
    expect(canOpenDesk('consultant', 'PORTER', ['CHIEF_ACCOUNTANT'])).toBe(false);
    expect(canOpenDesk('vendor', 'PORTER', ['CHIEF_ACCOUNTANT'])).toBe(false);
    expect(canOpenDesk('inventory', 'PORTER', ['CHIEF_ACCOUNTANT'])).toBe(false);
  });

  it('lists the finance duties it honours', () => {
    expect(FINANCE_IMPREST_ROLES).toContain('CHIEF_ACCOUNTANT');
    expect(FINANCE_IMPREST_ROLES).toContain('CASHIER');
  });
});

describe('role inheritance is honoured', () => {
  it('a consultant surgeon satisfies a rule written for SURGEON', () => {
    expect(roleOpensDesk('consultant', 'CONSULTANT_SURGEON')).toBe(true);
  });
});

describe('which desks to offer a person', () => {
  it('gives an administrator all four', () => {
    expect(desksFor('ADMIN')).toEqual(['consultant', 'inventory', 'vendor', 'finance']);
  });

  it('gives a store keeper only their own', () => {
    expect(desksFor('THEATRE_STORE_KEEPER')).toEqual(['inventory']);
  });

  it('gives a porter none', () => {
    expect(desksFor('PORTER')).toEqual([]);
  });

  it('gives a cashier the finance desk alone', () => {
    expect(desksFor('PORTER', ['CASHIER'])).toEqual(['finance']);
  });
});

describe('ordering stock by expiry', () => {
  const b = (id: string, expiryDate: string | null) => ({ id, expiryDate });
  const NOW = new Date('2026-08-05T00:00:00.000Z');

  it('puts already-expired stock above stock expiring tomorrow', () => {
    // Different jobs: one is a decision about the operating list, the other
    // is a disposal and a write-off.
    const ordered = expiryOrder([b('tomorrow', '2026-08-06'), b('expired', '2026-07-01')], NOW);
    expect(ordered[0].id).toBe('expired');
  });

  it('orders the rest soonest first', () => {
    const ordered = expiryOrder([b('c', '2026-12-01'), b('a', '2026-08-10'), b('b', '2026-09-01')], NOW);
    expect(ordered.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('sends stock with no expiry to the back rather than dropping it', () => {
    const ordered = expiryOrder([b('none', null), b('dated', '2026-09-01')], NOW);
    expect(ordered.map((x) => x.id)).toEqual(['dated', 'none']);
  });

  it('does not reorder the caller\'s array', () => {
    const input = [b('c', '2026-12-01'), b('a', '2026-08-10')];
    expiryOrder(input, NOW);
    expect(input.map((x) => x.id)).toEqual(['c', 'a']);
  });
});

describe('counting days', () => {
  const NOW = new Date('2026-08-05T12:00:00.000Z');

  it('counts forward', () => {
    expect(daysUntil('2026-08-10T12:00:00.000Z', NOW)).toBe(5);
  });

  it('goes negative once past', () => {
    expect(daysUntil('2026-08-01T12:00:00.000Z', NOW)).toBe(-4);
  });

  it('has no answer for a missing or unreadable date', () => {
    expect(daysUntil(null, NOW)).toBe(null);
    expect(daysUntil('not a date', NOW)).toBe(null);
  });
});

describe('percentages', () => {
  it('rounds to whole numbers', () => {
    expect(percentOf(1, 3)).toBe(33);
  });

  it('has NO figure when there is nothing to measure', () => {
    // A theatre with no cases did not achieve 0%. Showing a zero invites
    // somebody to act on it.
    expect(percentOf(0, 0)).toBe(null);
  });

  it('reports a genuine zero as zero', () => {
    expect(percentOf(0, 12)).toBe(0);
  });
});
