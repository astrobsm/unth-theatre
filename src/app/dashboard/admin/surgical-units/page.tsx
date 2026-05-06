'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Save, X, AlertCircle, Calendar, Building2 } from 'lucide-react';

interface ScheduleRow {
  id?: string;
  dayOfWeek: number;
  theatreId: string;
  theatreName: string;
  notes?: string | null;
}

interface SurgicalUnit {
  id: string;
  name: string;
  subspecialty: string;
  location: string;
  active: boolean;
  notes?: string | null;
  schedules: ScheduleRow[];
}

interface Theatre { id: string; name: string; location: string; status: string }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

const emptyForm = (): SurgicalUnit => ({
  id: '',
  name: '',
  subspecialty: '',
  location: '',
  active: true,
  notes: '',
  schedules: [],
});

export default function SurgicalUnitsAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [units, setUnits] = useState<SurgicalUnit[]>([]);
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SurgicalUnit | null>(null);
  const [form, setForm] = useState<SurgicalUnit>(emptyForm());
  const [error, setError] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) { router.push('/login'); return; }
    if (!ADMIN_ROLES.includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchAll();
  }, [session, status, router]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [u, t, l] = await Promise.all([
        fetch('/api/surgical-units?activeOnly=false').then((r) => r.json()),
        fetch('/api/theatres').then((r) => r.json()),
        fetch('/api/locations').then((r) => r.json()),
      ]);
      if (Array.isArray(u)) setUnits(u);
      if (Array.isArray(t)) setTheatres(t);
      if (Array.isArray(l)) setLocations(l);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (u: SurgicalUnit) => {
    setEditing(u);
    setForm({ ...u, schedules: u.schedules.map((s) => ({ ...s })) });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setError('');
  };

  const addSchedule = () => {
    setForm((f) => ({
      ...f,
      schedules: [...f.schedules, { dayOfWeek: 1, theatreId: '', theatreName: '' }],
    }));
  };

  const updateSchedule = (idx: number, patch: Partial<ScheduleRow>) => {
    setForm((f) => {
      const next = [...f.schedules];
      next[idx] = { ...next[idx], ...patch };
      // Keep theatreName in sync with theatreId.
      if (patch.theatreId !== undefined) {
        const t = theatres.find((x) => x.id === patch.theatreId);
        next[idx].theatreName = t ? t.name : '';
      }
      return { ...f, schedules: next };
    });
  };

  const removeSchedule = (idx: number) => {
    setForm((f) => ({ ...f, schedules: f.schedules.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim() || !form.subspecialty.trim() || !form.location.trim()) {
      setError('Name, subspecialty and location are required.');
      return;
    }
    for (const s of form.schedules) {
      if (!s.theatreId) {
        setError('Every schedule row must have a theatre.');
        return;
      }
    }
    const payload = {
      name: form.name.trim(),
      subspecialty: form.subspecialty.trim(),
      location: form.location.trim(),
      active: form.active,
      notes: form.notes ?? null,
      schedules: form.schedules.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        theatreId: s.theatreId,
        theatreName: s.theatreName,
        notes: s.notes ?? undefined,
      })),
    };
    const url = editing ? `/api/surgical-units/${editing.id}` : '/api/surgical-units';
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error?.[0]?.message || err.error || 'Save failed');
      return;
    }
    closeForm();
    fetchAll();
  };

  const handleDelete = async (u: SurgicalUnit) => {
    if (!confirm(`Delete surgical unit "${u.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/surgical-units/${u.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Delete failed');
      return;
    }
    fetchAll();
  };

  if (status === 'loading' || loading) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }
  if (!session || !ADMIN_ROLES.includes(session.user.role)) return null;

  const visible = filterLocation
    ? units.filter((u) => u.location === filterLocation)
    : units;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surgical Units</h1>
          <p className="text-gray-600 mt-1">
            Manage surgical units and their day-of-week theatre allocations across all locations.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" /> New Surgical Unit
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-gray-400" />
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="input-field max-w-sm"
            title="Filter by location"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            {visible.length} unit{visible.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Subspecialty</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Schedule</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {visible.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{u.subspecialty}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.location}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {u.schedules.length === 0 ? (
                    <span className="text-xs text-gray-400 italic">No schedule</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.schedules.map((s) => (
                        <span key={s.id || `${s.dayOfWeek}-${s.theatreId}`} className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs">
                          <Calendar className="w-3 h-3 mr-1" />
                          {DAYS[s.dayOfWeek].slice(0, 3)} · {s.theatreName}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(u)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(u)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No surgical units{filterLocation ? ` for ${filterLocation}` : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editing ? `Edit ${editing.name}` : 'New Surgical Unit'}
              </h2>
              <button onClick={closeForm} title="Close" className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Unit Name *</label>
                  <input
                    className="input-field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., GS Unit V"
                  />
                </div>
                <div>
                  <label className="label">Subspecialty *</label>
                  <input
                    className="input-field"
                    value={form.subspecialty}
                    onChange={(e) => setForm({ ...form, subspecialty: e.target.value })}
                    placeholder="e.g., General Surgery"
                  />
                </div>
                <div>
                  <label className="label">Location *</label>
                  <select
                    className="input-field"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    title="Location"
                  >
                    <option value="">— Select —</option>
                    {locations.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select
                    className="input-field"
                    value={form.active ? 'active' : 'inactive'}
                    onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })}
                    title="Status"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Notes</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    title="Notes"
                    placeholder="Optional notes"
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">Day → Theatre Schedule</h3>
                  <button
                    type="button"
                    onClick={addSchedule}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus className="w-3 h-3" /> Add row
                  </button>
                </div>
                {form.schedules.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No schedule rows. Click &ldquo;Add row&rdquo; to assign a theatre on a day.</p>
                )}
                <div className="space-y-2">
                  {form.schedules.map((s, idx) => {
                    const theatresForLocation = theatres.filter((t) => !form.location || t.location === form.location);
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <select
                          className="input-field col-span-4"
                          value={s.dayOfWeek}
                          onChange={(e) => updateSchedule(idx, { dayOfWeek: parseInt(e.target.value, 10) })}
                          title="Day of week"
                        >
                          {DAYS.map((d, i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                        <select
                          className="input-field col-span-7"
                          value={s.theatreId}
                          onChange={(e) => updateSchedule(idx, { theatreId: e.target.value })}
                          title="Theatre"
                        >
                          <option value="">— Select theatre —</option>
                          {theatresForLocation.map((t) => (
                            <option key={t.id} value={t.id}>{t.name} · {t.location}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeSchedule(idx)}
                          className="col-span-1 text-red-600 hover:bg-red-50 rounded p-2"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-2">
              <button
                onClick={closeForm}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
