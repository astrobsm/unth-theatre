'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, Clock, AlertCircle, User, ClipboardList } from 'lucide-react';
import Link from 'next/link';

interface Surgery {
  id: string;
  surgeryType: string;
  scheduledDate: string;
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgeon: {
    fullName: string;
  };
}

interface WHOChecklistData {
  signIn: {
    patientConfirmed: boolean;
    siteMarked: boolean;
    anesthesiaSafetyCheck: boolean;
    pulseOximeterOn: boolean;
    allergyCheck: boolean;
    signInNotes: string;
  };
  timeOut: {
    teamIntroduced: boolean;
    procedureConfirmed: boolean;
    criticalStepsReviewed: boolean;
    equipmentConcerns: boolean;
    antibioticGiven: boolean;
    imagingDisplayed: boolean;
    timeOutNotes: string;
  };
  signOut: {
    procedureRecorded: boolean;
    instrumentCountCorrect: boolean;
    specimenLabeled: boolean;
    equipmentProblems: boolean;
    recoveryPlan: boolean;
    signOutNotes: string;
  };
}

export default function WHOChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const surgeryId = params.id as string;

  const [surgery, setSurgery] = useState<Surgery | null>(null);
  const [activePhase, setActivePhase] = useState<'signIn' | 'timeOut' | 'signOut'>('signIn');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [existingChecklist, setExistingChecklist] = useState<any>(null);

  const [checklistData, setChecklistData] = useState<WHOChecklistData>({
    signIn: {
      patientConfirmed: false,
      siteMarked: false,
      anesthesiaSafetyCheck: false,
      pulseOximeterOn: false,
      allergyCheck: false,
      signInNotes: '',
    },
    timeOut: {
      teamIntroduced: false,
      procedureConfirmed: false,
      criticalStepsReviewed: false,
      equipmentConcerns: false,
      antibioticGiven: false,
      imagingDisplayed: false,
      timeOutNotes: '',
    },
    signOut: {
      procedureRecorded: false,
      instrumentCountCorrect: false,
      specimenLabeled: false,
      equipmentProblems: false,
      recoveryPlan: false,
      signOutNotes: '',
    },
  });

  useEffect(() => {
    fetchSurgery();
    fetchChecklist();
  }, [surgeryId]);

  const fetchSurgery = async () => {
    try {
      const response = await fetch(`/api/surgeries?id=${surgeryId}`);
      if (response.ok) {
        const data = await response.json();
        const surgeryData = Array.isArray(data) ? data.find((s: Surgery) => s.id === surgeryId) : data;
        setSurgery(surgeryData);
      }
    } catch (error) {
      console.error('Failed to fetch surgery:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChecklist = async () => {
    try {
      const response = await fetch(`/api/checklists?surgeryId=${surgeryId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setExistingChecklist(data[0]);
          setChecklistData({
            signIn: {
              patientConfirmed: data[0].patientConfirmed,
              siteMarked: data[0].siteMarked,
              anesthesiaSafetyCheck: data[0].anesthesiaSafetyCheck,
              pulseOximeterOn: data[0].pulseOximeterOn,
              allergyCheck: data[0].allergyCheck,
              signInNotes: data[0].signInNotes || '',
            },
            timeOut: {
              teamIntroduced: data[0].teamIntroduced,
              procedureConfirmed: data[0].procedureConfirmed,
              criticalStepsReviewed: data[0].criticalStepsReviewed,
              equipmentConcerns: data[0].equipmentConcerns,
              antibioticGiven: data[0].antibioticGiven,
              imagingDisplayed: data[0].imagingDisplayed,
              timeOutNotes: data[0].timeOutNotes || '',
            },
            signOut: {
              procedureRecorded: data[0].procedureRecorded,
              instrumentCountCorrect: data[0].instrumentCountCorrect,
              specimenLabeled: data[0].specimenLabeled,
              equipmentProblems: data[0].equipmentProblems,
              recoveryPlan: data[0].recoveryPlan,
              signOutNotes: data[0].signOutNotes || '',
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch checklist:', error);
    }
  };

  const handleCheckboxChange = (phase: keyof WHOChecklistData, field: string, value: boolean) => {
    setChecklistData((prev) => ({
      ...prev,
      [phase]: {
        ...prev[phase],
        [field]: value,
      },
    }));
  };

  const handleNotesChange = (phase: keyof WHOChecklistData, field: string, value: string) => {
    setChecklistData((prev) => ({
      ...prev,
      [phase]: {
        ...prev[phase],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    const payload = {
      surgeryId,
      ...checklistData.signIn,
      ...checklistData.timeOut,
      ...checklistData.signOut,
    };

    try {
      const method = existingChecklist ? 'PATCH' : 'POST';
      const url = existingChecklist ? `/api/checklists/${existingChecklist.id}` : '/api/checklists';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/dashboard/surgeries');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to save checklist');
      }
    } catch (error) {
      setError('An error occurred while saving the checklist');
    } finally {
      setSubmitting(false);
    }
  };

  const getPhaseCompletion = (phase: keyof WHOChecklistData) => {
    const data = checklistData[phase];
    const fields = Object.keys(data).filter((key) => !key.includes('Notes'));
    const completed = fields.filter((key) => data[key as keyof typeof data]).length;
    return { completed, total: fields.length, percentage: (completed / fields.length) * 100 };
  };

  const phases = [
    {
      id: 'signIn' as const,
      name: 'Sign In',
      icon: ClipboardList,
      description: 'Before induction of anesthesia',
      color: 'blue',
    },
    {
      id: 'timeOut' as const,
      name: 'Time Out',
      icon: Clock,
      description: 'Before skin incision',
      color: 'yellow',
    },
    {
      id: 'signOut' as const,
      name: 'Sign Out',
      icon: CheckCircle,
      description: 'Before patient leaves operating room',
      color: 'green',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!surgery) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-2xl font-bold">Surgery not found</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/surgeries"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WHO Surgical Safety Checklist</h1>
          <p className="text-gray-600 mt-1">Ensuring patient safety through standardized procedures</p>
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

      {/* Surgery Info */}
      <div className="card bg-gradient-to-r from-primary-50 to-secondary-50">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow">
            <User className="w-8 h-8 text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{surgery.patient.name}</h2>
            <p className="text-gray-700">Folder: {surgery.patient.folderNumber} | {surgery.patient.age} years | {surgery.patient.gender}</p>
            <p className="text-gray-700 mt-1">
              <span className="font-semibold">Procedure:</span> {surgery.surgeryType} | 
              <span className="font-semibold"> Surgeon:</span> {surgery.surgeon.fullName}
            </p>
          </div>
        </div>
      </div>

      {/* Phase Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {phases.map((phase) => {
          const completion = getPhaseCompletion(phase.id);
          const Icon = phase.icon;
          const isActive = activePhase === phase.id;
          
          return (
            <button
              key={phase.id}
              onClick={() => setActivePhase(phase.id)}
              className={`p-6 rounded-lg border-2 transition-all text-left ${
                isActive
                  ? 'border-primary-600 bg-primary-50 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-8 h-8 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                <span className={`text-2xl font-bold ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
                  {Math.round(completion.percentage)}%
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{phase.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{phase.description}</p>
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      phase.id === 'signIn'
                        ? 'bg-blue-600'
                        : phase.id === 'timeOut'
                        ? 'bg-yellow-600'
                        : 'bg-green-600'
                    }`}
                    style={{ width: `${completion.percentage}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {completion.completed} of {completion.total} items
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sign In Phase */}
      {activePhase === 'signIn' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <ClipboardList className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Sign In</h2>
              <p className="text-gray-600">Before induction of anesthesia</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signIn.patientConfirmed}
                onChange={(e) => handleCheckboxChange('signIn', 'patientConfirmed', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Patient identity confirmed</span>
                <p className="text-sm text-gray-600">Patient has confirmed identity, surgical site, procedure, and consent</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signIn.siteMarked}
                onChange={(e) => handleCheckboxChange('signIn', 'siteMarked', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Surgical site marked</span>
                <p className="text-sm text-gray-600">Site marked or not applicable</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signIn.anesthesiaSafetyCheck}
                onChange={(e) => handleCheckboxChange('signIn', 'anesthesiaSafetyCheck', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Anesthesia safety check completed</span>
                <p className="text-sm text-gray-600">Anesthesia machine and medication check complete</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signIn.pulseOximeterOn}
                onChange={(e) => handleCheckboxChange('signIn', 'pulseOximeterOn', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Pulse oximeter on patient and functioning</span>
                <p className="text-sm text-gray-600">Device in place and displaying pulse rate</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signIn.allergyCheck}
                onChange={(e) => handleCheckboxChange('signIn', 'allergyCheck', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Known allergies reviewed</span>
                <p className="text-sm text-gray-600">Patient allergies documented and communicated to team</p>
              </div>
            </label>

            <div>
              <label className="label">Additional Notes</label>
              <textarea
                value={checklistData.signIn.signInNotes}
                onChange={(e) => handleNotesChange('signIn', 'signInNotes', e.target.value)}
                className="input-field"
                rows={3}
                placeholder="Any concerns or special considerations..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Time Out Phase */}
      {activePhase === 'timeOut' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-8 h-8 text-yellow-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Time Out</h2>
              <p className="text-gray-600">Before skin incision</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.timeOut.teamIntroduced}
                onChange={(e) => handleCheckboxChange('timeOut', 'teamIntroduced', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Team members introduced</span>
                <p className="text-sm text-gray-600">All team members introduced by name and role</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.timeOut.procedureConfirmed}
                onChange={(e) => handleCheckboxChange('timeOut', 'procedureConfirmed', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Procedure, patient, and site confirmed</span>
                <p className="text-sm text-gray-600">Surgeon, anesthesiologist, and nurse confirm procedure</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.timeOut.criticalStepsReviewed}
                onChange={(e) => handleCheckboxChange('timeOut', 'criticalStepsReviewed', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Critical steps reviewed</span>
                <p className="text-sm text-gray-600">Anticipated critical events, duration, and blood loss discussed</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.timeOut.equipmentConcerns}
                onChange={(e) => handleCheckboxChange('timeOut', 'equipmentConcerns', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Equipment concerns addressed</span>
                <p className="text-sm text-gray-600">Sterility and equipment issues confirmed resolved</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.timeOut.antibioticGiven}
                onChange={(e) => handleCheckboxChange('timeOut', 'antibioticGiven', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Antibiotic prophylaxis given (if indicated)</span>
                <p className="text-sm text-gray-600">Within last 60 minutes or not applicable</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.timeOut.imagingDisplayed}
                onChange={(e) => handleCheckboxChange('timeOut', 'imagingDisplayed', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Essential imaging displayed</span>
                <p className="text-sm text-gray-600">Required images available or not applicable</p>
              </div>
            </label>

            <div>
              <label className="label">Additional Notes</label>
              <textarea
                value={checklistData.timeOut.timeOutNotes}
                onChange={(e) => handleNotesChange('timeOut', 'timeOutNotes', e.target.value)}
                className="input-field"
                rows={3}
                placeholder="Any concerns or special considerations..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Phase */}
      {activePhase === 'signOut' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Sign Out</h2>
              <p className="text-gray-600">Before patient leaves operating room</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signOut.procedureRecorded}
                onChange={(e) => handleCheckboxChange('signOut', 'procedureRecorded', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Procedure name recorded</span>
                <p className="text-sm text-gray-600">Nurse verbally confirms procedure performed</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signOut.instrumentCountCorrect}
                onChange={(e) => handleCheckboxChange('signOut', 'instrumentCountCorrect', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Instrument, sponge, and needle counts correct</span>
                <p className="text-sm text-gray-600">Counts completed and correct or not applicable</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signOut.specimenLabeled}
                onChange={(e) => handleCheckboxChange('signOut', 'specimenLabeled', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Specimen labeled correctly</span>
                <p className="text-sm text-gray-600">Specimen labeled with patient name</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signOut.equipmentProblems}
                onChange={(e) => handleCheckboxChange('signOut', 'equipmentProblems', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Equipment problems addressed</span>
                <p className="text-sm text-gray-600">Any issues to be addressed documented</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={checklistData.signOut.recoveryPlan}
                onChange={(e) => handleCheckboxChange('signOut', 'recoveryPlan', e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
              />
              <div>
                <span className="font-semibold text-gray-900">Key recovery concerns reviewed</span>
                <p className="text-sm text-gray-600">Surgeon, anesthetist, and nurse review recovery and management</p>
              </div>
            </label>

            <div>
              <label className="label">Additional Notes</label>
              <textarea
                value={checklistData.signOut.signOutNotes}
                onChange={(e) => handleNotesChange('signOut', 'signOutNotes', e.target.value)}
                className="input-field"
                rows={3}
                placeholder="Any concerns or special considerations..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end gap-4 sticky bottom-0 bg-white p-4 border-t border-gray-200 shadow-lg">
        <Link href="/dashboard/surgeries" className="btn-secondary">
          Cancel
        </Link>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary px-8"
        >
          {submitting ? 'Saving...' : existingChecklist ? 'Update Checklist' : 'Save Checklist'}
        </button>
      </div>
    </div>
  );
}
