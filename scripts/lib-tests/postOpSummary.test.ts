/**
 * The sheet the ward reads.
 *
 * What is being protected here is legibility under pressure. The sheet is read
 * by somebody with four other patients, so:
 *
 *   Escalation comes first. Always, whatever else is on the sheet.
 *   Empty sections are dropped, because "FLUIDS: —" teaches people to skim.
 *   A stored code never reaches the page. A sheet that says
 *   "WHEN_ORAL_ESTABLISHED" has told the reader nothing.
 *
 * And one thing about provenance: the sheet must say whose instructions these
 * are, and must not claim to be the medical record itself.
 */
import { describe, expect, it } from 'vitest';

import { buildNursingSummary, summaryToText } from '../../src/lib/postop/nursingSummary';

const headings = (s: { entries: { heading: string }[] }) => s.entries.map((e) => e.heading);
const entry = (s: { entries: { heading: string; lines: string[] }[] }, h: string) =>
  s.entries.find((e) => e.heading === h);
const allText = (s: { entries: { lines: string[] }[] }) =>
  s.entries.flatMap((e) => e.lines).join(' | ');

describe('what comes first', () => {
  it('puts the escalation triggers above everything else', () => {
    const s = buildNursingSummary({
      wardPosition: 'SUPINE',
      feedingTiming: 'WHEN_AWAKE',
      escalationTriggers: ['EXCESSIVE_BLEEDING', 'FEVER'],
    });
    expect(headings(s)[0]).toBe('CALL THE SURGICAL TEAM IF');
  });

  it('marks it urgent so it can be drawn differently', () => {
    const s = buildNursingSummary({ escalationTriggers: ['FEVER'] });
    expect(s.entries[0].urgent).toBe(true);
  });

  it('keeps position above feeding, and feeding above review', () => {
    const s = buildNursingSummary({
      wardPosition: 'HEAD_UP',
      feedingTiming: 'WHEN_AWAKE',
      reviewTiming: 'TOMORROW',
    });
    const h = headings(s);
    expect(h.indexOf('POSITION')).toBeLessThan(h.indexOf('FEEDING'));
    expect(h.indexOf('FEEDING')).toBeLessThan(h.indexOf('NEXT REVIEW'));
  });
});

describe('empty sections', () => {
  it('drops a section with nothing in it', () => {
    const s = buildNursingSummary({ wardPosition: 'SUPINE' });
    expect(headings(s)).toContain('POSITION');
    expect(headings(s)).not.toContain('FLUIDS');
    expect(headings(s)).not.toContain('FLAP');
  });

  it('returns nothing at all for an empty note', () => {
    expect(buildNursingSummary({}).entries).toHaveLength(0);
  });

  it('shows the catheter section only when there is a catheter', () => {
    expect(headings(buildNursingSummary({ catheterPresent: false }))).not.toContain('URINARY CATHETER');
    expect(headings(buildNursingSummary({ catheterPresent: true, catheterType: 'Foley 16 Fr' })))
      .toContain('URINARY CATHETER');
  });
});

describe('codes never reach the page', () => {
  it('writes the label, not the stored value', () => {
    const s = buildNursingSummary({
      wardPosition: 'SEMI_FOWLER',
      feedingTiming: 'WHEN_AWAKE',
      mobilisation: 'BED_REST_UNTIL_REVIEW',
    });
    const text = allText(s);
    expect(text).toContain('Semi-Fowler');
    expect(text).toContain('Start when fully awake');
    expect(text).toContain('Bed rest until reviewed');
    expect(text).not.toMatch(/SEMI_FOWLER|WHEN_AWAKE|BED_REST/);
  });

  it('follows "Other" through to what the surgeon actually wrote', () => {
    // A sheet that says "Other" has told the reader nothing.
    const s = buildNursingSummary({
      wardPosition: 'OTHER',
      wardPositionOther: 'Left lateral with pillow between the knees',
    });
    expect(allText(s)).toContain('Left lateral with pillow between the knees');
    expect(allText(s)).not.toContain('Other');
  });

  it('falls back to the label when "Other" was chosen and left blank', () => {
    const s = buildNursingSummary({ escalationTriggers: ['OTHER'] });
    expect(allText(s)).toMatch(/Other/);
  });
});

describe('timings', () => {
  it('renders a time the way the rest of the app does', () => {
    const s = buildNursingSummary({
      feedingTiming: 'AT_TIME',
      feedingAt: new Date('2026-09-15T08:00:00Z'),
    });
    expect(entry(s, 'FEEDING')!.lines[0]).toMatch(/\d{2} \w{3}/);
  });

  it('does not print a broken date as "Invalid Date"', () => {
    const s = buildNursingSummary({ feedingTiming: 'AT_TIME', feedingAt: 'not a date' });
    expect(allText(s)).not.toMatch(/Invalid Date/);
  });
});

describe('the things most often missed', () => {
  it('names each held medication with its restart instruction', () => {
    const s = buildNursingSummary({}, {
      heldMedications: [
        { drugName: 'Amlodipine 10 mg', restartInstruction: 'WHEN_ORAL_ESTABLISHED' },
        { drugName: 'Metformin', restartInstruction: 'AFTER_REVIEW' },
      ],
    });
    const meds = entry(s, 'MEDICATIONS')!.lines.join(' | ');
    expect(meds).toContain('Amlodipine 10 mg');
    expect(meds).toContain('restart when oral intake is established');
    expect(meds).toContain('Metformin');
  });

  it('says so when a held drug has no restart instruction at all', () => {
    // The commonest avoidable harm on a surgical ward. Silence here would let
    // the sheet look complete while saying nothing about the drug.
    const s = buildNursingSummary({}, { heldMedications: [{ drugName: 'Warfarin' }] });
    expect(entry(s, 'MEDICATIONS')!.lines.join(' ')).toMatch(/no restart instruction given/);
  });

  it('flags a drain carrying no instruction', () => {
    const s = buildNursingSummary({}, { drains: [{ drainType: 'REDIVAC', site: 'Left axilla' }] });
    expect(entry(s, 'WOUND')!.lines.join(' ')).toMatch(/no instruction given/);
  });

  it('gives each drain its own line with its own removal criteria', () => {
    const s = buildNursingSummary({}, {
      drains: [
        { drainType: 'REDIVAC', site: 'Left axilla', removalCriteria: 'Under 30 mL in 24 hours' },
        { drainType: 'TUBE', site: 'Pelvis', monitoring: 'Chart output 4-hourly' },
      ],
    });
    const lines = entry(s, 'WOUND')!.lines;
    expect(lines.some((l) => l.includes('Left axilla') && l.includes('30 mL'))).toBe(true);
    expect(lines.some((l) => l.includes('Pelvis') && l.includes('4-hourly'))).toBe(true);
  });
});

describe('flap and graft', () => {
  it('reads them out of extras and puts the flap up with the urgent sections', () => {
    const s = buildNursingSummary({
      extras: {
        flapType: 'FREE',
        flapRecipientSite: 'Left scalp',
        flapMonitoringParams: ['COLOUR', 'DOPPLER'],
        flapMonitoringFrequency: 'Hourly for 24 hours',
      },
    });
    const flap = entry(s, 'FLAP');
    expect(flap).toBeTruthy();
    expect(flap!.lines.join(' ')).toContain('Free flap');
    expect(flap!.lines.join(' ')).toContain('Colour');
    expect(flap!.lines.join(' ')).toContain('Hourly for 24 hours');
    expect(s.entries.find((e) => e.heading === 'FLAP')!.urgent).toBe(true);
  });

  it('keeps the donor site with its own instruction', () => {
    const s = buildNursingSummary({
      extras: {
        graftType: 'SPLIT_THICKNESS',
        graftRecipientSite: 'Right leg',
        graftDonorSite: 'Right thigh',
        donorSiteDressing: 'Leave the dressing undisturbed for 10 days',
      },
    });
    expect(entry(s, 'GRAFT')!.lines.join(' ')).toContain('Right thigh');
    expect(entry(s, 'GRAFT')!.lines.join(' ')).toContain('undisturbed for 10 days');
  });
});

describe('provenance', () => {
  it('names the surgeon whose instructions these are', () => {
    const s = buildNursingSummary({ wardPosition: 'SUPINE' }, {}, {
      surgeonName: 'Dr Okeke', signedAt: new Date('2026-09-14T12:00:00Z'),
    });
    expect(s.attribution).toContain('Dr Okeke');
  });

  it('says it is not itself the medical record', () => {
    const s = buildNursingSummary({ wardPosition: 'SUPINE' });
    expect(s.attribution).toMatch(/not itself the medical record/);
  });

  it('still reads properly when nobody is named', () => {
    const s = buildNursingSummary({ wardPosition: 'SUPINE' });
    expect(s.attribution).toContain('the operating surgeon');
    expect(s.attribution).not.toContain('undefined');
    expect(s.attribution).not.toContain('null');
  });
});

describe('the plain-text rendering', () => {
  it('carries every heading and line, for a thermal printer', () => {
    const s = buildNursingSummary({
      escalationTriggers: ['FEVER'], wardPosition: 'SUPINE',
    });
    const text = summaryToText(s);
    expect(text).toContain('CALL THE SURGICAL TEAM IF');
    expect(text).toContain('Fever');
    expect(text).toContain('Supine');
    expect(text).toContain(s.attribution);
  });
});
