// ============================================================
// Printing the recovery transfer slip on an 80mm thermal roll
// ------------------------------------------------------------
// Asked for on 7 November: the PACU transfer slip is to come out of an 80mm
// thermal printer rather than an A5 sheet.
//
// WHAT AN 80mm ROLL ACTUALLY GIVES YOU. The paper is 80mm wide; the print head
// covers 72mm of it (576 dots at 203 dpi), and the rest is the margin the
// mechanism needs. So the slip is laid out at 80mm with a 4mm gutter each
// side, and nothing may be wider than 72mm or it is simply cut off at the
// edge -- silently, with no warning on the screen.
//
// WHY THE WHOLE SLIP HAD TO BE RE-LAID-OUT AND NOT JUST RESIZED. The A5 slip
// put two facts on a line: patient and folder, procedure and destination,
// porter 1 and porter 2. At 72mm a two-column row either wraps into a jumble
// or pushes the second column off the paper. Everything is therefore one
// column, one fact per line, label first. That is also how a ward clerk reads
// a receipt: down, not across.
//
// WHAT A THERMAL PRINTER CANNOT DO, and what follows from each:
//   - It has no grey. Every dot is on or off, so grey text comes out as
//     speckle. Everything on this slip is pure black.
//   - It has no colour, so a red alert is marked with a heavy rule and
//     capitals rather than with red.
//   - Serif type at 9pt turns to mush at 203 dpi; the slip is sans-serif.
//   - The roll is continuous, so the page has no height. `size: 80mm auto`
//     is what stops the browser paginating a receipt into A4 sheets.
//   - The cutter sits a short distance past the head, so a slip that ends on
//     its last line gets its last line cut off. Blank space at the foot is
//     not decoration.
//
// THE A5 SHEET IS KEPT as a second button, because this slip is filed in the
// patient's notes and thermal paper fades -- months, not years, and faster in
// a warm room. The ward copy prints on the roll; anything that has to outlive
// the admission prints on the sheet.
// ============================================================

export type SlipPaper = 'THERMAL_80' | 'A5';

export interface PaperSpec {
  key: SlipPaper;
  label: string;
  /** What the @page rule says. */
  pageSize: string;
  /** The width the slip is laid out at. */
  width: string;
  /** Padding inside that width: the gutter the print head cannot reach. */
  padding: string;
  /** Base type size. 9pt is the smallest that stays legible at 203 dpi. */
  fontSize: string;
  /** One column at 80mm; two is what makes a receipt unreadable. */
  singleColumn: boolean;
}

export const PAPERS: Record<SlipPaper, PaperSpec> = {
  THERMAL_80: {
    key: 'THERMAL_80',
    label: '80mm thermal roll',
    // auto, never a fixed height: a roll has no page to break.
    pageSize: '80mm auto',
    width: '80mm',
    // 4mm each side leaves the 72mm the print head can actually reach.
    padding: '2mm 4mm',
    fontSize: '9pt',
    singleColumn: true,
  },
  A5: {
    key: 'A5',
    label: 'A5 sheet',
    pageSize: 'A5',
    width: '100%',
    padding: '10mm',
    fontSize: '10pt',
    singleColumn: false,
  },
};

export const paperSpec = (p: SlipPaper): PaperSpec => PAPERS[p] ?? PAPERS.THERMAL_80;

/**
 * The print stylesheet for a given paper.
 *
 * Built here rather than written into the page so the two rules that matter
 * can be tested: that the thermal page is 80mm wide with no margin, and that
 * nothing in the slip is allowed to exceed the printable width.
 */
export function slipPrintCss(paper: SlipPaper): string {
  const spec = paperSpec(paper);
  return [
    '@media print {',
    '  body * { visibility: hidden; }',
    '  #transfer-slip, #transfer-slip * { visibility: visible; }',
    '  #transfer-slip {',
    '    position: absolute; left: 0; top: 0;',
    `    width: ${spec.width};`,
    '    max-width: 100%;',
    '    border: none; border-radius: 0; box-shadow: none;',
    '  }',
    // A long folder number or a four-barrelled surname must wrap, not run off
    // the edge of the roll where nobody will ever see it missing.
    '  #transfer-slip * { overflow-wrap: anywhere; }',
    `  @page { size: ${spec.pageSize}; margin: ${paper === 'THERMAL_80' ? '0' : '10mm'}; }`,
    '}',
  ].join('\n');
}

/** Minutes past which a stay in recovery is a data fault, not a recovery. */
export const IMPLAUSIBLE_RECOVERY_MINUTES = 24 * 60;

/**
 * How long the patient was in recovery, in words.
 *
 * The slip used to print the raw figure, so a record whose admission time was
 * weeks earlier printed "Time in recovery: 102711 min". That is arithmetically
 * correct and no use to anybody: nobody converts five digits of minutes in
 * their head, and the number looked like a system fault rather than what it
 * is -- a record that was opened and never closed.
 */
export function formatRecoveryMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return '—';
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;

  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (m < IMPLAUSIBLE_RECOVERY_MINUTES) {
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return leftoverHours ? `${days} d ${leftoverHours} h` : `${days} d`;
}

/** Should the slip say the figure needs checking rather than state it flatly? */
export const recoveryTimeLooksWrong = (mins: number | null | undefined): boolean =>
  mins != null && Number.isFinite(mins) && mins >= IMPLAUSIBLE_RECOVERY_MINUTES;
