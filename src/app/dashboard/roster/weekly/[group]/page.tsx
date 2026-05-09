'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Save, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';

// ---------- Group configuration ----------
type Shift = 'MORNING' | 'CALL' | 'NIGHT';
type Location = 'MAIN_THEATRE' | 'A_AND_E' | 'EYE_THEATRE' | 'CTU_THEATRE';

const LOCATION_LABELS: Record<Location, string> = {
  MAIN_THEATRE: 'Main Theatre Complex',
  A_AND_E: 'Accident & Emergency Theatre',
  EYE_THEATRE: 'Eye Theatre',
  CTU_THEATRE: 'CTU Theatre',
};

const ALL_LOCATIONS: Location[] = ['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE'];

interface GroupConfig {
  slug: string;
  title: string;
  category: 'NURSES' | 'ANAESTHETISTS' | 'PORTERS' | 'CLEANERS' | 'ANAESTHETIC_TECHNICIANS' | 'PHARMACISTS' | 'RECOVERY_NURSES';
  shifts: Shift[];
  locations: Location[];
  seniorityLevels?: string[]; // anaesthetists only
  subRoles?: string[];        // nurses
  policy: string;
  /** UserRole values to query when populating the staff dropdown */
  userRoles: string[];
}

interface DirectoryUser {
  id: string;
  fullName: string;
  username: string;
  role: string;
}

interface TheatreSuite {
  id: string;
  name: string;
  location: string;
}

const GROUPS: Record<string, GroupConfig> = {
  nurses: {
    slug: 'nurses',
    title: 'Nurses Weekly Roster',
    category: 'NURSES',
    shifts: ['MORNING', 'NIGHT'],
    locations: ALL_LOCATIONS,
    subRoles: ['SCRUB', 'CIRCULATING', 'HOLDING_AREA', 'SUPERVISING'],
    userRoles: ['SCRUB_NURSE'],
    policy: 'Morning & Night shifts. Assign each nurse a sub-role: Scrub, Circulating, Holding Area or Supervising.',
  },
  anaesthetists: {
    slug: 'anaesthetists',
    title: 'Anaesthetists Weekly Roster',
    category: 'ANAESTHETISTS',
    shifts: ['MORNING', 'CALL'],
    locations: ALL_LOCATIONS,
    seniorityLevels: ['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR'],
    userRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'],
    policy: 'Mon–Fri elective list = MORNING (08:00–16:00). On-call covers ALL emergencies Mon–Fri after-hours and weekends = CALL. The Accident & Emergency, Eye and CTU theatres are rostered separately — switch the location selector above.',
  },
  'anaesthetic-technicians': {
    slug: 'anaesthetic-technicians',
    title: 'Anaesthetic Technicians Weekly Roster',
    category: 'ANAESTHETIC_TECHNICIANS',
    shifts: ['MORNING', 'CALL'],
    locations: ALL_LOCATIONS,
    userRoles: ['ANAESTHETIC_TECHNICIAN'],
    policy: 'Same shift pattern as anaesthetists. Roster each location separately.',
  },
  porters: {
    slug: 'porters',
    title: 'Porters Weekly Roster',
    category: 'PORTERS',
    shifts: ['MORNING', 'NIGHT'],
    locations: ALL_LOCATIONS,
    userRoles: ['PORTER'],
    policy: 'Morning & Night shifts.',
  },
  cleaners: {
    slug: 'cleaners',
    title: 'Cleaners Weekly Roster',
    category: 'CLEANERS',
    shifts: ['MORNING', 'NIGHT'],
    locations: ALL_LOCATIONS,
    userRoles: ['CLEANER'],
    policy: 'Morning & Night shifts.',
  },
  pharmacists: {
    slug: 'pharmacists',
    title: 'Pharmacists Weekly Roster',
    category: 'PHARMACISTS',
    shifts: ['MORNING', 'NIGHT'],
    locations: ALL_LOCATIONS,
    userRoles: ['PHARMACIST'],
    policy: 'Morning & Night shifts.',
  },
  'recovery-nurses': {
    slug: 'recovery-nurses',
    title: 'Nurse Anaesthetists Weekly Roster',
    category: 'RECOVERY_NURSES',
    shifts: ['MORNING', 'NIGHT'],
    locations: ALL_LOCATIONS,
    userRoles: ['RECOVERY_ROOM_NURSE'],
    policy: 'PACU coverage. Morning & Night shifts.',
  },
};

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface RosterRow {
  staffName: string;     // resolved User.fullName (or free-text fallback)
  userId?: string;       // when chosen from the dropdown
  date: string;          // ISO yyyy-mm-dd
  shift: Shift;
  seniorityLevel?: string;
  subRole?: string;
  theatreIds: string[];  // multi-select (one staff -> multiple theatres)
  notes?: string;
}

function getMondayOfWeek(d = new Date()): string {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return x.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function WeeklyRosterFormPage() {
  const params = useParams<{ group: string }>();
  const router = useRouter();
  const config = GROUPS[params.group];

  const [weekStart, setWeekStart] = useState<string>(getMondayOfWeek(new Date(Date.now() + 7 * 86400_000))); // next week
  const [location, setLocation] = useState<Location>('MAIN_THEATRE');
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; created: number; errors: number; details?: any } | null>(null);
  const [staffDirectory, setStaffDirectory] = useState<DirectoryUser[]>([]);
  const [theatres, setTheatres] = useState<TheatreSuite[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Fetch the staff directory for the current group's UserRole(s)
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setLoadingDirectory(true);
    Promise.all(
      config.userRoles.map((role) =>
        fetch(`/api/users?role=${encodeURIComponent(role)}&status=APPROVED`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    )
      .then((lists) => {
        if (cancelled) return;
        const flat: DirectoryUser[] = ([] as DirectoryUser[]).concat(...lists);
        // De-duplicate by id and sort by name
        const seen = new Set<string>();
        const merged = flat.filter((u) => {
          if (!u || seen.has(u.id)) return false;
          seen.add(u.id);
          return true;
        });
        merged.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
        setStaffDirectory(merged);
      })
      .finally(() => !cancelled && setLoadingDirectory(false));
    return () => {
      cancelled = true;
    };
  }, [config]);

  // Fetch theatres once
  useEffect(() => {
    let cancelled = false;
    fetch('/api/theatres')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        setTheatres(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const addRow = useCallback(() => {
    if (!config) return;
    setRows((prev) => [
      ...prev,
      {
        staffName: '',
        userId: undefined,
        date: weekDates[0],
        shift: config.shifts[0],
        theatreIds: [],
      },
    ]);
  }, [config, weekDates]);

  // Seed one empty row on first load so the form isn't blank
  useEffect(() => {
    if (config && rows.length === 0) addRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  if (!config) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/roster/weekly" className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="card p-6 text-center text-gray-600">Unknown roster group: <code>{params.group}</code></div>
      </div>
    );
  }

  const updateRow = (i: number, patch: Partial<RosterRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    setResult(null);
    const cleaned = rows.filter((r) => r.staffName.trim().length > 0);
    if (cleaned.length === 0) {
      alert('Add at least one staff member.');
      return;
    }
    // Expand multi-theatre rows into one entry per theatre (or a single entry with no theatre)
    type Entry = {
      staffName: string;
      date: string;
      shift: Shift;
      seniorityLevel?: string;
      subRole?: string;
      notes?: string;
      theatreId?: string;
    };
    const expanded: Entry[] = cleaned.flatMap<Entry>((r) => {
      const base: Entry = {
        staffName: r.staffName.trim(),
        date: r.date,
        shift: r.shift,
        seniorityLevel: r.seniorityLevel || undefined,
        subRole: r.subRole || undefined,
        notes: r.notes || undefined,
      };
      if (r.theatreIds.length === 0) return [base];
      return r.theatreIds.map((tid) => ({ ...base, theatreId: tid }));
    });
    setSubmitting(true);
    try {
      const res = await fetch('/api/roster/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffCategory: config.category,
          weekStart,
          location,
          entries: expanded,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Submission failed: ${data.error || res.statusText}`);
        return;
      }
      setResult(data);
      if (data.errors === 0) {
        // Clear form on full success
        setRows([]);
        setTimeout(() => addRow(), 100);
      }
    } catch (e: any) {
      alert(`Submission error: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/roster/weekly" className="text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All Weekly Forms
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">{config.title}</h1>
        <p className="text-gray-600 mt-2">{config.policy}</p>
      </div>

      {/* Header controls */}
      <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="week-start" className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
            <Calendar className="w-4 h-4" /> Week starts (Monday)
          </label>
          <input
            id="week-start"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(getMondayOfWeek(new Date(e.target.value)))}
            className="input w-full"
            aria-label="Week start date"
          />
          <p className="text-xs text-gray-500 mt-1">Auto-snapped to Monday of the chosen week.</p>
        </div>
        <div>
          <label htmlFor="location-select" className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
          <select
            id="location-select"
            value={location}
            onChange={(e) => setLocation(e.target.value as Location)}
            className="input w-full"
            aria-label="Roster location"
          >
            {config.locations.map((loc) => (
              <option key={loc} value={loc}>{LOCATION_LABELS[loc]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={addRow} className="btn-primary w-full inline-flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add staff entry
          </button>
        </div>
      </div>

      {/* Day picker hint */}
      <div className="text-xs text-gray-500 px-1">
        Week: <strong>{weekDates[0]}</strong> → <strong>{weekDates[6]}</strong>
      </div>

      {/* Entries */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th className="p-3">Staff (from directory)</th>
              <th className="p-3">Day</th>
              <th className="p-3">Shift</th>
              {config.seniorityLevels && <th className="p-3">Seniority</th>}
              {config.subRoles && <th className="p-3">Sub-role</th>}
              <th className="p-3">Theatre(s) assigned</th>
              <th className="p-3">Notes</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-400">No entries — click “Add staff entry”.</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 min-w-[14rem]">
                  <select
                    value={r.userId || ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      const user = staffDirectory.find((u) => u.id === id);
                      updateRow(i, {
                        userId: id || undefined,
                        staffName: user?.fullName || '',
                      });
                    }}
                    className="input w-full"
                    aria-label={`Staff row ${i + 1}`}
                  >
                    <option value="">
                      {loadingDirectory ? 'Loading…' : `— select ${config.title.replace(' Weekly Roster', '').toLowerCase()} —`}
                    </option>
                    {staffDirectory.map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    value={r.date}
                    onChange={(e) => updateRow(i, { date: e.target.value })}
                    className="input w-full"
                    aria-label={`Day row ${i + 1}`}
                  >
                    {weekDates.map((d, idx) => (
                      <option key={d} value={d}>{DAY_LABELS[idx]} ({d})</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    value={r.shift}
                    onChange={(e) => updateRow(i, { shift: e.target.value as Shift })}
                    className="input w-full"
                    aria-label={`Shift row ${i + 1}`}
                  >
                    {config.shifts.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                {config.seniorityLevels && (
                  <td className="p-2">
                    <select
                      value={r.seniorityLevel || ''}
                      onChange={(e) => updateRow(i, { seniorityLevel: e.target.value })}
                      className="input w-full"
                      aria-label={`Seniority row ${i + 1}`}
                    >
                      <option value="">—</option>
                      {config.seniorityLevels.map((s) => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </td>
                )}
                {config.subRoles && (
                  <td className="p-2">
                    <select
                      value={r.subRole || ''}
                      onChange={(e) => updateRow(i, { subRole: e.target.value })}
                      className="input w-full"
                      aria-label={`Sub-role row ${i + 1}`}
                    >
                      <option value="">—</option>
                      {config.subRoles.map((s) => (
                        <option key={s} value={s}>{s.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="p-2 min-w-[12rem]">
                  <select
                    multiple
                    value={r.theatreIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                      updateRow(i, { theatreIds: selected });
                    }}
                    className="input w-full h-24"
                    aria-label={`Theatres assigned row ${i + 1}`}
                  >
                    {theatres.length === 0 && <option disabled>No theatres available</option>}
                    {theatres.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">Hold Ctrl / ⌘ to pick multiple. Same theatre may be assigned to multiple staff.</p>
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={r.notes || ''}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    placeholder="Optional"
                    className="input w-full"
                    aria-label={`Notes row ${i + 1}`}
                  />
                </td>
                <td className="p-2">
                  <button
                    onClick={() => removeRow(i)}
                    className="text-red-600 hover:text-red-800 p-2"
                    aria-label={`Remove row ${i + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={addRow} className="btn-secondary inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add another row
        </button>
        <button onClick={submit} disabled={submitting} className="btn-primary inline-flex items-center gap-2">
          <Save className="w-4 h-4" /> {submitting ? 'Submitting…' : 'Submit weekly roster'}
        </button>
      </div>

      {/* Result panel */}
      {result && (
        <div className={`card p-4 border ${result.errors > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
          <p className="font-semibold inline-flex items-center gap-2">
            {result.errors > 0
              ? <><AlertCircle className="w-5 h-5 text-amber-600" /> Saved with {result.errors} issue(s)</>
              : <><CheckCircle2 className="w-5 h-5 text-green-600" /> Roster saved</>}
          </p>
          <p className="text-sm mt-1">
            Created <strong>{result.created}</strong> entr{result.created === 1 ? 'y' : 'ies'}.
            {result.errors > 0 && (
              <> {result.errors} row(s) skipped — see details below.</>
            )}
          </p>
          {result.details?.errors?.length > 0 && (
            <ul className="text-xs mt-3 list-disc list-inside space-y-1 text-amber-900">
              {result.details.errors.map((e: any, i: number) => (
                <li key={i}>Row {e.row}: {e.error} ({e.data?.staffName})</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => router.push('/dashboard/roster')} className="btn-secondary">View full roster</button>
            <Link href="/dashboard/roster/weekly" className="btn-secondary">Back to forms hub</Link>
          </div>
        </div>
      )}
    </div>
  );
}
