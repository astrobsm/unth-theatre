'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { XCircle, AlertCircle } from 'lucide-react';
import SmartTextInput from '@/components/SmartTextInput';

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  status: string;
  patient: {
    name: string;
    folderNumber: string;
  };
  surgeon: {
    fullName: string;
  };
}

export default function NewCancellationPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [filteredSurgeries, setFilteredSurgeries] = useState<Surgery[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    surgeryId: '',
    category: '',
    reason: '',
    detailedNotes: '',
  });

  useEffect(() => {
    fetchSurgeries();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredSurgeries(surgeries);
    } else {
      const filtered = surgeries.filter(
        (s) =>
          s.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.patient.folderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.procedureName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredSurgeries(filtered);
    }
  }, [searchTerm, surgeries]);

  const fetchSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries');
      if (response.ok) {
        const data = await response.json();
        // Only show scheduled surgeries that haven't been cancelled
        const scheduledSurgeries = data.filter(
          (s: Surgery) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
        );
        setSurgeries(scheduledSurgeries);
        setFilteredSurgeries(scheduledSurgeries);
      }
    } catch (error) {
      console.error('Failed to fetch surgeries:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/cancellations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert('Surgery cancellation recorded successfully');
        router.push('/dashboard/cancellations');
      } else {
        const error = await response.json();
        alert(`Failed to record cancellation: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to record cancellation:', error);
      alert('Failed to record cancellation');
    } finally {
      setLoading(false);
    }
  };

  const selectedSurgery = surgeries.find((s) => s.id === formData.surgeryId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Record Surgery Cancellation</h1>
        <p className="text-gray-600 mt-1">Document the cancellation of a scheduled surgery</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Surgery Selection */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Surgery</h2>
          
          <div className="space-y-4">
            <div>
              <label className="label">Search Surgery</label>
              <input
                type="text"
                placeholder="Search by patient name, folder number, or procedure..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Surgery *</label>
              <select
                required
                value={formData.surgeryId}
                onChange={(e) => setFormData({ ...formData, surgeryId: e.target.value })}
                className="input-field"
              >
                <option value="">Select a surgery to cancel</option>
                {filteredSurgeries.map((surgery) => (
                  <option key={surgery.id} value={surgery.id}>
                    {surgery.patient.name} ({surgery.patient.folderNumber}) - {surgery.procedureName} -{' '}
                    {new Date(surgery.scheduledDate).toLocaleDateString('en-GB')}
                  </option>
                ))}
              </select>
            </div>

            {selectedSurgery && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Surgery Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Patient:</span>
                    <p className="font-medium text-gray-900">{selectedSurgery.patient.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Folder Number:</span>
                    <p className="font-medium text-gray-900">{selectedSurgery.patient.folderNumber}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Procedure:</span>
                    <p className="font-medium text-gray-900">{selectedSurgery.procedureName}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Surgeon:</span>
                    <p className="font-medium text-gray-900">{selectedSurgery.surgeon.fullName}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Scheduled Date:</span>
                    <p className="font-medium text-gray-900">
                      {new Date(selectedSurgery.scheduledDate).toLocaleString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <p className="font-medium text-gray-900">{selectedSurgery.status}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cancellation Details */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Cancellation Details</h2>
          
          <div className="space-y-4">
            <div>
              <label className="label">Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input-field"
              >
                <option value="">Select cancellation category</option>
                <option value="PATIENT_CONDITION">Patient Condition</option>
                <option value="EQUIPMENT_FAILURE">Equipment Failure</option>
                <option value="STAFF_UNAVAILABILITY">Staff Unavailability</option>
                <option value="EMERGENCY_PRIORITY">Emergency Priority</option>
                <option value="PATIENT_REQUEST">Patient Request</option>
                <option value="ADMINISTRATIVE">Administrative</option>
                <option value="OTHER">Other</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                Select the primary reason category for this cancellation
              </p>
            </div>

            <div>
              <label className="label">Reason Summary *</label>
              <input
                type="text"
                required
                placeholder="Brief summary of the cancellation reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="input-field"
              />
            </div>

            <SmartTextInput
              label="Detailed Notes *"
              required={true}
              rows={6}
              placeholder="Provide detailed notes about the cancellation, including circumstances, actions taken, and any follow-up required... 🎤 Dictate"
              value={formData.detailedNotes}
              onChange={(val) => setFormData({ ...formData, detailedNotes: val })}
              enableSpeech={true}
              enableOCR={true}
              medicalMode={true}
            />
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-semibold mb-1">Important Notice</p>
            <p>
              Recording this cancellation will update the surgery status to CANCELLED and create a permanent
              record in the system. This action cannot be undone. Please ensure all details are accurate
              before submitting.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Recording...
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                Record Cancellation
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
