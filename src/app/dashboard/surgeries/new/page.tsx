'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, User, Stethoscope, AlertCircle, Users, Plus, Trash2, AlertTriangle, Zap, CheckCircle, Package, Pill, FileText } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });
import SurgicalTeamMemberPicker from '@/components/SurgicalTeamMemberPicker';

type SurgeryType = 'ELECTIVE' | 'URGENT' | 'EMERGENCY';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (d: number) => DAY_NAMES[d] || `Day ${d}`;

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
  role?: string;
  staffCode?: string | null;
}

interface TeamMember {
  name: string;
  role: 'CONSULTANT' | 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'HOUSE_OFFICER';
  userId?: string | null;   // Linked staff record (when picked from DB)
  staffCode?: string | null;
}

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
  candidates?: {
    anaesthetists: OnDutyMember[];
    anaestheticTechnicians: OnDutyMember[];
    nurses: OnDutyMember[];
    cleaners: OnDutyMember[];
    porters: OnDutyMember[];
  };
  rostersFound: number;
};

interface Theatre {
  id: string;
  name: string;
  location: string;
  status: string;
}

interface SurgicalUnitSchedule {
  id: string;
  dayOfWeek: number;
  theatreId: string;
  theatreName: string;
}

interface SurgicalUnit {
  id: string;
  name: string;
  subspecialty: string;
  location: string;
  active: boolean;
  schedules: SurgicalUnitSchedule[];
}

// Pre-anaesthetic comorbidity tick-list (categorised) and common current-medications list.
// Selections are saved to Patient.comorbidities / Patient.otherMedications and shown
// to the pharmacist as a Clinical Summary on the Pharmacy page.
const COMORBIDITY_GROUPS: { category: string; items: string[] }[] = [
  { category: 'Cardiovascular', items: ['Hypertension', 'Ischemic heart disease', 'Heart failure', 'Arrhythmias', 'Valvular heart disease', 'Cardiomyopathy', 'Peripheral vascular disease', 'Previous myocardial infarction', 'Stroke / TIA history', 'Implanted cardiac device (pacemaker / ICD)'] },
  { category: 'Respiratory / Pulmonary', items: ['Asthma', 'COPD', 'Obstructive sleep apnea', 'Pulmonary fibrosis', 'TB history', 'Active respiratory infection', 'Smoking history', 'Previous pulmonary embolism'] },
  { category: 'Endocrine / Metabolic', items: ['Diabetes mellitus', 'Hyperthyroidism', 'Hypothyroidism', 'Obesity / metabolic syndrome', 'Hypoglycemia history'] },
  { category: 'Renal', items: ['Chronic kidney disease', 'Acute kidney injury', 'Dialysis dependence', 'Electrolyte disturbance'] },
  { category: 'Hepatic', items: ['Chronic liver disease', 'Hepatitis', 'Cirrhosis', 'Portal hypertension', 'Alcohol-related liver disease'] },
  { category: 'Hematologic', items: ['Anemia', 'Coagulopathy', 'Thrombocytopenia', 'Sickle cell disease', 'Bleeding disorder', 'Thromboembolic disease'] },
  { category: 'Neurologic', items: ['Stroke history', 'Seizure disorder', 'Parkinson disease', 'Dementia', 'Neuromuscular disorder', 'Peripheral neuropathy'] },
  { category: 'Infectious', items: ['HIV', 'Hepatitis B', 'Hepatitis C', 'Sepsis', 'Active infection', 'Tuberculosis'] },
  { category: 'Nutritional', items: ['Malnutrition', 'Cachexia', 'Hypoalbuminemia', 'Vitamin deficiency'] },
  { category: 'Gastrointestinal', items: ['Peptic ulcer disease', 'GERD', 'Inflammatory bowel disease', 'Previous abdominal surgery'] },
  { category: 'Musculoskeletal / Functional', items: ['Reduced mobility', 'Frailty', 'Contractures', 'Arthritis'] },
  { category: 'Psychiatric / Cognitive', items: ['Depression', 'Anxiety', 'Psychosis', 'Substance abuse', 'Cognitive impairment'] },
  { category: 'Substance Use', items: ['Smoking', 'Alcohol use', 'Opioid dependence', 'Recreational drug use'] },
  { category: 'Connective tissue / Other', items: ['Steroid use', 'Connective tissue disorder', 'Allergy / atopy'] },
];

const CURRENT_MEDICATION_OPTIONS: string[] = [
  'Anticoagulants (e.g. Warfarin, DOACs, Heparin)',
  'Antiplatelets (e.g. Aspirin, Clopidogrel)',
  'Steroids',
  'Antihypertensives (ACEi / ARB / CCB / Beta-blocker / Diuretic)',
  'Insulin',
  'Oral hypoglycemics',
  'Immunosuppressants',
  'Bronchodilators / inhalers',
  'Antiepileptics',
  'Antidepressants / SSRIs / SNRIs',
  'Antipsychotics',
  'Opioid analgesics',
  'NSAIDs',
  'Herbal / traditional medications',
];

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
  const [anesthesiaType, setAnesthesiaType] = useState<string>('');
  const [showEmergencyWarning, setShowEmergencyWarning] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [unit, setUnit] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [selectedSurgeonId, setSelectedSurgeonId] = useState('');
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [selectedTheatreId, setSelectedTheatreId] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [surgicalUnits, setSurgicalUnits] = useState<SurgicalUnit[]>([]);
  const [autoSuggestNote, setAutoSuggestNote] = useState('');
  const [onDuty, setOnDuty] = useState<OnDutyTeam | null>(null);
  const [onDutyLoading, setOnDutyLoading] = useState(false);
  const [onDutyError, setOnDutyError] = useState('');

  // Clinical Summary (comorbidities + current medications)
  const [comorbidities, setComorbidities] = useState<string[]>([]);
  const [otherComorbidities, setOtherComorbidities] = useState('');
  const [currentMedications, setCurrentMedications] = useState<string[]>([]);
  const [otherMedications, setOtherMedications] = useState('');

  // Pre-pack plan: surgical consumables (visible to Consumable Pack Provider)
  const [consumableTemplates, setConsumableTemplates] = useState<any[]>([]);
  const [consumableLoading, setConsumableLoading] = useState(false);
  const [selectedConsumables, setSelectedConsumables] = useState<Record<string, { quantity: number; notes?: string }>>({});

  // Pre-pack plan: drugs / IV fluids / wound dressing agents (visible to Pharmacy)
  const [drugDressingTemplates, setDrugDressingTemplates] = useState<any[]>([]);
  const [drugDressingLoading, setDrugDressingLoading] = useState(false);
  const [selectedDrugs, setSelectedDrugs] = useState<Record<string, { quantity: number; dosage?: string; route?: string; notes?: string }>>({});

  // Informed Consent upload (file → base64 → posted with surgery)
  const [consentFile, setConsentFile] = useState<{ name: string; mimeType: string; base64: string; size: number } | null>(null);
  const [consentError, setConsentError] = useState<string>('');

  const toggleListItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  useEffect(() => {
    fetchPatients();
    fetchSurgeons();
    fetchTheatres();
    fetchLocations();
    fetchSurgicalUnits();
    fetchConsumableTemplates();
    fetchDrugDressingTemplates();
  }, []);

  async function fetchConsumableTemplates(specialty?: string) {
    setConsumableLoading(true);
    try {
      const url = `/api/admin/consumable-templates?activeOnly=true${specialty ? `&specialty=${encodeURIComponent(specialty)}` : ''}`;
      const r = await fetch(url);
      if (r.ok) setConsumableTemplates(await r.json());
    } catch {} finally { setConsumableLoading(false); }
  }
  async function fetchDrugDressingTemplates() {
    setDrugDressingLoading(true);
    try {
      const r = await fetch('/api/admin/drug-dressing-templates?activeOnly=true');
      if (r.ok) setDrugDressingTemplates(await r.json());
    } catch {} finally { setDrugDressingLoading(false); }
  }

  function toggleConsumable(t: any) {
    setSelectedConsumables((prev) => {
      const next = { ...prev };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { quantity: t.defaultQuantity ?? 1 };
      return next;
    });
  }
  function setConsumableQty(id: string, q: number) {
    setSelectedConsumables((p) => ({ ...p, [id]: { ...p[id], quantity: Math.max(1, q) } }));
  }
  function toggleDrug(t: any) {
    setSelectedDrugs((prev) => {
      const next = { ...prev };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { quantity: t.defaultQuantity ?? 1, dosage: t.defaultDosage, route: t.defaultRoute };
      return next;
    });
  }
  function setDrugField(id: string, field: 'quantity' | 'dosage' | 'route' | 'notes', value: any) {
    setSelectedDrugs((p) => ({
      ...p,
      [id]: { ...p[id], [field]: field === 'quantity' ? Math.max(1, Number(value) || 1) : value },
    }));
  }

  async function handleConsentFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setConsentError('');
    const file = e.target.files?.[0];
    if (!file) { setConsentFile(null); return; }
    if (file.size > 10 * 1024 * 1024) { setConsentError('Consent file must be ≤ 10 MB.'); return; }
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(file.type)) {
      setConsentError('Allowed formats: PDF, PNG, JPG, WEBP, HEIC.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',').pop() || '' : result;
      setConsentFile({ name: file.name, mimeType: file.type, base64, size: file.size });
    };
    reader.onerror = () => setConsentError('Failed to read file.');
    reader.readAsDataURL(file);
  }

  // Reload consumable catalog when subspecialty changes (so the picker can be specialty-filtered)
  useEffect(() => {
    if (subspecialty) fetchConsumableTemplates(subspecialty);
  }, [subspecialty]);

  // Auto-fetch on-duty team when scheduledDate + scheduledTime are both set.
  useEffect(() => {
    if (!scheduledDate || !scheduledTime) {
      setOnDuty(null);
      setOnDutyError('');
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setOnDutyLoading(true);
      setOnDutyError('');
      try {
        const dateTime = `${scheduledDate}T${scheduledTime}`;
        const params = new URLSearchParams({ date: dateTime });
        if (selectedTheatreId) params.set('theatreId', selectedTheatreId);
        const url = `/api/roster/on-duty?${params.toString()}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to fetch on-duty team (HTTP ${res.status})`);
        }
        setOnDuty(await res.json());
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
  }, [scheduledDate, scheduledTime, selectedTheatreId]);

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
      // Only roles that exist in the UserRole enum can act as the operating surgeon.
      // (Trainee grades aren't separate enum values in this system; consultants and trainees
      //  all sit under SURGEON. House officers are added via the team-member picker, not here.)
      const response = await fetch('/api/users?role=SURGEON&status=APPROVED');
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data?.users ?? []);
        list.sort((a: Surgeon, b: Surgeon) => (a.fullName || '').localeCompare(b.fullName || ''));
        setSurgeons(list);
      } else {
        console.error('fetchSurgeons HTTP', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch surgeons:', error);
    }
  };

  const fetchTheatres = async () => {
    try {
      const response = await fetch('/api/theatres');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) setTheatres(data);
      }
    } catch (error) {
      console.error('Failed to fetch theatres:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/locations');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) setLocations(data);
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    }
  };

  const fetchSurgicalUnits = async () => {
    try {
      const response = await fetch('/api/surgical-units?activeOnly=true');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) setSurgicalUnits(data);
      }
    } catch (error) {
      console.error('Failed to fetch surgical units:', error);
    }
  };

  // When location changes: clear unit/theatre/subspecialty if they no longer match.
  useEffect(() => {
    if (!selectedLocation) return;
    const current = surgicalUnits.find((u) => u.name === unit);
    if (current && current.location !== selectedLocation) {
      setUnit('');
      setSubspecialty('');
    }
    const currentTheatre = theatres.find((t) => t.id === selectedTheatreId);
    if (currentTheatre && currentTheatre.location !== selectedLocation) {
      setSelectedTheatreId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  // Auto-suggest theatre + auto-fill subspecialty when unit (and optionally date) changes.
  useEffect(() => {
    if (!unit) {
      setAutoSuggestNote('');
      return;
    }
    const u = surgicalUnits.find((su) => su.name === unit);
    if (!u) return;
    if (!subspecialty) setSubspecialty(u.subspecialty);
    if (!selectedLocation) setSelectedLocation(u.location);

    if (!scheduledDate) {
      setAutoSuggestNote(`This unit normally runs in: ${u.schedules.map((s) => `${dayName(s.dayOfWeek)} \u2192 ${s.theatreName}`).join(', ') || '\u2014 no schedule on file'}.`);
      return;
    }
    const dow = new Date(scheduledDate + 'T00:00:00').getDay();
    const match = u.schedules.find((s) => s.dayOfWeek === dow);
    if (match) {
      setAutoSuggestNote(`Schedule: ${u.name} runs in ${match.theatreName} on ${dayName(dow)}. Auto-selected.`);
      // Only auto-select if user hasn't already chosen a theatre or chose the wrong one.
      if (!selectedTheatreId || selectedTheatreId !== match.theatreId) {
        setSelectedTheatreId(match.theatreId);
      }
    } else {
      const others = u.schedules.map((s) => `${dayName(s.dayOfWeek)} (${s.theatreName})`).join(', ');
      setAutoSuggestNote(`No scheduled allocation for ${u.name} on ${dayName(dow)}. Normal days: ${others || 'none on file'}. Pick a theatre manually.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, scheduledDate, surgicalUnits]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);

    const chosenSurgeon = surgeons.find((s) => s.id === selectedSurgeonId);

    const data = {
      patientId: formData.get('patientId'),
      surgeonId: selectedSurgeonId || null,
      surgeonName: chosenSurgeon?.fullName || formData.get('surgeonName'),
      unit: formData.get('unit'),
      subspecialty: formData.get('subspecialty'),
      location: selectedLocation || null,
      theatreId: selectedTheatreId || null,
      indication: formData.get('indication'),
      procedureName: formData.get('procedureName'),
      scheduledDate: formData.get('scheduledDate'),
      scheduledTime: formData.get('scheduledTime'),
      estimatedDuration: parseInt(formData.get('estimatedDuration') as string) || 60,
      surgeryType: surgeryType,
      anesthesiaType: anesthesiaType || null,
      needBloodTransfusion: formData.get('needBloodTransfusion') === 'on',
      needDiathermy: formData.get('needDiathermy') === 'on',
      needStereo: formData.get('needStereo') === 'on',
      needMontrellMattress: formData.get('needMontrellMattress') === 'on',
      otherSpecialNeeds: otherSpecialNeeds,
      // Clinical summary persisted on the Patient record so the Pharmacist sees it on every prescription.
      comorbiditiesList: comorbidities,
      otherComorbidities: otherComorbidities.trim() || null,
      currentMedicationsList: currentMedications,
      otherCurrentMedications: otherMedications.trim() || null,
      teamMembers: teamMembers
        .filter(tm => tm.name.trim() !== '')
        .map(tm => ({
          name: tm.name.trim(),
          role: tm.role,
          userId: tm.userId || null,
          staffCode: tm.staffCode || null,
        })),
      // Auto-fetched on-duty team (advisory — backend may persist / notify)
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
      // Pre-pack plan: surgical consumables (Consumable Pack Provider)
      consumableRequests: Object.entries(selectedConsumables).map(([templateId, sel]) => {
        const t = consumableTemplates.find((x: any) => x.id === templateId);
        return {
          templateId,
          name: t?.name ?? 'Unknown',
          category: t?.category ?? 'OTHER',
          size: t?.size ?? null,
          unit: t?.unit ?? 'piece',
          quantity: sel.quantity,
          notes: sel.notes ?? null,
        };
      }),
      // Pre-pack plan: drugs / IV fluids / wound-dressing agents (Pharmacy)
      drugDressingRequests: Object.entries(selectedDrugs).map(([templateId, sel]) => {
        const t = drugDressingTemplates.find((x: any) => x.id === templateId);
        return {
          templateId,
          name: t?.name ?? 'Unknown',
          type: t?.type ?? 'OTHER',
          dosage: sel.dosage ?? t?.defaultDosage ?? null,
          route: sel.route ?? t?.defaultRoute ?? null,
          quantity: sel.quantity,
          unit: t?.unit ?? 'vial',
          notes: sel.notes ?? null,
        };
      }),
      // Informed consent file (base64) — visible to holding-area nurse for clearance
      consentFile: consentFile
        ? { name: consentFile.name, mimeType: consentFile.mimeType, base64: consentFile.base64 }
        : undefined,
    };

    try {
      const response = await fetch('/api/surgeries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/surgeries');
        return;
      }

      // Read the body safely — the server may return JSON (our handlers) or a
      // non-JSON platform error (e.g. 413 payload too large, 504 timeout).
      const raw = await response.text();
      let message = '';
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed) {
          message = parsed.error || '';
          if (Array.isArray(parsed.details) && parsed.details.length) {
            const fields = parsed.details
              .map((d: any) => (Array.isArray(d.path) ? d.path.join('.') : d.path) + (d.message ? `: ${d.message}` : ''))
              .filter(Boolean)
              .join('; ');
            if (fields) message = `${message ? message + ' — ' : ''}${fields}`;
          }
        }
      } catch {
        // Body was not JSON — surface a trimmed snippet so the cause is visible.
        message = raw ? raw.slice(0, 300) : '';
      }

      if (response.status === 413) {
        message = 'The uploaded consent file is too large for the server. Please upload a file under 4 MB and try again.';
      }

      setError(message || `Failed to schedule surgery (HTTP ${response.status}).`);
    } catch (error) {
      setError(
        error instanceof Error
          ? `Network error while scheduling the surgery: ${error.message}`
          : 'An error occurred while scheduling the surgery'
      );
    } finally {
      setLoading(false);
    }
  };

  const addTeamMember = (role: 'CONSULTANT' | 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'HOUSE_OFFICER') => {
    setTeamMembers([...teamMembers, { name: '', role, userId: null, staffCode: null }]);
  };

  const removeTeamMember = (index: number) => {
    setTeamMembers(teamMembers.filter((_, i) => i !== index));
  };

  const updateTeamMember = (
    index: number,
    next: { name: string; userId?: string | null; staffCode?: string | null }
  ) => {
    const updated = [...teamMembers];
    updated[index] = {
      ...updated[index],
      name: next.name,
      userId: next.userId ?? null,
      staffCode: next.staffCode ?? null,
    };
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
              <select name="patientId" required className="input-field" title="Select Patient">
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
              <select
                name="surgeonId"
                required
                value={selectedSurgeonId}
                onChange={(e) => setSelectedSurgeonId(e.target.value)}
                className="input-field"
                title="Select operating surgeon"
              >
                <option value="">— Select Surgeon —</option>
                {surgeons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}{s.role ? ` (${s.role.replace(/_/g, ' ')})` : ''}
                  </option>
                ))}
              </select>
              {surgeons.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No surgeons found in the staff database. Ask an administrator to add users with role SURGEON / CONSULTANT_SURGEON.
                </p>
              )}
              {/* Hidden field keeps the surgeon name in the form payload for legacy validation */}
              <input type="hidden" name="surgeonName" value={surgeons.find((s) => s.id === selectedSurgeonId)?.fullName || ''} />
            </div>

            <div>
              <label className="label">Location *</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                required
                className="input-field"
                title="Operating location"
              >
                <option value="">— Select Location —</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
              {surgeryType === 'EMERGENCY' && selectedLocation && (
                <p className="text-xs text-red-600 mt-1">
                  Emergency: the perioperative nurse on duty at <strong>{selectedLocation}</strong> will assign an available theatre and the on-duty emergency team will be activated automatically.
                </p>
              )}
            </div>

            <div>
              <label className="label">Surgical Unit *</label>
              <select
                name="unit"
                required
                value={unit}
                onChange={(e) => {
                  const newUnit = e.target.value;
                  setUnit(newUnit);
                  const u = surgicalUnits.find((x) => x.name === newUnit);
                  if (u) {
                    setSubspecialty(u.subspecialty);
                    if (!selectedLocation) setSelectedLocation(u.location);
                  }
                }}
                disabled={!selectedLocation}
                className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
                title="Surgical unit"
              >
                <option value="">
                  {selectedLocation ? '— Select Unit —' : '(pick a location first)'}
                </option>
                {surgicalUnits
                  .filter((u) => !selectedLocation || u.location === selectedLocation)
                  .map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} · {u.subspecialty}
                    </option>
                  ))}
              </select>
            </div>

            {/* Theatre dropdown — filtered by selected location.
                Auto-suggested by day-of-week from the unit's schedule. */}
            <div>
              <label className="label">
                Theatre to be used
                {surgeryType === 'EMERGENCY' && (
                  <span className="text-xs text-red-600 ml-1">(optional — perioperative nurse will assign)</span>
                )}
              </label>
              <select
                value={selectedTheatreId}
                onChange={(e) => setSelectedTheatreId(e.target.value)}
                disabled={!selectedLocation}
                className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed"
                title="Select theatre"
              >
                <option value="">— Select Theatre —</option>
                {theatres
                  .filter((t) => !selectedLocation || t.location === selectedLocation)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.status !== 'AVAILABLE' ? `(${t.status})` : ''}
                    </option>
                  ))}
              </select>
              {autoSuggestNote && (
                <p className="text-xs text-indigo-700 mt-1">{autoSuggestNote}</p>
              )}
              {selectedTheatreId && !scheduledDate && (
                <p className="text-xs text-amber-600 mt-1">
                  Pick a date & time below to load the staff rostered to this theatre.
                </p>
              )}
            </div>

            <div>
              <label className="label">Subspecialty *</label>
              <input
                type="text"
                name="subspecialty"
                required
                value={subspecialty}
                onChange={(e) => setSubspecialty(e.target.value)}
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

            {/* Anaesthesia Type Selection */}
            <div className="md:col-span-2">
              <label className="label">Proposed Anaesthesia Type *</label>
              <select
                required
                value={anesthesiaType}
                onChange={(e) => setAnesthesiaType(e.target.value)}
                className="input-field"
                title="Proposed anaesthesia type"
              >
                <option value="">— Select anaesthesia type —</option>
                <option value="GENERAL">General Anaesthesia (GA)</option>
                <option value="SPINAL">Spinal</option>
                <option value="EPIDURAL">Epidural</option>
                <option value="COMBINED_SPINAL_EPIDURAL">Combined Spinal-Epidural (CSE)</option>
                <option value="REGIONAL">Regional / Block</option>
                <option value="SEDATION">Sedation / MAC</option>
                <option value="LOCAL">Local Anaesthesia (no anaesthetist review needed)</option>
              </select>
              {anesthesiaType === 'LOCAL' && (
                <p className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                  Local cases do not require pre-anaesthetic review by an anaesthetist.
                </p>
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
                title="Surgery date"
                min={new Date().toISOString().split('T')[0]}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Time *</label>
              <input
                type="time"
                name="scheduledTime"
                required
                className="input-field"
                title="Surgery time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
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

        {/* On-Duty Team — auto-fetched from roster when date + time are picked */}
        {scheduledDate && scheduledTime && (
          <div className="card">
            <div className="flex items-center gap-3 mb-1">
              <Users className="w-6 h-6 text-primary-600" />
              <h2 className="text-xl font-semibold">On-Duty Team</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Auto-fetched from the duty roster for the selected date / time.
              {onDuty && <span className="ml-1">Shift: <strong>{onDuty.shift}</strong></span>}
            </p>

            {onDutyLoading && (
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full" />
                Looking up roster…
              </div>
            )}

            {onDutyError && !onDutyLoading && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {onDutyError}
              </div>
            )}

            {/* Full theatre staff list (everyone rostered to the selected
                theatre for this shift) — porters, cleaners, anaesthetic
                technicians, nurses, anaesthetists. */}
            {selectedTheatreId && onDuty?.candidates && !onDutyLoading && onDuty.rostersFound > 0 && (
              <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm font-semibold text-indigo-900 mb-2">
                  Staff in {theatres.find(t => t.id === selectedTheatreId)?.name || 'this theatre'} ({onDuty.shift} shift)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {[
                    { label: 'Anaesthetists', list: onDuty.candidates.anaesthetists },
                    { label: 'Anaesthetic Technicians', list: onDuty.candidates.anaestheticTechnicians },
                    { label: 'Perioperative Nurses', list: onDuty.candidates.nurses },
                    { label: 'Cleaners', list: onDuty.candidates.cleaners },
                    { label: 'Porters', list: onDuty.candidates.porters },
                  ].map(({ label, list }) => (
                    <div key={label} className="bg-white rounded p-2 border border-indigo-100">
                      <p className="font-semibold text-gray-700">{label} ({list.length})</p>
                      {list.length === 0 ? (
                        <p className="italic text-gray-400">— none rostered —</p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-gray-800">
                          {list.map((m) => (
                            <li key={m.userId}>
                              • {m.name}
                              {m.staffCode && <span className="text-gray-500"> ({m.staffCode})</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {onDuty && !onDutyLoading && (
              onDuty.rostersFound === 0 ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                  No roster entries found for {onDuty.date} ({onDuty.shift} shift)
                  {selectedTheatreId ? ' in the selected theatre' : ''}. Please assign manually below.
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
                            {m.phoneNumber && <span className="ml-2">· {m.phoneNumber}</span>}
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
              <span className="text-gray-700">Stirrups Required</span>
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

        {/* Clinical Summary — Comorbidities & Current Medications */}
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Stethoscope className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Clinical Summary</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Tick all comorbidities and current medications that apply to the patient. The Pharmacist will see this summary
            on the Pharmacy page when packing this prescription.
          </p>

          <div className="mb-4">
            <h3 className="font-semibold text-gray-800 mb-2">Comorbidities (tick all that apply)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {COMORBIDITY_GROUPS.map((g) => (
                <div key={g.category} className="border rounded-lg p-3 bg-gray-50">
                  <div className="font-medium text-sm text-gray-700 mb-2">{g.category}</div>
                  <div className="flex flex-wrap gap-2">
                    {g.items.map((item) => {
                      const checked = comorbidities.includes(item);
                      return (
                        <label
                          key={item}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border cursor-pointer select-none ${
                            checked
                              ? 'bg-primary-100 border-primary-400 text-primary-800'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleListItem(comorbidities, setComorbidities, item)}
                            className="hidden"
                          />
                          {item}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label htmlFor="otherComorbidities" className="block text-sm font-medium text-gray-700 mb-1">
                Other comorbidities / clinical notes
              </label>
              <textarea
                id="otherComorbidities"
                value={otherComorbidities}
                onChange={(e) => setOtherComorbidities(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Any other relevant condition not listed above"
              />
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Current Medications (tick all that apply)</h3>
            <div className="flex flex-wrap gap-2">
              {CURRENT_MEDICATION_OPTIONS.map((m) => {
                const checked = currentMedications.includes(m);
                return (
                  <label
                    key={m}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border cursor-pointer select-none ${
                      checked
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleListItem(currentMedications, setCurrentMedications, m)}
                      className="hidden"
                    />
                    {m}
                  </label>
                );
              })}
            </div>
            <div className="mt-3">
              <label htmlFor="otherMedications" className="block text-sm font-medium text-gray-700 mb-1">
                Other current medications (specify name, dose, frequency)
              </label>
              <textarea
                id="otherMedications"
                value={otherMedications}
                onChange={(e) => setOtherMedications(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Metformin 500mg PO BD; Amlodipine 5mg PO daily"
              />
            </div>
          </div>

          {(comorbidities.length + currentMedications.length) > 0 && (
            <div className="mt-3 text-xs text-gray-500">
              Selected: {comorbidities.length} comorbidities, {currentMedications.length} current medications.
            </div>
          )}
        </div>

        {/* Surgical Consumables — Pre-pack plan for Consumable Pack Provider */}
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Surgical Consumables</h2>
            <span className="ml-auto text-xs text-gray-500">
              Pre-pack list for the night before surgery (visible to Consumable Pack Provider).
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Tick each item the patient needs. Quantities default to typical usage and can be edited.
            {subspecialty ? ` Filtered to ${subspecialty}.` : ''}
          </p>
          {consumableLoading ? (
            <div className="text-sm text-gray-500">Loading consumables…</div>
          ) : consumableTemplates.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              No consumables in catalog yet. An admin can seed the starter list at
              <code className="mx-1 bg-amber-100 px-1 rounded">POST /api/admin/seed-surgical-catalog</code>
              or curate items from <a href="/dashboard/admin/surgical-catalog" className="underline">Admin → Surgical Catalog</a>.
            </div>
          ) : (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
              {Object.entries(
                consumableTemplates.reduce((acc: Record<string, any[]>, t: any) => {
                  (acc[t.category] ||= []).push(t); return acc;
                }, {}),
              ).map(([cat, items]: any) => (
                <div key={cat}>
                  <div className="font-medium text-sm text-gray-800 mb-2">{cat.replaceAll('_', ' ')}</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {items.map((t: any) => {
                      const sel = selectedConsumables[t.id];
                      return (
                        <div key={t.id} className={`flex items-center gap-2 border rounded px-3 py-2 ${sel ? 'bg-primary-50 border-primary-200' : 'border-gray-200'}`}>
                          <input
                            aria-label={`Select ${t.name}`}
                            title={`Select ${t.name}`}
                            type="checkbox"
                            checked={!!sel}
                            onChange={() => toggleConsumable(t)}
                            className="w-4 h-4"
                          />
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{t.name}{t.size ? ` — ${t.size}` : ''}</div>
                            <div className="text-xs text-gray-500">{t.unit}{t.specialty ? ` · ${t.specialty}` : ''}</div>
                          </div>
                          {sel && (
                            <input
                              aria-label={`Quantity for ${t.name}`}
                              title="Quantity"
                              placeholder="Qty"
                              type="number"
                              min={1}
                              value={sel.quantity}
                              onChange={(ev) => setConsumableQty(t.id, parseInt(ev.target.value, 10) || 1)}
                              className="w-16 input text-sm py-1"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-xs text-gray-600">
            Selected items: {Object.keys(selectedConsumables).length}
          </div>
        </div>

        {/* Drugs and IV Fluids / Active Wound Dressing Agents — Pharmacy pre-pack */}
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Pill className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Drugs and IV Fluids / Active Wound Dressing Agents</h2>
            <span className="ml-auto text-xs text-gray-500">Visible to Pharmacy for packing.</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Select antibiotics, IV fluids, dressings and wound-care agents needed for this case.
            Edit dosage / route / quantity per item.
          </p>
          {drugDressingLoading ? (
            <div className="text-sm text-gray-500">Loading drugs &amp; dressings…</div>
          ) : drugDressingTemplates.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              No drugs/dressings in catalog yet. Admin can seed via
              <code className="mx-1 bg-amber-100 px-1 rounded">POST /api/admin/seed-surgical-catalog</code>.
            </div>
          ) : (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
              {Object.entries(
                drugDressingTemplates.reduce((acc: Record<string, any[]>, t: any) => {
                  (acc[t.type] ||= []).push(t); return acc;
                }, {}),
              ).map(([typ, items]: any) => (
                <div key={typ}>
                  <div className="font-medium text-sm text-gray-800 mb-2">{typ.replaceAll('_', ' ')}</div>
                  <div className="space-y-2">
                    {items.map((t: any) => {
                      const sel = selectedDrugs[t.id];
                      return (
                        <div key={t.id} className={`border rounded px-3 py-2 ${sel ? 'bg-primary-50 border-primary-200' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-2">
                            <input
                              aria-label={`Select ${t.name}`}
                              title={`Select ${t.name}`}
                              type="checkbox"
                              checked={!!sel}
                              onChange={() => toggleDrug(t)}
                              className="w-4 h-4"
                            />
                            <div className="flex-1 text-sm font-medium">
                              {t.name}
                              {t.isControlled ? <span className="ml-2 text-[10px] uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Controlled</span> : null}
                            </div>
                            <div className="text-xs text-gray-500">{t.unit}</div>
                          </div>
                          {sel && (
                            <div className="grid sm:grid-cols-4 gap-2 mt-2 ml-6 text-xs">
                              <input className="input py-1" placeholder="Dosage" value={sel.dosage || ''} onChange={(e) => setDrugField(t.id, 'dosage', e.target.value)} />
                              <input className="input py-1" placeholder="Route" value={sel.route || ''} onChange={(e) => setDrugField(t.id, 'route', e.target.value)} />
                              <input aria-label={`Quantity for ${t.name}`} title="Quantity" placeholder="Qty" type="number" min={1} className="input py-1" value={sel.quantity} onChange={(e) => setDrugField(t.id, 'quantity', e.target.value)} />
                              <input className="input py-1" placeholder="Notes" value={sel.notes || ''} onChange={(e) => setDrugField(t.id, 'notes', e.target.value)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-xs text-gray-600">Selected: {Object.keys(selectedDrugs).length}</div>
        </div>

        {/* Informed Consent Upload — visible to Holding Area for clearance */}
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Informed Consent</h2>
            <span className="ml-auto text-xs text-gray-500">Required for holding-area clearance.</span>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Upload the signed informed consent (PDF or image, ≤ 10 MB). The Holding Area Nurse will review it
            before transferring the patient to theatre.
          </p>
          <input
            aria-label="Upload signed informed consent file"
            title="Upload signed informed consent file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
            onChange={handleConsentFileChange}
            className="block text-sm"
          />
          {consentError && <div className="text-sm text-red-600 mt-2">{consentError}</div>}
          {consentFile && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="font-medium">{consentFile.name}</span>
              <span className="text-gray-500">{(consentFile.size / 1024).toFixed(0)} KB · {consentFile.mimeType}</span>
              <button type="button" className="text-red-600 underline text-xs" onClick={() => setConsentFile(null)}>
                Remove
              </button>
            </div>
          )}
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
                      <SurgicalTeamMemberPicker
                        key={index}
                        roles="SURGEON"
                        value={{ userId: member.userId, name: member.name, staffCode: member.staffCode }}
                        onChange={(next) => updateTeamMember(index, next)}
                        onRemove={() => removeTeamMember(index)}
                        placeholder="Search consultants by name or staff code…"
                      />
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
                      <SurgicalTeamMemberPicker
                        key={index}
                        roles="SURGEON"
                        value={{ userId: member.userId, name: member.name, staffCode: member.staffCode }}
                        onChange={(next) => updateTeamMember(index, next)}
                        onRemove={() => removeTeamMember(index)}
                        placeholder="Search senior registrars by name or staff code…"
                      />
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
                      <SurgicalTeamMemberPicker
                        key={index}
                        roles="SURGEON"
                        value={{ userId: member.userId, name: member.name, staffCode: member.staffCode }}
                        onChange={(next) => updateTeamMember(index, next)}
                        onRemove={() => removeTeamMember(index)}
                        placeholder="Search registrars by name or staff code…"
                      />
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
                      <SurgicalTeamMemberPicker
                        key={index}
                        roles="HOUSE_OFFICER,SURGEON"
                        value={{ userId: member.userId, name: member.name, staffCode: member.staffCode }}
                        onChange={(next) => updateTeamMember(index, next)}
                        onRemove={() => removeTeamMember(index)}
                        placeholder="Search house officers by name or staff code…"
                      />
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
