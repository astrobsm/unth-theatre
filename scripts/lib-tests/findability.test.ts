/**
 * Two things that existed, worked, and could not be found.
 *
 * Reported on 12 November by an admin with every permission: "I can't find
 * where to chase the roster supervisors for not uploading their rosters", and
 * "the attached image did not display all the packs created yesterday". Both
 * features were on screen. The chase page was in the menu under a name that
 * reads as a record rather than an action, and the packs page listed every
 * pack but gave no way to tell, from the top, whether a batch had arrived.
 *
 * A feature nobody can find is indistinguishable from one that was never
 * built — and the second report would have been filed as a seeding bug.
 *
 * These are source assertions on purpose: there is no jsdom here, and what
 * went wrong is not behaviour but naming and the absence of a total.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const LAYOUT = read('src/app/dashboard/layout.tsx');
const PACKS = read('src/app/dashboard/admin/surgical-packs/page.tsx');
const ROSTER = read('src/app/dashboard/roster/page.tsx');
const SUPERVISORS = read('src/app/dashboard/roster/supervisors/page.tsx');
const CHASE = read('src/app/dashboard/roster-chase/page.tsx');

describe('chasing a late roster can be found', () => {
  it('is in the menu under a name that says what it does', () => {
    // "Roster Submissions" describes the page's contents. Nobody searching a
    // menu for a way to go after a supervisor reads that word.
    expect(LAYOUT).toContain("label: 'Chase Late Rosters'");
    expect(LAYOUT).toContain("href: '/dashboard/roster-chase'");
    expect(LAYOUT).not.toContain("label: 'Roster Submissions'");
  });

  it('is reachable from the two roster pages somebody tries first', () => {
    // A menu of twenty admin entries is not a search. Someone thinking about
    // rosters opens Duty Roster, or the page that names the supervisors.
    for (const [name, src] of [['duty roster', ROSTER], ['supervisors', SUPERVISORS]] as const) {
      expect(src, name).toContain('/dashboard/roster-chase');
    }
  });

  it('still shows a department that has nobody to write to', () => {
    // The page's own rule, pinned because it is the case a tidy-up deletes:
    // a roster with no owner cannot be chased and needs a supervisor named.
    expect(CHASE).toContain('SUPERVISOR');
    expect(CHASE).toContain('hasPhone');
  });
});

describe('the pack list can answer "did they all arrive?"', () => {
  it('says how many there are without scrolling', () => {
    // THE fix. The list is grouped and runs to several screens; the reporter
    // saw General Surgery at the top and concluded the rest were missing.
    expect(PACKS).toContain('totals.all');
    expect(PACKS).toContain('totals.active');
    expect(PACKS).toContain('totals.draft');
  });

  it('counts every pack, not only the ones currently shown', () => {
    // A total computed off the filtered list would agree with the search box
    // and be useless for the question being asked.
    expect(PACKS).toContain('all: packs.length');
    expect(PACKS).toContain('shown: visible.length');
  });

  it('can be searched by name or subspecialty', () => {
    expect(PACKS).toContain('const visible = packs.filter(matches)');
    expect(PACKS).toContain('p.subspecialty.toLowerCase().includes(q)');
  });

  it('distinguishes a search that found nothing from an empty catalogue', () => {
    // "No packs yet" in response to a typo sends somebody to re-run a seed.
    expect(PACKS).toContain('No pack matches');
    expect(PACKS).toContain('clear the search to see them');
  });

  it('gives the anaesthesia packs their own headings instead of one "Other"', () => {
    // They are filed as ANAESTHESIA::<technique> so the pre-anaesthetic
    // review can find them. Shown raw, seventy of them landed in one bucket
    // labelled "Other", which is a good place for a pack to hide.
    expect(PACKS).toContain('anaesthesiaGroups');
    expect(PACKS).toContain('`Anaesthesia — ${sub.slice(ANAESTHESIA_PREFIX.length)}`');
    expect(PACKS).toContain('!p.subspecialty.startsWith(ANAESTHESIA_PREFIX)');
  });

  it('numbers each group, so a short section is visibly short', () => {
    expect(PACKS).toContain('({g.list.length})');
  });

  it('lists Ophthalmology among the subspecialties it groups by', () => {
    // Without it, every ophthalmology pack falls through to "Other" — which
    // is exactly the shape of the bug that was reported.
    expect(PACKS).toContain("'Ophthalmology'");
  });
});
