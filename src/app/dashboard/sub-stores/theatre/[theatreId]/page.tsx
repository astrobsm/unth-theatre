'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Store, 
  Package, 
  Plus, 
  Search, 
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingDown,
  Clock,
  Clipboard
} from 'lucide-react';

interface SubStoreItem {
  id: string;
  theatreNumber: string;
  theatreName?: string;
  itemName: string;
  itemCode?: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  maximumStock: number;
  unit: string;
  unitPrice?: number;
  stockStatus: string;
  lastRestocked?: string;
  lastUsed?: string;
  managedBy?: {
    id: string;
    fullName: string;
    staffCode?: string;
  } | null;
  batchNumber?: string;
  expiryDate?: string;
  morningCheckDone: boolean;
  morningCheckDate?: string;
  endOfDayCheckDone: boolean;
  endOfDayCheckDate?: string;
}

export default function TheatreSubStorePage() {
  const params = useParams();
  const theatreId = params.theatreId as string;
  
  const [items, setItems] = useState<SubStoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const categories = ['CONSUMABLE', 'DEVICE', 'MEDICATION', 'EQUIPMENT', 'SUTURES', 'GLOVES', 'IV_SUPPLIES'];
  const stockStatuses = ['ADEQUATE', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'];

  const theatreNames: Record<string, string> = {
    'THEATRE_1': 'Theatre 1 - General Surgery',
    'THEATRE_2': 'Theatre 2 - Orthopaedics',
    'THEATRE_3': 'Theatre 3 - Neurosurgery',
    'THEATRE_4': 'Theatre 4 - Cardiothoracic',
    'THEATRE_5': 'Theatre 5 - Urology',
    'THEATRE_6': 'Theatre 6 - OB-GYN',
    'THEATRE_7': 'Theatre 7 - Paediatric',
    'THEATRE_8': 'Theatre 8 - ENT',
    'THEATRE_9': 'Theatre 9 - Ophthalmology',
    'THEATRE_10': 'Theatre 10 - Dental/Maxillofacial',
    'THEATRE_11': 'Theatre 11 - Plastic Surgery',
    'THEATRE_12': 'Theatre 12 - Emergency',
    'THEATRE_13': 'Theatre 13 - Minor Procedures',
  };

  useEffect(() => {
    if (theatreId) {
      fetchItems();
    }
  }, [theatreId, selectedCategory, selectedStatus, searchTerm]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('theatre', theatreId);
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedStatus) params.set('stockStatus', selectedStatus);
      if (searchTerm) params.set('search', searchTerm);

      const response = await fetch(`/api/sub-stores?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.subStores || []);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ADEQUATE': return 'bg-green-100 text-green-800 border-green-200';
      case 'LOW': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'CRITICAL': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'OUT_OF_STOCK': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ADEQUATE': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'LOW': return <TrendingDown className="w-4 h-4 text-yellow-600" />;
      case 'CRITICAL': return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case 'OUT_OF_STOCK': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const summary = {
    total: items.length,
    adequate: items.filter(i => i.stockStatus === 'ADEQUATE').length,
    low: items.filter(i => i.stockStatus === 'LOW').length,
    critical: items.filter(i => i.stockStatus === 'CRITICAL').length,
    outOfStock: items.filter(i => i.stockStatus === 'OUT_OF_STOCK').length,
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
              <Store className="w-8 h-8 text-primary-600" />
              {theatreNames[theatreId] || theatreId.replace('_', ' ')}
            </h1>
            <p className="text-gray-600 mt-1">
              Sub-store inventory for this theatre
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link 
            href={`/dashboard/sub-stores/usage/new?theatre=${theatreId}`}
            className="btn-secondary flex items-center gap-2"
          >
            <Clipboard className="w-5 h-5" />
            Log Usage
          </Link>
          <Link 
            href="/dashboard/sub-stores/new"
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-sm text-gray-600">Total Items</p>
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
        </div>
        <div className="card p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-700">Adequate</p>
          <p className="text-2xl font-bold text-green-800">{summary.adequate}</p>
        </div>
        <div className="card p-4 bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-700">Low Stock</p>
          <p className="text-2xl font-bold text-yellow-800">{summary.low}</p>
        </div>
        <div className="card p-4 bg-orange-50 border-orange-200">
          <p className="text-sm text-orange-700">Critical</p>
          <p className="text-2xl font-bold text-orange-800">{summary.critical}</p>
        </div>
        <div className="card p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">Out of Stock</p>
          <p className="text-2xl font-bold text-red-800">{summary.outOfStock}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input-field"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input-field"
          >
            <option value="">All Status</option>
            {stockStatuses.map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <button
            onClick={fetchItems}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading items...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Items Found</h3>
            <p className="text-gray-500 mb-4">
              {searchTerm || selectedCategory || selectedStatus
                ? 'Try adjusting your filters'
                : 'No items in this theatre sub-store yet'}
            </p>
            <Link href="/dashboard/sub-stores/new" className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add First Item
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Managed By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{item.itemName}</p>
                        {item.itemCode && (
                          <p className="text-xs text-gray-500">{item.itemCode}</p>
                        )}
                        {item.batchNumber && (
                          <p className="text-xs text-gray-400">Batch: {item.batchNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100">
                        {item.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-semibold">{item.currentStock}</span>
                      <span className="text-gray-500 text-sm"> / {item.maximumStock} {item.unit}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.stockStatus)}`}>
                        {getStatusIcon(item.stockStatus)}
                        {item.stockStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-700">
                        {item.managedBy?.fullName || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {item.expiryDate ? (
                        <span className={`text-sm ${
                          new Date(item.expiryDate) < new Date() 
                            ? 'text-red-600 font-medium' 
                            : 'text-gray-600'
                        }`}>
                          {new Date(item.expiryDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Link
                        href={`/dashboard/sub-stores/usage/new?item=${item.id}`}
                        className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                      >
                        Log Use
                      </Link>
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
