import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { MODULES, PREFIX_ONLY_PATHS } from '../../src/lib/modules';

// Can somebody actually FIND the page they are allowed to open?
//
// `canAccessPath()` answers a different question: whether a role is permitted.
// Permission to open a page you cannot find is not access, and the sidebar is
// built from its own `menuItems` array — registering a module in modules.ts
// does nothing for discoverability.
//
// This has now happened twice, both mine. The Ward Desk shipped with tests
// proving WARD_NURSE_IN_CHARGE and CLINICAL_HEALTH_ASSISTANT could open
// /dashboard/ward-desk, and no link to it anywhere; Policy Review shipped the
// same way, and was found only when the user asked where it was. Both times
// the module tests passed, because they tested the wrong thing.

const ROOT = join(__dirname, '..', '..');
const layout = readFileSync(
  join(ROOT, 'src', 'app', 'dashboard', 'layout.tsx'),
  'utf8',
);

/**
 * Modules with a /dashboard path and deliberately no menu item of their own.
 *
 * Each needs a reason. The list is the point: an entry added without one is a
 * module somebody quietly gave up on making reachable.
 */
const NO_MENU_ITEM_BY_DESIGN: Record<string, string> = {
  // Reached from inside the Holding Area screen, which is where somebody
  // recording a ward escort already is.
  'ward-entries': 'a sub-page of /dashboard/holding-area, linked from it',

  // KNOWN PRE-EXISTING GAP, not mine and not fixed here. This one has a real
  // page and eight roles and no way to reach it from the menu. Listed so it is
  // recorded rather than silently tolerated — if it gets a menu entry, delete
  // this line and the test keeps it honest.
  'infection-control': 'PRE-EXISTING GAP: has a page and roles but no link — reported, not fixed',
};

const dashboardModules = MODULES.filter((m) =>
  m.paths.some((p) => p.startsWith('/dashboard')));

/** A module is reachable if the layout mentions one of its paths as an href. */
const hasMenuItem = (paths: string[]) =>
  paths.some((p) => layout.includes(`'${p}'`));

describe('every module a role can open is a module they can find', () => {
  it('reads the catalogue and the sidebar at all', () => {
    // Every assertion below passes vacuously on an empty parse.
    expect(dashboardModules.length).toBeGreaterThan(50);
    expect(layout).toContain('const menuItems = [');
  });

  it('gives every dashboard module a menu item, or a stated reason', () => {
    const unreachable = dashboardModules
      .filter((m) => !m.paths.every((p) => PREFIX_ONLY_PATHS.includes(p)))
      .filter((m) => !hasMenuItem(m.paths))
      .filter((m) => !(m.id in NO_MENU_ITEM_BY_DESIGN))
      .map((m) => `${m.id} (${m.paths.join(', ')})`)
      .sort();

    // Named, not counted: whoever meets this failure needs to know which
    // module they made invisible, not that a number went up.
    expect(unreachable).toEqual([]);
  });

  it('keeps the two that were actually broken reachable', () => {
    expect(layout, 'Ward Desk').toContain("'/dashboard/ward-desk'");
    expect(layout, 'Policy Review').toContain("'/dashboard/policy-review'");
  });

  it('exempts nothing that is only a path prefix', () => {
    // PREFIX_ONLY_PATHS already covers those; listing one here as well would
    // hide a real module behind a stale excuse.
    for (const id of Object.keys(NO_MENU_ITEM_BY_DESIGN)) {
      const mod = MODULES.find((m) => m.id === id);
      expect(mod, `${id} is not a module any more — drop it from the list`).toBeTruthy();
      expect(
        mod!.paths.every((p) => PREFIX_ONLY_PATHS.includes(p)),
        `${id} is prefix-only; it does not need an entry here`,
      ).toBe(false);
    }
  });

  it('states a reason for each exemption', () => {
    for (const [id, why] of Object.entries(NO_MENU_ITEM_BY_DESIGN)) {
      expect(why.length, `${id} has no stated reason`).toBeGreaterThan(20);
    }
  });
});

describe('the two new entries are visible to the right people', () => {
  // Both sit in the BASE menuItems array rather than a role-gated push, so the
  // module's own defaultRoles decide who sees them — including anybody an
  // administrator grants the module to. A second role list in the layout would
  // be a second thing to keep in step, and this repository has four such lists
  // already.

  it('does not gate Policy Review behind the adminRoles push', () => {
    // THEATRE_CHAIRMAN is NOT in that list, and the Chairman is the one person
    // the module exists for. Putting it there would have hidden it from him.
    const adminBlockAt = layout.indexOf('const adminRoles = [');
    const policyAt = layout.indexOf("'/dashboard/policy-review'");
    expect(adminBlockAt).toBeGreaterThan(0);
    expect(policyAt).toBeGreaterThan(0);
    expect(policyAt).toBeLessThan(adminBlockAt);
  });

  it('keeps THEATRE_CHAIRMAN out of adminRoles, as it was', () => {
    // Guarding the assumption above: if somebody later adds the Chairman to
    // adminRoles, the reasoning in the comment stops being true.
    const block = layout.slice(
      layout.indexOf('const adminRoles = ['),
      layout.indexOf('const adminRoles = [') + 200,
    );
    expect(block).not.toContain('THEATRE_CHAIRMAN');
  });

  it('puts the Ward Desk beside the Holding Area, the other end of the handover', () => {
    const holding = layout.indexOf("'/dashboard/holding-area'");
    const ward = layout.indexOf("'/dashboard/ward-desk'");
    expect(holding).toBeGreaterThan(0);
    expect(ward).toBeGreaterThan(holding);
    expect(ward - holding).toBeLessThan(800);
  });
});
