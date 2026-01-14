'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, User, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import SmartTextInput from '@/components/SmartTextInput';

interface Patient {
  id: string;
  name: string;
  folderNumber: string;
  ward: string;
}

export default function NewTransferPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchPatient, setSearchPatient] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const response = await fetch('/api/patients');
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const data = {
      patientId: formData.get('patientId'),
      fromLocation: formData.get('fromLocation'),
      toLocation: formData.get('toLocation'),
      notes: transferNotes,
    };

    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/transfers');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to record transfer');
      }
    } catch (error) {
      setError('An error occurred while recording the transfer');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchPatient.toLowerCase()) ||
      p.folderNumber.toLowerCase().includes(searchPatient.toLowerCase())
  );

  const locations = [
    { value: 'WARD', label: 'Ward' },
    { value: 'HOLDING_AREA', label: 'Holding Area' },
    { value: 'THEATRE_SUITE', label: 'Theatre Suite' },
    { value: 'RECOVERY', label: 'Recovery Room' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/transfers"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Record Patient Transfer</h1>
          <p className="text-gray-600 mt-1">Track patient movement through theatre workflow</p>
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
        {/* Patient Selection */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Select Patient</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="label">Search Patient</label>
              <input
                type="text"
                placeholder="Search by name or folder number..."
                value={searchPatient}
                onChange={(e) => setSearchPatient(e.target.value)}
                className="input-field mb-2"
              />
              <select name="patientId" required className="input-field">
                <option value="">Select Patient</option>
                {filteredPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.folderNumber} (Current: {patient.ward})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Transfer Details */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <ArrowRight className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Transfer Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">From Location *</label>
              <select name="fromLocation" required className="input-field">
                <option value="">Select Location</option>
                {locations.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">To Location *</label>
              <select name="toLocation" required className="input-field">
                <option value="">Select Location</option>
                {locations.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <SmartTextInput
                label="Notes"
                value={transferNotes}
                onChange={setTransferNotes}
                rows={3}
                placeholder="Add any relevant notes about this transfer... 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            </div>
          </div>

          {/* Transfer Flow Visualization */}
          <div className="mt-6 p-4 bg-gradient-to-r from-primary-50 to-secondary-50 rounded-lg">
            <p className="text-sm font-semibold text-gray-700 mb-3">Typical Transfer Flow:</p>
            <div className="flex items-center justify-between text-sm">
              <div className="text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 shadow">
                  <span className="text-primary-600 font-bold">1</span>
                </div>
                <p className="text-gray-600">Ward</p>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400" />
              <div className="text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 shadow">
                  <span className="text-primary-600 font-bold">2</span>
                </div>
                <p className="text-gray-600">Holding Area</p>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400" />
              <div className="text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 shadow">
                  <span className="text-primary-600 font-bold">3</span>
                </div>
                <p className="text-gray-600">Theatre</p>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400" />
              <div className="text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 shadow">
                  <span className="text-primary-600 font-bold">4</span>
                </div>
                <p className="text-gray-600">Recovery</p>
              </div>
              <ArrowRight className="w-6 h-6 text-gray-400" />
              <div className="text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 shadow">
                  <span className="text-primary-600 font-bold">5</span>
                </div>
                <p className="text-gray-600">Ward</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Link href="/dashboard/transfers" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Recording...' : 'Record Transfer'}
          </button>
        </div>
      </form>
    </div>
  );
}
