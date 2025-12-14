'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { THEATRES } from '@/lib/constants';
import {
  Package,
  MapPin,
  AlertCircle,
  Loader,
  CheckCircle,
  Droplet,
  Shield,
  Scissors,
  Wind,
} from 'lucide-react';

interface Theatre {
  id: string;
  name: string;
  location: string;
  status: string;
}

interface User {
  id: string;
  name: string;
  role: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitCostPrice: number;
}

interface SelectedItem {
  inventoryItemId: string;
  name: string;
  category: string;
  quantityTaken: number;
  availableStock: number;
}

interface InventoryStock {
  spirit: number;
  savlon: number;
  povidone: number;
  faceMask: number;
  nursesCap: number;
  cssdGauze: number;
  cssdCotton: number;
  surgicalBlades: number;
  suctionTubbings: number;
  disposables: number;
}

export default function NewTheatreSetupPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [scrubNurses, setScrubNurses] = useState<User[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [scrubNurseName, setScrubNurseName] = useState('');
  const [showScrubNurseDropdown, setShowScrubNurseDropdown] = useState(false);
  const [geoLocation, setGeoLocation] = useState<{
    latitude: number;
    longitude: number;
    location: string;
  } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [stock, setStock] = useState<InventoryStock>({
    spirit: 100,
    savlon: 100,
    povidone: 100,
    faceMask: 500,
    nursesCap: 500,
    cssdGauze: 200,
    cssdCotton: 200,
    surgicalBlades: 150,
    suctionTubbings: 100,
    disposables: 300,
  });

  const [formData, setFormData] = useState({
    theatreId: '',
    setupDate: new Date().toISOString().split('T')[0],
    spiritQuantity: 0,
    savlonQuantity: 0,
    povidoneQuantity: 0,
    faceMaskQuantity: 0,
    nursesCapQuantity: 0,
    cssdGauzeQuantity: 0,
    cssdCottonQuantity: 0,
    surgicalBladesQuantity: 0,
    suctionTubbingsQuantity: 0,
    disposablesQuantity: 0,
    notes: '',
  });

  useEffect(() => {
    fetchTheatres();
    fetchInventoryStock();
    fetchScrubNurses();
    fetchInventoryItems();
    getGeolocation();
  }, []);

  const fetchTheatres = async () => {
    try {
      const response = await fetch('/api/theatres');
      if (response.ok) {
        const data = await response.json();
        setTheatres(data);
      }
    } catch (error) {
      console.error('Failed to fetch theatres:', error);
    }
  };

  const fetchScrubNurses = async () => {
    try {
      const response = await fetch('/api/users?role=SCRUB_NURSE');
      if (response.ok) {
        const data = await response.json();
        setScrubNurses(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch scrub nurses:', error);
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const response = await fetch('/api/inventory');
      if (response.ok) {
        const data = await response.json();
        setInventoryItems(data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch inventory items:', error);
    }
  };

  const fetchInventoryStock = async () => {
    try {
      const response = await fetch('/api/theatre-setup/stock');
      if (response.ok) {
        const data = await response.json();
        setStock(data);
      }
    } catch (error) {
      console.error('Failed to fetch stock:', error);
    }
  };

  const getGeolocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Reverse geocoding (simplified - in production use a real API)
        const location = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        setGeoLocation({ latitude, longitude, location });
        setGeoLoading(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setGeoLoading(false);
      }
    );
  };

  const handleQuantityChange = (field: string, value: number) => {
    const maxStock: Record<string, number> = {
      spiritQuantity: stock.spirit,
      savlonQuantity: stock.savlon,
      povidoneQuantity: stock.povidone,
      faceMaskQuantity: stock.faceMask,
      nursesCapQuantity: stock.nursesCap,
      cssdGauzeQuantity: stock.cssdGauze,
      cssdCottonQuantity: stock.cssdCotton,
      surgicalBladesQuantity: stock.surgicalBlades,
      suctionTubbingsQuantity: stock.suctionTubbings,
      disposablesQuantity: stock.disposables,
    };

    const max = maxStock[field] || 0;
    const validValue = Math.max(0, Math.min(value, max));

    setFormData((prev) => ({ ...prev, [field]: validValue }));
  };

  const handleAddItem = (item: InventoryItem) => {
    const existingItem = selectedItems.find(si => si.inventoryItemId === item.id);
    
    if (existingItem) {
      alert('Item already added. Use the quantity controls to adjust.');
      return;
    }

    setSelectedItems([...selectedItems, {
      inventoryItemId: item.id,
      name: item.name,
      category: item.category,
      quantityTaken: 1,
      availableStock: item.quantity
    }]);
    setSearchTerm('');
  };

  const handleRemoveItem = (inventoryItemId: string) => {
    setSelectedItems(selectedItems.filter(item => item.inventoryItemId !== inventoryItemId));
  };

  const handleItemQuantityChange = (inventoryItemId: string, quantity: number) => {
    setSelectedItems(selectedItems.map(item => 
      item.inventoryItemId === inventoryItemId
        ? { ...item, quantityTaken: Math.max(0, Math.min(quantity, item.availableStock)) }
        : item
    ));
  };

  const filteredInventoryItems = inventoryItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredScrubNurses = scrubNurses.filter(nurse =>
    nurse.name.toLowerCase().includes(scrubNurseName.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.theatreId) {
      alert('Please select a theatre');
      return;
    }

    const totalItems = Object.entries(formData)
      .filter(([key]) => key.includes('Quantity'))
      .reduce((sum, [, value]) => sum + (value as number), 0);

    const totalSelectedItems = selectedItems.reduce((sum, item) => sum + item.quantityTaken, 0);

    if (totalItems === 0 && totalSelectedItems === 0) {
      alert('Please collect at least one item');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/theatre-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          scrubNurseName: scrubNurseName || session?.user?.name,
          latitude: geoLocation?.latitude,
          longitude: geoLocation?.longitude,
          location: geoLocation?.location,
          items: selectedItems.map(item => ({
            inventoryItemId: item.inventoryItemId,
            quantityTaken: item.quantityTaken
          }))
        }),
      });

      if (response.ok) {
        alert('Materials collected successfully');
        router.push('/dashboard/theatre-setup');
      } else {
        const error = await response.json();
        alert(`Failed to collect materials: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to submit:', error);
      alert('Failed to collect materials');
    } finally {
      setLoading(false);
    }
  };

  const totalItems = Object.entries(formData)
    .filter(([key]) => key.includes('Quantity'))
    .reduce((sum, [, value]) => sum + (value as number), 0);

  const totalSelectedItems = selectedItems.reduce((sum, item) => sum + item.quantityTaken, 0);
  const totalAllItems = totalItems + totalSelectedItems;

  const materialCategories = [
    {
      title: 'Antiseptics',
      icon: Droplet,
      color: 'blue',
      items: [
        { field: 'spiritQuantity', label: 'Spirit', stock: stock.spirit, unit: 'bottles' },
        { field: 'savlonQuantity', label: 'Savlon', stock: stock.savlon, unit: 'bottles' },
        {
          field: 'povidoneQuantity',
          label: 'Povidone Iodine',
          stock: stock.povidone,
          unit: 'bottles',
        },
      ],
    },
    {
      title: 'Protective Equipment',
      icon: Shield,
      color: 'green',
      items: [
        { field: 'faceMaskQuantity', label: 'Face Masks', stock: stock.faceMask, unit: 'pieces' },
        { field: 'nursesCapQuantity', label: 'Nurses Caps', stock: stock.nursesCap, unit: 'pieces' },
      ],
    },
    {
      title: 'CSSD Supplies',
      icon: Package,
      color: 'purple',
      items: [
        { field: 'cssdGauzeQuantity', label: 'CSSD Gauze', stock: stock.cssdGauze, unit: 'packs' },
        {
          field: 'cssdCottonQuantity',
          label: 'CSSD Cotton Wool',
          stock: stock.cssdCotton,
          unit: 'packs',
        },
      ],
    },
    {
      title: 'Surgical Supplies',
      icon: Scissors,
      color: 'red',
      items: [
        {
          field: 'surgicalBladesQuantity',
          label: 'Surgical Blades',
          stock: stock.surgicalBlades,
          unit: 'pieces',
        },
        {
          field: 'suctionTubbingsQuantity',
          label: 'Suction Tubbings',
          stock: stock.suctionTubbings,
          unit: 'pieces',
        },
        {
          field: 'disposablesQuantity',
          label: 'Disposables',
          stock: stock.disposables,
          unit: 'pieces',
        },
      ],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Collect Theatre Materials</h1>
        <p className="text-gray-600 mt-1">
          Record materials collected for theatre setup with real-time stock tracking
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Theatre and Date Selection */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Setup Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Theatre Suite *</label>
              <select
                required
                value={formData.theatreId}
                onChange={(e) => setFormData({ ...formData, theatreId: e.target.value })}
                className="input-field"
              >
                <option value="">Select a theatre</option>
                {THEATRES.map((theatre) => (
                  <option key={theatre} value={theatre}>
                    {theatre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Setup Date *</label>
              <input
                type="date"
                required
                value={formData.setupDate}
                onChange={(e) => setFormData({ ...formData, setupDate: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          {/* Geolocation Status */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin
                  className={`w-5 h-5 ${
                    geoLocation ? 'text-green-500' : 'text-gray-400'
                  }`}
                />
                <span className="font-medium text-gray-900">Geolocation</span>
              </div>
              {geoLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Getting location...</span>
                </div>
              ) : geoLocation ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Location captured</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={getGeolocation}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Enable Location
                </button>
              )}
            </div>
            {geoLocation && (
              <p className="text-xs text-gray-500 mt-2">
                Location: {geoLocation.location}
              </p>
            )}
          </div>

          {/* Scrub Nurse Info */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="mb-3">
              <label className="label">Scrub Nurse Collecting Materials</label>
              <div className="relative">
                <input
                  type="text"
                  value={scrubNurseName}
                  onChange={(e) => {
                    setScrubNurseName(e.target.value);
                    setShowScrubNurseDropdown(true);
                  }}
                  onFocus={() => setShowScrubNurseDropdown(true)}
                  placeholder="Enter or select scrub nurse name"
                  className="input-field"
                />
                
                {showScrubNurseDropdown && scrubNurseName && filteredScrubNurses.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredScrubNurses.map((nurse) => (
                      <button
                        key={nurse.id}
                        type="button"
                        onClick={() => {
                          setScrubNurseName(nurse.name);
                          setShowScrubNurseDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0"
                      >
                        <p className="font-medium text-gray-900">{nurse.name}</p>
                        <p className="text-xs text-gray-500">{nurse.role}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Type to search existing scrub nurses or enter a new name
              </p>
            </div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">Logged in as:</span> {session?.user?.name || 'Unknown'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Collection Time: {new Date().toLocaleString('en-GB')}
            </p>
          </div>
        </div>

        {/* Material Collection by Category */}
        {materialCategories.map((category) => {
          const Icon = category.icon;
          return (
            <div key={category.title} className="card">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-10 h-10 bg-${category.color}-100 rounded-full flex items-center justify-center`}
                >
                  <Icon className={`w-5 h-5 text-${category.color}-600`} />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">{category.title}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.items.map((item) => {
                  const quantity = formData[item.field as keyof typeof formData] as number;
                  const stockLevel = item.stock;
                  const stockPercentage = (quantity / stockLevel) * 100;

                  return (
                    <div key={item.field} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <label className="font-medium text-gray-900">{item.label}</label>
                        <span className="text-sm text-gray-600">
                          Stock: {stockLevel} {item.unit}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.field, quantity - 1)}
                          className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={stockLevel}
                          value={quantity}
                          onChange={(e) =>
                            handleQuantityChange(item.field, parseInt(e.target.value) || 0)
                          }
                          className="flex-1 input-field text-center"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.field, quantity + 1)}
                          className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>

                      {/* Stock Level Indicator */}
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              stockPercentage > 75
                                ? 'bg-red-500'
                                : stockPercentage > 50
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {quantity} / {stockLevel} {item.unit} ({stockPercentage.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Dynamic Inventory Items Selection */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Additional Items from Inventory
          </h2>
          
          {/* Search and Add Items */}
          <div className="mb-4">
            <label className="label">Search and Add Items</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search for inventory items..."
                className="input-field"
              />
              
              {searchTerm && filteredInventoryItems.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredInventoryItems.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 border-b last:border-b-0"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.category} | Stock: {item.quantity} | ₦{item.unitCostPrice.toFixed(2)}
                          </p>
                        </div>
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Search by name or category to add items from inventory
            </p>
          </div>

          {/* Selected Items List */}
          {selectedItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Selected Items ({selectedItems.length})</h3>
              {selectedItems.map((item) => (
                <div key={item.inventoryItemId} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.category} | Available: {item.availableStock}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.inventoryItemId)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleItemQuantityChange(item.inventoryItemId, item.quantityTaken - 1)}
                      className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      max={item.availableStock}
                      value={item.quantityTaken}
                      onChange={(e) => handleItemQuantityChange(item.inventoryItemId, parseInt(e.target.value) || 0)}
                      className="flex-1 input-field text-center"
                    />
                    <button
                      type="button"
                      onClick={() => handleItemQuantityChange(item.inventoryItemId, item.quantityTaken + 1)}
                      className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>

                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          (item.quantityTaken / item.availableStock) * 100 > 75
                            ? 'bg-red-500'
                            : (item.quantityTaken / item.availableStock) * 100 > 50
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min((item.quantityTaken / item.availableStock) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {item.quantityTaken} / {item.availableStock} ({((item.quantityTaken / item.availableStock) * 100).toFixed(1)}%)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No additional items selected</p>
              <p className="text-xs">Use the search above to add items from inventory</p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Additional Notes</h2>
          <textarea
            rows={4}
            placeholder="Any special requirements, observations, or notes about this collection..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="input-field"
          />
        </div>

        {/* Summary */}
        <div className="card bg-gradient-to-br from-primary-50 to-primary-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Collection Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-primary-600">{totalAllItems}</p>
              <p className="text-sm text-gray-600 mt-1">Total Items</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">
                {formData.spiritQuantity +
                  formData.savlonQuantity +
                  formData.povidoneQuantity}
              </p>
              <p className="text-sm text-gray-600 mt-1">Antiseptics</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">
                {formData.faceMaskQuantity + formData.nursesCapQuantity}
              </p>
              <p className="text-sm text-gray-600 mt-1">Protective</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-purple-600">
                {formData.cssdGauzeQuantity + formData.cssdCottonQuantity}
              </p>
              <p className="text-sm text-gray-600 mt-1">CSSD</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-orange-600">{totalSelectedItems}</p>
              <p className="text-sm text-gray-600 mt-1">From Inventory</p>
            </div>
          </div>
        </div>

        {/* Warning */}
        {totalAllItems === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-semibold">No items selected</p>
              <p>Please collect at least one item before submitting.</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={loading || totalAllItems === 0}
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Collecting...
              </>
            ) : (
              <>
                <Package className="w-5 h-5" />
                Collect Materials
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
