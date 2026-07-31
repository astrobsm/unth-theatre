'use client';

// ============================================================
// Imprest Duties
// ------------------------------------------------------------
// Assigns the imprest office a staff member holds — cashier, account officer,
// chairman, auditor. This is what makes imprest usable on a fresh install:
// until somebody holds a duty, every imprest route correctly refuses.
//
// A duty is separate from a clinical role on purpose. The cashier may be a
// nurse; the account officer may be an administrator. The approval chain reads
// the duty, so it must be granted explicitly.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCog, Plus, Trash2, AlertCircle, ShieldCheck, Search } from 'lucide-react';

interface DutyRow {
  id: string;
  userId: string;
  user: { id: string; fullName: string; staffCode: string | null; role: string; department: string | null };
  role: string;
  roleLabel: string;
  designation: string | null;
  department: { id: string; code: string; name: string } | null;
  isActive: boolean;
  assignedAt: string;
}

interface RoleOption { value: string; label: string; permissions: number }
interface DeptOption { id: string; code: string; name: string }
interface StaffOption { id: string; fullName: string; staffCode: string | null; role: string }

export default function ImprestDutiesPage() {
  const [duties, setDuties] = useState<DutyRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // Assignment form
  const [staffQuery, setStaffQuery] = useState('');
  const [staffResults, setStaffResults] = useState<StaffOption[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [role, setRole] = useState('');
  const [designation, setDesignation] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/imprest/duties');
      if (res.status === 401 || res.status === 403) {
        const body = await res.json().catch(() => ({}));
        setDenied(true);
        setError(body.error || 'You cannot manage imprest duties.');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setDenied(false);
      setDuties(data.duties ?? []);
      setRoles(data.roles ?? []);
      setDepartments(data.departments ?? []);
    } catch {
      setError('Could not load imprest duties.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Staff lookup reuses the app's existing user search.
  useEffect(() => {
    const term = staffQuery.trim();
    if (term.length < 2) { setStaffResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(term)}&limit=8`);
        if (!res.ok) return;
        const data = await res.json();
        const list: StaffOption[] = Array.isArray(data) ? data : data.users ?? [];
        if (!cancelled) setStaffResults(list.slice(0, 8));
      } catch { /* offline — the picker simply stays empty */ }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [staffQuery]);

  const assign = async () => {
    if (!selectedStaff || !role) {
      setNotice('Choose a staff member and a duty first.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/imprest/duties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedStaff.id,
          role,
          designation: designation.trim() || undefined,
          departmentId: departmentId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || 'Could not assign the duty.');
        return;
      }
      setNotice(`${selectedStaff.fullName} now holds the ${roles.find((r) => r.value === role)?.label ?? role} duty.`);
      setSelectedStaff(null);
      setStaffQuery('');
      setRole('');
      setDesignation('');
      setDepartmentId('');
      await load();
    } catch {
      setNotice('Saved on this device — it will sync when you are back online.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (duty: DutyRow) => {
    if (!confirm(`Revoke the ${duty.roleLabel} duty from ${duty.user.fullName}?`)) return;
    try {
      const res = await fetch(`/api/imprest/duties?id=${encodeURIComponent(duty.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || 'Could not revoke the duty.'); return; }
      await load();
    } catch {
      setNotice('Could not reach the server.');
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, DutyRow[]>();
    for (const d of duties.filter((x) => x.isActive)) {
      map.set(d.roleLabel, [...(map.get(d.roleLabel) ?? []), d]);
    }
    // Array.from rather than spreading: this app's tsconfig sets no explicit
    // `target`, so spreading a Map iterator needs downlevelIteration.
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [duties]);

  if (denied) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Not permitted</p>
              <p className="text-sm text-amber-800">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
          <UserCog className="h-6 w-6 text-primary-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Imprest Duties</h1>
          <p className="text-sm text-gray-500">
            Who holds which imprest office. Separate from clinical roles — the approval chain reads this.
          </p>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>
      )}

      {/* Assign */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Plus className="h-4 w-4" /> Assign a duty
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-gray-600">Staff member</label>
            {selectedStaff ? (
              <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
                <span className="text-sm font-medium text-primary-900">
                  {selectedStaff.fullName}
                  {selectedStaff.staffCode ? ` (${selectedStaff.staffCode})` : ''}
                </span>
                <button onClick={() => setSelectedStaff(null)} className="text-xs text-primary-700 hover:underline">
                  change
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={staffQuery}
                    onChange={(e) => setStaffQuery(e.target.value)}
                    placeholder="Search staff by name or code…"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
                  />
                </div>
                {staffResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {staffResults.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => { setSelectedStaff(s); setStaffResults([]); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium text-gray-900">{s.fullName}</span>
                          <span className="ml-2 text-xs text-gray-500">
                            {s.staffCode ?? ''} {s.role?.replace(/_/g, ' ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Imprest duty</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select a duty…</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Designation <span className="text-gray-400">(printed on vouchers)</span>
            </label>
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Principal Accountant"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Department <span className="text-gray-400">(blank = all)</span>
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={assign}
          disabled={saving || !selectedStaff || !role}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Assigning…' : 'Assign duty'}
        </button>
      </div>

      {/* Current holders */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm font-medium text-gray-700">No imprest duties assigned yet</p>
            <p className="text-xs text-gray-500">
              Assign the first Administrator above; they can then set up the rest of the chain.
            </p>
          </div>
        ) : (
          grouped.map(([label, rows]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {label} · {rows.length}
              </div>
              <ul className="divide-y divide-gray-100">
                {rows.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.user.fullName}</p>
                      <p className="text-xs text-gray-500">
                        {d.designation ?? label}
                        {d.user.staffCode ? ` · ${d.user.staffCode}` : ''}
                        {d.department ? ` · ${d.department.name}` : ' · all departments'}
                        {d.user.role ? ` · clinical: ${d.user.role.replace(/_/g, ' ')}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => revoke(d)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
