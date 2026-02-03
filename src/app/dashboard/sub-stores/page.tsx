'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Package, 
  Store, 
  Plus, 
  Search, 
  Filter,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingDown,
  ArrowRight,
  RefreshCw,
  BarChart3,
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
  morningCheckDone: boolean;
  morningCheckDate?: string;
  endOfDayCheckDone: boolean;
  endOfDayCheckDate?: string;
}

interface SubStoreSummary {
  totalItems: number;
  totalTheatres: number;
  lowStockItems: number;
  criticalItems: number;
  outOfStock: number;
  adequateItems: number;
  pendingRestocks: number;
  todayUsage: number;
  totalValue: number;
}

export default function SubStoresPage() {
  const [subStores, setSubStores] = useState<SubStoreItem[]>([]);
  const [summary, setSummary] = useState<SubStoreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [groupBy, setGroupBy] = useState<'theatre' | 'category'>('theatre');

  const theatres = [
    'THEATRE_1', 'THEATRE_2', 'THEATRE_3', 'THEATRE_4', 'THEATRE_5',
    'THEATRE_6', 'THEATRE_7', 'THEATRE_8', 'THEATRE_9', 'THEATRE_10',
    'THEATRE_11', 'THEATRE_12', 'THEATRE_13'
  ];

  const categories = ['CONSUMABLE', 'DEVICE', 'MEDICATION', 'EQUIPMENT'];
  const stockStatuses = ['ADEQUATE', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'];

  useEffect(() => {
    fetchSubStores();
  }, [selectedTheatre, selectedCategory, selectedStatus, searchTerm, groupBy]);

  const fetchSubStores = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedTheatre) params.set('theatre', selectedTheatre);
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedStatus) params.set('stockStatus', selectedStatus);
      if (searchTerm) params.set('search', searchTerm);
      if (groupBy) params.set('groupBy', groupBy);

      const response = await fetch(`/api/sub-stores?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setSubStores(data.subStores || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error('Error fetching sub-stores:', error);
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

  // Group items by theatre
  const groupedByTheatre = subStores.reduce((acc: Record<string, SubStoreItem[]>, item) => {
    const theatre = item.theatreNumber;
    if (!acc[theatre]) acc[theatre] = [];
    acc[theatre].push(item);
    return acc;
  }, {});

  // Group items by category
  const groupedByCategory = subStores.reduce((acc: Record<string, SubStoreItem[]>, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Store className="w-8 h-8 text-primary-600" />
            Theatre Sub-Stores
          </h1>
          <p className="text-gray-600 mt-1">
            Manage consumable inventory for each theatre
          </p>
        </div>
        <div className="flex gap-3">
          <Link 
            href="/dashboard/sub-stores/usage" 
            className="btn-secondary flex items-center gap-2"
          >
            <Clipboard className="w-5 h-5" />
            Usage Logs
          </Link>
          <Link 
            href="/dashboard/sub-stores/transfers" 
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Transfers
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
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">{summary.totalItems}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500 opacity-80" />
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Theatres</p>
                <p className="text-2xl font-bold text-gray-900">{summary.totalTheatres}</p>
              </div>
              <Store className="w-8 h-8 text-purple-500 opacity-80" />
            </div>
          </div>
          <div className="card p-4 bg-green-50 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Adequate Stock</p>
                <p className="text-2xl font-bold text-green-800">{summary.adequateItems}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="card p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-700">Low Stock</p>
                <p className="text-2xl font-bold text-yellow-800">{summary.lowStockItems}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          <div className="card p-4 bg-orange-50 border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-700">Critical</p>
                <p className="text-2xl font-bold text-orange-800">{summary.criticalItems}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="card p-4 bg-red-50 border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700">Out of Stock</p>
                <p className="text-2xl font-bold text-red-800">{summary.outOfStock}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            value={selectedTheatre}
            onChange={(e) => setSelectedTheatre(e.target.value)}
            className="input-field"
          >
            <option value="">All Theatres</option>
            {theatres.map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input-field"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
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
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'theatre' | 'category')}
            className="input-field"
          >
            <option value="theatre">Group by Theatre</option>
            <option value="category">Group by Category</option>
          </select>
        </div>
      </div>

      {/* Quick Access - Theatre Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {theatres.map(theatre => {
          const items = groupedByTheatre[theatre] || [];
          const criticalCount = items.filter(i => i.stockStatus === 'CRITICAL' || i.stockStatus === 'OUT_OF_STOCK').length;
          
          return (
            <Link
              key={theatre}
              href={`/dashboard/sub-stores/theatre/${theatre}`}
              className={`card p-3 hover:shadow-md transition-shadow ${
                criticalCount > 0 ? 'border-red-200 bg-red-50' : ''
              }`}
            >
              <div className="text-center">
                <Store className={`w-6 h-6 mx-auto mb-1 ${criticalCount > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                <p className="text-sm font-medium">{theatre.replace('_', ' ')}</p>
                <p className="text-xs text-gray-500">{items.length} items</p>
                {criticalCount > 0 && (
                  <p className="text-xs text-red-600 font-medium">{criticalCount} critical</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading sub-store inventory...</p>
        </div>
      ) : subStores.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Items Found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || selectedTheatre || selectedCategory || selectedStatus
              ? 'Try adjusting your filters'
              : 'Start by adding items to theatre sub-stores'}
          </p>
          <Link href="/dashboard/sub-stores/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add First Item
          </Link>
        </div>
      ) : groupBy === 'theatre' ? (
        // Grouped by Theatre
        <div className="space-y-6">
          {Object.entries(groupedByTheatre).map(([theatre, items]) => (
            <div key={theatre} className="card overflow-hidden">
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Store className="w-6 h-6" />
                  <h3 className="text-lg font-semibold">{theatre.replace('_', ' ')}</h3>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                    {items.length} items
                  </span>
                </div>
                <Link
                  href={`/dashboard/sub-stores/theatre/${theatre}`}
                  className="flex items-center gap-2 text-white/80 hover:text-white text-sm"
                >
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Managed By</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.slice(0, 5).map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{item.itemName}</p>
                            {item.itemCode && (
                              <p className="text-xs text-gray-500">{item.itemCode}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold">{item.currentStock}</span>
                          <span className="text-gray-500 text-sm"> / {item.maximumStock} {item.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.stockStatus)}`}>
                            {getStatusIcon(item.stockStatus)}
                            {item.stockStatus.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">{item.managedBy?.fullName || 'Unassigned'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/dashboard/sub-stores/${item.id}/use`}
                              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                            >
                              Log Use
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Grouped by Category
        <div className="space-y-6">
          {Object.entries(groupedByCategory).map(([category, items]) => (
            <div key={category} className="card overflow-hidden">
              <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="w-6 h-6" />
                  <h3 className="text-lg font-semibold">{category}</h3>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                    {items.length} items
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Theatre</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Managed By</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{item.itemName}</p>
                            {item.itemCode && (
                              <p className="text-xs text-gray-500">{item.itemCode}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">{item.theatreNumber.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold">{item.currentStock}</span>
                          <span className="text-gray-500 text-sm"> / {item.maximumStock}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.stockStatus)}`}>
                            {getStatusIcon(item.stockStatus)}
                            {item.stockStatus.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">{item.managedBy?.fullName || 'Unassigned'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/dashboard/sub-stores/${item.id}/use`}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
