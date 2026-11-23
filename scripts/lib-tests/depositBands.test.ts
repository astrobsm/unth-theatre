/**
 * Deposits: the bands, the status machine, and the four handovers.
 *
 * The arithmetic here decides what a patient is asked for at the consumable
 * shop, so it is pinned rather than trusted. Two failures in particular are
 * what these tests exist to prevent:
 *
 *  - PRICING A SUPER MAJOR CASE AS A MINOR ONE. The column simply did not
 *    exist until 23 November 2026, so the heaviest cases in the theatre were
 *    the only ones the counter could quote no figure for. A fallback would
 *    have under-collected by ninety-four thousand naira per case, which is
 *    why `normaliseCategory` returns null rather than guessing.
 *
 *  - SHOWING ZERO WHERE NOBODY HAS SET A BAND. "No deposit" and "nobody has
 *    decided yet" are different facts, and a cashier cannot tell them apart
 *    from a dash.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COLLECTION_STREAMS,
  DEFAULT_BANDS,
  DEPOSIT_CATEGORIES,
  DEPOSIT_KINDS,
  STREAMS,
  advanceRefusal,
  allFeeFields,
  bandAmount,
  canAdvance,
  categoryLabel,
  depositView,
  feeField,
  naira,
  normaliseCategory,
  streamSpec,
  streamsFor,
  type DepositStatus,
} from '../../src/lib/deposits/depositBands';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The settings row as the API serialises it: strings, because money. */
const SETTINGS: Record<string, string | null> = {
  minorConsumableFee: '52323.00',
  intermediateConsumableFee: '65570.00',
  majorConsumableFee: '110360.00',
  superMajorConsumableFee: '146090.00',
  minorPharmacyFee: '20000.00',
  intermediatePharmacyFee: '30000.00',
  majorPharmacyFee: '40000.00',
  superMajorPharmacyFee: '50000.00',
};

describe('the bands the hospital set', () => {
  it('holds the four consumable figures agreed in November 2026', () => {
    expect(DEFAULT_BANDS.CONSUMABLE).toEqual({
      MINOR: 52323,
      INTERMEDIATE: 65570,
      MAJOR: 110360,
      SUPER_MAJOR: 146090,
    });
  });

  it('holds the four pharmacy figures', () => {
    expect(DEFAULT_BANDS.PHARMACY).toEqual({
      MINOR: 20000,
      INTERMEDIATE: 30000,
      MAJOR: 40000,
      SUPER_MAJOR: 50000,
    });
  });

  it('prices a bigger operation at more than a smaller one', () => {
    // A typing slip in Settings that puts a minor figure in the super-major
    // box is invisible in a grid of eight numbers. The ORDER is the check.
    for (const kind of DEPOSIT_KINDS) {
      const b = DEFAULT_BANDS[kind];
      expect(b.MINOR).toBeLessThan(b.INTERMEDIATE);
      expect(b.INTERMEDIATE).toBeLessThan(b.MAJOR);
      expect(b.MAJOR).toBeLessThan(b.SUPER_MAJOR);
    }
  });

  it('seeds exactly those figures in the migration', () => {
    // The database is where the live figures are; this file only supplies a
    // starting value. If the two disagree, the hospital is charging something
    // nobody in the repository agreed to.
    const sql = read('prisma/migrations/20261123170000_surgery_deposits/migration.sql');
    for (const n of ['52323.00', '65570.00', '110360.00', '146090.00',
                     '20000.00', '30000.00', '40000.00', '50000.00']) {
      expect(sql).toContain(n);
    }
  });

  it('fills a blank band without overwriting a decision somebody made', () => {
    // COALESCE, not assignment. An administrator who has already typed a
    // number keeps it -- including a deliberate zero.
    const sql = read('prisma/migrations/20261123170000_surgery_deposits/migration.sql');
    expect(sql).toMatch(/COALESCE\("minorConsumableFee"/);
    expect(sql).toMatch(/COALESCE\("superMajorPharmacyFee"/);
  });
});

describe('finding the right column', () => {
  it('spells all eight of them', () => {
    expect(feeField('CONSUMABLE', 'MINOR')).toBe('minorConsumableFee');
    expect(feeField('CONSUMABLE', 'SUPER_MAJOR')).toBe('superMajorConsumableFee');
    expect(feeField('PHARMACY', 'INTERMEDIATE')).toBe('intermediatePharmacyFee');
    expect(feeField('PHARMACY', 'SUPER_MAJOR')).toBe('superMajorPharmacyFee');
    expect(allFeeFields()).toHaveLength(8);
  });

  it('names columns that actually exist on the model', () => {
    // The one failure a string-building helper has: a name that compiles,
    // reads null for ever, and reports itself as "not set".
    const schema = read('prisma/schema.prisma');
    for (const f of allFeeFields()) expect(schema).toContain(f);
  });

  it('is the list the settings API accepts', () => {
    // A band the form can type but the route drops is a figure that silently
    // never saves.
    const route = read('src/app/api/theatre-settings/route.ts');
    for (const f of allFeeFields()) expect(route).toContain(`'${f}'`);
  });

  it('is the list the settings form offers', () => {
    const form = read('src/components/TheatreFeeSettings.tsx');
    for (const f of allFeeFields()) expect(form).toContain(f);
  });
});

describe('reading a magnitude off a booking', () => {
  it('accepts the spellings that occur in this database', () => {
    expect(normaliseCategory('SUPER_MAJOR')).toBe('SUPER_MAJOR');
    expect(normaliseCategory('super major')).toBe('SUPER_MAJOR');
    expect(normaliseCategory('Super-Major')).toBe('SUPER_MAJOR');
    expect(normaliseCategory(' major ')).toBe('MAJOR');
  });

  it('refuses to guess at anything else', () => {
    // THE IMPORTANT ONE. Falling back to MINOR would under-collect ninety-four
    // thousand naira on a super major case, and the record would look settled.
    expect(normaliseCategory('')).toBeNull();
    expect(normaliseCategory(null)).toBeNull();
    expect(normaliseCategory('BIG')).toBeNull();
    expect(normaliseCategory('majorish')).toBeNull();
  });

  it('says the category in the words the shop uses', () => {
    expect(categoryLabel('SUPER_MAJOR')).toBe('SUPER MAJOR');
    expect(categoryLabel('minor')).toBe('MINOR');
    expect(categoryLabel('nonsense')).toBeNull();
  });
});

describe('what to put on the counter', () => {
  it('quotes each band from the settings row', () => {
    expect(bandAmount(SETTINGS, 'CONSUMABLE', 'SUPER_MAJOR')).toBe(146090);
    expect(bandAmount(SETTINGS, 'CONSUMABLE', 'MINOR')).toBe(52323);
    expect(bandAmount(SETTINGS, 'PHARMACY', 'MAJOR')).toBe(40000);
  });

  it('returns nothing rather than zero when a band is unset', () => {
    expect(bandAmount({ ...SETTINGS, majorPharmacyFee: null }, 'PHARMACY', 'MAJOR')).toBeNull();
    expect(bandAmount({ ...SETTINGS, majorPharmacyFee: '' }, 'PHARMACY', 'MAJOR')).toBeNull();
  });

  it('keeps a genuine zero, because that is a decision too', () => {
    expect(bandAmount({ ...SETTINGS, minorPharmacyFee: '0' }, 'PHARMACY', 'MINOR')).toBe(0);
  });

  it('says WHY there is no figure, not just that there is none', () => {
    // "—" sends a cashier to ask a colleague. These send them to the thing
    // that is actually missing.
    const noMagnitude = depositView(SETTINGS, 'CONSUMABLE', null);
    expect(noMagnitude.expected).toBeNull();
    expect(noMagnitude.noAmountReason).toMatch(/no operative magnitude/i);

    const noBand = depositView({ ...SETTINGS, superMajorConsumableFee: null }, 'CONSUMABLE', 'SUPER_MAJOR');
    expect(noBand.expected).toBeNull();
    expect(noBand.noAmountReason).toMatch(/SUPER MAJOR/);
    expect(noBand.noAmountReason).toMatch(/Settings/);
  });

  it('writes money the way a receipt does', () => {
    expect(naira(146090)).toBe('₦146,090.00');
    expect(naira(52323)).toBe('₦52,323.00');
    expect(naira(null)).toBe('—');
  });
});

describe('the four handovers', () => {
  it('splits each deposit into a surgical half and an anaesthetic half', () => {
    expect(COLLECTION_STREAMS).toHaveLength(4);
    expect(streamsFor('CONSUMABLE').map((s) => s.stream))
      .toEqual(['SURGICAL_CONSUMABLES', 'ANAESTHETIC_CONSUMABLES']);
    expect(streamsFor('PHARMACY').map((s) => s.stream))
      .toEqual(['SURGICAL_DRUGS', 'ANAESTHETIC_DRUGS']);
  });

  it('sends the anaesthetic halves to the anaesthetist and nobody else', () => {
    // The anaesthetic half is where the controlled drugs are. "Theatre
    // collected it" is not a name that can be asked about afterwards.
    expect(streamSpec('ANAESTHETIC_DRUGS')?.collector).toBe('ANAESTHETIST');
    expect(streamSpec('ANAESTHETIC_CONSUMABLES')?.collector).toBe('ANAESTHETIST');
    expect(streamSpec('SURGICAL_DRUGS')?.collector).toBe('SCRUB_NURSE');
    expect(streamSpec('SURGICAL_CONSUMABLES')?.collector).toBe('SCRUB_NURSE');
  });

  it('gives every stream a deposit it belongs to', () => {
    for (const s of STREAMS) expect(DEPOSIT_KINDS).toContain(s.kind);
  });

  it('does not recognise a stream nobody defined', () => {
    expect(streamSpec('EVERYTHING')).toBeNull();
  });
});

describe('REQUESTED to PAID to COLLECTED, and never round the back', () => {
  it('walks forwards one step at a time', () => {
    expect(canAdvance('REQUESTED', 'PAID')).toBe(true);
    expect(canAdvance('PAID', 'COLLECTED')).toBe(true);
  });

  it('refuses to collect a pack nobody has paid for', () => {
    // The whole reason the two tracks sit beside each other. A row that went
    // straight to COLLECTED would read afterwards as though it had been paid.
    expect(canAdvance('REQUESTED', 'COLLECTED')).toBe(false);
    expect(advanceRefusal('REQUESTED', 'COLLECTED')).toMatch(/payment first/i);
  });

  it('refuses to waive a deposit that has already been paid', () => {
    expect(canAdvance('PAID', 'WAIVED')).toBe(false);
    expect(advanceRefusal('PAID', 'WAIVED')).toMatch(/refund/i);
  });

  it('allows a payment to be undone, and a waiver', () => {
    expect(canAdvance('PAID', 'REQUESTED')).toBe(true);
    expect(canAdvance('WAIVED', 'REQUESTED')).toBe(true);
  });

  it('never claims a move to where it already is', () => {
    for (const s of ['REQUESTED', 'PAID', 'COLLECTED', 'WAIVED'] as DepositStatus[]) {
      expect(canAdvance(s, s)).toBe(false);
      expect(advanceRefusal(s, s)).toMatch(/already/i);
    }
  });

  it('gives every refusal words somebody can act on', () => {
    const pairs: [DepositStatus, DepositStatus][] = [
      ['REQUESTED', 'COLLECTED'], ['COLLECTED', 'PAID'], ['PAID', 'WAIVED'],
    ];
    for (const [a, b] of pairs) {
      const m = advanceRefusal(a, b);
      expect(m.length).toBeGreaterThan(20);
      expect(m).not.toMatch(/invalid|illegal|transition/i);
    }
  });
});

describe('the wiring that makes it visible', () => {
  it('the consumable page reads the ward and the magnitude', () => {
    const api = read('src/app/api/consumable-requests/route.ts');
    expect(api).toContain('ward: true');
    expect(api).toContain('magnitude: true');
    const page = read('src/app/dashboard/consumable-pack-provider/page.tsx');
    expect(page).toContain('DepositPanel');
    expect(page).toContain('kind="CONSUMABLE"');
  });

  it('the pharmacy panel reads them too', () => {
    const api = read('src/app/api/drug-dressing-requests/route.ts');
    expect(api).toContain('ward: true');
    expect(api).toContain('magnitude: true');
    const panel = read('src/components/SurgicalShoppingListsPanel.tsx');
    expect(panel).toContain('DepositPanel');
    expect(panel).toContain("kind=\"PHARMACY\"");
  });

  it('the pack provider cannot record a pharmacy deposit, or the reverse', () => {
    // Two counters, two authorities. The consumable office does not take
    // drug money and the pharmacy does not take pack money.
    const route = read('src/app/api/surgery-deposits/route.ts');
    const consumable = route.slice(route.indexOf('const CONSUMABLE_WRITERS'), route.indexOf('const PHARMACY_WRITERS'));
    expect(consumable).not.toContain('PHARMACIST');
    const pharmacy = route.slice(route.indexOf('const PHARMACY_WRITERS'), route.indexOf('function mayWrite'));
    expect(pharmacy).not.toContain('CONSUMABLE_PACK_PROVIDER');
  });

  it('does not let the person collecting record that they collected', () => {
    // A scrub nurse signing for their own collection is not a record.
    const route = read('src/app/api/surgery-deposits/route.ts');
    const writers = route.slice(0, route.indexOf('function mayWrite'));
    expect(writers).not.toContain('SCRUB_NURSE');
    expect(writers).not.toContain("'ANAESTHETIST'");
  });

  it('both new tables are classified for sync', () => {
    // An unclassified table that the migration captures has no rule for what
    // happens when both nodes change it, and money is the wrong place to find
    // that out.
    const policy = read('src/lib/sync/syncPolicy.ts');
    expect(policy).toContain("table: 'surgery_deposits'");
    expect(policy).toContain("table: 'surgery_pack_collections'");
    const sql = read('prisma/migrations/20261123170000_surgery_deposits/migration.sql');
    expect(sql).toContain("sync_enable_table('surgery_deposits')");
    expect(sql).toContain("sync_enable_table('surgery_pack_collections')");
  });

  it('carries no foreign key to surgeries', () => {
    // 19 November: a FK whose parent has not yet synced is not a delayed
    // insert, it is a refused one, retried for ever.
    const sql = read('prisma/migrations/20261123170000_surgery_deposits/migration.sql');
    expect(sql).not.toMatch(/REFERENCES\s+"surgeries"/i);
  });
});

describe('the ward desk', () => {
  const api = read('src/app/api/ward-desk/route.ts');
  const page = read('src/app/dashboard/ward-desk/page.tsx');

  it('still confines a posted nurse to their own ward', () => {
    // The 23 November change opens the desk to ADMINISTRATORS. If it had
    // opened it to ward nurses as well, every nurse could read every ward's
    // handovers, which is the one thing this desk was built not to do.
    const branch = api.slice(api.indexOf('if (posted) {'), api.indexOf('} else if (wantsAll)'));
    expect(branch).toContain("viewingAs = 'own'");
    expect(branch).not.toContain('asked');
    expect(branch).not.toContain('wantsAll');
  });

  it('lets an unposted account name a ward or ask for all of them', () => {
    expect(api).toContain("const ALL_WARDS = 'ALL'");
    expect(api).toContain("viewingAs = 'all'");
    expect(api).toContain('canChooseWard: !posted');
  });

  it('accepts one day as well as the rolling window', () => {
    expect(api).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
    expect(page).toContain('type="date"');
  });

  it('shows the nurse the four things they used to telephone about', () => {
    for (const field of ['deposits', 'collections', 'consumables', 'drugs', 'review']) {
      expect(api).toContain(`${field}:`);
    }
    expect(api).toContain('reassignedToName || r.expectedReviewerName');
    expect(page).toContain('WardReadiness');
  });

  it('counts a cancelled supply line as neither packed nor outstanding', () => {
    // Otherwise a case whose only outstanding item was withdrawn reads for
    // ever as "3/4 packed" and nobody can close it.
    expect(api).toContain("r.status !== 'CANCELLED'");
  });
});
