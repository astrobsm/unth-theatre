'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, Clock, MapPin, AlertCircle, FileText } from 'lucide-react';
import Link from 'next/link';

interface Surgery {
  id: string;
  surgeryType: string;
  scheduledDate: string;
  patient: {
    id: string;
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgeon: {
    fullName: string;
  };
}

export default function NewMortalityPage() {
  const router = useRouter();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [selectedSurgery, setSelectedSurgery] = useState<Surgery | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSurgeries();
  }, []);

  const fetchSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries');
      if (response.ok) {
        const data = await response.json();
        setSurgeries(data);
      }
    } catch (error) {
      console.error('Failed to fetch surgeries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSurgerySelect = (surgeryId: string) => {
    const surgery = surgeries.find((s) => s.id === surgeryId);
    setSelectedSurgery(surgery || null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);

    const data = {
      surgeryId: formData.get('surgeryId'),
      patientId: selectedSurgery?.patient.id,
      timeOfDeath: formData.get('timeOfDeath'),
      location: formData.get('location'),
      causeOfDeath: formData.get('causeOfDeath'),
      contributingFactors: formData.get('contributingFactors'),
      resuscitationAttempted: formData.get('resuscitationAttempted') === 'on',
      resuscitationDetails: formData.get('resuscitationDetails') || null,
    };

    try {
      const response = await fetch('/api/mortality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/mortality');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to record mortality');
      }
    } catch (error) {
      setError('An error occurred while recording mortality');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSurgeries = surgeries.filter(
    (surgery) =>
      surgery.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      surgery.patient.folderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      surgery.surgeryType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/mortality"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Record Mortality</h1>
          <p className="text-gray-600 mt-1">Document mortality case for audit and review</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Surgery Selection */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-semibold">Surgery Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Search Surgery</label>
              <input
                type="text"
                placeholder="Search by patient name, folder number, or procedure..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field mb-2"
              />
              <select
                name="surgeryId"
                required
                onChange={(e) => handleSurgerySelect(e.target.value)}
                className="input-field"
              >
                <option value="">Select Surgery</option>
                {filteredSurgeries.map((surgery) => (
                  <option key={surgery.id} value={surgery.id}>
                    {surgery.patient.name} ({surgery.patient.folderNumber}) - {surgery.surgeryType} - {new Date(surgery.scheduledDate).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {selectedSurgery && (
              <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg">
                <h3 className="font-semibold text-lg mb-2">{selectedSurgery.patient.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                  <p><span className="font-medium">Folder Number:</span> {selectedSurgery.patient.folderNumber}</p>
                  <p><span className="font-medium">Age:</span> {selectedSurgery.patient.age} years</p>
                  <p><span className="font-medium">Gender:</span> {selectedSurgery.patient.gender}</p>
                  <p><span className="font-medium">Procedure:</span> {selectedSurgery.surgeryType}</p>
                  <p><span className="font-medium">Surgeon:</span> {selectedSurgery.surgeon.fullName}</p>
                  <p><span className="font-medium">Date:</span> {new Date(selectedSurgery.scheduledDate).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mortality Details */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-6 h-6 text-gray-600" />
            <h2 className="text-xl font-semibold">Mortality Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Time of Death *</label>
              <input
                type="datetime-local"
                name="timeOfDeath"
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Location *</label>
              <select name="location" required className="input-field">
                <option value="">Select Location</option>
                <option value="PREOPERATIVE">Preoperative (Before Surgery)</option>
                <option value="INTRAOPERATIVE">Intraoperative (During Surgery)</option>
                <option value="POSTOPERATIVE_RECOVERY">Postoperative - Recovery Room</option>
                <option value="POSTOPERATIVE_WARD">Postoperative - Ward</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">Cause of Death *</label>
              <textarea
                name="causeOfDeath"
                required
                className="input-field"
                rows={4}
                placeholder="Describe the primary cause of death..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Contributing Factors</label>
              <textarea
                name="contributingFactors"
                className="input-field"
                rows={3}
                placeholder="Any additional factors that contributed to the mortality..."
              />
            </div>
          </div>
        </div>

        {/* Resuscitation Information */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Resuscitation Information</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="resuscitationAttempted"
                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="font-medium">Resuscitation was attempted</span>
            </label>

            <div>
              <label className="label">Resuscitation Details (if applicable)</label>
              <textarea
                name="resuscitationDetails"
                className="input-field"
                rows={4}
                placeholder="Describe resuscitation efforts, interventions attempted, duration, etc..."
              />
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-semibold mb-1">Important</p>
              <p>This mortality record will be reviewed by the mortality audit committee. Ensure all information is accurate and complete. This data is used for quality improvement and learning purposes.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Link href="/dashboard/mortality" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={submitting || !selectedSurgery} className="btn-primary px-8">
            {submitting ? 'Recording...' : 'Record Mortality'}
          </button>
        </div>
      </form>
    </div>
  );
}
