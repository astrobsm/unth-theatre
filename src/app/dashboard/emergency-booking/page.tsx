'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, Plus, Clock, CheckCircle, XCircle, RefreshCw,
  User, Building2, Siren, Phone, Calendar
} from 'lucide-react';

interface EmergencyBooking {
  id: string;
  patientName: string;
  folderNumber: string;
  age?: number;
  gender?: string;
  ward?: string;
  diagnosis: string;
  procedureName: string;
  surgicalUnit: string;
  indication: string;
  surgeonName: string;
  anesthetistName?: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: string;
  requestedAt: string;
  requiredByTime?: string;
  theatreName?: string;
  bloodRequired: boolean;
  bloodUnits?: number;
  surgeon?: { fullName: string; phoneNumber?: string };
  anesthetist?: { fullName: string; phoneNumber?: string };
}

const priorityColors = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-300',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const statusColors: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  THEATRE_ASSIGNED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function EmergencyBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [bookings, setBookings] = useState<EmergencyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  const fetchBookings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      const res = await fetch(`/api/emergency-booking?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBookings();
    // Auto-refresh every 30 seconds for emergency data
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  const canCreateBooking = session?.user?.role && [
    'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'THEATRE_MANAGER',
    'ADMIN', 'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR'
  ].includes(session.user.role);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading emergency bookings...</p>
        </div>
      </div>
    );
  }

  const activeBookings = bookings.filter(b => ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS'].includes(b.status));
  const pastBookings = bookings.filter(b => ['COMPLETED', 'CANCELLED'].includes(b.status));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Siren className="h-7 w-7 text-red-600" />
            Emergency Surgery Booking
          </h1>
          <p className="text-gray-600 mt-1">Book and track emergency surgical cases</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchBookings()}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              <Plus className="h-4 w-4" /> New Emergency Booking
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${
              filter === s ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Active Emergency Bookings */}
      {activeBookings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Active Emergency Cases ({activeBookings.length})
          </h2>
          <div className="grid gap-4">
            {activeBookings.map((booking) => (
              <div
                key={booking.id}
                className={`bg-white rounded-lg shadow-md border-l-4 p-5 ${
                  booking.priority === 'CRITICAL' ? 'border-l-red-600 animate-pulse-slow' :
                  booking.priority === 'HIGH' ? 'border-l-orange-500' : 'border-l-yellow-400'
                }`}
              >
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${priorityColors[booking.priority]}`}>
                        {booking.priority}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[booking.status] || ''}`}>
                        {booking.status.replace(/_/g, ' ')}
                      </span>
                      {booking.bloodRequired && (
                        <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">
                          BLOOD REQUIRED ({booking.bloodUnits} units)
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{booking.procedureName}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        <span><strong>{booking.patientName}</strong> ({booking.folderNumber})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        <span>{booking.surgicalUnit}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{new Date(booking.requestedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm"><strong>Indication:</strong> {booking.indication}</p>
                    <p className="text-sm"><strong>Diagnosis:</strong> {booking.diagnosis}</p>
                  </div>
                  <div className="flex flex-col gap-1 text-sm min-w-[200px]">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4 text-blue-600" />
                      <span>Surgeon: <strong>{booking.surgeonName}</strong></span>
                    </div>
                    {booking.anesthetistName && (
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4 text-green-600" />
                        <span>Anesthetist: <strong>{booking.anesthetistName}</strong></span>
                      </div>
                    )}
                    {booking.theatreName && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4 text-purple-600" />
                        <span>Theatre: <strong>{booking.theatreName}</strong></span>
                      </div>
                    )}
                    {booking.requiredByTime && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-red-600" />
                        <span>Required by: <strong>{new Date(booking.requiredByTime).toLocaleString()}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Bookings */}
      {pastBookings.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Past Emergency Cases ({pastBookings.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pastBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{booking.patientName}</div>
                      <div className="text-gray-500 text-xs">{booking.folderNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{booking.procedureName}</td>
                    <td className="px-4 py-3 text-sm">{booking.surgeonName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${priorityColors[booking.priority]}`}>
                        {booking.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[booking.status] || ''}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(booking.requestedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bookings.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Siren className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No emergency bookings found</p>
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="inline-flex items-center gap-2 mt-4 text-red-600 hover:text-red-700 font-medium"
            >
              <Plus className="h-4 w-4" /> Create Emergency Booking
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
