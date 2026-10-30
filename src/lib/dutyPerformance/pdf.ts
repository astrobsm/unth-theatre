// ============================================================
// The performance board as a document somebody can hand over
// ------------------------------------------------------------
// The WhatsApp summary is for the group chat and the CSV is for a
// spreadsheet. This is the third thing: a paper document on hospital
// letterhead, for a meeting, a notice board, or a file.
//
// IT SAYS THE SAME THING AS THE SCREEN. Every figure comes from the same
// DutyReport the board renders, so a PDF produced on Monday and the page
// somebody opens on Tuesday cannot disagree — which is exactly the argument
// that makes a performance figure worthless once it starts.
//
// ── WHO IS NAMED, AND WHERE ────────────────────────────────────────────────
//
// Colleagues who did well are named in full. That is the point of a
// commendation: a thank-you to "the pharmacy team" thanks nobody.
//
// Colleagues falling short are named ONLY in the confidential annexe, on its
// own page, under a heading that says what it is — and the annexe is printed
// only when the caller asks for it. A PDF gets forwarded, pinned to a board
// and photographed, and a list of names under "failing" travels much further
// than whoever printed it intended. The summary pages can be shared freely;
// the annexe is for the person holding the conversation.
//
// This mirrors the WhatsApp export, deliberately. Two exports of the same
// board that disagree about whether it is acceptable to name people would
// make the decision look arbitrary rather than considered.
// ============================================================

import {
  newDocument, drawHeader, drawFooters, drawSectionHeading, drawNoticeBox,
  ensureSpace, getAutoTable, PAGE, CONTENT_WIDTH, INK,
} from '@/lib/institutionalPdf';
import { formatRate, formatMargin } from './report';
import { DUTIES, type DutyReport, type DutyPerformance } from './types';

export interface DutyPdfOptions {
  periodLabel: string;
  /**
   * Print the names of those falling short, on a marked confidential page.
   *
   * Off by default. A document that names them by accident cannot be
   * un-forwarded, so it takes a deliberate choice.
   */
  includeShortfallAnnexe?: boolean;
  /** Who produced it, printed under the title. */
  preparedBy?: string | null;
}

const onTimeShare = (p: { total: number; done: number; late: number }) =>
  p.total > 0 ? (p.done - p.late) / p.total : null;

/**
 * Exactly which people this document will name, and under which heading.
 *
 * A PURE FUNCTION, SEPARATE FROM THE RENDERING, because this is the decision
 * in the file that can actually harm somebody: a name printed under "falling
 * short" on a document that then gets forwarded. Deciding it inside the
 * drawing code would mean the only way to check it is to generate a PDF and
 * read the text back, which is how it would come to be wrong without anybody
 * noticing.
 *
 * `shortfall` is empty unless the caller explicitly asked for the annexe.
 */
export function namesInDocument(
  report: DutyReport,
  options: { includeShortfallAnnexe?: boolean } = {},
): { commended: string[]; shortfall: string[] } {
  return {
    commended: report.commendable.map((p) => p.name),
    shortfall: options.includeShortfallAnnexe ? report.chaseable.map((p) => p.name) : [],
  };
}

const TABLE_STYLES = {
  styles: {
    font: 'times', fontSize: 8.5, cellPadding: 1.6,
    textColor: [...INK.body] as [number, number, number],
    lineColor: [200, 206, 214] as [number, number, number], lineWidth: 0.1,
  },
  headStyles: {
    font: 'times', fontStyle: 'bold' as const, fontSize: 8.5,
    fillColor: [238, 242, 247] as [number, number, number],
    textColor: [...INK.accent] as [number, number, number],
  },
  theme: 'grid' as const,
  margin: { left: PAGE.margin, right: PAGE.margin },
};

/** The finished PDF, as a Blob the caller can download or attach. */
export async function buildDutyPerformancePdf(
  report: DutyReport,
  options: DutyPdfOptions,
): Promise<Blob> {
  const def = DUTIES[report.duty];
  const doc = await newDocument();
  const autoTable = await getAutoTable();

  let y = drawHeader(doc, {
    department: `Theatre Complex — ${def.owner}`,
    documentTitle: `${def.label}: performance`,
    reference: options.periodLabel,
  });

  // ── What the period looked like ───────────────────────────────────
  y = drawSectionHeading(doc, 'The period at a glance', y);

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  const intro = doc.splitTextToSize(
    `This covers ${def.label.toLowerCase()} owed by ${def.owner.toLowerCase()} between `
    + `${options.periodLabel}. The deadline is ${def.deadline}`
    + (def.graceMinutes > 0
      ? `, with ${def.graceMinutes} minutes' grace before anything is counted late.`
      : '.'),
    CONTENT_WIDTH,
  ) as string[];
  intro.forEach((line) => { doc.text(line, PAGE.margin, y); y += 4.2; });
  y += 2;

  const share = report.total > 0 ? report.onTime / report.total : null;
  autoTable(doc, {
    ...TABLE_STYLES,
    startY: y,
    head: [['Due', 'Done on time', 'Done late', 'Never done', 'On time']],
    body: [[
      String(report.total),
      String(report.onTime),
      String(report.late),
      String(report.outstanding),
      formatRate(share),
    ]],
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 8;

  // Two rates, explained where they are read. A reader who takes a single
  // blended "performance" figure away from this page has taken the wrong
  // thing, and the explanation has to sit beside the numbers rather than in a
  // footnote nobody reaches.
  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK.muted);
  const note = doc.splitTextToSize(
    'Work never done is counted in the total, not excluded from it: a duty that was never '
    + 'performed is the more serious of the two failures, and dropping it would score somebody '
    + 'who did nothing above a colleague who did everything slightly late.',
    CONTENT_WIDTH,
  ) as string[];
  note.forEach((line) => { doc.text(line, PAGE.margin, y); y += 4; });
  doc.setTextColor(...INK.body);
  y += 4;

  // ── The people worth naming ───────────────────────────────────────
  if (report.commendable.length > 0) {
    y = drawSectionHeading(doc, 'Commended — on time, every time or nearly', y);
    autoTable(doc, {
      ...TABLE_STYLES,
      startY: y,
      head: [['#', 'Name', 'Unit', 'On time', 'Rate', 'Typically']],
      body: report.commendable.map((p: DutyPerformance, i: number) => [
        String(i + 1),
        p.name + (p.perfect ? '  (every one)' : ''),
        p.units.join(', '),
        `${p.done - p.late} of ${p.total}`,
        formatRate(onTimeShare(p)),
        formatMargin(p.medianMarginMinutes),
      ]),
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 8;
  }

  // ── Units, which are fair to name in either direction ─────────────
  const rankedUnits = report.units.filter((u) => u.ranked);
  if (rankedUnits.length > 0) {
    y = ensureSpace(doc, y, 40);
    y = drawSectionHeading(doc, 'By unit', y);
    autoTable(doc, {
      ...TABLE_STYLES,
      startY: y,
      head: [['#', 'Unit', 'Due', 'On time', 'Late', 'Never done', 'Rate']],
      body: rankedUnits.map((u, i) => [
        String(i + 1), u.unit, String(u.total), String(u.onTime),
        String(u.late), String(u.outstanding),
        formatRate(u.total > 0 ? u.onTime / u.total : null),
      ]),
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 8;
  }

  // ── Why it matters ────────────────────────────────────────────────
  y = ensureSpace(doc, y, 36);
  y = drawSectionHeading(doc, 'Why this is measured', y);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  const why = doc.splitTextToSize(def.why, CONTENT_WIDTH) as string[];
  why.forEach((line) => { doc.text(line, PAGE.margin, y); y += 4.2; });
  y += 3;

  if (report.chaseable.length > 0) {
    y = drawNoticeBox(
      doc,
      'Where we are falling short',
      [
        `${report.chaseable.length} colleague${report.chaseable.length === 1 ? '' : 's'} `
        + `fell below the ${Math.round(0.7 * 100)}% mark in this period.`,
        options.includeShortfallAnnexe
          ? 'They are named in the confidential annexe at the end of this document, which is '
            + 'for the person holding the conversation and is not for circulation.'
          : 'They are being written to individually. Names are deliberately not printed here: '
            + 'a document that is forwarded, pinned up or photographed carries them much '
            + 'further than intended.',
      ],
      y,
    );
  }

  // ── The confidential annexe, only if asked for ────────────────────
  // Gated on namesInDocument rather than on the flag directly, so the tested
  // decision is the one the document actually obeys.
  const named = namesInDocument(report, options);
  if (named.shortfall.length > 0) {
    doc.addPage();
    let ay = drawHeader(doc, {
      department: `Theatre Complex — ${def.owner}`,
      documentTitle: `${def.label}: confidential annexe`,
      reference: options.periodLabel,
      watermark: 'CONFIDENTIAL',
    });
    ay = drawSectionHeading(doc, 'Not for circulation', ay);

    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const warn = doc.splitTextToSize(
      'This page names individuals against a tally of work not done. It is intended for the '
      + 'person holding the conversation with them and for the head of the department. It '
      + 'should not be circulated, pinned up or forwarded.',
      CONTENT_WIDTH,
    ) as string[];
    warn.forEach((line) => { doc.text(line, PAGE.margin, ay); ay += 4.2; });
    ay += 3;

    autoTable(doc, {
      ...TABLE_STYLES,
      startY: ay,
      head: [['Name', 'Unit', 'Responsible for', 'Done', 'Never done', 'Late', 'On time']],
      body: report.chaseable.map((p) => [
        p.name, p.units.join(', '), String(p.total), String(p.done),
        String(p.outstanding), String(p.late), formatRate(onTimeShare(p)),
      ]),
    });
  }

  drawFooters(doc, {
    reference: `${def.label} · ${options.periodLabel}`
      + (options.preparedBy ? ` · prepared by ${options.preparedBy}` : ''),
  });

  return doc.output('blob');
}

/** `duty-preop-review-2026-10-01-to-2026-10-31.pdf` */
export function dutyPdfFilename(report: DutyReport): string {
  return `duty-${report.duty.toLowerCase().replace(/_/g, '-')}-${report.from}-to-${report.to}.pdf`;
}
