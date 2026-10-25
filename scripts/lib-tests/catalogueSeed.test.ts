import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { standardCatalogue } from '../../src/lib/specialNeeds/standardCatalogue';

// Seeding is an ADMIN ACTION, not a build step. Several hundred inserts as a
// side effect of a deployment — on the same run that creates the tables —
// turns one bad insert into a blocked release, and on this project a failed
// migration step stops everything shipping. A person pressing a button can
// read the error and try again; a build cannot.

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const seedLib = read('src', 'lib', 'specialNeeds', 'seed.ts');
const route = read('src', 'app', 'api', 'special-needs', 'seed', 'route.ts');
const card = read('src', 'components', 'CatalogueSeedSetting.tsx');
const pkg = JSON.parse(read('package.json'));

describe('seeding never runs itself', () => {
  it('is not wired into any build or postinstall script', () => {
    const scripts = JSON.stringify(pkg.scripts ?? {});
    expect(scripts).not.toMatch(/seed-?(special|catalogue)/i);
    expect(scripts).not.toContain('seedStandardCatalogue');
  });

  it('is only reachable through the admin route', () => {
    expect(route).toContain('seedStandardCatalogue');
    expect(route).toContain('requireRole');
  });
});

describe('pressing it twice is safe', () => {
  it('never deletes', () => {
    // By the second press the store keeper has added local brands and
    // sizes. A seed that tidied up after itself would take those with it.
    expect(seedLib).not.toMatch(/\.delete(Many)?\(/);
    expect(seedLib).not.toMatch(/deleteMany/);
  });

  it('skips duplicates at the database as well as in code', () => {
    // Two administrators pressing at once would otherwise collide on the
    // unique index and fail.
    expect(seedLib).toContain('skipDuplicates: true');
  });

  it('matches on the same tuple as the unique index', () => {
    expect(seedLib).toMatch(/category.*name.*size.*brand/s);
  });

  it('marks seeded rows as standard, not locally added', () => {
    // So a sweep of what staff added here is possible later without
    // guessing from the names.
    expect(seedLib).toContain('isLocallyAdded: false');
  });
});

describe('the catalogue it would load', () => {
  it('is substantial enough to be worth a button', () => {
    expect(standardCatalogue().length).toBeGreaterThan(150);
  });

  it('covers every category the picker offers', () => {
    const cats = new Set(standardCatalogue().map((i) => i.category));
    for (const c of [
      'SUTURE',
      'URETHRAL_CATHETER',
      'DRAIN',
      'HAEMOSTATIC_AGENT',
      'TRACHEOSTOMY_TUBE',
      'MESH',
      'CHEST_TUBE',
      'CHEST_DRAIN_BOTTLE',
      'SYRINGE',
      'IV_CANNULA',
      'GIVING_SET',
      'PLASTER',
      'GLOVES',
      'WATER_FOR_INJECTION',
      'BANDAGE',
      'CASTING',
      'LOCAL_ANAESTHETIC',
      'TRANSFUSION_ADJUNCT',
    ]) {
      expect(cats.has(c as never), `${c} has no standard items`).toBe(true);
    }
  });

  it('contains no invented brands', () => {
    // Which mesh can be obtained in Nigeria, and which antibiotic brands
    // this pharmacy carries, are procurement facts I do not have. A
    // catalogue that lists products a surgeon cannot get is worse than a
    // short one.
    expect(standardCatalogue().every((i) => !('brand' in i) || !i.brand)).toBe(true);
  });

  it('seeds no antibiotics at all, for the same reason', () => {
    expect(standardCatalogue().some((i) => i.category === 'ANTIBIOTIC')).toBe(false);
  });
});

describe('the card tells an administrator what it would do', () => {
  it('shows the current counts before offering the button', () => {
    expect(card).toContain('items in the catalogue');
    expect(card).toMatch(/standard items not yet loaded/);
  });

  it('says locally added items are safe', () => {
    expect(card).toMatch(/never removed|left exactly as they are/);
  });

  it('hides itself from anyone who cannot run it', () => {
    expect(card).toMatch(/if \(denied \|\| !counts\) return null/);
  });
});
