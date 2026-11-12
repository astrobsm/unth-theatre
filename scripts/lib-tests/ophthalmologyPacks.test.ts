/**
 * The ophthalmology packs, and the one property that makes them safe to ship.
 *
 * These lists were NOT transcribed from the hospital's shopping-list document
 * — that document covers ten specialties and no eye surgery. They were written
 * to its shape. So the thing worth testing hardest is not the contents, which
 * only an ophthalmologist can judge, but that nothing here reaches a patient
 * before one has: every pack is seeded inactive, and the seed script neither
 * activates nor overwrites.
 *
 * The rest guards the joins. A pack named after no procedure, or filed under a
 * subspecialty string that does not exist, disappears silently — the picker is
 * empty and nothing anywhere reports a fault.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  OPHTHALMOLOGY_PACKS,
  ANAESTHESIA_PREFIX,
  ANAESTHESIA_FOR,
  anaesthesiaTechniques,
  packCount,
  itemCount,
} from '../../src/lib/packs/ophthalmologyPacks';
import { CATALOGUE } from '../../src/lib/procedures/catalogue';

const REPO = path.join(__dirname, '..', '..');
const SEED = fs.readFileSync(path.join(REPO, 'scripts', 'seed-ophthalmology-packs.js'), 'utf8');
const ACTIVATE = fs.readFileSync(path.join(REPO, 'scripts', 'activate-ophthalmology-packs.js'), 'utf8');

const procedurePacks = OPHTHALMOLOGY_PACKS.filter((p) => !p.subspecialty.startsWith(ANAESTHESIA_PREFIX));
const anaesthesiaPacks = OPHTHALMOLOGY_PACKS.filter((p) => p.subspecialty.startsWith(ANAESTHESIA_PREFIX));

describe('nothing here is live until somebody says so', () => {
  it('seeds every pack inactive, and says so rather than relying on the default', () => {
    // THE test in this file. isActive defaults to false in the schema, but a
    // default is a thing somebody changes; the script states it.
    //
    // Checked on the WRITE, not on the whole file: `isActive: true` also
    // appears in the Prisma `select` that counts how many existing packs are
    // live, and a test that banned the string outright failed on that — which
    // would have taught the next person to delete the check rather than the
    // bug it was pointing at.
    const writes = SEED.split('data: {').slice(1).map((b) => b.slice(0, 800));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w).toContain('isActive: false');
      expect(w).not.toMatch(/isActive:\s*true/);
    }
  });

  it('never edits or reactivates a pack that is already there', () => {
    // The row it would overwrite may be one an ophthalmologist has already
    // corrected, and an "update" would quietly put the draft back.
    expect(SEED).not.toMatch(/surgicalPack\.update/);
    expect(SEED).not.toMatch(/surgicalPack\.upsert/);
    expect(SEED).not.toMatch(/surgicalPack\.delete/);
    expect(SEED).toContain('toAdd');
  });

  it('refuses to seed when the subspecialty string does not exist', () => {
    // Same hard stop as the procedure seed: the picker joins on this string,
    // and a near-miss is an empty picker with no error anywhere.
    expect(SEED).toContain('REFUSING TO SEED');
    expect(SEED).toContain("known.has('Ophthalmology')");
  });
});

describe('activating is a separate decision from seeding', () => {
  it('lives in its own script, which is the only one that can flip the flag', () => {
    // Writing a draft and deciding it is fit to hand a patient are two
    // decisions by two people. One script that did both would mean the second
    // one stops being made.
    expect(ACTIVATE).toContain('isActive: true');
    expect(ACTIVATE).toContain('--write');
  });

  it('only ever touches packs this repository defines', () => {
    // A pack somebody wrote by hand is not this script's business.
    expect(ACTIVATE).toContain('wantedKeys.has(key(r))');
    expect(ACTIVATE).toContain('OPHTHALMOLOGY_PACKS');
  });

  it('leaves a pack that is already active alone', () => {
    // So a second run cannot quietly revert an edit somebody made after the
    // first one.
    expect(ACTIVATE).toContain('mine.filter((r) => !r.isActive)');
  });

  it('holds back the two sets that shadow packs already in use', () => {
    // "General anaesthesia (adult eye)" beside the active "General" puts two
    // things that read the same in front of an anaesthetist starting a list.
    expect(ACTIVATE).toContain('SHADOWING');
    expect(ACTIVATE).toContain('--include-ga');
    expect(ACTIVATE).toContain('General anaesthesia (adult eye)');
    expect(ACTIVATE).toContain('General anaesthesia (paediatric eye)');
  });

  it('does nothing without --write', () => {
    expect(ACTIVATE).toContain('if (!WRITE)');
    expect(ACTIVATE).toContain('Dry run.');
  });
});

describe('the packs join to something', () => {
  it('names every procedure pack after a real catalogue entry', () => {
    // A pack named after no procedure can never be mapped to one, so it is
    // never offered — and it looks completely normal in the admin list.
    const names = new Set(CATALOGUE.Ophthalmology.map((e) => e.name));
    const orphans = [...new Set(procedurePacks.map((p) => p.name))].filter((n) => !names.has(n));
    expect(orphans).toEqual([]);
  });

  it('files procedure packs under Ophthalmology and nothing else', () => {
    for (const p of procedurePacks) expect(p.subspecialty).toBe('Ophthalmology');
  });

  it('gives every procedure both a consumable and a pharmacy pack', () => {
    // The two are shopped for by different desks. One without the other sends
    // somebody to the pharmacy for a list that does not exist.
    const byName = new Map<string, Set<string>>();
    for (const p of procedurePacks) {
      if (!byName.has(p.name)) byName.set(p.name, new Set());
      byName.get(p.name)!.add(p.kind);
    }
    const incomplete = [...byName.entries()]
      .filter(([, kinds]) => kinds.size !== 2)
      .map(([n]) => n);
    expect(incomplete).toEqual([]);
  });
});

describe('the anaesthesia sets', () => {
  it('are filed under the prefix the anaesthesia route looks for', () => {
    // /api/anaesthesia-packs selects on subspecialty startsWith this prefix.
    for (const p of anaesthesiaPacks) {
      expect(p.subspecialty.startsWith(ANAESTHESIA_PREFIX)).toBe(true);
      expect(p.subspecialty.length).toBeGreaterThan(ANAESTHESIA_PREFIX.length);
    }
  });

  it('exist for every technique a procedure pack expects', () => {
    // A procedure that asks for a technique nobody has packed leaves the
    // anaesthetist with an empty picker on the morning of the list.
    const have = new Set(anaesthesiaTechniques());
    const wanted = [...new Set(Object.values(ANAESTHESIA_FOR))];
    expect(wanted.filter((t) => !have.has(t))).toEqual([]);
  });

  it('carry both halves of each technique — section A and section B', () => {
    // A is the consumables, B the drugs. Either alone is half a set.
    for (const technique of anaesthesiaTechniques()) {
      const kinds = anaesthesiaPacks
        .filter((p) => p.subspecialty === `${ANAESTHESIA_PREFIX}${technique}`)
        .map((p) => p.kind);
      expect(kinds.slice().sort(), technique).toEqual(['CONSUMABLE', 'PHARMACY']);
    }
  });
});

describe('the items', () => {
  it('always say how many, and of what', () => {
    for (const p of OPHTHALMOLOGY_PACKS) {
      for (const it of p.items) {
        expect(it.name.length, `${p.name}: ${it.name}`).toBeGreaterThan(3);
        expect(it.quantity, `${p.name}: ${it.name}`).toBeGreaterThan(0);
        expect(it.unit.length, `${p.name}: ${it.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('put consumable fields on consumable packs and drug fields on pharmacy packs', () => {
    // SurgicalPackItem holds both sets of columns and ignores the wrong one.
    // A drug filed on a consumable pack therefore loses its dose in silence.
    for (const p of OPHTHALMOLOGY_PACKS) {
      for (const it of p.items) {
        if (p.kind === 'CONSUMABLE') {
          expect(it.category, `${p.name}: ${it.name}`).toBeTruthy();
          expect(it.drugType, `${p.name}: ${it.name}`).toBeUndefined();
        } else {
          expect(it.drugType, `${p.name}: ${it.name}`).toBeTruthy();
          expect(it.category, `${p.name}: ${it.name}`).toBeUndefined();
        }
      }
    }
  });

  it('does not list one item twice in a pack', () => {
    // packItemKey() merges on name+dosage, so a repeat inside one pack is a
    // quantity that silently loses to whichever row is read last.
    const dupes: string[] = [];
    for (const p of OPHTHALMOLOGY_PACKS) {
      const seen = new Set<string>();
      for (const it of p.items) {
        const k = `${it.name}|${it.dosage ?? ''}`.toUpperCase();
        if (seen.has(k)) dupes.push(`${p.kind} ${p.name}: ${it.name}`);
        seen.add(k);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('keeps the two povidone-iodine strengths apart, and says which goes in the eye', () => {
    // 5% aqueous goes in the conjunctival sac; 10% skin preparation does not,
    // and the bottles look alike. Both are on the trolley, so the pack has to
    // carry the distinction rather than assume it.
    const eyePacks = OPHTHALMOLOGY_PACKS.filter((p) =>
      p.items.some((i) => /povidone-iodine 5%/i.test(i.name)));
    expect(eyePacks.length).toBeGreaterThan(5);
    for (const p of eyePacks) {
      const five = p.items.find((i) => /povidone-iodine 5%/i.test(i.name))!;
      expect(five.name, p.name).toMatch(/aqueous/i);
    }
  });

  it('is a real set of lists, not a stub', () => {
    expect(packCount()).toBeGreaterThan(30);
    expect(itemCount()).toBeGreaterThan(250);
  });
});
