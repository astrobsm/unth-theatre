// ============================================================
// The information sheet as a PDF
// ------------------------------------------------------------
// Built on the institutional document layer, so it carries the same
// letterhead, type scale and footer as every other document this hospital
// hands to a patient. A counselling sheet that looked like a printout from a
// different system would be trusted less, and should be.
//
// LOADED ON DEMAND. jsPDF is large and most page loads never make a PDF; the
// import sits inside the function, as it does in the estimate page.
//
// TWO BOXES ARE DRAWN DIFFERENTLY from the rest: eating and drinking, and the
// warning signs. They are the two sections that cause harm when skimmed — one
// decides whether the operation can go ahead safely tomorrow, the other
// whether somebody comes back in time. Everything else is prose.
// ============================================================

import {
  CONTENT_WIDTH, INK, PAGE, drawFooters, drawHeader, drawSectionHeading,
  ensureSpace, newDocument,
} from '@/lib/institutionalPdf';
import type { Leaflet } from './leaflet';

/** Body text, wrapped, returning the new y. */
function paragraph(doc: any, text: string, y: number, indent = 0): number {
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK.body);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - indent);
  for (const line of lines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, PAGE.margin + indent, y);
    y += 5;
  }
  return y + 1.5;
}

function bullet(doc: any, text: string, y: number): number {
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK.body);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 7);
  let first = true;
  for (const line of lines) {
    y = ensureSpace(doc, y, 6);
    if (first) {
      doc.text('•', PAGE.margin + 1.5, y);
      first = false;
    }
    doc.text(line, PAGE.margin + 7, y);
    y += 5;
  }
  return y + 1;
}

/**
 * The leaflet as a jsPDF document.
 *
 * Returns the document rather than saving it, so the caller decides between
 * downloading, printing and attaching.
 */
export async function buildLeafletPdf(leaflet: Leaflet) {
  const doc = await newDocument();

  let y = drawHeader(doc, {
    department: 'Theatre Complex',
    documentTitle: leaflet.title.toUpperCase(),
    reference: leaflet.patientIdentifier ?? undefined,
    version: `Sheet ${leaflet.version}`,
  });

  if (leaflet.patientName) {
    doc.setFont('times', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...INK.body);
    doc.text(`For ${leaflet.patientName}`, PAGE.margin, y);
    y += 7;
  }

  // The facts of the case, as a simple two-column list rather than a table:
  // there are rarely more than five and a ruled table reads as a form.
  doc.setFontSize(10.5);
  for (const f of leaflet.facts) {
    y = ensureSpace(doc, y, 7);
    doc.setFont('times', 'bold');
    doc.setTextColor(...INK.muted);
    doc.text(`${f.label}:`, PAGE.margin, y);
    doc.setFont('times', 'normal');
    doc.setTextColor(...INK.body);
    const value = doc.splitTextToSize(f.value, CONTENT_WIDTH - 32);
    doc.text(value[0] ?? '', PAGE.margin + 30, y);
    y += 5.5;
    for (const extra of value.slice(1)) {
      y = ensureSpace(doc, y, 6);
      doc.text(extra, PAGE.margin + 30, y);
      y += 5;
    }
  }

  y += 2;
  // What this sheet is, and is not. Set apart, because a patient who believes
  // the sheet IS the consent conversation has been given less than they are owed.
  y = ensureSpace(doc, y, 22);
  doc.setDrawColor(...INK.rule);
  doc.setLineWidth(0.3);
  const purposeStart = y;
  y = paragraph(doc, leaflet.purpose, y + 5, 4);
  doc.rect(PAGE.margin, purposeStart, CONTENT_WIDTH, y - purposeStart - 1);
  y += 5;

  for (const section of leaflet.sections) {
    y = ensureSpace(doc, y, 24);

    if (section.emphasis) {
      // Boxed, and started on a fresh page if it would otherwise be split
      // across one — these are the two sections that must be read whole.
      y = ensureSpace(doc, y, 60);
      const boxTop = y;
      y = drawSectionHeading(doc, section.heading, y + 5);
      for (const p of section.body) y = paragraph(doc, p, y, 4);
      for (const p of section.points ?? []) y = bullet(doc, p, y);
      doc.setDrawColor(...INK.warn);
      doc.setLineWidth(0.6);
      doc.rect(PAGE.margin - 2, boxTop, CONTENT_WIDTH + 4, y - boxTop + 1);
      doc.setLineWidth(0.3);
      y += 7;
      continue;
    }

    y = drawSectionHeading(doc, section.heading, y);
    for (const p of section.body) y = paragraph(doc, p, y);
    for (const p of section.points ?? []) y = bullet(doc, p, y);
    y += 3;
  }

  y = ensureSpace(doc, y, 30);
  y = drawSectionHeading(doc, 'Questions to bring with you', y);
  y = paragraph(doc, leaflet.questionsPrompt, y);
  // Ruled lines to write on. A sheet that invites questions and leaves no
  // room for them is not really inviting them.
  doc.setDrawColor(...INK.rule);
  for (let i = 0; i < 4; i += 1) {
    y = ensureSpace(doc, y, 9);
    doc.line(PAGE.margin, y + 2, PAGE.width - PAGE.margin, y + 2);
    y += 9;
  }

  y = ensureSpace(doc, y, 18);
  doc.setFont('times', 'bold');
  doc.setTextColor(...INK.warn);
  const emergency = doc.splitTextToSize(leaflet.emergencyLine, CONTENT_WIDTH);
  for (const line of emergency) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, PAGE.margin, y);
    y += 5;
  }

  y += 3;
  y = paragraph(doc, leaflet.privacyNote, y);

  drawFooters(doc, { reference: `Information sheet ${leaflet.version}` });

  return doc;
}

/** Download it, named so that a folder full of them is navigable. */
export async function downloadLeafletPdf(leaflet: Leaflet): Promise<void> {
  const doc = await buildLeafletPdf(leaflet);
  const who = (leaflet.patientIdentifier || leaflet.patientName || 'patient')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  doc.save(`operation-information-${who || 'patient'}.pdf`);
}
