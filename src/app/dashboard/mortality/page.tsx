'use client';

import { useState, useEffect } from 'react';
import { Heart, Plus, Clock, MapPin, User, FileText, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Mortality {
  id: string;
  timeOfDeath: string;
  location: string;
  causeOfDeath: string;
  resuscitationAttempted: boolean;
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgery: {
    surgeryType: string;
    surgeon: {
      fullName: string;
    };
  };
  audits: {
    id: string;
    preventability: string;
  }[];
  createdAt: string;
}

export default function MortalityPage() {
  const [mortalities, setMortalities] = useState<Mortality[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState('');

  useEffect(() => {
    fetchMortalities();
  }, []);

  const fetchMortalities = async () => {
    try {
      const response = await fetch('/api/mortality');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setMortalities(data);
        } else {
          console.error('API returned non-array data:', data);
          setMortalities([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch mortalities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocationDisplay = (location: string) => {
    return location.replace(/_/g, ' ');
  };

  const getLocationColor = (location: string) => {
    switch (location) {
      case 'PREOPERATIVE':
        return 'bg-blue-100 text-blue-800';
      case 'INTRAOPERATIVE':
        return 'bg-red-100 text-red-800';
      case 'POSTOPERATIVE_RECOVERY':
        return 'bg-orange-100 text-orange-800';
      case 'POSTOPERATIVE_WARD':
        return 'bg-purple-100 text-purple-800';
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

  const filteredMortalities = Array.isArray(mortalities) ? mortalities.filter((m) => {
    return !filterLocation || m.location === filterLocation;
  }) : [];

  const stats = {
    total: Array.isArray(mortalities) ? mortalities.length : 0,
    preoperative: Array.isArray(mortalities) ? mortalities.filter((m) => m.location === 'PREOPERATIVE').length : 0,
    intraoperative: Array.isArray(mortalities) ? mortalities.filter((m) => m.location === 'INTRAOPERATIVE').length : 0,
    postoperative: Array.isArray(mortalities) ? mortalities.filter((m) => m.location.startsWith('POSTOPERATIVE')).length : 0,
    audited: Array.isArray(mortalities) ? mortalities.filter((m) => m.audits.length > 0).length : 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mortality Records</h1>
          <p className="text-gray-600 mt-1">Track and review perioperative mortality cases</p>
        </div>
        <Link href="/dashboard/mortality/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Record Mortality
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card bg-gradient-to-br from-red-50 to-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Cases</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <Heart className="w-12 h-12 text-red-400" />
          </div>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Preoperative</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.preoperative}</p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Intraoperative</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.intraoperative}</p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Postoperative</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{stats.postoperative}</p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Audited</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.audited}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <label className="label">Filter by Location</label>
        <select
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          className="input-field max-w-md"
        >
          <option value="">All Locations</option>
          <option value="PREOPERATIVE">Preoperative</option>
          <option value="INTRAOPERATIVE">Intraoperative</option>
          <option value="POSTOPERATIVE_RECOVERY">Postoperative - Recovery</option>
          <option value="POSTOPERATIVE_WARD">Postoperative - Ward</option>
        </select>
      </div>

      {/* Mortalities List */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading mortalities...</p>
          </div>
        ) : filteredMortalities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Heart className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No mortality records found</p>
            <p className="text-sm mt-2">
              {filterLocation
                ? 'Try adjusting your filter'
                : 'Click "Record Mortality" to document a case'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMortalities.map((mortality) => (
              <div
                key={mortality.id}
                className="border border-gray-200 rounded-lg p-5 hover:border-red-300 hover:bg-red-50/30 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Heart className="w-6 h-6 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{mortality.patient.name}</h3>
                        <p className="text-sm text-gray-600">
                          {mortality.patient.folderNumber} | {mortality.patient.age} years | {mortality.patient.gender}
                        </p>
                        <p className="text-sm text-gray-700 mt-1">
                          <span className="font-medium">Procedure:</span> {mortality.surgery.surgeryType}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Surgeon:</span> {mortality.surgery.surgeon.fullName}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 mb-1">Cause of Death:</p>
                      <p className="text-sm text-gray-600">{mortality.causeOfDeath}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <span className={`px-4 py-2 rounded-full text-sm font-medium ${getLocationColor(mortality.location)}`}>
                      {getLocationDisplay(mortality.location)}
                    </span>
                    
                    {mortality.resuscitationAttempted && (
                      <span className="px-4 py-2 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                        Resuscitation Attempted
                      </span>
                    )}

                    {mortality.audits.length > 0 ? (
                      <Link
                        href={`/dashboard/mortality/${mortality.id}/audit`}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors text-center"
                      >
                        View Audit
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/mortality/${mortality.id}/audit`}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors text-center flex items-center gap-2"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Needs Audit
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Time of Death: {formatDateTime(mortality.timeOfDeath)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>Recorded: {formatDateTime(mortality.createdAt)}</span>
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
