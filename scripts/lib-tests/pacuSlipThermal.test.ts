// The PACU transfer slip on an 80mm thermal roll.
//
// Two kinds of fault are being guarded against here, and only one of them is
// visible on a screen. The first is arithmetic: a slip that says "102711 min".
// The second is silent — anything wider than the 72mm the print head covers
// is cut off at the edge of the paper with no warning anywhere, so the slip
// looks right in the browser and comes out of the machine missing its right
// hand side.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  PAPERS, paperSpec, slipPrintCss, formatRecoveryMinutes,
  recoveryTimeLooksWrong, IMPLAUSIBLE_RECOVERY_MINUTES,
} from '../../src/lib/pacu/slipFormat';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const PAGE = 'src/app/dashboard/pacu/[id]/transfer/page.tsx';

/** The paper is 80mm; the print head covers 72mm of it. */
const PAPER_MM = 80;
const PRINTABLE_MM = 72;

describe('the 80mm paper', () => {
  it('lays the slip out at the full width of the paper', () => {
    expect(PAPERS.THERMAL_80.width).toBe(`${PAPER_MM}mm`);
  });

  it('leaves exactly the gutter the print head cannot reach', () => {
    // 4mm each side of 80mm leaves 72mm. Get this wrong and the right hand
    // edge of every slip is missing, silently.
    const [, side] = PAPERS.THERMAL_80.padding.split(' ');
    const gutter = Number(side.replace('mm', ''));
    expect(PAPER_MM - gutter * 2).toBe(PRINTABLE_MM);
  });

  it('is one column, because two do not fit in 72mm', () => {
    expect(PAPERS.THERMAL_80.singleColumn).toBe(true);
  });

  it('gives the page no fixed height, because a roll has no page', () => {
    // `size: 80mm auto`. A fixed height makes the browser paginate a receipt.
    expect(PAPERS.THERMAL_80.pageSize).toBe('80mm auto');
  });

  it('keeps type at 9pt or above, which is the floor at 203 dpi', () => {
    expect(Number(PAPERS.THERMAL_80.fontSize.replace('pt', ''))).toBeGreaterThanOrEqual(9);
  });

  it('falls back to the roll if asked for a paper that does not exist', () => {
    expect(paperSpec('NONSENSE' as never).key).toBe('THERMAL_80');
  });
});

describe('the print stylesheet', () => {
  const thermal = () => slipPrintCss('THERMAL_80');

  it('sets an 80mm page with no margin of its own', () => {
    expect(thermal()).toContain('@page { size: 80mm auto; margin: 0; }');
  });

  it('never leaves the A5 page rule behind on a roll', () => {
    expect(thermal()).not.toContain('A5');
  });

  it('wraps a long name or folder number rather than losing it off the edge', () => {
    expect(thermal()).toContain('overflow-wrap: anywhere;');
  });

  it('drops the on-screen border, which would print as a box round the roll', () => {
    expect(thermal()).toContain('border: none;');
  });

  it('still hides everything that is not the slip', () => {
    const css = thermal();
    expect(css).toContain('body * { visibility: hidden; }');
    expect(css).toContain('#transfer-slip, #transfer-slip * { visibility: visible; }');
  });

  it('keeps a working A5 rule for the copy that gets filed', () => {
    const a5 = slipPrintCss('A5');
    expect(a5).toContain('@page { size: A5; margin: 10mm; }');
  });
});

describe('how long the patient was in recovery', () => {
  it('says minutes while minutes are readable', () => {
    expect(formatRecoveryMinutes(0)).toBe('0 min');
    expect(formatRecoveryMinutes(7)).toBe('7 min');
    expect(formatRecoveryMinutes(59)).toBe('59 min');
  });

  it('turns an hour or more into hours and minutes', () => {
    expect(formatRecoveryMinutes(60)).toBe('1 h');
    expect(formatRecoveryMinutes(102)).toBe('1 h 42 min');
    expect(formatRecoveryMinutes(1439)).toBe('23 h 59 min');
  });

  it('reads a run-on record as days, not as five digits of minutes', () => {
    // The slip printed "102711 min" for a record opened and never closed.
    // Arithmetically right; nobody converts that in their head.
    expect(formatRecoveryMinutes(102711)).toBe('71 d 7 h');
    expect(formatRecoveryMinutes(1440)).toBe('1 d');
  });

  it('says nothing rather than something false when there is no figure', () => {
    expect(formatRecoveryMinutes(null)).toBe('—');
    expect(formatRecoveryMinutes(undefined)).toBe('—');
    expect(formatRecoveryMinutes(Number.NaN)).toBe('—');
    expect(formatRecoveryMinutes(-5)).toBe('—');
  });

  it('flags a stay that is a data fault rather than a recovery', () => {
    expect(recoveryTimeLooksWrong(102711)).toBe(true);
    expect(recoveryTimeLooksWrong(IMPLAUSIBLE_RECOVERY_MINUTES)).toBe(true);
    expect(recoveryTimeLooksWrong(180)).toBe(false);
    expect(recoveryTimeLooksWrong(null)).toBe(false);
  });
});

describe('the slip itself', () => {
  const page = () => read(PAGE);

  it('has no two-column rows left in it', () => {
    // At 72mm a two-column row either wraps into a jumble or pushes its
    // second column off the paper. The whole slip is one column now.
    const slip = page().slice(page().indexOf('id="transfer-slip"'));
    expect(slip).not.toContain('<td');
    expect(slip).not.toContain('<table');
  });

  it('prints the recovery time in words, not as raw minutes', () => {
    const s = page();
    expect(s).toContain('formatRecoveryMinutes(a.totalTimeInPACU)');
    expect(s).not.toContain('${a.totalTimeInPACU} min');
  });

  it('uses no grey, because a thermal head has none', () => {
    const slip = page().slice(page().indexOf('id="transfer-slip"'));
    expect(slip).not.toContain('#444');
    expect(slip).not.toMatch(/color: '#[89abcdefABCDEF]/);
  });

  it('uses no serif type, which turns to mush at 203 dpi', () => {
    const slip = page().slice(page().indexOf('id="transfer-slip"'));
    expect(slip).not.toContain('Georgia');
    expect(slip).toContain("fontFamily: 'Arial, Helvetica, sans-serif'");
  });

  it('feeds blank paper past the cutter so the last line survives', () => {
    expect(page()).toContain("<div style={{ height: '12mm' }} />");
  });

  it('takes its width and padding from the chosen paper, not from a constant', () => {
    const s = page();
    expect(s).toContain('width: spec.width,');
    expect(s).toContain('padding: spec.padding,');
    expect(s).toContain('fontSize: spec.fontSize,');
  });

  it('takes its print rules from the paper, with no @page left in the page', () => {
    const s = page();
    expect(s).toContain('<style>{slipPrintCss(paper)}</style>');
    expect(s).not.toContain('@page { size: A5');
  });

  it('defaults to the roll, and still offers the sheet', () => {
    const s = page();
    expect(s).toContain("useState<SlipPaper>('THERMAL_80')");
    expect(s).toContain('Object.values(PAPERS)');
    expect(s).toContain('thermal paper fades');
  });

  it('still marks a red alert, with weight rather than with colour', () => {
    const s = page();
    expect(s).toContain('** RED ALERT DURING RECOVERY **');
    expect(s).toContain('HAND OVER VERBALLY');
  });

  it('still carries everything the A5 slip carried', () => {
    const s = page();
    ['ESCORT:', 'GOES WITH THE PATIENT', 'Porter 1', 'Porter 2',
      'Recovery nurse', 'Receiving ward nurse', 'Folder', 'Procedure', 'Surgeon']
      .forEach((bit) => expect(s).toContain(bit));
  });
});
