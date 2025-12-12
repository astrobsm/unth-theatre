'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function NewPatientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const data = {
      name: formData.get('name'),
      folderNumber: formData.get('folderNumber'),
      ptNumber: formData.get('ptNumber'),
      age: parseInt(formData.get('age') as string),
      gender: formData.get('gender'),
      ward: formData.get('ward'),
    };

    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/patients');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to register patient');
      }
    } catch (error) {
      setError('An error occurred while registering the patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/patients"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Register Patient</h1>
          <p className="text-gray-600 mt-1">Add a new patient to the system</p>
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

      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-primary-600" />
          <h2 className="text-xl font-semibold">Patient Information</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                className="input-field"
                placeholder="e.g., John Doe"
              />
            </div>

            <div>
              <label className="label">Folder Number *</label>
              <input
                type="text"
                name="folderNumber"
                required
                className="input-field"
                placeholder="e.g., UNTH/2024/001"
              />
              <p className="text-xs text-gray-500 mt-1">Unique hospital folder number</p>
            </div>

            <div>
              <label className="label">PT Number</label>
              <input
                type="text"
                name="ptNumber"
                className="input-field"
                placeholder="e.g., PT001234"
              />
              <p className="text-xs text-gray-500 mt-1">Patient tracking number (optional)</p>
            </div>

            <div>
              <label className="label">Age *</label>
              <input
                type="number"
                name="age"
                required
                min="0"
                max="150"
                className="input-field"
                placeholder="Age in years"
              />
            </div>

            <div>
              <label className="label">Gender *</label>
              <select name="gender" required className="input-field">
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">Ward *</label>
              <select name="ward" required className="input-field">
                <option value="">Select Ward</option>
                <option value="Surgical Ward A">Surgical Ward A</option>
                <option value="Surgical Ward B">Surgical Ward B</option>
                <option value="Surgical Ward C">Surgical Ward C</option>
                <option value="Medical Ward">Medical Ward</option>
                <option value="Gynecology Ward">Gynecology Ward</option>
                <option value="Pediatric Ward">Pediatric Ward</option>
                <option value="Orthopedic Ward">Orthopedic Ward</option>
                <option value="Emergency Ward">Emergency Ward</option>
                <option value="ICU">Intensive Care Unit</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Link href="/dashboard/patients" className="btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
