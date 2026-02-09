'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Truck, 
  Search, 
  Plus, 
  Package,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Filter,
  ArrowRight,
  Store
} from 'lucide-react';

interface Transfer {
  id: string;
  transferDate: string;
  transferType: string;
  toSubStore: {
    id: string;
    theatreNumber: string;
    itemName: string;
  };
  sourceTheatreNumber?: string;
  destTheatreNumber?: string;
  itemName: string;
  quantityTransferred: number;
  unit: string;
  status: string;
  fromMainStore: boolean;
  requestedBy: {
    id: string;
    fullName: string;
  };
  approvedBy?: {
    id: string;
    fullName: string;
  };
  approvedAt?: string;
  issuedBy?: {
    id: string;
    fullName: string;
  };
  issuedAt?: string;
  receivedBy?: {
    id: string;
    fullName: string;
  };
  receivedAt?: string;
  notes?: string;
}

interface TransferSummary {
  totalTransfers: number;
  pendingApproval: number;
  pendingIssue: number;
  pendingReceive: number;
  completed: number;
  cancelled: number;
  mainToSubstore: number;
  interSubstore: number;
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [summary, setSummary] = useState<TransferSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const theatres = [
    'THEATRE_1', 'THEATRE_2', 'THEATRE_3', 'THEATRE_4', 'THEATRE_5',
    'THEATRE_6', 'THEATRE_7', 'THEATRE_8', 'THEATRE_9', 'THEATRE_10',
    'THEATRE_11', 'THEATRE_12', 'THEATRE_13'
  ];

  const statuses = ['REQUESTED', 'APPROVED', 'ISSUED', 'RECEIVED', 'CANCELLED'];

  useEffect(() => {
    fetchTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTheatre, selectedStatus, searchTerm]);

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedTheatre) params.set('theatre', selectedTheatre);
      if (selectedStatus) params.set('status', selectedStatus);
      if (searchTerm) params.set('search', searchTerm);

      const response = await fetch(`/api/sub-stores/transfers?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setTransfers(data.transfers || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error('Error fetching transfers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1"><Clock className="w-3 h-3" />Requested</span>;
      case 'APPROVED':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Approved</span>;
      case 'ISSUED':
        return <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 flex items-center gap-1"><Truck className="w-3 h-3" />Issued</span>;
      case 'RECEIVED':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Received</span>;
      case 'CANCELLED':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 flex items-center gap-1"><XCircle className="w-3 h-3" />Cancelled</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const handleStatusUpdate = async (transferId: string, action: string) => {
    try {
      const response = await fetch('/api/sub-stores/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferId, action })
      });

      if (response.ok) {
        fetchTransfers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update transfer');
      }
    } catch (error) {
      console.error('Error updating transfer:', error);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/sub-stores" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Truck className="w-8 h-8 text-primary-600" />
              Stock Transfers
            </h1>
            <p className="text-gray-600 mt-1">
              Manage transfers from main store &amp; between theatre sub-stores
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/sub-stores/transfers/new"
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Transfer
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-gray-900">{summary.totalTransfers}</div>
            <div className="text-sm text-gray-600">Total Transfers</div>
          </div>
          <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
            <div className="text-2xl font-bold text-yellow-700">{summary.pendingApproval}</div>
            <div className="text-sm text-yellow-600">Pending Approval</div>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
            <div className="text-2xl font-bold text-blue-700">{summary.pendingIssue}</div>
            <div className="text-sm text-blue-600">Pending Issue</div>
          </div>
          <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
            <div className="text-2xl font-bold text-purple-700">{summary.pendingReceive}</div>
            <div className="text-sm text-purple-600">Pending Receive</div>
          </div>
          <div className="bg-green-50 rounded-lg border border-green-200 p-4">
            <div className="text-2xl font-bold text-green-700">{summary.completed}</div>
            <div className="text-sm text-green-600">Completed</div>
          </div>
          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
            <div className="text-2xl font-bold text-red-700">{summary.cancelled}</div>
            <div className="text-sm text-red-600">Cancelled</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search transfers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          <select
            value={selectedTheatre}
            onChange={(e) => setSelectedTheatre(e.target.value)}
            className="input-field w-auto"
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
            className="input-field w-auto"
            title="Filter by status"
          >
            <option value="">All Statuses</option>
            {statuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={fetchTransfers}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Transfers List */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading transfers...
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No transfers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(transfer.transferDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {transfer.transferType === 'SUBSTORE_TO_SUBSTORE' ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800 flex items-center gap-1 w-fit">
                          <ArrowRight className="w-3 h-3" />Inter-Store
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-teal-100 text-teal-800 flex items-center gap-1 w-fit">
                          <Store className="w-3 h-3" />Main Store
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{transfer.itemName}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transfer.transferType === 'SUBSTORE_TO_SUBSTORE' ? (
                        <span>{transfer.sourceTheatreNumber?.replace('_', ' ')} → {transfer.destTheatreNumber?.replace('_', ' ')}</span>
                      ) : (
                        <span>Main Store → {transfer.destTheatreNumber?.replace('_', ' ') || transfer.toSubStore?.theatreNumber?.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transfer.quantityTransferred} {transfer.unit}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getStatusBadge(transfer.status)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transfer.requestedBy?.fullName || 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {transfer.status === 'REQUESTED' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(transfer.id, 'APPROVE')}
                              className="text-green-600 hover:text-green-800"
                              title="Approve (Theatre Manager only)"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(transfer.id, 'CANCEL')}
                              className="text-red-600 hover:text-red-800"
                              title="Cancel"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        {transfer.status === 'APPROVED' && (
                          <button
                            onClick={() => handleStatusUpdate(transfer.id, 'ISSUE')}
                            className="text-blue-600 hover:text-blue-800"
                            title="Mark as Issued"
                          >
                            <Truck className="w-5 h-5" />
                          </button>
                        )}
                        {transfer.status === 'ISSUED' && (
                          <button
                            onClick={() => handleStatusUpdate(transfer.id, 'RECEIVE')}
                            className="text-green-600 hover:text-green-800"
                            title="Confirm Receipt"
                          >
                            <Store className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
