'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Package, 
  Plus, 
  MapPin, 
  Clock, 
  User,
  Calendar,
  Filter,
  TrendingUp,
  AlertCircle,
  Download,
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TheatreSetup {
  id: string;
  setupDate: string;
  collectionTime: string;
  status: string;
  theatre: {
    name: string;
    location: string;
  };
  nurse: {
    fullName: string;
  };
  location: string | null;
  spiritQuantity: number;
  savlonQuantity: number;
  povidoneQuantity: number;
  faceMaskQuantity: number;
  nursesCapQuantity: number;
  cssdGauzeQuantity: number;
  cssdCottonQuantity: number;
  surgicalBladesQuantity: number;
  suctionTubbingsQuantity: number;
  disposablesQuantity: number;
}

export default function TheatreSetupPage() {
  const router = useRouter();
  const [setups, setSetups] = useState<TheatreSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    fetchSetups();
  }, []);

  const fetchSetups = async () => {
    try {
      const response = await fetch('/api/theatre-setup');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setSetups(data);
        } else {
          console.error('API returned non-array data:', data);
          setSetups([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch setups:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = (setup: TheatreSetup) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(46, 187, 112);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('THEATRE SETUP COLLECTION REPORT', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('University of Nigeria Teaching Hospital Ituku Ozalla', pageWidth / 2, 25, {
      align: 'center',
    });
    doc.text('Theatre Management System', pageWidth / 2, 32, { align: 'center' });

    // Document Info
    let yPos = 50;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Setup ID: ${setup.id.substring(0, 8).toUpperCase()}`, 14, yPos);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - 14, yPos, {
      align: 'right',
    });

    // Setup Information
    yPos += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos, pageWidth - 28, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SETUP INFORMATION', 18, yPos + 5);

    yPos += 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const setupInfo = [
      ['Theatre:', setup.theatre.name],
      ['Theatre Location:', setup.theatre.location],
      ['Date:', new Date(setup.setupDate).toLocaleDateString('en-GB')],
      ['Collection Time:', setup.collectionTime],
      ['Nurse:', setup.nurse.fullName],
      ['Status:', setup.status],
      ['Geolocation:', setup.location || 'Not recorded'],
    ];

    setupInfo.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 18, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value, 80, yPos);
      yPos += 6;
    });

    // Materials Collected
    yPos += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos, pageWidth - 28, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIALS COLLECTED', 18, yPos + 5);

    yPos += 12;

    const materials = [
      ['Antiseptics & Disinfectants', ''],
      ['  Methylated Spirit', setup.spiritQuantity],
      ['  Savlon', setup.savlonQuantity],
      ['  Povidone Iodine', setup.povidoneQuantity],
      ['', ''],
      ['Protective Equipment', ''],
      ['  Face Masks', setup.faceMaskQuantity],
      ['  Nurses Caps', setup.nursesCapQuantity],
      ['', ''],
      ['CSSD Supplies', ''],
      ['  Gauze', setup.cssdGauzeQuantity],
      ['  Cotton Wool', setup.cssdCottonQuantity],
      ['', ''],
      ['Surgical Items', ''],
      ['  Surgical Blades', setup.surgicalBladesQuantity],
      ['  Suction Tubbings', setup.suctionTubbingsQuantity],
      ['  Disposables', setup.disposablesQuantity],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Item Category / Name', 'Quantity']],
      body: materials.map(([item, qty]) => [
        item,
        typeof qty === 'number' ? qty.toString() : qty,
      ]),
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
        0: { cellWidth: 140 },
        1: { cellWidth: 30, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        const item = materials[data.row.index]?.[0];
        if (typeof item === 'string' && !item.startsWith('  ') && item !== '') {
          data.cell.styles.fillColor = [230, 230, 230];
          data.cell.styles.fontStyle = 'bold';
        }
        if (typeof item === 'string' && !item.startsWith('  ')) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Summary
    const totalItems = setup.spiritQuantity + setup.savlonQuantity + setup.povidoneQuantity +
      setup.faceMaskQuantity + setup.nursesCapQuantity + setup.cssdGauzeQuantity +
      setup.cssdCottonQuantity + setup.surgicalBladesQuantity + setup.suctionTubbingsQuantity +
      setup.disposablesQuantity;

    doc.setFillColor(255, 252, 240);
    doc.setDrawColor(255, 199, 0);
    doc.setLineWidth(1);
    doc.rect(14, yPos, pageWidth - 28, 20, 'FD');

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL ITEMS COLLECTED:', 20, yPos + 8);
    doc.setTextColor(46, 187, 112);
    doc.setFontSize(16);
    doc.text(totalItems.toString(), pageWidth - 20, yPos + 8, { align: 'right' });

    // Footer
    yPos += 30;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('This is an official document from UNTH Ituku Ozalla Theatre Management System', pageWidth / 2, yPos, {
      align: 'center',
    });
    doc.text('For official use only - Confidential', pageWidth / 2, yPos + 5, {
      align: 'center',
    });

    // Page numbers
    const pageCount = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save
    const fileName = `TheatreSetup_${setup.theatre.name}_${new Date(setup.setupDate).toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const exportAllToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(46, 187, 112);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('THEATRE SETUP SUMMARY REPORT', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('University of Nigeria Teaching Hospital Ituku Ozalla', pageWidth / 2, 25, {
      align: 'center',
    });
    doc.text('Theatre Management System', pageWidth / 2, 32, { align: 'center' });

    // Document Info
    let yPos = 50;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Total Setups: ${filteredSetups.length}`, 14, yPos);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - 14, yPos, {
      align: 'right',
    });

    // Summary Table
    yPos += 10;
    const tableData = filteredSetups.map((setup) => {
      const totalItems = setup.spiritQuantity + setup.savlonQuantity + setup.povidoneQuantity +
        setup.faceMaskQuantity + setup.nursesCapQuantity + setup.cssdGauzeQuantity +
        setup.cssdCottonQuantity + setup.surgicalBladesQuantity + setup.suctionTubbingsQuantity +
        setup.disposablesQuantity;

      return [
        new Date(setup.setupDate).toLocaleDateString('en-GB'),
        setup.collectionTime,
        setup.theatre.name,
        setup.nurse.fullName,
        totalItems.toString(),
        setup.status,
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Time', 'Theatre', 'Nurse', 'Items', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [46, 187, 112],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 35 },
        3: { cellWidth: 45 },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 25, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(8);
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(
        `Theatre Setup Report - Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save
    doc.save(`TheatreSetup_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      COLLECTED: 'bg-blue-100 text-blue-800',
      IN_USE: 'bg-green-100 text-green-800',
      RETURNED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredSetups = setups.filter((setup) => {
    const statusMatch = statusFilter === 'all' || setup.status === statusFilter;
    const dateMatch = !dateFilter || setup.setupDate.startsWith(dateFilter);
    return statusMatch && dateMatch;
  });

  const todaySetups = setups.filter(
    (s) => s.setupDate === new Date().toISOString().split('T')[0]
  ).length;

  const collectedToday = setups.filter(
    (s) =>
      s.setupDate === new Date().toISOString().split('T')[0] &&
      s.status === 'COLLECTED'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Theatre Setup Management</h1>
          <p className="text-gray-600 mt-1">
            Track material collection and stock management for theatre operations
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportAllToPDF}
            disabled={filteredSetups.length === 0}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Export All
          </button>
          <button
            onClick={() => router.push('/dashboard/theatre-setup/new')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Collect Materials
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
          <p className="text-sm text-gray-600 font-medium">Total Setups</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{setups.length}</p>
        </div>
        <div className="card bg-gradient-to-br from-green-50 to-green-100">
          <p className="text-sm text-gray-600 font-medium">Today&apos;s Setups</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{todaySetups}</p>
        </div>
        <div className="card bg-gradient-to-br from-purple-50 to-purple-100">
          <p className="text-sm text-gray-600 font-medium">Collected Today</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{collectedToday}</p>
        </div>
        <div className="card bg-gradient-to-br from-orange-50 to-orange-100">
          <p className="text-sm text-gray-600 font-medium">In Use</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">
            {setups.filter((s) => s.status === 'IN_USE').length}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => router.push('/dashboard/theatre-setup/new')}
          className="card hover:shadow-lg transition-shadow cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Collect Materials</h3>
              <p className="text-sm text-gray-600">Start new theatre setup</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => router.push('/dashboard/theatre-setup/returns')}
          className="card hover:shadow-lg transition-shadow cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Return Materials</h3>
              <p className="text-sm text-gray-600">Process end-of-day returns</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => router.push('/dashboard/theatre-setup/requests')}
          className="card hover:shadow-lg transition-shadow cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Request Extra Items</h3>
              <p className="text-sm text-gray-600">Ask for additional supplies</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All Statuses</option>
              <option value="COLLECTED">Collected</option>
              <option value="IN_USE">In Use</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>
          <div>
            <label className="label">Filter by Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Setups List */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Material Collection Records</h2>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading records...</p>
          </div>
        ) : filteredSetups.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No records found</p>
            <p className="text-sm mt-2">
              {statusFilter !== 'all' || dateFilter
                ? 'Try adjusting your filters'
                : 'Start by collecting materials for a theatre'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Theatre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scrub Nurse
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSetups.map((setup) => {
                  const totalItems =
                    setup.spiritQuantity +
                    setup.savlonQuantity +
                    setup.povidoneQuantity +
                    setup.faceMaskQuantity +
                    setup.nursesCapQuantity +
                    setup.cssdGauzeQuantity +
                    setup.cssdCottonQuantity +
                    setup.surgicalBladesQuantity +
                    setup.suctionTubbingsQuantity +
                    setup.disposablesQuantity;

                  return (
                    <tr key={setup.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {setup.theatre.name}
                        </div>
                        <div className="text-sm text-gray-500">{setup.theatre.location}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{setup.nurse.fullName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {new Date(setup.setupDate).toLocaleDateString('en-GB')}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {new Date(setup.collectionTime).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">{totalItems}</span>
                        <span className="text-sm text-gray-500"> items</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {setup.location ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin className="w-4 h-4 text-green-500" />
                            <span className="text-xs">Tracked</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            setup.status
                          )}`}
                        >
                          {setup.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => router.push(`/dashboard/theatre-setup/${setup.id}`)}
                            className="text-primary-600 hover:text-primary-900 font-medium"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => exportToPDF(setup)}
                            className="text-purple-600 hover:text-purple-900 font-medium flex items-center gap-1"
                            title="Export PDF"
                          >
                            <FileText className="w-4 h-4" />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
