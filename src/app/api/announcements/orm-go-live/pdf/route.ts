import { NextResponse } from 'next/server';
import jsPDF from 'jspdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildPdf(): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 18;
  const innerW = pageW - margin * 2;
  let y = margin;

  // Header band
  doc.setFillColor(15, 76, 129); // UNTH blue
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('UNTH — THEATRE COMPLEX', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Office of the Director, Theatre Complex', margin, 18);
  doc.text('University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla, Enugu', margin, 23);
  doc.setTextColor(0);
  y = 36;

  // Title block
  doc.setFillColor(255, 247, 219);
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, innerW, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(120, 53, 15);
  doc.text('OFFICIAL ANNOUNCEMENT', margin + 4, y + 7);
  doc.setFontSize(11);
  doc.text(
    'GO-LIVE: Mandatory Use of the ORM Platform for All Surgical Bookings',
    margin + 4,
    y + 13,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Effective: Monday, 8 June 2026', margin + 4, y + 19);
  doc.setTextColor(0);
  y += 28;

  // To / From / Date meta
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('To:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(
    doc.splitTextToSize(
      'All Heads of Department, Consultants, Resident Doctors, Anaesthetists, Theatre Nurses, Perioperative Staff & Allied Units',
      innerW - 12,
    ),
    margin + 12,
    y,
  );
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.text('From:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Office of the Director, Theatre Complex', margin + 12, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text('5 June 2026', margin + 12, y);
  y += 8;

  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const ensure = (needed: number) => {
    if (y + needed > 282) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionTitle = (txt: string) => {
    ensure(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 76, 129);
    doc.text(txt, margin, y);
    doc.setTextColor(0);
    y += 5;
  };

  const para = (txt: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(txt, innerW);
    ensure(lines.length * 4.6 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.6 + 2;
  };

  const bullet = (txt: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(txt, innerW - 6);
    ensure(lines.length * 4.6 + 1);
    doc.text('•', margin + 1, y);
    doc.text(lines, margin + 6, y);
    y += lines.length * 4.6 + 1;
  };

  const numbered = (n: number, txt: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(txt, innerW - 8);
    ensure(lines.length * 4.6 + 1);
    doc.text(`${n}.`, margin + 1, y);
    doc.text(lines, margin + 8, y);
    y += lines.length * 4.6 + 1;
  };

  // 1
  sectionTitle('1. Effective Date');
  para(
    'With effect from Monday, 8 June 2026, ALL surgical bookings — elective and emergency, across every surgical unit — MUST be made on the ORM Platform. Paper booking lists and informal WhatsApp/phone bookings will no longer be accepted by the theatre, anaesthesia team, or pharmacy.',
  );

  // 2
  sectionTitle('2. What Changes on 8 June 2026');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  ensure(6);
  doc.text('A. Surgical Bookings', margin, y);
  y += 4.5;
  bullet('Every case must be booked on the ORM platform by the requesting surgical team.');
  bullet('The system will automatically: assign the on-duty anaesthetist from the duty roster; notify the theatre nurse-in-charge and the pack provider; generate the surgical pack list, anaesthetic prescription and pharmacy shopping list.');

  ensure(6);
  doc.setFont('helvetica', 'bold');
  doc.text('B. Surgical Consumable Packs — Patient Payment Flow', margin, y);
  y += 4.5;
  numbered(
    1,
    'Patients and their relatives will be directed to the Surgical Pack Consumable Shop located: UPSTAIRS, BESIDE THE FCMB ATM, AT THE OFFICE CLOSE TO THE FORMER DA OFFICE.',
  );
  numbered(2, 'At the shop, the patient pays for the surgical consumable pack for the scheduled procedure.');
  numbered(3, 'The cashier issues an official Evidence of Payment (receipt).');
  numbered(
    4,
    'The patient or a member of the surgical team presents this Evidence of Payment at the theatre to collect the packed consumables — already pre-packed and waiting based on the ORM booking.',
  );
  numbered(
    5,
    'No payment is to be collected at the theatre itself. Theatre staff will only release consumables against a valid Evidence of Payment.',
  );

  ensure(6);
  doc.setFont('helvetica', 'bold');
  doc.text('C. Anaesthetic Prescriptions', margin, y);
  y += 4.5;
  bullet('All anaesthetic prescriptions raised on ORM are wired automatically to the Pharmacy.');
  bullet('The pharmacy prepares and dispenses the prescribed drugs the night before / morning of surgery.');
  bullet('The surgical team will collect the dispensed drugs along with the consumable pack in the theatre.');

  // 3
  sectionTitle('3. Why This Change');
  bullet('One single source of truth for every booking — no double-booking, no missing patients.');
  bullet('Faster theatre turn-around — packs and drugs pre-staged before the patient arrives.');
  bullet('Transparent payments — patients pay at a clearly identified office, with a printed receipt.');
  bullet('Automatic alerts to the on-duty anaesthetist, nurse, pharmacy and pack provider.');
  bullet('Full audit trail for every consumable used and every drug dispensed.');

  // 4 — table
  sectionTitle('4. Action Required of Each Unit');
  const rows: Array<[string, string]> = [
    ['HoDs & Consultants', 'Brief your unit; confirm every team member has an ORM login.'],
    ['Residents / Booking Officers', 'Practise booking on ORM this week — support is available.'],
    ['Anaesthetists', 'Ensure your roster is current; verify your account can raise prescriptions.'],
    ['Theatre Nurses', 'Confirm the consumable catalogue for your specialty is correct on ORM.'],
    ['Pharmacy', 'Confirm the wired-prescription queue is being monitored daily.'],
    ['Pack Provider / Allied units', 'Ensure your portal account is active and notifications enabled.'],
    [
      'Patients & Relatives',
      'Will be directed by surgical teams to the Pack Shop (upstairs, beside FCMB ATM, near former DA office) for payment.',
    ],
  ];
  const colW = [55, innerW - 55];
  doc.setFontSize(9.5);
  for (const [who, what] of rows) {
    const whoLines = doc.splitTextToSize(who, colW[0] - 4);
    const whatLines = doc.splitTextToSize(what, colW[1] - 4);
    const rowH = Math.max(whoLines.length, whatLines.length) * 4.6 + 3;
    ensure(rowH);
    doc.setDrawColor(200);
    doc.setLineWidth(0.15);
    doc.rect(margin, y - 4, colW[0], rowH);
    doc.rect(margin + colW[0], y - 4, colW[1], rowH);
    doc.setFont('helvetica', 'bold');
    doc.text(whoLines, margin + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(whatLines, margin + colW[0] + 2, y);
    y += rowH;
  }
  y += 3;

  // 5
  sectionTitle('5. Login & Support');
  bullet('Platform: ORM Theatre Management System');
  bullet('Login issues / training: contact the Theatre IT desk or the System Administrator.');
  bullet('Hands-on training: Friday 5 June & Saturday 6 June — venue circulated by your HoD.');

  // 6
  sectionTitle('6. Compliance');
  para(
    'From 8 June 2026, any case NOT booked on ORM by 08:00 of the surgery day will be DEFERRED until properly entered. This protects patient safety, ensures correct staffing and guarantees that the required consumables and drugs are ready.',
  );

  // Sign-off
  y += 4;
  ensure(20);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  para('Let us all embrace this transition for safer, faster, and better-coordinated surgical care at UNTH.');
  y += 4;
  ensure(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Signed,', margin, y);
  y += 6;
  doc.text('Director, Theatre Complex', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('University of Nigeria Teaching Hospital (UNTH)', margin, y);

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `UNTH ORM Go-Live Announcement • Issued 5 June 2026 • Page ${i} of ${totalPages}`,
      margin,
      290,
    );
    doc.setTextColor(0);
  }

  const out = doc.output('arraybuffer');
  return out as ArrayBuffer;
}

export async function GET() {
  try {
    const bytes = buildPdf();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition':
          'inline; filename="UNTH-ORM-GoLive-8June2026.pdf"',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    console.error('[announcement-pdf] generation failed', err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: (err as Error)?.message ?? 'unknown' },
      { status: 500 },
    );
  }
}
