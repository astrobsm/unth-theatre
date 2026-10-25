import { describe, it, expect } from 'vitest';
import {
  renderSlip,
  canIssue,
  formatWhen,
  RETURN_INSTRUCTION,
  THERMAL_WIDTH,
  type OutsideItem,
} from '../../src/lib/specialNeeds/outsideProcurement';

// This slip is the ONE exception to "do not give patients paper
// prescriptions", so every test here is about keeping the exception narrow
// and safe. A slip that lists too much sends somebody to buy things the
// hospital already has; a slip that omits the return instruction sends
// unchecked drugs into theatre in a patient's bag.

const item = (over: Partial<OutsideItem> = {}): OutsideItem => ({
  name: 'Polypropylene mesh',
  size: '15x15cm',
  quantity: 1,
  dispensedByPharmacy: false,
  ...over,
});

const slip = (items: OutsideItem[]) => ({
  patientName: 'Eneh Abigail',
  folderNumber: 'F/1234',
  procedure: 'Open inguinal hernia repair',
  surgeryDate: '27/10/2026',
  items,
  issuedByName: 'Mrs Okafor',
  issuedAt: new Date('2026-10-25T08:30:00Z'),
});

describe('the return instruction is on every slip', () => {
  it('appears in full, not abbreviated', () => {
    const text = renderSlip(slip([item()])).map((l) => l.text);
    expect(text).toContain(RETURN_INSTRUCTION);
  });

  it('is emphasised, not a footnote', () => {
    // It is the whole safeguard against a counterfeit or a wrong strength
    // reaching theatre. Small print would be worse than nothing, because
    // the slip looks official either way.
    const line = renderSlip(slip([item()])).find((l) => l.text === RETURN_INSTRUCTION);
    expect(line?.emphasis).toBe(true);
  });

  it('says the goods must be checked BEFORE use', () => {
    expect(RETURN_INSTRUCTION).toMatch(/before it is used/i);
    expect(RETURN_INSTRUCTION).toMatch(/pharmacy/i);
  });

  it('tells the holder who to give it to', () => {
    const text = renderSlip(slip([item()])).map((l) => l.text).join('\n');
    expect(text).toMatch(/nurse/i);
  });
});

describe('an empty slip is never issued', () => {
  it('canIssue refuses nothing to buy', () => {
    expect(canIssue([])).toBe(false);
  });

  it('canIssue refuses a zero quantity', () => {
    expect(canIssue([item({ quantity: 0 })])).toBe(false);
  });

  it('a rendered empty slip says so loudly rather than looking valid', () => {
    // If one ever does print, it must not be handed over and believed.
    const text = renderSlip(slip([])).map((l) => l.text).join('\n');
    expect(text).toMatch(/DO NOT ISSUE/);
  });

  it('allows a normal slip', () => {
    expect(canIssue([item(), item({ name: 'Bone wax', size: null })])).toBe(true);
  });
});

describe('what the slip actually lists', () => {
  it('names every item with its quantity', () => {
    const lines = renderSlip(
      slip([item({ quantity: 2 }), item({ name: 'Bone wax', size: null, quantity: 1 })]),
    ).map((l) => l.text);
    expect(lines.some((l) => l.includes('2 x Polypropylene mesh 15x15cm'))).toBe(true);
    expect(lines.some((l) => l.includes('1 x Bone wax'))).toBe(true);
  });

  it('marks drugs, because the holder cannot tell which is which', () => {
    const lines = renderSlip(slip([item({ name: 'Ceftriaxone 1g', dispensedByPharmacy: true })]))
      .map((l) => l.text)
      .join('\n');
    expect(lines).toMatch(/from a pharmacy/);
  });

  it('does not mark a consumable as a drug', () => {
    const lines = renderSlip(slip([item()])).map((l) => l.text).join('\n');
    expect(lines).not.toMatch(/from a pharmacy/);
  });

  it('identifies the patient', () => {
    const lines = renderSlip(slip([item()])).map((l) => l.text).join('\n');
    expect(lines).toMatch(/Eneh Abigail/);
    expect(lines).toMatch(/F\/1234/);
  });
});

describe('it fits the paper', () => {
  it('rules do not exceed the thermal width', () => {
    expect(THERMAL_WIDTH).toBeLessThanOrEqual(48);
    const rule = renderSlip(slip([item()])).find((l) => /^-+$/.test(l.text));
    expect(rule!.text.length).toBe(THERMAL_WIDTH);
  });
});

describe('the time is the one a ward clerk reads', () => {
  it('is shown in WAT, not UTC', () => {
    // WAT is UTC+1 all year, so 08:30Z is 09:30 locally. A slip timed an
    // hour earlier than the conversation about it causes arguments.
    expect(formatWhen(new Date('2026-10-25T08:30:00Z'))).toBe('25/10/2026 09:30');
  });

  it('rolls the date over correctly near midnight', () => {
    expect(formatWhen(new Date('2026-10-25T23:30:00Z'))).toBe('26/10/2026 00:30');
  });
});
