'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, User, Stethoscope, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Patient {
  id: string;
  name: string;
  folderNumber: string;
  ptNumber: string;
  age: number;
  gender: string;
  ward: string;
}

interface Surgeon {
  id: string;
  fullName: string;
}

export default function NewSurgeryPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchPatient, setSearchPatient] = useState('');

  useEffect(() => {
    fetchPatients();
    fetchSurgeons();
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

  const fetchSurgeons = async () => {
    try {
      const response = await fetch('/api/users?role=SURGEON');
      if (response.ok) {
        const data = await response.json();
        setSurgeons(data);
      }
    } catch (error) {
      console.error('Failed to fetch surgeons:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const data = {
      patientId: formData.get('patientId'),
      surgeonId: formData.get('surgeonId'),
      unit: formData.get('unit'),
      subspecialty: formData.get('subspecialty'),
      indication: formData.get('indication'),
      procedureName: formData.get('procedureName'),
      scheduledDate: formData.get('scheduledDate'),
      scheduledTime: formData.get('scheduledTime'),
      needBloodTransfusion: formData.get('needBloodTransfusion') === 'on',
      needDiathermy: formData.get('needDiathermy') === 'on',
      needStereo: formData.get('needStereo') === 'on',
      needMontrellMattress: formData.get('needMontrellMattress') === 'on',
      otherSpecialNeeds: formData.get('otherSpecialNeeds'),
    };

    try {
      const response = await fetch('/api/surgeries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/surgeries');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to schedule surgery');
      }
    } catch (error) {
      setError('An error occurred while scheduling the surgery');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchPatient.toLowerCase()) ||
      p.folderNumber.toLowerCase().includes(searchPatient.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/surgeries"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule Surgery</h1>
          <p className="text-gray-600 mt-1">Book a new surgical procedure</p>
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
            <h2 className="text-xl font-semibold">Patient Information</h2>
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
                    {patient.name} - {patient.folderNumber} ({patient.age}y, {patient.gender})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Surgery Details */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Stethoscope className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Surgery Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Surgeon *</label>
              <select name="surgeonId" required className="input-field">
                <option value="">Select Surgeon</option>
                {surgeons.map((surgeon) => (
                  <option key={surgeon.id} value={surgeon.id}>
                    {surgeon.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Surgical Unit *</label>
              <select name="unit" required className="input-field">
                <option value="">Select Unit</option>
                <option value="General Surgery">General Surgery</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="Neurosurgery">Neurosurgery</option>
                <option value="Cardiothoracic">Cardiothoracic</option>
                <option value="Urology">Urology</option>
                <option value="Gynecology">Gynecology</option>
                <option value="ENT">ENT</option>
                <option value="Ophthalmology">Ophthalmology</option>
                <option value="Plastic Surgery">Plastic Surgery</option>
                <option value="Pediatric Surgery">Pediatric Surgery</option>
              </select>
            </div>

            <div>
              <label className="label">Subspecialty *</label>
              <input
                type="text"
                name="subspecialty"
                required
                className="input-field"
                placeholder="e.g., Laparoscopic Surgery"
              />
            </div>

            <div>
              <label className="label">Indication *</label>
              <input
                type="text"
                name="indication"
                required
                className="input-field"
                placeholder="e.g., Acute Appendicitis"
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Procedure Name *</label>
              <input
                type="text"
                name="procedureName"
                required
                className="input-field"
                placeholder="e.g., Laparoscopic Appendectomy"
              />
            </div>
          </div>
        </div>

        {/* Scheduling */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Schedule</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                name="scheduledDate"
                required
                className="input-field"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div>
              <label className="label">Time *</label>
              <input
                type="time"
                name="scheduledTime"
                required
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* Special Needs */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Special Needs</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="needBloodTransfusion"
                className="w-5 h-5 text-primary-600 rounded"
              />
              <span className="text-gray-700">Blood Transfusion Required</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="needDiathermy"
                className="w-5 h-5 text-primary-600 rounded"
              />
              <span className="text-gray-700">Diathermy Required</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="needStereo"
                className="w-5 h-5 text-primary-600 rounded"
              />
              <span className="text-gray-700">Stereo Required</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="needMontrellMattress"
                className="w-5 h-5 text-primary-600 rounded"
              />
              <span className="text-gray-700">Montrell Mattress Required</span>
            </label>
          </div>

          <div className="mt-4">
            <label className="label">Other Special Needs</label>
            <textarea
              name="otherSpecialNeeds"
              className="input-field"
              rows={3}
              placeholder="Specify any other special requirements..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Link href="/dashboard/surgeries" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Scheduling...' : 'Schedule Surgery'}
          </button>
        </div>
      </form>
    </div>
  );
}
