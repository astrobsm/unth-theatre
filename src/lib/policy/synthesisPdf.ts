/**
 * The review synthesis as a document the hospital can file.
 *
 * Markdown is the right carrier for the revision workflow — it diffs, it pastes
 * into the next draft. It is the wrong thing to hand a Chief Medical Director.
 * This builds the same content on the institutional letterhead, so what goes to
 * Management looks like a UNTH document and not a developer's text file.
 *
 * DRAWN IN THE BROWSER, and that is a constraint rather than a preference.
 * jsPDF's default export is not a constructor under Node — `new (await
 * import('jspdf')).default()` throws "jsPDF is not a constructor" on the server
 * — and institutionalPdf.ts is shared with the surgery estimate, so it is not
 * being reshaped to accommodate one more caller. The route therefore serves the
 * same document as JSON (`?format=synthesis&as=json`) and the page draws it.
 * One set of figures, two carriers; the Markdown and the PDF cannot disagree.
 *
 * THE PROVENANCE NOTICE IS NOT DECORATION. The schema's own comment records a
 * decision against model-written prose in a permanent institutional record,
 * "because a model's summary cannot be traced to source responses". This
 * document answers that objection in the only way a PDF can: by stating, on the
 * page, that a model drafted it, which model, under which prompt version, that
 * every finding was checked against the responses it cites, and that the
 * committee — not the model — decides. A reader two years from now has that in
 * front of them without access to this repository.
 */

import {
  newDocument,
  drawHeader,
  drawFooters,
  drawSectionHeading,
  drawNoticeBox,
  ensureSpace,
  getAutoTable,
  INK,
  PAGE,
  CONTENT_WIDTH,
} from '@/lib/institutionalPdf';

export interface SynthesisPdfData {
  title: string;
  version: string;
  closesAt: string;
  model?: string | null;
  promptVersion?: string | null;
  runAt?: string | null;
  attribution?: string;
  synthesis?: {
    executive_summary?: string;
    areas_of_agreement?: string[];
    contested_issues?: Array<{ summary: string }>;
    critical_concerns?: Array<{ type: string; summary: string }>;
    unit_barriers?: Array<{ unit: string; barrier: string; resources_needed?: string | null }>;
    for_the_meeting?: string[];
  };
  inconsistencies?: Array<{ summary: string }>;
  roster: {
    columns: readonly string[];
    rows: string[][];
    totalSections: number;
    sentence: string;
    summary: {
      invited: number; submitted: number; inProgress: number;
      openedOnly: number; notOpened: number; withdrawn: number;
      responseRatePercent: number;
    };
  };
  filenameStem?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local parts, never toLocaleDateString — see roster.ts for why. */
const dayText = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** Wrapped body text. Returns the y to carry on at. */
function paragraph(
  doc: Awaited<ReturnType<typeof newDocument>>,
  text: string,
  y: number,
  size = 9.5,
): number {
  doc.setFont('times', 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...INK.body);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  let cursor = ensureSpace(doc, y, Math.min(lines.length, 6) * 4.4 + 2);
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, 5);
    doc.text(line, PAGE.margin, cursor);
    cursor += 4.4;
  }
  return cursor + 1.5;
}

/** A bulleted list, or one honest line saying there was nothing. */
function bullets(
  doc: Awaited<ReturnType<typeof newDocument>>,
  items: string[],
  y: number,
  emptyText = 'None recorded.',
): number {
  if (items.length === 0) {
    doc.setFont('times', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...INK.muted);
    const cursor = ensureSpace(doc, y, 6);
    doc.text(emptyText, PAGE.margin, cursor);
    doc.setTextColor(...INK.body);
    return cursor + 5.5;
  }

  let cursor = y;
  doc.setFontSize(9.5);
  doc.setTextColor(...INK.body);
  for (const item of items) {
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(item, CONTENT_WIDTH - 5) as string[];
    cursor = ensureSpace(doc, cursor, 6);
    doc.text('•', PAGE.margin, cursor);
    lines.forEach((line, i) => {
      if (i > 0) cursor = ensureSpace(doc, cursor, 5);
      doc.text(line, PAGE.margin + 4, cursor);
      if (i < lines.length - 1) cursor += 4.4;
    });
    cursor += 5;
  }
  return cursor + 0.5;
}

export async function buildSynthesisPdf(data: SynthesisPdfData): Promise<Blob> {
  const doc = await newDocument();
  const autoTable = await getAutoTable();
  const s = data.synthesis ?? {};

  let y = drawHeader(doc, {
    department: 'Theatre Users Committee',
    documentTitle: `${data.title} — review synthesis`,
    version: `Version under review: ${data.version}`,
    reference: `Round closed ${dayText(data.closesAt)}`,
  });

  // ---- Provenance, before anything a reader might quote -------------------
  y = drawNoticeBox(doc, 'How this document was produced', [
    'This synthesis was drafted by an AI model from the committee’s own responses '
    + 'and checked against them automatically: every finding cites the responses it '
    + 'rests on, and a run citing a response that does not exist is refused rather '
    + 'than displayed.',
    data.model
      ? `Model ${data.model}${data.promptVersion ? `, prompt ${data.promptVersion}` : ''}`
        + `${data.runAt ? `, run ${dayText(data.runAt)}` : ''}.`
      : 'Model details not recorded for this run.',
    'It is a RECOMMENDATION to the committee. The committee decides.',
  ], y);

  // ---- Participation, early and not buried --------------------------------
  //
  // Deliberately ahead of the findings. "How many of the committee stood behind
  // this" governs how much weight every finding below it carries, and a reader
  // who has to hunt for it at the back will not hunt.
  y = drawSectionHeading(doc, 'Participation', y);
  y = paragraph(doc, data.roster.sentence, y);

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE.margin, right: PAGE.margin },
    head: [[...data.roster.columns]],
    body: data.roster.rows.length > 0
      ? data.roster.rows
      : [['Nobody was invited to this round.', '', '', '']],
    theme: 'grid',
    styles: {
      font: 'times', fontSize: 8.5, cellPadding: 1.6,
      textColor: [...INK.body] as [number, number, number],
      lineColor: [200, 206, 214], lineWidth: 0.1,
    },
    headStyles: {
      font: 'times', fontStyle: 'bold', fontSize: 8.5,
      fillColor: [238, 242, 247],
      textColor: [...INK.accent] as [number, number, number],
    },
  });
  // autoTable reports where it finished on the document it drew on.
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;

  // ---- The findings -------------------------------------------------------
  y = drawSectionHeading(doc, 'Executive summary', y);
  y = paragraph(doc, s.executive_summary?.trim() || 'Not produced.', y);

  y = drawSectionHeading(doc, 'Areas of agreement', y);
  y = bullets(doc, s.areas_of_agreement ?? [], y);

  y = drawSectionHeading(doc, 'Contested issues', y);
  y = bullets(doc, (s.contested_issues ?? []).map((c) => c.summary), y);

  y = drawSectionHeading(doc, 'Critical concerns', y);
  y = bullets(
    doc,
    (s.critical_concerns ?? []).map((c) => `${c.type.replace(/_/g, ' ')} — ${c.summary}`),
    y,
    'None raised.',
  );

  y = drawSectionHeading(doc, 'Barriers reported by each unit', y);
  y = bullets(
    doc,
    (s.unit_barriers ?? []).map((u) =>
      `${u.unit} — ${u.barrier}${u.resources_needed ? ` (Needs: ${u.resources_needed})` : ''}`),
    y,
  );

  y = drawSectionHeading(doc, 'Internal inconsistencies found', y);
  y = bullets(doc, (data.inconsistencies ?? []).map((i) => i.summary), y, 'None found.');

  y = drawSectionHeading(doc, 'For the committee meeting', y);
  y = bullets(doc, s.for_the_meeting ?? [], y, 'Nothing outstanding.');

  drawFooters(doc, {
    reference: `${data.title} — synthesis, version ${data.version}`,
  });

  return doc.output('blob');
}

/** A filename the Secretariat can file without renaming. */
export function synthesisFileName(data: SynthesisPdfData): string {
  if (data.filenameStem) return `${data.filenameStem}.pdf`;
  const safe = data.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${safe || 'policy'}-synthesis.pdf`;
}
