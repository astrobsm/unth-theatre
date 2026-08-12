// ============================================================
// The surgery cost estimate, as a document
// ------------------------------------------------------------
// Handed to a patient or a relative, who will plan around it and may bring it
// back weeks later. So it renders ONLY from the stored estimate — never by
// re-reading current prices. Reprinting last month's estimate must produce last
// month's figures.
//
// Built on the institutional layer, so this and a published Conflict Resolver
// decision look like documents from the same hospital.
// ============================================================

import {
  newDocument, drawHeader, drawFooters, drawWatermark, drawSectionHeading,
  drawFieldGrid, drawSignatures, drawNoticeBox, ensureSpace, getAutoTable,
  pdfMoney, PAGE, CONTENT_WIDTH, INK,
} from '@/lib/institutionalPdf';
import { SECTION_LABELS, SECTION_ORDER, type EstimateSection } from './calculate';

export interface EstimatePdfLine {
  section: string;
  description: string;
  unit: string;
  quantity: number;
  unitPriceKobo: number;
  totalKobo: number;
  frequencyPerDay?: number | null;
  durationDays?: number | null;
  priceOverridden?: boolean;
}

export interface EstimatePdfData {
  estimateNumber: string;
  status: string;
  revision: number;
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  diagnosis?: string | null;
  subspecialty?: string | null;
  unit?: string | null;
  surgeonName?: string | null;
  anaesthesiaType?: string | null;
  surgeryType?: string | null;
  plannedDate?: Date | string | null;
  admissionType: string;
  expectedStayDays: number;
  subtotalKobo: number;
  depositKobo: number;
  totalKobo: number;
  validUntil?: Date | string | null;
  preparedByName?: string | null;
  approvedByName?: string | null;
  approvedAt?: Date | string | null;
  notes?: string | null;
  lines: EstimatePdfLine[];
}

const asText = (v: Date | string | null | undefined): string => {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
};

/**
 * Anything not yet approved is watermarked.
 *
 * A DRAFT estimate is uncosted or unchecked, and one that prints identically to
 * an approved one WILL be handed to a patient by someone in a hurry. The
 * watermark is the only thing preventing that.
 */
function watermarkFor(status: string): string | null {
  const s = status.toUpperCase();
  if (s === 'DRAFT') return 'Draft — not for issue';
  if (s === 'PENDING_REVIEW') return 'Awaiting approval';
  if (s === 'CANCELLED') return 'Cancelled';
  if (s === 'SUPERSEDED') return 'Superseded';
  if (s === 'EXPIRED') return 'Expired';
  return null;
}

export async function buildEstimatePdf(data: EstimatePdfData): Promise<Blob> {
  const doc = await newDocument();
  const autoTable = await getAutoTable();
  const watermark = watermarkFor(data.status);

  let y = drawHeader(doc, {
    department: 'Theatre Complex — Surgery Cost Estimate',
    documentTitle: 'Surgery Cost Estimate',
    reference: data.estimateNumber,
    // Status is stated in TEXT as well as by the watermark. The watermark uses
    // graphics-state opacity, and if that ever fails to render — an old reader,
    // a future jsPDF change — a draft would print looking approved. Status must
    // never be carried by a graphical flourish alone.
    version: [
      data.revision > 1 ? `Revision ${data.revision}` : null,
      watermark ? data.status.replace(/_/g, ' ') : null,
    ].filter(Boolean).join('   ·   ') || undefined,
  });

  if (watermark) {
    // Never lets a rendering problem cost the whole document — the textual
    // status above is already in place, so degrading here is safe.
    try { drawWatermark(doc, watermark); }
    catch (err) { console.warn('[estimate pdf] watermark did not render', err); }
  }

  // ---- Patient and case ---------------------------------------------------
  y = drawSectionHeading(doc, 'Patient and case', y);
  y = drawFieldGrid(doc, [
    { label: 'Patient', value: data.patientName },
    { label: 'Folder number', value: data.folderNumber || '—' },
    { label: 'Procedure', value: data.procedureName },
    { label: 'Diagnosis', value: data.diagnosis || '—' },
    { label: 'Unit', value: data.unit || data.subspecialty || '—' },
    { label: 'Surgeon', value: data.surgeonName || 'To be assigned' },
    { label: 'Anaesthesia', value: data.anaesthesiaType || 'To be determined' },
    { label: 'Planned date', value: asText(data.plannedDate) },
    { label: 'Admission', value: data.admissionType === 'DAY_CASE' ? 'Day case' : 'Inpatient' },
    {
      label: 'Expected stay',
      value: data.expectedStayDays > 0
        ? `${data.expectedStayDays} day${data.expectedStayDays === 1 ? '' : 's'}`
        : '—',
    },
  ], y);

  // ---- Charges, grouped ---------------------------------------------------
  // Grouped and sub-totalled because a patient reads an estimate to find out
  // what they must bring money for, and a single 40-row list answers nothing.
  const present = SECTION_ORDER.filter(
    (s) => data.lines.some((l) => l.section === s));

  for (const section of present) {
    const rows = data.lines.filter((l) => l.section === section);
    const sectionTotal = rows.reduce((sum, l) => sum + l.totalKobo, 0);

    y = ensureSpace(doc, y, 26);
    y = drawSectionHeading(doc, SECTION_LABELS[section as EstimateSection] ?? section, y);

    autoTable(doc, {
      startY: y,
      margin: { left: PAGE.margin, right: PAGE.margin },
      head: [['Item', 'Qty', 'Unit price', 'Amount']],
      body: rows.map((l) => [
        // The derivation is shown, not just the answer: "15" invites the
        // question, "3 x daily for 5 days" answers it before it is asked.
        l.frequencyPerDay && l.durationDays
          ? `${l.description}\n(${l.frequencyPerDay} x daily for ${l.durationDays} days)`
          : l.description,
        `${l.quantity} ${l.unit === 'each' ? '' : l.unit}`.trim(),
        pdfMoney(l.unitPriceKobo),
        pdfMoney(l.totalKobo),
      ]),
      foot: [['', '', 'Section total', pdfMoney(sectionTotal)]],
      theme: 'grid',
      styles: {
        font: 'times', fontSize: 8.5, cellPadding: 1.6,
        textColor: [...INK.body] as [number, number, number], lineColor: [200, 206, 214], lineWidth: 0.1,
      },
      headStyles: {
        font: 'times', fontStyle: 'bold', fontSize: 8.5,
        fillColor: [238, 242, 247], textColor: [...INK.accent] as [number, number, number],
      },
      footStyles: {
        font: 'times', fontStyle: 'bold', fontSize: 8.5,
        fillColor: [248, 250, 252], textColor: [...INK.body] as [number, number, number],
      },
      columnStyles: {
        0: { cellWidth: CONTENT_WIDTH - 88 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 34, halign: 'right' },
        3: { cellWidth: 34, halign: 'right' },
      },
      didDrawPage: () => {
        if (!watermark) return;
        try { drawWatermark(doc, watermark); } catch { /* see above */ }
      },
    });

    // @ts-expect-error lastAutoTable is added by the plugin at runtime.
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  if (!present.length) {
    y = drawSectionHeading(doc, 'Charges', y);
    doc.setFont('times', 'italic');
    doc.setFontSize(9);
    doc.text('No charges have been costed on this estimate yet.', PAGE.margin, y);
    doc.setFont('times', 'normal');
    y += 8;
  }

  // ---- Total --------------------------------------------------------------
  y = ensureSpace(doc, y, 30);
  const boxX = PAGE.width - PAGE.margin - 82;
  doc.setDrawColor(...INK.accent);
  doc.setLineWidth(0.5);
  doc.rect(boxX, y, 82, data.depositKobo > 0 ? 20 : 12);

  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK.accent);
  doc.text('TOTAL ESTIMATE', boxX + 3, y + 7.5);
  doc.text(pdfMoney(data.totalKobo), boxX + 79, y + 7.5, { align: 'right' });

  if (data.depositKobo > 0) {
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK.body);
    doc.text('Deposit payable before surgery', boxX + 3, y + 15.5);
    doc.setFont('times', 'bold');
    doc.text(pdfMoney(data.depositKobo), boxX + 79, y + 15.5, { align: 'right' });
  }
  y += (data.depositKobo > 0 ? 20 : 12) + 7;
  doc.setTextColor(...INK.body);

  // ---- What this document is and is not -----------------------------------
  const caveats = [
    'This is an ESTIMATE of expected costs, not a bill or a receipt. The final amount may differ if the operation, the length of stay, or the materials required change.',
    'Emergency treatment, complications, intensive care and blood products beyond those listed are not included.',
    data.validUntil
      ? `These prices are held until ${asText(data.validUntil)}. After that date the estimate must be re-issued.`
      : 'Prices are those in force on the date shown and may be revised.',
    'Payment arrangements and any subsidy, NHIS or HMO cover are handled separately by the hospital finance office.',
  ];
  y = drawNoticeBox(doc, 'Important — please read', caveats, y);

  if (data.notes?.trim()) {
    y = drawSectionHeading(doc, 'Notes', y);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(data.notes.trim(), CONTENT_WIDTH) as string[];
    y = ensureSpace(doc, y, wrapped.length * 4.4 + 4);
    wrapped.forEach((l, i) => doc.text(l, PAGE.margin, y + i * 4.4));
    y += wrapped.length * 4.4 + 5;
  }

  // ---- Signatures ---------------------------------------------------------
  y = drawSignatures(doc, [
    { role: 'Prepared by', name: data.preparedByName ?? null },
    {
      role: 'Approved by',
      name: data.approvedByName ?? null,
      approvedAt: data.approvedAt ?? null,
    },
  ], y);

  drawFooters(doc, {
    reference: `${data.estimateNumber}${data.revision > 1 ? ` rev ${data.revision}` : ''}`,
    verifyPath: `Verify at unth-theatre.link/verify/estimate/${data.estimateNumber}`,
  });

  return doc.output('blob');
}

/** Filename a patient or a records clerk can file without renaming. */
export function estimateFileName(data: Pick<EstimatePdfData,
  'estimateNumber' | 'patientName' | 'revision'>): string {
  const safe = data.patientName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rev = data.revision > 1 ? `-rev${data.revision}` : '';
  return `${data.estimateNumber}-${safe}${rev}.pdf`;
}
