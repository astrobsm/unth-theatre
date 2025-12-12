'use client';

import { useEffect, useState } from 'react';
import { Calendar, Plus, Trash2, Edit, AlertCircle } from 'lucide-react';

interface Theatre {
  id: string;
  name: string;
  location: string;
  status: string;
  allocations?: Allocation[];
}

interface Allocation {
  id: string;
  type: string;
  startTime: string;
  endTime: string;
  equipment: string[];
}

interface DailySummary {
  date: string;
  totalTheatres: number;
  totalAllocations: number;
  theatres: Array<{
    id: string;
    name: string;
    status: string;
    allocations: Allocation[];
    utilizationPercentage: number;
  }>;
  equipmentSummary: Array<{
    name: string;
    count: number;
  }>;
}

export default function TheatresPage() {
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(true);
  const [showAddTheatre, setShowAddTheatre] = useState(false);
  const [showAddAllocation, setShowAddAllocation] = useState(false);
  const [selectedTheatre, setSelectedTheatre] = useState<string>('');

  useEffect(() => {
    fetchTheatres();
    fetchDailySummary();
  }, [selectedDate]);

  const fetchTheatres = async () => {
    try {
      const response = await fetch(`/api/theatres?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setTheatres(data);
      }
    } catch (error) {
      console.error('Failed to fetch theatres:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailySummary = async () => {
    try {
      const response = await fetch(`/api/allocations/daily-summary?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setDailySummary(data);
      }
    } catch (error) {
      console.error('Failed to fetch daily summary:', error);
    }
  };

  const handleAddTheatre = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const response = await fetch('/api/theatres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          location: formData.get('location'),
          capacity: parseInt(formData.get('capacity') as string),
          equipment: (formData.get('equipment') as string)
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      });

      if (response.ok) {
        setShowAddTheatre(false);
        fetchTheatres();
        e.currentTarget.reset();
      }
    } catch (error) {
      console.error('Failed to add theatre:', error);
    }
  };

  const handleAddAllocation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const startTime = new Date(`${selectedDate}T${formData.get('startTime')}`);
    const endTime = new Date(`${selectedDate}T${formData.get('endTime')}`);
    
    try {
      const response = await fetch('/api/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatreId: formData.get('theatreId'),
          allocationType: formData.get('allocationType'),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          date: new Date(selectedDate).toISOString(),
          notes: formData.get('notes'),
          equipment: (formData.get('equipment') as string)
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      });

      if (response.ok) {
        setShowAddAllocation(false);
        fetchTheatres();
        fetchDailySummary();
        e.currentTarget.reset();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create allocation');
      }
    } catch (error) {
      console.error('Failed to add allocation:', error);
    }
  };

  const handleDeleteAllocation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this allocation?')) return;

    try {
      const response = await fetch(`/api/allocations/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchTheatres();
        fetchDailySummary();
      }
    } catch (error) {
      console.error('Failed to delete allocation:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800';
      case 'OCCUPIED':
        return 'bg-blue-100 text-blue-800';
      case 'MAINTENANCE':
        return 'bg-yellow-100 text-yellow-800';
      case 'RESERVED':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl">Loading theatres...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Theatre Allocation</h1>
          <p className="text-gray-600 mt-1">Manage theatre suites and daily allocations</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddTheatre(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Theatre
          </button>
          <button
            onClick={() => setShowAddAllocation(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Allocation
          </button>
        </div>
      </div>

      {/* Date Selector */}
      <div className="card">
        <div className="flex items-center gap-4">
          <Calendar className="w-6 h-6 text-primary-600" />
          <div>
            <label className="label">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Daily Summary */}
      {dailySummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600">Total Theatres</h3>
            <p className="text-3xl font-bold text-primary-600 mt-2">
              {dailySummary.totalTheatres}
            </p>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600">Total Allocations</h3>
            <p className="text-3xl font-bold text-secondary-600 mt-2">
              {dailySummary.totalAllocations}
            </p>
          </div>
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600">Equipment in Use</h3>
            <p className="text-3xl font-bold text-accent-600 mt-2">
              {dailySummary.equipmentSummary.length}
            </p>
          </div>
        </div>
      )}

      {/* Equipment Summary */}
      {dailySummary && dailySummary.equipmentSummary.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Equipment Summary for {selectedDate}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {dailySummary.equipmentSummary.map((item) => (
              <div
                key={item.name}
                className="p-4 bg-gradient-to-br from-primary-50 to-secondary-50 rounded-lg"
              >
                <p className="text-sm text-gray-600">{item.name}</p>
                <p className="text-2xl font-bold text-primary-700 mt-1">{item.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Theatre Allocations */}
      <div className="grid grid-cols-1 gap-6">
        {dailySummary?.theatres.map((theatre) => (
          <div key={theatre.id} className="card">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold">{theatre.name}</h3>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-2 ${getStatusColor(
                    theatre.status
                  )}`}
                >
                  {theatre.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Utilization</p>
                <p className="text-2xl font-bold text-primary-600">
                  {Math.round(theatre.utilizationPercentage)}%
                </p>
              </div>
            </div>

            {theatre.allocations.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No allocations for this date</p>
            ) : (
              <div className="space-y-3">
                {theatre.allocations.map((allocation) => (
                  <div
                    key={allocation.id}
                    className="p-4 bg-gray-50 rounded-lg flex justify-between items-center"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium">
                          {allocation.type}
                        </span>
                        <span className="text-gray-700 font-medium">
                          {new Date(allocation.startTime).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' - '}
                          {new Date(allocation.endTime).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {allocation.equipment.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-600">Equipment:</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {allocation.equipment.map((item, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-white rounded text-xs text-gray-700 border"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAllocation(allocation.id)}
                      className="text-red-600 hover:text-red-800 p-2"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Theatre Modal */}
      {showAddTheatre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Add Theatre Suite</h2>
            <form onSubmit={handleAddTheatre} className="space-y-4">
              <div>
                <label className="label">Theatre Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  className="input-field"
                  placeholder="e.g., Theatre 1"
                />
              </div>
              <div>
                <label className="label">Location</label>
                <input
                  type="text"
                  name="location"
                  required
                  className="input-field"
                  placeholder="e.g., Main Building, 2nd Floor"
                />
              </div>
              <div>
                <label className="label">Capacity</label>
                <input
                  type="number"
                  name="capacity"
                  defaultValue={1}
                  min={1}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Standard Equipment (comma-separated)</label>
                <textarea
                  name="equipment"
                  className="input-field"
                  placeholder="e.g., Operating Table, Anesthesia Machine, Monitors"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddTheatre(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Theatre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Allocation Modal */}
      {showAddAllocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Add Theatre Allocation</h2>
            <form onSubmit={handleAddAllocation} className="space-y-4">
              <div>
                <label className="label">Theatre Suite</label>
                <select name="theatreId" required className="input-field">
                  <option value="">Select Theatre</option>
                  {theatres.map((theatre) => (
                    <option key={theatre.id} value={theatre.id}>
                      {theatre.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Allocation Type</label>
                <select name="allocationType" required className="input-field">
                  <option value="SURGERY">Surgery</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Time</label>
                  <input type="time" name="startTime" required className="input-field" />
                </div>
                <div>
                  <label className="label">End Time</label>
                  <input type="time" name="endTime" required className="input-field" />
                </div>
              </div>
              <div>
                <label className="label">Equipment Needed (comma-separated)</label>
                <textarea
                  name="equipment"
                  className="input-field"
                  placeholder="e.g., Laparoscopic Equipment, C-Arm"
                  rows={3}
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea name="notes" className="input-field" rows={2} />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddAllocation(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
