'use client';

/**
 * Chief Residents Letter — Surgical Catalog
 * ---------------------------------------------------------------
 * Pre-formatted letter that can be:
 *   • Previewed in the browser
 *   • Downloaded as a polished A4 PDF (jsPDF)
 *   • Shared via WhatsApp (wa.me) with link + summary
 *   • Copied to the clipboard
 *   • Native-shared on mobile (navigator.share, attaches the PDF when supported)
 */

import { useState } from 'react';
import { Download, Share2, MessageCircle, Copy, Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const CONTRIBUTE_URL = 'https://unth-theatre-mai.vercel.app/dashboard/catalog-contribute';
const TODAY = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

const BENEFITS: Array<[string, string]> = [
  ['Faster, error-free booking', 'Pre-populated tick-lists replace freehand typing; surgeons book a case in minutes.'],
  ['No more last-minute scrambles', 'The Pack Provider sees your list the night before and pre-packs everything; theatre starts on time.'],
  ['Pharmacy ready before the patient arrives', 'Antibiotics, IV fluids and dressings are dispensed against your exact list.'],
  ['Automatic narcotic accountability', 'Full audit trail; NDLEA-compliant register generated on demand.'],
  ['Accurate billing & stock control', 'Items consumed are deducted from sub-store inventory in real time; no silent stock-outs.'],
  ['Evidence for budgeting & procurement', 'Management sees exactly what each sub-specialty consumes — strengthens your case at procurement meetings.'],
  ['Standardised teaching tool', 'Junior residents learn what a complete pack for each procedure looks like.'],
  ['Continuous improvement', 'Living document; add or refine entries any time and the booking form updates instantly across the hospital.'],
  ['Audit & research-ready data', 'Exportable to PDF/Excel for M&M meetings, dissertations and QI projects.'],
  ['Patient safety', 'Reduces wrong-item, wrong-dose and missed-prophylaxis events that the WHO Surgical Safety Checklist is designed to prevent.'],
];

const SUBSPECIALTIES =
  'General • Paediatric • Cardiothoracic • Neurosurgery • Orthopaedic & Trauma • ' +
  'Plastic & Reconstructive • Urology • ENT • Maxillofacial • Ophthalmic • Obstetric & Gynaecologic Surgery';

const WHATSAPP_TEXT = [
  '🏥 *UNTH Theatre — Surgical Catalog Contribution*',
  '',
  'Dear Chief Resident,',
  '',
  'You are invited to populate the UNTH Theatre Surgical Catalog with the drugs, IV fluids, dressings and consumables your sub-specialty routinely uses. Submissions update the booking form in real time.',
  '',
  '👉 Contribute here:',
  CONTRIBUTE_URL,
  '',
  'Benefits: faster booking, pre-packed consumables, ready pharmacy, narcotic audit trail, accurate billing, stronger procurement case, safer patients.',
  '',
  'Kindly circulate within your unit and complete on or before the deadline.',
  '',
  '— Dr. E. C. Nnadi',
  'For the Theatre Management Team',
  'UNTH Theatre Complex',
  'Phone: 08033328385',
].join('\n');

async function buildPdf(): Promise<{ doc: any; blob: Blob; filename: string }> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  let y = M;

  // Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA', W / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(11);
  doc.text('THEATRE COMPLEX', W / 2, y, { align: 'center' });
  y += 18;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 18;

  // Ref + date
  doc.setFontSize(10);
  doc.text('Ref: UNTH/THTR/CAT/2026/01', M, y);
  doc.text(`Date: ${TODAY}`, W - M, y, { align: 'right' });
  y += 22;

  // Addressee
  doc.setFont('helvetica', 'bold');
  doc.text('TO:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text('All Chief Residents, Sub-Specialties of Surgery', M + 30, y);
  y += 12;
  const subLines = doc.splitTextToSize(SUBSPECIALTIES, W - M * 2 - 30);
  doc.setFontSize(9);
  doc.text(subLines, M + 30, y);
  y += subLines.length * 11 + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('THROUGH:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Heads of Sub-Specialty Units', M + 60, y);
  y += 18;

  // Subject
  doc.setFont('helvetica', 'bold');
  const subject = 'SUBJECT: INVITATION TO POPULATE THE UNTH THEATRE SURGICAL CATALOG — DRUGS, IV FLUIDS, DRESSINGS & CONSUMABLES';
  const subjLines = doc.splitTextToSize(subject, W - M * 2);
  doc.text(subjLines, M, y);
  y += subjLines.length * 12 + 10;

  // Body
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const para = (text: string) => {
    const lines = doc.splitTextToSize(text, W - M * 2);
    if (y + lines.length * 13 > H - M - 60) { doc.addPage(); y = M; }
    doc.text(lines, M, y);
    y += lines.length * 13 + 8;
  };

  para('Dear Chief Residents,');
  para(
    'As part of the ongoing digital transformation of the UNTH theatre suite, the Theatre Management Information System now hosts a central, real-time Surgical Catalog that drives the booking form every surgeon completes when scheduling a case. Items selected at booking are automatically routed to the Consumable Pack Provider (for night-before pre-packing) and to the Pharmacy (for drugs, IV fluids and active wound-dressing agents), and are tracked through to intra-op accountability and post-op prescription.'
  );
  para(
    'For the system to serve your sub-specialty accurately, the catalog must reflect what you actually use — not a generic list. To that end, we have created a single shareable contribution form open to every member of your unit:'
  );

  // URL pill
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.textWithLink(CONTRIBUTE_URL, M, y, { url: CONTRIBUTE_URL });
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  y += 18;

  para('You are kindly requested to:');
  ['Circulate the link within your unit (consultants, senior registrars, registrars, scrub nurses).',
   'Enter every drug, IV fluid, active wound-dressing agent and surgical consumable routinely required for the procedures performed in your sub-specialty, including default dosages, routes, sizes and typical quantities per case.',
   'Complete this exercise on or before the date communicated by the Theatre Manager.'
  ].forEach((s, i) => para(`${i + 1}. ${s}`));

  // Benefits table
  if (y + 40 > H - M - 60) { doc.addPage(); y = M; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Why this matters — direct benefits to you and your unit:', M, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  BENEFITS.forEach(([title, body], i) => {
    const text = `${i + 1}. ${title} — ${body}`;
    const lines = doc.splitTextToSize(text, W - M * 2);
    if (y + lines.length * 12 > H - M - 60) { doc.addPage(); y = M; }
    doc.text(lines, M, y);
    y += lines.length * 12 + 4;
  });

  if (y + 80 > H - M - 60) { doc.addPage(); y = M; }
  y += 6;
  para(
    'The form requires no special training — it is a simple web page accessible from any phone, tablet or desktop on the hospital network or off-site. Submissions are reviewed by the Theatre Manager and merged into the live catalog within hours.'
  );
  para(
    'Your prompt cooperation will significantly improve the safety, efficiency and cost-effectiveness of surgical care at UNTH. Should you require a brief demonstration for your unit, please contact Dr. E. C. Nnadi (Theatre Management Team) on 08033328385.'
  );
  para('Thank you for your dedication and leadership.');

  // Sign-off
  if (y + 80 > H - M - 60) { doc.addPage(); y = M; }
  para('Yours faithfully,');
  y += 28;
  doc.setDrawColor(0); doc.line(M, y, M + 180, y); y += 12;
  doc.setFont('helvetica', 'bold');
  doc.text('DR. E. C. NNADI', M, y); y += 12;
  doc.setFont('helvetica', 'normal');
  doc.text('For the Theatre Management Team', M, y); y += 12;
  doc.text('UNTH Theatre Complex', M, y); y += 12;
  doc.text('Phone: 08033328385', M, y); y += 18;

  // Cc
  if (y + 80 > H - M - 60) { doc.addPage(); y = M; }
  doc.setFont('helvetica', 'bold');
  doc.text('Cc:', M, y); y += 12;
  doc.setFont('helvetica', 'normal');
  ['Chief Medical Director',
   'Chairman, Medical Advisory Committee (CMAC)',
   'Head, Department of Surgery',
   'Heads of all Surgical Sub-Specialties',
   'Director of Pharmaceutical Services',
   'Chief Nursing Officer (Theatre)',
   'Head, Medical Records / IT'
  ].forEach(s => { doc.text(`• ${s}`, M + 14, y); y += 12; });

  // Footer
  const pageCount = (doc as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount}  •  UNTH Theatre Complex`, W / 2, H - 24, { align: 'center' });
  }

  const blob = doc.output('blob');
  const filename = `UNTH-Theatre-Catalog-Letter-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { doc, blob, filename };
}

export default function ChiefResidentsLetterPage() {
  const [busy, setBusy] = useState(false);

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const { doc, filename } = await buildPdf();
      doc.save(filename);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error('PDF failed: ' + (e?.message ?? e));
    } finally { setBusy(false); }
  };

  const shareWhatsApp = () => {
    // wa.me opens the WhatsApp picker (mobile or web). Pre-fills text + link.
    const url = `https://wa.me/?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await buildPdf();
      const file = new File([blob], filename, { type: 'application/pdf' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          title: 'UNTH Theatre Surgical Catalog — Chief Residents Letter',
          text: WHATSAPP_TEXT,
          files: [file],
        });
      } else if (nav.share) {
        await nav.share({ title: 'UNTH Theatre Catalog Letter', text: WHATSAPP_TEXT, url: CONTRIBUTE_URL });
      } else {
        toast('Native share not supported — using WhatsApp web instead.');
        shareWhatsApp();
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error('Share failed: ' + (e?.message ?? e));
    } finally { setBusy(false); }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(WHATSAPP_TEXT);
      toast.success('Message + link copied');
    } catch {
      window.prompt('Copy text:', WHATSAPP_TEXT);
    }
  };

  const printPage = () => window.print();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2 print:hidden">
        <Link href="/dashboard/admin/surgical-catalog" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Surgical Catalog
        </Link>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadPdf} disabled={busy} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center text-sm disabled:opacity-50">
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </button>
          <button onClick={shareWhatsApp} disabled={busy} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 inline-flex items-center text-sm disabled:opacity-50">
            <MessageCircle className="w-4 h-4 mr-2" /> Share via WhatsApp
          </button>
          <button onClick={nativeShare} disabled={busy} className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm disabled:opacity-50" title="Attach the PDF on supported devices">
            <Share2 className="w-4 h-4 mr-2" /> Share PDF…
          </button>
          <button onClick={copyText} className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm">
            <Copy className="w-4 h-4 mr-2" /> Copy text
          </button>
          <button onClick={printPage} className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm">
            <Printer className="w-4 h-4 mr-2" /> Print
          </button>
        </div>
      </div>

      {/* Letter preview */}
      <article className="bg-white shadow-sm border rounded-lg p-10 leading-relaxed text-gray-900 print:shadow-none print:border-0 print:p-0">
        <header className="text-center border-b pb-4 mb-6">
          <h1 className="text-lg font-bold tracking-wide">UNIVERSITY OF NIGERIA TEACHING HOSPITAL (UNTH), ITUKU-OZALLA</h1>
          <p className="text-sm font-semibold mt-1">THEATRE COMPLEX</p>
        </header>

        <div className="flex justify-between text-sm mb-6">
          <span><strong>Ref:</strong> UNTH/THTR/CAT/2026/01</span>
          <span><strong>Date:</strong> {TODAY}</span>
        </div>

        <p className="text-sm mb-2"><strong>TO:</strong> All Chief Residents, Sub-Specialties of Surgery</p>
        <p className="text-xs text-gray-600 italic ml-8 mb-3">{SUBSPECIALTIES}</p>
        <p className="text-sm mb-4"><strong>THROUGH:</strong> Heads of Sub-Specialty Units</p>

        <h2 className="font-bold uppercase text-sm border-y py-2 mb-4">
          Subject: Invitation to populate the UNTH Theatre Surgical Catalog — drugs, IV fluids, dressings &amp; consumables
        </h2>

        <p className="mb-3">Dear Chief Residents,</p>
        <p className="mb-3">
          As part of the ongoing digital transformation of the UNTH theatre suite, the Theatre Management Information
          System now hosts a <strong>central, real-time Surgical Catalog</strong> that drives the booking form every surgeon
          completes when scheduling a case. Items selected at booking are automatically routed to the
          <strong> Consumable Pack Provider</strong> (for night-before pre-packing) and to the
          <strong> Pharmacy</strong> (for drugs, IV fluids and active wound-dressing agents), and are tracked through to
          intra-op accountability and post-op prescription.
        </p>
        <p className="mb-3">
          For the system to serve <em>your</em> sub-specialty accurately, the catalog must reflect what you
          <em> actually</em> use — not a generic list. To that end, we have created a single shareable contribution form
          open to every member of your unit:
        </p>

        <p className="mb-4">
          <a href={CONTRIBUTE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-all font-medium">
            👉 {CONTRIBUTE_URL}
          </a>
        </p>

        <p className="mb-2">You are kindly requested to:</p>
        <ol className="list-decimal ml-6 mb-4 space-y-1">
          <li>Circulate the link within your unit (consultants, senior registrars, registrars, scrub nurses).</li>
          <li>Enter every drug, IV fluid, active wound-dressing agent and surgical consumable routinely required for the procedures performed in your sub-specialty — including default dosages, routes, sizes and typical quantities per case.</li>
          <li>Complete this exercise on or before the date communicated by the Theatre Manager.</li>
        </ol>

        <h3 className="font-bold mt-6 mb-2">Why this matters — direct benefits to you and your unit:</h3>
        <ol className="list-decimal ml-6 mb-4 space-y-1">
          {BENEFITS.map(([t, b]) => (
            <li key={t}><strong>{t}</strong> — {b}</li>
          ))}
        </ol>

        <p className="mb-3">
          The form requires no special training — it is a simple web page accessible from any phone, tablet or desktop
          on the hospital network or off-site. Submissions are reviewed by the Theatre Manager and merged into the live
          catalog within hours.
        </p>
        <p className="mb-3">
          Your prompt cooperation will significantly improve the safety, efficiency and cost-effectiveness of surgical
          care at UNTH. Should you require a brief demonstration for your unit, please contact <strong>Dr. E. C. Nnadi</strong> (Theatre Management Team) on <a href="tel:+2348033328385" className="text-blue-700 hover:underline">08033328385</a>.
        </p>
        <p className="mb-6">Thank you for your dedication and leadership.</p>

        <p className="mb-12">Yours faithfully,</p>
        <div className="border-t border-gray-400 w-64 mb-1" />
        <p className="font-semibold">DR. E. C. NNADI</p>
        <p className="text-sm text-gray-700">For the Theatre Management Team</p>
        <p className="text-sm text-gray-600">UNTH Theatre Complex</p>
        <p className="text-sm text-gray-600 mb-6">Phone: <a href="tel:+2348033328385" className="text-blue-700 hover:underline">08033328385</a></p>

        <div className="text-xs text-gray-700 mt-8">
          <p className="font-semibold mb-1">Cc:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>Chief Medical Director</li>
            <li>Chairman, Medical Advisory Committee (CMAC)</li>
            <li>Head, Department of Surgery</li>
            <li>Heads of all Surgical Sub-Specialties</li>
            <li>Director of Pharmaceutical Services</li>
            <li>Chief Nursing Officer (Theatre)</li>
            <li>Head, Medical Records / IT</li>
          </ul>
        </div>
      </article>
    </div>
  );
}
