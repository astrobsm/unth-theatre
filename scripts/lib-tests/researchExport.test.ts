/**
 * The printed report must not quietly be a different report from the screen.
 *
 * The PDF export of Theatre Research & Analytics cut the surgeon table at 20
 * rows -- `.slice(0, 20)` -- while the dashboard and the Excel export both
 * listed every surgeon. Nothing on the page said so. A sheet headed "Surgeon
 * performance" that stops after the twentieth name reads as the whole theatre,
 * and the names it drops are the low-volume ones: exactly the people a
 * performance review is meant to be able to see.
 *
 * These are source-shape tests, because the fault was never in the data. The
 * API returned every surgeon all along; one client cut the list on the way to
 * paper. That is only visible by reading the export code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const page = readFileSync(join(root, 'src/app/dashboard/research/page.tsx'), 'utf8');
const route = readFileSync(join(root, 'src/app/api/research/route.ts'), 'utf8');

/** The body of the PDF export function. */
function pdfExport(): string {
  const at = page.indexOf('const exportDashboardPdf');
  expect(at).toBeGreaterThan(-1);
  const end = page.indexOf('\n  };', at);
  expect(end).toBeGreaterThan(at);
  return page.slice(at, end);
}

describe('the surgeon table on paper', () => {
  it('is not cut to a fixed number of rows', () => {
    const body = pdfExport();
    const at = body.indexOf('data.surgeonPerformance');
    expect(at).toBeGreaterThan(-1);
    // The line that builds the rows must map the list, not a slice of it.
    const line = body.slice(at, body.indexOf('\n', at));
    expect(line).not.toMatch(/slice\(/);
    expect(body).not.toMatch(/surgeonPerformance[^\n]*slice\(0,\s*\d+\)/);
  });

  it('says how many surgeons it is showing', () => {
    // So somebody holding the paper can tell a complete list from a cut one
    // without counting rows.
    const body = pdfExport();
    expect(body).toMatch(/all \$\{surg\.length\} surgeon/);
  });

  it('numbers its pages, because the list now runs over several', () => {
    const body = pdfExport();
    expect(body).toContain('getNumberOfPages()');
    expect(body).toMatch(/Page \$\{i\} of \$\{pageCount\}/);
  });
});

describe('the three surfaces agree on what a surgeon row is', () => {
  // Screen, Excel and PDF are three hand-written column lists over one API
  // field. They drifted once already (the PDF was missing blood loss and
  // emergency ratio as well as fifteen sixteenths of the surgeons).
  const fields = ['avgDuration', 'avgBloodLoss', 'avgComplexity', 'cancellationRate', 'emergencyRatio'];

  it('the PDF carries every measure the screen shows', () => {
    const body = pdfExport();
    for (const f of fields) {
      expect(body).toContain(`s.${f}`);
    }
  });

  it('the Excel export carries them too', () => {
    const at = page.indexOf('const surgeons = (data.surgeonPerformance');
    expect(at).toBeGreaterThan(-1);
    const block = page.slice(at, at + 700);
    for (const f of fields) {
      expect(block).toContain(`s.${f}`);
    }
  });

  it('and the API actually computes them', () => {
    const at = route.indexOf('const surgeonPerformance');
    expect(at).toBeGreaterThan(-1);
    const block = route.slice(at, at + 1200);
    for (const f of fields) {
      expect(block).toContain(`${f}:`);
    }
  });
});

describe('the API hands over the whole list', () => {
  it('sorts surgeons by volume and does not truncate', () => {
    const at = route.indexOf('const surgeonPerformance');
    const end = route.indexOf('// OR / theatre utilization', at);
    const block = route.slice(at, end);
    expect(block).toContain('.sort((a, b) => b.cases - a.cases)');
    // A `take` or `slice` here would reintroduce the same fault one layer down,
    // where no client could tell it had happened.
    expect(block).not.toMatch(/\.slice\(0,\s*\d+\)/);
  });
});
