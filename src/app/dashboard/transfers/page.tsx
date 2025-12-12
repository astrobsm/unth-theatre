'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, MapPin, Plus, Clock, User, FileText } from 'lucide-react';
import Link from 'next/link';

interface Transfer {
  id: string;
  patient: {
    name: string;
    folderNumber: string;
  };
  fromLocation: string;
  toLocation: string;
  transferTime: string;
  user: {
    fullName: string;
  };
  notes: string | null;
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterPatient, setFilterPatient] = useState('');

  useEffect(() => {
    fetchTransfers();
  }, []);

  const fetchTransfers = async () => {
    try {
      const response = await fetch('/api/transfers');
      if (response.ok) {
        const data = await response.json();
        setTransfers(data);
      }
    } catch (error) {
      console.error('Failed to fetch transfers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocationDisplay = (location: string) => {
    return location.replace(/_/g, ' ');
  };

  const getLocationColor = (location: string) => {
    switch (location) {
      case 'WARD':
        return 'bg-blue-100 text-blue-800';
      case 'HOLDING_AREA':
        return 'bg-yellow-100 text-yellow-800';
      case 'THEATRE_SUITE':
        return 'bg-red-100 text-red-800';
      case 'RECOVERY':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const filteredTransfers = transfers.filter((transfer) => {
    const matchesLocation = !filterLocation || 
      transfer.fromLocation === filterLocation || 
      transfer.toLocation === filterLocation;
    const matchesPatient = !filterPatient || 
      transfer.patient.name.toLowerCase().includes(filterPatient.toLowerCase()) ||
      transfer.patient.folderNumber.toLowerCase().includes(filterPatient.toLowerCase());
    return matchesLocation && matchesPatient;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Patient Transfers</h1>
          <p className="text-gray-600 mt-1">Track patient movement through theatre workflow</p>
        </div>
        <Link href="/dashboard/transfers/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Record Transfer
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Filter by Patient</label>
            <input
              type="text"
              placeholder="Search by name or folder number..."
              value={filterPatient}
              onChange={(e) => setFilterPatient(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Filter by Location</label>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="input-field"
            >
              <option value="">All Locations</option>
              <option value="WARD">Ward</option>
              <option value="HOLDING_AREA">Holding Area</option>
              <option value="THEATRE_SUITE">Theatre Suite</option>
              <option value="RECOVERY">Recovery</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transfers Timeline */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading transfers...</p>
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No transfers found</p>
            <p className="text-sm mt-2">
              {filterLocation || filterPatient
                ? 'Try adjusting your filters'
                : 'Record your first patient transfer to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransfers.map((transfer) => (
              <div
                key={transfer.id}
                className="border border-gray-200 rounded-lg p-5 hover:border-primary-300 hover:bg-primary-50/30 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{transfer.patient.name}</h3>
                      <p className="text-sm text-gray-600">Folder: {transfer.patient.folderNumber}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-2 rounded-full text-sm font-medium ${getLocationColor(transfer.fromLocation)}`}>
                      {getLocationDisplay(transfer.fromLocation)}
                    </span>
                    <ArrowRight className="w-6 h-6 text-gray-400 flex-shrink-0" />
                    <span className={`px-4 py-2 rounded-full text-sm font-medium ${getLocationColor(transfer.toLocation)}`}>
                      {getLocationDisplay(transfer.toLocation)}
                    </span>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>Transferred by: <span className="font-medium">{transfer.user.fullName}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{formatDateTime(transfer.transferTime)}</span>
                  </div>
                </div>
                
                {transfer.notes && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start gap-2 text-sm">
                      <FileText className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-gray-700">Notes:</span>{' '}
                        <span className="text-gray-600">{transfer.notes}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
