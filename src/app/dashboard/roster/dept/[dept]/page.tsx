'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, UploadCloud, History,
  Loader2, ShieldCheck, Lock, RotateCcw, CheckCircle2, AlertCircle, Copy, Download, Printer, Move, Link2, Check,
} from 'lucide-react';
import RosterBulkUploadModal from '@/components/RosterBulkUploadModal';

const SHIFTS = ['MORNING', 'CALL', 'NIGHT'] as const;
const LOCATIONS = ['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE', 'ICU'];

interface Row {
  id: string; userId: string; staffName: string; staffCode: string | null; phoneNumber: string | null; extension: string | null;
  date: string; shift: string; subRole: string | null; seniorityLevel: string | null; location: string | null;
  theatreId: string | null; notes: string | null; status: string; version: number | null; pendingRemoval: boolean;
}
interface DeptData {
  department: { slug: string; label: string; category: string; subRoles: string[]; seniorityLevels: string[]; userRoles: string[] };
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
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const DAY_LABEL = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function DepartmentRosterPage() {
  const { dept } = useParams<{ dept: string }>();
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(new Date()));
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
  const moveRow = async (id: string, date: string, shift: string) => {
    const res = await fetch(`/api/roster/departments/${dept}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, date, shift }),
    });
    if (res.ok) await load(); else setMsg((await res.json().catch(() => ({})))?.error || 'Move failed');
  };
  const exportCsv = () => {
    const cols = ['Date', 'Shift', 'Staff', 'Sub-role', 'Seniority', 'Location', 'Status', 'Notes'];
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(',')];
    for (const r of data?.rows ?? []) lines.push([r.date, r.shift, r.staffName, r.subRole, r.seniorityLevel, r.location, r.pendingRemoval ? 'PUBLISHED (to be removed)' : r.status, r.notes].map(esc).join(','));
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary-100 flex items-center justify-center"><CalendarDays className="w-6 h-6 text-primary-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{data?.department.label ?? dept} Roster</h1>
            <p className="text-sm text-gray-500">
              {canManage
                ? <span className="inline-flex items-center gap-1 text-green-700"><ShieldCheck className="w-4 h-4" /> You can manage this roster</span>
                : <span className="inline-flex items-center gap-1 text-gray-500"><Lock className="w-4 h-4" /> View only — a department supervisor publishes changes</span>}
              {data && <> · Published v{data.currentVersion}{data.lastPublishedAt ? ` on ${new Date(data.lastPublishedAt).toLocaleDateString()}` : ' — not yet published'}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn-secondary text-sm p-2" aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value + 'T00:00:00Z')))} className="input-field text-sm py-1.5" />
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn-secondary text-sm p-2" aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
      {msg && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      {/* Publish bar */}
      {canManage && data && data.pendingChanges > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 flex items-center justify-between gap-3">
          <span className="text-sm text-amber-800">
            <strong>{data.pendingChanges}</strong> unpublished change(s) this week
            {data.draftCount > 0 && <> — {data.draftCount} addition(s)</>}
            {data.pendingRemovalCount > 0 && <>{data.draftCount > 0 ? ',' : ' —'} {data.pendingRemovalCount} removal(s)</>}
            . Removals stay live until you publish.
          </span>
          <button onClick={publish} className="btn-primary text-sm inline-flex items-center gap-1"><UploadCloud className="w-4 h-4" /> Publish roster</button>
        </div>
      )}

      {/* Add assignment (managers only) */}
      {canManage && data && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Plus className="w-4 h-4" /> Add assignment (draft)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <div className="lg:col-span-2">
              <label className="label">Staff</label>
              <select className="input-field" value={fStaff} onChange={(e) => setFStaff(e.target.value)}>
                <option value="">Select staff…</option>
                {eligibleStaff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Day</label>
              <select className="input-field" value={fDate} onChange={(e) => setFDate(e.target.value)}>
                {days.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Shift</label>
              <select className="input-field" value={fShift} onChange={(e) => setFShift(e.target.value)}>{SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            {data.department.subRoles.length > 0 && (
              <div>
                <label className="label">Sub-role</label>
                <select className="input-field" value={fSub} onChange={(e) => setFSub(e.target.value)}><option value="">—</option>{data.department.subRoles.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
            )}
            {data.department.seniorityLevels.length > 0 && (
              <div>
                <label className="label">Seniority</label>
                <select className="input-field" value={fSen} onChange={(e) => setFSen(e.target.value)}><option value="">—</option>{data.department.seniorityLevels.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
              </div>
            )}
            <div>
              <label className="label">Location</label>
              <select className="input-field" value={fLoc} onChange={(e) => setFLoc(e.target.value)}>{LOCATIONS.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}</select>
            </div>
            <div className="lg:col-span-5">
              <label className="label">Notes (optional)</label>
              <input className="input-field" value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="e.g. holding area cover" />
            </div>
            <button onClick={addRow} className="btn-primary text-sm inline-flex items-center justify-center gap-1 h-[38px]"><Plus className="w-4 h-4" /> Add</button>
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
          <span className="text-[11px] text-gray-400 ml-auto inline-flex items-center gap-1"><Move className="w-3.5 h-3.5" /> drag draft chips between cells to reschedule</span>
        )}
      </div>
      {showCopyDay && canManage && (
        <div className="card flex flex-wrap items-end gap-2">
          <div><label className="label">From day</label>
            <select className="input-field" value={copySrc} onChange={(e) => setCopySrc(e.target.value)}><option value="">Select…</option>{days.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}</select></div>
          <div><label className="label">To day</label>
            <select className="input-field" value={copyDst} onChange={(e) => setCopyDst(e.target.value)}><option value="">Select…</option>{days.map((d) => <option key={d} value={d}>{DAY_LABEL(d)}</option>)}</select></div>
          <button onClick={copyDay} className="btn-primary text-sm">Copy day</button>
        </div>
      )}

      {/* Conflict banner (cross-department double-booking) */}
      {conflictList.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {conflictList.length} double-booking conflict(s) this week</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {conflictList.slice(0, 6).map((c, i) => (
              <li key={i}>{c.staffName} — {DAY_LABEL(c.date)} {c.shift} ({c.count} assignments)</li>
            ))}
            {conflictList.length > 6 && <li>…and {conflictList.length - 6} more</li>}
          </ul>
        </div>
      )}

      {/* Week grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px] grid grid-cols-8 gap-2">
            <div className="text-xs font-semibold text-gray-400 pt-8">Shift</div>
            {days.map((d) => <div key={d} className="text-xs font-semibold text-gray-600 text-center pb-1">{DAY_LABEL(d)}</div>)}
            {SHIFTS.map((shift) => (
              <FragmentRow key={shift} shift={shift} days={days} rowsFor={rowsFor} canManage={!!canManage}
                onDelete={deleteRow} onStage={stageRemoval} onMove={moveRow} conflictIds={conflictIds}
                dragId={dragId} setDragId={setDragId} />
            ))}
          </div>
        </div>
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

function FragmentRow({ shift, days, rowsFor, canManage, onDelete, onStage, onMove, conflictIds, dragId, setDragId }: {
  shift: string; days: string[]; rowsFor: (d: string, s: string) => Row[]; canManage: boolean;
  onDelete: (id: string) => void; onStage: (id: string, pendingRemoval: boolean) => void;
  onMove: (id: string, date: string, shift: string) => void; conflictIds: Set<string>;
  dragId: string | null; setDragId: (id: string | null) => void;
}) {
  return (
    <>
      <div className="text-xs font-semibold text-gray-500 flex items-center">{shift}</div>
      {days.map((d) => {
        const rows = rowsFor(d, shift);
        return (
          <div key={d + shift}
            className="min-h-[52px] rounded border border-gray-100 bg-gray-50/40 p-1 space-y-1"
            onDragOver={(e) => { if (canManage && dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (canManage && dragId) onMove(dragId, d, shift); setDragId(null); }}
          >
            {rows.map((r) => {
              const staged = r.status === 'PUBLISHED' && r.pendingRemoval;
              const conflict = conflictIds.has(r.id);
              const cls = staged
                ? 'bg-red-50 text-red-800 line-through'
                : r.status === 'DRAFT' ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900';
              const isDraft = r.status === 'DRAFT';
              return (
                <div key={r.id}
                  draggable={canManage && isDraft}
                  onDragStart={() => setDragId(r.id)}
                  onDragEnd={() => setDragId(null)}
                  title={conflict ? 'Double-booked this day/shift' : (canManage && isDraft ? 'Drag to reschedule' : undefined)}
                  className={`text-[11px] rounded px-1.5 py-1 flex items-start justify-between gap-1 ${cls} ${conflict ? 'ring-2 ring-red-400' : ''} ${canManage && isDraft ? 'cursor-move' : ''}`}>
                  <span className="leading-tight">
                    {conflict ? <AlertCircle className="w-3 h-3 text-red-500 inline mr-0.5 -mt-0.5" /> : null}
                    {r.staffName}
                    {r.subRole ? <span className="block text-[10px] opacity-70 no-underline">{r.subRole}</span> : null}
                    {r.seniorityLevel ? <span className="block text-[10px] opacity-70 no-underline">{r.seniorityLevel.replace(/_/g, ' ')}</span> : null}
                    {staged ? <span className="block text-[9px] font-semibold text-red-600 no-underline">will be removed on publish</span> : null}
                  </span>
                  {canManage && (
                    isDraft ? (
                      <button onClick={() => onDelete(r.id)} className="text-red-500 hover:text-red-700 flex-shrink-0" aria-label="Remove draft"><Trash2 className="w-3 h-3" /></button>
                    ) : staged ? (
                      <button onClick={() => onStage(r.id, false)} className="text-primary-600 hover:text-primary-700 flex-shrink-0" aria-label="Keep (undo removal)"><RotateCcw className="w-3 h-3" /></button>
                    ) : (
                      <button onClick={() => onStage(r.id, true)} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label="Stage removal"><Trash2 className="w-3 h-3" /></button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
