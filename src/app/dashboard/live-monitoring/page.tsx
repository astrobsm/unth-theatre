'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAdaptivePoll } from '@/lib/useAdaptivePoll';
import { Activity, Users, LogIn, RefreshCw, Pause, Play, Clock, ShieldAlert, Search, BarChart3 } from 'lucide-react';

interface OnlineUser {
  userId: string;
  fullName: string;
  username: string;
  role: string;
  lastActiveAt: string;
  lastAction: string;
}

interface ActivityRow {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  tableName: string;
  recordId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface LoginRow {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  username: string;
  loggedInAt: string;
}

interface MonitoringResponse {
  generatedAt: string;
  onlineWindowMinutes: number;
  summary: {
    onlineCount: number;
    eventsLast24h: number;
    loginsToday: number;
    distinctLoginUsersToday: number;
  };
  onlineUsers: OnlineUser[];
  recentActivity: ActivityRow[];
  todayLogins: LoginRow[];
  hourly: { hour: string; count: number }[];
  topActions: { action: string; count: number }[];
}

const POLL_MS = 7000;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ');
}

function actionTone(action: string): string {
  if (action === 'LOGIN') return 'bg-green-100 text-green-800 border-green-300';
  if (action === 'LOGOUT') return 'bg-gray-100 text-gray-700 border-gray-300';
  if (action.includes('DELETE')) return 'bg-red-100 text-red-800 border-red-300';
  if (action.includes('UPDATE') || action.includes('EDIT')) return 'bg-amber-100 text-amber-800 border-amber-300';
  if (action.includes('CREATE') || action.includes('ADD')) return 'bg-blue-100 text-blue-800 border-blue-300';
  return 'bg-purple-100 text-purple-800 border-purple-300';
}

export default function LiveMonitoringPage() {
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/live-monitoring', { cache: 'no-store' });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setData((await res.json()) as MonitoringResponse);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A 7s poll on an admin dashboard that is routinely left open all day. It was
  // gated only on the manual Pause toggle, so a forgotten background tab cost a
  // steady 8.5 req/min. Now it also backs off when hidden or on a slow link and
  // stops entirely while offline.
  useAdaptivePoll(
    useCallback(async () => { await load(); }, [load]),
    POLL_MS,
    { enabled: !paused, leading: false }
  );

  const filteredActivity = data
    ? data.recentActivity.filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.userName.toLowerCase().includes(q) ||
          r.userRole.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          r.tableName.toLowerCase().includes(q)
        );
      })
    : [];

  const maxBucket = data && data.hourly.length ? Math.max(...data.hourly.map((b) => b.count), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 inline-flex items-center gap-2">
            <Activity className="w-7 h-7 text-emerald-600" /> Live Monitoring
          </h1>
          <p className="text-gray-600 mt-2 max-w-3xl">
            Real-time view of who is logged in and what they are doing right now. Auto-refreshes every {POLL_MS / 1000}s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="btn-secondary inline-flex items-center gap-2 h-10"
            aria-label={paused ? 'Resume polling' : 'Pause polling'}
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="btn-primary inline-flex items-center gap-2 h-10"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 border border-red-300 bg-red-50 text-red-800">
          <p className="font-semibold inline-flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Failed to load:
          </p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-900">
              <Users className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Online now</span>
            </div>
            <p className="text-3xl font-bold text-emerald-900 mt-1">{data.summary.onlineCount}</p>
            <p className="text-xs text-emerald-700 mt-1">Active in last {data.onlineWindowMinutes}m</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center gap-2 text-blue-900">
              <LogIn className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Logins today</span>
            </div>
            <p className="text-3xl font-bold text-blue-900 mt-1">{data.summary.loginsToday}</p>
            <p className="text-xs text-blue-700 mt-1">{data.summary.distinctLoginUsersToday} distinct user(s)</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="flex items-center gap-2 text-purple-900">
              <BarChart3 className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Events last 24h</span>
            </div>
            <p className="text-3xl font-bold text-purple-900 mt-1">{data.summary.eventsLast24h}</p>
            <p className="text-xs text-purple-700 mt-1">All audit log entries</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <div className="flex items-center gap-2 text-amber-900">
              <Clock className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Last refresh</span>
            </div>
            <p className="text-2xl font-bold text-amber-900 mt-1">{timeAgo(data.generatedAt)}</p>
            <p className="text-xs text-amber-700 mt-1">{paused ? 'Polling paused' : `Auto-refresh every ${POLL_MS / 1000}s`}</p>
          </div>
        </div>
      )}

      {/* 24h activity histogram */}
      {data && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-700" /> Activity per hour (last 24h)
          </h2>
          <div className="flex items-end gap-1 h-32">
            {data.hourly.map((b) => {
              const pct = Math.round((b.count / maxBucket) * 100);
              const d = new Date(b.hour);
              return (
                <div
                  key={b.hour}
                  className="flex-1 flex flex-col items-center justify-end group"
                  title={`${d.getHours()}:00 — ${b.count} event(s)`}
                >
                  <div
                    className="w-full bg-purple-500 rounded-t hover:bg-purple-700 transition-colors"
                    style={{ height: `${Math.max(2, pct)}%` }}
                  />
                  <span className="text-[10px] text-gray-500 mt-1">{d.getHours()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Online users + Today's logins */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-700" /> Currently online
              </h2>
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                {data.onlineUsers.length}
              </span>
            </div>
            {data.onlineUsers.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No one active in the last {data.onlineWindowMinutes} minutes.</p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {data.onlineUsers.map((u) => (
                  <li key={u.userId} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {u.fullName}{' '}
                          <span className="text-xs text-gray-500 font-normal">@{u.username}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {formatRole(u.role)} • last action: <span className="font-mono">{u.lastAction}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{timeAgo(u.lastActiveAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
                <LogIn className="w-4 h-4 text-blue-700" /> Today&apos;s logins
              </h2>
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                {data.todayLogins.length}
              </span>
            </div>
            {data.todayLogins.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No logins recorded today yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {data.todayLogins.map((l) => (
                  <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {l.userName}{' '}
                        <span className="text-xs text-gray-500 font-normal">@{l.username}</span>
                      </p>
                      <p className="text-xs text-gray-500 truncate">{formatRole(l.userRole)}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(l.loggedInAt).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Top actions */}
      {data && data.topActions.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Top actions (last 24h)</h2>
          <div className="flex flex-wrap gap-2">
            {data.topActions.map((a) => (
              <span
                key={a.action}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${actionTone(a.action)}`}
              >
                <span className="font-mono">{a.action}</span>
                <span className="ml-1 opacity-70">×{a.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity feed */}
      {data && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-900 inline-flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-700" /> Recent activity feed
            </h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter user / role / action / table..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-8 h-9 text-sm w-72"
                aria-label="Filter activity"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Table</th>
                  <th className="py-2 pr-3">Record</th>
                  <th className="py-2 pr-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredActivity.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-400 italic">
                      No activity yet.
                    </td>
                  </tr>
                )}
                {filteredActivity.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{timeAgo(r.createdAt)}</td>
                    <td className="py-2 pr-3 font-medium text-gray-900">{r.userName}</td>
                    <td className="py-2 pr-3 text-gray-600">{formatRole(r.userRole)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${actionTone(r.action)}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-600 font-mono text-xs">{r.tableName}</td>
                    <td className="py-2 pr-3 text-gray-500 font-mono text-xs truncate max-w-[160px]" title={r.recordId || ''}>
                      {r.recordId || '—'}
                    </td>
                    <td className="py-2 pr-3 text-gray-500 font-mono text-xs">{r.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
