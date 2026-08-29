'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Search, Calendar, ClipboardList, Package, AlertCircle, FileText, Activity, Calculator, Clock, Eye, RefreshCw, Wifi, WifiOff, Printer, Droplet, Zap as ZapIcon, Pencil, Pill, CheckCircle, FileSignature, Building2, X, ChevronUp, ChevronDown, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { AlertTriangle, Copy, MessageCircle } from 'lucide-react';
import PhoneLink from '@/components/PhoneLink';
import { bookerChaseWhatsAppUrl } from '@/lib/bookerChaseMessage';
import { formatDate, formatCurrency } from '@/lib/utils';
import { outstandingLabel } from '@/lib/preopRequirements';
import { SYNC_INTERVALS } from '@/lib/sync';
import { watToday } from '@/lib/watDay';
import { cacheFirstFetch } from '@/lib/offlineDataManager';
import { TableSkeleton } from '@/components/Skeleton';
import ContactName from '@/components/ContactName';
import { bookingLateness, formatBookedAt, formatBookedAtShort } from '@/lib/bookingLateness';
import TheatreTeamAssigner from '@/components/TheatreTeamAssigner';

interface Surgery {
  id: string;
  patient: {
    id?: string;
    name: string;
    folderNumber: string;
    age?: number;
    gender?: string;
    ward?: string;
  };
  surgeon: {
    id?: string;
    fullName: string;
  } | null;
  surgeonName?: string | null;
  /**
   * Comma-separated MissingItem values on a case booked before its preparation
   * was complete. Present on the API response already; it was simply never
   * shown here, which meant the one screen the whole theatre looks at was the
   * one screen that did not say a case was unprepared.
   */
  preopOutstanding?: string | null;
  /** Who booked the case, with the role and number needed to reach them. */
  bookedBy?: { id: string | null; name: string | null; role: string | null; phone: string | null } | null;
  procedureName: string;
  indication?: string;
  scheduledDate: string;
  scheduledTime: string;
  /// When the booking was actually made. Already returned by the API.
  createdAt?: string | null;
  surgeryType?: string | null;
  status: string;
  listOrder?: number | null;
  subspecialty: string;
  unit?: string;
  location?: string | null;
  theatreId?: string | null;
  theatreName?: string | null;
  theatre?: { id: string; name: string; location: string } | null;
  anaesthetist?: { id: string; fullName: string; phoneNumber?: string | null } | null;
  theatreTechnician?: { id: string; fullName: string; phoneNumber?: string | null } | null;
  supervisingConsultantName?: string | null;
  needBloodTransfusion?: boolean;
  needDiathermy?: boolean;
  needStereo?: boolean;
  needStirups?: boolean;
  needMontrellMattress?: boolean;
  otherSpecialNeeds?: string | null;
  anesthesiaType?: string | null;
  holdingAreaAssessment?: {
    id: string;
    status: string;
    clearedForTheatre: boolean;
    transferredToTheatre: boolean;
  } | null;
}

export default function SurgeriesPage() {
  const { data: session } = useSession();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // Default to today's list so only the current day's cases load (lighter payload
  // for poor connections). An empty value means "all scheduled dates".
  const [dateFilter, setDateFilter] = useState(() => watToday());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Role-based action visibility
  const userRole = session?.user?.role;
  const canAccessWHOChecklist = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessAnesthesia = ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST'].includes(userRole || '');
  const canAccessSurgicalCount = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessTiming = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessConsumables = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER'].includes(userRole || '');
  const canAccessBOM = ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'].includes(userRole || '');
  // Consent can be completed by the surgical/anaesthetic team or theatre nurses caring for the patient.
  const canAccessConsent = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'RECOVERY_ROOM_NURSE'].includes(userRole || '');
  // Surgeons (and admins / theatre managers) may close out a case so PACU can admit and the post-op note can be written.
  const canCompleteSurgery = ['SURGEON', 'CONSULTANT_SURGEON', 'ADMIN', 'THEATRE_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(userRole || '');
  // Perioperative nurses and admins can re-assign / change the theatre a booked case is allocated to.
  const canReassignTheatre = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'].includes(userRole || '');
  // Surgeons (and admins / theatre managers) can reschedule a case to another day
  // when it could not be performed on the set date.
  const canReschedule = ['SURGEON', 'CONSULTANT_SURGEON', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'].includes(userRole || '');
  // Surgeons & perioperative nurses can change the order a unit's cases are listed.
  const canReorder = ['SURGEON', 'CONSULTANT_SURGEON', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'].includes(userRole || '');
  // Withdrawing a case as a duplicate is a correction to the list rather than a
  // clinical decision, so it sits with the people who own the list.
  const canMarkDuplicate = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'].includes(userRole || '');
  const [reordering, setReordering] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  // Quick "change theatre" modal state.
  const [theatres, setTheatres] = useState<{ id: string; name: string; location?: string }[]>([]);
  const [reassignSurgery, setReassignSurgery] = useState<Surgery | null>(null);
  const [reassignTheatreId, setReassignTheatreId] = useState<string>('');
  const [savingTheatre, setSavingTheatre] = useState(false);
  // Reschedule modal state.
  const [rescheduleSurgery, setRescheduleSurgery] = useState<Surgery | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // ── Units first, cases on request ────────────────────────────────────────
  // The page used to fetch every case for the date and group them in the
  // browser. That is the wrong shape twice over: it downloads a whole theatre
  // list to answer "who is operating today", and it puts eleven units of
  // detail on screen when somebody wanted one.
  //
  // /api/surgeries/summary answers the card question with a GROUP BY in a few
  // hundred bytes. The cases for a unit are fetched when that unit is opened,
  // and only that unit.
  type UnitContact = { name: string; phone: string | null } | null;
  const [unitSummary, setUnitSummary] = useState<
    {
      unit: string;
      cases: number;
      scheduled: number;
      emergencies: number;
      team?: {
        surgeons: { name: string; phone: string | null; role: string }[];
        theatre: string | null;
        anaesthetists: {
          consultant: UnitContact;
          seniorRegistrar: UnitContact;
          registrar: UnitContact;
          source: string;
        };
        scrubNurse: UnitContact;
        circulatingNurse: UnitContact;
        anaestheticTechnician: UnitContact;
      } | null;
    }[] | null
  >(null);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  // Read inside fetchSurgeries without making it depend on the open unit: the
  // action handlers capture that callback and must not be rebuilt mid-action.
  const openUnitRef = useRef<string | null>(null);
  const [unitLoading, setUnitLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const fetchUnitSummary = useCallback(async () => {
    setSummaryError(null);
    try {
      const url = dateFilter
        ? `/api/surgeries/summary?date=${encodeURIComponent(dateFilter)}`
        : '/api/surgeries/summary';
      const res = await fetch(url);
      if (!res.ok) { setSummaryError('Could not load the unit list.'); return; }
      const data = await res.json();
      setUnitSummary(Array.isArray(data?.units) ? data.units : []);
    } catch {
      setSummaryError('Could not reach the server to list the units.');
    }
  }, [dateFilter]);

  // Refreshes WHAT IS ON SCREEN after an action (complete, reschedule,
  // reassign, reorder). It is unit-aware on purpose: the older version always
  // refetched the whole day, so completing one case in Neurosurgery would
  // quietly replace the open unit's list with every case in the hospital.
  const fetchSurgeries = useCallback(async () => {
    setIsSyncing(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set('date', dateFilter);
      if (openUnitRef.current) params.set('unit', openUnitRef.current);
      const qs = params.toString();
      const url = qs ? `/api/surgeries?${qs}` : '/api/surgeries';
      const cacheKey = `surgeries-day-${dateFilter || 'all'}-${openUnitRef.current || 'all'}`;
      // Cache-first: paint last-known cases instantly, then revalidate from network.
      const result = await cacheFirstFetch<Surgery[]>(url, cacheKey, {
        onCachedData: (cached) => {
          if (Array.isArray(cached)) {
            setSurgeries(cached);
            setLoading(false);
          }
        },
      });
      if (Array.isArray(result.data)) {
        setSurgeries(result.data);
        setLastSyncTime(Date.now());
      } else if (result.error && !result.isCached) {
        console.error('Failed to fetch surgeries:', result.error);
      }
    } catch (error) {
      console.error('Failed to fetch surgeries:', error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [dateFilter]);

  // Open a unit: fetch just its cases, then hand them to the existing table.
  //
  // ALL_UNITS is a real option, not a fallback. Splitting the list into cards
  // was reported within hours as "I can't see the cases" — which was fair: a
  // grid of cards where a list used to be reads as the list having gone, and
  // the person is left guessing that a card is a button. One date's cases now
  // cost 27 kB rather than the 80 MB that made the split necessary, so showing
  // them all is a perfectly reasonable thing to want and is one press away.
  const ALL_UNITS = '— all units —';

  const openUnitCases = useCallback(async (unit: string) => {
    setUnitLoading(true);
    setOpenUnit(unit);
    openUnitRef.current = unit === ALL_UNITS ? null : unit;
    try {
      const params = new URLSearchParams();
      if (unit !== ALL_UNITS) params.set('unit', unit);
      if (dateFilter) params.set('date', dateFilter);
      const qs = params.toString();
      const res = await fetch(qs ? `/api/surgeries?${qs}` : '/api/surgeries');
      setSurgeries(res.ok ? await res.json() : []);
    } catch {
      setSurgeries([]);
    } finally {
      setUnitLoading(false);
      setLoading(false);
    }
  }, [dateFilter]);

  const closeUnit = useCallback(() => {
    setOpenUnit(null);
    openUnitRef.current = null;
    // Dropped rather than kept: holding one unit's cases while showing the card
    // grid is how a stale list gets rendered under the wrong heading.
    setSurgeries([]);
  }, []);

  // On arrival, and whenever the date changes, load ONLY the unit counts.
  // Opening a unit is what fetches cases.
  useEffect(() => {
    setOpenUnit(null);
    openUnitRef.current = null;
    setSurgeries([]);
    setLoading(false);
    void fetchUnitSummary();
  }, [fetchUnitSummary]);

  // Keep the open unit fresh for cross-device sync — but only the unit that is
  // actually on screen. The old timer refetched every case in the hospital
  // every cycle, whether anybody was looking at them or not.
  useEffect(() => {
    if (!openUnit) return;
    const interval = setInterval(() => { void openUnitCases(openUnit); }, SYNC_INTERVALS.SURGERIES);
    return () => clearInterval(interval);
  }, [openUnit, openUnitCases]);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // Refresh what is on screen, not everything that exists. Coming back to
      // the card grid re-counts; coming back to an open unit reloads that unit.
      if (openUnit) void openUnitCases(openUnit);
      else void fetchUnitSummary();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [openUnit, openUnitCases, fetchUnitSummary]);

  const handleMarkCompleted = async (surgeryId: string) => {
    if (!window.confirm('Mark this surgery as completed? This lets PACU admit the patient and lets the surgeon write the post-operative note. Date, time and team records are preserved.')) {
      return;
    }
    setCompletingId(surgeryId);
    try {
      const response = await fetch(`/api/surgeries/${surgeryId}/complete`, { method: 'POST' });
      if (response.ok) {
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to mark surgery as completed');
      }
    } catch (error) {
      alert('A network error occurred while completing the surgery');
    } finally {
      setCompletingId(null);
    }
  };

  /**
   * Withdraw a case that was booked more than once.
   *
   * Goes through /api/cancellations like any other cancellation, so it writes a
   * CaseCancellation record naming who did it and why, rather than quietly
   * flipping a status. Category ADMINISTRATIVE: nothing clinical changed, the
   * list was wrong.
   *
   * The server refuses to cancel a COMPLETED or IN_PROGRESS case, which matters
   * most precisely here — among several copies of one booking, the completed
   * row is the operation that actually happened and looks no different in a
   * list from its duplicates.
   */
  const handleMarkDuplicate = async (surgery: { id: string; procedureName?: string; patient?: { name?: string } | null }) => {
    const who = surgery.patient?.name ? ` for ${surgery.patient.name}` : '';
    if (!window.confirm(
      `Withdraw this case${who} as a duplicate?\n\n`
      + `It is removed from the theatre list and its slot and pack are released. `
      + `The other copy stays. This is recorded against your name and can be reviewed in cancellations.`
    )) return;

    setDuplicateId(surgery.id);
    try {
      const response = await fetch('/api/cancellations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: surgery.id,
          category: 'ADMINISTRATIVE',
          reason: 'Duplicate booking',
          detailedNotes:
            'Withdrawn as a duplicate: the same patient was booked more than once for this date, '
            + 'so the case held a second theatre slot and had a second pack prepared. The remaining '
            + 'booking is unaffected.',
        }),
      });
      if (response.ok) {
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Could not withdraw this case as a duplicate.');
      }
    } catch {
      alert('A network error occurred while withdrawing the duplicate.');
    } finally {
      setDuplicateId(null);
    }
  };

  // Theatre staff confirm an en-route patient has physically arrived in the theatre.
  const canReceiveInTheatre =['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN', 'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR'].includes(userRole || '');
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const handleReceiveInTheatre = async (assessmentId: string) => {
    if (!window.confirm('Confirm the patient has arrived and is being received in the theatre?')) {
      return;
    }
    setReceivingId(assessmentId);
    try {
      const response = await fetch(`/api/holding-area/${assessmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferredToTheatre: true }),
      });
      if (response.ok) {
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to receive patient in theatre');
      }
    } catch (error) {
      alert('A network error occurred while receiving the patient');
    } finally {
      setReceivingId(null);
    }
  };

  // Load the list of theatres once for the "change theatre" picker (periop nurse / admin only).
  useEffect(() => {
    if (!canReassignTheatre) return;
    let active = true;
    fetch('/api/theatres')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active && Array.isArray(data)) {
          setTheatres(data.map((t: any) => ({ id: t.id, name: t.name, location: t.location })));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canReassignTheatre]);

  const openReassign = (surgery: Surgery) => {
    setReassignSurgery(surgery);
    setReassignTheatreId(surgery.theatreId || surgery.theatre?.id || '');
  };

  const handleSaveTheatre = async () => {
    if (!reassignSurgery) return;
    setSavingTheatre(true);
    try {
      const selected = theatres.find((t) => t.id === reassignTheatreId);
      const response = await fetch(`/api/surgeries/${reassignSurgery.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatreId: reassignTheatreId || null,
          location: selected?.name || null,
        }),
      });
      if (response.ok) {
        setReassignSurgery(null);
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to change theatre');
      }
    } catch (error) {
      alert('A network error occurred while changing the theatre');
    } finally {
      setSavingTheatre(false);
    }
  };

  const openReschedule = (surgery: Surgery) => {
    setRescheduleSurgery(surgery);
    setRescheduleDate((surgery.scheduledDate || '').slice(0, 10));
    setRescheduleReason('');
  };

  const handleReschedule = async () => {
    if (!rescheduleSurgery) return;
    if (!rescheduleDate) {
      alert('Please choose the new surgery date.');
      return;
    }
    if (!rescheduleReason.trim()) {
      alert('Please give the reason the surgery could not be done on the set day.');
      return;
    }
    setSavingReschedule(true);
    try {
      const stamp = new Date().toLocaleString('en-GB');
      const author = session?.user?.name || 'Surgeon';
      const note = `[RESCHEDULED ${stamp} by ${author}] Moved from ${(rescheduleSurgery.scheduledDate || '').slice(0, 10)} to ${rescheduleDate}. Reason: ${rescheduleReason.trim()}`;
      const nextRemarks = `${(rescheduleSurgery as any).remarks || ''}\n\n${note}`.trim();
      const response = await fetch(`/api/surgeries/${rescheduleSurgery.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate: rescheduleDate,
          // Re-open the case for scheduling on the new day.
          status: 'SCHEDULED',
          remarks: nextRemarks,
        }),
      });
      if (response.ok) {
        setRescheduleSurgery(null);
        setRescheduleReason('');
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to reschedule the surgery');
      }
    } catch (error) {
      alert('A network error occurred while rescheduling');
    } finally {
      setSavingReschedule(false);
    }
  };

  // Move a case up/down within its displayed theatre/unit group and persist the
  // new order for the whole group.
  const moveCase = async (rows: Surgery[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const reordered = [...rows];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    // Assign sequential listOrder to the whole group in the new order.
    const orders = reordered.map((s, i) => ({ id: s.id, listOrder: i }));
    // Optimistic local update so the row moves immediately.
    setSurgeries((prev) => {
      if (!Array.isArray(prev)) return prev;
      const map = new Map(orders.map((o) => [o.id, o.listOrder]));
      return prev.map((s) => (map.has(s.id) ? { ...s, listOrder: map.get(s.id)! } : s));
    });
    setReordering(true);
    try {
      const res = await fetch('/api/surgeries/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to save the new order');
        await fetchSurgeries();
      }
    } catch {
      alert('A network error occurred while saving the order');
      await fetchSurgeries();
    } finally {
      setReordering(false);
    }
  };

  const filteredSurgeries = Array.isArray(surgeries) ? surgeries.filter(surgery => {
    const patientName = surgery.patient?.name || '';
    const folderNumber = surgery.patient?.folderNumber || '';
    const matchesSearch = 
      patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      folderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      surgery.procedureName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || surgery.status === statusFilter;
    const matchesDate = !dateFilter || (
      surgery.scheduledDate && surgery.scheduledDate.slice(0, 10) === dateFilter
    );
    return matchesSearch && matchesStatus && matchesDate;
  }) : [];

  // Resolve a human-friendly theatre label for a case.
  const theatreOf = (s: Surgery) =>
    s.theatre?.name || s.theatreName || s.location || 'Unassigned theatre';

  // Group the filtered cases by day, then by theatre, so each day's schedule is
  // laid out theatre-by-theatre. Cases inside a theatre are ordered by start time;
  // "Unassigned theatre" always sinks to the bottom of each day.
  // Grouped by UNIT, matching the printed list.
  //
  // It used to group by theatre, which put the cart before the horse: a unit
  // books its list, and theatre then gives that unit a room. Grouping by theatre
  // meant every unassigned case landed in one "Unassigned" heap with no way to
  // see whose cases they were, and no single place to press to assign them.
  // --- Per-unit theatre assignment ----------------------------------------
  // The theatre manager or a perioperative nurse gives a unit a room for the day
  // and every case in that unit's list moves with it. The person booking no
  // longer chooses, which is why this control exists here rather than on the
  // booking form.
  const [theatreOptions, setTheatreOptions] = useState<{ id: string; name: string }[]>([]);
  const [scrubOptions, setScrubOptions] = useState<{ id: string; fullName: string }[]>([]);
  const [unitScrub, setUnitScrub] = useState<Record<string, string>>({});
  const [unitCirc, setUnitCirc] = useState<Record<string, string>>({});
  const [unitChoice, setUnitChoice] = useState<Record<string, string>>({});
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  // Keyed by group: one shared message would appear under every unit heading,
  // including the ones it had nothing to do with.
  const [unitNote, setUnitNote] = useState<Record<string, string>>({});
  // One unit's team panel open at a time — five multi-selects per heading would
  // bury the list itself.
  const [teamOpen, setTeamOpen] = useState<string | null>(null);

  const canAssignTheatre = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER',
    'THEATRE_CHAIRMAN', 'NURSE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE']
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

    // Scrub and circulating nurses come from the same pool; the roles are a
    // rotation, not a job title, so one list serves both pickers.
    Promise.all([
      fetch('/api/users?role=SCRUB_NURSE&status=APPROVED').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/users?role=CIRCULATING_NURSE&status=APPROVED').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([a, b]) => {
        const flat = [...(Array.isArray(a) ? a : a?.users ?? []), ...(Array.isArray(b) ? b : b?.users ?? [])];
        const byId = new Map<string, { id: string; fullName: string }>();
        for (const u of flat) if (u?.id) byId.set(u.id, { id: u.id, fullName: u.fullName });
        setScrubOptions(Array.from(byId.values()));
      })
      .catch(() => {});
  }, [canAssignTheatre]);

  const assignUnitTheatre = async (groupKey: string, unit: string, date: string) => {
    const theatreId = unitChoice[groupKey];
    if (!theatreId) return;
    setAssigningKey(groupKey);
    setUnitNote((p) => ({ ...p, [groupKey]: '' }));
    try {
      const res = await fetch('/api/theatres/assign-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit, date, theatreId,
          // Sent only when chosen, so assigning a theatre alone does not wipe a
          // nursing team somebody set earlier.
          ...(unitScrub[groupKey] ? { scrubNurseId: unitScrub[groupKey] } : {}),
          ...(unitCirc[groupKey] ? { circulatingNurseId: unitCirc[groupKey] } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnitNote((p) => ({ ...p, [groupKey]: body.error || 'Could not assign the theatre.' }));
        return;
      }
      setUnitNote((p) => ({ ...p, [groupKey]: body.message || 'Theatre assigned.' }));
      await fetchSurgeries();
    } catch {
      setUnitNote((p) => ({ ...p, [groupKey]: 'Could not reach the server.' }));
    } finally {
      setAssigningKey(null);
    }
  };

  const unitOf = (s: Surgery) => (s.unit || s.subspecialty || 'Unassigned unit').trim();

  const groupedSchedule = (() => {
    const sorted = [...filteredSurgeries].sort((a, b) => {
      const dateA = (a.scheduledDate || '').slice(0, 10);
      const dateB = (b.scheduledDate || '').slice(0, 10);
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const unitA = unitOf(a);
      const unitB = unitOf(b);
      if (unitA.toLowerCase() !== unitB.toLowerCase()) return unitA.localeCompare(unitB);
      // Manual order (listOrder) takes precedence within a unit's list; cases
      // without an explicit order fall back to their scheduled time.
      const loA = a.listOrder ?? Number.MAX_SAFE_INTEGER;
      const loB = b.listOrder ?? Number.MAX_SAFE_INTEGER;
      if (loA !== loB) return loA - loB;
      return (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
    });

    const groups: {
      key: string; dateLabel: string; date: string; unit: string;
      theatres: string[]; rows: Surgery[];
    }[] = [];

    for (const s of sorted) {
      const dayKey = (s.scheduledDate || '').slice(0, 10);
      const unit = unitOf(s);
      const key = `${dayKey}__${unit}`;
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({
          key, unit, date: dayKey,
          dateLabel: s.scheduledDate
            ? new Date(s.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
            : '',
          theatres: [],
          rows: [s],
        });
      } else {
        last.rows.push(s);
      }
    }

    // Which theatre(s) the unit's cases currently sit in. More than one means a
    // previous per-case assignment scattered them, which is worth showing rather
    // than hiding behind a single label.
    for (const g of groups) {
      g.theatres = Array.from(new Set(
        g.rows.map((r) => theatreOf(r)).filter((t) => t && !t.toLowerCase().startsWith('unassigned'))
      ));
    }
    return groups;
  })();

  const summariseSpecialNeeds = (s: Surgery): string[] => {
    const tags: string[] = [];
    if (s.needBloodTransfusion) tags.push('Blood Tx');
    if (s.needDiathermy) tags.push('Diathermy');
    if (s.needStirups || s.needStereo) tags.push('Stirrups');
    if (s.needMontrellMattress) tags.push('Montrell');
    if (s.otherSpecialNeeds && s.otherSpecialNeeds.trim()) tags.push(`Other: ${s.otherSpecialNeeds.trim()}`);
    return tags;
  };

  // Export the currently filtered list as a landscape PDF (via browser print).
  // Grouped by surgical UNIT (e.g. "PS Unit I", "GS Unit III"), then by scheduled time.
  // ── The export still covers EVERY case, not just the unit on screen ───────
  // The page now holds one unit's cases at a time, so exporting from what is
  // loaded would silently produce a theatre list with ten units missing — and
  // it would look completely normal. The list is fetched in full at the moment
  // of export instead: the one place where downloading everything is exactly
  // what was asked for.
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    setExporting(true);
    let all: Surgery[] = [];
    try {
      const url = dateFilter
        ? `/api/surgeries?date=${encodeURIComponent(dateFilter)}`
        : '/api/surgeries';
      const res = await fetch(url);
      all = res.ok ? await res.json() : [];
    } catch {
      alert('The full list could not be fetched for export. Check the connection and try again.');
      setExporting(false);
      return;
    }
    if (!Array.isArray(all) || all.length === 0) {
      alert('There are no cases to export for this date.');
      setExporting(false);
      return;
    }
    setExporting(false);
    exportRowsToPdf(all);
  };

  const exportRowsToPdf = (source: Surgery[]) => {
    const rows = [...source].sort((a, b) => {
      const teamA = (a.unit || a.subspecialty || '').toLowerCase();
      const teamB = (b.unit || b.subspecialty || '').toLowerCase();
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
    });

    // Group by surgical UNIT for clearer printout (more granular than subspecialty).
    const groups = new Map<string, Surgery[]>();
    for (const r of rows) {
      const key = r.unit || r.subspecialty || 'Unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const dateLabel = dateFilter
      ? new Date(dateFilter).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      : 'All scheduled dates';

    const escape = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formatAnaesthesia = (a?: string | null) => {
      if (!a) return '—';
      const map: Record<string, string> = {
        GENERAL: 'General (GA)',
        SPINAL: 'Spinal',
        EPIDURAL: 'Epidural',
        COMBINED_SPINAL_EPIDURAL: 'Combined Spinal-Epidural',
        REGIONAL: 'Regional',
        SEDATION: 'Sedation',
        LOCAL: 'Local',
      };
      return map[a] || a;
    };

    let body = '';
    let groupNo = 0;
    groups.forEach((items, team) => {
      groupNo++;
      body += `<h2 class="team">${groupNo}. ${escape(team)} <span class="count">(${items.length} case${items.length === 1 ? '' : 's'})</span></h2>`;
      body += `<table><thead><tr>
        <th style="width:3%">#</th>
        <th style="width:11%">Patient</th>
        <th style="width:5%">Folder</th>
        <th style="width:6%">Age / Sex</th>
        <th style="width:6%">Ward</th>
        <th style="width:14%">Procedure</th>
        <th style="width:9%">Diagnosis / Indication</th>
        <th style="width:8%">Surgeon</th>
        <th style="width:7%">Theatre</th>
        <th style="width:8%">Date &amp; Time</th>
        <th style="width:9%">Booked</th>
        <th style="width:6%">Anaesthesia</th>
        <th style="width:4%">Special</th>
        <th style="width:4%">Status</th>
      </tr></thead><tbody>`;
      items.forEach((s, i) => {
        const needs = summariseSpecialNeeds(s);
        const ageSex = `${s.patient?.age ?? '?'}${s.patient?.gender ? ' / ' + s.patient.gender : ''}`;
        const theatreLabel = s.theatreName || s.theatre?.name || s.location || '';
        body += `<tr>
          <td>${i + 1}</td>
          <td>${escape(s.patient?.name || 'Unknown')}</td>
          <td>${escape(s.patient?.folderNumber || 'N/A')}</td>
          <td>${escape(ageSex)}</td>
          <td>${escape(s.patient?.ward || '—')}</td>
          <td>${escape(s.procedureName)}</td>
          <td>${escape(s.indication || '—')}</td>
          <td>${escape(s.surgeon?.fullName || s.surgeonName || 'Not assigned')}</td>
          <td>${escape(theatreLabel)}${s.supervisingConsultantName ? `<br/><span class="sub">Consultant: ${escape(s.supervisingConsultantName)}</span>` : ''}</td>
          <td>${escape(formatDate(s.scheduledDate))}<br/><span class="sub">${escape(s.scheduledTime || '')}</span></td>
          <td>${escape(formatBookedAtShort(s.createdAt))}${(() => {
            const late = bookingLateness({
              scheduledDate: s.scheduledDate, bookedAt: s.createdAt, surgeryType: s.surgeryType,
            });
            // Tagged in the printout as well as on screen: the printed list is
            // what goes to the morning meeting, and a flag only visible on a
            // phone is a flag nobody discusses.
            return late.isLate ? `<br/><span class="late">LATE BOOKING</span>` : '';
          })()}</td>
          <td>${escape(formatAnaesthesia(s.anesthesiaType))}</td>
          <td>${needs.length === 0 ? '<span class="sub">—</span>' : needs.map(n => `<span class="badge">${escape(n)}</span>`).join(' ')}</td>
          <td><span class="status status-${s.status}">${escape(s.status)}</span></td>
        </tr>`;
      });
      body += '</tbody></table>';
    });

    if (rows.length === 0) {
      body = '<p style="text-align:center;padding:40px;color:#666">No surgeries match the current filters.</p>';
    }

    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      alert('Please allow pop-ups to export the surgery list as PDF.');
      return;
    }
    win.document.write(`<!doctype html><html><head>
      <title>Surgery Schedule — ${escape(dateLabel)}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 6mm; font-size: 11px; }
        .head { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #111; padding-bottom:6px; margin-bottom:10px; }
        .head h1 { margin:0; font-size:16px; }
        .head p { margin:0; font-size:10px; color:#555; }
        h2.team { font-size:13px; background:#f1f5f9; border-left:4px solid #4f46e5; padding:4px 8px; margin:14px 0 4px; }
        h2.team .count { font-weight:normal; color:#555; font-size:11px; }
        table { width:100%; border-collapse:collapse; margin-bottom:6px; }
        th, td { border:1px solid #cbd5e1; padding:4px 6px; vertical-align:top; text-align:left; }
        th { background:#e0e7ff; font-size:10px; text-transform:uppercase; }
        .sub { color:#64748b; font-size:10px; }
        .badge { display:inline-block; background:#fef3c7; border:1px solid #fbbf24; color:#92400e; padding:1px 5px; border-radius:8px; font-size:9px; margin:1px 2px 1px 0; white-space:nowrap; }
        /* Bold and boxed rather than merely coloured: theatre lists are often
           printed on a monochrome laser printer, where a red tint disappears
           entirely and the flag silently stops existing. */
        .late { display:inline-block; margin-top:2px; font-weight:800; font-size:9px; letter-spacing:.3px;
                color:#000; background:#fde68a; border:1.5px solid #000; padding:1px 4px; border-radius:2px;
                white-space:nowrap; }
        .status { padding:2px 6px; border-radius:8px; font-weight:bold; font-size:9px; }
        .status-SCHEDULED { background:#dbeafe; color:#1e40af; }
        .status-IN_PROGRESS { background:#fef3c7; color:#92400e; }
        .status-COMPLETED { background:#dcfce7; color:#166534; }
        .status-CANCELLED { background:#fee2e2; color:#991b1b; }
        .footer { margin-top:14px; border-top:1px solid #cbd5e1; padding-top:4px; font-size:9px; color:#64748b; display:flex; justify-content:space-between; }
      </style>
    </head><body>
      <div class="head">
        <div>
          <h1>UNTH Theatre — Surgery Schedule</h1>
          <p>Date: ${escape(dateLabel)} · Sorted by Surgical Team · ${rows.length} case${rows.length === 1 ? '' : 's'}</p>
        </div>
        <div style="text-align:right">
          <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
        </div>
      </div>
      ${body}
      <div class="footer">
        <span>University of Nigeria Teaching Hospital — Ituku Ozalla, Enugu State</span>
        <span>Use Ctrl+P (or ⌘P) and choose “Save as PDF”</span>
      </div>
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); }</script>
    </body></html>`);
    win.document.close();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Surgery Scheduling</h1>
          <p className="text-gray-600 mt-1">Manage surgical procedures and bookings</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
              !isOnline ? 'bg-gray-100 text-gray-600 border-gray-200' :
              isSyncing ? 'bg-blue-50 text-blue-600 border-blue-200' :
              'bg-green-50 text-green-600 border-green-200'
            }`}>
              {!isOnline ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  <span>Offline</span>
                </>
              ) : isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  <span>Synced</span>
                </>
              )}
            </div>
            <button
              onClick={fetchSurgeries}
              disabled={isSyncing || !isOnline}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Sync latest data now"
            >
              <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync now</span>
            </button>
          </div>
          <Link href="/dashboard/surgeries/completed" className="btn-secondary flex items-center justify-center whitespace-nowrap flex-1 sm:flex-none">
            Completed Surgeries
          </Link>
          <Link href="/dashboard/surgeries/new" className="btn-primary flex items-center justify-center whitespace-nowrap flex-1 sm:flex-none">
            <Plus className="w-5 h-5 mr-2 shrink-0" />
            Book Surgery
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by patient name, folder number, or procedure..."
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Status filter"
          >
            <option value="ALL">All Status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <input
            type="date"
            className="input-field"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by scheduled date"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            Showing <strong>{filteredSurgeries.length}</strong> case{filteredSurgeries.length === 1 ? '' : 's'}
            {dateFilter
              ? <> on <strong>{new Date(dateFilter).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></>
              : <> across <strong>all dates</strong></>}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDateFilter(watToday())}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
            >
              Today
            </button>
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-xs text-gray-600 hover:text-gray-800 underline"
              >
                All dates
              </button>
            )}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredSurgeries.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              title="Export the filtered list as a landscape PDF, sorted by surgical team"
            >
              <Printer className="w-4 h-4" />
              Export PDF (landscape, by team)
            </button>
          </div>
        </div>
      </div>

      {/* ── Unit cards: what exists, without loading any of it ───────────────
          A card per surgical unit with its counts, drawn from a GROUP BY. No
          case data is fetched until somebody opens a unit, and then only that
          unit's. */}
      {!openUnit && (
        <div className="card">
          {summaryError ? (
            <div className="text-center py-8">
              <p className="text-amber-800">{summaryError}</p>
              <button onClick={() => void fetchUnitSummary()} className="btn-secondary text-sm mt-3">
                Try again
              </button>
            </div>
          ) : unitSummary === null ? (
            <div className="text-center py-8 text-gray-500">Loading units…</div>
          ) : unitSummary.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No cases booked{dateFilter ? ' for this date' : ''}.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Units with cases{dateFilter ? ' on this date' : ''}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {unitSummary.reduce((n, u) => n + u.cases, 0)} case
                    {unitSummary.reduce((n, u) => n + u.cases, 0) === 1 ? '' : 's'} across{' '}
                    {unitSummary.length} unit{unitSummary.length === 1 ? '' : 's'} &mdash; open a
                    unit, or show them all.
                  </p>
                </div>
                {/* The escape hatch. Without it a grid of cards reads as the
                    list having disappeared, which is exactly how it was
                    reported. */}
                <button
                  onClick={() => void openUnitCases(ALL_UNITS)}
                  className="btn-secondary text-sm whitespace-nowrap"
                >
                  Show all {unitSummary.reduce((n, u) => n + u.cases, 0)} cases
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unitSummary.map((u) => (
                  /* A DIV, not a button. The card now contains tel: links, and
                     an anchor inside a button is invalid markup that swallows
                     the tap on some mobile browsers — which is every browser
                     that matters here. The heading is the button instead. */
                  <div
                    key={u.unit}
                    className="rounded-xl border-2 border-gray-200 hover:border-primary-400 hover:shadow-md transition bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => void openUnitCases(u.unit)}
                      className="w-full text-left p-4 pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{u.unit || 'Unassigned unit'}</p>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {u.scheduled} scheduled
                            {u.emergencies > 0 && (
                              <span className="text-red-700 font-medium"> · {u.emergencies} emergency</span>
                            )}
                            {u.team?.theatre && (
                              <span className="text-gray-400"> · {u.team.theatre}</span>
                            )}
                          </p>
                        </div>
                        <span className="text-2xl font-bold text-primary-600 tabular-nums flex-shrink-0">
                          {u.cases}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Tap to load this unit&rsquo;s cases</p>
                    </button>

                    {/* Who to call. The reason this card exists at all: standing
                        in a corridor, a count is useless and a name with a
                        number is the whole answer. */}
                    {u.team && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/60">
                        {/* Surgeons first: they are the people most often
                            chased, and a unit has several rather than one, so
                            this is a list of distinct names rather than a role
                            with a single holder. */}
                        <TeamGroup
                          label="Surgery"
                          members={
                            u.team.surgeons.length
                              ? u.team.surgeons.map((s) => [s.role, { name: s.name, phone: s.phone }] as [string, { name: string; phone: string | null }])
                              : [['Surgeon', null]]
                          }
                        />
                        <TeamGroup
                          label="Anaesthesia"
                          note={
                            u.team.anaesthetists.source === 'on-call'
                              ? 'on-call cover — nobody rostered to this unit'
                              : u.team.anaesthetists.source === 'none'
                                ? 'not yet assigned'
                                : null
                          }
                          members={[
                            ['Consultant', u.team.anaesthetists.consultant],
                            ['Snr registrar', u.team.anaesthetists.seniorRegistrar],
                            ['Registrar', u.team.anaesthetists.registrar],
                          ]}
                        />
                        <TeamGroup
                          label="Nursing"
                          members={[
                            ['Scrub', u.team.scrubNurse],
                            ['Circulating', u.team.circulatingNurse],
                          ]}
                        />
                        <TeamGroup
                          label="Technician"
                          members={[['Anaes. tech', u.team.anaestheticTechnician]]}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Surgeries Table — only once a unit has been opened */}
      {openUnit && (
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button onClick={closeUnit} className="btn-secondary text-sm">
              ← All units
            </button>
            <h2 className="text-lg font-semibold text-gray-900">{openUnit}</h2>
          </div>
          <button
            onClick={() => void openUnitCases(openUnit)}
            disabled={unitLoading}
            className="btn-secondary text-sm disabled:opacity-60"
          >
            {unitLoading ? 'Loading…' : 'Refresh unit'}
          </button>
        </div>
        {unitLoading && surgeries.length === 0 ? (
          <TableSkeleton rows={6} columns={9} />
        ) : loading ? (
          <TableSkeleton rows={6} columns={9} />
        ) : filteredSurgeries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No surgeries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Procedure / Indication
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit / Theatre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Surgeon
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Booked
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Special Needs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedSchedule.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-indigo-50/70">
                      <td colSpan={9} className="px-6 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-800">
                            {!dateFilter && group.dateLabel && (
                              <span className="text-indigo-500">{group.dateLabel}</span>
                            )}
                            <span>{group.unit}</span>
                            <span className="font-medium normal-case text-indigo-400">
                              · {group.rows.length} case{group.rows.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          {/* Where this unit is operating. More than one theatre
                              means an earlier per-case assignment scattered the
                              list, which is worth showing rather than hiding. */}
                          {group.theatres.length === 1 && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                              {group.theatres[0]}
                            </span>
                          )}
                          {group.theatres.length > 1 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                              Split across {group.theatres.length} theatres
                            </span>
                          )}
                          {group.theatres.length === 0 && (
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              No theatre assigned
                            </span>
                          )}

                          {/* Assign a theatre to the WHOLE unit for the day. The
                              unit works its list in one room; it does not get a
                              different theatre per patient. */}
                          {canAssignTheatre && (
                            <span className="ml-auto flex items-center gap-2">
                              <select
                                value={unitChoice[group.key] ?? ''}
                                onChange={(e) => setUnitChoice((p) => ({ ...p, [group.key]: e.target.value }))}
                                aria-label={`Choose a theatre for ${group.unit}`}
                                className="rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">-- theatre --</option>
                                {theatreOptions.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                              <select
                                value={unitScrub[group.key] ?? ''}
                                onChange={(e) => setUnitScrub((p) => ({ ...p, [group.key]: e.target.value }))}
                                aria-label={`Scrub nurse for ${group.unit}`}
                                className="rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">-- scrub nurse --</option>
                                {scrubOptions.map((n) => (
                                  <option key={`s-${n.id}`} value={n.id}>{n.fullName}</option>
                                ))}
                              </select>
                              <select
                                value={unitCirc[group.key] ?? ''}
                                onChange={(e) => setUnitCirc((p) => ({ ...p, [group.key]: e.target.value }))}
                                aria-label={`Circulating nurse for ${group.unit}`}
                                className="rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">-- circulating nurse --</option>
                                {scrubOptions.map((n) => (
                                  <option key={`c-${n.id}`} value={n.id}>{n.fullName}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setTeamOpen((k) => (k === group.key ? null : group.key))}
                                className="rounded border border-slate-400 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                {teamOpen === group.key ? 'Hide team' : 'Assign team'}
                              </button>
                              <button
                                type="button"
                                onClick={() => assignUnitTheatre(group.key, group.unit, group.date)}
                                disabled={!unitChoice[group.key] || assigningKey === group.key}
                                className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
                              >
                                {assigningKey === group.key ? 'Assigning…' : 'Assign theatre & team'}
                              </button>
                            </span>
                          )}
                          {/* The anaesthetic team and technicians for the unit's
                              whole list. Behind a toggle: five categories of
                              multi-select on every unit heading would bury the
                              list this page exists to show. */}
                          {teamOpen === group.key && (
                            <div className="w-full">
                              <TheatreTeamAssigner
                                unit={group.unit}
                                date={group.date}
                                readFromSurgeryId={group.rows[0]?.id}
                              />
                            </div>
                          )}
                          {unitNote[group.key] && (
                            <span className="w-full text-xs font-medium normal-case text-gray-800">
                              {unitNote[group.key]}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((surgery, rowIndex) => (
                  <tr key={surgery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {surgery.patient?.name ? (
                          <ContactName type="patient" id={surgery.patient.id} name={surgery.patient.name} />
                        ) : (
                          'Unknown Patient'
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {surgery.patient?.folderNumber || 'N/A'}
                        {(surgery.patient?.age != null || surgery.patient?.gender) && (
                          <span className="ml-1 text-gray-400">
                            · {surgery.patient?.age ?? '?'}y {surgery.patient?.gender ?? ''}
                          </span>
                        )}
                      </div>
                      {surgery.patient?.ward && (
                        <div className="text-xs text-gray-500">Ward: {surgery.patient.ward}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{surgery.procedureName}</div>
                      {outstandingLabel(surgery.preopOutstanding?.split(',') ?? null) && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          {outstandingLabel(surgery.preopOutstanding?.split(',') ?? null)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">{surgery.subspecialty}</div>
                      {surgery.indication && (
                        <div className="text-xs text-gray-500">
                          <span className="font-medium text-gray-600">Indication:</span> {surgery.indication}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{surgery.unit || '—'}</div>
                      <div className="text-xs text-gray-500">
                        {surgery.theatreName || surgery.theatre?.name || (surgery.location || 'No theatre')}
                      </div>
                      {surgery.supervisingConsultantName && (
                        <div className="text-xs text-indigo-600 mt-0.5">
                          Consultant: {surgery.supervisingConsultantName}
                        </div>
                      )}
                      {/* An elective case with nobody rostered to its specialty
                          is not covered by the call team — it is unassigned, and
                          silence here is what let fifteen cases look staffed when
                          they were not. */}
                      {surgery.anaesthetist?.fullName ? (
                        <div className="text-xs text-gray-500 mt-0.5">
                          Anaesthetist: {surgery.anaesthetist.fullName}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 mt-0.5 font-medium">
                          Anaesthetist: not yet assigned
                        </div>
                      )}
                      {surgery.theatreTechnician?.fullName && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          Technician: {surgery.theatreTechnician.fullName}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {surgery.surgeon?.fullName ? (
                        <ContactName type="user" id={surgery.surgeon.id} name={surgery.surgeon.fullName} />
                      ) : surgery.surgeonName ? (
                        <ContactName type="user" name={surgery.surgeonName} />
                      ) : (
                        'Not assigned'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(surgery.scheduledDate)}
                      </div>
                      <div className="text-sm text-gray-500">{surgery.scheduledTime}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const late = bookingLateness({
                          scheduledDate: surgery.scheduledDate,
                          bookedAt: surgery.createdAt,
                          surgeryType: surgery.surgeryType,
                        });
                        return (
                          <>
                            <div className="text-sm text-gray-900">
                              {formatBookedAtShort(surgery.createdAt)}
                            </div>
                            {late.isLate && (
                              // title carries the reason, so the judgement can be
                              // checked rather than argued with.
                              <span
                                title={late.reason}
                                className="mt-1 inline-block rounded border-2 border-red-700 bg-red-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-800"
                              >
                                Late booking
                              </span>
                            )}

                            {/* Who booked it, and how to reach them.
                                A timestamp alone answers "when" and leaves
                                "who do I ask?" to be settled by walking round
                                the theatre. The role matters as much as the
                                name: chasing a consultant and chasing a
                                booking officer are different conversations. */}
                            {surgery.bookedBy?.name && (
                              <div className="mt-1 leading-tight">
                                <div className="text-xs font-medium text-gray-700">{surgery.bookedBy.name}</div>
                                {surgery.bookedBy.role && (
                                  <div className="text-[10px] uppercase tracking-wide text-gray-400">
                                    {surgery.bookedBy.role.replace(/_/g, ' ')}
                                  </div>
                                )}
                                {surgery.bookedBy.phone && (
                                  <div className="text-[11px]">
                                    <PhoneLink phone={surgery.bookedBy.phone} />
                                  </div>
                                )}

                                {/* Offered only when something is actually
                                    outstanding — a chase button on a complete
                                    case is a button that gets pressed by
                                    habit. */}
                                {surgery.preopOutstanding && surgery.bookedBy.phone && (() => {
                                  const url = bookerChaseWhatsAppUrl(surgery.bookedBy.phone, {
                                    patientName: surgery.patient?.name,
                                    folderNumber: surgery.patient?.folderNumber,
                                    procedureName: surgery.procedureName,
                                    scheduledDate: surgery.scheduledDate,
                                    scheduledTime: surgery.scheduledTime,
                                    theatreName: surgery.theatreName ?? undefined,
                                    outstanding: surgery.preopOutstanding,
                                    fromName: session?.user?.name ?? null,
                                  });
                                  if (!url) return null;
                                  return (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Send the booker a WhatsApp naming what is still outstanding"
                                      className="mt-1 inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-800 hover:bg-green-100"
                                    >
                                      <MessageCircle className="h-3 w-3" /> Chase on WhatsApp
                                    </a>
                                  );
                                })()}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const tags = summariseSpecialNeeds(surgery);
                        if (tags.length === 0) {
                          return <span className="text-xs text-gray-400 italic">None</span>;
                        }
                        return (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium border border-amber-200"
                              >
                                {t === 'Blood Tx' && <Droplet className="w-3 h-3 mr-1" />}
                                {t === 'Diathermy' && <ZapIcon className="w-3 h-3 mr-1" />}
                                {t}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(surgery.status)}`}>
                        {surgery.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* Reorder within the unit/theatre list (surgeon / nurse) */}
                        {canReorder && group.rows.length > 1 && surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <span className="inline-flex items-center">
                            <button
                              onClick={() => moveCase(group.rows, rowIndex, -1)}
                              disabled={rowIndex === 0 || reordering}
                              className="p-1 text-gray-500 hover:text-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move earlier in the list"
                              aria-label="Move case up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => moveCase(group.rows, rowIndex, 1)}
                              disabled={rowIndex === group.rows.length - 1 || reordering}
                              className="p-1 text-gray-500 hover:text-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move later in the list"
                              aria-label="Move case down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </span>
                        )}
                        {/* View Details - Always visible */}
                        <Link
                          href={`/dashboard/surgeries/${surgery.id}`}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 font-semibold"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>

                        {/* Medical Scribe safety check - Always visible */}
                        <Link
                          href={`/dashboard/surgeries/${surgery.id}/scribe`}
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 font-semibold"
                          title="Medical Scribe (Safety Check)"
                        >
                          <Stethoscope className="w-4 h-4" />
                          Scribe
                        </Link>

                        {/* Edit (re-schedule, change theatre/anaesthesia) - tracked in audit log */}
                        {surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/edit`}
                            className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800"
                            title="Edit case (date/time/location tracked)"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Change / assign theatre (perioperative nurse + admin) */}
                        {canReassignTheatre && surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <button
                            onClick={() => openReassign(surgery)}
                            className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800"
                            title="Change / assign theatre"
                          >
                            <Building2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Reschedule to another day (surgeon + admin) */}
                        {canReschedule && surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <button
                            onClick={() => openReschedule(surgery)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            title="Reschedule to another day"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}

                        {/* Withdraw a case booked more than once. Never offered
                            for a COMPLETED or in-progress case: that row is the
                            operation that actually took place, and among copies
                            of one booking it is the one that must survive. */}
                        {canMarkDuplicate
                          && surgery.status !== 'COMPLETED'
                          && surgery.status !== 'IN_PROGRESS'
                          && surgery.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleMarkDuplicate(surgery)}
                            disabled={duplicateId === surgery.id}
                            className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Withdraw as a duplicate booking"
                            aria-label="Withdraw as a duplicate booking"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}

                        {/* Mark Completed (surgeon closes the case → PACU can admit + post-op note) */}
                        {canCompleteSurgery && surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleMarkCompleted(surgery.id)}
                            disabled={completingId === surgery.id}
                            className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Mark surgery as completed"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}

                        {/* Receive in Theatre (en-route patient has arrived) */}
                        {canReceiveInTheatre &&
                          surgery.holdingAreaAssessment?.status === 'ENROUTE_TO_THEATRE' && (
                            <button
                              onClick={() => handleReceiveInTheatre(surgery.holdingAreaAssessment!.id)}
                              disabled={receivingId === surgery.holdingAreaAssessment.id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Receive this en-route patient in the theatre"
                            >
                              <CheckCircle className="w-4 h-4" />
                              {receivingId === surgery.holdingAreaAssessment.id ? 'Receiving…' : 'Receive in Theatre'}
                            </button>
                          )}

                        {/* Consent Form */}
                        {canAccessConsent && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/consent`}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900"
                            title="Surgical Consent Form"
                          >
                            <FileSignature className="w-4 h-4" />
                          </Link>
                        )}

                        {/* WHO Checklist */}
                        {canAccessWHOChecklist && (
                          <Link
                            href={`/dashboard/checklists/${surgery.id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900"
                            title="WHO Checklist"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Anesthesia Monitoring */}
                        {canAccessAnesthesia && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/anesthesia`}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-900"
                            title="Anesthesia Monitoring"
                          >
                            <Activity className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Surgical Count */}
                        {canAccessSurgicalCount && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/count`}
                            className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-900"
                            title="Surgical Count"
                          >
                            <Calculator className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Timing */}
                        {canAccessTiming && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/timing`}
                            className="inline-flex items-center gap-1 text-green-600 hover:text-green-900"
                            title="Surgical Timing"
                          >
                            <Clock className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Consumables */}
                        {canAccessConsumables && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/consumables`}
                            className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-900"
                            title="Track Consumables"
                          >
                            <Package className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Post-Op Prescription (after surgery) */}
                        {(surgery.status === 'COMPLETED' || surgery.status === 'IN_RECOVERY' || surgery.status === 'RECOVERY_COMPLETE') && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/post-op-prescription`}
                            className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-900"
                            title="Send post-op prescription to pharmacy"
                          >
                            <Pill className="w-4 h-4" />
                          </Link>
                        )}

                        {/* BOM */}
                        {canAccessBOM && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/bom`}
                            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                            title="Bill of Materials"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Change-theatre modal (periop nurse / admin) */}
      {reassignSurgery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                Change Theatre
              </h2>
              <button
                onClick={() => setReassignSurgery(null)}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600">
                <div className="font-medium text-gray-900">{reassignSurgery.patient?.name}</div>
                <div>{reassignSurgery.procedureName}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Currently:{' '}
                  {reassignSurgery.theatreName ||
                    reassignSurgery.theatre?.name ||
                    reassignSurgery.location ||
                    'Unassigned'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to theatre</label>
                <select
                  value={reassignTheatreId}
                  onChange={(e) => setReassignTheatreId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Unassigned</option>
                  {theatres.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.location ? ` — ${t.location}` : ''}
                    </option>
                  ))}
                </select>
                {theatres.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No theatres available to choose from.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button
                onClick={() => setReassignSurgery(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTheatre}
                disabled={savingTheatre}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingTheatre ? 'Saving…' : 'Save theatre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleSurgery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Reschedule Surgery
              </h2>
              <button
                onClick={() => setRescheduleSurgery(null)}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600">
                <div className="font-medium text-gray-900">{rescheduleSurgery.patient?.name}</div>
                <div>{rescheduleSurgery.procedureName}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Currently set for {(rescheduleSurgery.scheduledDate || '').slice(0, 10) || 'N/A'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New surgery date *</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="New surgery date"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rescheduling *</label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Why couldn't the surgery be done on the set day? (e.g. patient not optimised, theatre overran, equipment unavailable)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button
                onClick={() => setRescheduleSurgery(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={savingReschedule}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingReschedule ? 'Rescheduling…' : 'Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One team, its roles, and the number to ring.
 *
 * Two decisions worth keeping.
 *
 * The phone is a tel: link, because this card is read on a phone while walking
 * and a number you have to memorise and re-type is a number nobody rings.
 *
 * An unfilled role is SHOWN, greyed, rather than omitted. A card that silently
 * lists two of three anaesthetists reads as a complete team; one that says
 * "Registrar — not assigned" is the gap you can act on. That distinction is
 * the whole reason the anaesthetist source is carried through from the roster.
 */
function TeamGroup({
  label,
  members,
  note,
}: {
  label: string;
  members: Array<[string, { name: string; phone: string | null } | null]>;
  note?: string | null;
}) {
  const anyFilled = members.some(([, m]) => m);
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
        {note && <span className="ml-1 normal-case font-normal text-amber-700">· {note}</span>}
      </p>
      {!anyFilled ? (
        <p className="text-xs text-gray-400 italic">Not yet assigned</p>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {members.map(([role, m], i) => (
            // Keyed by position, not by role: a unit with two surgeons has two
            // rows both labelled "Surgeon", and a duplicate key drops one.
            <li key={`${role}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-gray-500 flex-shrink-0">{role}</span>
              {m ? (
                <span className="min-w-0 text-right">
                  <span className="text-gray-900 truncate">{m.name}</span>
                  {m.phone ? (
                    <a
                      href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-2 text-primary-600 hover:underline whitespace-nowrap"
                    >
                      {m.phone}
                    </a>
                  ) : (
                    <span className="ml-2 text-gray-400 whitespace-nowrap">no number</span>
                  )}
                </span>
              ) : (
                <span className="text-gray-400 italic">not assigned</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
