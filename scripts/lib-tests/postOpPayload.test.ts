/**
 * What a request body is allowed to become.
 *
 * This is the security boundary as well as the type boundary. The whitelist is
 * derived from the template, so nothing reaches Prisma except keys a section
 * declares — which means a caller cannot set `status`, `signedById` or
 * `createdById` by putting them in the body. Those come from the session, and
 * the tests below would fail if that ever stopped being true.
 *
 * The coercion rules are the other half. They are strict about type and
 * forgiving about shape, and the two cases that matter are:
 *
 *   An empty string becomes null, because a cleared field must not be stored as
 *   a second kind of empty alongside NULL.
 *
 *   A number that is not a number is an ERROR, not a zero. Silently writing
 *   0 mL of blood loss would corrupt every average computed afterwards, and
 *   nothing downstream could tell it from a real measurement.
 */
import { describe, expect, it } from 'vitest';

import { resolveTemplate, matchTemplate } from '../../src/lib/postop/templates';
import { parseNotePayload, noteToValues } from '../../src/lib/postop/payload';

const CORE = resolveTemplate(null);
const FLAP = resolveTemplate(matchTemplate('Free flap reconstruction'));

describe('the whitelist', () => {
  it('accepts a field the template declares', () => {
    const r = parseNotePayload({ values: { findings: 'Appendix removed.' } }, CORE);
    expect(r.errors).toEqual([]);
    expect(r.values.findings).toBe('Appendix removed.');
  });

  it('ignores anything the template does not declare', () => {
    const r = parseNotePayload({
      values: { findings: 'x', status: 'SIGNED', signedById: 'somebody', syncVersion: 99 },
    }, CORE);
    expect(r.values.status).toBeUndefined();
    expect(r.values.signedById).toBeUndefined();
    expect(r.values.syncVersion).toBeUndefined();
  });

  it('does not report unknown keys as errors', () => {
    // An older client sending a field this build has dropped must not have its
    // whole note refused over it.
    const r = parseNotePayload({ values: { findings: 'x', somethingRemoved: 'y' } }, CORE);
    expect(r.errors).toEqual([]);
  });

  it('routes a template field to extras and a core field to a column', () => {
    const r = parseNotePayload({
      values: { findings: 'Flap raised and inset.', flapType: 'FREE', flapDonorSite: 'Left thigh' },
    }, FLAP);
    expect(r.values.findings).toBe('Flap raised and inset.');
    expect(r.extras.flapType).toBe('FREE');
    expect(r.values.flapType).toBeUndefined();
  });

  it('does not accept a template field when that template is not in force', () => {
    const r = parseNotePayload({ values: { flapType: 'FREE' } }, CORE);
    expect(r.extras.flapType).toBeUndefined();
    expect(r.values.flapType).toBeUndefined();
  });
});

describe('catalogue values', () => {
  it('accepts a value from the catalogue', () => {
    const r = parseNotePayload({ values: { wardPosition: 'SEMI_FOWLER' } }, CORE);
    expect(r.errors).toEqual([]);
    expect(r.values.wardPosition).toBe('SEMI_FOWLER');
  });

  it('refuses one that is not, rather than storing a typo forever', () => {
    const r = parseNotePayload({ values: { wardPosition: 'semi_fowler' } }, CORE);
    expect(r.errors.join(' ')).toMatch(/not one of the available options/);
    expect(r.values.wardPosition).toBeUndefined();
  });

  it('checks every member of a multi-select', () => {
    const r = parseNotePayload({
      values: { haemostasisMethods: ['DIATHERMY_BIPOLAR', 'MADE_UP'] },
    }, CORE);
    expect(r.errors.join(' ')).toMatch(/MADE_UP/);
    expect(r.values.haemostasisMethods).toBeUndefined();
  });

  it('removes duplicates, which would otherwise double-count', () => {
    const r = parseNotePayload({
      values: { haemostasisMethods: ['DIATHERMY_BIPOLAR', 'DIATHERMY_BIPOLAR'] },
    }, CORE);
    expect(r.values.haemostasisMethods).toEqual(['DIATHERMY_BIPOLAR']);
  });

  it('accepts an empty multi-select as a real answer', () => {
    const r = parseNotePayload({ values: { haemostasisMethods: [] } }, CORE);
    expect(r.errors).toEqual([]);
    expect(r.values.haemostasisMethods).toEqual([]);
  });

  it('refuses a multi-select sent as a single string', () => {
    const r = parseNotePayload({ values: { haemostasisMethods: 'DIATHERMY_BIPOLAR' } }, CORE);
    expect(r.errors.join(' ')).toMatch(/must be a list/);
  });
});

describe('coercion', () => {
  it('turns a cleared text field into null, not an empty string', () => {
    const r = parseNotePayload({ values: { bleedingSource: '   ' } }, CORE);
    expect(r.values.bleedingSource).toBeNull();
  });

  it('trims text rather than storing the whitespace', () => {
    const r = parseNotePayload({ values: { bleedingSource: '  Splenic hilum  ' } }, CORE);
    expect(r.values.bleedingSource).toBe('Splenic hilum');
  });

  it('refuses a number that is not one, instead of writing zero', () => {
    const r = parseNotePayload({ values: { estimatedBloodLossMl: 'a lot' } }, CORE);
    expect(r.errors.join(' ')).toMatch(/must be a number/);
    expect(r.values.estimatedBloodLossMl).toBeUndefined();
  });

  it('enforces the range the field declares', () => {
    expect(parseNotePayload({ values: { estimatedBloodLossMl: -1 } }, CORE).errors.join(' '))
      .toMatch(/cannot be less than/);
    expect(parseNotePayload({ values: { estimatedBloodLossMl: 999999 } }, CORE).errors.join(' '))
      .toMatch(/cannot be more than/);
  });

  it('turns an empty number into null', () => {
    const r = parseNotePayload({ values: { estimatedBloodLossMl: '' } }, CORE);
    expect(r.values.estimatedBloodLossMl).toBeNull();
  });

  it('parses a date and refuses a broken one', () => {
    const good = parseNotePayload({ values: { feedingAt: '2026-09-15T08:00:00Z' } }, CORE);
    expect(good.values.feedingAt).toBeInstanceOf(Date);
    const bad = parseNotePayload({ values: { feedingAt: 'tomorrow-ish' } }, CORE);
    expect(bad.errors.join(' ')).toMatch(/not a valid date/);
  });

  it('keeps all three states of a boolean', () => {
    expect(parseNotePayload({ values: { implantPlaced: true } }, CORE).values.implantPlaced).toBe(true);
    expect(parseNotePayload({ values: { implantPlaced: false } }, CORE).values.implantPlaced).toBe(false);
    expect(parseNotePayload({ values: { implantPlaced: null } }, CORE).values.implantPlaced).toBeNull();
  });

  it('leaves an omitted field alone rather than blanking it', () => {
    // A PATCH carrying only the flap section must not wipe the findings. The
    // same rule the sync layer follows for a partial payload.
    const r = parseNotePayload({ values: { wardPosition: 'SUPINE' } }, CORE);
    expect('findings' in r.values).toBe(false);
  });
});

describe('repeating sections', () => {
  it('numbers the preparation steps from the order they arrive in', () => {
    // The sequence IS the data, and a client that reorders rows must not be
    // able to claim a sequence contradicting the order it sent.
    const r = parseNotePayload({
      values: {},
      children: {
        prepSteps: [
          { kind: 'CLEANSE', agent: 'CETRIMIDE', sequence: 99 },
          { kind: 'CLEANSE', agent: 'SAVLON' },
          { kind: 'FINAL_PREP', agent: 'POVIDONE_IODINE' },
        ],
      },
    }, CORE);
    expect(r.children.prepSteps.map((s) => s.sequence)).toEqual([1, 2, 3]);
  });

  it('keeps the agent of each step separately', () => {
    const r = parseNotePayload({
      values: {},
      children: { prepSteps: [{ kind: 'CLEANSE', agent: 'CETRIMIDE' }, { kind: 'FINAL_PREP', agent: 'POVIDONE_IODINE' }] },
    }, CORE);
    expect(r.children.prepSteps[0].agent).toBe('CETRIMIDE');
    expect(r.children.prepSteps[1].agent).toBe('POVIDONE_IODINE');
  });

  it('validates the values inside a row', () => {
    const r = parseNotePayload({
      values: {},
      children: { drains: [{ drainType: 'NOT_A_DRAIN', site: 'Pelvis' }] },
    }, CORE);
    expect(r.errors.join(' ')).toMatch(/NOT_A_DRAIN/);
  });

  it('leaves a section alone when the payload omits it', () => {
    const r = parseNotePayload({ values: {}, children: { drains: [{ drainType: 'TUBE', site: 'x' }] } }, CORE);
    expect(r.children.drains).toHaveLength(1);
    expect(r.children.specimens).toHaveLength(0);
  });

  it('refuses an absurd number of rows', () => {
    const rows = Array.from({ length: 500 }, () => ({ drainType: 'TUBE', site: 'x' }));
    const r = parseNotePayload({ values: {}, children: { drains: rows } }, CORE);
    expect(r.errors.join(' ')).toMatch(/No more than/);
  });
});

describe('images', () => {
  it('keeps two data URLs', () => {
    const r = parseNotePayload({
      values: { images: ['data:image/png;base64,AAA', 'data:image/jpeg;base64,BBB'] },
    }, CORE);
    expect(r.values.images).toHaveLength(2);
  });

  it('drops anything that is not an image data URL', () => {
    const r = parseNotePayload({
      values: { images: ['data:image/png;base64,AAA', 'https://example.com/x.png', 42] },
    }, CORE);
    expect(r.values.images).toHaveLength(1);
  });

  it('refuses more than two, as the free-text note always did', () => {
    const r = parseNotePayload({
      values: { images: ['data:image/png;base64,A', 'data:image/png;base64,B', 'data:image/png;base64,C'] },
    }, CORE);
    expect(r.errors.join(' ')).toMatch(/maximum of 2 images/);
  });
});

describe('reading a note back', () => {
  it('flattens extras over the columns, and keeps extras reachable', () => {
    const values = noteToValues({
      findings: 'x',
      extras: { flapType: 'FREE', flapMonitoringFrequency: 'Hourly' },
    });
    expect(values.findings).toBe('x');
    expect(values.flapType).toBe('FREE');
    // The nursing summary reads flap fields out of here directly, so that a
    // ward sheet does not depend on a template definition still existing.
    expect((values.extras as Record<string, unknown>).flapType).toBe('FREE');
  });

  it('copes with a note that has no extras', () => {
    const values = noteToValues({ findings: 'x' });
    expect(values.findings).toBe('x');
    expect(values.extras).toEqual({});
  });

  it('survives a null extras column', () => {
    expect(() => noteToValues({ findings: 'x', extras: null })).not.toThrow();
  });
});

describe('a payload that is nonsense', () => {
  it('does not throw on null, a string or a number', () => {
    expect(() => parseNotePayload(null, CORE)).not.toThrow();
    expect(() => parseNotePayload('nonsense', CORE)).not.toThrow();
    expect(() => parseNotePayload(42, CORE)).not.toThrow();
  });

  it('produces nothing from an empty body', () => {
    const r = parseNotePayload({}, CORE);
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.values)).toHaveLength(0);
  });
});
