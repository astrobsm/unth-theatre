'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, CheckCircle, Clock, AlertCircle, Calendar, User, Plus } from 'lucide-react';

interface WHOChecklist {
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
  signInCompleted: boolean;
  timeOutCompleted: boolean;
  signOutCompleted: boolean;
  createdAt: string;
}

export default function ChecklistsPage() {
  const router = useRouter();
  const [checklists, setChecklists] = useState<WHOChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchChecklists();
  }, []);

  const fetchChecklists = async () => {
    try {
      const response = await fetch('/api/checklists');
      if (response.ok) {
        const data = await response.json();
        setChecklists(data);
      }
    } catch (error) {
      console.error('Failed to fetch checklists:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChecklistStatus = (checklist: WHOChecklist) => {
    if (checklist.signInCompleted && checklist.timeOutCompleted && checklist.signOutCompleted) {
      return { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    }
    if (!checklist.signInCompleted) {
      return { label: 'Sign-In Pending', color: 'bg-blue-100 text-blue-800', icon: Clock };
    }
    if (!checklist.timeOutCompleted) {
      return { label: 'Time-Out Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
    }
    if (!checklist.signOutCompleted) {
      return { label: 'Sign-Out Pending', color: 'bg-orange-100 text-orange-800', icon: Clock };
    }
    return { label: 'Unknown', color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
  };

  const getProgress = (checklist: WHOChecklist) => {
    let completed = 0;
    if (checklist.signInCompleted) completed++;
    if (checklist.timeOutCompleted) completed++;
    if (checklist.signOutCompleted) completed++;
    return Math.round((completed / 3) * 100);
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

  const filteredChecklists = checklists.filter((c) => {
    if (statusFilter === 'all') return true;
    const status = getChecklistStatus(c);
    if (statusFilter === 'completed') return status.label === 'Completed';
    if (statusFilter === 'pending') return status.label !== 'Completed';
    return true;
  });

  const totalChecklists = checklists.length;
  const completedChecklists = checklists.filter(
    (c) => c.signInCompleted && c.timeOutCompleted && c.signOutCompleted
  ).length;
  const pendingChecklists = totalChecklists - completedChecklists;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WHO Surgical Safety Checklists</h1>
          <p className="text-gray-600 mt-1">Track and complete surgical safety checklists</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/checklists/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Checklist
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
          <p className="text-sm text-gray-600 font-medium">Total Checklists</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalChecklists}</p>
        </div>
        <div className="card bg-gradient-to-br from-green-50 to-green-100">
          <p className="text-sm text-gray-600 font-medium">Completed</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{completedChecklists}</p>
        </div>
        <div className="card bg-gradient-to-br from-orange-50 to-orange-100">
          <p className="text-sm text-gray-600 font-medium">Pending</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">{pendingChecklists}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <label className="label">Filter by Status</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field max-w-md"
        >
          <option value="all">All Checklists ({totalChecklists})</option>
          <option value="completed">Completed ({completedChecklists})</option>
          <option value="pending">Pending ({pendingChecklists})</option>
        </select>
      </div>

      {/* Checklists List */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading checklists...</p>
          </div>
        ) : filteredChecklists.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No checklists found</p>
            <p className="text-sm mt-2">
              {statusFilter !== 'all'
                ? 'Try adjusting your filter'
                : 'Checklists will appear here when surgeries are scheduled'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredChecklists.map((checklist) => {
              const status = getChecklistStatus(checklist);
              const progress = getProgress(checklist);
              const StatusIcon = status.icon;

              return (
                <div
                  key={checklist.id}
                  className="border border-gray-200 rounded-lg p-5 hover:border-primary-300 hover:bg-primary-50/30 transition-all cursor-pointer"
                  onClick={() => router.push(`/dashboard/checklists/${checklist.id}`)}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {checklist.surgery.patient.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {checklist.surgery.patient.folderNumber}
                        </p>
                        <p className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">Procedure:</span>{' '}
                          {checklist.surgery.procedureName}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Surgeon:</span>{' '}
                          {checklist.surgery.surgeon.fullName}
                        </p>

                        <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDateTime(checklist.surgery.scheduledDate)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 md:items-end md:min-w-[200px]">
                      <span className={`px-4 py-2 rounded-full text-sm font-medium ${status.color} flex items-center gap-2`}>
                        <StatusIcon className="w-4 h-4" />
                        {status.label}
                      </span>

                      <div className="w-full">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>Progress</span>
                          <span className="font-medium">{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-gray-500">
                          <span className={checklist.signInCompleted ? 'text-green-600' : ''}>
                            Sign-In
                          </span>
                          <span className={checklist.timeOutCompleted ? 'text-green-600' : ''}>
                            Time-Out
                          </span>
                          <span className={checklist.signOutCompleted ? 'text-green-600' : ''}>
                            Sign-Out
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
