'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Siren, Droplet, Users, Plus, Trash2, FileText, Stethoscope, FileSignature } from 'lucide-react';
import SurgicalPackPicker, { type PackPickerPayload } from '@/components/SurgicalPackPicker';
import { isOfflineQueued, OFFLINE_SAVED_MESSAGE } from '@/lib/offlineResponse';
import { notify } from '@/lib/notifications';
import SurgicalTeamMemberPicker from '@/components/SurgicalTeamMemberPicker';
import PhoneLink from '@/components/PhoneLink';
import ConsentFormFields, { emptyConsentForm, isConsentSigned, type ConsentForm } from '@/components/ConsentFormFields';
import { NoPaperPrescriptionDialog } from '@/components/NoPaperPrescriptionWarning';
import ProcedurePicker from '@/components/ProcedurePicker';

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
  // Holds the just-booked surgery id while the no-paper-prescription dialog is
  // shown; acknowledging navigates on to the consent form.
  const [bookedSurgeryId, setBookedSurgeryId] = useState<string | null>(null);
  const [showNextSteps, setShowNextSteps] = useState(false);
  const [surgeons, setSurgeons] = useState<{ id: string; fullName: string }[]>([]);
  const [anesthetists, setAnesthetists] = useState<{ id: string; fullName: string }[]>([]);
  const [onDuty, setOnDuty] = useState<OnDutyTeam | null>(null);
  const [onDutyLoading, setOnDutyLoading] = useState(false);
  const [onDutyError, setOnDutyError] = useState('');
  const [packPick, setPackPick] = useState<PackPickerPayload>({ consumableRequests: [], drugDressingRequests: [] });
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [surgicalUnits, setSurgicalUnits] = useState<SurgicalUnitOption[]>([]);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [consentForm, setConsentForm] = useState<ConsentForm>(emptyConsentForm());

  // The manual-override state that used to live here is gone with the picker.
  // Nobody overrides the roster from this form any more, so the field always
  // reflects who is on call and there is no second source to keep in sync.

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
    magnitude: '',
    priority: 'CRITICAL',
    classification: '',
    bloodRequired: false,
    bloodType: '',
    bloodUnits: '',
    specialEquipment: '',
    specialRequirements: '',
  });

  // The form stores the unit NAME; the procedure list is keyed by
  // subspecialty. The units already carry it, so it is derived here rather
  // than asked for twice. Declared AFTER `form` — it reads it.
  const selectedUnitSubspecialty =
    surgicalUnits.find((u) => u.name === form.surgicalUnit)?.subspecialty ?? '';

  // Fetch surgeons and anesthetists for dropdowns
  useEffect(() => {
    async function fetchStaff() {
      try {
        const [surgeonRes, anesthetistRes, theatresRes, unitsRes] = await Promise.all([
          fetch('/api/users?roles=SURGEON,CONSULTANT_SURGEON&status=APPROVED'),
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
    CONSULTANT: 'CONSULTANT_SURGEON,SURGEON',
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
        // Whoever is on call for the selected day. Followed unconditionally now
        // that the form has no override — there is no manual choice left to
        // preserve, so the field simply tracks the roster as the date changes.
        setForm((prev) => ({
          ...prev,
          anesthetistId: data.team.anaesthetist?.userId || '',
        }));
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
    } else if (name === 'surgicalUnit') {
      // The procedure list is filtered by the unit's subspecialty, so changing
      // the unit invalidates a procedure already chosen — and, more to the
      // point, would file a newly added one under the wrong specialty.
      setForm(prev => ({ ...prev, surgicalUnit: value, procedureName: '' }));
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
        magnitude: form.magnitude || undefined,
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
        // Merge hand-picked catalog items with any applied packs; the base pack
        // is added server-side.
        consumableRequests: [...packPick.consumableRequests],
        drugDressingRequests: [...packPick.drugDressingRequests],
        // Electronic UNTH consent captured & signed inline at emergency booking.
        consentForm: isConsentSigned(consentForm) || consentForm.procedureText.trim()
          ? consentForm
          : undefined,
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

      // Offline: the booking was queued (no server surgery id yet). Confirm and
      // return to the emergency list; the alerts fire on the server after sync.
      if (isOfflineQueued(res)) {
        notify.success(OFFLINE_SAVED_MESSAGE);
        setLoading(false);
        router.push('/dashboard/emergency-booking');
        return;
      }

      // Show the mandatory no-paper-prescription acknowledgement before moving
      // on to the consent form for the just-booked emergency case.
      const created = await res.json().catch(() => null);
      const newSurgeryId = created?.surgery?.id;
      setBookedSurgeryId(newSurgeryId ?? '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {bookedSurgeryId !== null && !showNextSteps && (
        <NoPaperPrescriptionDialog
          onAcknowledge={() =>
            bookedSurgeryId
              ? setShowNextSteps(true)
              : router.push('/dashboard/emergency-booking')
          }
        />
      )}

      {/* Post-booking next steps — consent + immediate safety check */}
      {showNextSteps && bookedSurgeryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center gap-2 mb-1">
              <Siren className="h-5 w-5 text-red-600" />
              <h3 className="font-semibold text-gray-900">Emergency case booked</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Alerts have been raised. Next steps for this case:</p>
            <div className="space-y-2">
              <button
                onClick={() => router.push(`/dashboard/surgeries/${bookedSurgeryId}/scribe`)}
                className="w-full flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800 hover:bg-teal-100"
              >
                <Stethoscope className="w-4 h-4" /> Run Medical Scribe safety check
              </button>
              <button
                onClick={() => router.push(`/dashboard/surgeries/${bookedSurgeryId}/consent`)}
                className="w-full flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
              >
                <FileSignature className="w-4 h-4" /> Complete the surgical consent form
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => router.push('/dashboard/emergency-booking')} className="btn-secondary text-sm">
                Go to emergency list
              </button>
            </div>
          </div>
        </div>
      )}
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
              {/* The subspecialty is not asked for separately on this form — it
                  is carried by the surgical unit, so the picker derives it from
                  whichever unit was chosen below. */}
              <ProcedurePicker
                subspecialty={selectedUnitSubspecialty}
                value={form.procedureName}
                onChange={(procedureName) => setForm((f) => ({ ...f, procedureName }))}
                emergencyFirst
                subspecialtySource="surgical unit"
              />
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
            {/* Theatre is NOT chosen by the person booking an emergency.
                A surgeon or house officer with a septic abdomen in front of them
                should not be picking rooms. The day's designated emergency
                theatre is filled in automatically where one exists, and theatre
                staff confirm or change it from the emergency board — the same
                press that acknowledges the case and announces it on the radio. */}
            <div>
              <label className="label">Theatre</label>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {form.theatreName ? (
                  <>
                    <p className="font-semibold">{form.theatreName}</p>
                    <p className="mt-1 text-xs">
                      Designated emergency theatre for the day. Theatre staff will confirm
                      it when they acknowledge the case.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Assigned by theatre.</p>
                    <p className="mt-1 text-xs">
                      Submit the booking now. A scrub nurse or the theatre manager assigns
                      the room and it goes out on the radio.
                    </p>
                  </>
                )}
              </div>
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
            {/* The anaesthetist is NO LONGER chosen by the person booking.
                Anaesthesia assigns its own people, through the team assignment
                on the case — "each service assigns its own people", which is
                the rule /api/theatres/assign-team already enforces. A booker
                choosing an anaesthetist was that rule being bypassed at the one
                moment nobody had time to check it.
                Who is on call is still shown, because the booker needs to know
                who is coming; it is displayed rather than selected. The booking
                submits either way — an emergency must never wait on a roster
                upload or on an assignment. */}
            <div>
              <label className="label">Anaesthetist</label>
              {(form.anaesthesiaType === 'LOCAL' || form.anaesthesiaType === 'NONE') ? null : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                  {onDuty?.team.anaesthetist?.name ? (
                    <>
                      <p className="font-semibold">{onDuty.team.anaesthetist.name}</p>
                      <p className="mt-1 text-xs">On call from the duty roster.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">Assigned by anaesthesia.</p>
                      <p className="mt-1 text-xs">
                        No roster is uploaded for this period. Submit the booking now —
                        it does not wait for this. Anaesthesia assigns the case from the
                        team assignment on the scheduled list.
                      </p>
                    </>
                  )}
                </div>
              )}
              {(form.anaesthesiaType === 'LOCAL' || form.anaesthesiaType === 'NONE') ? (
                <p className="mt-1 text-xs text-green-700">
                  No anaesthetist needed for {form.anaesthesiaType} anaesthesia — anaesthetic review is not required.
                </p>
              ) : onDuty?.team.anaesthetist?.userId ? (
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

        {/* Consent form — UNTH consent captured & signed inline */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Consent Form</h2>
            {isConsentSigned(consentForm) && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                Signed
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Complete and sign the UNTH consent form here. Once signed, it is stored with the case and
            recognised across the app.
          </p>
          <ConsentFormFields value={consentForm} onChange={setConsentForm} />
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
            <div>
              <label className="label">Operative Magnitude *</label>
              <select name="magnitude" value={form.magnitude} onChange={handleChange} required className="input-field">
                <option value="" disabled>Select magnitude…</option>
                <option value="MINOR">Minor</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="MAJOR">Major</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Scales the mandatory base pack (gauze bundle, glove/gown counts) sent to the
                consumable providers.
              </p>
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

        {/* Named packs — apply a whole consumable/pharmacy pack in one tap */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Apply a pack</h2>
          <SurgicalPackPicker subspecialty={form.surgicalUnit || undefined} emergency onChange={setPackPick} />
        </div>

        {/* Manual pre-pack tick-lists removed — the "Apply a pack" picker above
            supplies consumables (→ Consumable Pack Provider) and drugs/IV fluids
            (→ Pharmacy); the mandatory base pack still auto-attaches server-side.
            Surgeons fine-tune per case via "View pack content". */}

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
