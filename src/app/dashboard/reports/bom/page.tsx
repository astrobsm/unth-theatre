'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  Calendar,
  BarChart3,
  Download,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BOMAnalytics {
  totalSurgeries: number;
  totalCost: number;
  averageCostPerSurgery: number;
  totalItems: number;
  costByCategory: {
    category: string;
    totalCost: number;
    itemCount: number;
  }[];
  costByUnit: {
    unit: string;
    totalCost: number;
    surgeryCount: number;
    averageCost: number;
  }[];
  recentSurgeries: {
    id: string;
    procedureName: string;
    patient: { name: string };
    scheduledDate: string;
    totalItemsCost: number;
    itemCount: number;
  }[];
  monthlyTrend: {
    month: string;
    totalCost: number;
    surgeryCount: number;
  }[];
}

export default function BOMAnalyticsPage() {
  const [analytics, setAnalytics] = useState<BOMAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30'); // days
  const [selectedUnit, setSelectedUnit] = useState('ALL');

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, selectedUnit]);

  const fetchAnalytics = async () => {
    try {
      const params = new URLSearchParams({
        days: dateRange,
        ...(selectedUnit !== 'ALL' && { unit: selectedUnit }),
      });
      const response = await fetch(`/api/analytics/bom?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = () => {
    if (!analytics) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(46, 187, 112);
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('BOM ANALYTICS REPORT', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('University of Nigeria Teaching Hospital Ituku Ozalla', pageWidth / 2, 25, {
      align: 'center',
    });

    // Summary Stats
    let yPos = 45;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('OVERVIEW', 14, yPos);

    yPos += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const summaryData = [
      ['Total Surgeries', analytics.totalSurgeries.toString()],
      ['Total Cost', `₦${analytics.totalCost.toLocaleString()}`],
      ['Average Cost/Surgery', `₦${analytics.averageCostPerSurgery.toLocaleString()}`],
      ['Total Items Used', analytics.totalItems.toString()],
      ['Period', `Last ${dateRange} days`],
      ['Generated', new Date().toLocaleString('en-GB')],
    ];

    summaryData.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', 14, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value, 80, yPos);
      yPos += 6;
    });

    // Cost by Category
    yPos += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('COST BY CATEGORY', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Items', 'Total Cost', 'Percentage']],
      body: analytics.costByCategory.map((cat) => [
        cat.category,
        cat.itemCount.toString(),
        `₦${cat.totalCost.toLocaleString()}`,
        `${((cat.totalCost / analytics.totalCost) * 100).toFixed(1)}%`,
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [46, 187, 112],
        textColor: [255, 255, 255],
      },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Cost by Unit
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('COST BY UNIT/DEPARTMENT', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Unit', 'Surgeries', 'Total Cost', 'Avg Cost']],
      body: analytics.costByUnit.map((unit) => [
        unit.unit,
        unit.surgeryCount.toString(),
        `₦${unit.totalCost.toLocaleString()}`,
        `₦${unit.averageCost.toLocaleString()}`,
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [46, 147, 255],
        textColor: [255, 255, 255],
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
        `BOM Analytics - Page ${i} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    doc.save(`BOM_Analytics_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h2 className="text-2xl font-bold">No data available</h2>
        <p className="text-gray-600 mt-2">No surgery BOM data found for the selected period</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BOM Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Cost analysis and trends for surgical consumables</p>
        </div>
        <button onClick={exportReport} className="btn-primary flex items-center gap-2">
          <Download className="w-5 h-5" />
          Export Report
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Time Period</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="input-field"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="180">Last 6 months</option>
                <option value="365">Last year</option>
              </select>
            </div>
            <div>
              <label className="label">Unit/Department</label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="input-field"
              >
                <option value="ALL">All Units</option>
                {analytics.costByUnit.map((unit) => (
                  <option key={unit.unit} value={unit.unit}>
                    {unit.unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            <h3 className="text-sm font-medium text-gray-600">Total Surgeries</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics.totalSurgeries}</p>
          <p className="text-sm text-gray-600 mt-1">Last {dateRange} days</p>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-8 h-8 text-green-600" />
            <h3 className="text-sm font-medium text-gray-600">Total Cost</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ₦{analytics.totalCost.toLocaleString()}
          </p>
          <p className="text-sm text-gray-600 mt-1">All consumables</p>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8 text-purple-600" />
            <h3 className="text-sm font-medium text-gray-600">Average Cost</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ₦{analytics.averageCostPerSurgery.toLocaleString()}
          </p>
          <p className="text-sm text-gray-600 mt-1">Per surgery</p>
        </div>

        <div className="card bg-gradient-to-br from-orange-50 to-orange-100">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-8 h-8 text-orange-600" />
            <h3 className="text-sm font-medium text-gray-600">Total Items</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics.totalItems}</p>
          <p className="text-sm text-gray-600 mt-1">Consumables used</p>
        </div>
      </div>

      {/* Cost by Category */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Cost Breakdown by Category</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Items
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Total Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  % of Total
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Distribution
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analytics.costByCategory.map((category) => {
                const percentage = ((category.totalCost / analytics.totalCost) * 100).toFixed(1);
                return (
                  <tr key={category.category} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">
                        {category.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-900">{category.itemCount}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-primary-600">
                        ₦{category.totalCost.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-900">{percentage}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost by Unit */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Cost Analysis by Unit/Department</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Unit
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Surgeries
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Total Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Average Cost
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analytics.costByUnit.map((unit) => (
                <tr key={unit.unit} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{unit.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                      {unit.surgeryCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-primary-600">
                      ₦{unit.totalCost.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-900">
                      ₦{unit.averageCost.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Surgeries */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Surgery Costs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Procedure
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Items
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Total Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analytics.recentSurgeries.map((surgery) => (
                <tr key={surgery.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">
                      {surgery.patient.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{surgery.procedureName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">
                      {new Date(surgery.scheduledDate).toLocaleDateString('en-GB')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-gray-900">{surgery.itemCount}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-primary-600">
                      ₦{surgery.totalItemsCost.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/surgeries/${surgery.id}/bom`}
                      className="text-sm text-secondary-600 hover:text-secondary-800 font-medium"
                    >
                      View BOM →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Trend */}
      {analytics.monthlyTrend.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Monthly Cost Trend</h2>
          <div className="space-y-4">
            {analytics.monthlyTrend.map((month) => {
              const avgCost = month.totalCost / month.surgeryCount;
              return (
                <div key={month.month} className="border-b border-gray-200 pb-4 last:border-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-900">{month.month}</span>
                    <div className="text-right">
                      <span className="text-lg font-bold text-primary-600">
                        ₦{month.totalCost.toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        ({month.surgeryCount} surgeries · ₦{avgCost.toLocaleString()} avg)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-primary-500 to-secondary-500 h-3 rounded-full"
                      style={{
                        width: `${(month.totalCost / Math.max(...analytics.monthlyTrend.map((m) => m.totalCost))) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
