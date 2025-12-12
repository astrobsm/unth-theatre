'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ClipboardList, 
  Activity, 
  Calculator,
  Clock,
  Package,
  FileText,
  Users,
  AlertCircle,
  CheckCircle,
  Calendar,
  User
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Surgery {
  id: string;
  patient: {
    id: string;
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
    ward: string;
  };
  surgeon: {
    id: string;
    fullName: string;
  };
  anesthetist?: {
    id: string;
    fullName: string;
  };
  scrubNurse?: {
    id: string;
    fullName: string;
  };
  procedureName: string;
  indication: string;
  subspecialty: string;
  unit: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedDuration: number;
  status: string;
  urgency: string;
  createdAt: string;
}

export default function SurgeryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [surgery, setSurgery] = useState<Surgery | null>(null);
  const [loading, setLoading] = useState(true);

  const surgeryId = params.id as string;

  useEffect(() => {
    if (surgeryId) {
      fetchSurgery();
    }
  }, [surgeryId]);

  const fetchSurgery = async () => {
    try {
      const response = await fetch(`/api/surgeries?id=${surgeryId}`);
      if (response.ok) {
        const data = await response.json();
        const foundSurgery = data.find((s: Surgery) => s.id === surgeryId);
        setSurgery(foundSurgery || null);
      }
    } catch (error) {
      console.error('Failed to fetch surgery:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'EMERGENCY':
        return 'bg-red-100 text-red-800';
      case 'URGENT':
        return 'bg-orange-100 text-orange-800';
      case 'ELECTIVE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Role-based action visibility
  const userRole = session?.user?.role;
  
  const canAccessWHOChecklist = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE'].includes(userRole || '');
  const canAccessAnesthesia = ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST', 'NURSE_ANAESTHETIST'].includes(userRole || '');
  const canAccessSurgicalCount = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE'].includes(userRole || '');
  const canAccessTiming = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE'].includes(userRole || '');
  const canAccessConsumables = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_STORE_KEEPER'].includes(userRole || '');
  const canAccessBOM = ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'].includes(userRole || '');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading surgery details...</p>
        </div>
      </div>
    );
  }

  if (!surgery) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Surgery Not Found</h2>
          <p className="text-gray-600 mb-4">The requested surgery could not be found.</p>
          <Link href="/dashboard/surgeries" className="btn-primary">
            Back to Surgeries
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Surgery Details</h1>
            <p className="text-gray-600 mt-1">Complete surgical case information</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(surgery.status)}`}>
            {surgery.status}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getUrgencyColor(surgery.urgency)}`}>
            {surgery.urgency}
          </span>
        </div>
      </div>

      {/* Patient & Surgery Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Information */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <User className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Patient Information</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-500">Name</label>
              <p className="text-gray-900 font-medium">{surgery.patient.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Folder Number</label>
                <p className="text-gray-900">{surgery.patient.folderNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Age</label>
                <p className="text-gray-900">{surgery.patient.age} years</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Gender</label>
                <p className="text-gray-900">{surgery.patient.gender}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Ward</label>
                <p className="text-gray-900">{surgery.patient.ward}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Surgery Information */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Calendar className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Surgery Information</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-500">Procedure</label>
              <p className="text-gray-900 font-medium">{surgery.procedureName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Indication</label>
              <p className="text-gray-900">{surgery.indication}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Subspecialty</label>
                <p className="text-gray-900">{surgery.subspecialty}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Unit</label>
                <p className="text-gray-900">{surgery.unit}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Scheduled Date</label>
                <p className="text-gray-900">{formatDate(surgery.scheduledDate)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Time</label>
                <p className="text-gray-900">{surgery.scheduledTime}</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Estimated Duration</label>
              <p className="text-gray-900">{surgery.estimatedDuration} minutes</p>
            </div>
          </div>
        </div>

        {/* Team Information */}
        <div className="bg-white shadow rounded-lg p-6 lg:col-span-2">
          <div className="flex items-center mb-4">
            <Users className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Surgical Team</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Surgeon</label>
              <p className="text-gray-900 font-medium">{surgery.surgeon.fullName}</p>
            </div>
            {surgery.anesthetist && (
              <div>
                <label className="text-sm font-medium text-gray-500">Anesthetist</label>
                <p className="text-gray-900 font-medium">{surgery.anesthetist.fullName}</p>
              </div>
            )}
            {surgery.scrubNurse && (
              <div>
                <label className="text-sm font-medium text-gray-500">Scrub Nurse</label>
                <p className="text-gray-900 font-medium">{surgery.scrubNurse.fullName}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions - Role-Based */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {canAccessWHOChecklist && (
            <Link
              href={`/dashboard/checklists/${surgery.id}`}
              className="flex items-center p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-colors group"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200">
                <ClipboardList className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">WHO Checklist</h3>
                <p className="text-xs text-gray-600">Sign In, Time Out, Sign Out</p>
              </div>
            </Link>
          )}

          {canAccessAnesthesia && (
            <Link
              href={`/dashboard/surgeries/${surgery.id}/anesthesia`}
              className="flex items-center p-4 border-2 border-red-200 rounded-lg hover:bg-red-50 transition-colors group"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200">
                <Activity className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Anesthesia Monitoring</h3>
                <p className="text-xs text-gray-600">Vitals & Anesthesia Record</p>
              </div>
            </Link>
          )}

          {canAccessSurgicalCount && (
            <Link
              href={`/dashboard/surgeries/${surgery.id}/count`}
              className="flex items-center p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 transition-colors group"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200">
                <Calculator className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Surgical Count</h3>
                <p className="text-xs text-gray-600">Track Instruments & Swabs</p>
              </div>
            </Link>
          )}

          {canAccessTiming && (
            <Link
              href={`/dashboard/surgeries/${surgery.id}/timing`}
              className="flex items-center p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 transition-colors group"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Surgical Timing</h3>
                <p className="text-xs text-gray-600">Track Surgery Events</p>
              </div>
            </Link>
          )}

          {canAccessConsumables && (
            <Link
              href={`/dashboard/surgeries/${surgery.id}/consumables`}
              className="flex items-center p-4 border-2 border-orange-200 rounded-lg hover:bg-orange-50 transition-colors group"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200">
                <Package className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Consumables</h3>
                <p className="text-xs text-gray-600">Track Used Items</p>
              </div>
            </Link>
          )}

          {canAccessBOM && (
            <Link
              href={`/dashboard/surgeries/${surgery.id}/bom`}
              className="flex items-center p-4 border-2 border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors group"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-semibold text-gray-900">Bill of Materials</h3>
                <p className="text-xs text-gray-600">View Cost Analysis</p>
              </div>
            </Link>
          )}

        </div>

        {!canAccessWHOChecklist && !canAccessAnesthesia && !canAccessSurgicalCount && 
         !canAccessTiming && !canAccessConsumables && !canAccessBOM && (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">No actions available for your role</p>
          </div>
        )}
      </div>
    </div>
  );
}
