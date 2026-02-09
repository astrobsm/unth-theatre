'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ClipboardList, 
  Search, 
  Plus, 
  Package,
  User,
  Calendar,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Filter,
  FileText
} from 'lucide-react';

interface UsageLog {
  id: string;
  subStoreId: string;
  theatreNumber: string;
  itemName: string;
  itemCategory: string;
  quantityUsed: number;
  quantityReturned: number;
  quantityWasted: number;
  unit: string;
  surgeryId?: string;
  surgeryName?: string;
  patientName?: string;
  patientFolderNumber?: string;
  usedByName: string;
  usedAt: string;
  returnedAt?: string;
  usageNotes?: string;
  returnNotes?: string;
  wasteReason?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  usageStatus: string;
}

interface UsageSummary {
  totalUsageLogs: number;
  totalItemsUsed: number;
  totalReturned: number;
  totalWasted: number;
  pendingVerification: number;
}

export default function SubStoreUsagePage() {
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);

  const theatres = [
    'THEATRE_1', 'THEATRE_2', 'THEATRE_3', 'THEATRE_4', 'THEATRE_5',
    'THEATRE_6', 'THEATRE_7', 'THEATRE_8', 'THEATRE_9', 'THEATRE_10',
    'THEATRE_11', 'THEATRE_12', 'THEATRE_13'
  ];

  useEffect(() => {
    fetchUsageLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTheatre, selectedStatus, dateFrom, dateTo, searchTerm]);

  const fetchUsageLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedTheatre) params.set('theatre', selectedTheatre);
      if (selectedStatus) params.set('status', selectedStatus);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (searchTerm) params.set('search', searchTerm);

      const response = await fetch(`/api/sub-stores/usage?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setUsageLogs(data.usageLogs || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error('Error fetching usage logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'USED':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">Used</span>;
      case 'PARTIALLY_RETURNED':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Partial Return</span>;
      case 'FULLY_RETURNED':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Returned</span>;
      case 'WASTED':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Wasted</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/sub-stores" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-primary-600" />
              Sub-Store Usage Logs
            </h1>
            <p className="text-gray-600 mt-1">
              Track consumable usage during surgeries
            </p>
          </div>
        </div>
        <Link 
          href="/dashboard/sub-stores/usage/new" 
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Log Usage
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="card p-4">
            <p className="text-sm text-gray-600">Total Logs</p>
            <p className="text-2xl font-bold text-gray-900">{summary.totalUsageLogs}</p>
          </div>
          <div className="card p-4 bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-700">Items Used</p>
            <p className="text-2xl font-bold text-blue-800">{summary.totalItemsUsed}</p>
          </div>
          <div className="card p-4 bg-green-50 border-green-200">
            <p className="text-sm text-green-700">Returned</p>
            <p className="text-2xl font-bold text-green-800">{summary.totalReturned}</p>
          </div>
          <div className="card p-4 bg-red-50 border-red-200">
            <p className="text-sm text-red-700">Wasted</p>
            <p className="text-2xl font-bold text-red-800">{summary.totalWasted}</p>
          </div>
          <div className="card p-4 bg-yellow-50 border-yellow-200">
            <p className="text-sm text-yellow-700">Pending Verify</p>
            <p className="text-2xl font-bold text-yellow-800">{summary.pendingVerification}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search items, patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select
            value={selectedTheatre}
            onChange={(e) => setSelectedTheatre(e.target.value)}
            className="input-field"
            title="Filter by theatre"
          >
            <option value="">All Theatres</option>
            {theatres.map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input-field"
            title="Filter by usage status"
          >
            <option value="">All Status</option>
            <option value="USED">Used</option>
            <option value="PARTIALLY_RETURNED">Partial Return</option>
            <option value="FULLY_RETURNED">Returned</option>
            <option value="WASTED">Wasted</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input-field"
            placeholder="From Date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-field"
            placeholder="To Date"
          />
        </div>
      </div>

      {/* Usage Logs Table */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading usage logs...</p>
        </div>
      ) : usageLogs.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Usage Logs Found</h3>
          <p className="text-gray-500 mb-4">Start logging consumable usage during surgeries</p>
          <Link href="/dashboard/sub-stores/usage/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Log First Usage
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Theatre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgery/Patient</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Used</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Returned</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Wasted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Logged By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usageLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {log.theatreNumber?.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{log.itemName}</div>
                      <div className="text-xs text-gray-500">{log.itemCategory}</div>
                    </td>
                    <td className="px-4 py-3">
                      {log.patientName ? (
                        <div>
                          <div className="text-sm text-gray-900">{log.patientName}</div>
                          <div className="text-xs text-gray-500">{log.patientFolderNumber}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No patient linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-blue-600">{log.quantityUsed}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-green-600">{log.quantityReturned}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-red-600">{log.quantityWasted}</span>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(log.usageStatus)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.usedByName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(log.usedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {log.verifiedAt ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
