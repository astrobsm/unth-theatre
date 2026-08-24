'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FACILITY_COORDS, haversineDistanceKm } from '@/lib/constants';
import { availabilityMeta } from '@/lib/staffAvailability';
import { watDay, watToday } from '@/lib/watDay';
import { getNemlMedicationCategories } from '@/lib/neml-as-medication-categories';
import {
  AlertTriangle, Plus, Clock, CheckCircle, XCircle, RefreshCw,
  User, Users, Building2, Siren, Phone, Calendar, MapPin, Navigation,
  Stethoscope, Pill, ChevronDown, ChevronUp, Activity, Search, Trash2
} from 'lucide-react';
import TheatreTeamAssigner from '@/components/TheatreTeamAssigner';
import AnaesthesiaPackPicker, { type AnaesPackPayload } from '@/components/AnaesthesiaPackPicker';

// ==================== BNF DRUG DIRECTORY ====================
interface DrugEntry { name: string; unit: string; commonDoses: string[]; }
interface PrescribedMedication {
  id: string;
  drugName: string;
  dose: string;
  unit: string;
  route: string;
  frequency: string;
  category: string;
  status: 'PRESCRIBED' | 'USED' | 'HARMONIZED' | 'RETURNED';
  notes: string;
}

const BNF_DIRECTORY_BASE: Record<string, DrugEntry[]> = {
  'Induction Agents': [
    { name: 'Propofol', unit: 'mg', commonDoses: ['50', '100', '150', '200'] },
    { name: 'Thiopental (Pentothal)', unit: 'mg', commonDoses: ['200', '300', '400', '500'] },
    { name: 'Ketamine', unit: 'mg', commonDoses: ['25', '50', '100', '150', '200'] },
    { name: 'Etomidate', unit: 'mg', commonDoses: ['10', '20', '30'] },
  ],
  'Opioid Analgesics': [
    { name: 'Fentanyl', unit: 'mcg', commonDoses: ['25', '50', '100', '150', '200'] },
    { name: 'Morphine', unit: 'mg', commonDoses: ['2', '5', '10', '15', '20'] },
    { name: 'Pethidine (Meperidine)', unit: 'mg', commonDoses: ['25', '50', '75', '100'] },
    { name: 'Remifentanil', unit: 'mcg/kg/min', commonDoses: ['0.05', '0.1', '0.25', '0.5'] },
    { name: 'Sufentanil', unit: 'mcg', commonDoses: ['5', '10', '25', '50'] },
    { name: 'Tramadol', unit: 'mg', commonDoses: ['50', '100'] },
    { name: 'Pentazocine', unit: 'mg', commonDoses: ['15', '30'] },
  ],
  'Neuromuscular Blocking Agents': [
    { name: 'Succinylcholine (Suxamethonium)', unit: 'mg', commonDoses: ['50', '100', '150'] },
    { name: 'Rocuronium', unit: 'mg', commonDoses: ['30', '50', '60', '100'] },
    { name: 'Atracurium', unit: 'mg', commonDoses: ['25', '30', '50'] },
    { name: 'Vecuronium', unit: 'mg', commonDoses: ['4', '6', '8', '10'] },
    { name: 'Cisatracurium', unit: 'mg', commonDoses: ['10', '15', '20'] },
    { name: 'Pancuronium', unit: 'mg', commonDoses: ['4', '6', '8'] },
  ],
  'Reversal Agents': [
    { name: 'Neostigmine', unit: 'mg', commonDoses: ['1', '2.5', '5'] },
    { name: 'Sugammadex', unit: 'mg', commonDoses: ['100', '200', '400'] },
    { name: 'Atropine', unit: 'mg', commonDoses: ['0.3', '0.6', '1.2'] },
    { name: 'Glycopyrrolate', unit: 'mg', commonDoses: ['0.2', '0.4', '0.6'] },
    { name: 'Flumazenil', unit: 'mg', commonDoses: ['0.1', '0.2', '0.5'] },
    { name: 'Naloxone', unit: 'mg', commonDoses: ['0.1', '0.2', '0.4'] },
  ],
  'Local Anesthetics': [
    { name: 'Lidocaine (Lignocaine)', unit: 'mg', commonDoses: ['40', '80', '100', '200', '400'] },
    { name: 'Bupivacaine', unit: 'mg', commonDoses: ['10', '15', '25', '50', '75'] },
    { name: 'Ropivacaine', unit: 'mg', commonDoses: ['50', '75', '100', '150'] },
    { name: 'Levobupivacaine', unit: 'mg', commonDoses: ['25', '50', '75'] },
  ],
  'Sedatives & Anxiolytics': [
    { name: 'Midazolam', unit: 'mg', commonDoses: ['1', '2', '3', '5'] },
    { name: 'Diazepam', unit: 'mg', commonDoses: ['2.5', '5', '10'] },
    { name: 'Dexmedetomidine', unit: 'mcg', commonDoses: ['25', '50', '100'] },
  ],
  'Antiemetics': [
    { name: 'Ondansetron', unit: 'mg', commonDoses: ['4', '8'] },
    { name: 'Metoclopramide', unit: 'mg', commonDoses: ['10'] },
    { name: 'Dexamethasone', unit: 'mg', commonDoses: ['4', '8'] },
    { name: 'Promethazine', unit: 'mg', commonDoses: ['12.5', '25'] },
  ],
  'Cardiovascular Drugs': [
    { name: 'Ephedrine', unit: 'mg', commonDoses: ['3', '6', '9', '12'] },
    { name: 'Phenylephrine', unit: 'mcg', commonDoses: ['50', '100', '200'] },
    { name: 'Adrenaline (Epinephrine)', unit: 'mcg', commonDoses: ['10', '50', '100', '1000'] },
    { name: 'Noradrenaline (Norepinephrine)', unit: 'mcg', commonDoses: ['4', '8', '16'] },
    { name: 'Dobutamine', unit: 'mcg/kg/min', commonDoses: ['2.5', '5', '10'] },
    { name: 'Dopamine', unit: 'mcg/kg/min', commonDoses: ['2', '5', '10', '15'] },
    { name: 'Esmolol', unit: 'mg', commonDoses: ['10', '20', '50'] },
    { name: 'Labetalol', unit: 'mg', commonDoses: ['5', '10', '20'] },
    { name: 'Hydralazine', unit: 'mg', commonDoses: ['5', '10', '20'] },
    { name: 'Calcium Chloride', unit: 'mg', commonDoses: ['500', '1000'] },
    { name: 'Calcium Gluconate', unit: 'mg', commonDoses: ['500', '1000', '2000'] },
    { name: 'Magnesium Sulphate', unit: 'g', commonDoses: ['1', '2', '4'] },
    { name: 'Amiodarone', unit: 'mg', commonDoses: ['150', '300'] },
    { name: 'Adenosine', unit: 'mg', commonDoses: ['6', '12'] },
  ],
  'Analgesics & Anti-inflammatory': [
    { name: 'Paracetamol (IV)', unit: 'mg', commonDoses: ['500', '1000'] },
    { name: 'Ketorolac', unit: 'mg', commonDoses: ['15', '30'] },
    { name: 'Diclofenac', unit: 'mg', commonDoses: ['50', '75'] },
    { name: 'Ibuprofen', unit: 'mg', commonDoses: ['200', '400', '600'] },
  ],
  'Corticosteroids': [
    { name: 'Dexamethasone', unit: 'mg', commonDoses: ['4', '8', '12'] },
    { name: 'Hydrocortisone', unit: 'mg', commonDoses: ['50', '100', '200'] },
    { name: 'Methylprednisolone', unit: 'mg', commonDoses: ['40', '125', '500'] },
  ],
  'Antibiotics (Prophylactic)': [
    { name: 'Cefazolin', unit: 'g', commonDoses: ['1', '2'] },
    { name: 'Ceftriaxone', unit: 'g', commonDoses: ['1', '2'] },
    { name: 'Metronidazole', unit: 'mg', commonDoses: ['500'] },
    { name: 'Gentamicin', unit: 'mg', commonDoses: ['80', '160', '240'] },
    { name: 'Vancomycin', unit: 'mg', commonDoses: ['500', '1000'] },
    { name: 'Ciprofloxacin', unit: 'mg', commonDoses: ['200', '400'] },
  ],
  'Anticoagulants': [
    { name: 'Heparin', unit: 'units', commonDoses: ['2500', '5000', '10000'] },
    { name: 'Enoxaparin', unit: 'mg', commonDoses: ['20', '40', '60', '80'] },
    { name: 'Protamine', unit: 'mg', commonDoses: ['10', '25', '50'] },
    { name: 'Tranexamic Acid', unit: 'mg', commonDoses: ['500', '1000'] },
  ],
  'IV Fluids': [
    { name: 'Normal Saline 0.9%', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Ringers Lactate', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Dextrose 5%', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Dextrose 10%', unit: 'ml', commonDoses: ['500'] },
    { name: 'Dextrose 50%', unit: 'ml', commonDoses: ['50'] },
    { name: 'Colloid (Gelofusine)', unit: 'ml', commonDoses: ['500', '1000'] },
    { name: 'Albumin 5%', unit: 'ml', commonDoses: ['250', '500'] },
    { name: 'Mannitol 20%', unit: 'ml', commonDoses: ['100', '250', '500'] },
    { name: 'Sodium Bicarbonate 8.4%', unit: 'ml', commonDoses: ['50', '100'] },
  ],
  'Emergency Drugs': [
    { name: 'Adrenaline 1:1000', unit: 'ml', commonDoses: ['0.5', '1'] },
    { name: 'Adrenaline 1:10000', unit: 'ml', commonDoses: ['1', '5', '10'] },
    { name: 'Atropine', unit: 'mg', commonDoses: ['0.5', '1'] },
    { name: 'Dantrolene', unit: 'mg', commonDoses: ['20', '40'] },
    { name: 'Lipid Emulsion 20%', unit: 'ml', commonDoses: ['100', '250', '500'] },
    { name: 'Aminophylline', unit: 'mg', commonDoses: ['250', '500'] },
  ],
  'Miscellaneous': [
    { name: 'Oxytocin', unit: 'units', commonDoses: ['5', '10', '20'] },
    { name: 'Carboprost (Hemabate)', unit: 'mcg', commonDoses: ['250'] },
    { name: 'Misoprostol', unit: 'mcg', commonDoses: ['400', '600', '800'] },
    { name: 'Insulin Regular', unit: 'units', commonDoses: ['5', '10', '20'] },
    { name: 'Furosemide', unit: 'mg', commonDoses: ['20', '40', '80'] },
    { name: 'Phenytoin', unit: 'mg', commonDoses: ['100', '250', '500'] },
    { name: 'Levetiracetam', unit: 'mg', commonDoses: ['500', '1000'] },
  ],
};

// Flatten the directory for search
// Merge curated emergency BNF entries with the full Nigeria EML 2024 catalogue
// so all prescriptions and modifications draw from the approved national list.
const BNF_DIRECTORY: Record<string, DrugEntry[]> = {
  ...BNF_DIRECTORY_BASE,
  ...getNemlMedicationCategories(),
};
const ALL_DRUGS: (DrugEntry & { category: string })[] = Object.entries(BNF_DIRECTORY).flatMap(
  ([cat, drugs]) => drugs.map(d => ({ ...d, category: cat }))
);

const PRESCRIPTION_ROUTES = [
  'IV Push', 'IV Infusion', 'IM', 'SC', 'Intrathecal', 'Epidural',
  'Nebulized', 'Topical', 'Inhalation', 'PO', 'Per Rectum', 'Sublingual',
];

const FREQUENCIES = [
  'STAT', 'Once only', 'BD (twice daily)', 'TDS (three times daily)',
  'QDS (four times daily)', '6 hourly', '8 hourly', '12 hourly',
  'PRN (as needed)', 'Continuous infusion',
];

const MED_STATUS_COLORS: Record<string, string> = {
  PRESCRIBED: 'bg-blue-100 text-blue-700',
  USED: 'bg-green-100 text-green-700',
  HARMONIZED: 'bg-purple-100 text-purple-700',
  RETURNED: 'bg-amber-100 text-amber-700',
};

interface EmergencyBooking {
  id: string;
  patientName: string;
  folderNumber: string;
  age?: number;
  gender?: string;
  ward?: string;
  diagnosis: string;
  procedureName: string;
  surgicalUnit: string;
  indication: string;
  surgeonName: string;
  anesthetistName?: string;
  anaesthesiaType?: string | null;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: string;
  requestedAt: string;
  requiredByTime?: string;
  theatreName?: string;
  /// Set once the booking has produced a surgery record; the team is assigned
  /// against that, not against the booking.
  surgeryId?: string | null;
  bloodRequired: boolean;
  bloodUnits?: number;
  surgeon?: { fullName: string; phoneNumber?: string };
  anesthetist?: { fullName: string; phoneNumber?: string };
}

interface OnDutyStaff {
  userId: string;
  name: string;
  phoneNumber: string | null;
  extension?: string | null;
  availabilityStatus?: string | null;
  currentLocation?: string | null;
  source?: string; // "roster" | "role"
  role?: string;
}

interface OnDutyTeam {
  shift: string;
  rostersFound: number;
  team: {
    anaesthetist?: OnDutyStaff | null;
    anaesthetist2?: OnDutyStaff | null;
    anaestheticTechnician?: OnDutyStaff | null;
    scrubNurse: OnDutyStaff | null;
    circulatingNurse: OnDutyStaff | null;
    supervisors?: OnDutyStaff[];
    recoveryNurse?: OnDutyStaff | null;
    porter: OnDutyStaff | null;
    cleaner: OnDutyStaff | null;
    pharmacist: OnDutyStaff | null;
    theatreManager?: OnDutyStaff | null;
    bloodBank?: OnDutyStaff | null;
    cssd?: OnDutyStaff | null;
    biomedicalEngineer?: OnDutyStaff | null;
  };
}

interface TeamMember {
  id: string;
  userName: string;
  teamRole: string;
  status: string;
  latitude?: number;
  longitude?: number;
  estimatedArrivalMin?: number;
  distanceKm?: number;
  respondedAt: string;
  arrivedAt?: string;
  notes?: string;
  user: { fullName: string; phoneNumber?: string; role: string };
}

interface ReviewData {
  id: string;
  reviewerName: string;
  status: string;
  anaestheticPlan?: string;
  allergies?: string;
  asaClassification?: string;
  createdAt: string;
  prescriptions: PrescriptionData[];
}

interface PrescriptionData {
  id: string;
  medications: string;
  status: string;
  isEmergency: boolean;
  urgencyNote?: string;
  viewedByPharmacist: boolean;
  packedByName?: string;
  packedAt?: string;
}

const priorityColors = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-300',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const statusColors: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  THEATRE_ASSIGNED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const availabilityStatusColors: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  EN_ROUTE: 'bg-blue-100 text-blue-800',
  ARRIVED: 'bg-emerald-200 text-emerald-900 font-bold',
  UNAVAILABLE: 'bg-red-100 text-red-800',
  ON_ANOTHER_CASE: 'bg-orange-100 text-orange-800',
};

const TEAM_ROLES = [
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE',
  'ANAESTHETIC_TECHNICIAN', 'PORTER', 'RECOVERY_ROOM_NURSE',
  'THEATRE_STORE_KEEPER', 'BIOMEDICAL_ENGINEER', 'CLEANER',
  'BLOODBANK_STAFF', 'PHARMACIST',
];

// Roles that can respond to emergency availability
const EMERGENCY_TEAM_USER_ROLES = [
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'ANAESTHETIC_TECHNICIAN',
  'PORTER', 'BIOMEDICAL_ENGINEER', 'CLEANER', 'BLOODBANK_STAFF', 'PHARMACIST',
  'ADMIN', 'THEATRE_MANAGER', 'SYSTEM_ADMINISTRATOR',
];

/**
 * The pre-anaesthetic assessment, in the order it is actually done: look at the
 * patient, read the numbers, decide the technique and draw the kit for it, then
 * prescribe. One long scrolling form buried the anaesthetic plan halfway down,
 * which is the field everything else depends on.
 */
const REVIEW_STEPS = [
  { n: 1, label: 'Assessment' },
  { n: 2, label: 'Vitals & bloods' },
  { n: 3, label: 'Plan & packs' },
  { n: 4, label: 'Prescription' },
];

/**
 * The plan wording an anaesthetist picks → the AnesthesiaType the packs are
 * filed under. "Combined General + Regional" maps to GENERAL: the general
 * anaesthetic is what determines the kit, and the block is an adjunct the
 * anaesthetist adds from the picker.
 */
const PLAN_TO_TECHNIQUE: Record<string, string> = {
  'General Anaesthesia - ETT': 'GENERAL',
  'General Anaesthesia - LMA': 'GENERAL',
  'Regional - Spinal': 'SPINAL',
  'Regional - Epidural': 'EPIDURAL',
  'Regional - Combined Spinal-Epidural': 'COMBINED_SPINAL_EPIDURAL',
  'Regional - Nerve Block': 'REGIONAL',
  'Combined General + Regional': 'GENERAL',
  'Monitored Anaesthesia Care (MAC)': 'SEDATION',
  'Local Anaesthesia + Sedation': 'LOCAL',
};

// Roles allowed to change the overall status of an emergency booking.
const STATUS_UPDATE_ROLES = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIC_TECHNICIAN',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON', 'CONSULTANT_SURGEON',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR',
];

// Selectable statuses for the status-update control on each booking card.
const BOOKING_STATUS_OPTIONS = [
  'SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
];

export default function EmergencyBookingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [bookings, setBookings] = useState<EmergencyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  /**
   * The page opens on a choice, not on a list.
   *
   * It used to render every emergency ever recorded — 105 of them, 73 still
   * "active" because nothing closes a case that was handled and never updated.
   * The result was a page whose first screen showed a laparotomy from July as
   * though it needed a theatre now, each card carrying a full assignment form.
   * A board that cries wolf 73 times is not read.
   */
  const [view, setView] = useState<'menu' | 'list'>('menu');

  /**
   * Which day's emergencies to show. Defaults to today.
   *
   * The day an emergency BELONGS to is the day it was required, falling back
   * to the day it was raised — not the day somebody last touched the record.
   */
  const [selectedDate, setSelectedDate] = useState<string>(() => watToday());
  const [allDates, setAllDates] = useState(false);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<Record<string, TeamMember[]>>({});
  const [onDutyTeams, setOnDutyTeams] = useState<Record<string, OnDutyTeam>>({});
  const [reviewData, setReviewData] = useState<Record<string, ReviewData[]>>({});
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // --- Emergency theatre assignment ---------------------------------------
  // Theatre-side staff commit a room, which also ACKNOWLEDGES the case and puts
  // it on the radio. Before this, a surgeon could book a critical case with no
  // way of knowing whether theatre had seen it.
  const [theatreOptions, setTheatreOptions] = useState<{ id: string; name: string }[]>([]);
  const [nurseOptions, setNurseOptions] = useState<{ id: string; fullName: string }[]>([]);
  const [assignScrub, setAssignScrub] = useState<Record<string, string>>({});
  const [assignCirc, setAssignCirc] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});
  // Keyed by booking: a single shared message would appear under every card
  // on the board, including cases it had nothing to do with.
  const [assignNote, setAssignNote] = useState<Record<string, string>>({});

  const canAssignTheatre = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER',
    'THEATRE_CHAIRMAN', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE_MANAGER']
    .includes((session?.user as { role?: string } | undefined)?.role ?? '');

  useEffect(() => {
    if (!canAssignTheatre) return;
    fetch('/api/theatres')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : (d?.theatres ?? []);
        setTheatreOptions(list.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
      })
      .catch(() => {});

    Promise.all([
      fetch('/api/users?role=SCRUB_NURSE&status=APPROVED').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/users?role=CIRCULATING_NURSE&status=APPROVED').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([a, b]) => {
        const flat = [...(Array.isArray(a) ? a : a?.users ?? []), ...(Array.isArray(b) ? b : b?.users ?? [])];
        const byId = new Map<string, { id: string; fullName: string }>();
        for (const u of flat) if (u?.id) byId.set(u.id, { id: u.id, fullName: u.fullName });
        setNurseOptions(Array.from(byId.values()));
      })
      .catch(() => {});
  }, [canAssignTheatre]);

  const assignTheatre = async (bookingId: string) => {
    const theatreId = assignChoice[bookingId];
    if (!theatreId) return;
    setAssigningId(bookingId);
    setAssignNote((p) => ({ ...p, [bookingId]: '' }));
    try {
      const res = await fetch('/api/emergency-booking/assign-theatre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId, theatreId,
          // Only when chosen, so assigning a room does not clear a team somebody
          // named a minute earlier.
          ...(assignScrub[bookingId] ? { scrubNurseId: assignScrub[bookingId] } : {}),
          ...(assignCirc[bookingId] ? { circulatingNurseId: assignCirc[bookingId] } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignNote((p) => ({ ...p, [bookingId]: body.error || 'Could not assign the theatre.' }));
        return;
      }
      setAssignNote((p) => ({ ...p, [bookingId]: body.message || 'Theatre assigned.' }));
      await fetchBookings();
    } catch {
      setAssignNote((p) => ({ ...p, [bookingId]: 'Could not reach the server.' }));
    } finally {
      setAssigningId(null);
    }
  };
  const [reviewBooking, setReviewBooking] = useState<EmergencyBooking | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Structured prescription state
  const [prescribedMeds, setPrescribedMeds] = useState<PrescribedMedication[]>([]);
  const [drugSearch, setDrugSearch] = useState('');
  const [drugResults, setDrugResults] = useState<(DrugEntry & { category: string })[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<(DrugEntry & { category: string }) | null>(null);
  const [addDose, setAddDose] = useState('');
  const [addRoute, setAddRoute] = useState('IV Push');
  const [addFrequency, setAddFrequency] = useState('STAT');
  const [addNotes, setAddNotes] = useState('');
  const [showDrugDropdown, setShowDrugDropdown] = useState(false);
  const drugSearchRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drugSearchRef.current && !drugSearchRef.current.contains(e.target as Node)) {
        setShowDrugDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // BNF drug search
  useEffect(() => {
    if (drugSearch.length < 2) { setDrugResults([]); return; }
    const q = drugSearch.toLowerCase();
    const matches = ALL_DRUGS.filter(d =>
      d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
    ).slice(0, 15);
    setDrugResults(matches);
    setShowDrugDropdown(matches.length > 0);
  }, [drugSearch]);

  const addMedication = () => {
    if (!selectedDrug || !addDose) return;
    const med: PrescribedMedication = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      drugName: selectedDrug.name,
      dose: addDose,
      unit: selectedDrug.unit,
      route: addRoute,
      frequency: addFrequency,
      category: selectedDrug.category,
      status: 'PRESCRIBED',
      notes: addNotes,
    };
    setPrescribedMeds(prev => [...prev, med]);
    setSelectedDrug(null);
    setDrugSearch('');
    setAddDose('');
    setAddRoute('IV Push');
    setAddFrequency('STAT');
    setAddNotes('');
  };

  const removeMedication = (id: string) => {
    setPrescribedMeds(prev => prev.filter(m => m.id !== id));
  };

  const updateMedStatus = (id: string, status: PrescribedMedication['status']) => {
    setPrescribedMeds(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  };

  // Review form state.
  // Weight, height, estimated blood loss and coagulation status are gone from
  // this form: nobody weighs or measures a patient being resuscitated, and the
  // two haematology fields duplicated the lab workup.
  const [reviewForm, setReviewForm] = useState({
    airwayAssessment: '', asaClassification: '', allergies: '',
    currentMedications: '', pastMedicalHistory: '', lastMealTime: '',
    bloodPressure: '', heartRate: '', oxygenSaturation: '', temperature: '',
    hemoglobinLevel: '',
    crossMatchStatus: '', ivAccess: '', patientNPOStatus: '',
    anaestheticPlan: '', specialConsiderations: '', riskAssessment: '',
    consentObtained: false, consentNotes: '',
    medications: '', fluids: '', emergencyDrugs: '', specialInstructions: '',
  });

  /** Which step of the assessment is open (1..REVIEW_STEPS.length). */
  const [reviewStep, setReviewStep] = useState(1);
  /**
   * Anaesthesia packs for the chosen technique — the same picker, the same
   * packs and the same routing the elective pre-anaesthetic review uses, so a
   * General anaesthetic pulls identical kit whether the case is elective or an
   * emergency.
   */
  const [anaesPacks, setAnaesPacks] = useState<AnaesPackPayload>({ medications: [], consumableRequests: [] });

  /**
   * How much of the assessment is actually filled in.
   *
   * Counts the clinically meaningful fields rather than every input, so the bar
   * cannot read 90% because somebody typed three notes and left the airway and
   * the plan blank.
   */
  const REVIEW_TRACKED_FIELDS: (keyof typeof reviewForm)[] = [
    'airwayAssessment', 'asaClassification', 'allergies', 'patientNPOStatus',
    'bloodPressure', 'heartRate', 'oxygenSaturation', 'temperature',
    'hemoglobinLevel', 'crossMatchStatus', 'ivAccess',
    'anaestheticPlan', 'riskAssessment',
  ];
  const reviewProgress = (() => {
    const done = REVIEW_TRACKED_FIELDS.filter((k) => String(reviewForm[k] ?? '').trim() !== '').length;
    // The packs and the prescription each count as one more "field", so the bar
    // cannot reach 100% while the technique has no kit drawn against it.
    const extras = (anaesPacks.medications.length + anaesPacks.consumableRequests.length > 0 ? 1 : 0)
      + (prescribedMeds.length > 0 ? 1 : 0);
    const total = REVIEW_TRACKED_FIELDS.length + 2;
    return Math.round(((done + extras) / total) * 100);
  })();

  /** The pack technique implied by the chosen plan, or '' while none is chosen. */
  const reviewTechnique = PLAN_TO_TECHNIQUE[reviewForm.anaestheticPlan] ?? '';

  const fetchBookings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      // no-store as well as the ALWAYS_LIVE entry in the fetch interceptor.
      // Two guards because this list being one minute stale caused a clinician
      // to book the same emergency twice: they booked, opened the board, did
      // not see the case, and booked it again.
      const res = await fetch(`/api/emergency-booking?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  // Fetch the on-duty theatre team (scrub/circulating nurse, porter, cleaner,
  // pharmacist) from the duty roster for each booking's date/shift so the names
  // can be shown on the booking card.
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      // One request PER BOOKING fired all at once. With 78 emergencies on the
      // board that was 78 simultaneous roster lookups, which exhausted the
      // connection pool and returned 500s — for a roster that is the same for
      // every case sharing a date and shift.
      //
      // So: ask once per distinct date+shift, and never more than a few at a
      // time. Seventy-eight requests collapse to a handful.
      const byWhen = new Map<string, string[]>();
      for (const b of bookings) {
        // Only the ACTIVE cards show an on-duty team; the past section is a
        // plain table. Looking up the roster for a completed case from June
        // was work whose result was never rendered.
        if (!['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS'].includes(b.status)) continue;
        const when = b.requiredByTime || b.requestedAt;
        if (!when) continue;
        const list = byWhen.get(when);
        if (list) list.push(b.id);
        else byWhen.set(when, [b.id]);
      }

      const next: Record<string, OnDutyTeam> = {};
      const entries = Array.from(byWhen.entries());
      const CONCURRENCY = 4;

      for (let i = 0; i < entries.length; i += CONCURRENCY) {
        if (controller.signal.aborted) return;
        const slice = entries.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          slice.map(async ([when, ids]) => {
            try {
              const res = await fetch(
                `/api/roster/on-duty?date=${encodeURIComponent(when)}`,
                { signal: controller.signal }
              );
              if (!res.ok) return null;
              const data: OnDutyTeam = await res.json();
              return [ids, data] as const;
            } catch {
              return null;
            }
          })
        );
        for (const r of results) {
          if (!r) continue;
          for (const id of r[0]) next[id] = r[1];
        }
      }

      setOnDutyTeams(next);
    };
    if (bookings.length) run();
    return () => controller.abort();
  }, [bookings]);

  // Fetch team availability when a booking is expanded
  const fetchTeamAvailability = useCallback(async (bookingId: string) => {
    try {
      const res = await fetch(`/api/emergency-team-availability?bookingId=${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        setTeamData(prev => ({ ...prev, [bookingId]: data }));
      }
    } catch (e) {
      console.error('Error fetching team:', e);
    }
  }, []);

  // Fetch pre-anaesthetic reviews when expanded
  const fetchReviews = useCallback(async (bookingId: string) => {
    try {
      const res = await fetch(`/api/emergency-pre-anaesthetic?bookingId=${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        setReviewData(prev => ({ ...prev, [bookingId]: data }));
      }
    } catch (e) {
      console.error('Error fetching reviews:', e);
    }
  }, []);

  const toggleExpand = (bookingId: string) => {
    if (expandedBooking === bookingId) {
      setExpandedBooking(null);
    } else {
      setExpandedBooking(bookingId);
      fetchTeamAvailability(bookingId);
      fetchReviews(bookingId);
    }
  };

  // Respond with availability + geo-location
  // Update the overall status of an emergency booking (SUBMITTED → APPROVED, etc.)
  const handleStatusChange = async (bookingId: string, status: string) => {
    setUpdatingStatus(bookingId);
    try {
      const res = await fetch('/api/emergency-booking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, status }),
      });
      if (res.ok) {
        fetchBookings();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update status');
      }
    } catch (e) {
      console.error('Error updating status:', e);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleRespond = async (bookingId: string, status: string) => {
    setRespondingTo(bookingId);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      let estimatedArrivalMin: number | undefined;

      // Request geo-location
      if (navigator.geolocation && status !== 'UNAVAILABLE') {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
            });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;

          // Rough ETA: assume 40km/h average speed in Enugu
          const dist = haversineDistanceKm(latitude, longitude, FACILITY_COORDS.latitude, FACILITY_COORDS.longitude);
          estimatedArrivalMin = Math.max(5, Math.round((dist / 40) * 60));
        } catch {
          // Geo-location denied — proceed without it
        }
      }

      const res = await fetch('/api/emergency-team-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyBookingId: bookingId,
          status,
          latitude,
          longitude,
          estimatedArrivalMin,
        }),
      });

      if (res.ok) {
        fetchTeamAvailability(bookingId);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to respond');
      }
    } catch (e) {
      console.error('Error responding:', e);
    } finally {
      setRespondingTo(null);
    }
  };

  // Submit pre-anaesthetic review
  const handleSubmitReview = async () => {
    if (!reviewBooking) return;
    setSubmittingReview(true);
    try {
      const payload: any = {
        emergencyBookingId: reviewBooking.id,
        patientName: reviewBooking.patientName,
        folderNumber: reviewBooking.folderNumber,
      };

      // Map form fields
      Object.entries(reviewForm).forEach(([key, val]) => {
        if (val === '' || val === false) return;
        if (['heartRate', 'oxygenSaturation', 'temperature', 'hemoglobinLevel'].includes(key)) {
          payload[key] = parseFloat(val as string);
        } else if (key !== 'medications') {
          payload[key] = val;
        }
      });

      /**
       * The prescription is what was typed here PLUS the pack's drugs.
       *
       * A pack's PHARMACY items are drugs like any other, so they travel on the
       * emergency prescription rather than by a second route — one list for the
       * pharmacist to dispense, which is also how the elective review does it.
       */
      const packMeds = anaesPacks.medications.map(m => ({
        name: m.name,
        dose: [m.dose, m.unit].filter(Boolean).join(''),
        route: m.route,
        frequency: m.timing || 'STAT',
        category: m.category,
        status: 'PENDING',
        notes: m.notes || 'Anaesthesia pack',
      }));
      const typedMeds = prescribedMeds.map(m => ({
        name: m.drugName,
        dose: `${m.dose}${m.unit}`,
        route: m.route,
        frequency: m.frequency,
        category: m.category,
        status: m.status,
        notes: m.notes,
      }));
      const allMeds = [...typedMeds, ...packMeds];
      if (allMeds.length > 0) payload.medications = JSON.stringify(allMeds);

      // Pack consumables → Consumable Pack Provider, same routing as elective.
      if (anaesPacks.consumableRequests.length > 0) {
        payload.consumableRequests = anaesPacks.consumableRequests;
      }
      // Needed to hang the consumable requests on a case.
      if (reviewBooking.surgeryId) payload.surgeryId = reviewBooking.surgeryId;

      const res = await fetch('/api/emergency-pre-anaesthetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowReviewModal(false);
        setReviewBooking(null);
        setReviewForm({
          airwayAssessment: '', asaClassification: '', allergies: '',
          currentMedications: '', pastMedicalHistory: '', lastMealTime: '',
          bloodPressure: '', heartRate: '', oxygenSaturation: '', temperature: '',
          hemoglobinLevel: '',
          crossMatchStatus: '', ivAccess: '', patientNPOStatus: '',
          anaestheticPlan: '', specialConsiderations: '', riskAssessment: '',
          consentObtained: false, consentNotes: '',
          medications: '', fluids: '', emergencyDrugs: '', specialInstructions: '',
        });
        setPrescribedMeds([]);
        setAnaesPacks({ medications: [], consumableRequests: [] });
        setReviewStep(1);
        if (expandedBooking) fetchReviews(expandedBooking);
        alert('Pre-anaesthetic review submitted. Emergency prescription sent to pharmacy.');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit review');
      }
    } catch (e) {
      console.error('Error submitting review:', e);
      alert('An error occurred');
    } finally {
      setSubmittingReview(false);
    }
  };

  const canCreateBooking = session?.user?.role && [
    'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'HOUSE_OFFICER', 'THEATRE_MANAGER',
    'ADMIN', 'CMAC', 'DC_MAC', 'CHIEF_MEDICAL_DIRECTOR'
  ].includes(session.user.role);

  const canRespondToEmergency = session?.user?.role && EMERGENCY_TEAM_USER_ROLES.includes(session.user.role);

  const isAnaesthetist = session?.user?.role && ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role);

  const canUpdateStatus = session?.user?.role && STATUS_UPDATE_ROLES.includes(session.user.role);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading emergency bookings...</p>
        </div>
      </div>
    );
  }

  /**
   * The day a case belongs to: when it was required, else when it was raised.
   *
   * In WAT, not UTC. A case required at 00:30 on the 23rd is 23:30 UTC on the
   * 22nd, and a UTC day-stamp files it under the 22nd — so the surgeon who
   * picks the day it is actually happening does not see it. Night emergencies
   * are the ones that matter most here.
   */
  const dayOf = (b: EmergencyBooking) => watDay(b.requiredByTime || b.requestedAt);

  const onSelectedDay = allDates
    ? bookings
    : bookings.filter((b) => dayOf(b) === selectedDate);

  const activeBookings = onSelectedDay.filter(b => ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS'].includes(b.status));
  const pastBookings = onSelectedDay.filter(b => ['COMPLETED', 'CANCELLED'].includes(b.status));
  // Counted across ALL days, so narrowing the view never hides the fact that
  // older cases are still sitting open somewhere.
  const openOnOtherDays = bookings.filter(
    (b) => ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS'].includes(b.status)
      && dayOf(b) !== selectedDate,
  ).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Siren className="h-7 w-7 text-red-600" />
            Emergency Surgery Booking
          </h1>
          <p className="text-gray-600 mt-1">Book and track emergency surgical cases</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchBookings()}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              <Plus className="h-4 w-4" /> New Emergency Booking
            </Link>
          )}
        </div>
      </div>

      {/* ── The two ways in ─────────────────────────────────────────────── */}
      {view === 'menu' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="group rounded-2xl border-2 border-red-200 bg-red-50 p-6 transition hover:border-red-400 hover:bg-red-100"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white">
                  <Plus className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-red-900">Book emergency surgery</h2>
                  <p className="text-sm text-red-800">
                    Raise a new emergency case and alert the theatre
                  </p>
                </div>
              </div>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setView('list')}
            className="group rounded-2xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-slate-400 hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-white">
                <Calendar className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">View booked emergencies</h2>
                <p className="text-sm text-slate-600">
                  {bookings.length} recorded &middot; choose a date to see that day&rsquo;s cases
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {view === 'list' && (
      <>
      {/* ── Which day ───────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <button
          type="button"
          onClick={() => setView('menu')}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          &larr; Back
        </button>
        <label htmlFor="emergency-date" className="text-sm font-semibold text-gray-800">
          Emergencies for
        </label>
        <input
          id="emergency-date"
          type="date"
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setAllDates(false); }}
          disabled={allDates}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => { setSelectedDate(watToday()); setAllDates(false); }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Today
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
            className="h-4 w-4"
          />
          Every date
        </label>
        {/* Narrowing the view must never hide an open case. */}
        {!allDates && openOnOtherDays > 0 && (
          <button
            type="button"
            onClick={() => setAllDates(true)}
            className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200"
          >
            {openOnOtherDays} still open on other dates &mdash; show all
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${
              filter === s ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Every emergency, reconciled in one line.
          The page splits into an active list and a past table, and the past
          table sits below fifty-odd expanded cards — so the totals never
          appeared together and the board looked as though it was holding fewer
          emergencies than it was. */}
      {bookings.length > 0 && (
        <div className="mb-6 rounded-lg border bg-white px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-semibold text-gray-900">
            {bookings.length} emergenc{bookings.length === 1 ? 'y' : 'ies'} recorded
          </span>
          <span className="text-red-700">
            <strong>{activeBookings.length}</strong> active
          </span>
          <span className="text-gray-600">
            <strong>{pastBookings.length}</strong> completed or cancelled
          </span>
          {pastBookings.length > 0 && (
            <button
              onClick={() => document.getElementById('past-emergency-cases')?.scrollIntoView({ behavior: 'smooth' })}
              className="ml-auto text-blue-700 hover:underline"
            >
              Jump to past cases ↓
            </button>
          )}
        </div>
      )}

      {/* Active Emergency Bookings */}
      {activeBookings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Active Emergency Cases ({activeBookings.length})
          </h2>
          <div className="grid gap-4">
            {activeBookings.map((booking) => {
              const isExpanded = expandedBooking === booking.id;
              const team = teamData[booking.id] || [];
              const reviews = reviewData[booking.id] || [];
              const arrivedCount = team.filter(t => t.status === 'ARRIVED').length;
              const respondedCount = team.length;

              return (
                <div
                  key={booking.id}
                  className={`bg-white rounded-lg shadow-md border-l-4 overflow-hidden ${
                    booking.priority === 'CRITICAL' ? 'border-l-red-600' :
                    booking.priority === 'HIGH' ? 'border-l-orange-500' : 'border-l-yellow-400'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs font-bold border ${priorityColors[booking.priority]}`}>
                            {booking.priority}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[booking.status] || ''}`}>
                            {booking.status.replace(/_/g, ' ')}
                          </span>
                          {canUpdateStatus && (
                            <label className="flex items-center gap-1 text-xs">
                              <span className="sr-only">Update status</span>
                              <select
                                aria-label={`Update status for ${booking.procedureName}`}
                                value={booking.status}
                                disabled={updatingStatus === booking.id}
                                onChange={(e) => handleStatusChange(booking.id, e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-xs font-medium bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                              >
                                {BOOKING_STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s.replace(/_/g, ' ')}
                                  </option>
                                ))}
                              </select>
                              {updatingStatus === booking.id && (
                                <RefreshCw className="h-3 w-3 animate-spin text-gray-500" />
                              )}
                            </label>
                          )}
                          {booking.bloodRequired && (
                            <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">
                              BLOOD REQUIRED ({booking.bloodUnits} units)
                            </span>
                          )}
                          {booking.anaesthesiaType && (
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold border ${
                                booking.anaesthesiaType === 'LOCAL' || booking.anaesthesiaType === 'NONE'
                                  ? 'bg-green-100 text-green-800 border-green-300'
                                  : 'bg-indigo-100 text-indigo-800 border-indigo-300'
                              }`}
                              title={
                                booking.anaesthesiaType === 'LOCAL' || booking.anaesthesiaType === 'NONE'
                                  ? 'No anaesthetist review required for this anaesthesia type'
                                  : 'Pre-anaesthetic review required'
                              }
                            >
                              ANAESTHESIA: {booking.anaesthesiaType}
                              {(booking.anaesthesiaType === 'LOCAL' || booking.anaesthesiaType === 'NONE') &&
                                ' — NO REVIEW NEEDED'}
                            </span>
                          )}
                          {respondedCount > 0 && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                              {arrivedCount}/{respondedCount} team arrived
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{booking.procedureName}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span><strong>{booking.patientName}</strong> ({booking.folderNumber})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            <span>{booking.surgicalUnit}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{new Date(booking.requestedAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="mt-2 text-sm"><strong>Indication:</strong> {booking.indication}</p>
                        <p className="text-sm"><strong>Diagnosis:</strong> {booking.diagnosis}</p>
                      </div>
                      <div className="flex flex-col gap-1 text-sm min-w-[200px]">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4 text-blue-600" />
                          <span>Surgeon: <strong>{booking.surgeonName}</strong></span>
                        </div>
                        {booking.anesthetistName && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4 text-green-600" />
                            <span>Anesthetist: <strong>{booking.anesthetistName}</strong></span>
                          </div>
                        )}
                        {booking.theatreName && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4 text-purple-600" />
                            <span>Theatre: <strong>{booking.theatreName}</strong></span>
                          </div>
                        )}
                        {booking.requiredByTime && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-red-600" />
                            <span>Required by: <strong>{new Date(booking.requiredByTime).toLocaleString()}</strong></span>
                          </div>
                        )}
                        {(() => {
                          const od = onDutyTeams[booking.id];
                          const t = od?.team;
                          if (!t) return null;
                          const rows: Array<[string, OnDutyStaff | null | undefined]> = [
                            ['Consultant/Anaesthetist', t.anaesthetist],
                            ['Anaesthetist (2nd)', t.anaesthetist2],
                            ['Anaesthetic Technician', t.anaestheticTechnician],
                            ['Scrub Nurse', t.scrubNurse],
                            ['Circulating Nurse', t.circulatingNurse],
                            ...((t.supervisors ?? []).map((s, i) => [`Supervisor ${i + 1}`, s] as [string, OnDutyStaff])),
                            ['Recovery Nurse', t.recoveryNurse],
                            ['Porter', t.porter],
                            ['Cleaner', t.cleaner],
                            ['Pharmacist', t.pharmacist],
                            ['Theatre Manager', t.theatreManager],
                            ['Blood Bank', t.bloodBank],
                            ['CSSD', t.cssd],
                            ['Biomedical Engineer', t.biomedicalEngineer],
                          ];
                          const present = rows.filter(([, v]) => v && v.name);
                          return (
                            <div className="mt-1 pt-1 border-t border-gray-100">
                              <p className="text-xs font-semibold text-gray-500 mb-0.5">
                                Emergency Response Team{od?.shift ? ` (${od.shift} shift)` : ''}
                                {booking.theatreName ? ` · ${booking.theatreName}` : ''}
                              </p>
                              {present.length ? (
                                <div className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                                  {present.map(([label, v]) => (
                                    <div key={label} className="flex items-center gap-1 min-w-0">
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${availabilityMeta(v!.availabilityStatus).dot}`} title={availabilityMeta(v!.availabilityStatus).label} />
                                      <span className="truncate">
                                        {label}: <strong>{v!.name}</strong>
                                        {v!.source === 'role' && <span className="text-[10px] text-gray-400"> (on-call)</span>}
                                        {v!.phoneNumber && (
                                          <a href={`tel:${v!.phoneNumber}`} className="ml-1 text-blue-600 hover:underline inline-flex items-center gap-0.5">
                                            <Phone className="h-3 w-3" />{v!.phoneNumber}
                                          </a>
                                        )}
                                        {v!.extension && <span className="ml-1 text-gray-500">ext {v!.extension}</span>}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">No roster team found for this date/shift.</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* ACTION BUTTONS ROW */}
                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-200">
                      {/* Team Availability Response */}
                      {canRespondToEmergency && (
                        <>
                          <button
                            onClick={() => handleRespond(booking.id, 'AVAILABLE')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {respondingTo === booking.id ? 'Sending...' : "I'm Available"}
                          </button>
                          <button
                            onClick={() => handleRespond(booking.id, 'EN_ROUTE')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Navigation className="h-4 w-4" />
                            En Route
                          </button>
                          <button
                            onClick={() => handleRespond(booking.id, 'ARRIVED')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <MapPin className="h-4 w-4" />
                            Arrived
                          </button>
                          <button
                            onClick={() => handleRespond(booking.id, 'UNAVAILABLE')}
                            disabled={respondingTo === booking.id}
                            className="flex items-center gap-1 px-3 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                            Unavailable
                          </button>
                        </>
                      )}

                      {/* Assign theatre — theatre-side staff only.
                          One press assigns the room, acknowledges the case and
                          announces it on the radio, because in a real emergency
                          nobody does three separate administrative steps. */}
                      {canAssignTheatre && booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED' && (
                        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border-2 border-red-200 bg-red-50 p-2">
                          <select
                            value={assignChoice[booking.id] ?? ''}
                            onChange={(e) => setAssignChoice((p) => ({ ...p, [booking.id]: e.target.value }))}
                            aria-label="Choose a theatre for this emergency"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            <option value="">
                              {booking.theatreName ? `Current: ${booking.theatreName}` : '-- Choose theatre --'}
                            </option>
                            {theatreOptions.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          <select
                            value={assignScrub[booking.id] ?? ''}
                            onChange={(e) => setAssignScrub((p) => ({ ...p, [booking.id]: e.target.value }))}
                            aria-label="Scrub nurse for this emergency"
                            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                          >
                            <option value="">-- scrub nurse --</option>
                            {nurseOptions.map((n) => (
                              <option key={`s-${n.id}`} value={n.id}>{n.fullName}</option>
                            ))}
                          </select>
                          <select
                            value={assignCirc[booking.id] ?? ''}
                            onChange={(e) => setAssignCirc((p) => ({ ...p, [booking.id]: e.target.value }))}
                            aria-label="Circulating nurse for this emergency"
                            className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                          >
                            <option value="">-- circulating nurse --</option>
                            {nurseOptions.map((n) => (
                              <option key={`c-${n.id}`} value={n.id}>{n.fullName}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => assignTheatre(booking.id)}
                            disabled={!assignChoice[booking.id] || assigningId === booking.id}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {assigningId === booking.id
                              ? 'Assigning…'
                              : booking.status === 'THEATRE_ASSIGNED'
                                ? 'Change theatre'
                                : 'Assign theatre, team & acknowledge'}
                          </button>
                          {booking.status === 'THEATRE_ASSIGNED' && (
                            <span className="text-xs font-semibold text-green-800">
                              Acknowledged{booking.theatreName ? ` — ${booking.theatreName}` : ''}
                            </span>
                          )}
                          <span className="text-xs text-red-800">
                            Assigning also acknowledges the case, names the team on the theatre
                            readiness board, and announces it on the radio.
                          </span>
                          {/* Anaesthetic team and technicians, assigned by their
                              own service. Rendered inside the expanded panel so
                              it does not add height to every card on the board —
                              an emergency list must stay scannable. */}
                          {isExpanded && booking.surgeryId && (
                            <div className="w-full">
                              <TheatreTeamAssigner
                                surgeryIds={[booking.surgeryId]}
                                readFromSurgeryId={booking.surgeryId}
                                compact
                              />
                            </div>
                          )}
                          {!isExpanded && booking.surgeryId && (
                            <p className="w-full text-xs text-gray-600">
                              Open <strong>Team Status</strong> to assign the anaesthetic team,
                              technicians and nurses.
                            </p>
                          )}
                          {assignNote[booking.id] && (
                            <p className="w-full text-sm font-medium text-gray-900">
                              {assignNote[booking.id]}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Pre-Anaesthetic Review (Anaesthetists only) — hidden for LOCAL/NONE */}
                      {(isAnaesthetist || session?.user?.role === 'ADMIN') &&
                        booking.anaesthesiaType !== 'LOCAL' &&
                        booking.anaesthesiaType !== 'NONE' && (
                        <button
                          onClick={() => { setReviewBooking(booking); setReviewStep(1); setShowReviewModal(true); }}
                          className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 ml-auto"
                        >
                          <Stethoscope className="h-4 w-4" />
                          Pre-Anaesthetic Review
                        </button>
                      )}
                      {(booking.anaesthesiaType === 'LOCAL' || booking.anaesthesiaType === 'NONE') && (
                        <span className="ml-auto flex items-center gap-1 px-3 py-2 bg-green-50 text-green-800 border border-green-300 rounded-lg text-xs font-semibold">
                          <CheckCircle className="h-4 w-4" />
                          {booking.anaesthesiaType} — anaesthetist review not required
                        </span>
                      )}

                      {/* Expand/Collapse Team Panel */}
                      <button
                        onClick={() => toggleExpand(booking.id)}
                        className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                      >
                        <Activity className="h-4 w-4" />
                        Team Status
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED: Team Availability + Reviews */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-200 p-5">
                      {/* Team Availability Grid */}
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="h-5 w-5 text-blue-600" />
                        Emergency Team Availability
                        <button
                          onClick={() => fetchTeamAvailability(booking.id)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Refresh team availability"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </h4>

                      {team.length === 0 ? (
                        <p className="text-sm text-gray-500 mb-4">No team members have responded yet. Awaiting availability responses...</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                          {team.map((member) => (
                            <div
                              key={member.id}
                              className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{member.userName}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${availabilityStatusColors[member.status] || 'bg-gray-100'}`}>
                                  {member.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mb-1">{member.teamRole.replace(/_/g, ' ')}</p>
                              <div className="flex items-center gap-3 text-xs text-gray-600">
                                {member.distanceKm !== undefined && member.distanceKm !== null && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {member.distanceKm} km
                                  </span>
                                )}
                                {member.estimatedArrivalMin !== undefined && member.estimatedArrivalMin !== null && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> ~{member.estimatedArrivalMin} min
                                  </span>
                                )}
                                {member.arrivedAt && (
                                  <span className="flex items-center gap-1 text-green-700 font-medium">
                                    <CheckCircle className="h-3 w-3" /> Arrived
                                  </span>
                                )}
                              </div>
                              {member.notes && (
                                <p className="text-xs text-gray-500 mt-1 italic">{member.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Role Summary */}
                      <div className="mb-4">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Role Coverage:</h5>
                        <div className="flex flex-wrap gap-2">
                          {TEAM_ROLES.map(role => {
                            const members = team.filter(t => t.teamRole === role);
                            const hasArrived = members.some(m => m.status === 'ARRIVED');
                            const hasResponded = members.length > 0;
                            return (
                              <span
                                key={role}
                                className={`px-2 py-1 rounded text-xs border ${
                                  hasArrived ? 'bg-green-100 text-green-800 border-green-300' :
                                  hasResponded ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  'bg-gray-100 text-gray-500 border-gray-200'
                                }`}
                              >
                                {role.replace(/_/g, ' ')}
                                {hasArrived && ' \u2713'}
                                {hasResponded && !hasArrived && ' \u2022'}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pre-Anaesthetic Reviews */}
                      {reviews.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Stethoscope className="h-5 w-5 text-purple-600" />
                            Pre-Anaesthetic Reviews
                          </h4>
                          {reviews.map((review) => (
                            <div key={review.id} className="bg-white rounded-lg p-4 border border-purple-200 mb-3">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-medium text-sm">Reviewed by: {review.reviewerName}</p>
                                  <p className="text-xs text-gray-500">{new Date(review.createdAt).toLocaleString()}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  review.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                  review.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {review.status}
                                </span>
                              </div>
                              {review.anaestheticPlan && (
                                <p className="text-sm"><strong>Plan:</strong> {review.anaestheticPlan}</p>
                              )}
                              {review.asaClassification && (
                                <p className="text-sm"><strong>ASA:</strong> {review.asaClassification}</p>
                              )}
                              {review.allergies && (
                                <p className="text-sm text-red-700"><strong>Allergies:</strong> {review.allergies}</p>
                              )}

                              {/* Prescriptions */}
                              {review.prescriptions.length > 0 && (
                                <div className="mt-3 border-t pt-2">
                                  <h5 className="text-sm font-medium flex items-center gap-1 mb-2">
                                    <Pill className="h-4 w-4 text-orange-600" />
                                    Emergency Prescription
                                    <span className="text-xs text-red-600 font-bold ml-2 bg-red-50 px-2 py-0.5 rounded">
                                      EMERGENCY - PHARMACY
                                    </span>
                                  </h5>
                                  {review.prescriptions.map((rx) => {
                                    let meds: any[] = [];
                                    try { meds = JSON.parse(rx.medications); } catch {}
                                    return (
                                      <div key={rx.id} className="bg-orange-50 border border-orange-200 rounded p-3">
                                        <div className="flex justify-between items-center mb-2">
                                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            rx.status === 'PACKED' || rx.status === 'DISPENSED'
                                              ? 'bg-green-100 text-green-800'
                                              : rx.status === 'OUT_OF_STOCK_FLAGGED'
                                              ? 'bg-red-100 text-red-800'
                                              : 'bg-orange-100 text-orange-800'
                                          }`}>
                                            {rx.status.replace(/_/g, ' ')}
                                          </span>
                                          {rx.viewedByPharmacist && (
                                            <span className="text-xs text-blue-600">Viewed by Pharmacist</span>
                                          )}
                                          {rx.packedByName && (
                                            <span className="text-xs text-green-700">Packed by: {rx.packedByName}</span>
                                          )}
                                        </div>
                                        {meds.length > 0 ? (
                                          <ul className="text-sm space-y-1">
                                            {meds.map((m: any, i: number) => (
                                              <li key={i} className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
                                                <strong>{m.name || m.drugName}</strong>
                                                {m.dose && <span>- {m.dose}</span>}
                                                {m.route && <span className="text-gray-500">({m.route})</span>}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="text-sm text-gray-600">{rx.medications}</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Bookings */}
      {pastBookings.length > 0 && (
        <div id="past-emergency-cases">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Past Emergency Cases ({pastBookings.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pastBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{booking.patientName}</div>
                      <div className="text-gray-500 text-xs">{booking.folderNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{booking.procedureName}</td>
                    <td className="px-4 py-3 text-sm">{booking.surgeonName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${priorityColors[booking.priority]}`}>
                        {booking.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[booking.status] || ''}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(booking.requestedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bookings.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Siren className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No emergency bookings found</p>
          {canCreateBooking && (
            <Link
              href="/dashboard/emergency-booking/new"
              className="inline-flex items-center gap-2 mt-4 text-red-600 hover:text-red-700 font-medium"
            >
              <Plus className="h-4 w-4" /> Create Emergency Booking
            </Link>
          )}
        </div>
      )}
      </>
      )}

      {/* Pre-Anaesthetic Review Modal */}
      {showReviewModal && reviewBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-purple-50 rounded-t-xl">
              <h3 className="text-xl font-bold text-purple-900 flex items-center gap-2">
                <Stethoscope className="h-6 w-6" />
                Emergency Pre-Anaesthetic Assessment
              </h3>
              <p className="text-purple-700 mt-1">
                Patient: <strong>{reviewBooking.patientName}</strong> ({reviewBooking.folderNumber}) &mdash; {reviewBooking.procedureName}
              </p>
              <p className="text-xs text-red-600 font-bold mt-1">
                Prescriptions from this review will be IMMEDIATELY visible to the Pharmacy as EMERGENCY
              </p>

              {/* Progress. Shows how much of the assessment is filled in, not
                  merely which step is open — an anaesthetist stepping away
                  mid-assessment needs to see what is still missing. */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-purple-800 mb-1">
                  <span>Step {reviewStep} of {REVIEW_STEPS.length} — {REVIEW_STEPS[reviewStep - 1]?.label}</span>
                  <span>{reviewProgress}% complete</span>
                </div>
                <div className="h-2 w-full rounded-full bg-purple-100 overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all duration-300"
                    style={{ width: `${reviewProgress}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {REVIEW_STEPS.map((st) => (
                    <button
                      key={st.n}
                      type="button"
                      onClick={() => setReviewStep(st.n)}
                      className={`px-2 py-1 rounded-full text-[11px] font-medium border transition ${
                        st.n === reviewStep
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      {st.n}. {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ── Step 1: look at the patient ────────────────────────── */}
              {reviewStep === 1 && (
              <>
              {/* Airway */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Airway Assessment</label>
                <select
                  value={reviewForm.airwayAssessment}
                  onChange={e => setReviewForm(f => ({ ...f, airwayAssessment: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                  title="Airway Assessment"
                >
                  <option value="">Select...</option>
                  <option>Mallampati I</option>
                  <option>Mallampati II</option>
                  <option>Mallampati III</option>
                  <option>Mallampati IV</option>
                  <option>Anticipated difficult airway</option>
                </select>
              </div>

              {/* ASA */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ASA Classification</label>
                <select
                  value={reviewForm.asaClassification}
                  onChange={e => setReviewForm(f => ({ ...f, asaClassification: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                  title="ASA Classification"
                >
                  <option value="">Select...</option>
                  <option>ASA I - Normal healthy</option>
                  <option>ASA II - Mild systemic disease</option>
                  <option>ASA III - Severe systemic disease</option>
                  <option>ASA IV - Life-threatening</option>
                  <option>ASA V - Moribund</option>
                  <option>ASA VI - Brain dead organ donor</option>
                  <option>ASA E - Emergency modifier</option>
                </select>
              </div>

              {/* Allergies */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-red-700 mb-1">Allergies (Critical)</label>
                <input type="text" placeholder="e.g. Penicillin, Latex" value={reviewForm.allergies}
                  onChange={e => setReviewForm(f => ({ ...f, allergies: e.target.value }))}
                  className="w-full border border-red-300 rounded-lg p-2 text-sm bg-red-50" />
              </div>

              {/* Fasting — decides rapid-sequence induction, so it belongs with
                  the airway rather than buried among the bloods. */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">NPO / Fasting Status</label>
                <select
                  value={reviewForm.patientNPOStatus}
                  onChange={e => setReviewForm(f => ({ ...f, patientNPOStatus: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                  title="NPO / Fasting Status"
                >
                  <option value="">Select...</option>
                  <option>NPO &gt; 8 hours</option>
                  <option>NPO 6-8 hours</option>
                  <option>NPO 2-6 hours</option>
                  <option>NPO &lt; 2 hours</option>
                  <option>Not fasted - Full stomach</option>
                  <option>Unknown</option>
                </select>
              </div>
              </>
              )}

              {/* ── Step 2: the numbers ────────────────────────────────── */}
              {reviewStep === 2 && (
              <>
              {/* Vitals */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Blood Pressure</label>
                <input type="text" placeholder="e.g. 120/80" value={reviewForm.bloodPressure}
                  onChange={e => setReviewForm(f => ({ ...f, bloodPressure: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heart Rate (bpm)</label>
                <input type="number" placeholder="72" value={reviewForm.heartRate}
                  onChange={e => setReviewForm(f => ({ ...f, heartRate: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SpO2 (%)</label>
                <input type="number" placeholder="98" value={reviewForm.oxygenSaturation}
                  onChange={e => setReviewForm(f => ({ ...f, oxygenSaturation: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (&deg;C)</label>
                <input type="number" step="0.1" placeholder="36.5" value={reviewForm.temperature}
                  onChange={e => setReviewForm(f => ({ ...f, temperature: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IV Access</label>
                <input type="text" placeholder="e.g. 18G right antecubital" value={reviewForm.ivAccess}
                  onChange={e => setReviewForm(f => ({ ...f, ivAccess: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hemoglobin (g/dL)</label>
                <input type="number" step="0.1" placeholder="12.0" value={reviewForm.hemoglobinLevel}
                  onChange={e => setReviewForm(f => ({ ...f, hemoglobinLevel: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cross-Match Status</label>
                <select
                  value={reviewForm.crossMatchStatus}
                  onChange={e => setReviewForm(f => ({ ...f, crossMatchStatus: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                  title="Cross-Match Status"
                >
                  <option value="">Select...</option>
                  <option>Completed - Compatible</option>
                  <option>Pending</option>
                  <option>Type &amp; Screen done</option>
                  <option>Not required</option>
                </select>
              </div>
              </>
              )}

              {/* ── Step 3: plan, then the kit that plan implies ───────── */}
              {reviewStep === 3 && (
              <>
              {/* Plan */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Anaesthetic Plan</label>
                <select
                  value={reviewForm.anaestheticPlan}
                  onChange={e => setReviewForm(f => ({ ...f, anaestheticPlan: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm"
                  title="Anaesthetic Plan"
                >
                  <option value="">Select plan...</option>
                  <option>General Anaesthesia - ETT</option>
                  <option>General Anaesthesia - LMA</option>
                  <option>Regional - Spinal</option>
                  <option>Regional - Epidural</option>
                  <option>Regional - Combined Spinal-Epidural</option>
                  <option>Regional - Nerve Block</option>
                  <option>Combined General + Regional</option>
                  <option>Monitored Anaesthesia Care (MAC)</option>
                  <option>Local Anaesthesia + Sedation</option>
                </select>
              </div>
              {/* Anaesthesia packs for the chosen technique — the same picker
                  and the same packs as the elective pre-anaesthetic review.
                  Appears only once a plan is chosen, because the technique is
                  what selects the packs. */}
              <div className="md:col-span-2">
                {reviewTechnique ? (
                  <AnaesthesiaPackPicker anaesthesiaType={reviewTechnique} onChange={setAnaesPacks} />
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                    Choose an anaesthetic plan above to load its anaesthesia packs
                    (drugs go to the Pharmacy, consumables to the Consumable Pack Provider).
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Assessment / Special Considerations</label>
                <textarea rows={2} value={reviewForm.riskAssessment}
                  onChange={e => setReviewForm(f => ({ ...f, riskAssessment: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" placeholder="Document any risks..." />
              </div>

              {/* Consent */}
              <div className="md:col-span-2 flex items-center gap-2">
                <input type="checkbox" id="consent" checked={reviewForm.consentObtained}
                  onChange={e => setReviewForm(f => ({ ...f, consentObtained: e.target.checked }))}
                  className="h-4 w-4" />
                <label htmlFor="consent" className="text-sm font-medium text-gray-700">Consent obtained from patient/NOK</label>
              </div>
              </>
              )}

              {/* ── Step 4: prescribe ──────────────────────────────────── */}
              {reviewStep === 4 && (
              <>
              {/* PRESCRIPTION SECTION */}
              <div className="md:col-span-2 border-t pt-4 mt-2">
                <h4 className="font-bold text-orange-800 flex items-center gap-2 mb-2">
                  <Pill className="h-5 w-5" />
                  Emergency Prescription (visible to Pharmacy immediately)
                </h4>
                <p className="text-xs text-gray-500 mb-2">
                  Search the BNF directory to add medications one at a time. Track status: Prescribed → Used / Harmonized / Returned.
                </p>

                {/* Drug Search & Add Row */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                  {/* Row 1: Drug search */}
                  <div className="relative mb-2" ref={drugSearchRef}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={selectedDrug ? selectedDrug.name : drugSearch}
                        onChange={e => {
                          setDrugSearch(e.target.value);
                          setSelectedDrug(null);
                        }}
                        onFocus={() => { if (drugResults.length > 0) setShowDrugDropdown(true); }}
                        placeholder="Search drug name (e.g. Atropine, Propofol, Morphine)..."
                        className="w-full pl-9 pr-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                      />
                    </div>
                    {showDrugDropdown && drugResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                        {drugResults.map((drug, idx) => (
                          <button
                            key={`${drug.category}-${drug.name}-${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedDrug(drug);
                              setDrugSearch(drug.name);
                              setShowDrugDropdown(false);
                              setAddDose(drug.commonDoses[0] || '');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-50 last:border-0"
                          >
                            <div className="font-medium text-sm text-gray-900">{drug.name}</div>
                            <div className="text-xs text-gray-500">
                              {drug.category} · {drug.unit} · Doses: {drug.commonDoses.join(', ')}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Row 2: Dose, Route, Frequency */}
                  {selectedDrug && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
                        {/* Dose with suggestions */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Dose ({selectedDrug.unit})</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={addDose}
                              onChange={e => setAddDose(e.target.value)}
                              placeholder="Dose"
                              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedDrug.commonDoses.map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setAddDose(d)}
                                className={`px-2 py-0.5 text-xs rounded-full border transition ${
                                  addDose === d
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                                }`}
                              >
                                {d}{selectedDrug.unit}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Route */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Route</label>
                          <select
                            value={addRoute}
                            onChange={e => setAddRoute(e.target.value)}
                            title="Route of administration"
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          >
                            {PRESCRIPTION_ROUTES.map(r => <option key={r}>{r}</option>)}
                          </select>
                        </div>

                        {/* Frequency */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                          <select
                            value={addFrequency}
                            onChange={e => setAddFrequency(e.target.value)}
                            title="Frequency"
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          >
                            {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Optional notes */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={addNotes}
                          onChange={e => setAddNotes(e.target.value)}
                          placeholder="Special instructions for this drug (optional)"
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={addMedication}
                          disabled={!addDose}
                          className="px-4 py-1.5 bg-orange-600 text-white rounded font-medium text-sm hover:bg-orange-700 disabled:opacity-40 flex items-center gap-1"
                        >
                          <Plus className="h-4 w-4" /> Add
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Prescribed Medications List */}
                {prescribedMeds.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Drug</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Dose</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Route</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Freq</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescribedMeds.map((med, idx) => (
                          <tr key={med.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{med.drugName}</div>
                              <div className="text-xs text-gray-400">{med.category}</div>
                              {med.notes && <div className="text-xs text-orange-600 italic">{med.notes}</div>}
                            </td>
                            <td className="px-3 py-2">{med.dose}{med.unit}</td>
                            <td className="px-3 py-2">{med.route}</td>
                            <td className="px-3 py-2 text-xs">{med.frequency}</td>
                            <td className="px-3 py-2">
                              <select
                                value={med.status}
                                onChange={e => updateMedStatus(med.id, e.target.value as PrescribedMedication['status'])}
                                title="Medication status"
                                className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${MED_STATUS_COLORS[med.status]}`}
                              >
                                <option value="PRESCRIBED">Prescribed</option>
                                <option value="USED">Used</option>
                                <option value="HARMONIZED">Harmonized</option>
                                <option value="RETURNED">Returned</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeMedication(med.id)}
                                title="Remove medication"
                                className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Summary */}
                    <div className="bg-gray-50 px-3 py-2 flex gap-4 text-xs border-t">
                      <span className="text-gray-500">Total: <strong>{prescribedMeds.length}</strong></span>
                      {(['PRESCRIBED', 'USED', 'HARMONIZED', 'RETURNED'] as const).map(s => {
                        const count = prescribedMeds.filter(m => m.status === s).length;
                        return count > 0 ? (
                          <span key={s} className={`px-2 py-0.5 rounded-full ${MED_STATUS_COLORS[s]}`}>
                            {s}: {count}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* IV Fluids (now redundant if added via BNF, but kept for quick notes) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional IV Fluid Notes</label>
                <input type="text" placeholder="e.g. Run NS at 100ml/hr" value={reviewForm.fluids}
                  onChange={e => setReviewForm(f => ({ ...f, fluids: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Emergency Drug Notes</label>
                <input type="text" placeholder="e.g. Draw up Adrenaline in syringes" value={reviewForm.emergencyDrugs}
                  onChange={e => setReviewForm(f => ({ ...f, emergencyDrugs: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Pharmacy Instructions</label>
                <input type="text" placeholder="e.g. Prepare immediately, draw up in syringes" value={reviewForm.specialInstructions}
                  onChange={e => setReviewForm(f => ({ ...f, specialInstructions: e.target.value }))}
                  className="w-full border rounded-lg p-2 text-sm" />
              </div>
              </>
              )}
            </div>

            {/* Modal Footer — step navigation. Submit appears only on the last
                step, so an assessment cannot be sent to the pharmacy from step 1
                by somebody reaching for the obvious button. */}
            <div className="p-4 sm:p-6 border-t bg-gray-50 rounded-b-xl flex flex-col-reverse sm:flex-row sm:justify-between gap-3 sticky bottom-0">
              <button
                onClick={() => { setShowReviewModal(false); setReviewBooking(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 w-full sm:w-auto"
                disabled={submittingReview}
              >
                Cancel
              </button>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:items-center">
                {reviewStep > 1 && (
                  <button
                    onClick={() => setReviewStep(s => Math.max(1, s - 1))}
                    disabled={submittingReview}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 w-full sm:w-auto"
                  >
                    Back
                  </button>
                )}
                {reviewStep < REVIEW_STEPS.length ? (
                  <button
                    onClick={() => setReviewStep(s => Math.min(REVIEW_STEPS.length, s + 1))}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium w-full sm:w-auto"
                  >
                    Continue to {REVIEW_STEPS[reviewStep]?.label}
                  </button>
                ) : (
                  <button
                    onClick={handleSubmitReview}
                    disabled={submittingReview}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
                  >
                    {submittingReview ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Submit Review &amp; Send Prescription to Pharmacy
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

