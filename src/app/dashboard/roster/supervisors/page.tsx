'use client';

/**
 * Appointing the person who runs a department's duty roster.
 *
 * Before this, the only way to let somebody edit the porters' roster was to
 * make them a THEATRE_MANAGER — which hands over every other theatre-manager
 * power in the system as the price of one roster. So this grants exactly one
 * thing: edit and publish rights over one named department.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ShieldCheck, UserPlus, Trash2, Loader2, Search } from 'lucide-react';
import { ROSTER_ADMIN_ROLES, ROSTER_DEPARTMENTS } from '@/lib/rosterDepartments';

interface Supervisor {
  id: string;
  deptSlug: string;
  assignedAt: string;
  notes: string | null;
  user: { id: string; fullName: string; role: string; staffCode: string | null; phoneNumber: string | null };
  assignedBy: { id: string; fullName: string } | null;
}
interface DeptBlock { slug: string; label: string; supervisors: Supervisor[] }
interface StaffOption { id: string; fullName: string; role: string; staffCode: string | null }

export default function RosterSupervisorsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const mayAppoint = !!role && ROSTER_ADMIN_ROLES.includes(role);

  const [departments, setDepartments] = useState<DeptBlock[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [deptSlug, setDeptSlug] = useState(ROSTER_DEPARTMENTS[0]?.slug ?? '');
  const [search, setSearch] = useState('');
  const [pickedUser, setPickedUser] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/roster/supervisors', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setDepartments(Array.isArray(d.departments) ? d.departments : []);
      } else if (r.status === 403) {
        setError('Only an administrator or theatre manager may appoint roster supervisors.');
      }
    } catch {
      setError('Could not load the current supervisors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/users?status=APPROVED', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const rows = Array.isArray(d) ? d : d.users ?? [];
        setStaff(rows.map((u: any) => ({ id: u.id, fullName: u.fullName, role: u.role, staffCode: u.staffCode ?? null })));
      })
      .catch(() => { /* the picker degrades to empty; the message below covers it */ });
  }, []);

  const matches = search.trim().length < 2
    ? []
    : staff.filter((u) =>
        `${u.fullName} ${u.staffCode ?? ''} ${u.role}`.toLowerCase().includes(search.trim().toLowerCase()),
      ).slice(0, 8);

  const assign = async () => {
    if (!pickedUser || !deptSlug) { setError('Choose a department and a member of staff.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/roster/supervisors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pickedUser, deptSlug, notes: notes.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Could not appoint that supervisor.'); return; }
      setPickedUser(''); setSearch(''); setNotes('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string, slug: string, name: string) => {
    if (!window.confirm(`Stand ${name} down from the ${slug.replace(/-/g, ' ')} roster? They keep their account and every other permission.`)) return;
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/roster/supervisors?userId=${encodeURIComponent(userId)}&dept=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? 'Could not remove that supervisor.');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <Link href="/dashboard/roster/departments" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Department rosters
      </Link>

      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
        <ShieldCheck className="w-7 h-7 text-teal-600" /> Roster supervisors
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        A supervisor may edit, bulk-upload and publish the duty roster for the one department named
        here. Nothing else about their account changes.
      </p>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {mayAppoint && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900"><UserPlus className="w-5 h-5 text-teal-600" /> Appoint a supervisor</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Department</label>
              <select className="input-field" value={deptSlug} onChange={(e) => setDeptSlug(e.target.value)}>
                {ROSTER_DEPARTMENTS.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Member of staff</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  className="input-field pl-8"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPickedUser(''); }}
                  placeholder="Type a name or staff code"
                />
              </div>
              {matches.length > 0 && !pickedUser && (
                <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                  {matches.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setPickedUser(u.id); setSearch(u.fullName); }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {u.fullName}
                      <span className="ml-2 text-xs text-gray-400">{u.staffCode ?? u.role.replace(/_/g, ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
              {search.trim().length >= 2 && matches.length === 0 && !pickedUser && (
                <p className="mt-1 text-xs text-gray-500">No approved staff match that.</p>
              )}
            </div>
          </div>

          <div className="mt-3">
            <label className="label">Why (optional)</label>
            <input
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Runs the porters' rota day to day"
            />
          </div>

          <button
            type="button"
            onClick={assign}
            disabled={busy || !pickedUser}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Appoint supervisor
          </button>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          departments.map((d) => (
            <div key={d.slug} className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">{d.label}</div>
              {d.supervisors.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">
                  No supervisor. This roster is managed by the theatre manager and administrators.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {d.supervisors.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{s.user.fullName}</p>
                        <p className="text-xs text-gray-500">
                          {s.user.staffCode ? `${s.user.staffCode} · ` : ''}{s.user.role.replace(/_/g, ' ')}
                          {s.assignedBy ? ` · appointed by ${s.assignedBy.fullName}` : ''}
                          {s.notes ? ` · ${s.notes}` : ''}
                        </p>
                      </div>
                      {mayAppoint && (
                        <button
                          type="button"
                          onClick={() => remove(s.user.id, d.slug, s.user.fullName)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Stand down
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
