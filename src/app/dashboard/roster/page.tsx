'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Upload, Users, Clock, Building2, Plus, Trash2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
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

export default function RosterPage() {
  const router = useRouter();
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [uploadResult, setUploadResult] = useState<any>(null);

  const staffCategories = [
    { value: 'ALL', label: 'All Staff' },
    { value: 'NURSES', label: 'Nurses' },
    { value: 'ANAESTHETISTS', label: 'Anaesthetists' },
    { value: 'PORTERS', label: 'Porters' },
    { value: 'CLEANERS', label: 'Cleaners' },
    { value: 'ANAESTHETIC_TECHNICIANS', label: 'Anaesthetic Technicians' },
  ];

  useEffect(() => {
    fetchRosters();
    fetchTheatres();
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
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Transform Excel data to roster format
      const rosterData = jsonData.map((row: any) => ({
        name: row.Name || row.name || '',
        date: row.Date || row.date || '',
        theatre: row.Theatre || row.theatre || '',
        shift: row.Shift || row.shift || row.Duty || row.duty || '',
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

  const downloadTemplate = () => {
    const template = [
      {
        Name: 'John Doe',
        Date: '2025-12-15',
        Theatre: 'Main Theatre 1',
        Shift: 'MORNING',
        Notes: 'Optional notes',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roster Template');
    XLSX.writeFile(wb, 'roster_template.xlsx');
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
        <button onClick={downloadTemplate} className="btn-secondary">
          <Download className="w-5 h-5 mr-2" />
          Download Template
        </button>
      </div>

      {/* Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                {filteredRosters.map((roster) => (
                  <tr key={roster.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{roster.staffName}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getCategoryBadge(roster.staffCategory)}`}>
                        {roster.staffCategory.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(roster.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getShiftBadge(roster.shift)}`}>
                        {roster.shift}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{roster.theatre?.name || 'Any'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{roster.notes || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => deleteRoster(roster.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
