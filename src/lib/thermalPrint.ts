// Thermal-printer (80 mm roll) prescription printing.
// Opens a print window with receipt-styled HTML sized for an 80 mm thermal
// printer (`@page { size: 80mm auto }`) and triggers the browser print dialog.

export interface ThermalMedItem {
  category?: string;
  drugName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  isControlled?: boolean;
  notes?: string;
}

export interface ThermalPrescriptionData {
  hospitalName?: string;
  hospitalAddress?: string;
  title?: string;
  patientName?: string;
  folderNumber?: string;
  ward?: string;
  procedureName?: string;
  surgeonName?: string;
  prescribedBy?: string;
  dateTime?: string;
  medications: ThermalMedItem[];
  notes?: string;
}

const esc = (s?: string | number | null) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const prettyCategory = (c?: string) =>
  (c || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export function printThermalPrescription(data: ThermalPrescriptionData) {
  const {
    hospitalName = 'UNIVERSITY OF NIGERIA TEACHING HOSPITAL',
    hospitalAddress = 'Ituku Ozalla, Enugu State',
    title = 'POST-OPERATIVE PRESCRIPTION',
    patientName,
    folderNumber,
    ward,
    procedureName,
    surgeonName,
    prescribedBy,
    dateTime,
    medications,
    notes,
  } = data;

  const when = dateTime || new Date().toLocaleString('en-GB');

  const rows = medications
    .filter((m) => m.drugName && m.drugName.trim())
    .map((m, i) => {
      const line2 = [m.dosage, m.route, m.frequency, m.duration]
        .filter((x) => x && String(x).trim())
        .join(' • ');
      const qty = m.quantity != null ? `Qty: ${m.quantity}` : '';
      return `
        <div class="med">
          <div class="med-head">
            <span class="idx">${i + 1}.</span>
            <span class="drug">${esc(m.drugName)}${m.isControlled ? ' <b>[C]</b>' : ''}</span>
          </div>
          ${m.category ? `<div class="cat">${esc(prettyCategory(m.category))}</div>` : ''}
          ${line2 ? `<div class="detail">${esc(line2)}</div>` : ''}
          ${qty ? `<div class="detail">${esc(qty)}</div>` : ''}
          ${m.notes ? `<div class="detail">Note: ${esc(m.notes)}</div>` : ''}
        </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Prescription</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  /* Policy: all 80mm thermal print text is bold, 16px. */
  body * { font-size: 16px !important; font-weight: bold !important; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 80mm;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #000;
    padding: 4mm 3mm 6mm;
  }
  .center { text-align: center; }
  .hospital { font-weight: bold; font-size: 12px; }
  .addr { font-size: 10px; }
  .title { font-weight: bold; font-size: 13px; margin: 4px 0; }
  .hr { border-top: 1px dashed #000; margin: 4px 0; }
  .kv { font-size: 11px; }
  .kv b { display: inline-block; min-width: 0; }
  .med { margin: 4px 0; }
  .med-head { display: flex; gap: 4px; font-weight: bold; font-size: 12px; }
  .idx { flex: 0 0 auto; }
  .drug { flex: 1; }
  .cat { font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  .detail { font-size: 11px; padding-left: 14px; }
  .notes { font-size: 11px; margin-top: 4px; }
  .foot { font-size: 10px; margin-top: 8px; }
  .sign { margin-top: 14px; font-size: 11px; }
  .sign-line { border-top: 1px solid #000; width: 60%; margin-top: 16px; }
</style>
</head>
<body>
  <div class="center">
    <div class="hospital">${esc(hospitalName)}</div>
    <div class="addr">${esc(hospitalAddress)}</div>
    <div class="title">${esc(title)}</div>
  </div>
  <div class="hr"></div>
  <div class="kv">
    ${patientName ? `<div><b>Patient:</b> ${esc(patientName)}</div>` : ''}
    ${folderNumber ? `<div><b>Folder:</b> ${esc(folderNumber)}</div>` : ''}
    ${ward ? `<div><b>Ward:</b> ${esc(ward)}</div>` : ''}
    ${procedureName ? `<div><b>Procedure:</b> ${esc(procedureName)}</div>` : ''}
    ${surgeonName ? `<div><b>Surgeon:</b> ${esc(surgeonName)}</div>` : ''}
    <div><b>Date:</b> ${esc(when)}</div>
  </div>
  <div class="hr"></div>
  <div class="center" style="font-weight:bold;font-size:11px;">MEDICATIONS</div>
  ${rows || '<div class="detail">No medications listed.</div>'}
  <div class="hr"></div>
  ${notes ? `<div class="notes"><b>Notes:</b> ${esc(notes)}</div><div class="hr"></div>` : ''}
  <div class="sign">
    <div>Prescribed by:</div>
    <div><b>${esc(prescribedBy || surgeonName || '')}</b></div>
    <div class="sign-line"></div>
    <div>Signature</div>
  </div>
  <div class="foot center">Dispense before patient leaves theatre.<br/>Operative Resource Manager (ORM) — UNTH</div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
      setTimeout(function () { window.close(); }, 300);
    };
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=360,height=640');
  if (!w) {
    alert('Unable to open the print window. Please allow pop-ups for this site and try again.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
