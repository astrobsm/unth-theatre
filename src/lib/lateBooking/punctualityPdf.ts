// ============================================================
// The booking punctuality board, on hospital letterhead
// ------------------------------------------------------------
// The counterpart to the duty-performance PDF, and written to the same rule:
// colleagues who book in good time are named in full, and nobody is named as
// a poor performer on a document that can be forwarded, pinned up or
// photographed. The late-booking report already exists for that, it is
// restricted, and it is where those names belong.
//
// Every figure comes from the same PunctualityReport the board renders, so the
// paper and the screen cannot disagree.
// ============================================================

import {
  newDocument, drawHeader, drawFooters, drawSectionHeading,
  ensureSpace, getAutoTable, PAGE, CONTENT_WIDTH, INK,
} from '@/lib/institutionalPdf';
import {
  formatNotice, COMMENDATION_RATE, MIN_CASES_TO_RANK,
  type PunctualityReport,
} from './punctuality';

const pct = (rate: number | null): string =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;

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

const finalY = (doc: unknown) =>
  (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function buildBookingPerformancePdf(
  report: PunctualityReport,
  options: { periodLabel: string; preparedBy?: string | null },
): Promise<Blob> {
  const doc = await newDocument();
  const autoTable = await getAutoTable();

  let y = drawHeader(doc, {
    department: 'Theatre Complex — Elective Booking',
    documentTitle: 'Booking performance',
    reference: options.periodLabel,
  });

  y = drawSectionHeading(doc, 'The period at a glance', y);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  const intro = doc.splitTextToSize(
    `Elective cases booked before 15:00 on the day before surgery, for ${options.periodLabel}. `
    + 'Emergency and urgent cases are excluded: they are booked when the patient needs them '
    + 'and could not have been booked ahead.',
    CONTENT_WIDTH,
  ) as string[];
  intro.forEach((line) => { doc.text(line, PAGE.margin, y); y += 4.2; });
  y += 2;

  autoTable(doc, {
    ...TABLE_STYLES,
    startY: y,
    head: [['Elective cases', 'Booked on time', 'Compliance', 'Typical notice']],
    body: [[
      String(report.totalElective),
      String(report.totalOnTime),
      pct(report.overallComplianceRate),
      formatNotice(report.medianNoticeHours),
    ]],
  });
  y = finalY(doc) + 8;

  // Notice is reported beside compliance wherever either appears, because
  // compliance alone teaches people that beating the clock is the whole job.
  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK.muted);
  const note = doc.splitTextToSize(
    'Notice is reported beside compliance. A case booked at 14:55 on the day before meets the '
    + 'rule and gives the theatre five minutes; one booked three days ahead gives every '
    + 'department room to work. Both are compliant; they are not the same contribution.',
    CONTENT_WIDTH,
  ) as string[];
  note.forEach((line) => { doc.text(line, PAGE.margin, y); y += 4; });
  doc.setTextColor(...INK.body);
  y += 4;

  if (report.commendable.length > 0) {
    y = ensureSpace(doc, y, 40);
    y = drawSectionHeading(
      doc,
      `Commended — ${Math.round(COMMENDATION_RATE * 100)}% or more booked before the deadline`,
      y,
    );
    autoTable(doc, {
      ...TABLE_STYLES,
      startY: y,
      head: [['#', 'Name', 'Unit', 'On time', 'Compliance', 'Typical notice']],
      body: report.commendable.map((b, i) => [
        String(i + 1),
        b.name + (b.perfect ? '  (every one)' : ''),
        b.units.join(', '),
        `${b.onTime} of ${b.electiveTotal}`,
        pct(b.complianceRate),
        formatNotice(b.medianNoticeHours),
      ]),
    });
    y = finalY(doc) + 8;
  }

  const rankedUnits = report.units.filter((u) => u.ranked);
  if (rankedUnits.length > 0) {
    y = ensureSpace(doc, y, 40);
    y = drawSectionHeading(doc, 'By unit', y);
    autoTable(doc, {
      ...TABLE_STYLES,
      startY: y,
      head: [['#', 'Unit', 'Elective', 'On time', 'Compliance', 'Typical notice']],
      body: rankedUnits.map((u, i) => [
        String(i + 1), u.unit, String(u.electiveTotal), String(u.onTime),
        pct(u.complianceRate), formatNotice(u.medianNoticeHours),
      ]),
    });
    y = finalY(doc) + 8;
  }

  y = ensureSpace(doc, y, 40);
  y = drawSectionHeading(doc, 'Why this is measured', y);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  const why = doc.splitTextToSize(
    'When an elective case is booked in good time the list is planned once rather than rebuilt, '
    + 'CSSD sterilises the right sets without a rush, pharmacy and the consumable pack providers '
    + 'draw what the case actually needs, and the nursing officer assigns staff knowing what each '
    + 'theatre will be doing. None of that is visible on the day, which is precisely why it is '
    + 'worth saying out loud. '
    + `At least ${MIN_CASES_TO_RANK} elective cases are needed before a percentage means enough `
    + 'to rank; colleagues below that are listed on the board but not ranked.',
    CONTENT_WIDTH,
  ) as string[];
  why.forEach((line) => { doc.text(line, PAGE.margin, y); y += 4.2; });

  drawFooters(doc, {
    reference: `Booking performance · ${options.periodLabel}`
      + (options.preparedBy ? ` · prepared by ${options.preparedBy}` : ''),
  });

  return doc.output('blob');
}

export function bookingPdfFilename(report: PunctualityReport): string {
  return `booking-performance-${report.from}-to-${report.to}.pdf`;
}
