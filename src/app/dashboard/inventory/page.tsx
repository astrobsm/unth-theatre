'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Package, AlertTriangle, Upload, Download, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { SYNC_INTERVALS } from '@/lib/sync';

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
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const fetchInventory = useCallback(async () => {
    if (!isOnline) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch('/api/inventory');
      if (response.ok) {
        const data = await response.json();
        // Inventory API returns {items: [...]}
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
          setLastSyncTime(Date.now());
        } else if (Array.isArray(data)) {
          // Fallback: handle if API ever returns array directly
          setItems(data);
          setLastSyncTime(Date.now());
        } else {
          console.error('API returned non-array data:', data);
          setItems([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchInventory();
    // Auto-refresh every 60 seconds for cross-device sync
    const interval = setInterval(fetchInventory, SYNC_INTERVALS.INVENTORY);
    return () => clearInterval(interval);
  }, [fetchInventory]);

  // Refetch when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchInventory();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchInventory]);

  const filteredItems = Array.isArray(items) ? items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'ALL' || item.category === filter;
    return matchesSearch && matchesFilter;
  }) : [];

  const lowStockItems = Array.isArray(items) ? items.filter(item => item.quantity <= item.reorderLevel) : [];

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Transform Excel data to match our schema
      const items = jsonData.map((row: any) => ({
        name: row['Item Name'] || row['name'],
        category: row['Category'] || row['category'],
        description: row['Description'] || row['description'],
        unitCostPrice: parseFloat(row['Unit Cost Price'] || row['unitCostPrice'] || 0),
        quantity: parseInt(row['Quantity'] || row['quantity'] || 0),
        reorderLevel: parseInt(row['Reorder Level'] || row['reorderLevel'] || 10),
        supplier: row['Supplier'] || row['supplier'],
        // Consumable fields
        manufacturingDate: row['Manufacturing Date'] || row['manufacturingDate'],
        expiryDate: row['Expiry Date'] || row['expiryDate'],
        batchNumber: row['Batch Number'] || row['batchNumber'],
        // Equipment fields
        halfLife: row['Half Life (Years)'] || row['halfLife'],
        depreciationRate: row['Depreciation Rate (%)'] || row['depreciationRate'],
        deviceId: row['Device ID'] || row['deviceId'],
        maintenanceIntervalDays: row['Maintenance Interval (Days)'] || row['maintenanceIntervalDays'],
        lastMaintenanceDate: row['Last Maintenance Date'] || row['lastMaintenanceDate'],
      }));

      const response = await fetch('/api/inventory/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const result = await response.json();
      setUploadResult(result);

      if (result.created > 0) {
        fetchInventory(); // Refresh the list
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({ error: 'Failed to process file' });
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const downloadTemplate = () => {
    // Create sample data
    const sampleData = [
      {
        'Item Name': 'Surgical Gloves (Box)',
        'Category': 'CONSUMABLE',
        'Description': 'Sterile latex gloves, size 7.5',
        'Unit Cost Price': 5000,
        'Quantity': 100,
        'Reorder Level': 20,
        'Supplier': 'Medical Supplies Ltd',
        'Manufacturing Date': '2024-01-15',
        'Expiry Date': '2026-01-15',
        'Batch Number': 'GLV-2024-001',
        'Half Life (Years)': '',
        'Depreciation Rate (%)': '',
        'Device ID': '',
        'Maintenance Interval (Days)': '',
        'Last Maintenance Date': '',
      },
      {
        'Item Name': 'Anesthesia Machine',
        'Category': 'MACHINE',
        'Description': 'Modern anesthesia delivery system',
        'Unit Cost Price': 15000000,
        'Quantity': 5,
        'Reorder Level': 2,
        'Supplier': 'MedEquip International',
        'Manufacturing Date': '',
        'Expiry Date': '',
        'Batch Number': '',
        'Half Life (Years)': 10,
        'Depreciation Rate (%)': 10,
        'Device ID': 'ANE-001',
        'Maintenance Interval (Days)': 180,
        'Last Maintenance Date': '2024-01-01',
      },
      {
        'Item Name': 'Surgical Scissors',
        'Category': 'DEVICE',
        'Description': 'Stainless steel surgical scissors',
        'Unit Cost Price': 25000,
        'Quantity': 50,
        'Reorder Level': 10,
        'Supplier': 'Surgical Tools Co',
        'Manufacturing Date': '',
        'Expiry Date': '',
        'Batch Number': '',
        'Half Life (Years)': 5,
        'Depreciation Rate (%)': 20,
        'Device ID': 'SCI-050',
        'Maintenance Interval (Days)': 90,
        'Last Maintenance Date': '2024-01-01',
      },
    ];

    // Create instructions sheet
    const instructions = [
      ['INVENTORY BULK UPLOAD TEMPLATE'],
      [''],
      ['INSTRUCTIONS:'],
      ['1. Fill in the required fields (marked with *) for each item'],
      ['2. Categories must be: CONSUMABLE, MACHINE, DEVICE, or OTHER'],
      ['3. For CONSUMABLE items, fill Manufacturing Date, Expiry Date, Batch Number'],
      ['4. For MACHINE/DEVICE items, fill equipment-specific fields'],
      ['5. Dates should be in YYYY-MM-DD format (e.g., 2024-01-15)'],
      ['6. Numeric values should not have commas or currency symbols'],
      ['7. Save as Excel file (.xlsx) and upload'],
      [''],
      ['REQUIRED FIELDS (* = required):'],
      ['- Item Name *'],
      ['- Category * (CONSUMABLE, MACHINE, DEVICE, or OTHER)'],
      ['- Unit Cost Price * (numeric value)'],
      ['- Quantity * (whole number)'],
      [''],
      ['OPTIONAL FIELDS:'],
      ['- Description'],
      ['- Reorder Level (default: 10)'],
      ['- Supplier'],
      [''],
      ['FOR CONSUMABLES:'],
      ['- Manufacturing Date (YYYY-MM-DD)'],
      ['- Expiry Date (YYYY-MM-DD)'],
      ['- Batch Number'],
      [''],
      ['FOR MACHINES/DEVICES:'],
      ['- Half Life (Years) - e.g., 10'],
      ['- Depreciation Rate (%) - e.g., 10'],
      ['- Device ID - unique identifier'],
      ['- Maintenance Interval (Days) - e.g., 180'],
      ['- Last Maintenance Date (YYYY-MM-DD)'],
    ];

    const wb = XLSX.utils.book_new();
    
    // Add sample data sheet
    const ws1 = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Sample Data');
    
    // Add instructions sheet
    const ws2 = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

    XLSX.writeFile(wb, 'Inventory_Upload_Template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        <div className="flex gap-3">
          <button
            onClick={downloadTemplate}
            className="btn-secondary flex items-center"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Template
          </button>
          <label className="btn-secondary flex items-center cursor-pointer">
            <Upload className="w-5 h-5 mr-2" />
            {uploading ? 'Uploading...' : 'Bulk Upload'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <Link href="/dashboard/inventory/new" className="btn-primary flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            Add Item
          </Link>
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`p-4 rounded-lg ${uploadResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <h3 className="font-semibold mb-2">
            {uploadResult.error ? '❌ Upload Failed' : '✅ Upload Complete'}
          </h3>
          {uploadResult.created !== undefined && (
            <p className="text-sm mb-2">
              Successfully created {uploadResult.created} of {uploadResult.total} items
            </p>
          )}
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium mb-2">
                {uploadResult.errors.length} error(s) - Click to view
              </summary>
              <div className="max-h-60 overflow-y-auto bg-white p-3 rounded border">
                {uploadResult.errors.map((err: any, idx: number) => (
                  <div key={idx} className="mb-2 pb-2 border-b last:border-0">
                    <p className="font-medium text-red-600">Row {err.row}: {err.error}</p>
                    {err.data && (
                      <pre className="text-xs mt-1 text-gray-600">
                        {JSON.stringify(err.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
          {uploadResult.error && (
            <p className="text-sm text-red-600">{uploadResult.error}</p>
          )}
        </div>
      )}

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
