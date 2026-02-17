'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Siren, Droplet } from 'lucide-react';

export default function NewEmergencyBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [surgeons, setSurgeons] = useState<{ id: string; fullName: string }[]>([]);
  const [anesthetists, setAnesthetists] = useState<{ id: string; fullName: string }[]>([]);

  const [form, setForm] = useState({
    patientName: '',
    folderNumber: '',
    age: '',
    gender: '',
    ward: '',
    diagnosis: '',
    procedureName: '',
    surgicalUnit: '',
    indication: '',
    surgeonId: '',
    anesthetistId: '',
    requiredByTime: '',
    estimatedDuration: '',
    priority: 'CRITICAL',
    classification: '',
    bloodRequired: false,
    bloodType: '',
    bloodUnits: '',
    specialEquipment: '',
    specialRequirements: '',
  });

  // Fetch surgeons and anesthetists for dropdowns
  useEffect(() => {
    async function fetchStaff() {
      try {
        const [surgeonRes, anesthetistRes] = await Promise.all([
          fetch('/api/users?role=SURGEON&status=APPROVED'),
          fetch('/api/users?role=ANAESTHETIST&status=APPROVED'),
        ]);
        if (surgeonRes.ok) {
          const data = await surgeonRes.json();
          setSurgeons(Array.isArray(data) ? data : data.users || []);
        }
        if (anesthetistRes.ok) {
          const data = await anesthetistRes.json();
          setAnesthetists(Array.isArray(data) ? data : data.users || []);
        }
      } catch {}
    }
    fetchStaff();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const surgeonObj = surgeons.find(s => s.id === form.surgeonId);
      const anesthetistObj = anesthetists.find(a => a.id === form.anesthetistId);

      const payload = {
        patientName: form.patientName,
        folderNumber: form.folderNumber,
        age: form.age ? parseInt(form.age) : undefined,
        gender: form.gender || undefined,
        ward: form.ward || undefined,
        diagnosis: form.diagnosis,
        procedureName: form.procedureName,
        surgicalUnit: form.surgicalUnit,
        indication: form.indication,
        surgeonId: form.surgeonId,
        surgeonName: surgeonObj?.fullName || 'Unknown',
        anesthetistId: form.anesthetistId || undefined,
        anesthetistName: anesthetistObj?.fullName || undefined,
        requiredByTime: form.requiredByTime || undefined,
        estimatedDuration: form.estimatedDuration ? parseInt(form.estimatedDuration) : undefined,
        priority: form.priority,
        classification: form.classification || undefined,
        bloodRequired: form.bloodRequired,
        bloodType: form.bloodRequired ? form.bloodType : undefined,
        bloodUnits: form.bloodRequired && form.bloodUnits ? parseInt(form.bloodUnits) : undefined,
        specialEquipment: form.specialEquipment || undefined,
        specialRequirements: form.specialRequirements || undefined,
      };

      const res = await fetch('/api/emergency-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit emergency booking');
      }

      router.push('/dashboard/emergency-booking');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Siren className="h-8 w-8 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-red-700">New Emergency Surgery Booking</h1>
          <p className="text-sm text-gray-600">This will immediately raise emergency alerts to all relevant staff</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-300 text-red-700 p-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Patient Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Patient Name *</label>
              <input name="patientName" value={form.patientName} onChange={handleChange} required className="input-field" />
            </div>
            <div>
              <label className="label">Folder Number *</label>
              <input name="folderNumber" value={form.folderNumber} onChange={handleChange} required className="input-field" />
            </div>
            <div>
              <label className="label">Age</label>
              <input name="age" type="number" value={form.age} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="label">Gender</label>
              <select name="gender" value={form.gender} onChange={handleChange} className="input-field">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="label">Ward</label>
              <input name="ward" value={form.ward} onChange={handleChange} className="input-field" placeholder="e.g. Ward A3" />
            </div>
            <div>
              <label className="label">Diagnosis *</label>
              <input name="diagnosis" value={form.diagnosis} onChange={handleChange} required className="input-field" />
            </div>
          </div>
        </div>

        {/* Surgery Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Surgery Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Procedure Name *</label>
              <input name="procedureName" value={form.procedureName} onChange={handleChange} required className="input-field" />
            </div>
            <div>
              <label className="label">Surgical Unit *</label>
              <input name="surgicalUnit" value={form.surgicalUnit} onChange={handleChange} required className="input-field" placeholder="e.g. General Surgery" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Indication (Reason for Emergency) *</label>
              <textarea name="indication" value={form.indication} onChange={handleChange} required className="input-field" rows={2} placeholder="Why is this surgery an emergency?" />
            </div>
            <div>
              <label className="label">Surgeon *</label>
              <select name="surgeonId" value={form.surgeonId} onChange={handleChange} required className="input-field">
                <option value="">Select surgeon</option>
                {surgeons.map(s => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Anesthetist</label>
              <select name="anesthetistId" value={form.anesthetistId} onChange={handleChange} className="input-field">
                <option value="">Select anesthetist</option>
                {anesthetists.map(a => (
                  <option key={a.id} value={a.id}>{a.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Required By (Time)</label>
              <input name="requiredByTime" type="datetime-local" value={form.requiredByTime} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="label">Estimated Duration (minutes)</label>
              <input name="estimatedDuration" type="number" value={form.estimatedDuration} onChange={handleChange} className="input-field" placeholder="e.g. 90" />
            </div>
          </div>
        </div>

        {/* Priority & Classification */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Priority</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Priority Level *</label>
              <select name="priority" value={form.priority} onChange={handleChange} required className="input-field">
                <option value="CRITICAL">CRITICAL — Life-threatening</option>
                <option value="HIGH">HIGH — Urgent within hours</option>
                <option value="MEDIUM">MEDIUM — Urgent within 24h</option>
              </select>
            </div>
            <div>
              <label className="label">Classification</label>
              <select name="classification" value={form.classification} onChange={handleChange} className="input-field">
                <option value="">Select</option>
                <option value="Life-threatening">Life-threatening</option>
                <option value="Limb-threatening">Limb-threatening</option>
                <option value="Sight-threatening">Sight-threatening</option>
                <option value="Acute abdomen">Acute abdomen</option>
                <option value="Obstetric emergency">Obstetric emergency</option>
                <option value="Trauma">Trauma</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Blood Requirements */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <Droplet className="h-5 w-5 text-red-500" />
            Blood Requirements
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="bloodRequired" checked={form.bloodRequired} onChange={handleChange} className="h-4 w-4" />
              <span className="font-medium">Blood products required</span>
            </label>
            {form.bloodRequired && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="label">Blood Type</label>
                  <select name="bloodType" value={form.bloodType} onChange={handleChange} className="input-field">
                    <option value="">Select</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div>
                  <label className="label">Units Required</label>
                  <input name="bloodUnits" type="number" min="1" value={form.bloodUnits} onChange={handleChange} className="input-field" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Special Requirements */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Special Requirements</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label">Special Equipment (comma-separated)</label>
              <input name="specialEquipment" value={form.specialEquipment} onChange={handleChange} className="input-field" placeholder="e.g. C-arm, Laparoscope" />
            </div>
            <div>
              <label className="label">Other Requirements</label>
              <textarea name="specialRequirements" value={form.specialRequirements} onChange={handleChange} className="input-field" rows={2} />
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Siren className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Emergency Alert Notice</p>
              <p className="text-sm text-red-700 mt-1">
                Submitting this form will immediately create a surgery record, raise an emergency alert visible on all TV displays,
                and notify the Theatre Manager, assigned Surgeon, Anesthetist, Scrub Nurses, and all relevant staff.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Submitting Emergency Booking...
              </>
            ) : (
              <>
                <Siren className="h-5 w-5" />
                Submit Emergency Booking
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
