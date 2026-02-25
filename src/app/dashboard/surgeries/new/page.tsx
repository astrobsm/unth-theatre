'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, User, Stethoscope, AlertCircle, Users, Plus, Trash2, AlertTriangle, Zap, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

type SurgeryType = 'ELECTIVE' | 'URGENT' | 'EMERGENCY';

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

interface TeamMember {
  name: string;
  role: 'CONSULTANT' | 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'HOUSE_OFFICER';
}

export default function NewSurgeryPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchPatient, setSearchPatient] = useState('');
  const [otherSpecialNeeds, setOtherSpecialNeeds] = useState('');
  const [surgeryType, setSurgeryType] = useState<SurgeryType>('ELECTIVE');
  const [showEmergencyWarning, setShowEmergencyWarning] = useState(false);

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
      surgeonName: formData.get('surgeonName'),
      unit: formData.get('unit'),
      subspecialty: formData.get('subspecialty'),
      indication: formData.get('indication'),
      procedureName: formData.get('procedureName'),
      scheduledDate: formData.get('scheduledDate'),
      scheduledTime: formData.get('scheduledTime'),
      estimatedDuration: parseInt(formData.get('estimatedDuration') as string) || 60,
      surgeryType: surgeryType,
      needBloodTransfusion: formData.get('needBloodTransfusion') === 'on',
      needDiathermy: formData.get('needDiathermy') === 'on',
      needStereo: formData.get('needStereo') === 'on',
      needMontrellMattress: formData.get('needMontrellMattress') === 'on',
      otherSpecialNeeds: otherSpecialNeeds,
      teamMembers: teamMembers.filter(tm => tm.name.trim() !== ''), // Only send team members with names
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

  const addTeamMember = (role: 'CONSULTANT' | 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'HOUSE_OFFICER') => {
    setTeamMembers([...teamMembers, { name: '', role }]);
  };

  const removeTeamMember = (index: number) => {
    setTeamMembers(teamMembers.filter((_, i) => i !== index));
  };

  const updateTeamMember = (index: number, name: string) => {
    const updated = [...teamMembers];
    updated[index].name = name;
    setTeamMembers(updated);
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
              <input
                type="text"
                name="surgeonName"
                required
                className="input-field"
                placeholder="Enter surgeon name"
              />
            </div>

            <div>
              <label className="label">Surgical Unit *</label>
              <input
                type="text"
                name="unit"
                required
                className="input-field"
                placeholder="e.g., General Surgery, Orthopedics"
                list="unit-suggestions"
              />
              <datalist id="unit-suggestions">
                <option value="General Surgery" />
                <option value="Orthopedics" />
                <option value="Neurosurgery" />
                <option value="Cardiothoracic" />
                <option value="Urology" />
                <option value="Gynecology" />
                <option value="ENT" />
                <option value="Ophthalmology" />
                <option value="Plastic Surgery" />
                <option value="Pediatric Surgery" />
              </datalist>
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

            {/* Surgery Type Selection */}
            <div className="md:col-span-2">
              <label className="label">Surgery Type *</label>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <label
                  className={`relative flex items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    surgeryType === 'ELECTIVE'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="surgeryTypeRadio"
                    value="ELECTIVE"
                    checked={surgeryType === 'ELECTIVE'}
                    onChange={() => {
                      setSurgeryType('ELECTIVE');
                      setShowEmergencyWarning(false);
                    }}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle className={`w-6 h-6 ${surgeryType === 'ELECTIVE' ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className={`font-medium ${surgeryType === 'ELECTIVE' ? 'text-green-700' : 'text-gray-600'}`}>
                      Elective
                    </span>
                    <span className="text-xs text-gray-500 text-center">Scheduled in advance</span>
                  </div>
                </label>

                <label
                  className={`relative flex items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    surgeryType === 'URGENT'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="surgeryTypeRadio"
                    value="URGENT"
                    checked={surgeryType === 'URGENT'}
                    onChange={() => {
                      setSurgeryType('URGENT');
                      setShowEmergencyWarning(false);
                    }}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className={`w-6 h-6 ${surgeryType === 'URGENT' ? 'text-orange-600' : 'text-gray-400'}`} />
                    <span className={`font-medium ${surgeryType === 'URGENT' ? 'text-orange-700' : 'text-gray-600'}`}>
                      Urgent
                    </span>
                    <span className="text-xs text-gray-500 text-center">Within 24-48 hours</span>
                  </div>
                </label>

                <label
                  className={`relative flex items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    surgeryType === 'EMERGENCY'
                      ? 'border-red-500 bg-red-50 ring-2 ring-red-500 ring-offset-2'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="surgeryTypeRadio"
                    value="EMERGENCY"
                    checked={surgeryType === 'EMERGENCY'}
                    onChange={() => {
                      setSurgeryType('EMERGENCY');
                      setShowEmergencyWarning(true);
                    }}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <Zap className={`w-6 h-6 ${surgeryType === 'EMERGENCY' ? 'text-red-600 animate-pulse' : 'text-gray-400'}`} />
                    <span className={`font-medium ${surgeryType === 'EMERGENCY' ? 'text-red-700' : 'text-gray-600'}`}>
                      Emergency
                    </span>
                    <span className="text-xs text-gray-500 text-center">Immediate attention</span>
                  </div>
                </label>
              </div>

              {/* Emergency Warning */}
              {showEmergencyWarning && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-800">Emergency Surgery Alert</h4>
                      <p className="text-sm text-red-700 mt-1">
                        Submitting this form will trigger an <strong>Emergency Alert</strong> that will:
                      </p>
                      <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-1">
                        <li>Display on all theatre TV displays immediately</li>
                        <li>Announce the emergency details loudly every 2 minutes</li>
                        <li>Continue until acknowledged by the nurse on emergency duty</li>
                        <li>Escalate to all admin users if not acknowledged within 15 minutes</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
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

            <div>
              <label className="label">Estimated Duration (minutes) *</label>
              <input
                type="number"
                name="estimatedDuration"
                required
                min="1"
                max="720"
                defaultValue="60"
                className="input-field"
                placeholder="e.g. 90"
              />
              <p className="text-xs text-gray-500 mt-1">Total estimated duration of the surgery in minutes. Used to validate daily theatre capacity (8 AM - 5 PM).</p>
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
            <SmartTextInput
              label="Other Special Needs"
              value={otherSpecialNeeds}
              onChange={setOtherSpecialNeeds}
              rows={3}
              placeholder="Specify any other special requirements... 🎤 Dictate"
              enableSpeech={true}
              enableOCR={true}
              medicalMode={true}
            />
          </div>
        </div>

        {/* Surgical Team Members */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Surgical Team</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Add team members who will be involved in this surgical procedure
          </p>

          <div className="space-y-4">
            {/* Consultants */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Consultants</label>
                <button
                  type="button"
                  onClick={() => addTeamMember('CONSULTANT')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Consultant
                </button>
              </div>
              {teamMembers.filter(tm => tm.role === 'CONSULTANT').length === 0 ? (
                <p className="text-sm text-gray-500 italic">No consultants added</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member, index) => 
                    member.role === 'CONSULTANT' ? (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) => updateTeamMember(index, e.target.value)}
                          className="input-field flex-1"
                          placeholder="Enter consultant name"
                        />
                        <button
                          type="button"
                          onClick={() => removeTeamMember(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>

            {/* Senior Registrars */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Senior Registrars</label>
                <button
                  type="button"
                  onClick={() => addTeamMember('SENIOR_REGISTRAR')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Senior Registrar
                </button>
              </div>
              {teamMembers.filter(tm => tm.role === 'SENIOR_REGISTRAR').length === 0 ? (
                <p className="text-sm text-gray-500 italic">No senior registrars added</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member, index) => 
                    member.role === 'SENIOR_REGISTRAR' ? (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) => updateTeamMember(index, e.target.value)}
                          className="input-field flex-1"
                          placeholder="Enter senior registrar name"
                        />
                        <button
                          type="button"
                          onClick={() => removeTeamMember(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>

            {/* Registrars */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Registrars</label>
                <button
                  type="button"
                  onClick={() => addTeamMember('REGISTRAR')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Registrar
                </button>
              </div>
              {teamMembers.filter(tm => tm.role === 'REGISTRAR').length === 0 ? (
                <p className="text-sm text-gray-500 italic">No registrars added</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member, index) => 
                    member.role === 'REGISTRAR' ? (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) => updateTeamMember(index, e.target.value)}
                          className="input-field flex-1"
                          placeholder="Enter registrar name"
                        />
                        <button
                          type="button"
                          onClick={() => removeTeamMember(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>

            {/* House Officers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">House Officers</label>
                <button
                  type="button"
                  onClick={() => addTeamMember('HOUSE_OFFICER')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add House Officer
                </button>
              </div>
              {teamMembers.filter(tm => tm.role === 'HOUSE_OFFICER').length === 0 ? (
                <p className="text-sm text-gray-500 italic">No house officers added</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member, index) => 
                    member.role === 'HOUSE_OFFICER' ? (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) => updateTeamMember(index, e.target.value)}
                          className="input-field flex-1"
                          placeholder="Enter house officer name"
                        />
                        <button
                          type="button"
                          onClick={() => removeTeamMember(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
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
