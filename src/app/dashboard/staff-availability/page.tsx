'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Radar, Search, RefreshCw, Loader2, Phone, MapPin, Save, UserCog } from 'lucide-react';
import { AVAILABILITY_STATUSES, availabilityMeta } from '@/lib/staffAvailability';

interface Staff {
  id: string; fullName: string; role: string; department: string | null; staffId: string | null;
  phoneNumber: string | null; extension: string | null;
  availabilityStatus: string | null; availabilityNote: string | null; currentLocation: string | null; availabilityUpdatedAt: string | null;
}

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

export default function StaffAvailabilityBoard() {
  const { data: sessionData } = useSession();
  const myRole = (sessionData?.user as any)?.role;
  const isAdmin = ADMIN_ROLES.includes(myRole);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(''); const [roleF, setRoleF] = useState(''); const [statusF, setStatusF] = useState('');
  const [msg, setMsg] = useState('');

  // my-status form
  const [myStatus, setMyStatus] = useState(''); const [myLoc, setMyLoc] = useState(''); const [myNote, setMyNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (roleF) sp.set('role', roleF); if (statusF) sp.set('status', statusF); if (q) sp.set('q', q);
    const r = await fetch(`/api/staff/availability?${sp}`, { cache: 'no-store' });
    if (r.ok) { const d = await r.json(); setStaff(d.staff ?? []); setMe(d.me ?? ''); }
    setLoading(false);
  }, [roleF, statusF, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const myRow = useMemo(() => staff.find((s) => s.id === me), [staff, me]);
  useEffect(() => { if (myRow) { setMyStatus(myRow.availabilityStatus ?? ''); setMyLoc(myRow.currentLocation ?? ''); setMyNote(myRow.availabilityNote ?? ''); } }, [myRow]);

  const roles = useMemo(() => Array.from(new Set(staff.map((s) => s.role))).sort(), [staff]);

  const saveMine = async () => {
    if (!myStatus) { setMsg('Pick a status.'); return; }
    const r = await fetch('/api/staff/availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: myStatus, currentLocation: myLoc || null, note: myNote || null }),
    });
    setMsg(r.ok ? 'Your status was updated.' : ((await r.json().catch(() => ({})))?.error || 'Failed'));
    await load();
  };
  const setFor = async (userId: string, status: string) => {
    const r = await fetch('/api/staff/availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, status }),
    });
    if (r.ok) await load(); else setMsg((await r.json().catch(() => ({})))?.error || 'Failed');
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of staff) { const k = s.availabilityStatus ?? 'UNSET'; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [staff]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> Dashboard</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center"><Radar className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Live Staff Availability</h1>
            <p className="text-sm text-gray-500">Current status & location of theatre staff · auto-refreshes every minute</p>
          </div>
        </div>
        <button onClick={load} className="btn-secondary text-sm inline-flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      {msg && <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-sm text-blue-800">{msg}</div>}

      {/* My status */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">My status</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <div>
            <label className="label">Status</label>
            <select className="input-field" value={myStatus} onChange={(e) => setMyStatus(e.target.value)}>
              <option value="">Select…</option>
              {AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{availabilityMeta(s).label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Current location</label>
            <input className="input-field" value={myLoc} onChange={(e) => setMyLoc(e.target.value)} placeholder="e.g. Theatre 3" />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input className="input-field" value={myNote} onChange={(e) => setMyNote(e.target.value)} placeholder="e.g. finishing a case" />
          </div>
          <button onClick={saveMine} className="btn-primary text-sm inline-flex items-center justify-center gap-1 h-[38px]"><Save className="w-4 h-4" /> Update</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
          <input className="input-field pl-8 text-sm py-1.5" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input-field text-sm py-1.5" value={roleF} onChange={(e) => setRoleF(e.target.value)}>
          <option value="">All roles</option>{roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input-field text-sm py-1.5" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All statuses</option>{AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{availabilityMeta(s).label}</option>)}
        </select>
        <div className="flex flex-wrap gap-1 text-xs text-gray-500 ml-auto">
          {['AVAILABLE', 'ON_EMERGENCY_CASE', 'IN_THEATRE'].map((s) => (
            <span key={s} className={`px-2 py-0.5 rounded-full border ${availabilityMeta(s).chip}`}>{availabilityMeta(s).label}: {counts[s] ?? 0}</span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staff.map((s) => {
            const m = availabilityMeta(s.availabilityStatus);
            return (
              <div key={s.id} className={`rounded-lg border p-3 ${s.id === me ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{s.fullName}{s.id === me && <span className="text-[10px] text-emerald-600 ml-1">(you)</span>}</div>
                    <div className="text-xs text-gray-500">{s.role.replace(/_/g, ' ')}{s.staffId ? ` · ${s.staffId}` : ''}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border flex-shrink-0 ${m.chip}`}>
                    <span className={`w-2 h-2 rounded-full ${m.dot}`} /> {m.label}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                  {s.currentLocation && <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" /> {s.currentLocation}</div>}
                  {s.availabilityNote && <div className="text-gray-500 italic truncate">{s.availabilityNote}</div>}
                  {s.phoneNumber && <a href={`tel:${s.phoneNumber}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Phone className="w-3 h-3" /> {s.phoneNumber}{s.extension ? ` · ext ${s.extension}` : ''}</a>}
                  {s.availabilityUpdatedAt && <div className="text-[10px] text-gray-400">Updated {new Date(s.availabilityUpdatedAt).toLocaleString()}</div>}
                </div>
                {isAdmin && s.id !== me && (
                  <div className="mt-2 flex items-center gap-1">
                    <UserCog className="w-3.5 h-3.5 text-gray-400" />
                    <select className="input-field text-[11px] py-0.5" value="" onChange={(e) => e.target.value && setFor(s.id, e.target.value)}>
                      <option value="">Set status…</option>
                      {AVAILABILITY_STATUSES.map((st) => <option key={st} value={st}>{availabilityMeta(st).label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {staff.length === 0 && <p className="text-sm text-gray-400">No staff match the filters.</p>}
        </div>
      )}
    </div>
  );
}
