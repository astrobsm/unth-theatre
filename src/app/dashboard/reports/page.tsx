'use client';

import { useState } from 'react';
import { FileText, Download, Calendar, TrendingUp, BarChart3, AlertCircle, DollarSign } from 'lucide-react';
import { generateWeeklyPDF, generateMonthlyPDF } from '@/lib/pdfGenerator';
import Link from 'next/link';

export default function ReportsPage() {
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateWeeklyReport = async () => {
    if (!weekStart || !weekEnd) {
      setError('Please select both week start and end dates');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/analytics/weekly?weekStart=${weekStart}&weekEnd=${weekEnd}`);
      if (response.ok) {
        const data = await response.json();
        const pdf = await generateWeeklyPDF({
          weekStart,
          weekEnd,
          ...data,
        });
        pdf.save(`Theatre_Weekly_Report_${weekStart}_to_${weekEnd}.pdf`);
      } else {
        setError('Failed to fetch weekly data');
      }
    } catch (error) {
      setError('An error occurred while generating the report');
    } finally {
      setLoading(false);
    }
  };

  const generateMonthlyReport = async () => {
    if (!month) {
      setError('Please select a month');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/analytics/monthly?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        const pdf = await generateMonthlyPDF({
          month,
          ...data,
        });
        pdf.save(`Theatre_Monthly_Report_${month}.pdf`);
      } else {
        setError('Failed to fetch monthly data');
      }
    } catch (error) {
      setError('An error occurred while generating the report');
    } finally {
      setLoading(false);
    }
  };

  const setCurrentWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    setWeekStart(monday.toISOString().split('T')[0]);
    setWeekEnd(sunday.toISOString().split('T')[0]);
  };

  const setCurrentMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const monthNum = String(today.getMonth() + 1).padStart(2, '0');
    setMonth(`${year}-${monthNum}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-gray-600 mt-1">Generate and export theatre performance reports</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BOM Analytics Card - New! */}
        <div className="card bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center shadow-lg">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">BOM Analytics</h2>
              <p className="text-sm text-gray-600">Surgery cost analysis & trends</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-white rounded-lg shadow-sm">
              <p className="text-sm font-semibold text-purple-900 mb-2">Analytics Include:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Total surgery costs breakdown</li>
                <li>• Cost by category analysis</li>
                <li>• Unit/department comparison</li>
                <li>• Monthly cost trends</li>
                <li>• Recent surgery costs</li>
              </ul>
            </div>

            <Link
              href="/dashboard/reports/bom"
              className="btn-primary w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <BarChart3 className="w-5 h-5" />
              View BOM Analytics
            </Link>
          </div>
        </div>

        {/* Weekly Report */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Weekly Summary Report</h2>
              <p className="text-sm text-gray-600">Performance breakdown by day and unit</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Week Start Date</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Week End Date</label>
              <input
                type="date"
                value={weekEnd}
                onChange={(e) => setWeekEnd(e.target.value)}
                className="input-field"
              />
            </div>

            <button
              onClick={setCurrentWeek}
              className="btn-secondary w-full text-sm"
            >
              Set Current Week
            </button>

            <button
              onClick={generateWeeklyReport}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              {loading ? 'Generating...' : 'Generate Weekly Report'}
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 mb-2">Report Includes:</p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Unit performance summary</li>
              <li>• Daily breakdown of surgeries</li>
              <li>• Completion and cancellation rates</li>
              <li>• Overall weekly statistics</li>
            </ul>
          </div>
        </div>

        {/* Monthly Report */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Monthly Analytics Report</h2>
              <p className="text-sm text-gray-600">Comprehensive monthly performance metrics</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Select Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input-field"
              />
            </div>

            <button
              onClick={setCurrentMonth}
              className="btn-secondary w-full text-sm"
            >
              Set Current Month
            </button>

            <button
              onClick={generateMonthlyReport}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              {loading ? 'Generating...' : 'Generate Monthly Report'}
            </button>
          </div>

          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <p className="text-sm font-semibold text-green-900 mb-2">Report Includes:</p>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• Unit-by-unit performance analysis</li>
              <li>• Weekly trends throughout the month</li>
              <li>• Total costs and revenue metrics</li>
              <li>• Success rates and efficiency KPIs</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sample Reports Preview */}
      <div className="card bg-gradient-to-r from-primary-50 to-secondary-50">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-8 h-8 text-primary-600" />
          <h2 className="text-xl font-semibold text-gray-900">Report Features</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold text-gray-900">Professional Format</h3>
            </div>
            <p className="text-sm text-gray-600">
              PDF reports with UNTH branding, formatted tables, and clear data visualization
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Performance Metrics</h3>
            </div>
            <p className="text-sm text-gray-600">
              Detailed statistics including completion rates, cancellation analysis, and cost breakdowns
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Flexible Periods</h3>
            </div>
            <p className="text-sm text-gray-600">
              Generate reports for any week or month to track trends and compare performance
            </p>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-800">
            <p className="font-semibold mb-1">Usage Tips</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Weekly reports work best for operational review meetings</li>
              <li>Monthly reports are ideal for management presentations and audits</li>
              <li>Reports are generated in PDF format and download automatically</li>
              <li>All data is pulled in real-time from the database</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
