// ============================================================
// Retirement form — PDF
// ------------------------------------------------------------
// The imprest system rendered this server-side with PDFKit. This app already
// carries jsPDF + autotable + qrcode and uses them for prescriptions and
// consent forms, so the form is produced with those rather than introducing a
// second PDF engine and 1,400 lines of template code to maintain.
//
// Issuing is a three-step dance, forced by the problem:
//   1. ask the server for an identifier — the QR must carry it, so it has to
//      exist before anything is drawn;
//   2. draw the document, QR included;
//   3. hash the finished bytes and register that checksum, which is what
//      /verify/imprest/<id> later confirms.
//
// If step 3 never happens the document verifies as "issued, but not certified"
// rather than silently appearing intact.
// ============================================================

import { formatNaira } from './money';

export interface RetirementPdfInput {
  retirementNumber: string;
  retirementDate: string | Date;
  status: string;
  currentStage: string;
  amountReceived: number;
  totalExpenditure: number;
  balanceReturned: number;
  expenditureCount: number;
  receiptCount: number;
  /** Unspent imprest still owed by the officer. */
  refundDue?: number | null;
  certificationText?: string | null;
  remarks?: string | null;
  imprest?: {
    imprestNumber: string;
    purpose: string;
    quarter?: string | null;
    financialYear?: { label: string } | null;
    treasuryVoucherNumber?: string | null;
    department?: { code: string; name: string } | null;
  } | null;
  preparedBy?: { fullName: string } | null;
  checkedBy?: { fullName: string } | null;
  approvedBy?: { fullName: string } | null;
  lines?: Array<{
    date: string | Date;
    expenseNumber: string;
    description: string;
    vendorName: string;
    totalCost: number;
    receiptNumber?: string | null;
    paymentVoucherNumber?: string | null;
    attachmentCount?: number;
  }>;
}

/** SHA-256 of the finished PDF, hex — the same digest the server stores. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const asDate = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const QUARTER_NAME: Record<string, string> = {
  Q1: 'First Quarter',
  Q2: 'Second Quarter',
  Q3: 'Third Quarter',
  Q4: 'Fourth Quarter',
};

function quarterPeriod(quarter?: string | null, year?: string | null): string {
  if (!quarter) return year ?? '—';
  return `${QUARTER_NAME[quarter] ?? quarter}${year ? `, ${year}` : ''}`;
}

/**
 * Produce the retirement form, register it, and hand back the blob.
 * Throws only if the identifier cannot be allocated — without one there is
 * nothing to print on the page and no way to verify what was issued.
 */
export async function generateRetirementForm(
  data: RetirementPdfInput
): Promise<{ blob: Blob; documentId: string; verifyUrl: string; certified: boolean }> {
  // ---- 1. Allocate the identifier -----------------------------------------
  const allocRes = await fetch('/api/imprest/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentType: 'RETIREMENT_FORM',
      title: `Retirement ${data.retirementNumber}`,
      watermark: data.status === 'CLOSED' ? null : 'DRAFT',
    }),
  });
  if (!allocRes.ok) {
    const body = await allocRes.json().catch(() => ({}));
    throw new Error(body.error || 'Could not issue a document identifier.');
  }
  const { document: doc, verifyUrl } = await allocRes.json();
  const documentId: string = doc.documentId;

  // ---- 2. Draw ------------------------------------------------------------
  const [{ default: jsPDF }, autoTableMod, QRCode] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('qrcode'),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL, ITUKU-OZALLA', pageWidth / 2, y, { align: 'center' });
  y += 16;
  pdf.setFontSize(10);
  pdf.text('THEATRE COMMERCIALIZED UNIT — OFFICE OF THE CHAIRMAN', pageWidth / 2, y, { align: 'center' });
  y += 18;
  pdf.setFontSize(12);
  pdf.text('IMPREST RETIREMENT FORM', pageWidth / 2, y, { align: 'center' });
  y += 22;

  // Unretired funds are the figure the whole form exists to state.
  const unaccounted = data.amountReceived - data.totalExpenditure - data.balanceReturned;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const particulars: Array<[string, string]> = [
    ['Retirement number', data.retirementNumber],
    ['Date', asDate(data.retirementDate)],
    ['Imprest', data.imprest?.imprestNumber ?? '—'],
    // The quarter and financial year are what the Treasury files the form
    // under, so they sit above the departmental detail.
    ['Period', quarterPeriod(data.imprest?.quarter, data.imprest?.financialYear?.label)],
    ['Treasury voucher', data.imprest?.treasuryVoucherNumber || '—'],
    ['Department', data.imprest?.department ? `${data.imprest.department.code} — ${data.imprest.department.name}` : '—'],
    ['Purpose', data.imprest?.purpose ?? '—'],
    ['Status', `${data.status.replace(/_/g, ' ')} (${data.currentStage.replace(/_/g, ' ')})`],
  ];
  for (const [label, value] of particulars) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(value), margin + 110, y, { maxWidth: pageWidth - margin * 2 - 110 });
    y += 14;
  }
  y += 6;

  autoTable(pdf, {
    startY: y,
    head: [['', 'Amount']],
    body: [
      ['Imprest received', formatNaira(data.amountReceived)],
      [`Expenditure (${data.expenditureCount} lines, ${data.receiptCount} with receipts)`, formatNaira(data.totalExpenditure)],
      ['Balance', formatNaira(data.amountReceived - data.totalExpenditure)],
      ['Cash returned', formatNaira(data.balanceReturned)],
      // Prefer the stored figure: it is what Accounts will chase, and computing
      // it here again could disagree with the record if a line was voided.
      ['Refund due from officer', formatNaira(data.refundDue ?? unaccounted)],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });
  y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;

  if (data.lines?.length) {
    autoTable(pdf, {
      startY: y,
      head: [['Date', 'Ref', 'Description', 'Vendor', 'PV No.', 'Receipt', 'Amount']],
      body: data.lines.map((l) => [
        asDate(l.date),
        l.expenseNumber,
        l.description,
        l.vendorName,
        l.paymentVoucherNumber ?? '—',
        l.receiptNumber ?? '—',
        formatNaira(l.totalCost),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175] },
      columnStyles: { 6: { halign: 'right' } },
      margin: { left: margin, right: margin },
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;

    // Index of supporting documents. An auditor works through this list against
    // the physical bundle, so a line with nothing behind it is stated as such
    // rather than simply absent from the index.
    if (data.lines.some((l) => l.attachmentCount !== undefined)) {
      if (y > pdf.internal.pageSize.getHeight() - 160) {
        pdf.addPage();
        y = margin;
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text('INDEX OF SUPPORTING DOCUMENTS', margin, y);
      y += 8;
      autoTable(pdf, {
        startY: y,
        head: [['#', 'Ref', 'Particulars', 'Documents attached']],
        body: data.lines.map((l, i) => [
          String(i + 1),
          l.expenseNumber,
          l.description,
          (l.attachmentCount ?? 0) > 0 ? `${l.attachmentCount} attached` : 'NONE ATTACHED',
        ]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [30, 64, 175] },
        columnStyles: { 0: { cellWidth: 24 }, 3: { halign: 'center' } },
        margin: { left: margin, right: margin },
      });
      y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;
    }
  }

  // Certification, five signature blocks in two rows, the stamp box and the QR
  // need roughly 320pt between them. Splitting them across a page break would
  // leave a signature panel with nothing above it to sign for.
  if (y > pdf.internal.pageSize.getHeight() - 320) {
    pdf.addPage();
    y = margin;
  }

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('CERTIFICATION', margin, y);
  y += 12;
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    data.certificationText ??
      'I certify that the expenditure listed above was incurred for the purpose for which the imprest was granted, and that the balance shown has been returned.',
    margin,
    y,
    { maxWidth: pageWidth - margin * 2 }
  );
  y += 34;

  // Signature blocks: every office in the statutory chain gets one, so an
  // unsigned stage is visibly unsigned rather than quietly omitted. Only three
  // of the five are recorded against named columns on the retirement — the
  // remaining two are signed in ink and left blank here on purpose.
  const signatories: Array<[string, string]> = [
    ['Imprest Holder', data.preparedBy?.fullName ?? ''],
    ['Accounts Department', data.checkedBy?.fullName ?? ''],
    ['Internal Audit', ''],
    ['Chief Accountant', ''],
    ['Chief Medical Director', data.approvedBy?.fullName ?? ''],
  ];

  // Five across an A4 width leaves no room to sign, so they go two rows deep.
  const perRow = 3;
  const colWidth = (pageWidth - margin * 2) / perRow;
  const rowHeight = 62;
  signatories.forEach(([role, name], i) => {
    const x = margin + (i % perRow) * colWidth;
    const rowY = y + Math.floor(i / perRow) * rowHeight;
    pdf.line(x, rowY + 24, x + colWidth - 20, rowY + 24);
    pdf.setFontSize(8);
    pdf.text(role, x, rowY + 34);
    pdf.setFontSize(7);
    pdf.setTextColor(120);
    pdf.text('Name / Signature / Date', x, rowY + 43);
    pdf.setTextColor(0);
    pdf.setFontSize(8);
    if (name) {
      pdf.setFont('helvetica', 'bold');
      pdf.text(name, x, rowY + 20);
      pdf.setFont('helvetica', 'normal');
    }
  });
  y += Math.ceil(signatories.length / perRow) * rowHeight + 6;

  // Official stamp area — the form is not valid in the Treasury without one.
  pdf.setDrawColor(160);
  pdf.rect(pageWidth - margin - 130, y, 130, 56);
  pdf.setFontSize(7);
  pdf.setTextColor(120);
  pdf.text('OFFICIAL STAMP', pageWidth - margin - 124, y + 12);
  pdf.setTextColor(0);
  pdf.setDrawColor(0);
  y += 66;

  // QR + identifier, so a holder can check the document without an account.
  try {
    const qr = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 220 });
    pdf.addImage(qr, 'PNG', pageWidth - margin - 70, y, 70, 70);
  } catch {
    /* a missing QR must not stop the form being produced */
  }
  pdf.setFontSize(7);
  pdf.text(`Document ${documentId}`, margin, y + 20);
  pdf.text('Verify this document at:', margin, y + 32);
  pdf.text(verifyUrl, margin, y + 42, { maxWidth: pageWidth - margin * 2 - 90 });

  // Page numbers, added last because the total is only known now. An auditor
  // receiving a bundle needs to see that no sheet has been removed.
  const pageCount = pdf.getNumberOfPages();
  const pageHeight = pdf.internal.pageSize.getHeight();
  for (let p = 1; p <= pageCount; p += 1) {
    pdf.setPage(p);
    pdf.setFontSize(7);
    pdf.setTextColor(120);
    pdf.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
    pdf.text(data.retirementNumber, margin, pageHeight - 18);
    pdf.setTextColor(0);
  }

  // ---- 3. Register the finished bytes -------------------------------------
  const buffer = pdf.output('arraybuffer');
  const blob = new Blob([buffer], { type: 'application/pdf' });
  let certified = false;
  try {
    const checksum = await sha256Hex(buffer);
    const res = await fetch('/api/imprest/documents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        checksum,
        byteSize: buffer.byteLength,
        pageCount: pdf.getNumberOfPages(),
        dataUrl: pdf.output('datauristring'),
      }),
    });
    certified = res.ok;
  } catch {
    // Offline: the form is still usable, and verification will report it as
    // issued but not certified until the checksum is registered.
    certified = false;
  }

  return { blob, documentId, verifyUrl, certified };
}
