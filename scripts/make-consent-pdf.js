/**
 * The UNTH theatre consent form, on paper.
 *
 * Generated FROM the digital form (src/components/ConsentFormFields.tsx) so the
 * two say the same thing. The declaration and acknowledgement paragraphs below
 * are copied verbatim from it: a paper consent whose wording has drifted from
 * the electronic one is worse than having only one of them, because the record
 * would then depend on which version the patient happened to sign.
 *
 * Kept at wards and clinics, completed by hand, photographed, and uploaded to
 * the booking. Printed in black on white and photocopied, so: no colour, no
 * grey fills, and ruled lines rather than boxes — a photocopied box collapses
 * into a smudge, a rule survives.
 */

const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;              // margin
const W = PAGE_W - M * 2;  // usable width
let y = M;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const setFont = (size, style = 'normal') => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
};

/** A ruled writing line. */
function rule(x1, x2, yy) {
  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.line(x1, yy, x2, yy);
}

/** A labelled field on one ruled line: "Label ______________________" */
function field(label, x, width, opts = {}) {
  const labelW = opts.labelW ?? doc.getTextWidth(label) + 2;
  setFont(9.5);
  doc.setTextColor(0);
  doc.text(label, x, y);
  rule(x + labelW, x + width, y + 0.8);
  return x + width;
}

/** Several blank ruled lines for free text. */
function ruledLines(count, gap = 8, x = M, width = W) {
  for (let i = 0; i < count; i++) {
    y += gap;
    rule(x, x + width, y);
  }
}

/** Numbered ruled lines, for the two enumerated lists. */
function numberedLines(count, gap = 8.5) {
  setFont(9.5);
  for (let i = 1; i <= count; i++) {
    y += gap;
    doc.setTextColor(80);
    doc.text(`${i}.`, M, y);
    rule(M + 6, M + W, y);
  }
  doc.setTextColor(0);
}

/** Wrapped paragraph. Returns the height used. */
function para(text, size = 8.6, style = 'normal', width = W, x = M) {
  setFont(size, style);
  doc.setTextColor(40);
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  const h = lines.length * (size * 0.42);
  y += h;
  doc.setTextColor(0);
  return h;
}

/** A signature block: ruled space to sign, name line, date line. */
function signatureBlock(title, x, width) {
  const top = y;
  setFont(9, 'bold');
  doc.setTextColor(0);
  doc.text(title, x, top);

  // room to actually sign
  rule(x, x + width, top + 14);
  setFont(7.5);
  doc.setTextColor(110);
  doc.text('Signature / thumbprint', x, top + 17.5);

  setFont(9.5);
  doc.setTextColor(0);
  doc.text('Name', x, top + 25);
  rule(x + 11, x + width, top + 25.8);

  doc.text('Date', x, top + 32.5);
  rule(x + 10, x + width, top + 33.3);

  return top + 33.3;
}

function sectionHeading(text) {
  y += 4;
  setFont(10.5, 'bold');
  doc.setTextColor(0);
  doc.text(text, M, y);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(M, y + 1.6, M + W, y + 1.6);
  y += 6;
}

// ---------------------------------------------------------------------------
// PAGE 1
// ---------------------------------------------------------------------------
setFont(13.5, 'bold');
doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL', PAGE_W / 2, y, { align: 'center' });
y += 5;
setFont(8.5);
doc.setTextColor(90);
doc.text('P.M.B. 01129, Enugu, Nigeria.', PAGE_W / 2, y, { align: 'center' });
y += 6;
setFont(10.5, 'bold');
doc.setTextColor(0);
doc.text(
  'CONSENT FORM FOR PROCEDURE / SURGERY TREATMENT,',
  PAGE_W / 2, y, { align: 'center' },
);
y += 4.6;
doc.text('ANAESTHESIA, HIGH RISK CONSENT', PAGE_W / 2, y, { align: 'center' });
y += 5;
setFont(8.2, 'italic');
doc.setTextColor(70);
doc.text(
  '(The contents of this form have been explained to me in my spoken language)',
  PAGE_W / 2, y, { align: 'center' },
);
doc.setTextColor(0);
y += 3;
doc.setDrawColor(0);
doc.setLineWidth(0.5);
doc.line(M, y, M + W, y);
y += 8;

// ---- patient identification ------------------------------------------------
// Folder number and ward are NOT on the electronic form, which knows the
// patient from the booking it is attached to. A sheet of paper knows nothing,
// and a photographed consent that cannot be matched to a patient is not a
// consent — so they are asked for here.
field('Name of Patient', M, W * 0.62);
field('Folder No.', M + W * 0.66, W * 0.34);
y += 9;
field('Ward / Clinic', M, W * 0.40);
field('Age', M + W * 0.44, W * 0.18);
field('Sex', M + W * 0.66, W * 0.14);
field('Date', M + W * 0.84, W * 0.16);
y += 11;

// ---- procedure -------------------------------------------------------------
setFont(9.5, 'bold');
doc.text('Operation(s) / Procedure(s) / Treatment(s)', M, y);
setFont(8.2, 'italic');
doc.setTextColor(90);
doc.text('  — write in full, no abbreviations', M + 62, y);
doc.setTextColor(0);
ruledLines(3);
y += 9;
field('Authorising Doctor (Dr.)', M, W);
y += 10;

// ---- the declaration, verbatim from the digital form -----------------------
doc.setDrawColor(0);
doc.setLineWidth(0.3);
const declTop = y - 4;
y += 1;
para(
  'I have been advised of the benefits, risks and alternatives of this procedure and understand no ' +
  'guarantees can be made. This consent includes the administration of blood / blood products and the ' +
  'rendering of such other care as deemed necessary. I consent to medical photography for ' +
  'education/publication with my identity protected, as approved by UNTH.',
  8.6, 'normal', W - 6, M + 3,
);
doc.rect(M, declTop, W, y - declTop + 3);
y += 9;

// ---- high risk -------------------------------------------------------------
sectionHeading('HIGH-RISK REASONS  (as explained by the doctors)');
numberedLines(6);
y += 5;

// ---- complications ---------------------------------------------------------
sectionHeading('POSSIBLE COMPLICATIONS OF SURGERY / ANAESTHESIA');
numberedLines(7);

// ---- footer ----------------------------------------------------------------
setFont(7.5);
doc.setTextColor(120);
doc.text('UNTH Theatre ORM — consent form', M, PAGE_H - 8);
doc.text('Page 1 of 2', PAGE_W - M, PAGE_H - 8, { align: 'right' });
doc.setTextColor(0);

// ---------------------------------------------------------------------------
// PAGE 2 — the two authorisations
// ---------------------------------------------------------------------------
doc.addPage();
y = M;

setFont(11, 'bold');
doc.text('AUTHORISATION', PAGE_W / 2, y, { align: 'center' });
y += 5;
setFont(8.6, 'italic');
doc.setTextColor(60);
doc.text(
  'Complete SECTION A if the patient can consent. Otherwise complete SECTION B.',
  PAGE_W / 2, y, { align: 'center' },
);
doc.setTextColor(0);
y += 4;
doc.setDrawColor(0);
doc.setLineWidth(0.5);
doc.line(M, y, M + W, y);
y += 8;

// ---- Section A -------------------------------------------------------------
sectionHeading('SECTION A — AUTHORISATION OF PATIENT');
para(
  'I acknowledge that I have discussed and understood this procedure and hereby consent to it.',
  9, 'normal',
);
y += 7;

const colW = (W - 8) / 2;
let blockTop = y;
signatureBlock('Patient', M, colW);
y = blockTop;
signatureBlock('Witness', M + colW + 8, colW);
y = blockTop + 40;

blockTop = y;
signatureBlock('Doctor', M, colW);
y = blockTop + 42;

// ---- Section B -------------------------------------------------------------
sectionHeading('SECTION B — REPRESENTATIVE / SURROGATE AUTHORISATION');
para(
  'To be completed only where the patient is unable to consent.',
  8.6, 'italic',
);
y += 8;
field('Reason the patient is unable to consent', M, W);
y += 10;

blockTop = y;
signatureBlock('Representative / Surrogate', M, colW);
y = blockTop;
signatureBlock('Witness', M + colW + 8, colW);
y = blockTop + 40;

blockTop = y;
signatureBlock('Doctor', M, colW);
y = blockTop + 42;

// ---- what to do with the sheet --------------------------------------------
// The whole point of the paper form: it has to get back into the system.
doc.setDrawColor(0);
doc.setLineWidth(0.4);
const boxTop = y;
y += 6;
setFont(9.5, 'bold');
doc.text('AFTER SIGNING', M + 4, y);
y += 5;
para(
  'Photograph this completed form and upload it to the booking in ORM — booking form, Consent ' +
  'section, "Attach a signed consent". Photograph both pages, flat and in good light, with all four ' +
  'corners visible. The patient will not be received into the holding area until the consent is on ' +
  'the booking.',
  8.4, 'normal', W - 8, M + 4,
);
y += 3;
doc.rect(M, boxTop, W, y - boxTop);

setFont(7.5);
doc.setTextColor(120);
doc.text('UNTH Theatre ORM — consent form', M, PAGE_H - 8);
doc.text('Page 2 of 2', PAGE_W - M, PAGE_H - 8, { align: 'right' });

// ---------------------------------------------------------------------------
const out = process.argv[2] || path.join(process.env.USERPROFILE || '.', 'Documents', 'UNTH-Theatre-Consent-Form.pdf');
fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('written:', out);
