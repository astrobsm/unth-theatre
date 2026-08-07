'use client';

// ============================================================
// The duty flyer — one page, one staff group, pinned on a wall
// ------------------------------------------------------------
// Constraints that shaped it, in order:
//
//   ONE PAGE. A second page is a page nobody reads. If a group's duties do not
//   fit, the type shrinks before the page count grows, and the generator says
//   so rather than silently spilling over.
//
//   READABLE AT ARM'S LENGTH. This is pinned above a scrub sink and glanced at,
//   not studied. Task lines are large; the reasoning is smaller but present,
//   because people follow reasons and forget instructions.
//
//   EVERY DUTY CARRIES ITS REASON. A flyer of imperatives gets ignored by
//   exactly the staff who most need it.
// ============================================================

import type { DutySheet } from '@/lib/workflowDuties';
import { installPdfTextGuard } from '@/lib/pdfSafeText';

const LOGO_URL = '/unth-orm-logo.png';

/** Load an image as a data URL. Returns null rather than failing the flyer. */
async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateDutyFlyer(sheet: DutySheet): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  installPdfTextGuard(pdf);

  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 40;
  const logo = await loadImage(LOGO_URL);

  // ---- Watermark ---------------------------------------------------------
  // Drawn FIRST so everything else sits on top of it, and kept very pale: a
  // watermark that competes with the text defeats the flyer.
  if (logo) {
    const size = 340;
    const gs = (pdf as unknown as { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void });
    try {
      gs.setGState(new gs.GState({ opacity: 0.06 }));
      pdf.addImage(logo, 'PNG', (W - size) / 2, (H - size) / 2, size, size);
      gs.setGState(new gs.GState({ opacity: 1 }));
    } catch {
      // Older jsPDF without GState: skip the watermark rather than printing an
      // opaque logo across the middle of the page.
    }
  }

  // ---- Header ------------------------------------------------------------
  pdf.setFillColor(4, 120, 87); // theatre green
  pdf.rect(0, 0, W, 92, 'F');

  if (logo) {
    try { pdf.addImage(logo, 'PNG', M, 18, 56, 56); } catch { /* header still works */ }
  }

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.text(sheet.title, logo ? M + 70 : M, 42);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.text('Your daily workflow duties — UNTH Operative Resource Manager', logo ? M + 70 : M, 60);
  pdf.setFontSize(9);
  pdf.text('University of Nigeria Teaching Hospital, Ituku-Ozalla', logo ? M + 70 : M, 76);

  let y = 118;

  // ---- Headline ----------------------------------------------------------
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.5);
  const headline = pdf.splitTextToSize(sheet.headline, W - M * 2);
  pdf.text(headline, M, y);
  y += headline.length * 15 + 10;

  pdf.setDrawColor(4, 120, 87);
  pdf.setLineWidth(1.5);
  pdf.line(M, y, W - M, y);
  y += 20;

  // ---- Duties ------------------------------------------------------------
  // The page has a fixed budget. Rather than spill onto a second sheet, the
  // type steps down once and, failing that, the reasoning is trimmed — the
  // TASK lines always survive intact.
  const budget = H - 120 - y;
  const perDuty = budget / sheet.duties.length;
  const tight = perDuty < 62;

  const taskSize = tight ? 10.5 : 11.5;
  const metaSize = tight ? 8 : 8.8;
  const gap = tight ? 8 : 12;

  sheet.duties.forEach((d, i) => {
    // A filled number disc, so the eye can count what it has to do.
    pdf.setFillColor(d.critical ? 190 : 209, d.critical ? 18 : 213, d.critical ? 60 : 219);
    pdf.circle(M + 7, y - 3, 8.5, 'F');
    pdf.setTextColor(d.critical ? 255 : 55, d.critical ? 255 : 65, d.critical ? 255 : 81);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(String(i + 1), M + 7, y, { align: 'center' });

    // Task
    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(taskSize);
    const task = pdf.splitTextToSize(d.task, W - M * 2 - 30);
    pdf.text(task, M + 24, y);
    y += task.length * (taskSize + 2.5);

    // When / where
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(metaSize);
    pdf.setTextColor(4, 120, 87);
    const meta = d.where ? `${d.when}  ·  ${d.where}` : d.when;
    pdf.text(meta, M + 24, y);
    y += metaSize + 3;

    // Why — the part that changes behaviour
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(75, 85, 99);
    const why = pdf.splitTextToSize(d.why, W - M * 2 - 30);
    // Trim the reasoning only as a last resort, and never the task.
    const maxWhyLines = tight ? 2 : 3;
    pdf.text(why.slice(0, maxWhyLines), M + 24, y);
    y += Math.min(why.length, maxWhyLines) * (metaSize + 2) + gap;
  });

  // ---- Footer ------------------------------------------------------------
  const footY = H - 78;
  pdf.setFillColor(240, 253, 244);
  pdf.setDrawColor(4, 120, 87);
  pdf.setLineWidth(1);
  pdf.roundedRect(M, footY - 26, W - M * 2, 40, 4, 4, 'FD');
  pdf.setTextColor(6, 78, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  const remember = pdf.splitTextToSize(sheet.remember, W - M * 2 - 24);
  pdf.text(remember.slice(0, 2), M + 12, footY - 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    `Red numbers are the duties without which a measurement is impossible.  ·  Printed ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    M,
    H - 26
  );
  pdf.text('UNTH ORM  ·  managed by NEXORA Innovations', W - M, H - 26, { align: 'right' });

  return pdf.output('blob');
}

/** A predictable file name — these get emailed and printed in batches. */
export const flyerFileName = (sheet: DutySheet): string =>
  `ORM_Duties_${sheet.title.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
