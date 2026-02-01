'use client';

import { useEffect, useState } from 'react';
import { Calendar, Plus, Trash2, Edit, AlertCircle } from 'lucide-react';
import { THEATRES } from '@/lib/constants';

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

interface User {
  id: string;
  fullName: string;
  role: string;
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
  const [allocationType, setAllocationType] = useState<string>('SURGERY');
  const [selectedShift, setSelectedShift] = useState<string>('MORNING');
  const [autofilledStaff, setAutofilledStaff] = useState<any>(null);
  
  // Staff lists
  const [scrubNurses, setScrubNurses] = useState<User[]>([]);
  const [circulatingNurses, setCirculatingNurses] = useState<User[]>([]);
  const [anaestheticTechnicians, setAnaestheticTechnicians] = useState<User[]>([]);
  const [anaesthetists, setAnaesthetists] = useState<User[]>([]);
  const [cleaners, setCleaners] = useState<User[]>([]);
  const [porters, setPorters] = useState<User[]>([]);

  useEffect(() => {
    fetchTheatres();
    fetchDailySummary();
    fetchStaff();
    // Auto-refresh every 30 seconds for cross-device sync
    const interval = setInterval(() => {
      fetchTheatres();
      fetchDailySummary();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const fetchTheatres = async () => {
    try {
      const response = await fetch(`/api/theatres?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setTheatres(data);
        } else {
          console.error('API returned non-array data:', data);
          setTheatres([]);
        }
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

  const fetchStaff = async () => {
    try {
      // Fetch scrub nurses
      const scrubResponse = await fetch('/api/users?role=SCRUB_NURSE&status=APPROVED');
      if (scrubResponse.ok) {
        const data = await scrubResponse.json();
        setScrubNurses(data.users || []);
      }

      // Fetch scrub nurses for circulating role (now handled by SCRUB_NURSE)
      const circulatingResponse = await fetch('/api/users?role=SCRUB_NURSE&status=APPROVED');
      if (circulatingResponse.ok) {
        const data = await circulatingResponse.json();
        setCirculatingNurses(data.users || []);
      }

      // Fetch anaesthetic technicians
      const techResponse = await fetch('/api/users?role=ANAESTHETIC_TECHNICIAN&status=APPROVED');
      if (techResponse.ok) {
        const data = await techResponse.json();
        setAnaestheticTechnicians(data.users || []);
      }

      // Fetch anaesthetists (all types)
      const anaesthetistResponse = await fetch('/api/users?role=ANAESTHETIST&status=APPROVED');
      if (anaesthetistResponse.ok) {
        const data = await anaesthetistResponse.json();
        setAnaesthetists(data.users || []);
      }

      // Fetch cleaners
      const cleanerResponse = await fetch('/api/users?role=CLEANER&status=APPROVED');
      if (cleanerResponse.ok) {
        const data = await cleanerResponse.json();
        setCleaners(data.users || []);
      }

      // Fetch porters
      const porterResponse = await fetch('/api/users?role=PORTER&status=APPROVED');
      if (porterResponse.ok) {
        const data = await porterResponse.json();
        setPorters(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    }
  };

  const fetchRosterSuggestions = async (theatreId: string, date: string, shift: string) => {
    try {
      const response = await fetch(`/api/roster/autofill?theatreId=${theatreId}&date=${date}&shift=${shift}`);
      if (response.ok) {
        const data = await response.json();
        setAutofilledStaff(data.staffSuggestions);
        
        // Auto-fill the form if we have staff suggestions
        if (data.staffSuggestions) {
          setTimeout(() => {
            Object.keys(data.staffSuggestions).forEach((key) => {
              const value = data.staffSuggestions[key];
              if (value) {
                const element = document.querySelector(`[name="${key}Id"]`) as HTMLSelectElement;
                if (element) {
                  element.value = value;
                }
              }
            });
          }, 100);
        }
      }
    } catch (error) {
      console.error('Failed to fetch roster suggestions:', error);
    }
  };

  const handleAddTheatre = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const form = e.currentTarget;
    
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
        if (form) {
          form.reset();
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add theatre');
      }
    } catch (error) {
      console.error('Failed to add theatre:', error);
      alert('Error adding theatre');
    }
  };

  const handleAddAllocation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const startTime = new Date(`${selectedDate}T${formData.get('startTime')}`);
    const endTime = new Date(`${selectedDate}T${formData.get('endTime')}`);
    
    const allocationData: any = {
      theatreId: formData.get('theatreId'),
      allocationType: formData.get('allocationType'),
      shift: formData.get('shift'),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      date: new Date(selectedDate).toISOString(),
      notes: formData.get('notes'),
      equipment: (formData.get('equipment') as string)
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      // Staff assignments
      scrubNurseId: formData.get('scrubNurseId') || null,
      circulatingNurseId: formData.get('circulatingNurseId') || null,
      anaestheticTechnicianId: formData.get('anaestheticTechnicianId') || null,
      anaesthetistConsultantId: formData.get('anaesthetistConsultantId') || null,
      anaesthetistSeniorRegistrarId: formData.get('anaesthetistSeniorRegistrarId') || null,
      anaesthetistRegistrarId: formData.get('anaesthetistRegistrarId') || null,
      cleanerId: formData.get('cleanerId') || null,
      porterId: formData.get('porterId') || null,
    };

    // Add surgery-specific fields if allocation type is SURGERY
    if (formData.get('allocationType') === 'SURGERY') {
      allocationData.surgicalUnit = formData.get('surgicalUnit');
      allocationData.surgeryType = formData.get('surgeryType');
    }
    
    try {
      const response = await fetch('/api/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allocationData),
      });

      if (response.ok) {
        setShowAddAllocation(false);
        fetchTheatres();
        fetchDailySummary();
        e.currentTarget.reset();
        setAllocationType('SURGERY');
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-4 border-b">
              <h2 className="text-2xl font-bold">Add Theatre Allocation</h2>
            </div>
            <form onSubmit={handleAddAllocation} className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div>
                <label className="label">Theatre Suite</label>
                <select 
                  name="theatreId" 
                  required 
                  className="input-field"
                  onChange={(e) => {
                    if (e.target.value && selectedDate && selectedShift) {
                      fetchRosterSuggestions(e.target.value, selectedDate, selectedShift);
                    }
                  }}
                >
                  <option value="">Select Theatre</option>
                  {THEATRES.map((theatre) => (
                    <option key={theatre} value={theatre}>
                      {theatre}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="label">Shift *</label>
                <select 
                  name="shift" 
                  required 
                  className="input-field"
                  value={selectedShift}
                  onChange={(e) => {
                    setSelectedShift(e.target.value);
                    const theatreSelect = document.querySelector('[name="theatreId"]') as HTMLSelectElement;
                    if (theatreSelect?.value && selectedDate) {
                      fetchRosterSuggestions(theatreSelect.value, selectedDate, e.target.value);
                    }
                  }}
                >
                  <option value="MORNING">Morning</option>
                  <option value="CALL">Call</option>
                  <option value="NIGHT">Night</option>
                </select>
              </div>
              
              <div>
                <label className="label">Allocation Type</label>
                <select 
                  name="allocationType" 
                  required 
                  className="input-field"
                  value={allocationType}
                  onChange={(e) => setAllocationType(e.target.value)}
                >
                  <option value="SURGERY">Surgery</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>

              {/* Surgery-specific fields */}
              {allocationType === 'SURGERY' && (
                <>
                  <div>
                    <label className="label">Operating Surgical Unit *</label>
                    <select name="surgicalUnit" required className="input-field">
                      <option value="">Select Surgical Unit</option>
                      <optgroup label="CTU">
                        <option value="CTU 1">CTU 1</option>
                        <option value="CTU 2">CTU 2</option>
                        <option value="CTU 3">CTU 3</option>
                        <option value="CTU 4">CTU 4</option>
                      </optgroup>
                      <optgroup label="Paediatric Surgery">
                        <option value="PAEDIATRIC SURGERY UNIT 1">Paediatric Surgery Unit 1</option>
                        <option value="PAEDIATRIC SURGERY UNIT 2">Paediatric Surgery Unit 2</option>
                        <option value="PAEDIATRIC SURGERY UNIT 3">Paediatric Surgery Unit 3</option>
                        <option value="PAEDIATRIC SURGERY UNIT 4">Paediatric Surgery Unit 4</option>
                      </optgroup>
                      <optgroup label="Plastic Surgery">
                        <option value="PLASTIC SURGERY UNIT 1">Plastic Surgery Unit 1</option>
                        <option value="PLASTIC SURGERY UNIT 2">Plastic Surgery Unit 2</option>
                        <option value="PLASTIC SURGERY UNIT 3">Plastic Surgery Unit 3</option>
                        <option value="PLASTIC SURGERY UNIT 4">Plastic Surgery Unit 4</option>
                      </optgroup>
                      <optgroup label="Urology">
                        <option value="UROLOGY UNIT 1">Urology Unit 1</option>
                        <option value="UROLOGY UNIT 2">Urology Unit 2</option>
                        <option value="UROLOGY UNIT 3">Urology Unit 3</option>
                        <option value="UROLOGY UNIT 4">Urology Unit 4</option>
                      </optgroup>
                      <optgroup label="General Surgery">
                        <option value="GENERAL SURGERY UNIT 1">General Surgery Unit 1</option>
                        <option value="GENERAL SURGERY UNIT 2">General Surgery Unit 2</option>
                        <option value="GENERAL SURGERY UNIT 3">General Surgery Unit 3</option>
                        <option value="GENERAL SURGERY UNIT 4">General Surgery Unit 4</option>
                      </optgroup>
                      <optgroup label="Ophthalmology">
                        <option value="OPHTHALMOLOGY UNIT 1">Ophthalmology Unit 1</option>
                        <option value="OPHTHALMOLOGY UNIT 2">Ophthalmology Unit 2</option>
                        <option value="OPHTHALMOLOGY UNIT 3">Ophthalmology Unit 3</option>
                        <option value="OPHTHALMOLOGY UNIT 4">Ophthalmology Unit 4</option>
                        <option value="OPHTHALMOLOGY UNIT 5">Ophthalmology Unit 5</option>
                        <option value="OPHTHALMOLOGY UNIT 6">Ophthalmology Unit 6</option>
                      </optgroup>
                      <optgroup label="Neurosurgery">
                        <option value="NEUROSURGERY UNIT 1">Neurosurgery Unit 1</option>
                        <option value="NEUROSURGERY UNIT 2">Neurosurgery Unit 2</option>
                        <option value="NEUROSURGERY UNIT 3">Neurosurgery Unit 3</option>
                        <option value="NEUROSURGERY UNIT 4">Neurosurgery Unit 4</option>
                      </optgroup>
                      <optgroup label="ENT">
                        <option value="ENT UNIT 1">ENT Unit 1</option>
                        <option value="ENT UNIT 2">ENT Unit 2</option>
                        <option value="ENT UNIT 3">ENT Unit 3</option>
                        <option value="ENT UNIT 4">ENT Unit 4</option>
                        <option value="ENT UNIT 5">ENT Unit 5</option>
                      </optgroup>
                      <optgroup label="O/G Firm">
                        <option value="O/G FIRM 1">O/G Firm 1</option>
                        <option value="O/G FIRM 2">O/G Firm 2</option>
                        <option value="O/G FIRM 3">O/G Firm 3</option>
                        <option value="O/G FIRM 4">O/G Firm 4</option>
                        <option value="O/G FIRM 5">O/G Firm 5</option>
                        <option value="O/G FIRM 6">O/G Firm 6</option>
                        <option value="O/G FIRM 7">O/G Firm 7</option>
                        <option value="O/G FIRM 8">O/G Firm 8</option>
                        <option value="O/G FIRM 9">O/G Firm 9</option>
                        <option value="O/G FIRM 10">O/G Firm 10</option>
                      </optgroup>
                      <optgroup label="Maxillofacial">
                        <option value="MAXILLOFACIAL UNIT 1">Maxillofacial Unit 1</option>
                        <option value="MAXILLOFACIAL UNIT 2">Maxillofacial Unit 2</option>
                        <option value="MAXILLOFACIAL UNIT 3">Maxillofacial Unit 3</option>
                        <option value="MAXILLOFACIAL UNIT 4">Maxillofacial Unit 4</option>
                        <option value="MAXILLOFACIAL UNIT 5">Maxillofacial Unit 5</option>
                        <option value="MAXILLOFACIAL UNIT 6">Maxillofacial Unit 6</option>
                      </optgroup>
                      <optgroup label="Orthopedic Surgery">
                        <option value="ORTHOPEDIC SURGERY UNIT 1">Orthopedic Surgery Unit 1</option>
                        <option value="ORTHOPEDIC SURGERY UNIT 2">Orthopedic Surgery Unit 2</option>
                        <option value="ORTHOPEDIC SURGERY UNIT 3">Orthopedic Surgery Unit 3</option>
                        <option value="ORTHOPEDIC SURGERY UNIT 4">Orthopedic Surgery Unit 4</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="label">Surgery Type *</label>
                    <select name="surgeryType" required className="input-field">
                      <option value="">Select Surgery Type</option>
                      <option value="ELECTIVE">Elective</option>
                      <option value="URGENT">Urgent</option>
                      <option value="EMERGENCY">Emergency</option>
                    </select>
                  </div>
                </>
              )}

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

              {/* Staff Assignments Section */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Staff Assignments
                  {autofilledStaff && (
                    <span className="ml-2 text-sm text-green-600 font-normal">
                      (Auto-filled from roster)
                    </span>
                  )}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-2">
                  {/* Scrub Nurse */}
                  <div>
                    <label className="label">Scrub Nurse</label>
                    <select name="scrubNurseId" className="input-field">
                      <option value="">Select Scrub Nurse</option>
                      {scrubNurses.map((nurse) => (
                        <option key={nurse.id} value={nurse.id}>
                          {nurse.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Circulating Nurse */}
                  <div>
                    <label className="label">Circulating Nurse</label>
                    <select name="circulatingNurseId" className="input-field">
                      <option value="">Select Circulating Nurse</option>
                      {circulatingNurses.map((nurse) => (
                        <option key={nurse.id} value={nurse.id}>
                          {nurse.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Anaesthetic Technician */}
                  <div>
                    <label className="label">Anaesthetic Technician</label>
                    <select name="anaestheticTechnicianId" className="input-field">
                      <option value="">Select Anaesthetic Technician</option>
                      {anaestheticTechnicians.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Anaesthetist - Consultant */}
                  <div>
                    <label className="label">Anaesthetist (Consultant)</label>
                    <select name="anaesthetistConsultantId" className="input-field">
                      <option value="">Select Consultant</option>
                      {anaesthetists.map((anaesthetist) => (
                        <option key={anaesthetist.id} value={anaesthetist.id}>
                          {anaesthetist.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Anaesthetist - Senior Registrar */}
                  <div>
                    <label className="label">Anaesthetist (Senior Registrar)</label>
                    <select name="anaesthetistSeniorRegistrarId" className="input-field">
                      <option value="">Select Senior Registrar</option>
                      {anaesthetists.map((anaesthetist) => (
                        <option key={anaesthetist.id} value={anaesthetist.id}>
                          {anaesthetist.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Anaesthetist - Registrar */}
                  <div>
                    <label className="label">Anaesthetist (Registrar)</label>
                    <select name="anaesthetistRegistrarId" className="input-field">
                      <option value="">Select Registrar</option>
                      {anaesthetists.map((anaesthetist) => (
                        <option key={anaesthetist.id} value={anaesthetist.id}>
                          {anaesthetist.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Cleaner */}
                  <div>
                    <label className="label">Cleaner</label>
                    <select name="cleanerId" className="input-field">
                      <option value="">Select Cleaner</option>
                      {cleaners.map((cleaner) => (
                        <option key={cleaner.id} value={cleaner.id}>
                          {cleaner.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Porter */}
                  <div>
                    <label className="label">Porter</label>
                    <select name="porterId" className="input-field">
                      <option value="">Select Porter</option>
                      {porters.map((porter) => (
                        <option key={porter.id} value={porter.id}>
                          {porter.fullName || 'Not assigned'}
                        </option>
                      ))}
                    </select>
                  </div>
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
            </form>
            <div className="sticky bottom-0 bg-white z-10 px-6 py-4 border-t flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowAddAllocation(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="allocation-form"
                className="btn-primary"
              >
                Add Allocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
