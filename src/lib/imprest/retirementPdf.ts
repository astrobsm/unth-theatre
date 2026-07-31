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
  certificationText?: string | null;
  remarks?: string | null;
  imprest?: {
    imprestNumber: string;
    purpose: string;
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
      ['Cash returned', formatNaira(data.balanceReturned)],
      ['Unaccounted', formatNaira(unaccounted)],
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
      head: [['Date', 'Ref', 'Description', 'Vendor', 'Receipt', 'Amount']],
      body: data.lines.map((l) => [
        asDate(l.date),
        l.expenseNumber,
        l.description,
        l.vendorName,
        l.receiptNumber ?? '—',
        formatNaira(l.totalCost),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175] },
      columnStyles: { 5: { halign: 'right' } },
      margin: { left: margin, right: margin },
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;
  }

  if (y > pdf.internal.pageSize.getHeight() - 190) {
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

  // Signature blocks: the chain as it actually stands, so an unsigned stage is
  // visibly unsigned rather than quietly omitted.
  const signatories: Array<[string, string]> = [
    ['Prepared by', data.preparedBy?.fullName ?? ''],
    ['Checked by', data.checkedBy?.fullName ?? ''],
    ['Approved by', data.approvedBy?.fullName ?? ''],
  ];
  const colWidth = (pageWidth - margin * 2) / 3;
  signatories.forEach(([role, name], i) => {
    const x = margin + i * colWidth;
    pdf.line(x, y + 24, x + colWidth - 20, y + 24);
    pdf.setFontSize(8);
    pdf.text(role, x, y + 36);
    if (name) {
      pdf.setFont('helvetica', 'bold');
      pdf.text(name, x, y + 20);
      pdf.setFont('helvetica', 'normal');
    }
  });
  y += 56;

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
