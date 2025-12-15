'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Search, Calendar, ClipboardList, Package, AlertCircle, FileText, Activity, Calculator, Clock, Eye } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';

interface Surgery {
  id: string;
  patient: {
    name: string;
    folderNumber: string;
  };
  surgeon: {
    fullName: string;
  };
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  subspecialty: string;
}

export default function SurgeriesPage() {
  const { data: session } = useSession();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Role-based action visibility
  const userRole = session?.user?.role;
  const canAccessWHOChecklist = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessAnesthesia = ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST'].includes(userRole || '');
  const canAccessSurgicalCount = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessTiming = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessConsumables = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER'].includes(userRole || '');
  const canAccessBOM = ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'].includes(userRole || '');

  useEffect(() => {
    fetchSurgeries();
  }, []);

  const fetchSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setSurgeries(data);
        } else {
          console.error('API returned non-array data:', data);
          setSurgeries([]);
        }
      } else {
        console.error('Failed to fetch surgeries:', response.status);
        setSurgeries([]);
      }
    } catch (error) {
      console.error('Failed to fetch surgeries:', error);
      setSurgeries([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSurgeries = Array.isArray(surgeries) ? surgeries.filter(surgery => {
    const matchesSearch = 
      surgery.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      surgery.patient.folderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      surgery.procedureName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || surgery.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surgery Scheduling</h1>
          <p className="text-gray-600 mt-1">Manage surgical procedures and bookings</p>
        </div>
        <Link href="/dashboard/surgeries/new" className="btn-primary flex items-center">
          <Plus className="w-5 h-5 mr-2" />
          Book Surgery
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by patient name, folder number, or procedure..."
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Surgeries Table */}
      <div className="card">
        {loading ? (
          <div className="text-center py-8">Loading surgeries...</div>
        ) : filteredSurgeries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No surgeries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Procedure
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Surgeon
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSurgeries.map((surgery) => (
                  <tr key={surgery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {surgery.patient.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {surgery.patient.folderNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{surgery.procedureName}</div>
                      <div className="text-sm text-gray-500">{surgery.subspecialty}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {surgery.surgeon.fullName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(surgery.scheduledDate)}
                      </div>
                      <div className="text-sm text-gray-500">{surgery.scheduledTime}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(surgery.status)}`}>
                        {surgery.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* View Details - Always visible */}
                        <Link
                          href={`/dashboard/surgeries/${surgery.id}`}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 font-semibold"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>

                        {/* WHO Checklist */}
                        {canAccessWHOChecklist && (
                          <Link
                            href={`/dashboard/checklists/${surgery.id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900"
                            title="WHO Checklist"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Anesthesia Monitoring */}
                        {canAccessAnesthesia && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/anesthesia`}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-900"
                            title="Anesthesia Monitoring"
                          >
                            <Activity className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Surgical Count */}
                        {canAccessSurgicalCount && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/count`}
                            className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-900"
                            title="Surgical Count"
                          >
                            <Calculator className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Timing */}
                        {canAccessTiming && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/timing`}
                            className="inline-flex items-center gap-1 text-green-600 hover:text-green-900"
                            title="Surgical Timing"
                          >
                            <Clock className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Consumables */}
                        {canAccessConsumables && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/consumables`}
                            className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-900"
                            title="Track Consumables"
                          >
                            <Package className="w-4 h-4" />
                          </Link>
                        )}

                        {/* BOM */}
                        {canAccessBOM && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/bom`}
                            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                            title="Bill of Materials"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
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
