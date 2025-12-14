'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Package, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitCostPrice: number;
  reorderLevel: number;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await fetch('/api/inventory');
      if (response.ok) {
        const data = await response.json();
        // Inventory API returns {items: [...]}
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
        } else if (Array.isArray(data)) {
          // Fallback: handle if API ever returns array directly
          setItems(data);
        } else {
          console.error('API returned non-array data:', data);
          setItems([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = Array.isArray(items) ? items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'ALL' || item.category === filter;
    return matchesSearch && matchesFilter;
  }) : [];

  const lowStockItems = Array.isArray(items) ? items.filter(item => item.quantity <= item.reorderLevel) : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        <Link href="/dashboard/inventory/new" className="btn-primary flex items-center">
          <Plus className="w-5 h-5 mr-2" />
          Add Item
        </Link>
      </div>

      {/* Alert for low stock */}
      {lowStockItems.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-800">
                {lowStockItems.length} item(s) below reorder level
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search items..."
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="input-field"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="CONSUMABLE">Consumables</option>
            <option value="MACHINE">Machines</option>
            <option value="DEVICE">Devices</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">Loading inventory...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No items found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₦{item.unitCostPrice.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {item.quantity <= item.reorderLevel ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Low Stock
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          In Stock
                        </span>
                      )}
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
