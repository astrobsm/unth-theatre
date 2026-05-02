'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, Trash2, UploadCloud, Link as LinkIcon, Copy, Check } from 'lucide-react';

interface Submission {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  role: string;
  phoneNumber: string | null;
  department: string | null;
  staffCode: string | null;
  staffId: string | null;
  title: string | null;
  notes: string | null;
  status: string;
  importedAt: string | null;
  importError: string | null;
  createdAt: string;
}

interface ImportResult {
  created: number;
  createdUsernames?: string[];
  errors: { id: string; row: number; username: string; error: string }[];
  message?: string;
}

export default function OnboardingSubmissionsPanel({ onImportedRefresh }: { onImportedRefresh?: () => void }) {
  const [items, setItems]       = useState<Submission[]>([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState<'PENDING' | 'IMPORTED' | 'ALL'>('PENDING');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/onboarding`
      : '/onboarding';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const url = '/api/onboarding' + (filter === 'ALL' ? '' : `?status=${filter}`);
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setItems(json.submissions || []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const pendingIds = items.filter(i => i.status === 'PENDING').map(i => i.id);
    if (pendingIds.every(id => selected.has(id)) && pendingIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  const importNow = async (mode: 'selected' | 'all') => {
    const ids = mode === 'selected' ? Array.from(selected) : undefined;
    if (mode === 'selected' && ids!.length === 0) {
      alert('Select at least one pending submission to import.');
      return;
    }
    if (!confirm(
      mode === 'all'
        ? 'Import ALL pending submissions as new user accounts?'
        : `Import ${ids!.length} selected submission(s) as new user accounts?`
    )) return;

    setImporting(true);
    setResult(null);
    try {
      const res = await fetch('/api/onboarding/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const json: ImportResult = await res.json();
      setResult(json);
      setSelected(new Set());
      await fetchItems();
      onImportedRefresh?.();
    } catch (e: any) {
      alert('Import failed: ' + (e.message || 'unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this submission permanently?')) return;
    const res = await fetch(`/api/onboarding?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchItems();
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* noop */ }
  };

  const pendingCount = items.filter(i => i.status === 'PENDING').length;

  return (
    <div className="card bg-gradient-to-r from-amber-50 to-blue-50 border border-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <Inbox className="w-6 h-6 mr-2 text-amber-700" />
          Staff Onboarding Submissions
          {pendingCount > 0 && (
            <span className="ml-3 px-2 py-0.5 text-xs rounded-full bg-amber-600 text-white">
              {pendingCount} pending
            </span>
          )}
        </h2>
        <button
          onClick={fetchItems}
          className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Shareable link banner */}
      <div className="bg-white border border-blue-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3">
        <LinkIcon className="w-5 h-5 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-xs text-gray-600">Share this link with staff to fill in their details:</p>
          <code className="text-sm text-blue-800 break-all">{shareUrl}</code>
        </div>
        <button
          onClick={copyLink}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center"
        >
          {linkCopied ? <><Check className="w-4 h-4 mr-1" />Copied</> : <><Copy className="w-4 h-4 mr-1" />Copy link</>}
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-sm bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-50"
        >
          Open
        </a>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select
          aria-label="Filter submissions"
          value={filter}
          onChange={e => { setFilter(e.target.value as any); setSelected(new Set()); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded bg-white"
        >
          <option value="PENDING">Pending only</option>
          <option value="IMPORTED">Imported</option>
          <option value="ALL">All</option>
        </select>

        <button
          onClick={() => importNow('selected')}
          disabled={importing || selected.size === 0}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50 inline-flex items-center"
        >
          <UploadCloud className="w-4 h-4 mr-1" />
          {importing ? 'Importing…' : `Import selected (${selected.size})`}
        </button>

        <button
          onClick={() => importNow('all')}
          disabled={importing || pendingCount === 0}
          className="px-4 py-2 text-sm bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 disabled:opacity-50 inline-flex items-center"
        >
          <UploadCloud className="w-4 h-4 mr-1" />
          Bulk-Upload ALL pending ({pendingCount})
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="mb-3 p-3 bg-white border rounded">
          <p className="text-sm font-semibold text-green-700">
            ✓ {result.message || `Imported ${result.created} user(s)`}
          </p>
          {result.createdUsernames && result.createdUsernames.length > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              Created: {result.createdUsernames.join(', ')}
            </p>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-semibold text-red-700">⚠ {result.errors.length} error(s):</p>
              <div className="max-h-32 overflow-y-auto bg-red-50 rounded p-2 mt-1">
                {result.errors.map(e => (
                  <div key={e.id} className="text-xs text-red-800">
                    <strong>{e.username}:</strong> {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  onChange={toggleAll}
                  checked={
                    items.filter(i => i.status === 'PENDING').length > 0 &&
                    items.filter(i => i.status === 'PENDING').every(i => selected.has(i.id))
                  }
                  aria-label="Select all pending"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Full Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Username</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Role</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Department</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Email</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Phone</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Submitted</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                No submissions yet. Share the link above with your staff.
              </td></tr>
            )}
            {items.map(s => {
              const isPending = s.status === 'PENDING';
              return (
                <tr key={s.id} className={s.importError ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      disabled={!isPending}
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      aria-label={`Select ${s.username}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={s.status} />
                    {s.importError && (
                      <div className="text-[11px] text-red-700 mt-0.5">{s.importError}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-900 font-medium">
                    {s.title ? `${s.title} ` : ''}{s.fullName}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{s.username}</td>
                  <td className="px-3 py-2 text-gray-700">{s.role}</td>
                  <td className="px-3 py-2 text-gray-700">{s.department || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{s.email || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{s.phoneNumber || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(s.id)}
                      className="text-red-600 hover:text-red-800"
                      title="Delete submission"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Imported submissions become user accounts with the username as both login and initial password
        (users are forced to change the password on first login). Duplicate usernames / emails / staff
        codes are skipped and reported as errors.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:  'bg-amber-100 text-amber-800',
    IMPORTED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-gray-200 text-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}
