'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Package, Plus, ArrowDownCircle, ArrowUpCircle, Clock, AlertTriangle,
  CheckCircle, XCircle, Search, Calendar, Filter
} from 'lucide-react';
import { THEATRES } from '@/lib/constants';
import SmartTextInput from '@/components/SmartTextInput';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
}

interface CheckoutItem {
  id?: string;
  inventoryItemId: string;
  itemName: string;
  itemCategory: string;
  quantity: number;
  serialNumber?: string;
  checkoutCondition: string;
  checkoutRemarks?: string;
  returnCondition?: string;
  returnRemarks?: string;
  faultDescription?: string;
  faultSeverity?: string;
}

interface Checkout {
  id: string;
  theatreId: string;
  shift: string;
  date: string;
  checkoutTime: string;
  returnTime?: string;
  status: string;
  items: CheckoutItem[];
  faultyAlerts?: any[];
}

export default function EquipmentCheckoutPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'checkout' | 'return' | 'history'>('checkout');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [activeCheckouts, setActiveCheckouts] = useState<Checkout[]>([]);
  
  // Checkout form state
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [checkoutDate, setCheckoutDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedItems, setSelectedItems] = useState<CheckoutItem[]>([]);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  
  // Collector information (nurse/technician collecting items)
  const [collectorName, setCollectorName] = useState('');
  const [collectorHospitalId, setCollectorHospitalId] = useState('');
  const [collectorRole, setCollectorRole] = useState<'SCRUB_NURSE' | 'ANAESTHETIC_TECHNICIAN'>('SCRUB_NURSE');
  
  // Return state
  const [selectedCheckout, setSelectedCheckout] = useState<Checkout | null>(null);
  const [returnItems, setReturnItems] = useState<CheckoutItem[]>([]);
  const [returnNotes, setReturnNotes] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (session?.user.role !== 'THEATRE_STORE_KEEPER' && session?.user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }
    fetchInventory();
    fetchCheckouts();
    // Auto-refresh every 30 seconds for cross-device sync
    const interval = setInterval(fetchCheckouts, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const fetchInventory = async () => {
    try {
      const response = await fetch('/api/inventory');
      if (response.ok) {
        const data = await response.json();
        // Filter for equipment (MACHINE, DEVICE categories)
        const equipment = data.items.filter((item: InventoryItem) => 
          item.category === 'MACHINE' || item.category === 'DEVICE'
        );
        setInventoryItems(equipment);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    }
  };

  const fetchCheckouts = async () => {
    try {
      const response = await fetch(`/api/equipment-checkout?storeKeeperId=${session?.user.id}`);
      if (response.ok) {
        const data = await response.json();
        setCheckouts(data.checkouts);
        const active = data.checkouts.filter((c: Checkout) => c.status === 'CHECKED_OUT');
        setActiveCheckouts(active);
      }
    } catch (error) {
      console.error('Failed to fetch checkouts:', error);
    }
  };

  const addItemToCheckout = (item: InventoryItem) => {
    if (selectedItems.some(si => si.inventoryItemId === item.id)) {
      setMessage('Item already added');
      return;
    }

    setSelectedItems([...selectedItems, {
      inventoryItemId: item.id,
      itemName: item.name,
      itemCategory: item.category,
      quantity: 1,
      checkoutCondition: 'FUNCTIONAL',
    }]);
  };

  const removeItemFromCheckout = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setMessage('Please add at least one item');
      return;
    }

    if (!collectorName || !collectorHospitalId) {
      setMessage('Please provide collector name and hospital ID');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/equipment-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectorName,
          collectorHospitalId,
          collectorRole,
          theatreId: selectedTheatre,
          shift: selectedShift,
          date: checkoutDate,
          items: selectedItems,
          checkoutNotes,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('✓ Equipment checked out successfully');
        setSelectedItems([]);
        setCollectorName('');
        setCollectorHospitalId('');
        setCheckoutNotes('');
        fetchCheckouts();
        setTimeout(() => setActiveTab('return'), 2000);
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to checkout equipment');
    } finally {
      setLoading(false);
    }
  };

  const selectCheckoutForReturn = (checkout: Checkout) => {
    setSelectedCheckout(checkout);
    setReturnItems(checkout.items.map(item => ({
      ...item,
      returnCondition: 'FUNCTIONAL',
      returnRemarks: '',
    })));
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheckout) return;

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`/api/equipment-checkout/${selectedCheckout.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: returnItems,
          returnNotes,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.alertsCreated) {
          setMessage(`🚨 Equipment returned. ${data.faultyItemsCount} RED ALERT(S) sent to management for faulty items!`);
        } else {
          setMessage('✓ Equipment returned successfully');
        }
        setSelectedCheckout(null);
        setReturnItems([]);
        setReturnNotes('');
        fetchCheckouts();
      } else {
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to return equipment');
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventoryItems
    .filter(item => item != null && item.name != null)
    .filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Equipment Checkout & Return</h1>
          <p className="text-gray-600 mt-1">Log equipment checkout and returns for nurses and technicians</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
          <Package className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">
            Active Checkouts: {activeCheckouts.length}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('checkout')}
            className={`${
              activeTab === 'checkout'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <ArrowDownCircle className="w-5 h-5" />
            Checkout Equipment
          </button>
          <button
            onClick={() => setActiveTab('return')}
            className={`${
              activeTab === 'return'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <ArrowUpCircle className="w-5 h-5" />
            Return Equipment
            {activeCheckouts.length > 0 && (
              <span className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                {activeCheckouts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
          >
            <Clock className="w-5 h-5" />
            History
          </button>
        </nav>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.includes('✓') || message.includes('successfully') ? 'bg-green-50 text-green-800' : message.includes('🚨') ? 'bg-red-50 text-red-800 border-2 border-red-300' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      {/* CHECKOUT TAB */}
      {activeTab === 'checkout' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Available Equipment */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Available Equipment</h2>
            
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search equipment..."
                  className="input-field pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredInventory.map(item => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-600">{item.category} • Qty: {item.quantity}</p>
                  </div>
                  <button
                    onClick={() => addItemToCheckout(item)}
                    className="btn-secondary text-sm"
                    disabled={selectedItems.some(si => si.inventoryItemId === item.id)}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Checkout Form */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Checkout Form</h2>
            
            <form onSubmit={handleCheckout} className="space-y-4">
              {/* Collector Information Section */}
              <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-blue-900">Staff Collecting Items</h3>
                
                <div>
                  <label className="label">Staff Name (From Hospital ID) *</label>
                  <input
                    type="text"
                    required
                    value={collectorName}
                    onChange={(e) => setCollectorName(e.target.value)}
                    className="input-field"
                    placeholder="Enter full name as on ID card"
                  />
                </div>

                <div>
                  <label className="label">Hospital ID Number *</label>
                  <input
                    type="text"
                    required
                    value={collectorHospitalId}
                    onChange={(e) => setCollectorHospitalId(e.target.value)}
                    className="input-field"
                    placeholder="Enter hospital ID number"
                  />
                </div>

                <div>
                  <label className="label">Staff Role *</label>
                  <select
                    required
                    value={collectorRole}
                    onChange={(e) => setCollectorRole(e.target.value as 'SCRUB_NURSE' | 'ANAESTHETIC_TECHNICIAN')}
                    className="input-field"
                  >
                    <option value="SCRUB_NURSE">Scrub Nurse</option>
                    <option value="ANAESTHETIC_TECHNICIAN">Anaesthetic Technician</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Theatre *</label>
                <select
                  required
                  value={selectedTheatre}
                  onChange={(e) => setSelectedTheatre(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select Theatre</option>
                  {THEATRES.map(theatre => (
                    <option key={theatre} value={theatre}>{theatre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Shift *</label>
                  <select
                    required
                    value={selectedShift}
                    onChange={(e) => setSelectedShift(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select Shift</option>
                    <option value="MORNING">Morning</option>
                    <option value="AFTERNOON">Afternoon</option>
                    <option value="NIGHT">Night</option>
                    <option value="CALL">Call</option>
                  </select>
                </div>

                <div>
                  <label className="label">Date *</label>
                  <input
                    type="date"
                    required
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="label">Selected Items ({selectedItems.length})</label>
                <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2">
                  {selectedItems.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No items selected</p>
                  ) : (
                    selectedItems.map((item, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-blue-50 rounded">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.itemName}</p>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...selectedItems];
                                updated[index].quantity = parseInt(e.target.value) || 1;
                                setSelectedItems(updated);
                              }}
                              className="input-field text-xs py-1"
                            />
                            <select
                              value={item.checkoutCondition}
                              onChange={(e) => {
                                const updated = [...selectedItems];
                                updated[index].checkoutCondition = e.target.value;
                                setSelectedItems(updated);
                              }}
                              className="input-field text-xs py-1"
                            >
                              <option value="FUNCTIONAL">Functional</option>
                              <option value="FAULTY">Faulty</option>
                              <option value="NEEDS_MAINTENANCE">Needs Maintenance</option>
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItemFromCheckout(index)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <SmartTextInput
                label="Notes"
                value={checkoutNotes}
                onChange={setCheckoutNotes}
                rows={3}
                placeholder="Any additional notes... 🎤 Dictate or 📷 capture"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />

              <button
                type="submit"
                disabled={loading || selectedItems.length === 0}
                className="btn-primary w-full"
              >
                {loading ? 'Processing...' : 'Checkout Equipment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* RETURN TAB */}
      {activeTab === 'return' && (
        <div className="space-y-6">
          {!selectedCheckout ? (
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">Active Checkouts</h2>
              
              {activeCheckouts.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No active checkouts</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeCheckouts.map(checkout => (
                    <div key={checkout.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{checkout.theatreId}</h3>
                          <p className="text-sm text-gray-600">
                            {checkout.shift} Shift • {new Date(checkout.date).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Checked out: {new Date(checkout.checkoutTime).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => selectCheckoutForReturn(checkout)}
                          className="btn-primary"
                        >
                          Return Items
                        </button>
                      </div>
                      
                      <div className="bg-gray-50 rounded p-3">
                        <p className="text-sm font-medium mb-2">Items ({checkout.items.length}):</p>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {checkout.items.map(item => (
                            <li key={item.id} className="flex justify-between">
                              <span>• {item.itemName}</span>
                              <span className="text-gray-500">Qty: {item.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Return Equipment</h2>
                <button
                  onClick={() => {
                    setSelectedCheckout(null);
                    setReturnItems([]);
                  }}
                  className="btn-secondary"
                >
                  Back to List
                </button>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <p className="font-medium">{selectedCheckout.theatreId} - {selectedCheckout.shift} Shift</p>
                <p className="text-sm text-gray-600">{new Date(selectedCheckout.date).toLocaleDateString()}</p>
              </div>

              <form onSubmit={handleReturn} className="space-y-6">
                <div>
                  <label className="label">Return Condition for Each Item *</label>
                  <div className="space-y-4">
                    {returnItems.map((item, index) => (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold">{item.itemName}</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-gray-600">Return Condition *</label>
                            <select
                              required
                              value={item.returnCondition}
                              onChange={(e) => {
                                const updated = [...returnItems];
                                updated[index].returnCondition = e.target.value;
                                setReturnItems(updated);
                              }}
                              className="input-field"
                            >
                              <option value="FUNCTIONAL">✓ Functional</option>
                              <option value="FAULTY">🚨 Faulty (RED ALERT)</option>
                              <option value="DAMAGED">⚠️ Damaged (RED ALERT)</option>
                              <option value="NEEDS_MAINTENANCE">⚙️ Needs Maintenance</option>
                            </select>
                          </div>

                          {(item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED') && (
                            <div>
                              <label className="text-sm text-gray-600">Fault Severity *</label>
                              <select
                                required
                                value={item.faultSeverity}
                                onChange={(e) => {
                                  const updated = [...returnItems];
                                  updated[index].faultSeverity = e.target.value;
                                  setReturnItems(updated);
                                }}
                                className="input-field"
                              >
                                <option value="">Select Severity</option>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="CRITICAL">Critical</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {(item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED' || item.returnCondition === 'NEEDS_MAINTENANCE') && (
                          <div>
                            <label className="text-sm text-gray-600">
                              {item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED' ? 'Fault Description *' : 'Remarks'}
                            </label>
                            <textarea
                              required={item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED'}
                              value={item.faultDescription || ''}
                              onChange={(e) => {
                                const updated = [...returnItems];
                                updated[index].faultDescription = e.target.value;
                                setReturnItems(updated);
                              }}
                              className="input-field"
                              rows={2}
                              placeholder="Describe the issue in detail..."
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-sm text-gray-600">Additional Remarks</label>
                          <input
                            type="text"
                            value={item.returnRemarks || ''}
                            onChange={(e) => {
                              const updated = [...returnItems];
                              updated[index].returnRemarks = e.target.value;
                              setReturnItems(updated);
                            }}
                            className="input-field"
                            placeholder="Optional remarks..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {returnItems.some(item => item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED') && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="font-semibold text-red-900 mb-2">🚨 RED ALERT Will Be Triggered</h4>
                        <p className="text-sm text-red-800">
                          You have marked {returnItems.filter(item => item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED').length} item(s) as FAULTY or DAMAGED.
                          <br />
                          <strong>Immediate notifications will be sent to:</strong>
                        </p>
                        <ul className="text-sm text-red-800 ml-4 mt-2 space-y-1">
                          <li>• Theatre Manager</li>
                          <li>• Theatre Chairman</li>
                        </ul>
                        <p className="text-xs text-red-700 mt-2">
                          These faulty items will be flagged for immediate attention and maintenance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <SmartTextInput
                  label="General Return Notes"
                  value={returnNotes}
                  onChange={setReturnNotes}
                  rows={3}
                  placeholder="Any general notes about the return... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full"
                >
                  {loading ? 'Processing Return...' : 'Complete Return'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Checkout History</h2>
          
          <div className="space-y-4">
            {checkouts.filter(c => c.status === 'RETURNED').map(checkout => (
              <div key={checkout.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold">{checkout.theatreId}</h3>
                    <p className="text-sm text-gray-600">
                      {checkout.shift} Shift • {new Date(checkout.date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    Returned
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <span className="text-gray-600">Checked out:</span>
                    <p className="font-medium">{new Date(checkout.checkoutTime).toLocaleString()}</p>
                  </div>
                  {checkout.returnTime && (
                    <div>
                      <span className="text-gray-600">Returned:</span>
                      <p className="font-medium">{new Date(checkout.returnTime).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 rounded p-3">
                  <p className="text-sm font-medium mb-2">Items ({checkout.items.length}):</p>
                  <div className="space-y-2">
                    {checkout.items.map(item => (
                      <div key={item.id} className="flex justify-between items-center text-sm">
                        <span>{item.itemName} (Qty: {item.quantity})</span>
                        {item.returnCondition && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.returnCondition === 'FUNCTIONAL' ? 'bg-green-100 text-green-800' :
                            item.returnCondition === 'FAULTY' || item.returnCondition === 'DAMAGED' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.returnCondition}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {checkout.faultyAlerts && checkout.faultyAlerts.length > 0 && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-sm font-medium text-red-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {checkout.faultyAlerts.length} Red Alert(s) Triggered
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
