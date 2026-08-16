import { describe, it, expect } from 'vitest';
import { sectionsToRender } from '../../src/lib/estimates/estimatePdf';
import { SECTION_ORDER } from '../../src/lib/estimates/calculate';

const line = (section: string) => ({ section });

describe('sectionsToRender — no charge may vanish from an estimate', () => {
  it('keeps the established order for known sections', () => {
    const rendered = sectionsToRender([
      line('ADMISSION'), line('SURGICAL_FEE'), line('THEATRE'),
    ]);
    expect(rendered).toEqual(
      SECTION_ORDER.filter((s) => ['ADMISSION', 'SURGICAL_FEE', 'THEATRE'].includes(s)),
    );
  });

  it('RENDERS a section nobody recognises rather than dropping it', () => {
    // The bug this exists for. "PHARMACY" is not in SECTION_ORDER, and those
    // lines disappeared from the page while their money stayed in the total —
    // an estimate showing a figure larger than the charges printed beneath it.
    const rendered = sectionsToRender([line('THEATRE'), line('PHARMACY')]);
    expect(rendered).toContain('PHARMACY');
    expect(rendered).toContain('THEATRE');
  });

  it('puts unknown sections after the known ones', () => {
    const rendered = sectionsToRender([line('PHARMACY'), line('THEATRE')]);
    expect(rendered.indexOf('THEATRE')).toBeLessThan(rendered.indexOf('PHARMACY'));
  });

  it('lists an unknown section once however many lines use it', () => {
    const rendered = sectionsToRender([line('WARD'), line('WARD'), line('WARD')]);
    expect(rendered).toEqual(['WARD']);
  });

  it('accounts for every section present in the lines', () => {
    // The property that actually matters: nothing is lost between the lines
    // handed in and the headings printed.
    const lines = [line('THEATRE'), line('PHARMACY'), line('ADMISSION'), line('WARD')];
    const rendered = new Set(sectionsToRender(lines));
    for (const l of lines) expect(rendered.has(l.section)).toBe(true);
  });

  it('is empty for no lines rather than throwing', () => {
    expect(sectionsToRender([])).toEqual([]);
  });
});
