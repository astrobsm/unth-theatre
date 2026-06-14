// jsPDF and autoTable are loaded dynamically to keep them out of the initial bundle
let _jsPDF: typeof import('jspdf').default | null = null;
let _autoTable: typeof import('jspdf-autotable').default | null = null;

async function getJsPDF() {
  if (!_jsPDF) {
    const mod = await import('jspdf');
    _jsPDF = mod.default;
  }
  return _jsPDF;
}

async function getAutoTable() {
  if (!_autoTable) {
    const mod = await import('jspdf-autotable');
    _autoTable = mod.default;
  }
  return _autoTable;
}

interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  unitSummary: Array<{
    unit: string;
    totalBooked: number;
    totalCompleted: number;
    totalCancelled: number;
    completionRate: number;
    cancellationRate: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    booked: number;
    completed: number;
    cancelled: number;
  }>;
}

interface MonthlySummary {
  month: string;
  unitPerformance: Array<{
    unit: string;
    booked: number;
    completed: number;
    cancelled: number;
    totalCost: number;
    avgCost: number;
    completionRate: number;
    cancellationRate: number;
  }>;
  weeklyBreakdown: Array<{
    weekStart: string;
    weekEnd: string;
    booked: number;
    completed: number;
    cancelled: number;
  }>;
}

export async function generateWeeklyPDF(data: WeeklySummary) {
  const jsPDF = await getJsPDF();
  const autoTable = await getAutoTable();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(46, 187, 112); // Primary green
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('UNTH ITUKU OZALLA', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(18);
  doc.text('Theatre Manager - Weekly Summary', pageWidth / 2, 28, { align: 'center' });

  // Week Period
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const weekStart = new Date(data.weekStart).toLocaleDateString('en-GB');
  const weekEnd = new Date(data.weekEnd).toLocaleDateString('en-GB');
  doc.text(`Week: ${weekStart} - ${weekEnd}`, 14, 50);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - 14, 50, { align: 'right' });

  // Unit Summary Table
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Unit Performance Summary', 14, 65);

  const unitTableData = data.unitSummary.map((unit) => [
    unit.unit,
    unit.totalBooked.toString(),
    unit.totalCompleted.toString(),
    unit.totalCancelled.toString(),
    `${unit.completionRate.toFixed(1)}%`,
    `${unit.cancellationRate.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['Unit', 'Booked', 'Completed', 'Cancelled', 'Completion Rate', 'Cancellation Rate']],
    body: unitTableData,
    theme: 'striped',
    headStyles: { fillColor: [46, 187, 112], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 10, cellPadding: 3 },
  });

  // Daily Breakdown Table
  const finalY = (doc as any).lastAutoTable.finalY || 70;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Daily Breakdown', 14, finalY + 15);

  const dailyTableData = data.dailyBreakdown.map((day) => [
    new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
    day.booked.toString(),
    day.completed.toString(),
    day.cancelled.toString(),
    `${((day.completed / (day.booked || 1)) * 100).toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: finalY + 20,
    head: [['Date', 'Booked', 'Completed', 'Cancelled', 'Success Rate']],
    body: dailyTableData,
    theme: 'striped',
    headStyles: { fillColor: [46, 147, 255], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 10, cellPadding: 3 },
  });

  // Summary Stats
  const totalBooked = data.unitSummary.reduce((sum, u) => sum + u.totalBooked, 0);
  const totalCompleted = data.unitSummary.reduce((sum, u) => sum + u.totalCompleted, 0);
  const totalCancelled = data.unitSummary.reduce((sum, u) => sum + u.totalCancelled, 0);
  const overallCompletion = ((totalCompleted / (totalBooked || 1)) * 100).toFixed(1);

  const summaryY = (doc as any).lastAutoTable.finalY + 15;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(14, summaryY, pageWidth - 28, 25, 'F');
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Overall Weekly Summary:`, 20, summaryY + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Booked: ${totalBooked} | Completed: ${totalCompleted} | Cancelled: ${totalCancelled} | Success Rate: ${overallCompletion}%`, 20, summaryY + 18);

  // Footer
  const pageCount = doc.internal.pages.length - 1;
  doc.setFontSize(9);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Page ${pageCount} | Operative Resource Manager-ORM | University of Nigeria Teaching Hospital Ituku Ozalla`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: 'center' }
  );

  return doc;
}

export async function generateMonthlyPDF(data: MonthlySummary) {
  const jsPDF = await getJsPDF();
  const autoTable = await getAutoTable();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(46, 187, 112);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('UNTH ITUKU OZALLA', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(18);
  doc.text('Theatre Manager - Monthly Analytics', pageWidth / 2, 28, { align: 'center' });

  // Month Period
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Month: ${data.month}`, 14, 50);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - 14, 50, { align: 'right' });

  // Unit Performance Table
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Unit Performance', 14, 65);

  const unitTableData = data.unitPerformance.map((unit) => [
    unit.unit,
    unit.booked.toString(),
    unit.completed.toString(),
    unit.cancelled.toString(),
    `${unit.completionRate.toFixed(1)}%`,
    `₦${unit.totalCost.toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['Unit', 'Booked', 'Completed', 'Cancelled', 'Success Rate', 'Total Cost']],
    body: unitTableData,
    theme: 'striped',
    headStyles: { fillColor: [46, 187, 112], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      5: { halign: 'right' },
    },
  });

  // Check if we need a new page
  let currentY = (doc as any).lastAutoTable.finalY || 70;
  
  if (currentY > 200) {
    doc.addPage();
    currentY = 20;
  }

  // Weekly Breakdown Table
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Weekly Breakdown', 14, currentY + 15);

  const weeklyTableData = data.weeklyBreakdown.map((week) => [
    `${new Date(week.weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(week.weekEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
    week.booked.toString(),
    week.completed.toString(),
    week.cancelled.toString(),
    `${((week.completed / (week.booked || 1)) * 100).toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: currentY + 20,
    head: [['Week Period', 'Booked', 'Completed', 'Cancelled', 'Success Rate']],
    body: weeklyTableData,
    theme: 'striped',
    headStyles: { fillColor: [46, 147, 255], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 10, cellPadding: 3 },
  });

  // Summary Stats
  const totalBooked = data.unitPerformance.reduce((sum, u) => sum + u.booked, 0);
  const totalCompleted = data.unitPerformance.reduce((sum, u) => sum + u.completed, 0);
  const totalCancelled = data.unitPerformance.reduce((sum, u) => sum + u.cancelled, 0);
  const totalCost = data.unitPerformance.reduce((sum, u) => sum + u.totalCost, 0);
  const overallCompletion = ((totalCompleted / (totalBooked || 1)) * 100).toFixed(1);

  const summaryY = (doc as any).lastAutoTable.finalY + 15;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(14, summaryY, pageWidth - 28, 35, 'F');
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Overall Monthly Summary:`, 20, summaryY + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Booked: ${totalBooked} | Completed: ${totalCompleted} | Cancelled: ${totalCancelled}`, 20, summaryY + 18);
  doc.text(`Success Rate: ${overallCompletion}% | Total Revenue: ₦${totalCost.toLocaleString()}`, 20, summaryY + 28);

  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount} | Theatre Manager System | University of Nigeria Teaching Hospital Ituku Ozalla`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}

// ==================== PERIOPERATIVE PATIENT RECORD ====================

interface PerioperativeRecordData {
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
    ward: string;
    diagnosis?: string;
  };
  surgery: {
    procedureName: string;
    indication?: string;
    unit?: string;
    location?: string;
    scheduledDate: string;
    scheduledTime?: string;
    surgeryType?: string;
    anesthesiaType?: string;
    surgeonName?: string;
    anesthetistName?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
  timeline?: Array<{ label: string; time?: string }>;
  team?: Array<{ role: string; name: string }>;
  callUp?: {
    assignedNurseName?: string;
    assignedPorterName?: string;
    wardNurseName?: string;
    wardEntriesNotes?: string;
  };
  transport?: Array<{
    fromLocation: string;
    toLocation: string;
    transportType?: string;
    porterName?: string;
    startTime?: string;
    endTime?: string;
    receivedBy?: string;
  }>;
  holdingArea?: {
    arrivalTime?: string;
    receivedBy?: string;
    status?: string;
    vitals?: { pulseRate?: number; respiratoryRate?: number; bloodPressure?: string; spo2?: number; temperature?: number; weight?: number; gcs?: number };
    consentSigned?: boolean;
    siteMarked?: boolean;
    fastingConfirmed?: boolean;
    hasAllergies?: boolean;
    allergyDetails?: string;
    patientReadyForSurgery?: boolean;
    readinessRemarks?: string;
    typeOfAnesthesia?: string;
    perioperativeNurse1?: string;
    perioperativeNurse2?: string;
    clearedForTheatre?: boolean;
    clearanceTime?: string;
    transferredToTheatre?: boolean;
    transferTime?: string;
    handoverNurse?: string;
    redAlertTriggered?: boolean;
    redAlertDescription?: string;
  };
  intraOp?: {
    theatreEntryTime?: string;
    patientPositioning?: string;
    timeOut?: string;
    timeOutConfirmedBy?: string;
    knifeToSkinTime?: string;
    procedureStartTime?: string;
    procedureEndTime?: string;
    closureEndTime?: string;
    estimatedBloodLoss?: number;
    urineOutput?: number;
    instrumentCountCorrect?: boolean | null;
    swabCountCorrect?: boolean | null;
    needleCountCorrect?: boolean | null;
    countDiscrepancy?: string;
    drainsInserted?: boolean;
    drainDetails?: string;
    specimensSent?: boolean;
    specimenDetails?: string;
    complicationsOccurred?: boolean;
    complicationDetails?: string;
    bloodProductsGiven?: boolean;
    bloodProductDetails?: string;
    anesthesiaNotes?: string;
    transferToPACUTime?: string;
    handoverToRecoveryNurse?: string;
  };
  anesthesia?: {
    type: string;
    technique?: string;
    asaClassification?: string;
    airwayGrade?: string;
    intubationMethod?: string;
    ettSize?: string;
    spinalLevel?: string;
    spinalNeedleSize?: string;
    localAnestheticUsed?: string;
    inductionTime?: string;
    anesthesiaEndTime?: string;
    extubationTime?: string;
    extubationCondition?: string;
    baselineVitals?: { heartRate?: number; bloodPressure?: string; spo2?: number; temperature?: number };
    crystalloidsGiven?: number;
    colloidsGiven?: number;
    estimatedBloodLoss?: number;
    urineOutput?: number;
    antibioticProphylaxis?: string;
    complications?: string[];
    anesthetistNotes?: string;
    anesthetistName?: string;
    medications?: Array<{ time: string; name: string; dosage: string; route: string; type: string; volumeML?: number; rateMLPerHour?: number; bloodProductType?: string; bloodUnits?: number }>;
    vitalSigns?: Array<{ time: string; phase?: string; heartRate?: number; bloodPressure?: string; spo2?: number; etco2?: number; temperature?: number }>;
  };
  pacu?: {
    admissionTime: string;
    receivedBy?: string;
    handoverFrom?: string;
    consciousnessLevel?: string;
    airwayStatus?: string;
    breathingPattern?: string;
    oxygenTherapy?: boolean;
    heartRateOnAdmission?: number;
    bloodPressureOnAdmission?: string;
    painScoreOnAdmission?: number;
    surgicalSiteCondition?: string;
    dressingIntact?: boolean;
    drainsPresent?: boolean;
    drainOutput?: string;
    ivFluidsRunning?: boolean;
    urineOutput?: number;
    temperatureOnAdmission?: number;
    nauseaPresent?: boolean;
    vomitingOccurred?: boolean;
    complicationsDetected?: boolean;
    complicationDetails?: string;
    dischargeReadiness?: string;
    dischargeTime?: string;
    dischargedTo?: string;
    dischargeVitalsStable?: boolean;
    dischargePainControlled?: boolean;
    dischargeFullyConscious?: boolean;
    dischargeNauseaFree?: boolean;
    totalTimeInPACU?: number;
    dischargeNotes?: string;
    warningSignsExplained?: boolean;
    wardNurseHandover?: string;
    vitalSigns?: Array<{ time: string; consciousnessLevel?: string; heartRate?: number; bloodPressure?: string; respiratoryRate?: number; oxygenSaturation?: number; temperature?: number; painScore?: number }>;
    redAlerts?: Array<{ time: string; alertType: string; severity: string; description: string; resolved: boolean }>;
  };
  postOpPrescriptions?: Array<{ prescribedAt?: string; prescribedByName?: string; medications?: string; notes?: string }>;
  postOpNotes?: Array<{ time?: string; author?: string; note: string }>;
}

export async function generatePatientDischargePDF(data: PerioperativeRecordData) {
  const jsPDF = await getJsPDF();
  const autoTable = await getAutoTable();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // Professional serif typography. jsPDF ships a built-in Times serif face that
  // renders as a clean Georgia-equivalent for print; base body size 12.
  const SERIF = 'times';
  const BODY = 12;
  const NAVY: [number, number, number] = [30, 58, 95];

  let y = 0;

  const fmt = (s?: string) => {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const yn = (b?: boolean | null) => (b === true ? 'Yes' : b === false ? 'No' : '—');
  const val = (v: any) => (v === undefined || v === null || v === '' ? '—' : String(v));

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(16);
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(marginX, y, contentWidth, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(SERIF, 'bold');
    doc.setFontSize(BODY);
    doc.text(title, marginX + 3, y + 6.4);
    doc.setTextColor(0, 0, 0);
    y += 13;
  };

  // Two-column key/value grid
  const grid = (pairs: Array<[string, string]>) => {
    const colW = contentWidth / 2;
    const rowH = 6.5;
    doc.setFontSize(BODY);
    for (let i = 0; i < pairs.length; i += 2) {
      ensureSpace(rowH + 1);
      for (let c = 0; c < 2; c++) {
        const pair = pairs[i + c];
        if (!pair) continue;
        const x = marginX + 2 + c * colW;
        doc.setFont(SERIF, 'bold');
        const label = `${pair[0]}: `;
        doc.text(label, x, y);
        const labelW = doc.getTextWidth(label);
        doc.setFont(SERIF, 'normal');
        const lines = doc.splitTextToSize(pair[1] || '—', colW - 6 - labelW > 20 ? colW - 6 - labelW : colW - 6);
        doc.text(lines[0] || '—', x + labelW, y);
      }
      y += rowH;
    }
    y += 2;
  };

  // Full-width wrapped paragraph with bold lead-in label
  const para = (label: string, text?: string) => {
    if (!text) return;
    ensureSpace(10);
    doc.setFontSize(BODY);
    doc.setFont(SERIF, 'bold');
    doc.text(`${label}:`, marginX + 2, y);
    y += 5.5;
    doc.setFont(SERIF, 'normal');
    const lines = doc.splitTextToSize(text, contentWidth - 4);
    for (const ln of lines) {
      ensureSpace(6);
      doc.text(ln, marginX + 4, y);
      y += 5.5;
    }
    y += 1.5;
  };

  // Draw a compact multi-series line chart panel for vital-sign trends.
  // Each panel shares a single y-scale; series with null gaps are skipped.
  const drawTrendPanel = (
    title: string,
    labels: string[],
    series: Array<{ name: string; color: [number, number, number]; data: (number | null)[]; dashed?: boolean }>,
    yMin: number,
    yMax: number,
  ) => {
    const panelH = 44; // mm plotting height incl. labels
    ensureSpace(panelH + 14);
    doc.setFont(SERIF, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(title, marginX + 2, y);
    y += 3;

    const plotX = marginX + 16;
    const plotY = y;
    const plotW = contentWidth - 18;
    const plotH = panelH - 14;
    const plotRight = plotX + plotW;
    const plotBottom = plotY + plotH;

    // Axes
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.line(plotX, plotY, plotX, plotBottom);
    doc.line(plotX, plotBottom, plotRight, plotBottom);

    // Gridlines + y-axis labels
    const divs = 4;
    doc.setFont(SERIF, 'normal');
    doc.setFontSize(6.5);
    for (let i = 0; i <= divs; i++) {
      const v = yMin + ((yMax - yMin) * i) / divs;
      const gy = plotBottom - (plotH * i) / divs;
      if (i > 0) {
        doc.setDrawColor(228, 228, 228);
        doc.setLineWidth(0.15);
        doc.line(plotX, gy, plotRight, gy);
      }
      doc.setTextColor(120, 120, 120);
      doc.text(`${Math.round(v)}`, plotX - 2, gy + 1.1, { align: 'right' });
    }

    const n = labels.length;
    const xFor = (idx: number) => (n <= 1 ? plotX + plotW / 2 : plotX + (plotW * idx) / (n - 1));
    const yFor = (v: number) => {
      const c = Math.max(yMin, Math.min(yMax, v));
      return plotBottom - (plotH * (c - yMin)) / (yMax - yMin || 1);
    };

    // Series lines + points
    for (const s of series) {
      doc.setDrawColor(s.color[0], s.color[1], s.color[2]);
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.setLineWidth(0.5);
      let prevX: number | null = null;
      let prevY: number | null = null;
      for (let i = 0; i < s.data.length; i++) {
        const v = s.data[i];
        if (v == null || isNaN(v as number)) {
          prevX = null;
          prevY = null;
          continue;
        }
        const px = xFor(i);
        const py = yFor(v as number);
        if (prevX != null && prevY != null) {
          if (s.dashed) doc.setLineDashPattern([1, 1], 0);
          doc.line(prevX, prevY, px, py);
          if (s.dashed) doc.setLineDashPattern([], 0);
        }
        doc.circle(px, py, 0.6, 'F');
        prevX = px;
        prevY = py;
      }
    }

    // X-axis labels (first / middle / last)
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    const showIdx = n <= 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
    for (const idx of showIdx) {
      if (!labels[idx]) continue;
      doc.text(labels[idx], xFor(idx), plotBottom + 3, { align: 'center' });
    }

    // Legend
    let lx = plotX;
    const ly = plotBottom + 7;
    doc.setFontSize(6.5);
    for (const s of series) {
      doc.setFillColor(s.color[0], s.color[1], s.color[2]);
      doc.circle(lx + 1, ly - 1, 0.8, 'F');
      doc.setTextColor(60, 60, 60);
      doc.text(s.name, lx + 3, ly);
      lx += doc.getTextWidth(s.name) + 9;
    }
    doc.setTextColor(0, 0, 0);
    y = ly + 6;
  };

  // Render the PACU vital-sign trend graphs (3 stacked panels).
  const drawPacuVitalsTrend = (
    vitals: Array<{ time: string; heartRate?: number; bloodPressure?: string; respiratoryRate?: number; oxygenSaturation?: number; temperature?: number; painScore?: number }>,
  ) => {
    if (!vitals || vitals.length < 2) return;
    const sorted = [...vitals].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const labels = sorted.map((v) => {
      const d = new Date(v.time);
      return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    });
    const parseBP = (bp?: string) => {
      if (!bp) return { s: null as number | null, d: null as number | null };
      const m = bp.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
      return m ? { s: parseInt(m[1], 10), d: parseInt(m[2], 10) } : { s: null, d: null };
    };
    const hr = sorted.map((v) => (v.heartRate ?? null));
    const sys = sorted.map((v) => parseBP(v.bloodPressure).s);
    const dia = sorted.map((v) => parseBP(v.bloodPressure).d);
    const spo2 = sorted.map((v) => (v.oxygenSaturation ?? null));
    const rr = sorted.map((v) => (v.respiratoryRate ?? null));
    const temp = sorted.map((v) => (v.temperature != null ? Number(v.temperature) : null));
    const pain = sorted.map((v) => (v.painScore ?? null));

    ensureSpace(16);
    doc.setFont(SERIF, 'bold');
    doc.setFontSize(BODY);
    doc.setTextColor(0, 0, 0);
    doc.text('Recovery Vital Signs — Trend Graphs', marginX + 2, y);
    y += 6;

    drawTrendPanel('Cardiac — Heart Rate & Blood Pressure (bpm / mmHg)', labels, [
      { name: 'Heart Rate', color: [220, 38, 38], data: hr },
      { name: 'Systolic', color: [29, 78, 216], data: sys },
      { name: 'Diastolic', color: [96, 165, 250], data: dia, dashed: true },
    ], 40, 200);

    drawTrendPanel('Oxygenation & Respiration — SpO₂ (%) & Resp. Rate (/min)', labels, [
      { name: 'SpO₂ %', color: [14, 165, 233], data: spo2 },
      { name: 'Resp. Rate', color: [124, 58, 237], data: rr },
    ], 0, 100);

    drawTrendPanel('Temperature (°C) & Pain Score (0-10)', labels, [
      { name: 'Temperature', color: [245, 158, 11], data: temp },
      { name: 'Pain Score', color: [219, 39, 119], data: pain },
    ], 0, 40);
  };

  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(15);
  doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL', pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont(SERIF, 'normal');
  doc.text('Ituku Ozalla, Enugu State', pageWidth / 2, 19, { align: 'center' });
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(13);
  doc.text('PERIOPERATIVE PATIENT RECORD', pageWidth / 2, 28, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y = 42;

  // ── Patient information ─────────────────────────────────────────────
  sectionTitle('PATIENT INFORMATION');
  grid([
    ['Name', val(data.patient.name)],
    ['Folder No', val(data.patient.folderNumber)],
    ['Age', `${val(data.patient.age)} years`],
    ['Gender', val(data.patient.gender)],
    ['Ward', val(data.patient.ward)],
    ['Diagnosis', val(data.patient.diagnosis)],
    ['Report Date', new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
  ]);

  // ── Surgical procedure ──────────────────────────────────────────────
  sectionTitle('SURGICAL PROCEDURE');
  grid([
    ['Procedure', val(data.surgery.procedureName)],
    ['Surgical Unit', val(data.surgery.unit)],
    ['Location', val(data.surgery.location)],
    ['Type', val(data.surgery.surgeryType)],
    ['Surgeon', val(data.surgery.surgeonName)],
    ['Anaesthetist', val(data.surgery.anesthetistName)],
    ['Scheduled', fmt(data.surgery.scheduledDate)],
    ['Anaesthesia', val(data.surgery.anesthesiaType)],
  ]);
  if (data.surgery.actualStartTime && data.surgery.actualEndTime) {
    const dur = Math.max(0, Math.floor((new Date(data.surgery.actualEndTime).getTime() - new Date(data.surgery.actualStartTime).getTime()) / 60000));
    grid([['Operation Duration', `${Math.floor(dur / 60)}h ${dur % 60}m`]]);
  }
  para('Clinical Indication', data.surgery.indication);

  // ── Surgical team ───────────────────────────────────────────────────
  if (data.team && data.team.length > 0) {
    sectionTitle('SURGICAL TEAM');
    autoTable(doc, {
      startY: y,
      head: [['Role', 'Name']],
      body: data.team.map((t) => [t.role, t.name]),
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, font: SERIF, fontStyle: 'bold', fontSize: 11 },
      styles: { font: SERIF, fontSize: 11, cellPadding: 2 },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Perioperative timeline ──────────────────────────────────────────
  if (data.timeline && data.timeline.length > 0) {
    sectionTitle('PERIOPERATIVE TIMELINE');
    grid(data.timeline.map((t) => [t.label, fmt(t.time)] as [string, string]));
  }

  // ── Pre-operative holding area ──────────────────────────────────────
  if (data.holdingArea) {
    const h = data.holdingArea;
    sectionTitle('PRE-OPERATIVE HOLDING AREA');
    grid([
      ['Arrival', fmt(h.arrivalTime)],
      ['Received By', val(h.receivedBy)],
      ['Pulse', h.vitals?.pulseRate != null ? `${h.vitals.pulseRate} bpm` : '—'],
      ['Blood Pressure', val(h.vitals?.bloodPressure)],
      ['SpO2', h.vitals?.spo2 != null ? `${h.vitals.spo2}%` : '—'],
      ['Resp. Rate', h.vitals?.respiratoryRate != null ? `${h.vitals.respiratoryRate}/min` : '—'],
      ['Temperature', h.vitals?.temperature != null ? `${h.vitals.temperature} °C` : '—'],
      ['Weight', h.vitals?.weight != null ? `${h.vitals.weight} kg` : '—'],
      ['Consent Signed', yn(h.consentSigned)],
      ['Site Marked', yn(h.siteMarked)],
      ['Fasting Confirmed', yn(h.fastingConfirmed)],
      ['Allergies', h.hasAllergies ? (val(h.allergyDetails) === '—' ? 'Yes' : val(h.allergyDetails)) : 'None'],
      ['Type of Anaesthesia', val(h.typeOfAnesthesia)],
      ['Ready for Surgery', yn(h.patientReadyForSurgery)],
      ['Perioperative Nurse', val(h.perioperativeNurse1)],
      ['Perioperative Nurse 2', val(h.perioperativeNurse2)],
      ['Cleared for Theatre', `${yn(h.clearedForTheatre)}${h.clearanceTime ? ' (' + fmt(h.clearanceTime) + ')' : ''}`],
      ['Transferred to Theatre', `${yn(h.transferredToTheatre)}${h.transferTime ? ' (' + fmt(h.transferTime) + ')' : ''}`],
      ['Handover Nurse', val(h.handoverNurse)],
    ]);
    para('Readiness Remarks', h.readinessRemarks);
    if (h.redAlertTriggered) para('Red Alert', h.redAlertDescription || 'Triggered');
  }

  // ── Patient transport ───────────────────────────────────────────────
  if (data.transport && data.transport.length > 0) {
    sectionTitle('PATIENT TRANSPORT');
    autoTable(doc, {
      startY: y,
      head: [['From', 'To', 'Type', 'Porter', 'Start', 'End']],
      body: data.transport.map((t) => [t.fromLocation, t.toLocation, t.transportType || '—', t.porterName || '—', fmt(t.startTime), fmt(t.endTime)]),
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, font: SERIF, fontStyle: 'bold', fontSize: 10 },
      styles: { font: SERIF, fontSize: 9, cellPadding: 1.8 },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Intra-operative record ──────────────────────────────────────────
  if (data.intraOp) {
    const o = data.intraOp;
    sectionTitle('INTRA-OPERATIVE RECORD');
    grid([
      ['Theatre Entry', fmt(o.theatreEntryTime)],
      ['Positioning', val(o.patientPositioning)],
      ['Surgical Timeout', fmt(o.timeOut)],
      ['Timeout Confirmed By', val(o.timeOutConfirmedBy)],
      ['Knife to Skin', fmt(o.knifeToSkinTime)],
      ['Procedure Start', fmt(o.procedureStartTime)],
      ['Procedure End', fmt(o.procedureEndTime)],
      ['Closure End', fmt(o.closureEndTime)],
      ['Estimated Blood Loss', o.estimatedBloodLoss != null ? `${o.estimatedBloodLoss} mL` : '—'],
      ['Urine Output', o.urineOutput != null ? `${o.urineOutput} mL` : '—'],
      ['Instrument Count', yn(o.instrumentCountCorrect)],
      ['Swab Count', yn(o.swabCountCorrect)],
      ['Needle Count', yn(o.needleCountCorrect)],
      ['Drains Inserted', yn(o.drainsInserted)],
      ['Specimens Sent', yn(o.specimensSent)],
      ['Blood Products Given', yn(o.bloodProductsGiven)],
      ['Transfer to PACU', fmt(o.transferToPACUTime)],
      ['Handover Nurse', val(o.handoverToRecoveryNurse)],
    ]);
    if (o.countDiscrepancy) para('Count Discrepancy', o.countDiscrepancy);
    if (o.drainDetails) para('Drain Details', o.drainDetails);
    if (o.specimenDetails) para('Specimen Details', o.specimenDetails);
    if (o.bloodProductDetails) para('Blood Product Details', o.bloodProductDetails);
    if (o.complicationsOccurred) para('Complications', o.complicationDetails || 'Reported');
    para('Operative / Surgeon Notes', o.anesthesiaNotes);
  }

  // ── Anaesthesia record ──────────────────────────────────────────────
  if (data.anesthesia) {
    const a = data.anesthesia;
    sectionTitle('ANAESTHESIA RECORD');
    grid([
      ['Type', val(a.type)],
      ['Technique', val(a.technique)],
      ['ASA Class', val(a.asaClassification)],
      ['Airway Grade', val(a.airwayGrade)],
      ['Intubation', val(a.intubationMethod)],
      ['ETT Size', val(a.ettSize)],
      ['Spinal Level', val(a.spinalLevel)],
      ['Spinal Needle', val(a.spinalNeedleSize)],
      ['Local Anaesthetic', val(a.localAnestheticUsed)],
      ['Induction', fmt(a.inductionTime)],
      ['Anaesthesia End', fmt(a.anesthesiaEndTime)],
      ['Extubation', `${fmt(a.extubationTime)}${a.extubationCondition ? ' (' + a.extubationCondition + ')' : ''}`],
      ['Baseline HR', a.baselineVitals?.heartRate != null ? `${a.baselineVitals.heartRate} bpm` : '—'],
      ['Baseline BP', val(a.baselineVitals?.bloodPressure)],
      ['Baseline SpO2', a.baselineVitals?.spo2 != null ? `${a.baselineVitals.spo2}%` : '—'],
      ['Crystalloids', a.crystalloidsGiven != null ? `${a.crystalloidsGiven} mL` : '—'],
      ['Colloids', a.colloidsGiven != null ? `${a.colloidsGiven} mL` : '—'],
      ['Est. Blood Loss', a.estimatedBloodLoss != null ? `${a.estimatedBloodLoss} mL` : '—'],
      ['Urine Output', a.urineOutput != null ? `${a.urineOutput} mL` : '—'],
      ['Antibiotic Prophylaxis', val(a.antibioticProphylaxis)],
    ]);
    if (a.complications && a.complications.length > 0) para('Anaesthetic Complications', a.complications.join(', '));

    if (a.medications && a.medications.length > 0) {
      ensureSpace(14);
      doc.setFont(SERIF, 'bold');
      doc.setFontSize(BODY);
      doc.text('Medications & Fluids Administered', marginX + 2, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Time', 'Medication', 'Dose', 'Route', 'Type']],
        body: a.medications.map((m) => {
          let dose = m.dosage || '';
          if (m.volumeML) dose += `${dose ? ' | ' : ''}${m.volumeML}mL${m.rateMLPerHour ? ' @ ' + m.rateMLPerHour + 'mL/hr' : ''}`;
          if (m.bloodProductType) dose += `${dose ? ' | ' : ''}${m.bloodProductType} ${m.bloodUnits || 0}u`;
          return [fmt(m.time), m.name, dose || '—', m.route, String(m.type).replace(/_/g, ' ')];
        }),
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: 255, font: SERIF, fontStyle: 'bold', fontSize: 10 },
        styles: { font: SERIF, fontSize: 9, cellPadding: 1.8 },
        margin: { left: marginX, right: marginX },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    if (a.vitalSigns && a.vitalSigns.length > 0) {
      ensureSpace(14);
      doc.setFont(SERIF, 'bold');
      doc.setFontSize(BODY);
      doc.text('Intra-operative Monitoring', marginX + 2, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Time', 'Phase', 'HR', 'BP', 'SpO2', 'EtCO2', 'Temp']],
        body: a.vitalSigns.map((v) => [fmt(v.time), v.phase || '—', v.heartRate ?? '—', v.bloodPressure || '—', v.spo2 != null ? `${v.spo2}%` : '—', v.etco2 ?? '—', v.temperature != null ? `${v.temperature}` : '—']),
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: 255, font: SERIF, fontStyle: 'bold', fontSize: 10 },
        styles: { font: SERIF, fontSize: 9, cellPadding: 1.8 },
        margin: { left: marginX, right: marginX },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
    para('Anaesthetist Notes', a.anesthetistNotes);
    if (a.anesthetistName) grid([['Recorded By (Anaesthetist)', a.anesthetistName]]);
  }

  // ── Post-anaesthesia care unit (recovery room) ──────────────────────
  if (data.pacu) {
    const p = data.pacu;
    sectionTitle('POST-ANAESTHESIA CARE UNIT (RECOVERY ROOM)');
    grid([
      ['Admission', fmt(p.admissionTime)],
      ['Received By', val(p.receivedBy)],
      ['Handover From', val(p.handoverFrom)],
      ['Consciousness', val(p.consciousnessLevel).replace(/_/g, ' ')],
      ['Airway', val(p.airwayStatus).replace(/_/g, ' ')],
      ['Breathing', val(p.breathingPattern)],
      ['Oxygen Therapy', yn(p.oxygenTherapy)],
      ['HR on Admission', p.heartRateOnAdmission != null ? `${p.heartRateOnAdmission} bpm` : '—'],
      ['BP on Admission', val(p.bloodPressureOnAdmission)],
      ['Pain Score', p.painScoreOnAdmission != null ? `${p.painScoreOnAdmission}/10` : '—'],
      ['Temperature', p.temperatureOnAdmission != null ? `${p.temperatureOnAdmission} °C` : '—'],
      ['Surgical Site', val(p.surgicalSiteCondition)],
      ['Dressing Intact', yn(p.dressingIntact)],
      ['Drains', p.drainsPresent ? (val(p.drainOutput) === '—' ? 'Present' : val(p.drainOutput)) : 'None'],
      ['IV Fluids Running', yn(p.ivFluidsRunning)],
      ['Urine Output', p.urineOutput != null ? `${p.urineOutput} mL` : '—'],
      ['Nausea', yn(p.nauseaPresent)],
      ['Vomiting', yn(p.vomitingOccurred)],
    ]);

    if (p.vitalSigns && p.vitalSigns.length > 0) {
      ensureSpace(14);
      doc.setFont(SERIF, 'bold');
      doc.setFontSize(BODY);
      doc.text('Recovery Vital Signs', marginX + 2, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Time', 'Conscious', 'HR', 'BP', 'RR', 'SpO2', 'Temp', 'Pain']],
        body: p.vitalSigns.map((v) => [fmt(v.time), (v.consciousnessLevel || '—').replace(/_/g, ' '), v.heartRate ?? '—', v.bloodPressure || '—', v.respiratoryRate ?? '—', v.oxygenSaturation != null ? `${v.oxygenSaturation}%` : '—', v.temperature != null ? `${v.temperature}` : '—', v.painScore != null ? `${v.painScore}/10` : '—']),
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: 255, font: SERIF, fontStyle: 'bold', fontSize: 9 },
        styles: { font: SERIF, fontSize: 8.5, cellPadding: 1.6 },
        margin: { left: marginX, right: marginX },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Automated digital trend graphs for the recovery vitals
      drawPacuVitalsTrend(p.vitalSigns);
    }

    if (p.redAlerts && p.redAlerts.length > 0) {
      ensureSpace(14);
      doc.setFont(SERIF, 'bold');
      doc.setFontSize(BODY);
      doc.text('Recovery Red Alerts', marginX + 2, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Time', 'Type', 'Severity', 'Description', 'Resolved']],
        body: p.redAlerts.map((al) => [fmt(al.time), al.alertType.replace(/_/g, ' '), al.severity, al.description, al.resolved ? 'Yes' : 'No']),
        theme: 'grid',
        headStyles: { fillColor: [183, 28, 28], textColor: 255, font: SERIF, fontStyle: 'bold', fontSize: 10 },
        styles: { font: SERIF, fontSize: 9, cellPadding: 1.8 },
        margin: { left: marginX, right: marginX },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    if (p.complicationsDetected) para('Recovery Complications', p.complicationDetails || 'Reported');

    grid([
      ['Discharge Readiness', val(p.dischargeReadiness).replace(/_/g, ' ')],
      ['Discharge Time', fmt(p.dischargeTime)],
      ['Discharged To', val(p.dischargedTo)],
      ['Time in Recovery', p.totalTimeInPACU != null ? `${p.totalTimeInPACU} min` : '—'],
      ['Vitals Stable', yn(p.dischargeVitalsStable)],
      ['Pain Controlled', yn(p.dischargePainControlled)],
      ['Fully Conscious', yn(p.dischargeFullyConscious)],
      ['Nausea-Free', yn(p.dischargeNauseaFree)],
      ['Warning Signs Explained', yn(p.warningSignsExplained)],
      ['Ward Nurse Handover', val(p.wardNurseHandover)],
    ]);
    para('Discharge Notes', p.dischargeNotes);
  }

  // ── Surgeon's post-operative notes ──────────────────────────────────
  if (data.postOpNotes && data.postOpNotes.length > 0) {
    sectionTitle("SURGEON'S POST-OPERATIVE NOTES");
    for (const n of data.postOpNotes) {
      const heading = [n.author, fmt(n.time)].filter((s) => s && s !== '—').join('  •  ');
      if (heading) {
        ensureSpace(8);
        doc.setFont(SERIF, 'bold');
        doc.setFontSize(BODY);
        doc.text(heading, marginX + 2, y);
        y += 5.5;
      }
      doc.setFont(SERIF, 'normal');
      doc.setFontSize(BODY);
      const lines = doc.splitTextToSize(n.note, contentWidth - 4);
      for (const ln of lines) {
        ensureSpace(6);
        doc.text(ln, marginX + 4, y);
        y += 5.5;
      }
      y += 3;
    }
  }

  // ── Post-operative prescriptions ────────────────────────────────────
  if (data.postOpPrescriptions && data.postOpPrescriptions.length > 0) {
    sectionTitle('POST-OPERATIVE PRESCRIPTIONS');
    for (const rx of data.postOpPrescriptions) {
      grid([
        ['Prescribed', fmt(rx.prescribedAt)],
        ['Prescriber', val(rx.prescribedByName)],
      ]);
      let meds = rx.medications;
      try {
        if (meds) {
          const arr = JSON.parse(meds);
          if (Array.isArray(arr)) {
            meds = arr
              .map((m: any) => `${m.drugName || m.name || ''} ${m.dosage || m.dose || ''} ${m.route || ''} ${m.frequency || ''}`.trim())
              .join('; ');
          }
        }
      } catch {
        /* leave medications as raw text */
      }
      para('Medications', meds);
      para('Notes', rx.notes);
    }
  }

  // ── Signatures ──────────────────────────────────────────────────────
  ensureSpace(30);
  y += 8;
  doc.setDrawColor(0, 0, 0);
  doc.line(marginX + 6, y, marginX + 76, y);
  doc.line(pageWidth - marginX - 76, y, pageWidth - marginX - 6, y);
  doc.setFont(SERIF, 'normal');
  doc.setFontSize(BODY - 2);
  doc.text('Recovery Room Nurse', marginX + 6, y + 6);
  doc.text('Surgeon / Anaesthetist', pageWidth - marginX - 76, y + 6);

  // ── Footer on every page ────────────────────────────────────────────
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont(SERIF, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Page ${i} of ${pageCount}  |  Operative Resource Manager (ORM)  |  UNTH Ituku Ozalla  |  Generated: ${new Date().toLocaleString('en-GB')}`,
      pageWidth / 2,
      pageHeight - 9,
      { align: 'center' }
    );
  }

  return doc;
}
