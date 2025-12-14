'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, Calendar, User, FileText, Plus } from 'lucide-react';

interface Cancellation {
  id: string;
  surgery: {
    procedureName: string;
    scheduledDate: string;
    patient: {
      name: string;
      folderNumber: string;
    };
    surgeon: {
      fullName: string;
    };
  };
  category: string;
  reason: string;
  cancelledAt: string;
  cancelledBy: {
    fullName: string;
  };
}

export default function CancellationsPage() {
  const router = useRouter();
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    fetchCancellations();
  }, []);

  const fetchCancellations = async () => {
    try {
      const response = await fetch('/api/cancellations');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setCancellations(data);
        } else {
          console.error('API returned non-array data:', data);
          setCancellations([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch cancellations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      PATIENT_CONDITION: 'bg-red-100 text-red-800',
      EQUIPMENT_FAILURE: 'bg-orange-100 text-orange-800',
      STAFF_UNAVAILABILITY: 'bg-yellow-100 text-yellow-800',
      EMERGENCY_PRIORITY: 'bg-purple-100 text-purple-800',
      PATIENT_REQUEST: 'bg-blue-100 text-blue-800',
      ADMINISTRATIVE: 'bg-gray-100 text-gray-800',
      OTHER: 'bg-pink-100 text-pink-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const categories = [
    'PATIENT_CONDITION',
    'EQUIPMENT_FAILURE',
    'STAFF_UNAVAILABILITY',
    'EMERGENCY_PRIORITY',
    'PATIENT_REQUEST',
    'ADMINISTRATIVE',
    'OTHER',
  ];

  const filteredCancellations = Array.isArray(cancellations) ? cancellations.filter(
    (c) => !categoryFilter || c.category === categoryFilter
  ) : [];

  const categoryCounts = categories.reduce((acc, cat) => {
    acc[cat] = Array.isArray(cancellations) ? cancellations.filter((c) => c.category === cat).length : 0;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surgery Cancellations</h1>
          <p className="text-gray-600 mt-1">Track and analyze cancelled surgical procedures</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/cancellations/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Record Cancellation
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-red-50 to-red-100">
          <p className="text-sm text-gray-600 font-medium">Total Cancellations</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{cancellations.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Patient Condition</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{categoryCounts.PATIENT_CONDITION || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Equipment Issues</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{categoryCounts.EQUIPMENT_FAILURE || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Staff Issues</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{categoryCounts.STAFF_UNAVAILABILITY || 0}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <label className="label">Filter by Category</label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input-field max-w-md"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.replace(/_/g, ' ')} ({categoryCounts[cat] || 0})
            </option>
          ))}
        </select>
      </div>

      {/* Cancellations List */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading cancellations...</p>
          </div>
        ) : filteredCancellations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No cancellations found</p>
            <p className="text-sm mt-2">
              {categoryFilter ? 'Try adjusting your filter' : 'No surgeries have been cancelled'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCancellations.map((cancellation) => (
              <div
                key={cancellation.id}
                className="border border-gray-200 rounded-lg p-5 hover:border-red-300 hover:bg-red-50/30 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <XCircle className="w-6 h-6 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {cancellation.surgery.patient.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {cancellation.surgery.patient.folderNumber}
                        </p>
                        <p className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">Procedure:</span>{' '}
                          {cancellation.surgery.procedureName}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Surgeon:</span>{' '}
                          {cancellation.surgery.surgeon.fullName}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 mb-1">Reason for Cancellation:</p>
                      <p className="text-sm text-gray-600">{cancellation.reason}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:items-end">
                    <span
                      className={`px-4 py-2 rounded-full text-sm font-medium ${getCategoryColor(
                        cancellation.category
                      )}`}
                    >
                      {cancellation.category.replace(/_/g, ' ')}
                    </span>

                    <div className="text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>Scheduled: {formatDateTime(cancellation.surgery.scheduledDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="w-4 h-4" />
                        <span>Cancelled by: {cancellation.cancelledBy.fullName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <FileText className="w-4 h-4" />
                        <span>{formatDateTime(cancellation.cancelledAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
