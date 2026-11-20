'use client';

// ============================================================
// Tentative cases — what a unit is planning, before it has a date
// ------------------------------------------------------------
// The screen a unit uses between deciding to operate and booking. A plan sits
// here with as much or as little as is known, optionally with the date the
// unit is aiming for, and becomes a real case when somebody confirms a date
// and presses Publish.
//
// PUBLISH CALLS THE ORDINARY BOOKING ROUTE. Not a special one. The case that
// appears on the surgery schedule is created by POST /api/surgeries with the
// draft's fields, so it is bundled, quoted, audited and refused on exactly the
// same terms as a booking typed in by hand. The draft is then marked, and that
// mark is the only thing this module's own API writes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import InlineRegister, { type RegisteredPatient } from '@/components/patients/InlineRegister';
import { CalendarDays, Plus, Send, Trash2, X, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import ProcedurePicker from '@/components/ProcedurePicker';
import { SUBSPECIALTIES } from '@/lib/procedures/catalogue';
import { isReadOnlyRole } from '@/lib/surgeryDrafts/access';

import {
  type ScheduleDraft,
  missingForPublish,
  overdueState,
  slippageNote,
  planChangeReasonProblem,
  newPlanDateProblem,
  publishDefaults,
  publishIdempotencyKey,
  publishPayload,
  validatePublishChoice,
  asDateInput,
} from '@/lib/surgeryDrafts/draft';

const MAGNITUDES = ['MAJOR', 'INTERMEDIATE', 'MINOR', 'SUPER_MAJOR'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH'];

// EVERY LIST THE BOOKING FORM OFFERS, OFFERED HERE IN THE SAME WORDS.
//
// This form was eleven free-text boxes, including one asking for a patient's
// UUID to be pasted in. Everything it collected had to be checked, corrected
// or re-chosen when the plan was published, because a typed unit name and a
// typed surgeon name do not resolve to the rows the booking route needs. The
// values below are the booking form's own, so what is planned is what is
// booked.
const SURGERY_TYPES = [
  { value: 'ELECTIVE', label: 'Elective' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

const ANAESTHESIA_TYPES = [
  { value: 'GENERAL', label: 'General Anaesthesia (GA)' },
  { value: 'SPINAL', label: 'Spinal' },
  { value: 'EPIDURAL', label: 'Epidural' },
  { value: 'COMBINED_SPINAL_EPIDURAL', label: 'Combined Spinal-Epidural (CSE)' },
  { value: 'REGIONAL', label: 'Regional / Block' },
  { value: 'SEDATION', label: 'Sedation / MAC' },
  { value: 'LOCAL', label: 'Local Anaesthesia' },
];

const POST_OP_DESTINATIONS = [
  { value: 'GENERAL_WARD', label: 'General Ward' },
  { value: 'ICU', label: 'Intensive Care Unit (ICU)' },
  { value: 'HDU', label: 'High Dependency Unit (HDU)' },
  { value: 'RECOVERY_THEN_WARD', label: 'Recovery, then Ward' },
  { value: 'DAY_CASE_DISCHARGE', label: 'Day-case discharge (home same day)' },
  { value: 'OTHER', label: 'Other' },
];

interface PatientOption {
  id: string;
  name: string;
  folderNumber: string | null;
  ptNumber: string | null;
  ward?: string | null;
}

interface SurgeonOption {
  id: string;
  fullName: string;
  role?: string | null;
}

interface UnitOption {
  id: string;
  name: string;
  subspecialty: string;
  location: string;
}

const emptyForm = {
  location: '',
  unit: '',
  subspecialty: '',
  patientId: '',
  patientName: '',
  patientFolderNumber: '',
  surgeonId: '',
  surgeonName: '',
  procedureName: '',
  indication: '',
  magnitude: '',
  surgeryType: 'ELECTIVE',
  anesthesiaType: '',
  estimatedDuration: '60',
  targetDate: '',
  preferredTime: '',
  priority: 'NORMAL',
  notes: '',

  // What the case will need. Asked here so the pharmacy and the pack
  // provider can act on the plan, and so publishing does not ask again.
  needBloodTransfusion: false,
  bloodUnits: '',
  needDiathermy: false,
  needStereo: false,
  needMontrellMattress: false,
  otherSpecialNeeds: '',
  isDayCase: false,
  postOpDestination: '',
};

export default function SurgeryDraftsPage() {
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  // The pharmacy, the pack provider and the store read this list so they can
  // begin preparing. The routes refuse their writes (lib/surgeryDrafts/
  // access.ts); this only stops the page offering what the server will
  // refuse, which is a kindness rather than a control.
  const readOnly = isReadOnlyRole((session?.user as { role?: string } | undefined)?.role);
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUnit, setFilterUnit] = useState('');
  const [filterStatus, setFilterStatus] = useState('DRAFT');
  const [showForm, setShowForm] = useState(false);
  // Which plan the form is editing, or null for a new one. A plan is a
  // fortnight-long intention that changes -- the date moves, the consultant
  // swaps, the patient finally gets a folder number -- and without this the
  // only way to change one was to delete it and retype it, which loses the
  // plan's history and everything the pharmacy had already read off it.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The plan whose missing details are being filled in before publishing.
  // Publish is never disabled now: a button that cannot be pressed teaches
  // nothing, and the person pressing it is the person who can supply what
  // is missing.
  const [completing, setCompleting] = useState<ScheduleDraft | null>(null);
  const [fill, setFill] = useState({
    patientId: '', patientName: '', patientFolderNumber: '',
    surgeonId: '', surgeonName: '', indication: '', procedureName: '',
  });
  const [fillError, setFillError] = useState('');
  const [registerInModal, setRegisterInModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  // The lists every dropdown is drawn from, loaded from the database once.
  // `unitRows` rather than `units`: the filter at the top of this page
  // already holds the unit NAMES that have something planned, which is a
  // different question from which units exist.
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [surgeons, setSurgeons] = useState<SurgeonOption[]>([]);
  const [unitRows, setUnitRows] = useState<UnitOption[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [surgeonSearch, setSurgeonSearch] = useState('');
  // A patient the unit is planning around who is not registered yet. The
  // whole point of a plan is that it can exist before the folder does, so
  // this stays — as a deliberate choice, not as the only option.
  const [unregistered, setUnregistered] = useState(false);

  // Which draft's Publish panel is open, and what date/time it is set to.
  const [publishing, setPublishing] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ date: string; time: string }>({ date: '', time: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterUnit) qs.set('unit', filterUnit);
      if (filterStatus) qs.set('status', filterStatus);
      const res = await fetch(`/api/surgery-drafts?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('could not load');
      const data = await res.json();
      setDrafts(data.drafts || []);
      setUnits(data.units || []);
    } catch {
      setNotice({ kind: 'bad', text: 'Could not load the planned cases.' });
    } finally {
      setLoading(false);
    }
  }, [filterUnit, filterStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') load();
  }, [authStatus, load]);

  /**
   * The lists behind the dropdowns.
   *
   * All four fail quietly and independently. A plan is worth holding even
   * when the staff list could not be reached, and a page that refused to open
   * because one lookup timed out would send the unit back to the notebook
   * this module exists to replace.
   */
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const get = async (url: string, take: (d: unknown) => void) => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) take(await r.json());
      } catch { /* the field falls back to what is typed */ }
    };
    void get('/api/patients?limit=200', (d) => {
      const list = Array.isArray(d) ? d : ((d as { patients?: unknown[] })?.patients ?? []);
      setPatients(list as PatientOption[]);
    });
    void get('/api/users?roles=SURGEON,CONSULTANT_SURGEON&status=APPROVED&slim=1', (d) => {
      const list = Array.isArray(d) ? d : ((d as { users?: unknown[] })?.users ?? []);
      setSurgeons((list as SurgeonOption[]).slice().sort(
        (a, b) => (a.fullName || '').localeCompare(b.fullName || ''),
      ));
    });
    void get('/api/surgical-units?activeOnly=true', (d) => {
      const list = Array.isArray(d) ? d : ((d as { units?: unknown[] })?.units ?? []);
      setUnitRows(list as UnitOption[]);
    });
    void get('/api/locations', (d) => {
      if (Array.isArray(d)) setLocations(d as string[]);
    });
  }, [authStatus]);

  /** Patients matching what has been typed, capped so the list stays usable. */
  const visiblePatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    return patients
      .filter((p) => !q
        || (p.name || '').toLowerCase().includes(q)
        || (p.folderNumber || '').toLowerCase().includes(q)
        || (p.ptNumber || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [patients, patientSearch]);

  const visibleSurgeons = useMemo(() => {
    const q = surgeonSearch.trim().toLowerCase();
    return surgeons.filter((x) => !q || (x.fullName || '').toLowerCase().includes(q)).slice(0, 50);
  }, [surgeons, surgeonSearch]);

  /** The units at the chosen site. No site chosen means all of them. */
  const visibleUnits = useMemo(
    () => unitRows.filter((u) => !form.location || u.location === form.location),
    [unitRows, form.location],
  );

  const save = async () => {
    if (!form.unit.trim() || !form.subspecialty.trim() || !form.procedureName.trim()) {
      setNotice({ kind: 'bad', text: 'A plan needs at least the unit, the subspecialty and the operation.' });
      return;
    }
    setSaving(true);
    try {
      // Editing an existing plan amends it in place rather than making a
      // second one. The PATCH route copies a whitelist of fields, so a plan
      // keeps its id, its creator and its place in the pharmacy's reading.
      const res = await fetch(
        editingId ? `/api/surgery-drafts/${editingId}` : '/api/surgery-drafts',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'could not save');
      }
      const amended = !!editingId;
      closeForm();
      setNotice({
        kind: 'ok',
        text: amended
          ? 'Plan updated. It is still not on any list until it is published.'
          : 'Plan saved. It is not on any list until it is published.',
      });
      load();
    } catch (e) {
      setNotice({ kind: 'bad', text: e instanceof Error ? e.message : 'Could not save the plan.' });
    } finally {
      setSaving(false);
    }
  };

  /** Open the form on an existing plan, filled in. */
  const openEdit = (d: ScheduleDraft) => {
    setEditingId(d.id);
    setForm({
      ...emptyForm,
      location: d.location ?? '',
      unit: d.unit ?? '',
      subspecialty: d.subspecialty ?? '',
      patientId: d.patientId ?? '',
      patientName: d.patientName ?? '',
      patientFolderNumber: d.patientFolderNumber ?? '',
      surgeonId: d.surgeonId ?? '',
      surgeonName: d.surgeonName ?? '',
      procedureName: d.procedureName ?? '',
      indication: d.indication ?? '',
      magnitude: d.magnitude ?? '',
      surgeryType: d.surgeryType ?? 'ELECTIVE',
      anesthesiaType: d.anesthesiaType ?? '',
      estimatedDuration: d.estimatedDuration != null ? String(d.estimatedDuration) : '60',
      targetDate: asDateInput(d.targetDate),
      preferredTime: d.preferredTime ?? '',
      priority: d.priority ?? 'NORMAL',
      notes: d.notes ?? '',
      needBloodTransfusion: !!d.needBloodTransfusion,
      bloodUnits: d.bloodUnits != null ? String(d.bloodUnits) : '',
      needDiathermy: !!d.needDiathermy,
      needStereo: !!d.needStereo,
      needMontrellMattress: !!d.needMontrellMattress,
      otherSpecialNeeds: d.otherSpecialNeeds ?? '',
      isDayCase: !!d.isDayCase,
      postOpDestination: d.postOpDestination ?? '',
    });
    // A plan written against a bare name opens with the name showing, so the
    // person who came back from registering the patient can see what they
    // typed a fortnight ago while they search for the folder.
    setUnregistered(!d.patientId && !!d.patientName);
    setPatientSearch(d.patientName ?? '');
    setSurgeonSearch('');
    setShowForm(true);
    setNotice(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setUnregistered(false);
    setPatientSearch('');
  };

  // COMING BACK FROM REGISTERING THE PATIENT.
  //
  // The blocker on a plan written against a bare name used to say "find them
  // in Patients, or register them" and stop there, so the unit left the page,
  // registered the patient, came back, scrolled for the plan, reopened it and
  // searched for the folder they had just created. Four of those five steps
  // are the app's to do.
  //
  // The registration form already carries a returnTo and appends the new
  // patientId to it, so the link out carries the plan's id and the journey
  // back lands on that plan with the patient attached and Publish lit.
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    if (returned || loading) return;
    const planId = searchParams?.get('plan');
    if (!planId) return;
    const d = drafts.find((x) => x.id === planId);
    if (!d) return;
    setReturned(true);
    openEdit(d);

    const newPatientId = searchParams?.get('patientId');
    if (!newPatientId) return;

    // Fetched by id rather than looked up in the dropdown list: that list is
    // capped at 200 and a patient registered a minute ago may not be in it.
    void (async () => {
      let name = '';
      let folder = '';
      try {
        const r = await fetch(`/api/patients/${newPatientId}`, { cache: 'no-store' });
        if (r.ok) {
          const pt = await r.json();
          name = pt?.name ?? '';
          folder = pt?.folderNumber || pt?.ptNumber || '';
        }
      } catch { /* the id is what matters; the name is a courtesy */ }
      setForm((prev) => ({
        ...prev,
        patientId: newPatientId,
        patientName: name || prev.patientName,
        patientFolderNumber: folder || prev.patientFolderNumber,
      }));
      setUnregistered(false);
      setPatientSearch(name);
      setNotice({
        kind: 'ok',
        text: `${name || 'The patient'} is registered and attached to this plan. Save it, and Publish is one click.`,
      });
    })();
    // openEdit is stable enough for this one-shot; `returned` guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, loading, drafts, searchParams]);

  /**
   * Publish was pressed on a plan that is not ready.
   *
   * It used to be disabled, with a tooltip saying "Something is still
   * missing" and an amber panel underneath listing what. That is two places
   * to read and nowhere to act: the person had to open Edit, find the four
   * fields among twenty, fill them, save, and press Publish again.
   *
   * Now the press opens exactly the fields that are missing, and nothing
   * else. Supply them and the case goes on the list in the same breath.
   */
  const openCompletion = (d: ScheduleDraft) => {
    setCompleting(d);
    setFillError('');
    setRegisterInModal(false);
    setPatientSearch(d.patientName ?? '');
    setSurgeonSearch('');
    setFill({
      patientId: d.patientId ?? '',
      patientName: d.patientName ?? '',
      patientFolderNumber: d.patientFolderNumber ?? '',
      surgeonId: d.surgeonId ?? '',
      surgeonName: d.surgeonName ?? '',
      indication: d.indication ?? '',
      procedureName: d.procedureName ?? '',
    });
  };

  /** Save what was filled in, then go straight on to choosing the date. */
  const saveCompletion = async () => {
    if (!completing) return;
    setBusy(true);
    setFillError('');
    try {
      const res = await fetch(`/api/surgery-drafts/${completing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fill),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFillError(saved.error || 'Could not save those details.');
        return;
      }
      const updated: ScheduleDraft = saved.draft ?? { ...completing, ...fill };

      // Still not ready? Say which, and stay put rather than opening a date
      // box for a case that cannot be booked.
      const stillMissing = missingForPublish(updated);
      if (stillMissing.length > 0) {
        setFillError(stillMissing.map((m) => m.say).join(' '));
        setCompleting(updated);
        await load();
        return;
      }

      setCompleting(null);
      await load();
      openPublish(updated);
    } catch {
      setFillError('A network error stopped this saving. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * A plan whose date has gone past: moved, or taken off the list, with the
   * reason recorded either way.
   */
  const resolveOverdue = async (
    d: ScheduleDraft,
    choice: { kind: 'MOVE'; date: string; reason: string } | { kind: 'DROP'; reason: string },
  ): Promise<string | null> => {
    const reasonProblem = planChangeReasonProblem(choice.reason);
    if (reasonProblem) return reasonProblem;
    if (choice.kind === 'MOVE') {
      const dateProblem = newPlanDateProblem(choice.date);
      if (dateProblem) return dateProblem;
    }

    setBusy(true);
    try {
      const body = choice.kind === 'MOVE'
        ? { targetDate: choice.date, changeReason: choice.reason }
        : { status: 'WITHDRAWN', changeReason: choice.reason };
      const res = await fetch(`/api/surgery-drafts/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        return e.error || 'Could not save that change.';
      }
      await load();
      setNotice({
        kind: 'ok',
        text: choice.kind === 'MOVE'
          ? 'Moved, and the reason recorded.'
          : 'Taken off the list, and the reason recorded.',
      });
      return null;
    } catch {
      return 'A network error stopped this saving. Nothing was changed.';
    } finally {
      setBusy(false);
    }
  };

  /**
   * A patient has just been registered (or an existing folder was chosen
   * instead of making a second one). Attach them and carry on planning.
   *
   * The checkbox comes OFF, because the answer to "not registered yet" is now
   * no. Leaving it ticked would keep a registered patient under a heading
   * that says they are not, and the next person to open the plan would
   * reasonably register them again.
   */
  const attachRegistered = (pt: RegisteredPatient) => {
    setUnregistered(false);
    setPatientSearch(pt.name);
    setForm((prev) => ({
      ...prev,
      patientId: pt.id,
      patientName: pt.name,
      patientFolderNumber: pt.folderNumber || pt.ptNumber || '',
    }));
    // Freshly registered patients are not in the list this page loaded on
    // mount, and the chooser reads from that list. Added here so the name
    // shows immediately rather than after a reload.
    setPatients((prev) => (prev.some((x) => x.id === pt.id)
      ? prev
      : [{ id: pt.id, name: pt.name, folderNumber: pt.folderNumber ?? null, ptNumber: pt.ptNumber ?? null }, ...prev]));
    setNotice({ kind: 'ok', text: `${pt.name} is registered and attached. Carry on with the plan.` });
  };

  const openPublish = (d: ScheduleDraft) => {
    const defaults = publishDefaults(d);
    setChoice({ date: defaults.date, time: defaults.time || '08:00' });
    setPublishing(d.id);
  };

  /**
   * Publish: book the case, then mark the plan.
   *
   * In that order, and with an idempotency key tied to the draft and the date,
   * so that a second press — or a retry after the network dropped between the
   * two calls — replays the same booking instead of putting the patient on the
   * list twice.
   */
  const publish = async (d: ScheduleDraft) => {
    const problem = validatePublishChoice({ scheduledDate: choice.date, scheduledTime: choice.time });
    if (problem) {
      setNotice({ kind: 'bad', text: problem });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/surgeries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': publishIdempotencyKey(d.id, choice.date),
        },
        body: JSON.stringify(
          publishPayload(d, { scheduledDate: choice.date, scheduledTime: choice.time }),
        ),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The booking route's own words. It knows why it refused — a cut-off,
        // a clash, a patient that is not there — and anything written here
        // instead would be a worse answer arriving first.
        throw new Error(created.error || 'The case could not be booked.');
      }

      await fetch(`/api/surgery-drafts/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PUBLISHED',
          publishedSurgeryId: created.id,
          publishedForDate: choice.date,
        }),
      });

      setPublishing(null);
      setNotice({
        kind: 'ok',
        text: `Booked for ${choice.date} at ${choice.time}. It is now on the surgery schedule for that date.`,
      });
      load();
    } catch (e) {
      setNotice({ kind: 'bad', text: e instanceof Error ? e.message : 'Could not publish.' });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (d: ScheduleDraft) => {
    setBusy(true);
    try {
      await fetch(`/api/surgery-drafts/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'WITHDRAWN' }),
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: ScheduleDraft) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/surgery-drafts/${d.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setNotice({ kind: 'bad', text: e.error || 'Could not remove that plan.' });
      }
      load();
    } finally {
      setBusy(false);
    }
  };

  // BY UNIT, because a unit is who acts on a plan.
  //
  // These were grouped by whether somebody had guessed a date, which answers
  // a question nobody asks: "with a tentative date" mixed four units' cases
  // into one column, so a consultant looking for their own list read every
  // card on the page to find three of them, and the pharmacy reading the same
  // page could not tell whose preparation was whose.
  //
  // Within a unit the order still has the date in it -- dated cases first and
  // soonest first, then the undated -- so the ordering that was being used as
  // a grouping survives as what it actually was.
  const byUnit = useMemo(() => {
    const map = new Map<string, ScheduleDraft[]>();
    for (const d of drafts) {
      const key = (d.unit || '').trim() || 'No unit named';
      const list = map.get(key);
      if (list) list.push(d);
      else map.set(key, [d]);
    }

    const time = (v: string | Date | null | undefined) => {
      if (!v) return Number.POSITIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };

    return Array.from(map.entries())
      .map(([unit, list]) => {
        const cases = list.slice().sort((a, b) => {
          const d = time(a.targetDate) - time(b.targetDate);
          if (d !== 0) return d;
          // Then the ones that cannot be published yet, so the work the unit
          // still has to do is at the top of its own card rather than buried
          // under the cases that are ready.
          const am = missingForPublish(a).length > 0 ? 0 : 1;
          const bm = missingForPublish(b).length > 0 ? 0 : 1;
          if (am !== bm) return am - bm;
          return (a.procedureName || '').localeCompare(b.procedureName || '');
        });
        return {
          unit,
          cases,
          ready: cases.filter((c) => c.status === 'DRAFT' && missingForPublish(c).length === 0).length,
          blocked: cases.filter((c) => c.status === 'DRAFT' && missingForPublish(c).length > 0).length,
          dated: cases.filter((c) => c.targetDate).length,
        };
      })
      // Busiest unit first. A unit with eleven planned cases has more to look
      // at than one with a single case, and alphabetical order would put the
      // single case above it every time.
      .sort((a, b) => b.cases.length - a.cases.length || a.unit.localeCompare(b.unit));
  }, [drafts]);

  if (authStatus === 'loading') return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-blue-600" />
            Planned cases
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            What your unit intends to operate, before it is booked. Nothing here holds a theatre or
            a pack until you publish it.
          </p>
        </div>
        {!readOnly && (
          <button
            // Always a BLANK form. Toggling the old way would reopen whatever
            // plan was last being edited under a button that says New.
            onClick={() => (showForm ? closeForm() : (setEditingId(null), setForm({ ...emptyForm }), setShowForm(true)))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New plan
          </button>
        )}
      </div>

      {/*
        Said rather than left to be inferred from a missing button. Somebody
        given a screen deliberately should be told what it is for, or the
        absence of the controls reads as a fault.
      */}
      {readOnly && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
          <Eye className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Every planned case across all units, so you can order and pack ahead of the
            booking. Plans are written by the unit that owns the case; you cannot change
            them here.
          </span>
        </div>
      )}

      {notice && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
            notice.kind === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">A case the unit is planning</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/*
              WHOSE LIST IT IS. Site first, because the unit list is filtered
              by it — the same order the booking form asks in, for the same
              reason: a unit name typed by hand does not resolve to the row
              the booking route needs, so it had to be re-chosen at publish.
            */}
            <Choice
              label="Site"
              value={form.location}
              onChange={(v) => setForm({ ...form, location: v, unit: '', subspecialty: '' })}
              placeholder="All sites"
              options={locations.map((l) => ({ value: l, label: l }))}
            />
            <Choice
              label="Unit *"
              value={form.unit}
              onChange={(v) => {
                const u = unitRows.find((x) => x.name === v);
                setForm({
                  ...form,
                  unit: v,
                  // The unit decides the subspecialty, as it does at booking.
                  subspecialty: u ? u.subspecialty : form.subspecialty,
                  location: form.location || (u ? u.location : ''),
                });
              }}
              placeholder={unitRows.length ? 'Choose the unit' : 'Unit list unavailable'}
              options={visibleUnits.map((u) => ({ value: u.name, label: `${u.name} · ${u.subspecialty}` }))}
            />
            <Choice
              label="Subspecialty *"
              value={form.subspecialty}
              onChange={(v) => setForm({ ...form, subspecialty: v })}
              placeholder="Choose the subspecialty"
              options={SUBSPECIALTIES.map((x) => ({ value: x, label: x }))}
            />
            <Choice
              label="Surgeon"
              value={form.surgeonId}
              onChange={(v) => {
                const x = surgeons.find((y) => y.id === v);
                setForm({ ...form, surgeonId: v, surgeonName: x ? x.fullName : '' });
              }}
              placeholder={surgeons.length ? 'Choose the surgeon' : 'Staff list unavailable'}
              search={surgeonSearch}
              onSearch={setSurgeonSearch}
              options={visibleSurgeons.map((x) => ({ value: x.id, label: x.fullName }))}
            />
          </div>

          {/*
            THE PATIENT. This asked for a UUID to be pasted into a text box
            labelled "Patient ID (from Patients)" — which nobody has, so no
            plan ever carried one, and every plan was therefore short of the
            one thing publishing insists on.
          */}
          <div className="mt-3 rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-900">Patient</span>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={unregistered}
                  onChange={(e) => {
                    setUnregistered(e.target.checked);
                    // Switching away from a chosen patient clears the id, so a
                    // plan cannot carry one person's folder under another
                    // person's typed name.
                    setForm((prev) => ({
                      ...prev, patientId: '', patientName: '', patientFolderNumber: '',
                    }));
                  }}
                />
                Not registered yet
              </label>
            </div>

            {unregistered ? (
              <>
                {/* WHAT THE UNIT KNOWS, AND THEN THE REGISTRATION ITSELF.

                    These two boxes used to be the whole of it, under a sentence
                    saying "register them before publishing, then choose them
                    here". So the unit typed a name, saved a plan that could not
                    be booked, went to Patients, registered, came back, found the
                    plan, opened it, and searched for the folder it had just
                    made. Six steps, five of which the app could do.

                    They are kept, because a plan written against a name alone is
                    still a legitimate plan -- a unit may be planning around
                    somebody who is not in the hospital yet, and that was the
                    reason this checkbox exists. The registration below is
                    offered, not demanded. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Patient name" value={form.patientName} onChange={(v) => setForm({ ...form, patientName: v })} placeholder="As the unit knows them" />
                  <Field label="Folder or PT number" value={form.patientFolderNumber} onChange={(v) => setForm({ ...form, patientFolderNumber: v })} placeholder="If there is one" />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  The plan is held either way. A case cannot be booked against a name
                  alone, so register them here and the plan is ready to publish.
                </p>

                <div className="mt-3">
                  <InlineRegister
                    initialName={form.patientName}
                    initialNumber={form.patientFolderNumber}
                    onRegistered={attachRegistered}
                  />
                </div>
              </>
            ) : (
              <Choice
                label="Registered patient"
                value={form.patientId}
                onChange={(v) => {
                  const pt = patients.find((x) => x.id === v);
                  setForm({
                    ...form,
                    patientId: v,
                    patientName: pt ? pt.name : '',
                    patientFolderNumber: pt ? (pt.folderNumber || pt.ptNumber || '') : '',
                  });
                }}
                placeholder={patients.length ? 'Search, then choose' : 'Patient list unavailable'}
                search={patientSearch}
                onSearch={setPatientSearch}
                options={visiblePatients.map((pt) => ({
                  value: pt.id,
                  label: `${pt.name} · ${pt.folderNumber || pt.ptNumber || 'no number'}${pt.ward ? ` · ${pt.ward}` : ''}`,
                }))}
              />
            )}
          </div>

          {/* THE OPERATION, from the procedure catalogue the booking form uses. */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Operation *</label>
              <ProcedurePicker
                subspecialty={form.subspecialty || null}
                value={form.procedureName}
                onChange={(v) => setForm((prev) => ({ ...prev, procedureName: v }))}
              />
            </div>
            <Field label="Indication" value={form.indication} onChange={(v) => setForm({ ...form, indication: v })} placeholder="The clinical reason for operating" />
            <Choice
              label="Magnitude"
              value={form.magnitude}
              onChange={(v) => setForm({ ...form, magnitude: v })}
              placeholder="Not decided"
              options={MAGNITUDES.map((m) => ({ value: m, label: m.replace(/_/g, ' ') }))}
            />
            <Choice
              label="Kind of case"
              value={form.surgeryType}
              onChange={(v) => setForm({ ...form, surgeryType: v })}
              options={SURGERY_TYPES}
            />
            <Choice
              label="Proposed anaesthesia"
              value={form.anesthesiaType}
              onChange={(v) => setForm({ ...form, anesthesiaType: v })}
              placeholder="Not decided"
              options={ANAESTHESIA_TYPES}
            />
            <Choice
              label="Priority"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={PRIORITIES.map((x) => ({ value: x, label: x }))}
            />
            <Field label="Tentative date" type="date" value={form.targetDate} onChange={(v) => setForm({ ...form, targetDate: v })} />
            <Field label="Preferred start" type="time" value={form.preferredTime} onChange={(v) => setForm({ ...form, preferredTime: v })} />
            <Field label="Expected minutes" type="number" value={form.estimatedDuration} onChange={(v) => setForm({ ...form, estimatedDuration: v })} />
          </div>

          {/*
            WHAT THE CASE WILL NEED. The reason the pharmacy and the pack
            provider can see this screen at all: a plan that does not say what
            it needs tells them only that an operation is coming. Stated here,
            a fortnight out, and carried into the booking rather than asked
            again at the moment somebody is trying to get a case onto a list.
          */}
          <div className="mt-3 rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">What this case will need</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Tick label="Blood transfusion" checked={form.needBloodTransfusion} onChange={(v) => setForm({ ...form, needBloodTransfusion: v })} />
                {/* How many, not merely whether. The pack a plan implies cannot be
                    worked out from a tick: one unit needs a giving set, two or more
                    need the cover for what two or more units do to a patient. */}
                {form.needBloodTransfusion && (
                  <div className="mt-1 ml-6 flex items-center gap-2">
                    <label className="text-xs text-gray-600" htmlFor="draft-blood-units">Units</label>
                    <input
                      id="draft-blood-units"
                      type="number"
                      min="1"
                      max="20"
                      value={form.bloodUnits}
                      onChange={(e) => setForm({ ...form, bloodUnits: e.target.value })}
                      placeholder="2"
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                )}
              </div>
              <Tick label="Diathermy" checked={form.needDiathermy} onChange={(v) => setForm({ ...form, needDiathermy: v })} />
              <Tick label="Stereo / microscope" checked={form.needStereo} onChange={(v) => setForm({ ...form, needStereo: v })} />
              <Tick label="Montrell mattress" checked={form.needMontrellMattress} onChange={(v) => setForm({ ...form, needMontrellMattress: v })} />
            </div>
            <div className="mt-2">
              <Field
                label="Anything else to have ready"
                value={form.otherSpecialNeeds}
                onChange={(v) => setForm({ ...form, otherSpecialNeeds: v })}
                placeholder="Instruments, implants, a particular consumable"
              />
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Choice
                label="After theatre"
                value={form.postOpDestination}
                onChange={(v) => setForm({ ...form, postOpDestination: v })}
                placeholder="Not decided"
                options={POST_OP_DESTINATIONS}
              />
              <div className="flex items-end pb-2">
                <Tick
                  label="Going home the same day (day case)"
                  checked={form.isDayCase}
                  onChange={(v) => setForm({
                    ...form,
                    isDayCase: v,
                    // Offered, not forced: a day case can still be planned to
                    // recovery-then-ward, and overwriting a chosen
                    // destination would silently contradict the booker.
                    postOpDestination: v && !form.postOpDestination
                      ? 'DAY_CASE_DISCHARGE'
                      : form.postOpDestination,
                  })}
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Anything the theatre should know when this is booked"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            The tentative date is optional, and it is only a plan — you choose the real date when you publish.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save plan'}
            </button>
            <button onClick={closeForm} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="DRAFT">Still planned</option>
          <option value="PUBLISHED">Published</option>
          <option value="WITHDRAWN">Withdrawn</option>
          <option value="">All</option>
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="font-medium">Nothing planned here yet.</p>
          <p className="text-sm mt-1">Add a case your unit intends to do, with or without a date.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {byUnit.map((g) => (
            <UnitCard key={g.unit} unit={g.unit} total={g.cases.length} ready={g.ready} blocked={g.blocked}>
              {g.cases.map((d) => (
                <DraftCard
                  key={d.id} d={d} busy={busy} readOnly={readOnly}
                  publishing={publishing === d.id} choice={choice} setChoice={setChoice}
                  onOpenPublish={() => openPublish(d)} onCancelPublish={() => setPublishing(null)}
                  onPublish={() => publish(d)} onWithdraw={() => withdraw(d)} onRemove={() => remove(d)}
                  onEdit={() => openEdit(d)}
                  onComplete={() => openCompletion(d)}
                  onResolveOverdue={(c) => resolveOverdue(d, c)}
                />
              ))}
            </UnitCard>
          ))}
        </div>
      )}

      {/* WHAT PUBLISH ASKS FOR WHEN THE PLAN IS NOT READY.

          Only the fields that are actually missing. The whole fault being
          fixed is that the person had to go and find four fields among
          twenty in the edit form, so showing them all again here would be
          the same fault in a smaller window. */}
      {completing && (() => {
        const want = new Set(missingForPublish(completing).map((m) => m.field));
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl mt-10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Before this goes on a list</h2>
                  <p className="text-sm text-gray-600">
                    {completing.procedureName || 'This case'} needs a little more before it can be booked.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCompleting(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {want.has('patientId') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Patient <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Search by name, folder or PT number"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={fill.patientId}
                      onChange={(e) => {
                        const pt = patients.find((x) => x.id === e.target.value);
                        setFill({
                          ...fill,
                          patientId: e.target.value,
                          patientName: pt?.name ?? fill.patientName,
                          patientFolderNumber: pt?.folderNumber || pt?.ptNumber || '',
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      aria-label="Patient"
                    >
                      <option value="">Choose the folder…</option>
                      {visiblePatients.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}{pt.folderNumber ? ` · ${pt.folderNumber}` : ''}{pt.ptNumber ? ` · ${pt.ptNumber}` : ''}
                        </option>
                      ))}
                    </select>
                    {/* The way out when the folder does not exist yet. Carries
                        this plan's id, so registering ends back on it. */}
                    {/* Registered right here, for the same reason the plan form
                        does it: sending somebody away mid-publish to come back
                        and find their own plan is five steps the app can take. */}
                    {!registerInModal ? (
                      <p className="mt-1 text-xs text-gray-600">
                        Not registered yet?{' '}
                        <button
                          type="button"
                          onClick={() => setRegisterInModal(true)}
                          className="font-semibold text-blue-700 underline"
                        >
                          Register them now
                        </button>
                      </p>
                    ) : (
                      <div className="mt-2">
                        <InlineRegister
                          initialName={completing.patientName ?? ''}
                          initialNumber={completing.patientFolderNumber ?? ''}
                          onCancel={() => setRegisterInModal(false)}
                          onRegistered={(pt) => {
                            setRegisterInModal(false);
                            attachRegistered(pt);
                            setFill((prev) => ({
                              ...prev,
                              patientId: pt.id,
                              patientName: pt.name,
                              patientFolderNumber: pt.folderNumber || pt.ptNumber || '',
                            }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {want.has('surgeonName') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Surgeon <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={surgeonSearch}
                      onChange={(e) => setSurgeonSearch(e.target.value)}
                      placeholder="Search by name"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={fill.surgeonId}
                      onChange={(e) => {
                        const sg = surgeons.find((x) => x.id === e.target.value);
                        setFill({
                          ...fill,
                          surgeonId: e.target.value,
                          surgeonName: sg?.fullName ?? fill.surgeonName,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      aria-label="Surgeon"
                    >
                      <option value="">Choose a surgeon…</option>
                      {visibleSurgeons.map((sg) => (
                        <option key={sg.id} value={sg.id}>{sg.fullName}</option>
                      ))}
                    </select>
                    {/* A visiting surgeon has no account here and still operates. */}
                    <input
                      type="text"
                      value={fill.surgeonName}
                      onChange={(e) => setFill({ ...fill, surgeonName: e.target.value, surgeonId: '' })}
                      placeholder="or type the name"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      aria-label="Surgeon name"
                    />
                  </div>
                )}

                {want.has('procedureName') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Operation <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={fill.procedureName}
                      onChange={(e) => setFill({ ...fill, procedureName: e.target.value })}
                      placeholder="What is being done"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {want.has('indication') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Indication <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={fill.indication}
                      onChange={(e) => setFill({ ...fill, indication: e.target.value })}
                      placeholder="The clinical reason for operating"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              {fillError && (
                <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                  {fillError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveCompletion}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save and choose the date'}
                </button>
                <button
                  type="button"
                  onClick={() => setCompleting(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * One unit's planned cases, with the count that unit actually cares about.
 *
 * The counts are on the header rather than inside, because the reader who
 * most needs them is scrolling past: a theatre manager wants to know which
 * unit has four cases stuck behind an unregistered patient without opening
 * four cards to find out.
 */

/**
 * A plan whose date has gone past, asking what happened.
 *
 * Three answers, and the third is the Publish button already on the card: the
 * case may simply have been done and not yet put on a list. So this offers the
 * two that are NOT already offered, and says the third out loud rather than
 * leaving somebody to work out that publishing is still available.
 *
 * A REASON IS REQUIRED for both. The whole value of asking is the answer: a
 * date that moves with no reason recorded is the state this exists to end,
 * where the list says next Thursday and nobody can tell whether that is a
 * decision or a drift.
 */
function OverduePanel({
  d, daysPast, busy, onResolve,
}: {
  d: ScheduleDraft;
  daysPast: number;
  busy: boolean;
  onResolve: (
    choice: { kind: 'MOVE'; date: string; reason: string } | { kind: 'DROP'; reason: string },
  ) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<'none' | 'MOVE' | 'DROP'>('none');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');

  const submit = async () => {
    const result = mode === 'MOVE'
      ? await onResolve({ kind: 'MOVE', date, reason })
      : await onResolve({ kind: 'DROP', reason });
    if (result) setProblem(result);
    // On success the list reloads and this card is replaced, so there is
    // nothing to reset.
  };

  return (
    <div className="mt-3 rounded-lg border-2 border-orange-300 bg-orange-50 p-3">
      <p className="text-xs font-semibold text-orange-900">
        This was planned for {asDateInput(d.targetDate)}, {daysPast} day{daysPast === 1 ? '' : 's'} ago.
      </p>
      <p className="mt-1 text-xs text-orange-800">
        It is still counted as planned by this unit and by the pharmacy reading ahead.
        If it was done, use Publish above to put it on the list for the day it happened.
      </p>

      {mode === 'none' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setMode('MOVE'); setProblem(''); }}
            className="px-3 py-1.5 rounded-lg border border-orange-400 bg-white text-xs font-medium text-orange-900"
          >
            Move to a new date
          </button>
          <button
            type="button"
            onClick={() => { setMode('DROP'); setProblem(''); }}
            className="px-3 py-1.5 rounded-lg border border-orange-400 bg-white text-xs font-medium text-orange-900"
          >
            Take it off the list
          </button>
        </div>
      )}

      {mode !== 'none' && (
        <div className="mt-2 space-y-2">
          {mode === 'MOVE' && (
            <div>
              <label className="block text-xs font-medium text-orange-900 mb-1" htmlFor={`newdate-${d.id}`}>
                New planned date
              </label>
              <input
                id={`newdate-${d.id}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-orange-900 mb-1" htmlFor={`reason-${d.id}`}>
              {mode === 'MOVE' ? 'Why is it moving?' : 'Why is it coming off?'}
            </label>
            <input
              id={`reason-${d.id}`}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === 'MOVE'
                ? 'e.g. patient not optimised, theatre list full'
                : 'e.g. operated elsewhere, patient declined'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {problem && <p className="text-xs font-semibold text-red-700">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {mode === 'MOVE' ? 'Move it' : 'Take it off'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('none'); setProblem(''); }}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function UnitCard({
  unit, total, ready, blocked, children,
}: {
  unit: string; total: number; ready: number; blocked: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/60 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <h2 className="font-semibold text-gray-900">{unit}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-700">
            {total} planned
          </span>
          {ready > 0 && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-800">
              {ready} ready to publish
            </span>
          )}
          {blocked > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800">
              {blocked} still needs something
            </span>
          )}
        </div>
      </header>
      <div className="space-y-3 p-3 sm:p-4">{children}</div>
    </section>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

/**
 * A dropdown over something the database knows about.
 *
 * value and label are separate because half of these choose a ROW — a
 * patient, a surgeon — and send its id while showing a name. The old helper
 * took a list of strings, which is why the patient was a box asking for a
 * UUID to be pasted in.
 *
 * WITH AN OPTIONAL SEARCH BOX. There are several hundred patients and a
 * couple of hundred surgeons, and a dropdown of that length is unusable on a
 * handset. Where `onSearch` is given, what is typed narrows the list; the
 * caller does the narrowing, because it also decides how many to show.
 *
 * A DROPDOWN THAT CANNOT BE FILLED SAYS SO. When the lookup failed there are
 * no options, and the placeholder says why rather than presenting an empty
 * list that reads as "there are none".
 */
function Choice({
  label, value, onChange, options, placeholder, search, onSearch,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  search?: string;
  onSearch?: (v: string) => void;
}) {
  // The chosen row may be outside the narrowed list — somebody chooses a
  // patient and then types a different name into the search. Keeping it as an
  // option stops the select falling back to blank and silently unchoosing
  // them.
  const chosenMissing = value !== '' && !options.some((o) => o.value === value);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {onSearch && (
        <input
          type="text"
          value={search ?? ''}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-1"
          autoComplete="off"
        />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">{placeholder ?? '—'}</option>
        {chosenMissing && <option value={value}>(chosen)</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** A yes/no the theatre acts on. The label is the whole control. */
function Tick({
  label, checked, onChange,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300"
      />
      {label}
    </label>
  );
}

function DraftCard({
  d, busy, readOnly, publishing, choice, setChoice,
  onOpenPublish, onCancelPublish, onPublish, onWithdraw, onRemove, onEdit, onComplete, onResolveOverdue,
}: {
  d: ScheduleDraft; busy: boolean; readOnly: boolean; publishing: boolean;
  choice: { date: string; time: string };
  setChoice: (c: { date: string; time: string }) => void;
  onOpenPublish: () => void; onCancelPublish: () => void;
  onPublish: () => void; onWithdraw: () => void; onRemove: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onResolveOverdue: (
    choice: { kind: 'MOVE'; date: string; reason: string } | { kind: 'DROP'; reason: string },
  ) => Promise<string | null>;
}) {
  const missing = missingForPublish(d);
  const overdue = overdueState(d);
  const slipped = slippageNote(d);
  const isDraft = d.status === 'DRAFT';
  const canAct = isDraft && !readOnly;

  // What the unit said to have ready. Shown on the card rather than behind an
  // edit, because the reader who most needs it is the one who cannot edit it:
  // the pharmacy and the pack provider see this list in order to order
  // against it, and a plan whose requirements are one click away is a plan
  // whose requirements are read the day before.
  const needs: string[] = [];
  if (d.needBloodTransfusion) needs.push(d.bloodUnits ? `blood × ${d.bloodUnits}` : 'blood');
  if (d.needDiathermy) needs.push('diathermy');
  if (d.needStereo) needs.push('stereo');
  if (d.needMontrellMattress) needs.push('Montrell mattress');
  if (d.otherSpecialNeeds) needs.push(d.otherSpecialNeeds);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{d.procedureName}</span>
            {d.priority === 'HIGH' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">High priority</span>
            )}
            {d.status === 'PUBLISHED' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                On the list{d.publishedForDate ? ` · ${asDateInput(d.publishedForDate)}` : ''}
              </span>
            )}
            {d.status === 'WITHDRAWN' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Withdrawn</span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">
            {d.patientName || d.patientId || 'No patient named'}
            {d.patientFolderNumber ? ` · ${d.patientFolderNumber}` : ''}
            {d.surgeonName ? ` · ${d.surgeonName}` : ''}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {d.unit} · {d.subspecialty}
            {d.targetDate ? ` · aiming for ${asDateInput(d.targetDate)}` : ''}
            {d.preferredTime ? ` at ${d.preferredTime}` : ''}
            {/* A case moved once is an ordinary reschedule. A case moved four
                times is a different thing, and the only place that showed was
                in somebody's memory. */}
            {slipped ? ` · ${slipped}` : ''}
          </p>
          {d.lastChangeReason && (
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-medium">
                {d.lastChangeKind === 'WITHDRAWN' ? 'Taken off:' : 'Moved:'}
              </span>{' '}
              {d.lastChangeReason}
              {d.lastChangeByName ? ` — ${d.lastChangeByName}` : ''}
            </p>
          )}
          {(needs.length > 0 || d.isDayCase || d.anesthesiaType) && (
            <p className="text-xs text-gray-700 mt-1">
              <span className="font-medium">Needs:</span>{' '}
              {[
                d.anesthesiaType ? d.anesthesiaType.replace(/_/g, ' ').toLowerCase() : null,
                ...needs,
                d.isDayCase ? 'day case' : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {d.notes && <p className="text-xs text-gray-500 mt-1 italic">{d.notes}</p>}
        </div>

        {canAct && (
          <div className="flex gap-2 shrink-0">
            {/* NEVER DISABLED.

                It was greyed out whenever anything was missing, with a tooltip
                saying "Something is still missing" and a panel underneath
                listing what. That is two places to read and nowhere to act: the
                person had to open Edit, find four fields among twenty, fill
                them, save, and come back. A button that cannot be pressed
                teaches nothing, and the person pressing it is exactly the
                person who can supply what is missing. */}
            <button
              onClick={missing.length ? onComplete : onOpenPublish}
              disabled={busy}
              title={missing.length
                ? 'Fill in what is missing and put it on the list'
                : 'Choose a date and put it on the list'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" /> Publish
            </button>
            <button onClick={onEdit} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">
              Edit
            </button>
            <button onClick={onWithdraw} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">
              Withdraw
            </button>
            <button onClick={onRemove} disabled={busy} className="p-1.5 rounded-lg border border-gray-300 text-gray-500" aria-label="Remove">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* THE DATE HAS GONE PAST.

          A plan behind its date looks exactly like one that is still true, so
          it aged on the list being counted as "planned" by the unit card and
          by the pharmacy reading ahead. Overdue is a QUESTION, not a verdict:
          the case may have been done and not yet published, it may be moving
          to next week, or it may be off. All three are ordinary. What is not
          ordinary is leaving it unanswered. */}
      {canAct && overdue.overdue && <OverduePanel d={d} daysPast={overdue.daysPast} busy={busy} onResolve={onResolveOverdue} />}

      {canAct && missing.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">
            Still needed before this can go on a list
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc pl-4">
            {missing.map((m) => (
              <li key={m.field}>
                {m.say}
                {/* THE WAY OUT, NOT JUST THE PROBLEM.
                    This said "find them in Patients, or register them" and
                    stopped, so the unit left the page, registered the patient,
                    came back, scrolled for the plan, reopened it and searched for
                    the folder they had just created. The link carries this plan's
                    id, and the registration form hands back the new patient id,
                    so the journey ends on this plan with the patient attached. */}
                {m.field === 'patientId' && (
                  <span className="block mt-1 space-x-3">
                    <a
                      href={`/dashboard/patients/new?returnTo=${encodeURIComponent(`/dashboard/surgery-drafts?plan=${d.id}`)}`}
                      className="font-semibold text-amber-900 underline"
                    >
                      Register this patient
                    </a>
                    <button
                      type="button"
                      onClick={onEdit}
                      className="font-semibold text-amber-900 underline"
                    >
                      Attach an existing folder
                    </button>
                  </span>
                )}
                {m.field !== 'patientId' && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="ml-2 font-semibold text-amber-900 underline"
                  >
                    Fix it
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            The plan is kept either way — this only stops it becoming a booked case.
          </p>
        </div>
      )}

      {publishing && (
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs font-semibold text-blue-900 mb-2">
            Which date is it actually being done?
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-blue-900 mb-1">Date</label>
              <input
                type="date"
                value={choice.date}
                onChange={(e) => setChoice({ ...choice, date: e.target.value })}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-blue-900 mb-1">Start</label>
              <input
                type="time"
                value={choice.time}
                onChange={(e) => setChoice({ ...choice, time: e.target.value })}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={onPublish}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Booking…' : 'Publish to the schedule'}
            </button>
            <button onClick={onCancelPublish} className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
              Cancel
            </button>
          </div>
          {d.targetDate && (
            <p className="text-xs text-blue-700 mt-2">
              Filled in from the date your unit was aiming for. Change it if the plan has moved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
