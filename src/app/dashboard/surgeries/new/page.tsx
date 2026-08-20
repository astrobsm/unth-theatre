'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, User, Stethoscope, AlertCircle, Users, Plus, Trash2, AlertTriangle, Zap, CheckCircle, Package, Pill, FileText, Copy, Check, X, UserPlus, FileSignature, Phone } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });
import SurgicalTeamMemberPicker from '@/components/SurgicalTeamMemberPicker';
import PhoneLink from '@/components/PhoneLink';
import ConsentFormFields, { emptyConsentForm, isConsentSigned, type ConsentForm } from '@/components/ConsentFormFields';
import { formatAge } from '@/lib/age';
import { queryElectiveTime } from '@/lib/theatreOps/clock';
import { NoPaperPrescriptionWarning } from '@/components/NoPaperPrescriptionWarning';
import SurgicalPackPicker, { type PackPickerPayload } from '@/components/SurgicalPackPicker';
import ProcedurePicker from '@/components/ProcedurePicker';
import { SUBSPECIALTIES } from '@/lib/procedures/catalogue';
import { isOfflineQueued, queuedMessage } from '@/lib/offlineResponse';
import { notify } from '@/lib/notifications';

type SurgeryType = 'ELECTIVE' | 'URGENT' | 'EMERGENCY';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (d: number) => DAY_NAMES[d] || `Day ${d}`;

interface Patient {
  id: string;
  name: string;
  folderNumber: string;
  ptNumber: string;
  age: number;
  ageUnit?: string;
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

// A&E (Accident & Emergency) theatre is the 24/7 emergency location with two
// suites (North Wing & South Wing) and receives cases from every surgical unit.
function isAneLocation(loc: string): boolean {
  const l = (loc || '').toLowerCase();
  return l.includes('a&e') || l.includes('a & e') || l.includes('accident');
}

export default function NewSurgeryPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Codes shown to the surgeon after a successful booking, to hand to the patient.
  const [bookedCodes, setBookedCodes] = useState<{
    consumablePackCode?: string | null;
    pharmacyDrugCode?: string | null;
    patientName?: string | null;
    folderNumber?: string | null;
    surgeryId?: string | null;
    /// Things that did not save alongside the booking. The case is booked
    /// either way; these are named so somebody can put them right.
    warnings?: string[];
  } | null>(null);

  // The identical case the server found already on the list. Holding it here
  // (rather than showing an error) is what turns "press it again" into a
  // decision: the surgeon is shown what exists and chooses.
  const [alreadyBooked, setAlreadyBooked] = useState<{
    id: string;
    scheduledTime?: string | null;
    createdAt?: string | null;
    bookedByName?: string | null;
    consumablePackCode?: string | null;
    pharmacyDrugCode?: string | null;
    patient?: { name?: string | null; folderNumber?: string | null } | null;
  } | null>(null);
  // ── One section at a time, and it survives an interruption ───────────────
  // The form asks for a great deal, and it used to be all or nothing: a phone
  // that slept or a nurse called away meant starting again at the patient
  // search. Now each section is completed, saved, and the next one opens.
  //
  // Sections are HIDDEN, not unmounted. The submit handler reads its answers
  // out of the DOM with FormData — deliberately, because that is what makes it
  // immune to stale React state — so a section that is not mounted is a section
  // whose answers quietly vanish from the booking.
  const STEP_NAMES = ['Patient', 'Surgery', 'Team', 'Consent & history', 'Safety results', 'Packs & sign-off'];
  const LAST_STEP = STEP_NAMES.length - 1;
  const [step, setStep] = useState(0);
  const stepClass = (n: number) => (n === step ? '' : 'hidden');

  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [resumable, setResumable] = useState<{ step: string; patientName: string | null; updatedAt: string } | null>(null);

  const lastPayloadRef = useRef<Record<string, unknown> | null>(null);
  const [searchPatient, setSearchPatient] = useState('');
  // Patients the SERVER matched for the current search text. Kept apart from
  // `patients` (the locally held recent list) so that going offline degrades to
  // "the recent ones, instantly" rather than to an empty picker.
  const [remoteMatches, setRemoteMatches] = useState<Patient[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'done' | 'unavailable'>('idle');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [otherSpecialNeeds, setOtherSpecialNeeds] = useState('');
  // Compulsory pre-operative safety labs & risk assessments (Part of booking).
  const [preop, setPreop] = useState({
    recentHb: '', hbSampleAt: '', potassium: '', sodium: '', creatinine: '',
    hbsAgStatus: '', hcvStatus: '', hivStatus: '',
    bpSystolic: '', bpDiastolic: '',
    bleedingRiskLevel: '', nutritionalStatusAtBooking: '', pressureSoreRiskAtBooking: '',
  });
  const setPreopField = (k: keyof typeof preop, v: string) => setPreop((p) => ({ ...p, [k]: v }));
  const [postOpDestination, setPostOpDestination] = useState('');
  const [isDayCase, setIsDayCase] = useState(false);
  const [surgeryType, setSurgeryType] = useState<SurgeryType>('ELECTIVE');
  const [anesthesiaType, setAnesthesiaType] = useState<string>('');
  const [showEmergencyWarning, setShowEmergencyWarning] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  // The day's list for the chosen theatre, so the form can offer the next
  // free start rather than leaving the surgeon to work it out.
  const [listPlan, setListPlan] = useState<{ suggestedStart: string; cases: Array<{ start: string; end: string }> } | null>(null);
  const [unit, setUnit] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  // Held in state so the picker can drive it; still submitted as a form field.
  const [procedureName, setProcedureName] = useState('');
  // Further procedures in the same operation; the principal one stays above.
  const [extraProcedures, setExtraProcedures] = useState<string[]>([]);
  const [selectedSurgeonId, setSelectedSurgeonId] = useState('');
  // One or more unit supervising consultants may be attached to a booking.
  const [supervisingConsultantIds, setSupervisingConsultantIds] = useState<string[]>([]);
  const [consentForm, setConsentForm] = useState<ConsentForm>(emptyConsentForm());
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
  const [packPick, setPackPick] = useState<PackPickerPayload>({ consumableRequests: [], drugDressingRequests: [] });

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

  // If we returned here right after registering a new patient, pre-select them
  // so the user can carry on scheduling without searching the list again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pid = new URLSearchParams(window.location.search).get('patientId');
    if (pid) setSelectedPatientId(pid);
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

  // The day's list for the chosen theatre. Fetched from the server so the
  // suggestion here and the validation there come from the same function —
  // a form computing its own would eventually offer a time the server rejects.
  useEffect(() => {
    if (!scheduledDate) { setListPlan(null); return; }
    const params = new URLSearchParams({ date: scheduledDate });
    if (selectedTheatreId) params.set('theatreId', selectedTheatreId);
    else if (unit) params.set('unit', unit);
    else { setListPlan(null); return; }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/theatre-ops/list-plan?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setListPlan(data);
        // Offer the next free slot only when nothing has been typed. Once the
        // surgeon has chosen a time it is theirs — the whole point of the
        // change is that the system stops overwriting it.
        setScheduledTime((current) => current || data.suggestedStart);
      } catch { /* offline — the field simply stays as the surgeon left it */ }
    })();
    return () => { cancelled = true; };
  }, [scheduledDate, selectedTheatreId, unit]);

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

  // Elective cases are auto-scheduled: the first case of the day starts at 09:00
  // and each subsequent case is sequenced by the server (15-min grace + 30-min
  // turnover between cases). Lock the displayed time to 09:00 so the on-duty
  // team can be resolved; the server assigns the final sequenced start time.
  useEffect(() => {
    if (surgeryType === 'ELECTIVE') {
      setScheduledTime('09:00');
    }
  }, [surgeryType]);

  // The 200 most recently registered patients: enough that the overwhelming
  // majority of bookings are matched instantly and offline, small enough that
  // the list cannot quietly grow into a megabyte the way the unbounded one was
  // going to. Anyone older is found by typing — see the search effect below.
  const fetchPatients = async () => {
    try {
      const response = await fetch('/api/patients?limit=200');
      if (response.ok) {
        const data = await response.json();
        setPatients(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  };

  // Offer to resume anything left unfinished. Asked once, on arrival, and
  // phrased around the PATIENT — "continue booking Eneh Abigail?" is a question
  // somebody can answer; "you have a saved draft" is not.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/surgeries/draft');
        if (!res.ok) return;
        const { draft } = await res.json();
        if (!cancelled && draft) {
          setResumable({
            step: draft.step,
            patientName: draft.patientName ?? null,
            updatedAt: draft.updatedAt,
          });
        }
      } catch {
        // No draft service, no resume offer. The form still works.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save the section just completed, then open the next one.
  //
  // The save is awaited but never blocks progress: if it fails the person
  // carries on with a warning rather than being stopped from booking a case
  // because the convenience that protects their typing is unavailable.
  const goToStep = async (next: number) => {
    if (next > step) {
      setDraftSaving(true);
      try {
        const form = document.querySelector('form');
        const fd = form ? new FormData(form as HTMLFormElement) : null;
        // forEach rather than for..of: this project's TS target does not allow
        // iterating a FormData directly, and a build flag is a heavy price for
        // one loop.
        const snapshot: Record<string, unknown> = {};
        fd?.forEach((v, k) => { if (typeof v === 'string') snapshot[k] = v; });

        const res = await fetch('/api/surgeries/draft', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: ['patient', 'surgery', 'team', 'consent', 'preop', 'packs'][next] ?? 'patient',
            patientId: selectedPatientId || null,
            patientName: patients.find((p) => p.id === selectedPatientId)?.name ?? null,
            data: snapshot,
          }),
        });
        if (res.ok) setDraftSavedAt(new Date());
      } catch {
        /* saved nothing — the warning below says so */
      } finally {
        setDraftSaving(false);
      }
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Search the server as they type ──────────────────────────────────────
  // The local list holds recent patients only, so a patient registered months
  // ago would otherwise be invisible — and a surgeon who cannot find a patient
  // registers them again, which is how a folder number ends up on two records.
  //
  // Debounced, because this fires on a keystroke and the link is often poor.
  // Two characters minimum: one letter matches most of the hospital and costs a
  // round trip to say so.
  useEffect(() => {
    const term = searchPatient.trim();
    if (term.length < 2) {
      setRemoteMatches([]);
      setSearchState('idle');
      return;
    }

    const controller = new AbortController();
    setSearchState('searching');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) { setSearchState('unavailable'); return; }
        const data = await res.json();
        setRemoteMatches(Array.isArray(data) ? data : []);
        setSearchState('done');
      } catch (e) {
        // An aborted request is this effect superseding itself, not a failure.
        if ((e as Error)?.name === 'AbortError') return;
        // Offline, or the server did not answer. The local list still works,
        // and saying so is better than an empty dropdown with no explanation.
        setSearchState('unavailable');
      }
    }, 300);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchPatient]);

  const fetchSurgeons = async () => {
    try {
      // Only roles that exist in the UserRole enum can act as the operating surgeon.
      // (Trainee grades aren't separate enum values in this system; consultants and trainees
      //  all sit under SURGEON. House officers are added via the team-member picker, not here.)
      const response = await fetch('/api/users?roles=SURGEON,CONSULTANT_SURGEON&status=APPROVED&slim=1');
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
  // A&E is the 24/7 emergency theatre and handles cases from every surgical unit
  // (across its North Wing and South Wing suites), so any unit stays valid there.
  useEffect(() => {
    if (!selectedLocation) return;
    const current = surgicalUnits.find((u) => u.name === unit);
    if (current && current.location !== selectedLocation && !isAneLocation(selectedLocation)) {
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

    // ── Compulsory pre-operative safety validation ──
    const selPatient = patients.find((p) => p.id === selectedPatientId);
    const patientAgeYears =
      selPatient && (selPatient.ageUnit ?? 'YEARS') === 'YEARS' ? Number(selPatient.age) : 0;
    const missing: string[] = [];
    if (preop.recentHb === '') missing.push('recent haemoglobin');
    if (!preop.hbSampleAt) missing.push('haemoglobin sample date/time');
    if (preop.potassium === '') missing.push('potassium');
    if (preop.sodium === '') missing.push('sodium');
    if (preop.creatinine === '') missing.push('creatinine');
    if (!preop.hbsAgStatus) missing.push('HBsAg status');
    if (!preop.hcvStatus) missing.push('HCV status');
    if (!preop.hivStatus) missing.push('HIV status');
    if (preop.bpSystolic === '' || preop.bpDiastolic === '') missing.push('blood pressure');
    if (!preop.bleedingRiskLevel) missing.push('bleeding-risk assessment');
    if (!preop.nutritionalStatusAtBooking) missing.push('nutritional assessment');
    if (patientAgeYears > 45 && !preop.pressureSoreRiskAtBooking) {
      missing.push('pressure-sore risk assessment (required for patients over 45)');
    }
    // Consent, the pharmacy prescription and the consumables pack are required
    // by the server too — checked here so the answer arrives before the form is
    // submitted rather than after it is filled in.
    if (!consentFile && !isConsentSigned(consentForm)) {
      missing.push('informed consent (upload the signed form, or complete it on the app)');
    }
    // Counted from BOTH sources, exactly as the payload below is built: items
    // picked from the catalogue and items brought in by an applied pack. Either
    // satisfies the requirement, and checking only one would refuse a booking
    // the server would have accepted.
    if (Object.keys(selectedDrugs).length + packPick.drugDressingRequests.length === 0) {
      missing.push('pharmacy prescription (the drugs and fluids Pharmacy must prepare)');
    }
    if (Object.keys(selectedConsumables).length + packPick.consumableRequests.length === 0) {
      missing.push('consumables request (the pack the theatre will be opened with)');
    }
    if (missing.length) {
      setLoading(false);
      setError(`Please complete the compulsory pre-operative safety fields: ${missing.join(', ')}.`);
      return;
    }
    // Haemoglobin must be sampled within 48 h of the scheduled surgery.
    if (preop.hbSampleAt) {
      const dateStr = (e.currentTarget.elements.namedItem('scheduledDate') as HTMLInputElement)?.value;
      const timeStr = (e.currentTarget.elements.namedItem('scheduledTime') as HTMLInputElement)?.value;
      const surgeryWhen = new Date(`${dateStr}T${timeStr || '00:00'}`).getTime();
      const sampleWhen = new Date(preop.hbSampleAt).getTime();
      if (!Number.isNaN(surgeryWhen) && !Number.isNaN(sampleWhen) && (surgeryWhen - sampleWhen) / 3_600_000 > 48) {
        setLoading(false);
        setError('The haemoglobin sample must be taken within 48 hours before surgery. Please repeat the FBC.');
        return;
      }
    }

    // The procedure now comes from the picker, whose hidden input the browser
    // cannot mark required. Checked here so an empty one fails on the form
    // rather than as a server error after everything else was filled in.
    if (!procedureName.trim()) {
      setLoading(false);
      setError('Select the procedure, or choose "Other" and name it.');
      return;
    }

    const formData = new FormData(e.currentTarget);

    const chosenSurgeon = surgeons.find((s) => s.id === selectedSurgeonId);
    const chosenConsultants = surgeons.filter((s) => supervisingConsultantIds.includes(s.id));

    const data = {
      patientId: formData.get('patientId'),
      surgeonId: selectedSurgeonId || null,
      surgeonName: chosenSurgeon?.fullName || formData.get('surgeonName'),
      supervisingConsultantId: supervisingConsultantIds.length ? supervisingConsultantIds.join(',') : null,
      supervisingConsultantName: chosenConsultants.length ? chosenConsultants.map((c) => c.fullName).join(', ') : null,
      consentForm: isConsentSigned(consentForm) || consentForm.procedureText.trim()
        ? consentForm
        : undefined,
      unit: formData.get('unit'),
      subspecialty: formData.get('subspecialty'),
      location: selectedLocation || null,
      theatreId: selectedTheatreId || null,
      indication: formData.get('indication'),
      procedureName: procedureName.trim(),
      additionalProcedures: extraProcedures.map((p) => p.trim()).filter(Boolean),
      scheduledDate: formData.get('scheduledDate'),
      scheduledTime: formData.get('scheduledTime'),
      // No `|| 60` fallback: a silent default is what produced lists that
      // could not happen. An empty field must fail validation, not guess.
      estimatedDuration: parseInt(formData.get('estimatedDuration') as string),
      surgeryType: surgeryType,
      magnitude: (formData.get('magnitude') as string) || null,
      anesthesiaType: anesthesiaType || null,
      needBloodTransfusion: formData.get('needBloodTransfusion') === 'on',
      needDiathermy: formData.get('needDiathermy') === 'on',
      needStereo: formData.get('needStereo') === 'on',
      needMontrellMattress: formData.get('needMontrellMattress') === 'on',
      otherSpecialNeeds: otherSpecialNeeds,
      postOpDestination: postOpDestination || null,
      isDayCase: isDayCase,
      // Compulsory pre-operative safety labs & risk assessments.
      recentHb: preop.recentHb === '' ? null : Number(preop.recentHb),
      hbSampleAt: preop.hbSampleAt || null,
      potassium: preop.potassium === '' ? null : Number(preop.potassium),
      sodium: preop.sodium === '' ? null : Number(preop.sodium),
      creatinine: preop.creatinine === '' ? null : Number(preop.creatinine),
      hbsAgStatus: preop.hbsAgStatus || null,
      hcvStatus: preop.hcvStatus || null,
      hivStatus: preop.hivStatus || null,
      bloodPressureSystolic: preop.bpSystolic === '' ? null : Number(preop.bpSystolic),
      bloodPressureDiastolic: preop.bpDiastolic === '' ? null : Number(preop.bpDiastolic),
      bleedingRiskLevel: preop.bleedingRiskLevel || null,
      nutritionalStatusAtBooking: preop.nutritionalStatusAtBooking || null,
      pressureSoreRiskAtBooking: preop.pressureSoreRiskAtBooking || null,
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
      // Pre-pack plan: surgical consumables (Consumable Pack Provider) — hand-picked
      // catalog items plus any applied packs. The base pack is added server-side.
      consumableRequests: [
        ...Object.entries(selectedConsumables).map(([templateId, sel]) => {
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
        ...packPick.consumableRequests,
      ],
      // Pre-pack plan: drugs / IV fluids / wound-dressing agents (Pharmacy)
      drugDressingRequests: [
        ...Object.entries(selectedDrugs).map(([templateId, sel]) => {
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
        ...packPick.drugDressingRequests,
      ],
      // Informed consent file (base64) — visible to holding-area nurse for clearance
      consentFile: consentFile
        ? { name: consentFile.name, mimeType: consentFile.mimeType, base64: consentFile.base64 }
        : undefined,
    };

    try {
      // Kept so "book another anyway" can re-send exactly what was submitted,
      // rather than asking the surgeon to fill a long form in twice.
      lastPayloadRef.current = data;

      const response = await fetch('/api/surgeries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        // Offline: the write was queued (no server-generated codes/id yet).
        // Confirm and return to the list instead of showing an empty codes modal.
        // The case is made — the draft has served its purpose and must go, or
        // reopening this page offers to resume a booking that already exists.
        // Never awaited and never able to fail the booking: tidying up is not
        // allowed to turn a successful case into an error, which is the exact
        // fault fixed in the audit log two days ago.
        void fetch('/api/surgeries/draft', { method: 'DELETE' }).catch(() => {});

        if (isOfflineQueued(response)) {
          // Two different situations wearing one status code. A timed-out write
          // has usually ALREADY reached the server, so the message has to say
          // "do not enter it again" — that sentence is the difference between
          // one case on the list and two.
          notify.success(queuedMessage(response));
          setLoading(false);
          router.push('/dashboard/surgeries');
          return;
        }
        // Show the patient-facing codes so the surgeon can copy them and give
        // them to the patient before leaving this screen.
        try {
          const created = await response.json();
          setBookedCodes({
            consumablePackCode: created?.consumablePackCode ?? null,
            pharmacyDrugCode: created?.pharmacyDrugCode ?? null,
            patientName: created?.patient?.name ?? null,
            folderNumber: created?.patient?.folderNumber ?? null,
            surgeryId: created?.id ?? null,
            // Booked, but something alongside it did not save. Shown on the
            // confirmation rather than swallowed, because the person who can
            // do something about a missing pharmacy list is standing here now.
            warnings: Array.isArray(created?.warnings) ? created.warnings : [],
          });
          setLoading(false);
          return;
        } catch {
          // The booking SUCCEEDED — a 2xx came back — and only the body could
          // not be read. Sending the surgeon to the list with nothing said is
          // exactly how a successful booking gets made twice. Confirm it.
          notify.success('Surgery booked. The codes are on the case record.');
          setLoading(false);
          router.push('/dashboard/surgeries');
          return;
        }
      }

      // ── Already booked ───────────────────────────────────────────────────
      // Not an error to be reported in red. The case the surgeon wanted exists,
      // which is what they were trying to achieve — so say that plainly, show
      // them the one that is already there, and make booking a second a
      // deliberate act rather than the accidental result of pressing again.
      if (response.status === 409) {
        const parsed = await response.json().catch(() => null);
        if (parsed?.code === 'ALREADY_BOOKED' && parsed?.existing) {
          setAlreadyBooked(parsed.existing);
          setLoading(false);
          return;
        }
      }
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

  // ── What the picker offers ──────────────────────────────────────────────
  // Three sources, merged, in this order of trust:
  //
  //   the locally held recent patients, filtered as you type — instant, and
  //   the only source that works with no network at all;
  //   whatever the server matched for the same text — this is what finds a
  //   patient registered last year, who is not in the local list at all;
  //   the patient already SELECTED, pinned regardless of either.
  //
  // That last one is not a nicety. The <select> shows the option matching its
  // value; if the chosen patient drops out of the list because the search text
  // moved on, the control silently displays nothing while still holding a
  // patientId — and the surgeon, seeing an empty box, picks again or gives up.
  const filteredPatients = (() => {
    const term = searchPatient.trim().toLowerCase();
    const local = patients.filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.folderNumber.toLowerCase().includes(term)
    );

    const byId = new Map<string, Patient>();
    for (const p of local) byId.set(p.id, p);
    for (const p of remoteMatches) if (!byId.has(p.id)) byId.set(p.id, p);

    const chosen =
      patients.find((p) => p.id === selectedPatientId) ??
      remoteMatches.find((p) => p.id === selectedPatientId);
    if (chosen) byId.set(chosen.id, chosen);

    return Array.from(byId.values());
  })();

  return (
    <div className="space-y-6">
      {bookedCodes && (
        <BookingCodesModal
          codes={bookedCodes}
          onClose={() => router.push('/dashboard/surgeries')}
        />
      )}
      {/* ── Resume what was interrupted ─────────────────────────────────── */}
      {resumable && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-indigo-900">
              You have a booking in progress
              {resumable.patientName ? <> for <span className="underline">{resumable.patientName}</span></> : ''}.
            </p>
            <p className="text-sm text-indigo-800 mt-0.5">
              Last saved {new Date(resumable.updatedAt).toLocaleString()}. Nothing has been booked yet.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                const i = ['patient', 'surgery', 'team', 'consent', 'preop', 'packs'].indexOf(resumable.step);
                setStep(i >= 0 ? i : 0);
                setResumable(null);
              }}
              className="rounded-lg bg-indigo-600 text-white font-medium px-4 py-2 hover:bg-indigo-700"
            >
              Continue where I stopped
            </button>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/surgeries/draft', { method: 'DELETE' }).catch(() => {});
                setResumable(null);
              }}
              className="rounded-lg border border-indigo-300 text-indigo-800 px-4 py-2 hover:bg-indigo-100"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* ── Where they are, and what is left ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-sm font-semibold text-gray-900">
            Step {step + 1} of {STEP_NAMES.length} — {STEP_NAMES[step]}
          </p>
          <p className="text-xs text-gray-500">
            {draftSaving
              ? 'Saving…'
              : draftSavedAt
                ? `Saved ${draftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Nothing typed yet'}
          </p>
        </div>
        <div className="flex gap-1.5">
          {STEP_NAMES.map((name, i) => (
            <div
              key={name}
              title={name}
              className={`h-1.5 flex-1 rounded-full ${
                i < step ? 'bg-emerald-500' : i === step ? 'bg-primary-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {alreadyBooked && (
        <AlreadyBookedModal
          existing={alreadyBooked}
          onOpenExisting={() => router.push(`/dashboard/surgeries/${alreadyBooked.id}`)}
          onCancel={() => setAlreadyBooked(null)}
          onBookAnyway={async () => {
            const payload = lastPayloadRef.current;
            if (!payload) { setAlreadyBooked(null); return; }
            setAlreadyBooked(null);
            setLoading(true);
            try {
              const res = await fetch('/api/surgeries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, allowDuplicate: true }),
              });
              if (res.ok) {
                const created = await res.json().catch(() => null);
                setBookedCodes({
                  consumablePackCode: created?.consumablePackCode ?? null,
                  pharmacyDrugCode: created?.pharmacyDrugCode ?? null,
                  patientName: created?.patient?.name ?? null,
                  folderNumber: created?.patient?.folderNumber ?? null,
                  surgeryId: created?.id ?? null,
                  warnings: Array.isArray(created?.warnings) ? created.warnings : [],
                });
              } else {
                setError('That second booking could not be created. The first one is still on the list.');
              }
            } catch {
              setError('That second booking could not be created. The first one is still on the list.');
            } finally {
              setLoading(false);
            }
          }}
        />
      )}
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
        <div className={`${stepClass(0)} card`}>
          <div className="flex items-center gap-3 mb-4">
            <User className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Patient Information</h2>
          </div>

          <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
            <p className="text-base font-extrabold uppercase tracking-wide text-amber-900">
              To book / schedule a patient for surgery, you MUST FIRST REGISTER THE PATIENT.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              If the patient is not in the list below, register them first — you&apos;ll be brought
              right back here with their details ready to continue scheduling.
            </p>
            <Link
              href="/dashboard/patients/new?returnTo=/dashboard/surgeries/new"
              className="btn-primary mt-3 inline-flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Register New Patient
            </Link>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Search Patient</label>
              <input
                type="text"
                placeholder="Search by name or folder number..."
                value={searchPatient}
                onChange={(e) => setSearchPatient(e.target.value)}
                className="input-field mb-1"
              />
              {/*
                Says which patients are on offer and why. Without it, a picker
                that holds only recent patients looks like a picker that has
                lost half the hospital — and somebody re-registers a patient
                who is already on file.
              */}
              <p className="text-xs text-gray-500 mb-2 min-h-[1rem]">
                {searchState === 'searching' && 'Searching all patients…'}
                {searchState === 'done' && (
                  remoteMatches.length > 0
                    ? `${filteredPatients.length} match${filteredPatients.length === 1 ? '' : 'es'}, including older records.`
                    : 'No older record matched. Showing recent patients only.'
                )}
                {searchState === 'unavailable' &&
                  'Could not search older records — showing the recent patients held on this device.'}
                {searchState === 'idle' &&
                  'Showing recent patients. Type two letters to search every patient on file.'}
              </p>
              <select
                name="patientId"
                required
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="input-field"
                title="Select Patient"
              >
                <option value="">Select Patient</option>
                {filteredPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.folderNumber} ({formatAge(patient.age, patient.ageUnit)}, {patient.gender})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Surgery Details */}
        <div className={`${stepClass(1)} card`}>
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
              <label className="label">Unit Supervising Consultant(s)</label>
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id && !supervisingConsultantIds.includes(id)) {
                    setSupervisingConsultantIds((prev) => [...prev, id]);
                  }
                }}
                className="input-field"
                title="Add a unit supervising consultant (you can add more than one)"
              >
                <option value="">— Add Consultant —</option>
                {surgeons
                  .filter((s) => !supervisingConsultantIds.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}{s.role ? ` (${s.role.replace(/_/g, ' ')})` : ''}
                    </option>
                  ))}
              </select>
              {supervisingConsultantIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {supervisingConsultantIds.map((id) => {
                    const c = surgeons.find((s) => s.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-primary-50 border border-primary-200 text-primary-800 text-xs font-medium rounded-full px-3 py-1"
                      >
                        {c?.fullName || 'Unknown'}
                        <button
                          type="button"
                          onClick={() =>
                            setSupervisingConsultantIds((prev) => prev.filter((x) => x !== id))
                          }
                          className="text-primary-500 hover:text-red-600"
                          title="Remove"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Chosen from the surgeon database. You can add more than one. Displayed beside the theatre and unit on the schedule.
              </p>
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
                  .filter((u) => !selectedLocation || isAneLocation(selectedLocation) || u.location === selectedLocation)
                  .map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} · {u.subspecialty}
                    </option>
                  ))}
              </select>
            </div>

            {/* Theatre is NO LONGER chosen by the person booking.
                A unit gets a room for the session and works its own list in it —
                it does not get a different theatre per patient. When each booker
                picked one, a single unit's cases ended up scattered across three
                rooms by three different people, and nobody saw it until the
                morning.
                The theatre manager or nurses now assign one theatre per unit per
                day, from the scheduled list. The state below is kept because the
                roster lookup still uses it once a theatre HAS been assigned. */}
            <div>
              <label className="label">Theatre</label>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                <p className="font-semibold">Assigned by theatre, not at booking.</p>
                <p className="mt-1">
                  Book the case against your unit. The theatre manager or nurses assign
                  a theatre to each unit&apos;s list for the day, and it will appear on
                  the scheduled list once assigned.
                </p>
              </div>
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
              <select
                name="subspecialty"
                required
                value={subspecialty}
                onChange={(e) => {
                  setSubspecialty(e.target.value);
                  // The procedure list is filtered by subspecialty, so a
                  // change invalidates a procedure already chosen.
                  setProcedureName('');
                }}
                className="input-field"
              >
                <option value="">Select subspecialty</option>
                {SUBSPECIALTIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {/* A unit whose subspecialty predates this list must still be
                    selectable, or its bookings could not be edited. */}
                {subspecialty && !SUBSPECIALTIES.includes(subspecialty as never) && (
                  <option value={subspecialty}>{subspecialty}</option>
                )}
              </select>
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
              <ProcedurePicker
                subspecialty={subspecialty}
                value={procedureName}
                onChange={setProcedureName}
                emergencyFirst={surgeryType === 'EMERGENCY'}
              />

              {/* Further procedures in the SAME operation — a tumour resection
                  with a skin graft is one case, one patient, one trip to theatre.
                  Kept as a secondary control rather than a list of equals: the
                  principal procedure is what the case is called on every board
                  and document, and making them equal would leave nothing to put
                  in a table row. */}
              {extraProcedures.map((proc, i) => (
                <div key={i} className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">+</span>
                  <input
                    type="text"
                    value={proc}
                    onChange={(e) => setExtraProcedures((prev) =>
                      prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                    placeholder="Additional procedure in the same operation"
                    aria-label={`Additional procedure ${i + 1}`}
                    className="input-field flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraProcedures((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove this procedure"
                    className="rounded px-2 py-1 text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setExtraProcedures((prev) => [...prev, ''])}
                className="mt-2 text-sm font-semibold text-indigo-700 hover:underline"
              >
                + Add another procedure to this operation
              </button>

              {extraProcedures.some((p) => p.trim()) && (
                <p className="mt-1 text-xs text-gray-600">
                  Packs for each procedure are combined, taking the higher quantity
                  where both need the same item — not the sum.
                </p>
              )}
            </div>

            {/* Surgery Type Selection */}
            <div className="md:col-span-2">
              <label className="label">Surgery Type *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
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
        <div className={`${stepClass(1)} card`}>
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
              {/* The time picker is 12-hour on most phones and opens on AM, so
                  choosing 2:15 for an afternoon case saves 02:15. Asked, never
                  corrected: an early start is unusual, not impossible. */}
              {(() => {
                const q = queryElectiveTime(scheduledTime, surgeryType);
                if (!q) return null;
                return (
                  <p className="text-xs mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                    <span className="font-medium">Check the time.</span> {q.message}
                    {q.didYouMean && (
                      <>
                        {' '}Did you mean{' '}
                        <button
                          type="button"
                          onClick={() => setScheduledTime(q.didYouMean as string)}
                          className="font-semibold text-amber-900 underline"
                        >
                          {q.didYouMean}
                        </button>
                        ?
                      </>
                    )}
                  </p>
                );
              })()}
              {listPlan && (
                <p className="text-xs text-gray-600 mt-1">
                  {listPlan.cases.length === 0
                    ? 'First case of the day for this theatre — suggested start 09:00.'
                    : `${listPlan.cases.length} case${listPlan.cases.length === 1 ? '' : 's'} already booked, last finishing ${listPlan.cases[listPlan.cases.length - 1].end}. With 20 minutes to clean the theatre and move the patient, the next free start is ${listPlan.suggestedStart}.`}
                  {scheduledTime && scheduledTime !== listPlan.suggestedStart && (
                    <button
                      type="button"
                      onClick={() => setScheduledTime(listPlan.suggestedStart)}
                      className="ml-1 font-medium text-blue-600 underline"
                    >
                      Use {listPlan.suggestedStart}
                    </button>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="label">Estimated Duration (minutes) *</label>
              <input
                type="number"
                name="estimatedDuration"
                required
                min="5"
                max="720"
                step="5"
                className="input-field"
                placeholder="e.g. 90"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                How long the case is expected to take. This is what the next case on the
                list is scheduled after, so a guess here becomes somebody else&apos;s delay.
                No default is filled in on purpose.
              </p>
            </div>

            <div>
              <label className="label">Operative Magnitude *</label>
              <select name="magnitude" required defaultValue="" className="input-field">
                <option value="" disabled>Select magnitude…</option>
                <option value="MINOR">Minor</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="MAJOR">Major</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Determines the mandatory base pack sent to the consumable providers — gauze bundle,
                glove and gown counts scale with this.
              </p>
            </div>
          </div>
        </div>

        {/* On-Duty Team — auto-fetched from roster when date + time are picked */}
        {scheduledDate && scheduledTime && (
          <div className={`${stepClass(2)} card`}>
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

          {/* Post-operative disposition */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Post-op destination
              </label>
              <select
                value={postOpDestination}
                onChange={(e) => setPostOpDestination(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                aria-label="Post-operative destination"
              >
                <option value="">Select where the patient goes after surgery…</option>
                <option value="GENERAL_WARD">General Ward</option>
                <option value="ICU">Intensive Care Unit (ICU)</option>
                <option value="HDU">High Dependency Unit (HDU)</option>
                <option value="RECOVERY_THEN_WARD">Recovery, then Ward</option>
                <option value="DAY_CASE_DISCHARGE">Day-case discharge (home same day)</option>
                <option value="OTHER">Other</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Planned disposition; the recovery team confirms this at discharge.</p>
            </div>
            <div className="flex items-end">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDayCase}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsDayCase(checked);
                    // A day case implies a same-day discharge destination.
                    if (checked && !postOpDestination) setPostOpDestination('DAY_CASE_DISCHARGE');
                  }}
                  className="w-5 h-5 text-primary-600 rounded"
                />
                <span className="text-gray-700">Day case (admitted &amp; discharged same day)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Informed / Electronic Consent — UNTH consent form captured at booking */}
        <div className={`${stepClass(3)} card`}>
          <div className="flex items-center gap-3 mb-2">
            <FileSignature className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Consent Form</h2>
            {isConsentSigned(consentForm) && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <CheckCircle className="w-3.5 h-3.5" /> Signed
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Complete and sign the UNTH consent form here. Once signed, the consent is stored with the case and
            recognised across the app (holding area, pre-op assessment, etc.).
          </p>
          <ConsentFormFields value={consentForm} onChange={setConsentForm} />
        </div>

        {/* Clinical Summary — Comorbidities & Current Medications */}
        <div className={`${stepClass(3)} card`}>
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

        {/* Compulsory pre-operative safety labs & risk assessments */}
        {(() => {
          const selP = patients.find((p) => p.id === selectedPatientId);
          const over45 = !!selP && (selP.ageUnit ?? 'YEARS') === 'YEARS' && Number(selP.age) > 45;
          const SEROLOGY = ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'];
          const sel = (k: keyof typeof preop, opts: string[], placeholder = 'Select…') => (
            <select className="input-field" value={preop[k]} onChange={(e) => setPreopField(k, e.target.value)}>
              <option value="">{placeholder}</option>
              {opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
          );
          return (
            <div className={`${stepClass(4)} card border-2 border-amber-200`}>
              <div className="flex items-center gap-3 mb-1">
                <FileText className="w-6 h-6 text-amber-600" />
                <h2 className="text-xl font-semibold">Pre-operative Safety Labs &amp; Assessments</h2>
                <span className="ml-auto text-xs font-semibold text-amber-700">All fields compulsory</span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Current results are required before theatre. Haemoglobin must be sampled within 48&nbsp;hours of surgery.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="label">Recent Hb (g/dL) *</label>
                  <input type="number" step="0.1" min="0" className="input-field" placeholder="e.g. 11.5"
                    value={preop.recentHb} onChange={(e) => setPreopField('recentHb', e.target.value)} />
                </div>
                <div>
                  <label className="label">Hb sample taken (within 48 h) *</label>
                  <input type="datetime-local" className="input-field"
                    value={preop.hbSampleAt} onChange={(e) => setPreopField('hbSampleAt', e.target.value)} />
                </div>
                <div>
                  <label className="label">Blood pressure (mmHg) *</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" className="input-field" placeholder="Systolic"
                      value={preop.bpSystolic} onChange={(e) => setPreopField('bpSystolic', e.target.value)} />
                    <span className="text-gray-400">/</span>
                    <input type="number" min="0" className="input-field" placeholder="Diastolic"
                      value={preop.bpDiastolic} onChange={(e) => setPreopField('bpDiastolic', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Potassium (mmol/L) *</label>
                  <input type="number" step="0.1" className="input-field" placeholder="3.5–5.1"
                    value={preop.potassium} onChange={(e) => setPreopField('potassium', e.target.value)} />
                </div>
                <div>
                  <label className="label">Sodium (mmol/L) *</label>
                  <input type="number" step="0.1" className="input-field" placeholder="135–145"
                    value={preop.sodium} onChange={(e) => setPreopField('sodium', e.target.value)} />
                </div>
                <div>
                  <label className="label">Creatinine (µmol/L) *</label>
                  <input type="number" step="1" className="input-field" placeholder="e.g. 80"
                    value={preop.creatinine} onChange={(e) => setPreopField('creatinine', e.target.value)} />
                </div>
                <div><label className="label">HBsAg *</label>{sel('hbsAgStatus', SEROLOGY)}</div>
                <div><label className="label">HCV *</label>{sel('hcvStatus', SEROLOGY)}</div>
                <div><label className="label">HIV *</label>{sel('hivStatus', SEROLOGY)}</div>
                <div><label className="label">Bleeding-risk assessment *</label>{sel('bleedingRiskLevel', ['LOW', 'MODERATE', 'HIGH'])}</div>
                <div><label className="label">Nutritional assessment *</label>{sel('nutritionalStatusAtBooking', ['GOOD', 'FAIR', 'POOR'])}</div>
                <div>
                  <label className="label">
                    Pressure-sore risk {over45 ? '*' : <span className="text-gray-400 font-normal">(required if age &gt; 45)</span>}
                  </label>
                  {sel('pressureSoreRiskAtBooking', ['LOW', 'MEDIUM', 'HIGH'])}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Named packs — apply a whole consumable/pharmacy pack in one tap */}
        <div className={`${stepClass(5)} card`}>
          <div className="flex items-center gap-3 mb-3">
            <Package className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Apply a pack</h2>
          </div>
          <SurgicalPackPicker subspecialty={subspecialty || undefined} onChange={setPackPick} />
        </div>

        {/* Surgical Consumables manual tick-list removed — the "Apply a pack"
            picker above now supplies consumable requests (each pack expands to
            the same SurgeryConsumableRequest rows for the Consumable Pack
            Provider), and the mandatory base pack still auto-attaches on the
            server. Surgeons fine-tune per case via "View pack content". */}

        {/* Drugs / IV fluids / wound-dressing manual list removed — pharmacy
            packs in the "Apply a pack" picker above now supply these (antibiotics,
            IV fluids, adjuncts) to Pharmacy. Surgeons add any extra drug/fluid
            for this case from the catalog dropdown inside "View pack content". */}

        {/* Informed Consent Upload — visible to Holding Area for clearance */}
        <div className={`${stepClass(5)} card`}>
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">Surgical Consent Form</h2>
            <span className="ml-auto text-xs text-gray-500">Required for holding-area clearance.</span>
          </div>

          {/* Consumable Pack Provider Careline — patients/relatives can reach the
              provider on WhatsApp to arrange the consumable pack before surgery. */}
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-semibold text-green-800 mb-2">
              Consumable Pack Provider Careline
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '0808 689 4420', wa: '2348086894420' },
                { label: '0818 784 6315', wa: '2348187846315' },
                { label: '0817 125 4557', wa: '2348171254557' },
                { label: '0818 989 3738', wa: '2348189893738' },
              ].map((c) => (
                <a
                  key={c.wa}
                  href={`https://wa.me/${c.wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 transition"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {c.label}
                </a>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-3">
            Upload the signed informed consent (PDF or image, ≤ 10 MB). The Holding Area Nurse will review it
            before transferring the patient to theatre. Once a signed consent is attached here, the patient's
            pre-operative assessment consent status is automatically set to <span className="font-medium">Obtained</span>.
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
        <div className={`${stepClass(5)} card`}>
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
                        // Consultant surgeons first, but resident surgeons stay
                        // searchable: everyone starts as SURGEON until an admin
                        // promotes them, so restricting this to the consultant
                        // role alone would empty the picker on day one.
                        roles="CONSULTANT_SURGEON,SURGEON"
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

        {/* ── Move between sections ─────────────────────────────────────────
            The submit button exists ONLY on the last step. Every one of these
            is type="button": a stray submit inside a multi-step form is how a
            half-filled booking gets sent, and the browser will treat Enter in
            any text field as a click on the first submit button it can find. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard/surgeries" className="btn-secondary">
            Cancel
          </Link>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => void goToStep(step - 1)}
                className="btn-secondary"
              >
                ← Back
              </button>
            )}

            {step < LAST_STEP ? (
              <button
                type="button"
                onClick={() => void goToStep(step + 1)}
                disabled={draftSaving}
                className="btn-primary disabled:opacity-60"
              >
                {draftSaving ? 'Saving…' : `Save & continue to ${STEP_NAMES[step + 1]}`}
              </button>
            ) : (
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Scheduling...' : 'Schedule Surgery'}
              </button>
            )}
          </div>
        </div>

        {step < LAST_STEP && (
          <p className="text-xs text-gray-500 text-right">
            Nothing is booked until the last step. Your answers are saved as you go —
            if you are interrupted, reopen this page and continue where you stopped.
          </p>
        )}
      </form>
    </div>
  );
}

// Shown after a successful booking. Displays the patient-facing codes the
// surgeon copies and hands to the patient.
/**
 * Shown when the case the surgeon is booking is already on the list.
 *
 * Deliberately NOT an error. What they were trying to achieve has already
 * happened, and telling somebody "409 conflict" about a case that exists is how
 * you get a third attempt. It states the fact, shows the booking that is
 * already there so they can recognise it, and puts the two sensible actions in
 * front of them. Booking a second is possible and takes a deliberate press —
 * a bilateral list or a return to theatre on the same day is a real thing.
 */
function AlreadyBookedModal({
  existing,
  onOpenExisting,
  onBookAnyway,
  onCancel,
}: {
  existing: {
    id: string;
    scheduledTime?: string | null;
    createdAt?: string | null;
    bookedByName?: string | null;
    consumablePackCode?: string | null;
    pharmacyDrugCode?: string | null;
    patient?: { name?: string | null; folderNumber?: string | null } | null;
  };
  onOpenExisting: () => void;
  onBookAnyway: () => void;
  onCancel: () => void;
}) {
  const when = existing.createdAt ? new Date(existing.createdAt) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <h2 className="text-lg font-bold text-gray-900">This case is already booked</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{existing.patient?.name ?? 'This patient'}</span>
            {existing.patient?.folderNumber ? ` (${existing.patient.folderNumber})` : ''} is already
            on the list for this procedure on this date. Nothing further is needed.
          </p>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
            {existing.scheduledTime && (
              <div><span className="text-gray-500">Scheduled:</span> <span className="font-medium">{existing.scheduledTime}</span></div>
            )}
            {existing.bookedByName && (
              <div><span className="text-gray-500">Booked by:</span> <span className="font-medium">{existing.bookedByName}</span></div>
            )}
            {when && (
              <div><span className="text-gray-500">Booked at:</span> <span className="font-medium">{when.toLocaleString()}</span></div>
            )}
            {existing.consumablePackCode && (
              <div><span className="text-gray-500">Consumable code:</span> <span className="font-mono font-medium">{existing.consumablePackCode}</span></div>
            )}
            {existing.pharmacyDrugCode && (
              <div><span className="text-gray-500">Pharmacy code:</span> <span className="font-mono font-medium">{existing.pharmacyDrugCode}</span></div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t px-5 py-4">
          <button onClick={onOpenExisting} className="flex-1 rounded-lg bg-blue-600 text-white font-medium py-2.5 hover:bg-blue-700">
            Open the booked case
          </button>
          <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50">
            Back to form
          </button>
          <button
            onClick={onBookAnyway}
            className="w-full rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm py-2 hover:bg-amber-100"
          >
            This is a genuinely separate operation — book it as well
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingCodesModal({
  codes,
  onClose,
}: {
  codes: { consumablePackCode?: string | null; pharmacyDrugCode?: string | null; patientName?: string | null; folderNumber?: string | null; surgeryId?: string | null; warnings?: string[] };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const rows: { label: string; value: string | null | undefined; hint: string }[] = [
    {
      label: 'Consumable Pack Code',
      value: codes.consumablePackCode,
      hint: 'Patient presents this to the consumable pack provider.',
    },
    {
      label: 'Pharmacy Drug Code',
      value: codes.pharmacyDrugCode,
      hint: 'Patient presents this to the pharmacy for packing.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <h2 className="text-lg font-bold text-gray-900">Surgery booked</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* The case is booked whatever appears here. These are the things
              that did not save alongside it, named while the person who can
              fix them is still on this screen. */}
          {codes.warnings && codes.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                The case is booked, but this did not save:
              </p>
              <ul className="mt-1 list-disc list-inside text-sm text-amber-900">
                {codes.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
              <p className="text-xs text-amber-800 mt-1.5">
                Open the case and add it, or tell the theatre manager. Do not book the case again.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600">
            Give these codes to{codes.patientName ? <> <span className="font-semibold">{codes.patientName}</span></> : ' the patient'}.
            Keying a code in reveals exactly what was requested so the patient can be costed and pay.
          </p>

          {/* Mandatory: no paper prescriptions. */}
          <NoPaperPrescriptionWarning variant="banner" />

          {/* Payment instruction for the patient */}
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900 mb-1">Tell the patient / relative:</p>
            <p className="text-sm text-amber-800">
              Please go to the <span className="font-semibold">Theatre Pharmacy</span> and the{' '}
              <span className="font-semibold">Consumable Shop</span> with your{' '}
              <span className="font-semibold">PT number{codes.folderNumber ? ` (${codes.folderNumber})` : ''}</span>{' '}
              to pay for your items before the surgery.
            </p>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-500">{r.label}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-lg font-bold tracking-wider text-gray-900">
                  {r.value || '—'}
                </span>
                {r.value && (
                  <button
                    onClick={() => copy(r.value!)}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    {copied === r.value ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500">{r.hint}</div>
            </div>
          ))}
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
            The <span className="font-semibold">Anaesthesia Drug Code</span> is generated later, after the
            anaesthetist reviews and prescribes. The surgeon or anaesthetist gives that code to the patient then.
          </div>
          {codes.surgeryId && (
            <Link
              href={`/dashboard/surgeries/${codes.surgeryId}/consent`}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
            >
              <FileSignature className="w-4 h-4" />
              Complete the surgical consent form now
            </Link>
          )}
          {codes.surgeryId && (
            <Link
              href={`/dashboard/surgeries/${codes.surgeryId}/scribe`}
              className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800 hover:bg-teal-100"
            >
              <Stethoscope className="w-4 h-4" />
              Run Medical Scribe safety check
            </Link>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <button onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

