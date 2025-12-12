'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  patient: {
    id: string;
    name: string;
    folderNumber: string;
  };
}

export default function NewHoldingAreaAssessment() {
  const router = useRouter();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [selectedSurgeryId, setSelectedSurgeryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchScheduledSurgeries();
  }, []);

  const fetchScheduledSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries?status=SCHEDULED');
      if (response.ok) {
        const data = await response.json();
        setSurgeries(data);
      }
    } catch (error) {
      console.error('Error fetching surgeries:', error);
      setError('Failed to load scheduled surgeries');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSurgeryId) {
      setError('Please select a surgery');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedSurgery = surgeries.find(s => s.id === selectedSurgeryId);
      
      const response = await fetch('/api/holding-area', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: selectedSurgeryId,
          patientId: selectedSurgery?.patient.id
        })
      });

      if (response.ok) {
        const assessment = await response.json();
        router.push(`/dashboard/holding-area/${assessment.id}`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create assessment');
      }
    } catch (error) {
      setError('An error occurred while creating the assessment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">New Holding Area Assessment</h1>
        <p className="text-gray-600 mt-2">
          Admit a patient to the holding area for preoperative safety verification
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Scheduled Surgery *
          </label>
          <select
            value={selectedSurgeryId}
            onChange={(e) => setSelectedSurgeryId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
          >
            <option value="">-- Select a surgery --</option>
            {surgeries.map((surgery) => (
              <option key={surgery.id} value={surgery.id}>
                {surgery.patient.name} ({surgery.patient.folderNumber}) - {surgery.procedureName} -{' '}
                {new Date(surgery.scheduledDate).toLocaleDateString()}
              </option>
            ))}
          </select>
          {surgeries.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">
              No scheduled surgeries available. Please schedule a surgery first.
            </p>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Patient will be marked as arrived in holding area</li>
            <li>• Safety verification checklist will be initiated</li>
            <li>• You&apos;ll be able to complete the 8-point safety assessment</li>
            <li>• Patient can be cleared for theatre after all checks pass</li>
          </ul>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={submitting || surgeries.length === 0}
            className="flex-1 bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Creating Assessment...' : 'Admit to Holding Area'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
