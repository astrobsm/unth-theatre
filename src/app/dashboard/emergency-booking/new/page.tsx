'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Siren, Droplet, Users, Plus, Trash2, FileText } from 'lucide-react';
import SurgeryPrePackSelectors, { PrePackPayload } from '@/components/SurgeryPrePackSelectors';
import SurgicalTeamMemberPicker from '@/components/SurgicalTeamMemberPicker';
import PhoneLink from '@/components/PhoneLink';
import jsPDF from 'jspdf';

type OnDutyMember = {
  userId: string;
  name: string;
  role: string;
  staffCode: string | null;
  phoneNumber: string | null;
  seniorityLevel: string | null;
};

type OnDutyTeam = {
  date: string;
  shift: string;
  team: {
    anaesthetist: OnDutyMember | null;
    anaestheticTechnician: OnDutyMember | null;
    scrubNurse: OnDutyMember | null;
    cleaner: OnDutyMember | null;
    porter: OnDutyMember | null;
  };
  rostersFound: number;
};

type TeamRole = 'CONSULTANT' | 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'HOUSE_OFFICER';

type TeamMember = {
  role: TeamRole;
  name: string;
  userId?: string | null;
  staffCode?: string | null;
};

type Theatre = {
  id: string;
  name: string;
  location: string;
  status: string;
  allocations?: Array<{
    surgicalUnit?: string | null;
    surgeryType?: string | null;
    date: string;
    startTime: string;
  }>;
};

type SurgicalUnitOption = {
  id: string;
  name: string;
  subspecialty: string;
};

export default function NewEmergencyBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [surgeons, setSurgeons] = useState<{ id: string; fullName: string }[]>([]);
  const [anesthetists, setAnesthetists] = useState<{ id: string; fullName: string }[]>([]);
  const [onDuty, setOnDuty] = useState<OnDutyTeam | null>(null);
  const [onDutyLoading, setOnDutyLoading] = useState(false);
  const [onDutyError, setOnDutyError] = useState('');
  const [prePack, setPrePack] = useState<PrePackPayload>({ consumableRequests: [], drugDressingRequests: [] });
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [surgicalUnits, setSurgicalUnits] = useState<SurgicalUnitOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  // Tracks whether the anaesthetist field still reflects the on-call roster
  // pick (true) or was manually overridden by the user (false).
  const [anesthetistAuto, setAnesthetistAuto] = useState(true);

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
    theatreId: '',
    theatreName: '',
    anaesthesiaType: '',
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
        const [surgeonRes, anesthetistRes, theatresRes, unitsRes] = await Promise.all([
          fetch('/api/users?role=SURGEON&status=APPROVED'),
          fetch('/api/users?role=ANAESTHETIST&status=APPROVED'),
          fetch('/api/theatres'),
          fetch('/api/surgical-units?activeOnly=true'),
        ]);
        if (surgeonRes.ok) {
          const data = await surgeonRes.json();
          setSurgeons(Array.isArray(data) ? data : data.users || []);
        }
        if (anesthetistRes.ok) {
          const data = await anesthetistRes.json();
          setAnesthetists(Array.isArray(data) ? data : data.users || []);
        }
        if (theatresRes.ok) {
          const data = await theatresRes.json();
          setTheatres(Array.isArray(data) ? data : []);
        }
        if (unitsRes.ok) {
          const data = await unitsRes.json();
          setSurgicalUnits(Array.isArray(data) ? data : []);
        }
      } catch {}
    }
    fetchStaff();
  }, []);

  // Auto-fill theatre from the allocation designated for EMERGENCY surgeries on
  // the selected date. Falls back to a theatre allocated to the chosen surgical
  // unit when no dedicated emergency theatre is rostered that day.
  useEffect(() => {
    if (!form.requiredByTime) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        const date = form.requiredByTime.slice(0, 10);
        const res = await fetch(`/api/theatres?date=${encodeURIComponent(date)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: Theatre[] = await res.json();
        // 1) Theatre designated for emergency surgeries that day.
        const emergencyTheatre = data.find((t) =>
          Array.isArray(t.allocations)
            ? t.allocations.some((a) => (a.surgeryType || '').toUpperCase() === 'EMERGENCY')
            : false,
        );
        // 2) Fallback: theatre allocated to the selected surgical unit.
        const unit = form.surgicalUnit.trim().toLowerCase();
        const unitTheatre = unit
          ? data.find((t) =>
              Array.isArray(t.allocations)
                ? t.allocations.some((a) => (a.surgicalUnit || '').trim().toLowerCase() === unit)
                : false,
            )
          : undefined;
        const matched = emergencyTheatre || unitTheatre;
        if (matched) {
          setForm((prev) => ({
            ...prev,
            theatreId: matched.id,
            theatreName: matched.name,
          }));
        }
      } catch {}
    };
    run();
    return () => controller.abort();
  }, [form.surgicalUnit, form.requiredByTime]);

  const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
    CONSULTANT: 'Consultant',
    SENIOR_REGISTRAR: 'Senior Registrar',
    REGISTRAR: 'Registrar',
    HOUSE_OFFICER: 'House Officer',
  };

  const TEAM_ROLE_ROLES: Record<TeamRole, string> = {
    CONSULTANT: 'SURGEON',
    SENIOR_REGISTRAR: 'SURGEON',
    REGISTRAR: 'SURGEON',
    HOUSE_OFFICER: 'HOUSE_OFFICER',
  };

  const roleMembers = (role: TeamRole) => teamMembers.filter((m) => m.role === role);

  const addTeamMember = (role: TeamRole) => {
    if (roleMembers(role).length >= 2) {
      setError(`Only 2 ${TEAM_ROLE_LABEL[role]}s can be added for a case.`);
      return;
    }
    setError('');
    setTeamMembers((prev) => [...prev, { role, name: '', userId: null, staffCode: null }]);
  };

  const updateTeamMember = (index: number, next: TeamMember) => {
    setTeamMembers((prev) => prev.map((m, i) => (i === index ? next : m)));
  };

  const removeTeamMember = (index: number) => {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const downloadConsentTemplate = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const margin = 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('UNTH EMERGENCY SURGERY CONSENT FORM (TEMPLATE)', w / 2, 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('To be printed, signed by patient/relative and uploaded during booking.', w / 2, 22, { align: 'center' });
    doc.line(margin, 26, w - margin, 26);

    const lines = [
      'Patient Name: ____________________________________________   Folder No: ______________________',
      'Diagnosis: ________________________________________________________________________________',
      'Proposed Procedure: ________________________________________________________________________',
      'Surgical Unit: __________________________   Theatre: __________________________',
      'Date: ____________________   Estimated Start Time: ____________________',
      '',
      'I/We have been informed of the diagnosis, procedure, expected benefits, risks, alternatives,',
      'and possible complications. I/We understand that emergency interventions may be required.',
      'I/We consent to the above operation and required anaesthesia, blood transfusion, and associated',
      'life-saving measures as clinically indicated.',
      '',
      'Patient / Relative Name: _______________________________________________',
      'Relationship to patient (if not patient): ___________________________________',
      'Signature / Thumbprint: ___________________________________   Date: ____________________',
      '',
      'Witness (Name): __________________________________________  Signature: ____________________',
      'Surgeon (Name): __________________________________________  Signature: ____________________',
      'Anaesthetist (Name): ______________________________________  Signature: ____________________',
    ];

    doc.setFontSize(10);
    doc.text(lines, margin, 36);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('UNTH ORM Template - Emergency Surgery Consent', w / 2, 290, { align: 'center' });
    doc.setTextColor(0);

    doc.save('UNTH-Emergency-Surgery-Consent-Template.pdf');
  };

  // Auto-fetch on-duty emergency team whenever the requested date/time changes.
  useEffect(() => {
    if (!form.requiredByTime) {
      setOnDuty(null);
      setOnDutyError('');
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setOnDutyLoading(true);
      setOnDutyError('');
      try {
        const url = `/api/roster/on-duty?date=${encodeURIComponent(form.requiredByTime)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to fetch on-duty team (HTTP ${res.status})`);
        }
        const data: OnDutyTeam = await res.json();
        setOnDuty(data);
        // Auto-select the anaesthetist on call duty for the selected day from the
        // roster. Keep it in sync as the date changes unless the user has manually
        // overridden the field.
        setForm((prev) => {
          if (!anesthetistAuto && prev.anesthetistId) return prev;
          const onCallId = data.team.anaesthetist?.userId || '';
          return { ...prev, anesthetistId: onCallId };
        });
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setOnDuty(null);
        setOnDutyError(err.message || 'Failed to fetch on-duty team');
      } finally {
        setOnDutyLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [form.requiredByTime]);

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
        anaesthesiaType: form.anaesthesiaType || undefined,
        requiredByTime: form.requiredByTime || undefined,
        estimatedDuration: form.estimatedDuration ? parseInt(form.estimatedDuration) : undefined,
        theatreId: form.theatreId || undefined,
        theatreName: form.theatreName || undefined,
        priority: form.priority,
        classification: form.classification || undefined,
        bloodRequired: form.bloodRequired,
        bloodType: form.bloodRequired ? form.bloodType : undefined,
        bloodUnits: form.bloodRequired && form.bloodUnits ? parseInt(form.bloodUnits) : undefined,
        specialEquipment: form.specialEquipment || undefined,
        specialRequirements: form.specialRequirements || undefined,
        teamMembers: teamMembers.filter((m) => m.name.trim()).map((m) => ({
          role: m.role,
          name: m.name.trim(),
          userId: m.userId || undefined,
          staffCode: m.staffCode || undefined,
        })),
        // Pre-pack shopping lists — pushed to Consumable Pack Provider and Pharmacy with red EMERGENCY tag
        consumableRequests: prePack.consumableRequests,
        drugDressingRequests: prePack.drugDressingRequests,
        // Auto-fetched on-duty emergency team (advisory — backend may use to notify)
        onDutyTeam: onDuty
          ? {
              date: onDuty.date,
              shift: onDuty.shift,
              anaesthetistId: onDuty.team.anaesthetist?.userId ?? null,
              anaesthetistName: onDuty.team.anaesthetist?.name ?? null,
              anaestheticTechnicianId: onDuty.team.anaestheticTechnician?.userId ?? null,
              anaestheticTechnicianName: onDuty.team.anaestheticTechnician?.name ?? null,
              scrubNurseId: onDuty.team.scrubNurse?.userId ?? null,
              scrubNurseName: onDuty.team.scrubNurse?.name ?? null,
              cleanerId: onDuty.team.cleaner?.userId ?? null,
              cleanerName: onDuty.team.cleaner?.name ?? null,
              porterId: onDuty.team.porter?.userId ?? null,
              porterName: onDuty.team.porter?.name ?? null,
            }
          : undefined,
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
              <select name="surgicalUnit" value={form.surgicalUnit} onChange={handleChange} required className="input-field">
                <option value="">Select surgical unit</option>
                {surgicalUnits.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}{u.subspecialty ? ` — ${u.subspecialty}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Selected from the surgical units database.
              </p>
            </div>
            <div>
              <label className="label">Theatre to be used</label>
              <select
                name="theatreId"
                value={form.theatreId}
                onChange={(e) => {
                  const theatreId = e.target.value;
                  const t = theatres.find((x) => x.id === theatreId);
                  setForm((prev) => ({
                    ...prev,
                    theatreId,
                    theatreName: t?.name || '',
                  }));
                }}
                className="input-field"
              >
                <option value="">— Select Theatre —</option>
                {theatres.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Auto-filled with the theatre designated for emergency surgeries on the selected day.
              </p>
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
              <select
                name="anesthetistId"
                value={form.anesthetistId}
                onChange={(e) => {
                  // A manual change stops the auto-sync with the on-call roster.
                  setAnesthetistAuto(false);
                  handleChange(e);
                }}
                disabled={form.anaesthesiaType === 'LOCAL' || form.anaesthesiaType === 'NONE'}
                className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Select anesthetist</option>
                {anesthetists.map(a => (
                  <option key={a.id} value={a.id}>{a.fullName}</option>
                ))}
                {onDuty?.team.anaesthetist?.userId &&
                  !anesthetists.some((a) => a.id === onDuty.team.anaesthetist!.userId) && (
                    <option value={onDuty.team.anaesthetist.userId}>
                      {onDuty.team.anaesthetist.name} (on call)
                    </option>
                  )}
              </select>
              {(form.anaesthesiaType === 'LOCAL' || form.anaesthesiaType === 'NONE') ? (
                <p className="mt-1 text-xs text-green-700">
                  No anaesthetist needed for {form.anaesthesiaType} anaesthesia — anaesthetic review is not required.
                </p>
              ) : onDuty?.team.anaesthetist?.userId && anesthetistAuto ? (
                <p className="mt-1 text-xs text-blue-700">
                  Auto-filled from the duty roster: {onDuty.team.anaesthetist.name} (on-call anaesthetist for the selected day).
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  Auto-filled from the duty roster as the on-call anaesthetist for the selected day.
                </p>
              )}
            </div>
            <div>
              <label className="label">Anaesthesia Type *</label>
              <select
                name="anaesthesiaType"
                value={form.anaesthesiaType}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    anaesthesiaType: v,
                    // Clear the anaesthetist when LOCAL/NONE is chosen
                    anesthetistId:
                      v === 'LOCAL' || v === 'NONE' ? '' : prev.anesthetistId,
                  }));
                }}
                required
                className="input-field"
              >
                <option value="">Select anaesthesia type</option>
                <option value="LOCAL">Local — no anaesthetist review needed</option>
                <option value="NONE">None — procedure without anaesthesia</option>
                <option value="SEDATION">Sedation</option>
                <option value="REGIONAL">Regional block</option>
                <option value="SPINAL">Spinal</option>
                <option value="EPIDURAL">Epidural</option>
                <option value="GENERAL">General anaesthesia</option>
              </select>
            </div>
            <div>
              <label className="label">Required By (Time)</label>
              <input name="requiredByTime" type="datetime-local" value={form.requiredByTime} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="label">Estimated Duration (minutes)</label>
              <input name="estimatedDuration" type="number" value={form.estimatedDuration} onChange={handleChange} className="input-field" placeholder="e.g. 90" />
              <p className="mt-1 text-xs text-gray-500">
                Scheduling rules: first case starts at 9:00 AM, 35-minute turnover between cases, and all cases must end by 5:00 PM.
              </p>
            </div>
          </div>
        </div>

        {/* Surgical Team Members */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Surgical Team Members</h2>
          <p className="text-xs text-gray-500 mb-4">
            Add team members for this case. Maximum: 2 per category.
          </p>
          {(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER'] as TeamRole[]).map((role) => {
            const members = roleMembers(role);
            return (
              <div key={role} className="mb-5 border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-800">{TEAM_ROLE_LABEL[role]}s</h3>
                  <button
                    type="button"
                    onClick={() => addTeamMember(role)}
                    disabled={members.length >= 2}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add {TEAM_ROLE_LABEL[role]}
                  </button>
                </div>
                {members.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No {TEAM_ROLE_LABEL[role].toLowerCase()}s added.</p>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map((member, idx) => {
                      if (member.role !== role) return null;
                      return (
                        <div key={`${role}-${idx}`} className="flex items-center gap-2">
                          <div className="flex-1">
                            <SurgicalTeamMemberPicker
                              roles={TEAM_ROLE_ROLES[role]}
                              value={{ userId: member.userId, name: member.name, staffCode: member.staffCode }}
                              onChange={(next) =>
                                updateTeamMember(idx, {
                                  ...member,
                                  name: next.name,
                                  userId: next.userId ?? null,
                                  staffCode: next.staffCode ?? null,
                                })
                              }
                              onRemove={() => removeTeamMember(idx)}
                              placeholder={`Search ${TEAM_ROLE_LABEL[role]}...`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTeamMember(idx)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Remove team member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Consent template */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Consent Form Template</h2>
          <p className="text-sm text-gray-600 mb-3">
            Download, print, sign, then upload signed consent in the case workflow.
          </p>
          <button
            type="button"
            onClick={downloadConsentTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            Download Consent Template (PDF)
          </button>
        </div>

        {/* On-Duty Emergency Team — auto-fetched from roster */}
        {form.requiredByTime && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-1 text-gray-800 flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" />
              On-Duty Emergency Team
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Auto-fetched from the duty roster for the selected date / time.
              {onDuty && (
                <span className="ml-1">Shift: <strong>{onDuty.shift}</strong></span>
              )}
            </p>

            {onDutyLoading && (
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full" />
                Looking up roster…
              </div>
            )}

            {onDutyError && !onDutyLoading && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {onDutyError}
              </div>
            )}

            {onDuty && !onDutyLoading && (
              onDuty.rostersFound === 0 ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                  No roster entries found for {onDuty.date} ({onDuty.shift} shift). Please assign manually below.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: 'Anaesthetist', m: onDuty.team.anaesthetist },
                    { label: 'Anaesthetic Technician', m: onDuty.team.anaestheticTechnician },
                    { label: 'Perioperative Nurse', m: onDuty.team.scrubNurse },
                    { label: 'Cleaner', m: onDuty.team.cleaner },
                    { label: 'Porter', m: onDuty.team.porter },
                  ].map(({ label, m }) => (
                    <div
                      key={label}
                      className={`p-3 rounded border ${m ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
                      {m ? (
                        <>
                          <p className="font-semibold text-gray-900">
                            {m.name}
                            {m.seniorityLevel && (
                              <span className="ml-2 text-xs text-gray-500">({m.seniorityLevel.replace(/_/g, ' ')})</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-600">
                            {m.staffCode || m.role.replace(/_/g, ' ')}
                            {m.phoneNumber && (
                              <span className="ml-2">· <PhoneLink phone={m.phoneNumber} /></span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No one on duty for this role</p>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

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

        {/* Pre-pack lists — Surgical Consumables + Drugs/IV/Wound Dressing for night-before packing */}
        <SurgeryPrePackSelectors
          subspecialty={form.surgicalUnit || undefined}
          emergency
          onChange={setPrePack}
        />

        {/* Warning Banner */}
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Siren className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Emergency Alert Notice</p>
              <p className="text-sm text-red-700 mt-1">
                Submitting this form will immediately create a surgery record, raise an emergency alert visible on all TV displays,
                and notify the Theatre Manager, assigned Surgeon, Anesthetist, Perioperative Nurses, and all relevant staff.
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
