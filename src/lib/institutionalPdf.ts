// ============================================================
// The institutional document layer
// ------------------------------------------------------------
// One letterhead, one type scale, one footer, for every document this hospital
// hands to a patient, an auditor or a committee. Used by the surgery estimate
// and, next, by published Conflict Resolver decisions — so the two cannot drift
// into looking like they came from different institutions.
//
// TYPOGRAPHY
// jsPDF's default is Helvetica, which reads as an internal memo. These documents
// are permanent records of a federal teaching hospital, so body text is set in
// Times — a serif, and one of jsPDF's built-in fonts.
//
// Built-in rather than an embedded TTF, deliberately. Embedding would allow a
// nicer face and full Unicode, at the cost of ~200KB of base64 in the bundle
// and a font file nobody in this repo can inspect or update. Times is present in
// every PDF reader, renders identically everywhere, and cannot go missing. If
// the hospital later adopts a house typeface, this is the one file to change.
//
// The trade-off to know about: built-in fonts are WinAnsi-encoded, so characters
// outside CP1252 must be mapped — see pdfSafeText, which is installed on every
// document created here.
// ============================================================

import { installPdfTextGuard } from '@/lib/pdfSafeText';
import type jsPDFType from 'jspdf';

let _jsPDF: typeof jsPDFType | null = null;
let _autoTable: typeof import('jspdf-autotable').default | null = null;

// Loaded on demand: jsPDF and autoTable are large, and most pages never make a
// PDF. Keeping them out of the initial bundle matters on a theatre phone.
async function getJsPDF() {
  if (!_jsPDF) _jsPDF = (await import('jspdf')).default;
  return _jsPDF;
}
export async function getAutoTable() {
  if (!_autoTable) _autoTable = (await import('jspdf-autotable')).default;
  return _autoTable;
}

/** Millimetres. A4 portrait. */
export const PAGE = { width: 210, height: 297, margin: 18 } as const;
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

/** Ink, not decoration. Black text on white; one accent for rules and headings. */
export const INK = {
  body: [17, 24, 39] as [number, number, number],
  muted: [90, 98, 112] as [number, number, number],
  rule: [148, 163, 184] as [number, number, number],
  accent: [17, 60, 110] as [number, number, number],
  warn: [140, 20, 20] as [number, number, number],
} as const;

export interface InstitutionalHeader {
  /** e.g. "UNIVERSITY OF NIGERIA TEACHING HOSPITAL" */
  institution?: string;
  /** e.g. "Ituku-Ozalla, Enugu State" */
  address?: string;
  /** e.g. "Department of Surgery — Theatre Complex" */
  department?: string;
  /** The document's own name, e.g. "SURGERY COST ESTIMATE" */
  documentTitle: string;
  /** e.g. "EST-2026-000124" */
  reference?: string;
  /** Shown beside the reference, e.g. "Version 2" */
  version?: string;
  /**
   * Stamps a diagonal watermark across every page.
   *
   * An unapproved document that prints identically to an approved one is a
   * governance failure, not a cosmetic one — somebody will hand it over.
   */
  watermark?: string | null;
}

export const DEFAULT_INSTITUTION = 'UNIVERSITY OF NIGERIA TEACHING HOSPITAL';
export const DEFAULT_ADDRESS = 'Ituku-Ozalla, Enugu State, Nigeria';

/** A new document with the text guard installed and Times as the base face. */
export async function newDocument() {
  const JsPDF = await getJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  // Every document, without exception. One unguarded call corrupts a string.
  installPdfTextGuard(doc);
  doc.setFont('times', 'normal');
  doc.setTextColor(...INK.body);
  return doc;
}

/**
 * Draw the letterhead. Returns the y position content may start at.
 */
export function drawHeader(
  doc: jsPDFType,
  h: InstitutionalHeader
): number {
  const cx = PAGE.width / 2;
  let y = PAGE.margin;

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK.accent);
  doc.text(h.institution ?? DEFAULT_INSTITUTION, cx, y, { align: 'center' });
  y += 5;

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK.muted);
  doc.text(h.address ?? DEFAULT_ADDRESS, cx, y, { align: 'center' });
  y += 4.5;

  if (h.department) {
    doc.text(h.department, cx, y, { align: 'center' });
    y += 4.5;
  }

  // Double rule: the conventional mark of an institutional letterhead, and it
  // separates the letterhead from the document proper at a glance.
  doc.setDrawColor(...INK.accent);
  doc.setLineWidth(0.6);
  doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
  doc.setLineWidth(0.2);
  doc.line(PAGE.margin, y + 1, PAGE.width - PAGE.margin, y + 1);
  y += 7.5;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK.body);
  doc.text(h.documentTitle.toUpperCase(), cx, y, { align: 'center' });
  y += 5;

  if (h.reference || h.version) {
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK.muted);
    const ref = [h.reference, h.version].filter(Boolean).join('   ·   ');
    doc.text(ref, cx, y, { align: 'center' });
    y += 5;
  }

  return y + 2;
}

/** Diagonal watermark, drawn UNDER nothing — called before content on each page. */
export function drawWatermark(doc: jsPDFType, text: string): void {
  doc.saveGraphicsState();
  // @ts-expect-error setGState and GState exist at runtime; the types lag.
  doc.setGState(new doc.GState({ opacity: 0.12 }));
  doc.setFont('times', 'bold');
  doc.setFontSize(64);
  doc.setTextColor(...INK.warn);
  doc.text(text.toUpperCase(), PAGE.width / 2, PAGE.height / 2, {
    align: 'center',
    angle: 38,
  });
  doc.restoreGraphicsState();
  doc.setTextColor(...INK.body);
}

export interface FooterInfo {
  reference?: string;
  /** Where a recipient can confirm the document is genuine. */
  verifyPath?: string;
  /** Overridden only by tests; otherwise now. */
  generatedAt?: Date;
}

/**
 * Footers on every page, added last so the page count is known.
 *
 * "Page 2" with no total is how a document loses a page without anyone
 * noticing — which on a cost estimate means a section of charges the patient
 * never saw.
 */
export function drawFooters(doc: jsPDFType, info: FooterInfo = {}): void {
  const total = doc.getNumberOfPages();
  const stamp = info.generatedAt ?? new Date();

  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const y = PAGE.height - 12;

    doc.setDrawColor(...INK.rule);
    doc.setLineWidth(0.2);
    doc.line(PAGE.margin, y - 3.5, PAGE.width - PAGE.margin, y - 3.5);

    doc.setFont('times', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK.muted);

    if (info.reference) doc.text(info.reference, PAGE.margin, y);

    doc.text(`Page ${p} of ${total}`, PAGE.width / 2, y, { align: 'center' });

    // ISO date: unambiguous on a document that may be read anywhere, unlike
    // 08/12/2026 which means two different days either side of the Atlantic.
    doc.text(
      `Generated ${stamp.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      PAGE.width - PAGE.margin, y, { align: 'right' });

    if (info.verifyPath) {
      doc.text(info.verifyPath, PAGE.width / 2, y + 3.5, { align: 'center' });
    }
  }
}

/** A section heading, with the page break handled. */
export function drawSectionHeading(doc: jsPDFType, text: string, y: number): number {
  const next = ensureSpace(doc, y, 14);
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK.accent);
  doc.text(text, PAGE.margin, next);
  doc.setDrawColor(...INK.rule);
  doc.setLineWidth(0.2);
  doc.line(PAGE.margin, next + 1.5, PAGE.width - PAGE.margin, next + 1.5);
  doc.setTextColor(...INK.body);
  return next + 6;
}

/**
 * Start a new page if `needed` mm will not fit. Returns the y to draw at.
 *
 * Used before every block, because a signature block split across a page break
 * is the one defect that makes a document look unofficial.
 */
export function ensureSpace(doc: jsPDFType, y: number, needed: number): number {
  if (y + needed <= PAGE.height - 20) return y;
  doc.addPage();
  return PAGE.margin;
}

export interface LabelledField { label: string; value: string }

/** Two columns of label/value pairs — patient details, case details. */
export function drawFieldGrid(
  doc: jsPDFType,
  fields: LabelledField[],
  y: number
): number {
  const colWidth = CONTENT_WIDTH / 2;
  const lineHeight = 5;
  let cursor = ensureSpace(doc, y, Math.ceil(fields.length / 2) * lineHeight + 4);

  fields.forEach((f, i) => {
    const col = i % 2;
    const x = PAGE.margin + col * colWidth;
    if (col === 0 && i > 0) cursor += lineHeight;

    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK.muted);
    doc.text(`${f.label}:`, x, cursor);

    const labelWidth = doc.getTextWidth(`${f.label}: `);
    doc.setFont('times', 'bold');
    doc.setTextColor(...INK.body);
    // Truncated to the column so a long procedure name cannot run into the
    // adjacent value and produce an unreadable line.
    const room = colWidth - labelWidth - 4;
    let v = f.value || '—';
    while (v.length > 1 && doc.getTextWidth(v) > room) v = v.slice(0, -2) + '…';
    doc.text(v, x + labelWidth, cursor);
  });

  return cursor + lineHeight + 3;
}

export interface SignatureSlot {
  role: string;
  name?: string | null;
  /** Printed under the rule when the document records an actual approval. */
  approvedAt?: Date | string | null;
}

/**
 * Signature blocks, kept whole on one page.
 *
 * A named approver with a date is what makes a document institutional rather
 * than informational.
 */
export function drawSignatures(
  doc: jsPDFType,
  slots: SignatureSlot[],
  y: number
): number {
  const perRow = 2;
  const rows = Math.ceil(slots.length / perRow);
  let cursor = ensureSpace(doc, y + 4, rows * 22 + 6);

  const colWidth = CONTENT_WIDTH / perRow;

  slots.forEach((s, i) => {
    const col = i % perRow;
    if (col === 0 && i > 0) cursor += 22;
    const x = PAGE.margin + col * colWidth;
    const ruleY = cursor + 12;

    doc.setDrawColor(...INK.body);
    doc.setLineWidth(0.3);
    doc.line(x, ruleY, x + colWidth - 10, ruleY);

    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK.body);
    doc.text(s.role, x, ruleY + 4);

    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK.muted);
    if (s.name) doc.text(s.name, x, ruleY + 8);
    if (s.approvedAt) {
      const d = s.approvedAt instanceof Date ? s.approvedAt : new Date(s.approvedAt);
      if (!Number.isNaN(d.getTime())) {
        doc.text(d.toISOString().slice(0, 10), x, ruleY + 11.5);
      }
    }
  });

  return cursor + 24;
}

/**
 * A boxed paragraph for terms, conditions or caveats.
 *
 * On an estimate this is where "these figures are an estimate, not a bill" goes,
 * and it must be impossible to miss.
 */
export function drawNoticeBox(
  doc: jsPDFType,
  title: string,
  lines: string[],
  y: number
): number {
  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  const wrapped = lines.flatMap((l) => doc.splitTextToSize(l, CONTENT_WIDTH - 8) as string[]);
  const boxHeight = wrapped.length * 4 + 11;
  const cursor = ensureSpace(doc, y, boxHeight + 2);

  doc.setDrawColor(...INK.warn);
  doc.setLineWidth(0.4);
  doc.rect(PAGE.margin, cursor, CONTENT_WIDTH, boxHeight);

  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK.warn);
  doc.text(title.toUpperCase(), PAGE.margin + 4, cursor + 5.5);

  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK.body);
  wrapped.forEach((l, i) => doc.text(l, PAGE.margin + 4, cursor + 10.5 + i * 4));

  return cursor + boxHeight + 5;
}

/**
 * Money for a PDF: "NGN 1,500.00".
 *
 * NOT the ₦ sign. jsPDF's built-in fonts are WinAnsi and U+20A6 has no slot
 * there, so it does not merely fail to print — it corrupts the entire string it
 * appears in. pdfSafeText now maps it as a backstop, but a financial document
 * should not rely on a backstop for every figure on the page.
 */
export function pdfMoney(kobo: number): string {
  const naira = Math.trunc(kobo / 100);
  const k = Math.abs(kobo % 100);
  return `NGN ${naira.toLocaleString('en-NG')}.${String(k).padStart(2, '0')}`;
}
