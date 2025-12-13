'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface StaffPerformance {
  id: string;
  name: string;
  staffCode: string | null;
  role: string;
  totalTasks: number;
  totalHours: string;
  averageRating: string;
  cleaningTasks: number;
  transportTasks: number;
  otherDuties: number;
}

interface CleaningLog {
  id: string;
  cleanerName: string;
  theatreName: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  status: string;
  cleaningType: string | null;
}

interface TransportLog {
  id: string;
  porterName: string;
  patientName: string;
  fromLocation: string;
  toLocation: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  status: string;
}

interface DutyLog {
  id: string;
  staffName: string;
  dutyType: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  status: string;
  location: string | null;
}

export default function StaffEffectivenessPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [cleaningLogs, setCleaningLogs] = useState<CleaningLog[]>([]);
  const [transportLogs, setTransportLogs] = useState<TransportLog[]>([]);
  const [dutyLogs, setDutyLogs] = useState<DutyLog[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      const response = await fetch(`/api/analytics/staff-effectiveness?${params}`);
      if (response.ok) {
        const data = await response.json();
        setStaffPerformance(data.staffPerformance || []);
        setCleaningLogs(data.cleaningLogs || []);
        setTransportLogs(data.transportLogs || []);
        setDutyLogs(data.dutyLogs || []);
        setStatistics(data.statistics || {});
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Staff Effectiveness Analytics</h1>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="input-field"
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="input-field"
          />
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 text-primary-700">🧹 Cleaning Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Sessions:</span>
                <span className="font-semibold">{statistics.cleaning?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Completed:</span>
                <span className="font-semibold text-green-600">{statistics.cleaning?.completed || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">In Progress:</span>
                <span className="font-semibold text-blue-600">{statistics.cleaning?.inProgress || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-semibold">{formatDuration(Math.round(statistics.cleaning?.averageDuration || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Hours:</span>
                <span className="font-semibold">{((statistics.cleaning?.totalMinutes || 0) / 60).toFixed(1)}h</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4 text-secondary-700">🚑 Transport Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Transports:</span>
                <span className="font-semibold">{statistics.transport?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Completed:</span>
                <span className="font-semibold text-green-600">{statistics.transport?.completed || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">In Progress:</span>
                <span className="font-semibold text-blue-600">{statistics.transport?.inProgress || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-semibold">{formatDuration(Math.round(statistics.transport?.averageDuration || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Hours:</span>
                <span className="font-semibold">{((statistics.transport?.totalMinutes || 0) / 60).toFixed(1)}h</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4 text-accent-700">📋 Other Duties Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Duties:</span>
                <span className="font-semibold">{statistics.duties?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Completed:</span>
                <span className="font-semibold text-green-600">{statistics.duties?.completed || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">In Progress:</span>
                <span className="font-semibold text-blue-600">{statistics.duties?.inProgress || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-semibold">{formatDuration(Math.round(statistics.duties?.averageDuration || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Hours:</span>
                <span className="font-semibold">{((statistics.duties?.totalMinutes || 0) / 60).toFixed(1)}h</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff Performance Rankings */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4 text-gray-900">👥 Staff Performance Rankings</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Staff Code</th>
                <th>Role</th>
                <th>Total Tasks</th>
                <th>Total Hours</th>
                <th>Avg Rating</th>
                <th>Cleaning</th>
                <th>Transport</th>
                <th>Other Duties</th>
              </tr>
            </thead>
            <tbody>
              {staffPerformance.map((staff, index) => (
                <tr key={staff.id}>
                  <td className="font-semibold">
                    {index + 1 === 1 && '🥇'}
                    {index + 1 === 2 && '🥈'}
                    {index + 1 === 3 && '🥉'}
                    {index + 1 > 3 && index + 1}
                  </td>
                  <td>{staff.name}</td>
                  <td><span className="badge badge-secondary">{staff.staffCode}</span></td>
                  <td><span className="badge badge-primary">{staff.role}</span></td>
                  <td className="font-semibold">{staff.totalTasks}</td>
                  <td>{staff.totalHours}h</td>
                  <td>
                    <span className={`badge ${
                      parseFloat(staff.averageRating) >= 4 ? 'badge-success' :
                      parseFloat(staff.averageRating) >= 3 ? 'badge-warning' : 'badge-error'
                    }`}>
                      {staff.averageRating} ⭐
                    </span>
                  </td>
                  <td>{staff.cleaningTasks}</td>
                  <td>{staff.transportTasks}</td>
                  <td>{staff.otherDuties}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Cleaning Logs */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4 text-gray-900">🧹 Recent Cleaning Logs</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cleaner</th>
                <th>Theatre</th>
                <th>Type</th>
                <th>Start Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cleaningLogs.slice(0, 10).map((log) => (
                <tr key={log.id}>
                  <td>{log.cleanerName}</td>
                  <td>{log.theatreName}</td>
                  <td>{log.cleaningType || 'N/A'}</td>
                  <td>{new Date(log.startTime).toLocaleString()}</td>
                  <td>{formatDuration(log.durationMinutes)}</td>
                  <td>
                    <span className={`badge ${
                      log.status === 'COMPLETED' ? 'badge-success' :
                      log.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-error'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transport Logs */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4 text-gray-900">🚑 Recent Patient Transports</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Porter</th>
                <th>Patient</th>
                <th>From</th>
                <th>To</th>
                <th>Start Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transportLogs.slice(0, 10).map((log) => (
                <tr key={log.id}>
                  <td>{log.porterName}</td>
                  <td>{log.patientName}</td>
                  <td>{log.fromLocation}</td>
                  <td>{log.toLocation}</td>
                  <td>{new Date(log.startTime).toLocaleString()}</td>
                  <td>{formatDuration(log.durationMinutes)}</td>
                  <td>
                    <span className={`badge ${
                      log.status === 'COMPLETED' ? 'badge-success' :
                      log.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-error'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Other Duties */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4 text-gray-900">📋 Recent Other Duties</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Duty Type</th>
                <th>Location</th>
                <th>Start Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dutyLogs.slice(0, 10).map((log) => (
                <tr key={log.id}>
                  <td>{log.staffName}</td>
                  <td><span className="badge badge-primary">{log.dutyType.replace(/_/g, ' ')}</span></td>
                  <td>{log.location || 'N/A'}</td>
                  <td>{new Date(log.startTime).toLocaleString()}</td>
                  <td>{formatDuration(log.durationMinutes)}</td>
                  <td>
                    <span className={`badge ${
                      log.status === 'COMPLETED' ? 'badge-success' :
                      log.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-error'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
