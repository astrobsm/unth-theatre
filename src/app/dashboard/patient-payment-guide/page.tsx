'use client';

/**
 * Patient Payment & Preparation Guide
 *
 * A surgeon-facing page that displays a clear, printable patient walk-through
 * of where and what to pay for once a surgery is booked. Includes a one-click
 * PDF export with the UNTH logo as a centered watermark on every page.
 *
 * Use case: print/handoff to patient and relatives at the point of booking
 * so they navigate the hospital correctly without re-asking the surgeon.
 */

import { useState } from 'react';
import { Download, Printer, MapPin, Receipt, Pill, Stethoscope, ListChecks, Phone, Loader2 } from 'lucide-react';
// jsPDF + autoTable (~400 KB) load only when a guide is actually generated.
import type jsPDF from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

const STATIONS = [
  {
    n: 1,
    title: 'Consumable Pack Shop (Surgical Pack Payment)',
    where:
      'Two locations — go to whichever is nearer:\n  (a) Accident & Emergency Department (A&E) - Pack Shop counter, OR\n  (b) Office close to the former DAS office (upstairs, beside the FCMB ATM).',
    pay: 'Pay for your surgical CONSUMABLE PACK (the items the surgeon will use during your operation).',
    bring: 'Booking slip / surgery confirmation from your surgeon (or folder number).',
    keep: 'Original receipt + payment proof. Bring both to the theatre on the day of surgery.',
  },
  {
    n: 2,
    title: 'Theatre Pharmacy (Routine & Surgical Drugs)',
    where: 'Theatre Pharmacy — inside the Main Theatre complex.',
    pay: 'Pay for any routine pre-operative drugs prescribed by your surgeon (antibiotics, analgesics, bowel prep, etc.).',
    bring: 'Your prescription form from the surgeon.',
    keep: 'Pharmacy receipt + dispensed drugs. Take the drugs to the ward; do NOT self-administer unless instructed.',
  },
  {
    n: 3,
    title: 'Pre-operative Anaesthetic Review',
    where: 'Anaesthetic Review Clinic / Ward review by the Anaesthetist.',
    pay: 'No payment at this stage — this is a CLINICAL review.',
    bring: 'All previous investigation results (blood, imaging, ECG, etc.), allergy history, list of any drugs you are currently on.',
    keep: 'The Anaesthetist will write your ANAESTHETIC PRESCRIPTION after this review. This is a separate prescription from step 2.',
  },
  {
    n: 4,
    title: 'Theatre Pharmacy AGAIN (Anaesthetic Drugs)',
    where: 'Theatre Pharmacy (same place as step 2).',
    pay: 'Pay for the ANAESTHETIC drugs prescribed by the Anaesthetist after the pre-op review.',
    bring: 'The anaesthetic prescription from step 3.',
    keep: 'Receipt + dispensed anaesthetic drugs. Hand them over to the nurse on the ward — they will be needed in theatre.',
  },
];

export default function PatientPaymentGuidePage() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePdf = async () => {
    setError(null);
    setGenerating(true);
    try {
      const [{ default: JsPDF }, { default: autoTableFn }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable = (d: jsPDF, o: UserOptions) => autoTableFn(d, o);
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Load watermark image as base64
      const watermark = await loadImageAsDataUrl('/unth-orm-logo.png');

      const drawWatermark = () => {
        if (!watermark) return;
        // jsPDF supports per-image opacity via GState. Use a faint alpha so
        // text remains highly readable.
        const size = 130; // mm — large central watermark
        const x = (pageW - size) / 2;
        const y = (pageH - size) / 2;
        // Try faint alpha; if GState unsupported, fall back to a small corner logo.
        try {
          const jsPdfAny = JsPDF as unknown as { GState: new (opts: { opacity: number }) => unknown };
          const docAny = doc as unknown as { setGState: (g: unknown) => void };
          const faint = new jsPdfAny.GState({ opacity: 0.08 });
          docAny.setGState(faint);
          doc.addImage(watermark, 'PNG', x, y, size, size, undefined, 'FAST');
          docAny.setGState(new jsPdfAny.GState({ opacity: 1 }));
        } catch {
          // Fallback: small logo at the bottom-right so it never obscures content.
          doc.addImage(watermark, 'PNG', pageW - 35, pageH - 35, 25, 25, undefined, 'FAST');
        }
      };

      // === FIRST PAGE ===
      drawWatermark();

      // Header band
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ENUGU', pageW / 2, 10, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Operative Resource Manager  -  Theatre Services', pageW / 2, 16, { align: 'center' });
      doc.setDrawColor(15, 76, 129);
      doc.setLineWidth(0.5);
      doc.line(14, 20, pageW - 14, 20);
      doc.setTextColor(0, 0, 0);

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Patient Payment & Preparation Guide', pageW / 2, 32, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        'For patients and relatives after a surgery has been booked',
        pageW / 2,
        38,
        { align: 'center' }
      );

      // Intro box
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, 44, pageW - 28, 22, 2, 2, 'D');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('Once your surgery has been booked, please complete these 4 stations IN ORDER.', pageW / 2, 52, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Bring this guide and ALL receipts with you on the day of surgery.', pageW / 2, 58, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      // Stations as table
      autoTable(doc, {
        startY: 72,
        head: [['#', 'Station', 'Where', 'What to pay / do', 'Keep']],
        body: STATIONS.map((s) => [
          String(s.n),
          s.title,
          s.where,
          s.pay,
          s.keep,
        ]),
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: 2.5,
          valign: 'top',
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          lineColor: [120, 120, 120],
          lineWidth: 0.1,
          fontStyle: 'bold',
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 38, fontStyle: 'bold' },
          2: { cellWidth: 50 },
          3: { cellWidth: 55 },
          4: { cellWidth: 32 },
        },
        didDrawPage: () => {
          // Re-draw watermark on every page generated by autoTable
          drawWatermark();
        },
        margin: { left: 14, right: 14 },
      });

      // Notes section
      const docWithTable = doc as unknown as { lastAutoTable?: { finalY?: number } };
      let y = (docWithTable.lastAutoTable?.finalY ?? 200) + 8;
      if (y > 250) {
        doc.addPage();
        drawWatermark();
        y = 30;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text('Important reminders', 14, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      const reminders = [
        '1. Always bring your ORIGINAL booking slip / folder number to every station.',
        '2. Keep ALL receipts together in one folder / envelope - they will be checked on the day of surgery.',
        '3. Do NOT eat or drink after the time stated by your anaesthetist (usually midnight before surgery).',
        '4. If a station is closed or you are unsure, ask the ward nurse or your surgeon BEFORE leaving the hospital.',
        '5. Anaesthetic drugs (step 4) MUST be brought to theatre with you - the operation cannot start without them.',
        '6. If you cannot afford any item, speak to your surgeon or the ward sister immediately - do not delay.',
      ];
      reminders.forEach((r, i) => {
        doc.text(r, 14, y + 7 + i * 5.5, { maxWidth: pageW - 28 });
      });
      y += 7 + reminders.length * 5.5 + 4;

      // Surgeon & contact block
      if (y > 245) {
        doc.addPage();
        drawWatermark();
        y = 30;
      }
      doc.setDrawColor(15, 76, 129);
      doc.setLineWidth(0.4);
      doc.line(14, y, pageW - 14, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('For verification by the issuing surgeon', 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text('Patient name: ____________________________________________', 14, y);
      doc.text('Folder no.: __________________', pageW - 75, y);
      y += 7;
      doc.text('Procedure: ______________________________________________', 14, y);
      doc.text('Date of surgery: ________________', pageW - 75, y);
      y += 7;
      doc.text('Surgeon (name & signature): ______________________________', 14, y);
      doc.text('Date issued: __________________', pageW - 75, y);
      y += 7;
      doc.text('Surgical unit: ____________________________________________', 14, y);
      doc.text('Phone: _______________________', pageW - 75, y);

      // Footer on every page
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `UNTH ORM  -  Patient Payment & Preparation Guide  -  Page ${i} of ${totalPages}`,
          pageW / 2,
          pageH - 8,
          { align: 'center' }
        );
        doc.setTextColor(0);
      }

      doc.save(`UNTH-Patient-Payment-Guide-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('[patient-payment-guide] PDF generation failed', err);
      setError((err as Error)?.message ?? 'Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
            Patient Payment &amp; Preparation Guide
          </h1>
          <p className="text-gray-600 mt-1 max-w-3xl">
            A clear, step-by-step guide for surgeons to give patients and relatives once a
            surgery has been booked. Print or download the PDF and hand it over with the
            booking slip - it tells them exactly where to go, what to pay, and what to bring.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={generatePdf}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg shadow-sm transition"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PDF (with UNTH watermark)
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-sm transition"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-amber-900">
        <p className="font-semibold">
          Once a surgery is booked, the patient and relatives must complete these
          <strong> 4 stations in order</strong>.
        </p>
        <p className="text-sm mt-1">
          Bring this guide and <strong>all receipts</strong> on the day of surgery.
        </p>
      </div>

      <div className="grid gap-4">
        {STATIONS.map((s) => (
          <article
            key={s.n}
            className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
          >
            <header className="flex items-center gap-3 bg-blue-700 text-white px-4 py-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-blue-700 font-bold">
                {s.n}
              </span>
              <h2 className="text-lg font-bold">{s.title}</h2>
            </header>
            <div className="p-4 grid md:grid-cols-2 gap-4 text-sm">
              <Row icon={<MapPin className="w-4 h-4 text-blue-700" />} label="Where" value={s.where} />
              <Row icon={<Receipt className="w-4 h-4 text-emerald-700" />} label="Pay / do" value={s.pay} />
              <Row icon={<ListChecks className="w-4 h-4 text-violet-700" />} label="Bring" value={s.bring} />
              <Row icon={<Pill className="w-4 h-4 text-amber-700" />} label="Keep" value={s.keep} />
            </div>
          </article>
        ))}
      </div>

      <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
          <Stethoscope className="w-5 h-5" />
          Important reminders for patients
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-800 list-disc pl-5">
          <li>Always bring your <strong>original booking slip / folder number</strong> to every station.</li>
          <li>Keep <strong>all receipts</strong> together - they will be checked on the day of surgery.</li>
          <li>Do <strong>not eat or drink</strong> after the time stated by your anaesthetist (usually midnight before surgery).</li>
          <li>If a station is closed or you are unsure, ask the ward nurse or your surgeon <strong>before leaving the hospital</strong>.</li>
          <li>Anaesthetic drugs (Station 4) <strong>must be brought to theatre</strong> with you - the operation cannot start without them.</li>
          <li>If you cannot afford any item, <strong>speak to your surgeon or the ward sister immediately</strong> - do not delay.</li>
        </ul>
      </section>

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-900">
        <p className="font-semibold flex items-center gap-2">
          <Phone className="w-4 h-4" />
          Need help?
        </p>
        <p className="mt-1">
          Speak to your <strong>surgeon</strong>, the <strong>ward sister</strong>, or the
          <strong> Theatre Coordinator&apos;s desk</strong> at the Main Theatre entrance.
        </p>
      </section>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
        <div className="text-gray-900 whitespace-pre-line">{value}</div>
      </div>
    </div>
  );
}

/**
 * Fetch a public image and convert to a base64 data URL so jsPDF can embed it.
 * Returns null on failure so the PDF can still render without the watermark.
 */
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
