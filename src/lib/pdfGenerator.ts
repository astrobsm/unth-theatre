import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

export function generateWeeklyPDF(data: WeeklySummary) {
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

export function generateMonthlyPDF(data: MonthlySummary) {
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

// ==================== PATIENT DISCHARGE DOCUMENT ====================

interface PatientDischargeData {
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
    ward: string;
  };
  surgery: {
    procedureName: string;
    scheduledDate: string;
    actualStartTime?: string;
    actualEndTime?: string;
    surgeon: { fullName: string };
    anesthetist?: { fullName: string };
  };
  holdingArea?: {
    admissionTime: string;
    vitalSigns: any;
    preOpChecklist: any;
  };
  anesthesia?: {
    type: string;
    technique: string;
    asaClassification: string;
    inductionTime?: string;
    anesthesiaEndTime?: string;
    baselineVitals: any;
    medications: Array<{
      medicationName: string;
      dosage: string;
      route: string;
      administeredAt: string;
      medicationType: string;
      volumeML?: number;
      rateMLPerHour?: number;
      bloodProductType?: string;
      bloodUnits?: number;
    }>;
    complications: any;
  };
  pacu?: {
    admissionTime: string;
    dischargeTime?: string;
    aldreteTotalScore: number;
    vitalSigns: any[];
    complications: string;
  };
  bom?: Array<{
    itemName: string;
    category: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
}

export function generatePatientDischargePDF(data: PatientDischargeData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 0;

  // Header
  doc.setFillColor(25, 118, 210);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('UNIVERSITY OF NIGERIA TEACHING HOSPITAL', pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(16);
  doc.text('ITUKU OZALLA, ENUGU', pageWidth / 2, 25, { align: 'center' });
  doc.setFontSize(14);
  doc.text('PERIOPERATIVE PATIENT RECORD', pageWidth / 2, 37, { align: 'center' });

  currentY = 55;

  // Patient Information
  doc.setFillColor(240, 240, 240);
  doc.rect(14, currentY, pageWidth - 28, 35, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PATIENT INFORMATION', 20, currentY + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Name: ${data.patient.name}`, 20, currentY + 16);
  doc.text(`Folder No: ${data.patient.folderNumber}`, 20, currentY + 23);
  doc.text(`Age: ${data.patient.age} years`, 20, currentY + 30);
  
  doc.text(`Gender: ${data.patient.gender}`, 110, currentY + 16);
  doc.text(`Ward: ${data.patient.ward}`, 110, currentY + 23);
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 110, currentY + 30);

  currentY += 45;

  // Surgery Information
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(25, 118, 210);
  doc.text('━━━ SURGICAL PROCEDURE ━━━', 14, currentY);
  currentY += 8;

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Procedure: ${data.surgery.procedureName}`, 20, currentY);
  currentY += 6;
  doc.text(`Surgeon: ${data.surgery.surgeonName || data.surgery.surgeon?.fullName || 'Not assigned'}`, 20, currentY);
  currentY += 6;
  if (data.surgery.anesthetist) {
    doc.text(`Anesthetist: ${data.surgery.anesthetist.fullName}`, 20, currentY);
    currentY += 6;
  }
  doc.text(`Scheduled: ${new Date(data.surgery.scheduledDate).toLocaleString('en-GB')}`, 20, currentY);
  currentY += 6;
  if (data.surgery.actualStartTime && data.surgery.actualEndTime) {
    const duration = Math.floor((new Date(data.surgery.actualEndTime).getTime() - new Date(data.surgery.actualStartTime).getTime()) / 60000);
    doc.text(`Duration: ${Math.floor(duration / 60)}h ${duration % 60}m`, 20, currentY);
    currentY += 6;
  }

  currentY += 5;

  // Holding Area
  if (data.holdingArea) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(156, 39, 176);
    doc.text('━━━ PRE-OPERATIVE HOLDING AREA ━━━', 14, currentY);
    currentY += 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Admission: ${new Date(data.holdingArea.admissionTime).toLocaleString('en-GB')}`, 20, currentY);
    currentY += 10;
  }

  // Anesthesia
  if (data.anesthesia) {
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 87, 34);
    doc.text('━━━ ANESTHESIA RECORD ━━━', 14, currentY);
    currentY += 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Type: ${data.anesthesia.type}`, 20, currentY);
    currentY += 6;
    doc.text(`Technique: ${data.anesthesia.technique}`, 20, currentY);
    currentY += 6;
    doc.text(`ASA: ${data.anesthesia.asaClassification}`, 20, currentY);
    currentY += 10;

    // Medications Table
    if (data.anesthesia.medications && data.anesthesia.medications.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Medications Administered:', 20, currentY);
      currentY += 6;

      const medTableData = data.anesthesia.medications.map((med) => {
        const time = new Date(med.administeredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        let details = `${med.dosage} ${med.route}`;
        
        if (med.medicationType === 'IV_FLUID' && med.volumeML) {
          details += ` | ${med.volumeML}ml @ ${med.rateMLPerHour || 0}ml/hr`;
        }
        
        if (med.medicationType === 'BLOOD_PRODUCT' && med.bloodProductType) {
          details += ` | ${med.bloodProductType} ${med.bloodUnits || 0} units`;
        }
        
        return [time, med.medicationName, details];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Time', 'Medication', 'Dosage & Route']],
        body: medTableData,
        theme: 'grid',
        headStyles: { fillColor: [255, 87, 34], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 50 },
          2: { cellWidth: 'auto' },
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // PACU
  if (data.pacu) {
    if (currentY > 220) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(76, 175, 80);
    doc.text('━━━ POST-ANESTHESIA CARE UNIT ━━━', 14, currentY);
    currentY += 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Admission: ${new Date(data.pacu.admissionTime).toLocaleString('en-GB')}`, 20, currentY);
    currentY += 6;
    if (data.pacu.dischargeTime) {
      doc.text(`Discharge: ${new Date(data.pacu.dischargeTime).toLocaleString('en-GB')}`, 20, currentY);
      currentY += 6;
    }
    doc.text(`Aldrete Score: ${data.pacu.aldreteTotalScore}/10`, 20, currentY);
    currentY += 10;
  }

  // BOM
  if (data.bom && data.bom.length > 0) {
    if (currentY > 200) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(233, 30, 99);
    doc.text('━━━ BILL OF MATERIALS ━━━', 14, currentY);
    currentY += 6;

    const bomData = data.bom.map((item) => [
      item.itemName,
      item.category,
      item.quantity.toString(),
      `₦${item.unitCost.toLocaleString()}`,
      `₦${item.totalCost.toLocaleString()}`,
    ]);

    const totalCost = data.bom.reduce((sum, item) => sum + item.totalCost, 0);

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Category', 'Qty', 'Unit Cost', 'Total']],
      body: bomData,
      foot: [['', '', '', 'TOTAL', `₦${totalCost.toLocaleString()}`]],
      theme: 'striped',
      headStyles: { fillColor: [233, 30, 99], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: [200, 200, 200], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Signatures
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  currentY += 10;
  doc.setDrawColor(0, 0, 0);
  doc.line(20, currentY, 90, currentY);
  doc.line(120, currentY, 190, currentY);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Theatre Manager', 20, currentY + 6);
  doc.text('Surgeon/Anesthetist', 120, currentY + 6);

  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount} | ORM System | Generated: ${new Date().toLocaleString('en-GB')}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}
