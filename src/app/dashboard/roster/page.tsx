'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Upload, Users, Clock, Building2, Plus, Trash2, Download, ClipboardCheck, Pencil, Check, X } from 'lucide-react';
// XLSX loaded dynamically when needed (export/import actions)
import { THEATRES } from '@/lib/constants';

interface Roster {
  id: string;
  staffName: string;
  staffCategory: string;
  date: string;
  shift: string;
  theatreId?: string;
  theatre?: { id: string; name: string };
  user: { id: string; fullName: string; role: string };
  notes?: string;
}

interface Theatre {
  id: string;
  name: string;
}

interface EditRosterForm {
  staffName: string;
  staffCategory: string;
  date: string;
  shift: string;
  theatreId: string;
  notes: string;
  editReason: string;
}

export default function RosterPage() {
  const router = useRouter();
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditRosterForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const staffCategories = [
    { value: 'ALL', label: 'All Staff' },
    { value: 'NURSES', label: 'Nurses' },
    { value: 'ANAESTHETISTS', label: 'Anaesthetists' },
    { value: 'PORTERS', label: 'Porters' },
    { value: 'CLEANERS', label: 'Cleaners' },
    { value: 'ANAESTHETIC_TECHNICIANS', label: 'Anaesthetic Technicians' },
    { value: 'PHARMACISTS', label: 'Pharmacists' },
    { value: 'RECOVERY_NURSES', label: 'Nurse Anaesthetists' },
  ];

  useEffect(() => {
    fetchRosters();
    fetchTheatres();
    // Auto-refresh every 60 seconds for cross-device sync
    const interval = setInterval(fetchRosters, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedDate]);

  const fetchRosters = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'ALL') {
        params.append('staffCategory', selectedCategory);
      }
      if (selectedDate) {
        params.append('date', selectedDate);
      }

      const response = await fetch(`/api/roster?${params}`);
      if (response.ok) {
        const data = await response.json();
        setRosters(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch rosters:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTheatres = async () => {
    try {
      const response = await fetch('/api/theatres');
      if (response.ok) {
        const data = await response.json();
        setTheatres(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch theatres:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Transform Excel data to roster format
      const rosterData = jsonData.map((row: any) => ({
        name: row.Name || row.name || '',
        date: row.Date || row.date || '',
        theatre: row.Theatre || row.theatre || '',
        shift: row.Shift || row.shift || row.Duty || row.duty || '',
        seniorityLevel: row['Seniority Level'] || row.seniorityLevel || row.SeniorityLevel || row.Level || row.level || '',
        notes: row.Notes || row.notes || '',
      }));

      // Upload to backend
      const response = await fetch('/api/roster/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rosters: rosterData,
          staffCategory: category,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setUploadResult(result);
        fetchRosters();
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.error}`);
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert('Failed to process Excel file');
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const deleteRoster = async (id: string) => {
    if (!confirm('Delete this roster entry?')) return;

    try {
      const response = await fetch(`/api/roster?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchRosters();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const startEditing = (roster: Roster) => {
    setEditingRosterId(roster.id);
    setEditForm({
      staffName: roster.staffName,
      staffCategory: roster.staffCategory,
      date: new Date(roster.date).toISOString().slice(0, 10),
      shift: roster.shift,
      theatreId: roster.theatreId || '',
      notes: roster.notes || '',
      editReason: '',
    });
  };

  const cancelEditing = () => {
    setEditingRosterId(null);
    setEditForm(null);
  };

  const hasEditChanges = (roster: Roster) => {
    if (!editForm) return false;
    return (
      editForm.staffName.trim() !== roster.staffName ||
      editForm.staffCategory !== roster.staffCategory ||
      editForm.date !== new Date(roster.date).toISOString().slice(0, 10) ||
      editForm.shift !== roster.shift ||
      editForm.theatreId !== (roster.theatreId || '') ||
      editForm.notes.trim() !== (roster.notes || '')
    );
  };

  const saveEdit = async (roster: Roster) => {
    if (!editForm) return;
    if (!hasEditChanges(roster)) {
      alert('No changes detected to save.');
      return;
    }
    if (editForm.editReason.trim().length < 5) {
      alert('Please provide a reason for this edit (minimum 5 characters).');
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch('/api/roster', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roster.id,
          staffName: editForm.staffName.trim(),
          staffCategory: editForm.staffCategory,
          date: editForm.date,
          shift: editForm.shift,
          theatreId: editForm.theatreId || null,
          notes: editForm.notes.trim() || null,
          editReason: editForm.editReason.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(`Update failed: ${data.error || response.statusText}`);
        return;
      }

      cancelEditing();
      fetchRosters();
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update roster entry');
    } finally {
      setSavingEdit(false);
    }
  };

  const downloadTemplate = async (category?: string) => {
    const XLSX = await import('xlsx');
    
    if (category === 'ANAESTHETISTS') {
      // Special template for anaesthetists with seniority level columns
      const template = [
        {
          Name: 'Dr. John Doe',
          'Seniority Level': 'CONSULTANT',
          Date: '2025-12-15',
          Theatre: 'NEUROSURGERY THEATRE',
          Shift: 'MORNING',
          Notes: 'Optional notes',
        },
        {
          Name: 'Dr. Jane Smith',
          'Seniority Level': 'SENIOR_REGISTRAR',
          Date: '2025-12-15',
          Theatre: 'NEUROSURGERY THEATRE',
          Shift: 'MORNING',
          Notes: '',
        },
        {
          Name: 'Dr. Mike Johnson',
          'Seniority Level': 'REGISTRAR',
          Date: '2025-12-15',
          Theatre: 'NEUROSURGERY THEATRE',
          Shift: 'CALL',
          Notes: '',
        },
      ];
      const ws = XLSX.utils.json_to_sheet(template);
      // Set column widths
      ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Anaesthetist Roster');
      XLSX.writeFile(wb, 'anaesthetist_roster_template.xlsx');
    } else {
      const template = [
        {
          Name: 'John Doe',
          Date: '2025-12-15',
          Theatre: 'NEUROSURGERY THEATRE',
          Shift: 'MORNING',
          Notes: 'Optional notes',
        },
      ];
      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roster Template');
      XLSX.writeFile(wb, 'roster_template.xlsx');
    }
  };

  const getShiftBadge = (shift: string) => {
    const colors: any = {
      MORNING: 'bg-blue-100 text-blue-800',
      CALL: 'bg-orange-100 text-orange-800',
      NIGHT: 'bg-purple-100 text-purple-800',
    };
    return colors[shift] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryBadge = (category: string) => {
    const colors: any = {
      NURSES: 'bg-green-100 text-green-800',
      ANAESTHETISTS: 'bg-red-100 text-red-800',
      PORTERS: 'bg-yellow-100 text-yellow-800',
      CLEANERS: 'bg-indigo-100 text-indigo-800',
      ANAESTHETIC_TECHNICIANS: 'bg-pink-100 text-pink-800',
      PHARMACISTS: 'bg-cyan-100 text-cyan-800',
      RECOVERY_NURSES: 'bg-purple-100 text-purple-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const filteredRosters = rosters;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Duty Roster Management</h1>
          <p className="text-gray-600 mt-2">Upload and manage staff duty rosters</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadTemplate()} className="btn-secondary">
            <Download className="w-5 h-5 mr-2" />
            General Template
          </button>
          <button onClick={() => downloadTemplate('ANAESTHETISTS')} className="btn-secondary">
            <Download className="w-5 h-5 mr-2" />
            Anaesthetist Template
          </button>
        </div>
      </div>

      {/* Weekly forms call-out */}
      <Link
        href="/dashboard/roster/weekly"
        className="block rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-indigo-50 p-5 hover:shadow-md transition"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary-600 text-white">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-primary-900">Weekly Roster Forms</h2>
            <p className="text-sm text-primary-800 mt-1">
              Unit leads — submit your group&apos;s weekly roster (Nurses, Anaesthetists, Anaesthetic Technicians,
              Porters, Cleaners, Pharmacists, Nurse Anaesthetists) <strong>every Saturday before 5:00 PM</strong>.
              Separate forms cover the Main Theatre Complex and the Accident &amp; Emergency Theatre.
            </p>
            <p className="text-xs font-semibold text-primary-700 mt-2">Open weekly forms →</p>
          </div>
        </div>
      </Link>

      {/* Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {staffCategories.slice(1).map((category) => (
          <div key={category.value} className="card">
            <div className="flex items-center justify-between mb-3">
              <Users className="w-5 h-5 text-primary-600" />
              <span className={`px-2 py-1 rounded text-xs font-semibold ${getCategoryBadge(category.value)}`}>
                {category.label}
              </span>
            </div>
            <label className="btn-primary cursor-pointer text-sm">
              <Upload className="w-4 h-4 mr-2" />
              Upload Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFileUpload(e, category.value)}
                disabled={uploading}
              />
            </label>
          </div>
        ))}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`card ${uploadResult.errors > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
          <h3 className="font-semibold mb-2">Upload Results</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Created:</span>
              <span className="ml-2 font-semibold text-green-600">{uploadResult.created}</span>
            </div>
            <div>
              <span className="text-gray-600">Errors:</span>
              <span className="ml-2 font-semibold text-red-600">{uploadResult.errors}</span>
            </div>
          </div>
          {uploadResult.details.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold mb-2">Errors:</p>
              <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                {uploadResult.details.errors.map((err: any, idx: number) => (
                  <div key={idx} className="text-red-600">
                    Row {err.row}: {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Staff Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-field"
              title="Filter by staff category"
              aria-label="Filter by staff category"
            >
              {staffCategories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field"
              title="Filter by date"
              aria-label="Filter by date"
            />
          </div>
        </div>
      </div>

      {/* Roster List */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Roster Entries ({filteredRosters.length})</h2>
        
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : filteredRosters.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No roster entries found. Upload an Excel file to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Staff Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Shift</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Theatre</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Notes</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRosters.map((roster) => {
                  const isEditing = editingRosterId === roster.id && !!editForm;
                  const changed = isEditing ? hasEditChanges(roster) : false;

                  return (
                    <tr key={roster.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <input
                            className="input-field"
                            value={editForm.staffName}
                            onChange={(e) => setEditForm((prev) => prev ? { ...prev, staffName: e.target.value } : prev)}
                            title="Edit staff name"
                            aria-label="Edit staff name"
                          />
                        ) : roster.staffName}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <select
                            className="input-field"
                            value={editForm.staffCategory}
                            onChange={(e) => setEditForm((prev) => prev ? { ...prev, staffCategory: e.target.value } : prev)}
                            title="Edit staff category"
                            aria-label="Edit staff category"
                          >
                            {staffCategories.slice(1).map((cat) => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getCategoryBadge(roster.staffCategory)}`}>
                            {roster.staffCategory.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <input
                            type="date"
                            className="input-field"
                            value={editForm.date}
                            onChange={(e) => setEditForm((prev) => prev ? { ...prev, date: e.target.value } : prev)}
                            title="Edit roster date"
                            aria-label="Edit roster date"
                          />
                        ) : new Date(roster.date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <select
                            className="input-field"
                            value={editForm.shift}
                            onChange={(e) => setEditForm((prev) => prev ? { ...prev, shift: e.target.value } : prev)}
                            title="Edit shift"
                            aria-label="Edit shift"
                          >
                            <option value="MORNING">MORNING</option>
                            <option value="CALL">CALL</option>
                            <option value="NIGHT">NIGHT</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getShiftBadge(roster.shift)}`}>
                            {roster.shift}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <select
                            className="input-field"
                            value={editForm.theatreId}
                            onChange={(e) => setEditForm((prev) => prev ? { ...prev, theatreId: e.target.value } : prev)}
                            title="Edit theatre"
                            aria-label="Edit theatre"
                          >
                            <option value="">Any</option>
                            {theatres.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        ) : (roster.theatre?.name || 'Any')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {isEditing ? (
                          <div className="space-y-2 min-w-[220px]">
                            <input
                              type="text"
                              className="input-field"
                              placeholder="Notes (optional)"
                              value={editForm.notes}
                              onChange={(e) => setEditForm((prev) => prev ? { ...prev, notes: e.target.value } : prev)}
                              title="Edit notes"
                              aria-label="Edit notes"
                            />
                            {changed && (
                              <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
                                <label className="label mb-1">Reason for edit <span className="text-red-600">*</span></label>
                                <textarea
                                  className="input-field"
                                  rows={2}
                                  placeholder="Why are you editing this roster entry?"
                                  value={editForm.editReason}
                                  onChange={(e) => setEditForm((prev) => prev ? { ...prev, editReason: e.target.value } : prev)}
                                  title="Reason for edit"
                                  aria-label="Reason for edit"
                                />
                              </div>
                            )}
                          </div>
                        ) : (roster.notes || '-')}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(roster)}
                              disabled={savingEdit || !changed || editForm.editReason.trim().length < 5}
                              className="text-green-600 hover:text-green-800 disabled:opacity-40"
                              title="Save edit"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={savingEdit}
                              className="text-gray-600 hover:text-gray-800"
                              title="Cancel edit"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => startEditing(roster)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Edit roster"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteRoster(roster.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Delete roster"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
