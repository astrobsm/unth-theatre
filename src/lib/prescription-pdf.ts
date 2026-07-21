// Generate prescription PDFs (date-range register or single-patient print).
// Uses jsPDF + jspdf-autotable. Highlights narcotic medications for
// controlled-substance accountability.

"use client";

// jsPDF + autoTable are ~400 KB and were statically imported here, which forced
// them onto the prescriptions route for every visitor even though a PDF is only
// produced on an explicit click. Loaded on demand instead, mirroring
// ./pdfGenerator.ts. The type-only imports below are erased at compile time and
// cost nothing.
import type jsPDF from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import { isNarcotic } from "./narcotics";

let _jsPDF: typeof import("jspdf").default | null = null;
let _autoTable: typeof import("jspdf-autotable").default | null = null;

async function loadPdfLibs() {
  if (!_jsPDF) _jsPDF = (await import("jspdf")).default;
  if (!_autoTable) _autoTable = (await import("jspdf-autotable")).default;
  return { JsPDF: _jsPDF, autoTable: _autoTable };
}

/** Local shim so call sites keep reading `autoTable(doc, {...})`. */
function autoTable(doc: jsPDF, opts: UserOptions) {
  if (!_autoTable) throw new Error("autoTable used before loadPdfLibs()");
  return _autoTable(doc, opts);
}

export interface ReportMedication {
  name: string;
  dose?: string;
  route?: string;
  frequency?: string;
  timing?: string;
  notes?: string;
}

export interface ReportPrescription {
  id: string;
  patientName: string;
  folderNumber?: string | null;
  scheduledSurgeryDate: string;
  procedureName?: string | null;
  prescribedByName: string;
  prescribedByPhone?: string | null;
  approvedByName?: string | null;
  packedByName?: string | null;
  packedAt?: string | null;
  status: string;
  urgency: string;
  medications: ReportMedication[];
  outOfStockItems?: string[];
  hasOutOfStockItems?: boolean;
  notes?: string | null;
}

function fmt(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("UNTH — Theatre Pharmacy", 14, 16);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 23);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 29);
    doc.setTextColor(0);
  }
  doc.setLineWidth(0.3);
  doc.line(14, 32, 196, 32);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Generated ${new Date().toLocaleString("en-GB")} • Page ${i} of ${pages}`,
      14,
      290,
    );
    doc.text("Controlled drug accountability — narcotic items shown in RED", 196, 290, {
      align: "right",
    });
    doc.setTextColor(0);
  }
}

/** Prescription register over a date range — one row per medication so
 *  narcotics can be tallied row-by-row. */
export async function buildRegisterPdf(
  prescriptions: ReportPrescription[],
  fromIso: string,
  toIso: string,
) {
  const { JsPDF } = await loadPdfLibs();
  const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  header(
    doc,
    `Prescription Register: ${fmt(fromIso)} – ${fmt(toIso)}`,
    `${prescriptions.length} prescription(s)`,
  );

  // Build flat rows
  type Row = (string | number)[];
  const rows: Row[] = [];
  let narcoticRowIdxs: number[] = [];
  let narcoticCount = 0;

  for (const rx of prescriptions) {
    if (!rx.medications.length) {
      rows.push([
        fmt(rx.scheduledSurgeryDate),
        rx.patientName + (rx.folderNumber ? ` (${rx.folderNumber})` : ""),
        rx.procedureName || "—",
        "(no medications)",
        "",
        "",
        rx.prescribedByName + (rx.prescribedByPhone ? `\n${rx.prescribedByPhone}` : ""),
        rx.status,
      ]);
      continue;
    }
    rx.medications.forEach((m, i) => {
      const isNarc = isNarcotic(m.name);
      if (isNarc) {
        narcoticRowIdxs.push(rows.length);
        narcoticCount++;
      }
      rows.push([
        i === 0 ? fmt(rx.scheduledSurgeryDate) : "",
        i === 0
          ? rx.patientName + (rx.folderNumber ? ` (${rx.folderNumber})` : "")
          : "",
        i === 0 ? rx.procedureName || "—" : "",
        (isNarc ? "* " : "") + m.name,
        [m.dose, m.route].filter(Boolean).join(" • "),
        [m.frequency, m.timing].filter(Boolean).join(" • "),
        i === 0
          ? rx.prescribedByName +
            (rx.prescribedByPhone ? `\n${rx.prescribedByPhone}` : "")
          : "",
        i === 0 ? rx.status : "",
      ]);
    });
  }

  autoTable(doc, {
    startY: 36,
    head: [
      [
        "Surgery date",
        "Patient",
        "Procedure",
        "Drug (* = narcotic)",
        "Dose / Route",
        "Frequency / Timing",
        "Prescribed by",
        "Status",
      ],
    ],
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.5, valign: "top" },
    theme: "grid",
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [120, 120, 120], lineWidth: 0.1, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 38 },
      2: { cellWidth: 38 },
      3: { cellWidth: 40 },
      4: { cellWidth: 32 },
      5: { cellWidth: 32 },
      6: { cellWidth: 32 },
      7: { cellWidth: 22 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && narcoticRowIdxs.includes(data.row.index)) {
        data.cell.styles.textColor = [185, 28, 28];
        if (data.column.index === 3) data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Narcotics summary
  const lastY = (doc as any).lastAutoTable?.finalY ?? 36;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Controlled-Drug Summary", 14, lastY + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Total narcotic line-items: ${narcoticCount}`, 14, lastY + 16);

  // Per-narcotic tally
  const tally = new Map<string, number>();
  for (const rx of prescriptions) {
    for (const m of rx.medications) {
      if (isNarcotic(m.name)) {
        tally.set(m.name, (tally.get(m.name) || 0) + 1);
      }
    }
  }
  if (tally.size) {
    autoTable(doc, {
      startY: lastY + 20,
      head: [["Narcotic drug", "Times prescribed"]],
      body: Array.from(tally.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, v]),
      styles: { fontSize: 9 },
      theme: "grid",
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [120, 120, 120], lineWidth: 0.1, fontStyle: "bold" },
      tableWidth: 120,
    });
  }

  footer(doc);
  return doc;
}

/** Single-patient prescription print — full detail for one Rx. */
export async function buildPatientPrescriptionPdf(rx: ReportPrescription) {
  const { JsPDF } = await loadPdfLibs();
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  header(
    doc,
    `Prescription — ${rx.patientName}${rx.folderNumber ? " (" + rx.folderNumber + ")" : ""}`,
    `Surgery: ${rx.procedureName || "—"} • Scheduled ${fmt(rx.scheduledSurgeryDate)}`,
  );

  // Meta box
  let y = 38;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Prescriber:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${rx.prescribedByName}${rx.prescribedByPhone ? "  •  " + rx.prescribedByPhone : ""}`,
    45,
    y,
  );
  y += 6;
  if (rx.approvedByName) {
    doc.setFont("helvetica", "bold");
    doc.text("Approved by:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(rx.approvedByName, 45, y);
    y += 6;
  }
  if (rx.packedByName) {
    doc.setFont("helvetica", "bold");
    doc.text("Packed by:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${rx.packedByName}  •  ${fmt(rx.packedAt || null)}`, 45, y);
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Urgency:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${rx.urgency}  •  Status: ${rx.status}`, 45, y);
  y += 4;

  const narcRows: number[] = [];
  const body = rx.medications.map((m, i) => {
    const isNarc = isNarcotic(m.name);
    if (isNarc) narcRows.push(i);
    return [
      String(i + 1),
      (isNarc ? "* " : "") + m.name,
      m.dose || "",
      m.route || "",
      m.frequency || "",
      m.timing || "",
      m.notes || "",
    ];
  });

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Drug (* = narcotic)", "Dose", "Route", "Frequency", "Timing", "Notes"]],
    body,
    styles: { fontSize: 9, cellPadding: 2, valign: "top" },
    theme: "grid",
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [120, 120, 120], lineWidth: 0.1, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 50 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
      5: { cellWidth: 25 },
      6: { cellWidth: 27 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && narcRows.includes(data.row.index)) {
        data.cell.styles.textColor = [185, 28, 28];
        if (data.column.index === 1) data.cell.styles.fontStyle = "bold";
      }
    },
  });

  let lastY = (doc as any).lastAutoTable?.finalY ?? y + 8;

  // Out-of-stock callout
  if (rx.hasOutOfStockItems && rx.outOfStockItems?.length) {
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.rect(14, lastY + 4, 182, 14, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Out-of-stock items (alternatives requested):", 16, lastY + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(rx.outOfStockItems.join(", "), 16, lastY + 15);
    doc.setTextColor(0);
    lastY += 18;
  }

  // Narcotic accountability block
  const narcs = rx.medications.filter((m) => isNarcotic(m.name));
  if (narcs.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Controlled-Drug Acknowledgement", 14, lastY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `This prescription contains ${narcs.length} controlled (narcotic) item(s).`,
      14,
      lastY + 18,
    );
    autoTable(doc, {
      startY: lastY + 22,
      head: [["Narcotic drug", "Dose", "Dispensed by (sign)", "Collected by (sign)"]],
      body: narcs.map((m) => [m.name, m.dose || "", "", ""]),
      styles: { fontSize: 9, cellPadding: 3 },
      theme: "grid",
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [120, 120, 120], lineWidth: 0.1, fontStyle: "bold" },
    });
  }

  if (rx.notes) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? lastY + 30;
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 14, finalY + 8);
    doc.setFont("helvetica", "normal");
    doc.text(rx.notes, 14, finalY + 14, { maxWidth: 180 });
  }

  footer(doc);
  return doc;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function printPdf(doc: jsPDF) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const w = window.open(url);
  if (w) {
    w.addEventListener("load", () => w.print());
  }
}
