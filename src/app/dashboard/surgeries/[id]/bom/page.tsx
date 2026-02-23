'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FileText,
  Download,
  DollarSign,
  Package,
  TrendingUp,
  Calendar,
  User,
  Building2,
  Printer,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
// jsPDF loaded dynamically when user clicks download/export

interface SurgeryBOM {
  id: string;
  procedureName: string;
  scheduledDate: string;
  status: string;
  totalItemsCost: number;
  patientCharge: number;
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgeon: {
    fullName: string;
  };
  unit: string;
  items: {
    id: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    item: {
      name: string;
      category: string;
    };
  }[];
}

export default function SurgeryBOMPage() {
  const params = useParams();
  const router = useRouter();
  const surgeryId = params.id as string;

  const [bom, setBOM] = useState<SurgeryBOM | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBOM();
  }, [surgeryId]);

  const fetchBOM = async () => {
    try {
      const response = await fetch(`/api/surgeries/${surgeryId}/bom`);
      if (response.ok) {
        const data = await response.json();
        setBOM(data);
      }
    } catch (error) {
      console.error('Failed to fetch BOM:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!bom) return;

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(46, 187, 112);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL OF MATERIALS (BOM)', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('University of Nigeria Teaching Hospital Ituku Ozalla', pageWidth / 2, 25, {
      align: 'center',
    });
    doc.text('Theatre Management System', pageWidth / 2, 32, { align: 'center' });

    // Document info
    let yPos = 50;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, yPos);
    doc.text(`BOM ID: ${bom.id.substring(0, 8).toUpperCase()}`, pageWidth - 14, yPos, {
      align: 'right',
    });

    // Patient & Surgery Information
    yPos += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos, pageWidth - 28, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PATIENT & SURGERY INFORMATION', 18, yPos + 5);

    yPos += 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const patientInfo = [
      ['Patient Name:', bom.patient.name],
      ['Folder Number:', bom.patient.folderNumber],
      ['Age/Gender:', `${bom.patient.age} years / ${bom.patient.gender}`],
      ['Procedure:', bom.procedureName],
      ['Surgeon:', bom.surgeon?.fullName || 'Not assigned'],
      ['Unit/Department:', bom.unit],
      ['Surgery Date:', new Date(bom.scheduledDate).toLocaleDateString('en-GB')],
      ['Status:', bom.status],
    ];

    patientInfo.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 18, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value, 80, yPos);
      yPos += 6;
    });

    // Materials/Consumables Table
    yPos += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos, pageWidth - 28, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIALS & CONSUMABLES BREAKDOWN', 18, yPos + 5);

    yPos += 12;

    const tableData = bom.items.map((item, index) => [
      (index + 1).toString(),
      item.item.name,
      item.item.category,
      item.quantity.toString(),
      `₦${item.unitCost.toLocaleString()}`,
      `₦${item.totalCost.toLocaleString()}`,
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Item Name', 'Category', 'Qty', 'Unit Cost', 'Total Cost']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [46, 187, 112],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 60 },
        2: { cellWidth: 30 },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 35, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Cost Summary Box
    const boxHeight = 50;
    doc.setFillColor(255, 252, 240);
    doc.setDrawColor(255, 199, 0);
    doc.setLineWidth(1);
    doc.rect(14, yPos, pageWidth - 28, boxHeight, 'FD');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('COST SUMMARY', pageWidth / 2, yPos + 8, { align: 'center' });

    yPos += 18;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    const subtotal = bom.items.reduce((sum, item) => sum + item.totalCost, 0);
    const markup = subtotal * 0.1;
    const total = bom.totalItemsCost || subtotal + markup;

    doc.text('Subtotal (Cost):', 20, yPos);
    doc.text(`₦${subtotal.toLocaleString()}`, pageWidth - 20, yPos, { align: 'right' });

    yPos += 8;
    doc.text('Markup (10%):', 20, yPos);
    doc.setTextColor(255, 140, 0);
    doc.text(`₦${markup.toLocaleString()}`, pageWidth - 20, yPos, { align: 'right' });

    yPos += 2;
    doc.setDrawColor(100, 100, 100);
    doc.line(20, yPos, pageWidth - 20, yPos);

    yPos += 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL COST:', 20, yPos);
    doc.setTextColor(46, 187, 112);
    doc.text(`₦${total.toLocaleString()}`, pageWidth - 20, yPos, { align: 'right' });

    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Patient Charge:', 20, yPos);
    doc.setTextColor(46, 147, 255);
    doc.text(`₦${(bom.patientCharge || total).toLocaleString()}`, pageWidth - 20, yPos, {
      align: 'right',
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(8);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(
        `Surgery BOM Report - Page ${i} of ${pageCount} - Confidential Document`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save
    const fileName = `BOM_${bom.patient.folderNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const printBOM = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading BOM...</p>
        </div>
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="text-center py-12">
        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h2 className="text-2xl font-bold">BOM not found</h2>
        <p className="text-gray-600 mt-2">No consumables recorded for this surgery</p>
        <Link href="/dashboard/surgeries" className="btn-primary mt-4 inline-block">
          Back to Surgeries
        </Link>
      </div>
    );
  }

  const subtotal = bom.items.reduce((sum, item) => sum + item.totalCost, 0);
  const markup = subtotal * 0.1;
  const total = bom.totalItemsCost || subtotal + markup;
  const profitMargin = total > 0 ? ((markup / total) * 100).toFixed(2) : 0;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header - Hide on print */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/surgeries/${surgeryId}`}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Bill of Materials (BOM)</h1>
            <p className="text-gray-600 mt-1">Detailed cost breakdown for surgery</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={printBOM} className="btn-secondary flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Print
          </button>
          <button onClick={exportToPDF} className="btn-primary flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Print Header - Show only on print */}
      <div className="hidden print:block">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary-900">
            University of Nigeria Teaching Hospital Ituku Ozalla
          </h1>
          <h2 className="text-xl font-semibold text-gray-800 mt-2">
            BILL OF MATERIALS (BOM) REPORT
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Generated: {new Date().toLocaleString('en-GB')}
          </p>
        </div>
      </div>

      {/* Document Info */}
      <div className="card print:border print:shadow-none">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">BOM ID:</span>
            <span className="ml-2 font-mono font-semibold">
              {bom.id.substring(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="text-right">
            <span className="text-gray-600">Date:</span>
            <span className="ml-2 font-semibold">{new Date().toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </div>

      {/* Patient & Surgery Information */}
      <div className="card print:border print:shadow-none">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary-600" />
          Patient & Surgery Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Patient Name</label>
              <p className="font-semibold text-gray-900">{bom.patient.name}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Folder Number</label>
              <p className="font-semibold text-gray-900">{bom.patient.folderNumber}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Age / Gender</label>
              <p className="font-semibold text-gray-900">
                {bom.patient.age} years / {bom.patient.gender}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Surgery Date</label>
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date(bom.scheduledDate).toLocaleDateString('en-GB')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Procedure</label>
              <p className="font-semibold text-gray-900">{bom.procedureName}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Surgeon</label>
              <p className="font-semibold text-gray-900">{bom.surgeon?.fullName || 'Not assigned'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Unit/Department</label>
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                {bom.unit}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Status</label>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                  bom.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-800'
                    : bom.status === 'IN_PROGRESS'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {bom.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:grid-cols-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 print:border">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{bom.items.length}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 print:border">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-gray-600">Subtotal</p>
              <p className="text-2xl font-bold text-gray-900">₦{subtotal.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-orange-50 to-orange-100 print:border">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-sm text-gray-600">Markup (10%)</p>
              <p className="text-2xl font-bold text-gray-900">₦{markup.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100 print:border">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-gray-600">Profit Margin</p>
              <p className="text-2xl font-bold text-gray-900">{profitMargin}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Materials Breakdown */}
      <div className="card print:border print:shadow-none">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-primary-600" />
          Materials & Consumables Breakdown
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Cost
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bom.items.map((item, index) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {item.item.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                      {item.item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-semibold text-gray-900">{item.quantity}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">
                    ₦{item.unitCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-primary-600">
                      ₦{item.totalCost.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr className="font-semibold">
                <td colSpan={5} className="px-4 py-3 text-right text-sm text-gray-900">
                  Subtotal:
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-900">
                  ₦{subtotal.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="card bg-gradient-to-br from-accent-50 to-primary-50 border-2 border-accent-300 print:border-2">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary-600" />
          Cost Summary
        </h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center pb-3">
            <span className="text-lg text-gray-700">Subtotal (Material Cost):</span>
            <span className="text-2xl font-semibold text-gray-900">
              ₦{subtotal.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center pb-3">
            <span className="text-lg text-gray-700">Markup (10%):</span>
            <span className="text-2xl font-semibold text-orange-600">
              ₦{markup.toLocaleString()}
            </span>
          </div>

          <div className="border-t-2 border-primary-300 pt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-2xl font-bold text-gray-900">TOTAL COST:</span>
              <span className="text-3xl font-bold text-primary-600">
                ₦{total.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-secondary-200">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-700">Patient Charge:</span>
              <span className="text-2xl font-bold text-secondary-600">
                ₦{(bom.patientCharge || total).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="card print:border print:shadow-none print:break-inside-avoid">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Cost by Category</h2>

        <div className="space-y-3">
          {Object.entries(
            bom.items.reduce((acc, item) => {
              const category = item.item.category;
              if (!acc[category]) {
                acc[category] = { count: 0, total: 0 };
              }
              acc[category].count += item.quantity;
              acc[category].total += item.totalCost;
              return acc;
            }, {} as Record<string, { count: number; total: number }>)
          ).map(([category, data]) => {
            const percentage = ((data.total / subtotal) * 100).toFixed(1);
            return (
              <div key={category} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{category}</span>
                    <span className="text-sm text-gray-600">
                      {data.count} items · ₦{data.total.toLocaleString()} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Note - Print only */}
      <div className="hidden print:block text-center text-sm text-gray-600 mt-8 pt-4 border-t">
        <p>This is an official document from UNTH Ituku Ozalla Theatre Management System</p>
        <p className="mt-1">For official use only - Confidential</p>
      </div>
    </div>
  );
}
