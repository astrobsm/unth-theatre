'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  User, 
  Calendar, 
  FileText, 
  Activity, 
  AlertCircle,
  MapPin,
  Clock,
  Stethoscope,
  ArrowRight,
  CheckCircle,
  Home,
  Building2
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Patient {
  id: string;
  folderNumber: string;
  ptNumber?: string;
  name: string;
  age: number;
  gender: string;
  ward: string;
  createdAt: string;
  surgeries: Array<{
    id: string;
    procedureName: string;
    indication: string;
    scheduledDate: string;
    scheduledTime: string;
    status: string;
    urgency: string;
    surgeon: {
      fullName: string;
    };
    anesthetist?: {
      fullName: string;
    };
  }>;
  transfers: Array<{
    id: string;
    fromLocation: string;
    toLocation: string;
    transferTime: string;
    transferredBy: string;
    reason?: string;
    status: string;
  }>;
  holdingAreaAssessments: Array<{
    id: string;
    surgeryId: string;
    createdAt: string;
    vitalSignsStable: boolean;
    arrivalTime?: string;
    preOpChecksCompleted: boolean;
    consentVerified?: boolean;
    identityVerified?: boolean;
    surgery: {
      procedureName: string;
    };
  }>;
  pacuAssessments: Array<{
    id: string;
    surgeryId: string;
    admissionTime: string;
    dischargeTime?: string;
    dischargeDestination?: string;
    aldretteScore?: number;
    surgery: {
      procedureName: string;
    };
  }>;
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  const patientId = params.id as string;

  useEffect(() => {
    if (patientId) {
      fetchPatient();
    }
  }, [patientId]);

  const fetchPatient = async () => {
    try {
      const response = await fetch(`/api/patients/${patientId}`);
      if (response.ok) {
        const data = await response.json();
        setPatient(data);
      }
    } catch (error) {
      console.error('Failed to fetch patient:', error);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading patient details...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Patient Not Found</h2>
          <p className="text-gray-600 mb-4">The requested patient could not be found.</p>
          <Link href="/dashboard/patients" className="btn-primary">
            Back to Patients
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
            <h1 className="text-3xl font-bold text-gray-900">Patient Details</h1>
            <p className="text-gray-600 mt-1">Complete patient information</p>
          </div>
        </div>
      </div>

      {/* Patient Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <User className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Patient Information</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="text-sm font-medium text-gray-500">Name</label>
            <p className="text-gray-900 font-semibold text-lg">{patient.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Folder Number</label>
            <p className="text-gray-900 font-semibold">{patient.folderNumber}</p>
          </div>
          {patient.ptNumber && (
            <div>
              <label className="text-sm font-medium text-gray-500">PT Number</label>
              <p className="text-gray-900">{patient.ptNumber}</p>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-500">Age</label>
            <p className="text-gray-900">{patient.age} years</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Gender</label>
            <p className="text-gray-900">{patient.gender}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Ward</label>
            <p className="text-gray-900">{patient.ward}</p>
          </div>
        </div>
      </div>

      {/* Surgeries */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Activity className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Surgical History</h2>
        </div>
        {patient.surgeries && patient.surgeries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Procedure
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Surgeon
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date & Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {patient.surgeries.map((surgery) => (
                  <tr key={surgery.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{surgery.procedureName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{surgery.surgeon.fullName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(surgery.scheduledDate)} {surgery.scheduledTime}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(surgery.status)}`}>
                        {surgery.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/surgeries/${surgery.id}`}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No surgeries recorded</p>
        )}
      </div>

      {/* Assessments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Holding Area Assessments */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <FileText className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Holding Area Assessments</h2>
          </div>
          {patient.holdingAreaAssessments && patient.holdingAreaAssessments.length > 0 ? (
            <div className="space-y-2">
              {patient.holdingAreaAssessments.map((assessment) => (
                <div key={assessment.id} className="flex justify-between items-center border-b pb-2">
                  <span className="text-sm text-gray-600">
                    {formatDate(assessment.createdAt)}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    assessment.vitalSignsStable ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {assessment.vitalSignsStable ? 'Stable' : 'Monitoring'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No assessments recorded</p>
          )}
        </div>

        {/* PACU Assessments */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Calendar className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">PACU Admissions</h2>
          </div>
          {patient.pacuAssessments && patient.pacuAssessments.length > 0 ? (
            <div className="space-y-2">
              {patient.pacuAssessments.map((assessment) => (
                <div key={assessment.id} className="flex justify-between items-center border-b pb-2">
                  <span className="text-sm text-gray-600">
                    {formatDate(assessment.admissionTime)}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    assessment.dischargeTime ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {assessment.dischargeTime ? 'Discharged' : 'In PACU'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No PACU admissions recorded</p>
          )}
        </div>
      </div>
    </div>
  );
}
