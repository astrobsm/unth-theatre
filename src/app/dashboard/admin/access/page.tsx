'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Shield, Search, Save, RefreshCw, Users, CheckCircle2, AlertTriangle, XCircle, Building2, Plus } from 'lucide-react';

interface UserRow {
  id: string;
  fullName: string;
  username: string;
  role: string;
  grantCount: number;
  isFullAccess: boolean;
}

interface ModuleEntry {
  id: string;
  label: string;
  paths: string[];
  defaultRoles: string[];
  category?: string;
}

interface ListResponse {
  users: UserRow[];
  modules: ModuleEntry[];
}

interface DetailResponse {
  user: UserRow & { status: string };
  grants: string[];
  modules: ModuleEntry[];
}

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

export default function ModuleAccessAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [modules, setModules] = useState<ModuleEntry[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [grantSet, setGrantSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Group (role-based) grant state.
  const [showGroup, setShowGroup] = useState(false);
  const [groupRoles, setGroupRoles] = useState<string[]>([]);
  const [groupModuleIds, setGroupModuleIds] = useState<Set<string>>(new Set());
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMsg, setGroupMsg] = useState<string | null>(null);

  // Ward management state.
  const [showWards, setShowWards] = useState(false);
  const [wardList, setWardList] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [newWardName, setNewWardName] = useState('');
  const [wardBusy, setWardBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/user-access', { cache: 'no-store' });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = await res.json();
          msg = j.hint ? `${j.hint}\n\n(${j.error || ''})` : (j.error || msg);
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as ListResponse;
      setUsers(data.users);
      setModules(data.modules);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (u: UserRow) => {
    setSelected(u);
    setDetail(null);
    setGrantSet(new Set());
    setError(null);
    try {
      const res = await fetch(`/api/admin/user-access?userId=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as DetailResponse;
      setDetail(data);
      setGrantSet(new Set(data.grants));
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, search]);

  const allRoles = useMemo(() => Array.from(new Set(users.map((u) => u.role))).sort(), [users]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModuleEntry[]>();
    for (const m of modules) {
      const key = m.category || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [modules]);

  const toggle = (id: string) => {
    setGrantSet((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const isDefaultForUser = (m: ModuleEntry) => {
    if (!detail) return false;
    if (detail.user.isFullAccess) return true;
    return m.defaultRoles.includes('*') || m.defaultRoles.includes(detail.user.role);
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/user-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: detail.user.id,
          moduleIds: Array.from(grantSet),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedAt(Date.now());
      await loadList();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    if (!detail) return;
    if (!confirm(`Clear ALL extra grants for ${detail.user.fullName}? They will revert to role defaults only.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/user-access?userId=${encodeURIComponent(detail.user.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      setGrantSet(new Set());
      setSavedAt(Date.now());
      await loadList();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  // ---- Group (role-based) grant handlers ----
  const toggleGroupRole = (r: string) =>
    setGroupRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  const toggleGroupModule = (id: string) =>
    setGroupModuleIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const applyGroupGrant = async (mode: 'add' | 'remove') => {
    if (groupRoles.length === 0 || groupModuleIds.size === 0) {
      setGroupMsg('Select at least one staff group and one module.');
      return;
    }
    setGroupBusy(true);
    setGroupMsg(null);
    try {
      const res = await fetch('/api/admin/user-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: groupRoles, moduleIds: Array.from(groupModuleIds), mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Group grant failed');
      setGroupMsg(
        `${mode === 'add' ? 'Granted' : 'Revoked'} ${groupModuleIds.size} module(s) for ${data.affectedUsers} user(s).`
      );
      await loadList();
    } catch (e: any) {
      setGroupMsg(e.message || String(e));
    } finally {
      setGroupBusy(false);
    }
  };

  // ---- Ward management handlers ----
  const loadWards = useCallback(async () => {
    try {
      const res = await fetch('/api/wards?admin=1', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setWardList(Array.isArray(d.wards) ? d.wards : []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (showWards) loadWards();
  }, [showWards, loadWards]);

  const createWard = async () => {
    const name = newWardName.trim();
    if (name.length < 2) return;
    setWardBusy(true);
    try {
      const res = await fetch('/api/wards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Failed to create ward'); return; }
      setNewWardName('');
      await loadWards();
    } finally {
      setWardBusy(false);
    }
  };

  const toggleWard = async (w: { id: string; active: boolean }) => {
    setWardBusy(true);
    try {
      const res = await fetch('/api/wards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: w.id, active: !w.active }),
      });
      if (res.ok) await loadWards();
    } finally {
      setWardBusy(false);
    }
  };

  const renameWard = async (w: { id: string; name: string }) => {
    const name = prompt('New ward name:', w.name);
    if (!name || name.trim().length < 2) return;
    setWardBusy(true);
    try {
      const res = await fetch('/api/wards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: w.id, name: name.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error || 'Failed to rename ward'); return; }
      await loadWards();
    } finally {
      setWardBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 inline-flex items-center gap-2">
            <Shield className="w-7 h-7 text-indigo-600" /> Module Access Control
          </h1>
          <p className="text-gray-600 mt-2 max-w-3xl">
            Each role gets a default set of modules. Use this page to grant
            additional modules to individual users (for example: let an
            anaesthetist upload the duty roster). Admin / Super-admin /
            Theatre-Manager / Chairman always see every module and cannot be
            restricted here.
          </p>
        </div>
        <button onClick={loadList} disabled={loading} className="btn-secondary inline-flex items-center gap-2 h-10">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="card p-4 border border-red-300 bg-red-50 text-red-800">
          <p className="font-semibold inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Error
          </p>
          <p className="text-sm break-all">{error}</p>
        </div>
      )}

      {/* Quick actions: group access + ward management */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowGroup((s) => !s)}
          className={`btn-secondary inline-flex items-center gap-2 h-10 ${showGroup ? 'ring-2 ring-indigo-400' : ''}`}
        >
          <Users className="w-4 h-4" /> Group Access (by staff group)
        </button>
        <button
          onClick={() => setShowWards((s) => !s)}
          className={`btn-secondary inline-flex items-center gap-2 h-10 ${showWards ? 'ring-2 ring-indigo-400' : ''}`}
        >
          <Building2 className="w-4 h-4" /> Manage Wards
        </button>
      </div>

      {/* GROUP ACCESS — grant/revoke a module for a whole staff group at once */}
      {showGroup && (
        <div className="card p-4 border-2 border-indigo-200">
          <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-indigo-700" /> Group Access
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Grant (or revoke) one or more modules for <span className="font-semibold">every approved user</span> of the
            selected staff group(s) at once — e.g. give all Surgeons and Scrub Nurses access to Theatre Allocation.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">1. Staff group(s)</p>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {allRoles.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupRoles.includes(r)}
                      onChange={() => toggleGroupRole(r)}
                    />
                    {formatRole(r)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">2. Module(s)</p>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {modules.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupModuleIds.has(m.id)}
                      onChange={() => toggleGroupModule(m.id)}
                    />
                    <span className="flex-1">{m.label}</span>
                    {m.category && <span className="text-[10px] text-gray-400">{m.category}</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button
              onClick={() => applyGroupGrant('add')}
              disabled={groupBusy}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              {groupBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              Grant access
            </button>
            <button
              onClick={() => applyGroupGrant('remove')}
              disabled={groupBusy}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Revoke access
            </button>
            {groupMsg && <span className="text-sm text-gray-700">{groupMsg}</span>}
          </div>
        </div>
      )}

      {/* WARD MANAGEMENT — create / rename / activate wards */}
      {showWards && (
        <div className="card p-4 border-2 border-emerald-200">
          <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-emerald-700" /> Ward Management
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Add custom wards or deactivate ones no longer in use. These appear in every ward dropdown across the app
            (patient registration, surgery booking, etc.) alongside the built-in wards.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="text"
              value={newWardName}
              onChange={(e) => setNewWardName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createWard(); }}
              placeholder="New ward name (e.g. PRIVATE WARD - GREEN ROOM)"
              className="input h-10 text-sm flex-1 min-w-[240px]"
            />
            <button
              onClick={createWard}
              disabled={wardBusy || newWardName.trim().length < 2}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add Ward
            </button>
          </div>
          {wardList.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No custom wards yet. Built-in wards are always available.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {wardList.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className={`text-sm font-medium ${w.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                    {w.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => renameWard(w)}
                      disabled={wardBusy}
                      className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => toggleWard(w)}
                      disabled={wardBusy}
                      className={`text-xs px-2 py-1 rounded border disabled:opacity-50 ${
                        w.active
                          ? 'border-red-300 text-red-700 hover:bg-red-50'
                          : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {w.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Users list */}
        <div className="card p-4 lg:col-span-1">
          <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-indigo-700" /> Users
            <span className="text-xs font-normal text-gray-500">({filteredUsers.length})</span>
          </h2>
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name / username / role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-8 h-9 text-sm w-full"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input h-9 text-sm w-full"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {allRoles.map((r) => (
                <option key={r} value={r}>{formatRole(r)}</option>
              ))}
            </select>
          </div>
          <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {filteredUsers.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => loadDetail(u)}
                  className={`w-full text-left py-2 px-2 rounded hover:bg-indigo-50 transition-colors ${
                    selected?.id === u.id ? 'bg-indigo-100' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {u.fullName}{' '}
                    <span className="text-xs text-gray-500 font-normal">@{u.username}</span>
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <span>{formatRole(u.role)}</span>
                    {u.isFullAccess ? (
                      <span className="text-emerald-700 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Full access
                      </span>
                    ) : u.grantCount > 0 ? (
                      <span className="text-indigo-700">+{u.grantCount} extra</span>
                    ) : (
                      <span className="text-gray-400">defaults only</span>
                    )}
                  </p>
                </button>
              </li>
            ))}
            {filteredUsers.length === 0 && (
              <li className="text-sm text-gray-400 italic py-4 text-center">No users match your filter.</li>
            )}
          </ul>
        </div>

        {/* Module grants editor */}
        <div className="card p-4 lg:col-span-2">
          {!selected && (
            <div className="text-center text-gray-400 py-12">
              <Shield className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Select a user on the left to manage their module access.</p>
            </div>
          )}

          {selected && !detail && (
            <div className="text-center text-gray-400 py-12">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>Loading {selected.fullName}&apos;s grants...</p>
            </div>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{detail.user.fullName}</h2>
                  <p className="text-sm text-gray-600">
                    @{detail.user.username} • {formatRole(detail.user.role)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {savedAt && Date.now() - savedAt < 4000 && (
                    <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Saved
                    </span>
                  )}
                  <button onClick={clearAll} disabled={saving} className="btn-secondary inline-flex items-center gap-2 h-9 text-sm">
                    <XCircle className="w-4 h-4" /> Clear extras
                  </button>
                  <button onClick={save} disabled={saving || detail.user.isFullAccess} className="btn-primary inline-flex items-center gap-2 h-9 text-sm">
                    <Save className="w-4 h-4" /> Save
                  </button>
                </div>
              </div>

              {detail.user.isFullAccess && (
                <div className="border border-emerald-300 bg-emerald-50 text-emerald-800 rounded p-3 text-sm inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  This role has full access by default — module grants do not apply.
                </div>
              )}

              <div className="space-y-4">
                {grouped.map(([category, mods]) => (
                  <div key={category}>
                    <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">{category}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {mods.map((m) => {
                        const isDefault = isDefaultForUser(m);
                        const isGranted = grantSet.has(m.id);
                        const effective = isDefault || isGranted;
                        return (
                          <label
                            key={m.id}
                            className={`flex items-start gap-2 p-2 rounded border transition-colors cursor-pointer ${
                              effective
                                ? 'border-indigo-300 bg-indigo-50'
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                            } ${isDefault ? 'opacity-90' : ''}`}
                            title={
                              isDefault
                                ? `Default for role ${formatRole(detail.user.role)}`
                                : 'Extra grant'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              disabled={isDefault || detail.user.isFullAccess}
                              onChange={() => toggle(m.id)}
                              className="mt-1"
                              aria-label={m.label}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                {m.label}
                                {isDefault && (
                                  <span className="text-[10px] uppercase font-semibold bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">
                                    default
                                  </span>
                                )}
                                {!isDefault && isGranted && (
                                  <span className="text-[10px] uppercase font-semibold bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5">
                                    granted
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 font-mono truncate" title={m.paths.join(', ')}>
                                {m.paths.join(', ')}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500 italic">
                Changes take effect on the user&apos;s next page load (or after they sign out and back in).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
