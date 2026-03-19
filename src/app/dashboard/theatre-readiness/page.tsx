'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { THEATRES } from '@/lib/constants';

interface StaffAssignments {
  scrubNurse: string | null;
  circulatingNurse: string | null;
  anaestheticTechnician: string | null;
  anaesthetistConsultant: string | null;
  anaesthetistSeniorRegistrar: string | null;
  anaesthetistRegistrar: string | null;
  cleaner: string | null;
  porter: string | null;
  shift: string | null;
  surgicalUnit: string | null;
  startTime: string | null;
  endTime: string | null;
}

interface TheatreStatus {
  theatreId: string;
  theatreName: string;
  theatreStatus: string;
  hasSetupLog: boolean;
  setupStatus: string;
  isReady: boolean;
  technicianName: string | null;
  technicianCode: string | null;
  setupStartTime: string | null;
  readyTime: string | null;
  locationName: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  distanceFromFacility: number | null;
  malfunctioningEquipment: number;
  blockingIssues: string | null;
  setupNotes: string | null;
  durationMinutes: number | null;
  staffAssignments: StaffAssignments | null;
  totalAllocations: number;
}

interface Statistics {
  totalTheatres: number;
  readyTheatres: number;
  inProgressTheatres: number;
  notStartedTheatres: number;
  blockedTheatres: number;
  totalMalfunctions: number;
}

export default function TheatreReadinessDashboard() {
  const [theatreStatus, setTheatreStatus] = useState<TheatreStatus[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchTheatreStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTheatreStatus, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const fetchTheatreStatus = async () => {
    try {
      const response = await fetch(`/api/anesthesia-setup/theatre-status?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setTheatreStatus(data.theatreStatus || []);
        setStatistics(data.statistics || null);
      }
    } catch (error) {
      console.error('Error fetching theatre status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'BLOCKED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'READY':
        return '✅';
      case 'IN_PROGRESS':
        return '⏳';
      case 'BLOCKED':
        return '🚫';
      default:
        return '⭕';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading theatre status...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-gray-900">Theatre Readiness Status</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium ${selectedDate === new Date().toISOString().split('T')[0] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Today
          </button>
          <button
            onClick={() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              setSelectedDate(tomorrow.toISOString().split('T')[0]);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium ${(() => { const t = new Date(); t.setDate(t.getDate() + 1); return selectedDate === t.toISOString().split('T')[0]; })() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Tomorrow
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input-field"
          />
          <button onClick={fetchTheatreStatus} className="btn-secondary">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card text-center">
            <div className="text-3xl font-bold text-gray-900">{statistics.totalTheatres}</div>
            <div className="text-sm text-gray-600">Total Theatres</div>
          </div>
          <div className="card text-center bg-green-50">
            <div className="text-3xl font-bold text-green-700">{statistics.readyTheatres}</div>
            <div className="text-sm text-green-600">Ready</div>
          </div>
          <div className="card text-center bg-yellow-50">
            <div className="text-3xl font-bold text-yellow-700">{statistics.inProgressTheatres}</div>
            <div className="text-sm text-yellow-600">In Progress</div>
          </div>
          <div className="card text-center bg-gray-50">
            <div className="text-3xl font-bold text-gray-700">{statistics.notStartedTheatres}</div>
            <div className="text-sm text-gray-600">Not Started</div>
          </div>
          <div className="card text-center bg-red-50">
            <div className="text-3xl font-bold text-red-700">{statistics.blockedTheatres}</div>
            <div className="text-sm text-red-600">Blocked</div>
          </div>
          <div className="card text-center bg-orange-50">
            <div className="text-3xl font-bold text-orange-700">{statistics.totalMalfunctions}</div>
            <div className="text-sm text-orange-600">Malfunctions</div>
          </div>
        </div>
      )}

      {/* Theatre Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {theatreStatus.map((theatre) => (
          <div
            key={theatre.theatreId}
            className={`card border-2 ${getStatusColor(theatre.setupStatus)}`}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg">{theatre.theatreName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl">{getStatusIcon(theatre.setupStatus)}</span>
                  <span className="text-sm font-semibold">{theatre.setupStatus.replace('_', ' ')}</span>
                </div>
              </div>
              {theatre.isReady && (
                <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                  READY
                </div>
              )}
            </div>

            {theatre.hasSetupLog ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">👤 Technician:</span>
                  <span>{theatre.technicianName}</span>
                  {theatre.technicianCode && (
                    <span className="badge badge-secondary text-xs">{theatre.technicianCode}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold">⏰ Started:</span>
                  <span>{theatre.setupStartTime ? new Date(theatre.setupStartTime).toLocaleTimeString() : 'N/A'}</span>
                </div>

                {theatre.readyTime && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">✅ Ready:</span>
                    <span>{new Date(theatre.readyTime).toLocaleTimeString()}</span>
                    {theatre.durationMinutes && (
                      <span className="text-xs text-gray-600">({theatre.durationMinutes} min)</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="font-semibold">📍 Location:</span>
                  <span className="text-xs">{theatre.locationName || 'N/A'}</span>
                  {theatre.locationAccuracy && (
                    <span className="text-xs text-gray-500">(±{theatre.locationAccuracy}m)</span>
                  )}
                </div>

                {theatre.locationAddress && (
                  <div className="text-xs text-gray-600 italic">
                    {theatre.locationAddress}
                  </div>
                )}

                {theatre.distanceFromFacility != null && (
                  <div className={`text-xs font-medium mt-1 px-2 py-1 rounded ${
                    theatre.distanceFromFacility < 1
                      ? 'bg-green-100 text-green-800'
                      : theatre.distanceFromFacility < 5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }`}>
                    📏 {theatre.distanceFromFacility < 1
                      ? `${Math.round(theatre.distanceFromFacility * 1000)}m from UNTH`
                      : `${theatre.distanceFromFacility}km from UNTH`}
                    {theatre.distanceFromFacility >= 5 && ' ⚠️ Far from facility'}
                  </div>
                )}

                {theatre.malfunctioningEquipment > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                    <div className="flex items-center gap-2 text-red-700">
                      <span className="font-semibold">⚠️ Malfunctions:</span>
                      <span className="font-bold">{theatre.malfunctioningEquipment}</span>
                    </div>
                  </div>
                )}

                {theatre.blockingIssues && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                    <div className="text-xs font-semibold text-yellow-800">Blocking Issues:</div>
                    <div className="text-xs text-yellow-700">{theatre.blockingIssues}</div>
                  </div>
                )}

                {theatre.setupNotes && (
                  <div className="text-xs text-gray-600 mt-2">
                    <span className="font-semibold">Notes:</span> {theatre.setupNotes}
                  </div>
                )}

                {theatre.latitude && theatre.longitude && (
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps?q=${theatre.latitude},${theatre.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      📌 View on Map
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <div className="text-3xl mb-2">⭕</div>
                <div className="text-sm">No setup logged yet</div>
              </div>
            )}

            {/* Staff Assignments for the Day */}
            {theatre.staffAssignments ? (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1">
                  👥 Staff Assignments
                  {theatre.staffAssignments.shift && (
                    <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {theatre.staffAssignments.shift}
                    </span>
                  )}
                </h4>
                {theatre.staffAssignments.surgicalUnit && (
                  <div className="text-xs mb-2 text-purple-700 font-medium bg-purple-50 px-2 py-1 rounded">
                    🏥 {theatre.staffAssignments.surgicalUnit}
                  </div>
                )}
                {theatre.staffAssignments.startTime && theatre.staffAssignments.endTime && (
                  <div className="text-xs mb-2 text-gray-600">
                    🕐 {new Date(theatre.staffAssignments.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {new Date(theatre.staffAssignments.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1 text-xs">
                  {theatre.staffAssignments.scrubNurse && (
                    <div className="flex justify-between bg-blue-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Scrub Nurse:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.scrubNurse}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.circulatingNurse && (
                    <div className="flex justify-between bg-blue-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Circulating Nurse:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.circulatingNurse}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.anaestheticTechnician && (
                    <div className="flex justify-between bg-green-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Anaesthetic Tech:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.anaestheticTechnician}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.anaesthetistConsultant && (
                    <div className="flex justify-between bg-green-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Consultant:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.anaesthetistConsultant}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.anaesthetistSeniorRegistrar && (
                    <div className="flex justify-between bg-green-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Senior Registrar:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.anaesthetistSeniorRegistrar}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.anaesthetistRegistrar && (
                    <div className="flex justify-between bg-green-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Registrar:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.anaesthetistRegistrar}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.cleaner && (
                    <div className="flex justify-between bg-gray-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Cleaner:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.cleaner}</span>
                    </div>
                  )}
                  {theatre.staffAssignments.porter && (
                    <div className="flex justify-between bg-gray-50 px-2 py-1 rounded">
                      <span className="text-gray-600">Porter:</span>
                      <span className="font-semibold text-gray-900">{theatre.staffAssignments.porter}</span>
                    </div>
                  )}
                  {!theatre.staffAssignments.scrubNurse && !theatre.staffAssignments.circulatingNurse && !theatre.staffAssignments.anaestheticTechnician && !theatre.staffAssignments.anaesthetistConsultant && !theatre.staffAssignments.cleaner && !theatre.staffAssignments.porter && (
                    <div className="text-gray-500 text-center py-1">No staff assigned yet</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-gray-200 text-center text-xs text-gray-400">
                No allocation for this date
              </div>
            )}
          </div>
        ))}
      </div>

      {theatreStatus.length === 0 && (
        <div className="card text-center py-8 text-gray-500">
          No theatres found
        </div>
      )}
    </div>
  );
}
