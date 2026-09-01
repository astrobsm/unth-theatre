'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, UploadCloud, History,
  Loader2, ShieldCheck, Lock, RotateCcw, CheckCircle2, AlertCircle, Copy, Download, Printer, Move, Link2, Check, X,
} from 'lucide-react';
import RosterBulkUploadModal from '@/components/RosterBulkUploadModal';
import SearchableSelect from '@/components/SearchableSelect';

const LOCATIONS = ['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE', 'ICU'];

// Fallback wording for a department the API returned no shift list for.
const DEFAULT_SHIFT_OPTIONS: ShiftOption[] = [
  { value: 'MORNING', label: 'MORNING' },
  { value: 'CALL', label: 'CALL' },
  { value: 'NIGHT', label: 'NIGHT' },
];

interface ShiftOption { value: string; label: string }
interface Row {
  id: string; userId: string; staffName: string; staffCode: string | null; phoneNumber: string | null; extension: string | null;
  date: string; shift: string; subRole: string | null; seniorityLevel: string | null; location: string | null;
  theatreId: string | null; notes: string | null; status: string; version: number | null; pendingRemoval: boolean;
}
interface DeptData {
  department: {
    slug: string; label: string; category: string; subRoles: string[]; seniorityLevels: string[]; userRoles: string[];
    shiftOptions?: ShiftOption[]; subRoleSource?: string | null; subRoleLabel?: string;
    /** Assignment options, resolved server-side (live theatres / specialties). */
    subRoleOptions?: string[];
  };
  weekStart: string; canManage: boolean; currentVersion: number; lastPublishedAt: string | null;
  draftCount: number; pendingRemovalCount: number; pendingChanges: number; rows: Row[];
}
interface Version { id: string; version: number; status: string; publishedAt: string; publishedByName: string | null; rowCount: number; notes: string | null }
interface Staff { id: string; fullName: string; role: string }

// Monday of the week containing `d` (ISO).
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
/**
 * Which week this page should OPEN on.
 *
 * Not simply "the week containing today". On a Saturday or Sunday that is the
 * week which has just finished, and nobody rosters a week that has ended —
 * the weekend is exactly when the COMING week gets built and published.
 *
 * On Sunday 30 August 2026 this page opened on the week starting 24 August. A
 * roster entered for the 31st therefore sat outside the displayed week; Publish
 * covers only weekStart to weekStart+6, so it reported success having published
 * the old week, while the week from the 31st still read "no published roster"
 * and bookings found nobody. The roster was right. The page was pointing at the
 * wrong seven days.
 *
 * On any weekday the current week is correct: that is the week being worked.
 */
function defaultWeekStart(now: Date = new Date()): string {
  const dow = now.getDay(); // 0 = Sunday, 6 = Saturday
  if (dow === 0 || dow === 6) {
    const next = new Date(now);
    next.setDate(next.getDate() + (dow === 6 ? 2 : 1)); // forward to Monday
    return mondayOf(next);
  }
  return mondayOf(now);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const DAY_LABEL = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function DepartmentRosterPage() {
  const { dept } = useParams<{ dept: string }>();
  const [weekStart, setWeekStart] = useState<string>(() => defaultWeekStart());
  const [data, setData] = useState<DeptData | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // add-form state
  const [fStaff, setFStaff] = useState(''); const [fDate, setFDate] = useState(''); const [fShift, setFShift] = useState('MORNING');
  const [fSub, setFSub] = useState(''); const [fSen, setFSen] = useState(''); const [fLoc, setFLoc] = useState('MAIN_THEATRE'); const [fNotes, setFNotes] = useState('');
  // P4: conflicts + copy-day + drag
  const [conflictIds, setConflictIds] = useState<Set<string>>(new Set());
  const [conflictList, setConflictList] = useState<Array<{ staffName: string; date: string; shift: string; count: number }>>([]);
  const [copySrc, setCopySrc] = useState(''); const [copyDst, setCopyDst] = useState(''); const [showCopyDay, setShowCopyDay] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  // The assignment currently open in the edit dialog.
  const [editRow, setEditRow] = useState<Row | null>(null);
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/roster/${dept}` : `/roster/${dept}`;
  const copyShareLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000);
  };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r, v] = await Promise.all([
        fetch(`/api/roster/departments/${dept}?weekStart=${weekStart}`, { cache: 'no-store' }),
        fetch(`/api/roster/departments/${dept}/versions?weekStart=${weekStart}`, { cache: 'no-store' }),
      ]);
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`);
      const d: DeptData = await r.json();
      setData(d);
      setVersions(v.ok ? (await v.json()).versions : []);
      if (!fDate) setFDate(weekStart);
      // Conflicts (cross-department double-booking) for this week.
      fetch(`/api/roster/conflicts?weekStart=${weekStart}`, { cache: 'no-store' })
        .then((cr) => (cr.ok ? cr.json() : { conflictRowIds: [], conflicts: [] }))
        .then((cj) => {
          setConflictIds(new Set<string>(cj.conflictRowIds ?? []));
          setConflictList(cj.conflicts ?? []);
        }).catch(() => {});
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [dept, weekStart, fDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/users?status=APPROVED', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : [])).then((d) => setStaff(Array.isArray(d) ? d : d.users ?? [])).catch(() => {});
  }, []);

  const eligibleStaff = useMemo(
    () => staff.filter((s) => data?.department.userRoles.includes(s.role)),
    [staff, data],
  );

  // How this department names its shifts, and whether it rosters by surgical
  // specialty. Both come from the server's department config.
  const shiftOptions = data?.department.shiftOptions?.length ? data.department.shiftOptions : DEFAULT_SHIFT_OPTIONS;
  const shiftLabel = useCallback(
    (s: string) => shiftOptions.find((o) => o.value === s)?.label ?? s,
    [shiftOptions],
  );
  // Departments whose assignment list comes from the database (anaesthetists →
  // surgical specialties, technicians → theatres) put that picker where the
  // static Location dropdown would otherwise sit.
  const assignmentSource = data?.department.subRoleSource ?? null;
  const assignmentLabel = data?.department.subRoleLabel ?? 'Sub-role';
  const assignmentOptions = data?.department.subRoleOptions ?? [];
  const hasAssignmentPicker = !!assignmentSource;

  // Keep the form's shift on an option this department actually offers — the
  // default 'MORNING' isn't valid everywhere.
  useEffect(() => {
    if (shiftOptions.length && !shiftOptions.some((o) => o.value === fShift)) setFShift(shiftOptions[0].value);
  }, [shiftOptions, fShift]);

  const staffOptions = useMemo(
    () => eligibleStaff.map((s) => ({ value: s.id, label: s.fullName, hint: s.role.replace(/_/g, ' ') })),
    [eligibleStaff],
  );

  const addRow = async () => {
    if (!fStaff || !fDate) { setMsg('Pick staff and a day.'); return; }
    setMsg('');
    const res = await fetch(`/api/roster/departments/${dept}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: fStaff, date: fDate, shift: fShift, subRole: fSub || null, seniorityLevel: fSen || null, location: fLoc, notes: fNotes || null }),
    });
    if (res.ok) { setFStaff(''); setFNotes(''); await load(); } else { setMsg((await res.json().catch(() => ({})))?.error || 'Failed to add'); }
  };
  const deleteRow = async (id: string) => {
    const res = await fetch(`/api/roster/departments/${dept}?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load(); else setMsg((await res.json().catch(() => ({})))?.error || 'Failed to delete');
  };
  const stageRemoval = async (id: string, pendingRemoval: boolean) => {
    const res = await fetch(`/api/roster/departments/${dept}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, pendingRemoval }),
    });
    if (res.ok) await load(); else setMsg((await res.json().catch(() => ({})))?.error || 'Failed to update');
  };
  const publish = async () => {
    setMsg('');
    const res = await fetch(`/api/roster/departments/${dept}/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg(`Published v${j.version} (${j.published} change(s) went live).`); await load(); } else { setMsg(j?.error || 'Publish failed'); }
  };
  const rollback = async (version: number) => {
    if (!confirm(`Roll this week's roster back to version ${version}? Current rows will be replaced.`)) return;
    const res = await fetch(`/api/roster/departments/${dept}/versions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart, version }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg(`Rolled back to v${version} (now published as v${j.newVersion}).`); await load(); } else { setMsg(j?.error || 'Rollback failed'); }
  };

  const copyWeek = async () => {
    if (!confirm('Copy last week’s roster into this week as drafts? Existing entries are kept.')) return;
    const res = await fetch(`/api/roster/departments/${dept}/copy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'week', weekStart }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Copied ${j.copied} draft(s) from last week${j.skipped ? ` (${j.skipped} already existed)` : ''}.` : (j?.error || 'Copy failed'));
    if (res.ok) await load();
  };
  const copyDay = async () => {
    if (!copySrc || !copyDst) { setMsg('Pick a source and target day.'); return; }
    const res = await fetch(`/api/roster/departments/${dept}/copy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'day', sourceDate: copySrc, targetDate: copyDst }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Copied ${j.copied} draft(s) to ${DAY_LABEL(copyDst)}.` : (j?.error || 'Copy failed'));
    if (res.ok) { setShowCopyDay(false); await load(); }
  };
  /**
   * Save an edit to one assignment.
   *
   * Editing a PUBLISHED row does not rewrite it — the server stages it for
   * removal and files the change as a draft beside it, so the live roster keeps
   * working until somebody publishes. The message says so, because "saved" on a
   * published roster that has not changed live would be a lie.
   */
  const saveEdit = async (id: string, edit: Record<string, unknown>) => {
    const res = await fetch(`/api/roster/departments/${dept}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, edit }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(j?.error || 'Could not save that change.'); return false; }
    setMsg(j.mode === 'draft-replacement'
      ? 'Change saved as a draft. The published entry stays live until you publish.'
      : 'Change saved.');
    setEditRow(null);
    await load();
    return true;
  };

  const moveRow = async (id: string, date: string, shift: string) => {
    const res = await fetch(`/api/roster/departments/${dept}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, date, shift }),
    });
    if (res.ok) await load(); else setMsg((await res.json().catch(() => ({})))?.error || 'Move failed');
  };
  const exportCsv = () => {
    // Seniority is omitted for a department that has no grades — the exported
    // CSV is the same shape as the upload template, so a week can be exported,
    // edited and uploaded straight back.
    const withSeniority = (data?.department.seniorityLevels.length ?? 0) > 0;
    const cols = ['Date', 'Shift', 'Staff', data?.department.subRoleLabel ?? 'Sub-role',
      ...(withSeniority ? ['Seniority'] : []), 'Location', 'Status', 'Notes'];
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(',')];
    for (const r of data?.rows ?? []) lines.push([r.date, shiftLabel(r.shift), r.staffName, r.subRole,
      ...(withSeniority ? [r.seniorityLevel] : []),
      r.location, r.pendingRemoval ? 'PUBLISHED (to be removed)' : r.status, r.notes].map(esc).join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `roster-${dept}-${weekStart}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const rowsFor = (day: string, shift: string) => (data?.rows ?? []).filter((r) => r.date === day && r.shift === shift);
  const canManage = data?.canManage;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link href="/dashboard/roster/departments" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> All department rosters</Link>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setShowBulk(true)}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Bulk upload
            </button>
          )}
          <button
            type="button"
            onClick={copyShareLink}
            title={`Copy shareable link (${shareUrl})`}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border ${linkCopied ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-primary-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {linkCopied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy shareable link</>}
          </button>
        </div>
      </div>

      {showBulk && data && (
        <RosterBulkUploadModal
          dept={dept}
          label={data.department.label}
          weekStart={weekStart}
          onClose={() => setShowBulk(false)}
          onUploaded={load}
        />
      )}

      {editRow && data && canManage && (
        <EditAssignmentDialog
          row={editRow}
          dept={data.department}
          days={days}
          shiftOptions={shiftOptions}
          staffOptions={staffOptions}
          assignmentLabel={assignmentLabel}
          assignmentOptions={assignmentOptions}
          hasAssignmentPicker={hasAssignmentPicker}
          onSave={saveEdit}
          onClose={() => setEditRow(null)}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0"><CalendarDays className="w-6 h-6 text-primary-600" /></div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data?.department.label ?? dept} Roster</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              {canManage
                ? <span className="inline-flex items-center gap-1 text-green-700"><ShieldCheck className="w-4 h-4" /> You can manage this roster</span>
                : <span className="inline-flex items-center gap-1 text-gray-500"><Lock className="w-4 h-4" /> View only — a department supervisor publishes changes</span>}
              {data && <> · Published v{data.currentVersion}{data.lastPublishedAt ? ` on ${new Date(data.lastPublishedAt).toLocaleDateString()}` : ' — not yet published'}</>}
            </p>
          </div>
        </div>
        {/* Week picker — full width on a phone so the arrows stay thumb-sized. */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn-secondary text-sm p-2 flex-shrink-0" aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value + 'T00:00:00Z')))} className="input-field text-sm py-1.5 flex-1 sm:flex-none min-w-0" aria-label="Week starting" />
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn-secondary text-sm p-2 flex-shrink-0" aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
      {msg && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      {/* Publish bar */}
      {canManage && data && data.pendingChanges > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-amber-800">
            <strong>{data.pendingChanges}</strong> unpublished change(s) this week
            {data.draftCount > 0 && <> — {data.draftCount} addition(s)</>}
            {data.pendingRemovalCount > 0 && <>{data.draftCount > 0 ? ',' : ' —'} {data.pendingRemovalCount} removal(s)</>}
            . Removals stay live until you publish.
          </span>
          <button onClick={publish} className="btn-primary text-sm inline-flex items-center justify-center gap-1 w-full sm:w-auto flex-shrink-0"><UploadCloud className="w-4 h-4" /> Publish roster</button>
        </div>
      )}

      {/* Add assignment (managers only) */}
      {canManage && data && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Plus className="w-4 h-4" /> Add assignment (draft)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <div className="lg:col-span-2">
              <label className="label">Staff</label>
              <SearchableSelect
                options={staffOptions}
                value={fStaff}
                onChange={setFStaff}
                placeholder="Search staff by name…"
                emptyLabel="No matching staff in this department"
                ariaLabel="Staff"
              />
            </div>
            <div>
              <label className="label">Day</label>
              <select className="input-field" value={fDate} onChange={(e) => setFDate(e.target.value)}>
                {days.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Shift</label>
              <select className="input-field" value={fShift} onChange={(e) => setFShift(e.target.value)}>{shiftOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </div>
            {/* Static sub-roles, for departments that aren't driven by the DB. */}
            {!hasAssignmentPicker && data.department.subRoles.length > 0 && (
              <div>
                <label className="label">{assignmentLabel}</label>
                <select className="input-field" value={fSub} onChange={(e) => setFSub(e.target.value)}><option value="">—</option>{data.department.subRoles.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
            )}
            {data.department.seniorityLevels.length > 0 && (
              <div>
                <label className="label">Seniority</label>
                <select className="input-field" value={fSen} onChange={(e) => setFSen(e.target.value)}><option value="">—</option>{data.department.seniorityLevels.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
              </div>
            )}
            {hasAssignmentPicker ? (
              <div>
                <label className="label">{assignmentLabel}</label>
                <SearchableSelect
                  options={assignmentOptions.map((s) => ({ value: s, label: s }))}
                  value={fSub}
                  onChange={setFSub}
                  placeholder={assignmentSource === 'THEATRE' ? 'Search theatres…' : 'Search specialties…'}
                  emptyLabel="No matches"
                  ariaLabel={assignmentLabel}
                />
                {assignmentOptions.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    {assignmentSource === 'THEATRE'
                      ? 'No theatres set up yet — add them under Admin → Theatres.'
                      : 'No surgical units set up yet — add them under Admin → Surgical Units.'}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="label">Location</label>
                <select className="input-field" value={fLoc} onChange={(e) => setFLoc(e.target.value)}>{LOCATIONS.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}</select>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-5">
              <label className="label">Notes (optional)</label>
              <input className="input-field" value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="e.g. holding area cover" />
            </div>
            <button onClick={addRow} className="btn-primary text-sm inline-flex items-center justify-center gap-1 w-full sm:col-span-2 lg:col-span-1"><Plus className="w-4 h-4" /> Add</button>
          </div>
        </div>
      )}

      {/* Toolbar: copy / export / print */}
      <div className="flex flex-wrap items-center gap-2">
        {canManage && <button onClick={copyWeek} className="btn-secondary text-sm inline-flex items-center gap-1"><Copy className="w-4 h-4" /> Copy last week</button>}
        {canManage && <button onClick={() => setShowCopyDay((s) => !s)} className="btn-secondary text-sm inline-flex items-center gap-1"><Copy className="w-4 h-4" /> Copy a day…</button>}
        <button onClick={exportCsv} className="btn-secondary text-sm inline-flex items-center gap-1"><Download className="w-4 h-4" /> Export CSV</button>
        <button onClick={() => window.print()} className="btn-secondary text-sm inline-flex items-center gap-1"><Printer className="w-4 h-4" /> Print / PDF</button>
        {canManage && (
          // Drag-and-drop is the desktop grid's affordance; the mobile cards use
          // a per-row day/shift picker instead.
          <span className="hidden lg:inline-flex text-[11px] text-gray-400 ml-auto items-center gap-1"><Move className="w-3.5 h-3.5" /> drag draft chips between cells to reschedule</span>
        )}
      </div>
      {showCopyDay && canManage && (
        <div className="card grid gap-2 sm:grid-cols-3 sm:items-end">
          <div><label className="label">From day</label>
            <select className="input-field" value={copySrc} onChange={(e) => setCopySrc(e.target.value)}><option value="">Select…</option>{days.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}</select></div>
          <div><label className="label">To day</label>
            <select className="input-field" value={copyDst} onChange={(e) => setCopyDst(e.target.value)}><option value="">Select…</option>{days.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}</select></div>
          <button onClick={copyDay} className="btn-primary text-sm w-full">Copy day</button>
        </div>
      )}

      {/* Conflict banner (cross-department double-booking) */}
      {conflictList.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {conflictList.length} double-booking conflict(s) this week</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {conflictList.slice(0, 6).map((c, i) => (
              <li key={i}>{c.staffName} — {DAY_LABEL(c.date)} {shiftLabel(c.shift)} ({c.count} assignments)</li>
            ))}
            {conflictList.length > 6 && <li>…and {conflictList.length - 6} more</li>}
          </ul>
        </div>
      )}

      {/* Week view.
          Below lg the 8-column grid can't fit without either a horizontal
          scroller or hidden columns, and rosters are filled in on phones — so
          small screens get a day-by-day stack instead, showing every field. */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : (
        <>
          {/* Desktop: week-at-a-glance grid */}
          <div className="hidden lg:grid grid-cols-8 gap-2">
            <div className="text-xs font-semibold text-gray-400 pt-8">Shift</div>
            {days.map((d) => <div key={d} className="text-xs font-semibold text-gray-600 text-center pb-1">{DAY_LABEL(d)}</div>)}
            {shiftOptions.map((s) => (
              <FragmentRow key={s.value} shift={s.value} shiftLabel={s.label} days={days} rowsFor={rowsFor} canManage={!!canManage}
                onDelete={deleteRow} onStage={stageRemoval} onMove={moveRow} onEdit={setEditRow}
                conflictIds={conflictIds} dragId={dragId} setDragId={setDragId} />
            ))}
          </div>

          {/* Mobile / tablet: one card per day */}
          <div className="lg:hidden space-y-3">
            {days.map((day) => {
              const dayTotal = shiftOptions.reduce((n, s) => n + rowsFor(day, s.value).length, 0);
              return (
                <div key={day} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-800">{DAY_LABEL(day)}</span>
                    <span className="text-xs text-gray-500">{dayTotal === 0 ? 'nobody rostered' : `${dayTotal} assigned`}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {shiftOptions.map((s) => {
                      const rows = rowsFor(day, s.value);
                      return (
                        <div key={s.value} className="p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{s.label}</p>
                          {rows.length === 0 ? (
                            <p className="text-xs text-gray-300">—</p>
                          ) : (
                            <div className="space-y-1.5">
                              {rows.map((r) => (
                                <RosterChip
                                  key={r.id} row={r} canManage={!!canManage} conflict={conflictIds.has(r.id)}
                                  onDelete={deleteRow} onStage={stageRemoval} onMove={moveRow} onEdit={setEditRow}
                                  days={days} shiftOptions={shiftOptions} showMoveControl
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Version history */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><History className="w-4 h-4" /> Version history (this week)</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-gray-400">No published versions yet for this week.</p>
        ) : (
          <div className="space-y-1">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 text-sm border-b border-gray-50 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {v.status === 'PUBLISHED' ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /> : <History className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                  <span className="truncate">
                    <strong>v{v.version}</strong> · {v.rowCount} row(s) · {new Date(v.publishedAt).toLocaleString()}
                    {v.publishedByName ? ` · ${v.publishedByName}` : ''}{v.notes ? ` · ${v.notes}` : ''}
                    {v.status !== 'PUBLISHED' && <span className="ml-1 text-[11px] text-gray-400">(archived)</span>}
                  </span>
                </div>
                {canManage && v.status !== 'PUBLISHED' && (
                  <button onClick={() => rollback(v.version)} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ shift, shiftLabel, days, rowsFor, canManage, onDelete, onStage, onMove, onEdit, conflictIds, dragId, setDragId }: {
  shift: string; shiftLabel: string; days: string[]; rowsFor: (d: string, s: string) => Row[]; canManage: boolean;
  onDelete: (id: string) => void; onStage: (id: string, pendingRemoval: boolean) => void;
  onMove: (id: string, date: string, shift: string) => void; onEdit: (row: Row) => void; conflictIds: Set<string>;
  dragId: string | null; setDragId: (id: string | null) => void;
}) {
  return (
    <>
      <div className="text-xs font-semibold text-gray-500 flex items-center">{shiftLabel}</div>
      {days.map((d) => {
        const rows = rowsFor(d, shift);
        return (
          <div key={d + shift}
            className="min-h-[52px] rounded border border-gray-100 bg-gray-50/40 p-1 space-y-1"
            onDragOver={(e) => { if (canManage && dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (canManage && dragId) onMove(dragId, d, shift); setDragId(null); }}
          >
            {rows.map((r) => (
              <RosterChip
                key={r.id} row={r} canManage={canManage} conflict={conflictIds.has(r.id)}
                onDelete={onDelete} onStage={onStage} onMove={onMove} onEdit={onEdit}
                draggable onDragStart={() => setDragId(r.id)} onDragEnd={() => setDragId(null)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * Edit one assignment — staff, day, shift, seniority, assignment, notes.
 *
 * Works on published entries as well as drafts. On a published one the server
 * files the change as a draft beside the original rather than rewriting it, so
 * the roster the hospital is currently working to does not change under it
 * mid-week; the banner says so plainly.
 */
function EditAssignmentDialog({
  row, dept, days, shiftOptions, staffOptions, assignmentLabel, assignmentOptions,
  hasAssignmentPicker, onSave, onClose,
}: {
  row: Row;
  dept: DeptData['department'];
  days: string[];
  shiftOptions: ShiftOption[];
  staffOptions: { value: string; label: string; hint?: string }[];
  assignmentLabel: string;
  assignmentOptions: string[];
  hasAssignmentPicker: boolean;
  onSave: (id: string, edit: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [staff, setStaff] = useState(row.userId);
  const [date, setDate] = useState(row.date);
  const [shift, setShift] = useState(row.shift);
  const [sub, setSub] = useState(row.subRole ?? '');
  const [sen, setSen] = useState(row.seniorityLevel ?? '');
  const [loc, setLoc] = useState(row.location ?? 'MAIN_THEATRE');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [saving, setSaving] = useState(false);

  const isPublished = row.status === 'PUBLISHED';
  // The day list only spans the visible week; a row dragged in from elsewhere
  // must not lose its date just because the picker cannot show it.
  const dayChoices = days.includes(date) ? days : [date, ...days];

  const submit = async () => {
    setSaving(true);
    const ok = await onSave(row.id, {
      userId: staff, date, shift,
      subRole: sub || null,
      seniorityLevel: sen || null,
      location: loc || null,
      notes: notes || null,
    });
    if (!ok) setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">Edit assignment</h3>
          <button onClick={onClose} className="p-2 -m-2 text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          {isPublished && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              This entry is <strong>published</strong>. Saving files the change as a draft and marks the
              current entry for removal — the live roster keeps working until you press Publish.
            </div>
          )}

          <div>
            <label className="label">Staff</label>
            <SearchableSelect
              options={staffOptions} value={staff} onChange={setStaff}
              placeholder="Search staff by name…" ariaLabel="Staff" allowClear={false}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Day</label>
              <select className="input-field" value={date} onChange={(e) => setDate(e.target.value)}>
                {dayChoices.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Shift</label>
              <select className="input-field" value={shift} onChange={(e) => setShift(e.target.value)}>
                {shiftOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {dept.seniorityLevels.length > 0 && (
            <div>
              <label className="label">Seniority</label>
              <select className="input-field" value={sen} onChange={(e) => setSen(e.target.value)}>
                <option value="">—</option>
                {dept.seniorityLevels.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          )}

          {hasAssignmentPicker ? (
            <div>
              <label className="label">{assignmentLabel}</label>
              <SearchableSelect
                options={assignmentOptions.map((s) => ({ value: s, label: s }))}
                value={sub} onChange={setSub}
                placeholder="Search…" ariaLabel={assignmentLabel}
              />
            </div>
          ) : dept.subRoles.length > 0 ? (
            <div>
              <label className="label">{assignmentLabel}</label>
              <select className="input-field" value={sub} onChange={(e) => setSub(e.target.value)}>
                <option value="">—</option>
                {dept.subRoles.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="label">Location</label>
              <select className="input-field" value={loc} onChange={(e) => setLoc(e.target.value)}>
                {LOCATIONS.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Notes (optional)</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. holding area cover" />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 py-3 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="btn-secondary text-sm w-full sm:w-auto">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary text-sm w-full sm:w-auto inline-flex items-center justify-center gap-1 disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save change</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One person's assignment. Shared by the desktop grid and the mobile day cards
 * so the two views can't show different information.
 *
 * `showMoveControl` swaps drag-and-drop for a day/shift picker: dragging is a
 * mouse gesture, and on a phone there'd otherwise be no way to reschedule.
 */
function RosterChip({
  row: r, canManage, conflict, onDelete, onStage, onMove, onEdit,
  draggable = false, onDragStart, onDragEnd,
  showMoveControl = false, days = [], shiftOptions = [],
}: {
  row: Row; canManage: boolean; conflict: boolean;
  onDelete: (id: string) => void; onStage: (id: string, pendingRemoval: boolean) => void;
  onMove: (id: string, date: string, shift: string) => void;
  onEdit?: (row: Row) => void;
  draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void;
  showMoveControl?: boolean; days?: string[]; shiftOptions?: ShiftOption[];
}) {
  const staged = r.status === 'PUBLISHED' && r.pendingRemoval;
  const isDraft = r.status === 'DRAFT';
  const cls = staged
    ? 'bg-red-50 text-red-800 line-through'
    : isDraft ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900';

  return (
    <div
      draggable={draggable && canManage && isDraft}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={conflict ? 'Double-booked this day/shift' : (draggable && canManage && isDraft ? 'Drag to reschedule' : undefined)}
      className={`text-[11px] rounded px-1.5 py-1 ${cls} ${conflict ? 'ring-2 ring-red-400' : ''} ${draggable && canManage && isDraft ? 'cursor-move' : ''}`}
    >
      <div className="flex items-start justify-between gap-1">
        {/* The whole body is the edit affordance — a manager's first instinct on
            seeing a wrong name is to tap it. Published rows included: the server
            turns that into a draft change rather than a live rewrite. */}
        {canManage && onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(r)}
            title={`Edit ${r.staffName}`}
            className="leading-tight min-w-0 text-left flex-1 cursor-pointer hover:underline"
          >
            {conflict ? <AlertCircle className="w-3 h-3 text-red-500 inline mr-0.5 -mt-0.5" /> : null}
            <span className="text-xs font-medium">{r.staffName}</span>
            {r.subRole ? <span className="block text-[10px] opacity-70 no-underline">{r.subRole}</span> : null}
            {r.seniorityLevel ? <span className="block text-[10px] opacity-70 no-underline">{r.seniorityLevel.replace(/_/g, ' ')}</span> : null}
            {r.notes ? <span className="block text-[10px] opacity-60 no-underline">{r.notes}</span> : null}
            {staged ? <span className="block text-[9px] font-semibold text-red-600 no-underline">will be removed on publish</span> : null}
          </button>
        ) : (
        <span className="leading-tight min-w-0">
          {conflict ? <AlertCircle className="w-3 h-3 text-red-500 inline mr-0.5 -mt-0.5" /> : null}
          <span className="text-xs font-medium">{r.staffName}</span>
          {r.subRole ? <span className="block text-[10px] opacity-70 no-underline">{r.subRole}</span> : null}
          {r.seniorityLevel ? <span className="block text-[10px] opacity-70 no-underline">{r.seniorityLevel.replace(/_/g, ' ')}</span> : null}
          {r.notes ? <span className="block text-[10px] opacity-60 no-underline">{r.notes}</span> : null}
          {staged ? <span className="block text-[9px] font-semibold text-red-600 no-underline">will be removed on publish</span> : null}
        </span>
        )}
        {canManage && (
          isDraft ? (
            <button onClick={() => onDelete(r.id)} className="text-red-500 hover:text-red-700 flex-shrink-0 p-1 -m-1" aria-label={`Remove draft for ${r.staffName}`}><Trash2 className="w-4 h-4" /></button>
          ) : staged ? (
            <button onClick={() => onStage(r.id, false)} className="text-primary-600 hover:text-primary-700 flex-shrink-0 p-1 -m-1" aria-label={`Keep ${r.staffName} (undo removal)`}><RotateCcw className="w-4 h-4" /></button>
          ) : (
            <button onClick={() => onStage(r.id, true)} className="text-red-400 hover:text-red-600 flex-shrink-0 p-1 -m-1" aria-label={`Stage removal for ${r.staffName}`}><Trash2 className="w-4 h-4" /></button>
          )
        )}
      </div>
      {showMoveControl && canManage && isDraft && days.length > 0 && (
        <select
          className="mt-1.5 w-full text-[11px] rounded border border-amber-300 bg-white/70 px-1.5 py-1"
          value={`${r.date}|${r.shift}`}
          onChange={(e) => { const [d, s] = e.target.value.split('|'); onMove(r.id, d, s); }}
          aria-label={`Reschedule ${r.staffName}`}
        >
          {days.flatMap((d) => shiftOptions.map((s) => (
            <option key={`${d}|${s.value}`} value={`${d}|${s.value}`}>{DAY_LABEL(d)} · {s.label}</option>
          )))}
        </select>
      )}
    </div>
  );
}
