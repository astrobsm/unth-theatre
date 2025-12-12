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
