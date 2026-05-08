'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Radio, AlertOctagon, Plus, Trash2, Megaphone, History, CheckCircle2 } from 'lucide-react';

interface Broadcast {
  id: string;
  title: string;
  category: string;
  message?: string | null;
  audioUrl?: string | null;
  priority: number;
  daysOfWeek: string;
  timeOfDay?: string | null;
  intervalMins?: number | null;
  active: boolean;
  lastTriggered?: string | null;
}

interface AnnouncementRow {
  id: string;
  category: string;
  title: string;
  message: string;
  priority: number;
  status: string;
  location?: string | null;
  triggerSource: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  acks?: { userName?: string | null; userRole?: string | null; responseSecs?: number | null; createdAt: string }[];
}

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

const CATEGORIES = ['WELCOME', 'RULES', 'MUSIC', 'ANNOUNCEMENT', 'CUSTOM'] as const;
const ANNOUNCE_CATEGORIES = ['EMERGENCY', 'STAFF_REQUEST', 'WORKFLOW', 'CONFIRMATION', 'CUSTOM'] as const;

export default function RadioAdminPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isAdmin = ADMIN_ROLES.includes(role);

  const [tab, setTab] = useState<'announce' | 'schedule' | 'audit'>('announce');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [audit, setAudit] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(false);

  // announce form
  const [aCategory, setACategory] = useState<(typeof ANNOUNCE_CATEGORIES)[number]>('EMERGENCY');
  const [aTitle, setATitle] = useState('');
  const [aMessage, setAMessage] = useState('');
  const [aLocation, setALocation] = useState('');
  const [aSpecialty, setASpecialty] = useState('');
  const [aUrgency, setAUrgency] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('CRITICAL');
  const [aRequireAck, setARequireAck] = useState(true);
  const [aRepeat, setARepeat] = useState(true);

  // schedule form
  const [bTitle, setBTitle] = useState('');
  const [bCategory, setBCategory] = useState<(typeof CATEGORIES)[number]>('WELCOME');
  const [bMessage, setBMessage] = useState('');
  const [bAudioUrl, setBAudioUrl] = useState('');
  const [bDays, setBDays] = useState('1,2,3,4,5');
  const [bTime, setBTime] = useState('08:00');
  const [bInterval, setBInterval] = useState('');

  const loadBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/radio/broadcasts', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setBroadcasts(d.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/radio/audit?limit=50', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setAudit(d.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'schedule') loadBroadcasts();
    if (tab === 'audit') loadAudit();
  }, [tab, loadBroadcasts, loadAudit]);

  const submitAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch('/api/radio/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: aCategory,
        title: aTitle,
        message: aMessage,
        location: aLocation || undefined,
        specialty: aSpecialty || undefined,
        urgency: aCategory === 'EMERGENCY' ? aUrgency : undefined,
        requireAck: aRequireAck,
        repeatUntilAck: aRepeat,
        triggerSource: 'MANUAL',
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error ?? 'Failed to broadcast');
      return;
    }
    setATitle('');
    setAMessage('');
    setALocation('');
    setASpecialty('');
    alert('Announcement queued — the radio will speak it on every connected workstation.');
  };

  const submitBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: any = {
      title: bTitle,
      category: bCategory,
      daysOfWeek: bDays,
    };
    if (bMessage) body.message = bMessage;
    if (bAudioUrl) body.audioUrl = bAudioUrl;
    if (bTime) body.timeOfDay = bTime;
    if (bInterval) body.intervalMins = Number(bInterval);

    const r = await fetch('/api/radio/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error ?? 'Failed to save');
      return;
    }
    setBTitle('');
    setBMessage('');
    setBAudioUrl('');
    setBInterval('');
    loadBroadcasts();
  };

  const toggleActive = async (b: Broadcast) => {
    await fetch(`/api/radio/broadcasts/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !b.active }),
    });
    loadBroadcasts();
  };

  const deleteBroadcast = async (b: Broadcast) => {
    if (!confirm(`Delete broadcast "${b.title}"?`)) return;
    await fetch(`/api/radio/broadcasts/${b.id}`, { method: 'DELETE' });
    loadBroadcasts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Radio className="w-8 h-8 text-primary-600" /> Theatre Radio Service
        </h1>
        <div className="flex gap-2">
          {(['announce', 'schedule', 'audit'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg font-semibold capitalize ${
                tab === t ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              {t === 'announce' ? 'Broadcast' : t === 'schedule' ? 'Schedules' : 'Audit'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'announce' && (
        <form
          onSubmit={submitAnnouncement}
          className="bg-white rounded-xl shadow border border-gray-200 p-6 space-y-4 max-w-3xl"
        >
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="w-5 h-5 text-red-600" /> New Announcement
          </div>
          {!isAdmin && (
            <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
              Note: only theatre managers and admins can broadcast emergency announcements; others may be rejected.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              Category
              <select
                value={aCategory}
                onChange={(e) => setACategory(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
              >
                {ANNOUNCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            {aCategory === 'EMERGENCY' && (
              <label className="block text-sm">
                Urgency
                <select
                  value={aUrgency}
                  onChange={(e) => setAUrgency(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm md:col-span-2">
              Title
              <input
                required
                value={aTitle}
                onChange={(e) => setATitle(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="e.g. Emergency case in Theatre 3"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              Message (this is what the radio will speak)
              <textarea
                required
                rows={3}
                value={aMessage}
                onChange={(e) => setAMessage(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="e.g. Emergency cardiothoracic case incoming, all team members report immediately."
              />
            </label>
            <label className="block text-sm">
              Location
              <input
                value={aLocation}
                onChange={(e) => setALocation(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="Theatre 3"
              />
            </label>
            <label className="block text-sm">
              Specialty
              <input
                value={aSpecialty}
                onChange={(e) => setASpecialty(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="Cardiothoracic"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aRequireAck} onChange={(e) => setARequireAck(e.target.checked)} />
              Require staff acknowledgment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aRepeat} onChange={(e) => setARepeat(e.target.checked)} />
              Repeat until acknowledged
            </label>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-2"
          >
            <AlertOctagon className="w-4 h-4" /> Broadcast Now
          </button>
        </form>
      )}

      {tab === 'schedule' && (
        <div className="space-y-6">
          {isAdmin && (
            <form
              onSubmit={submitBroadcast}
              className="bg-white rounded-xl shadow border border-gray-200 p-6 space-y-4 max-w-3xl"
            >
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Plus className="w-5 h-5 text-primary-600" /> New Scheduled Broadcast
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm md:col-span-2">
                  Title
                  <input required value={bTitle} onChange={(e) => setBTitle(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </label>
                <label className="block text-sm">
                  Category
                  <select value={bCategory} onChange={(e) => setBCategory(e.target.value as any)} className="w-full mt-1 px-3 py-2 border rounded-lg">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  Days of week (CSV, 0=Sun)
                  <input value={bDays} onChange={(e) => setBDays(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </label>
                <label className="block text-sm">
                  Time of day (HH:mm) — leave blank for interval-only
                  <input value={bTime} onChange={(e) => setBTime(e.target.value)} placeholder="08:00" className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </label>
                <label className="block text-sm">
                  Repeat every (minutes) — optional
                  <input value={bInterval} onChange={(e) => setBInterval(e.target.value)} placeholder="e.g. 60" className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </label>
                <label className="block text-sm md:col-span-2">
                  Message (TTS) — or leave blank and provide audio URL
                  <textarea rows={2} value={bMessage} onChange={(e) => setBMessage(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </label>
                <label className="block text-sm md:col-span-2">
                  Audio URL (optional, e.g. uploaded mp3)
                  <input value={bAudioUrl} onChange={(e) => setBAudioUrl(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg" />
                </label>
              </div>
              <button type="submit" className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold">
                Save Broadcast
              </button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Days</th>
                  <th className="px-3 py-2 text-left">Time / Interval</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Last Triggered</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">{loading ? 'Loading…' : 'No scheduled broadcasts yet.'}</td></tr>
                )}
                {broadcasts.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{b.title}</td>
                    <td className="px-3 py-2">{b.category}</td>
                    <td className="px-3 py-2">{b.daysOfWeek}</td>
                    <td className="px-3 py-2">{b.timeOfDay ?? (b.intervalMins ? `every ${b.intervalMins}m` : '—')}</td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <button
                          onClick={() => toggleActive(b)}
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${b.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                        >
                          {b.active ? 'Active' : 'Paused'}
                        </button>
                      ) : (
                        <span className={b.active ? 'text-green-700' : 'text-gray-500'}>{b.active ? 'Active' : 'Paused'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{b.lastTriggered ? new Date(b.lastTriggered).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin && (
                        <button onClick={() => deleteBroadcast(b)} className="text-red-600 hover:text-red-800" title="Delete broadcast" aria-label="Delete broadcast">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 flex items-center gap-2 font-semibold text-gray-700">
            <History className="w-5 h-5" /> Recent announcements
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Acks</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">{loading ? 'Loading…' : 'No announcements yet.'}</td></tr>
              )}
              {audit.map((a) => (
                <tr key={a.id} className="border-t align-top">
                  <td className="px-3 py-2 text-xs text-gray-600">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{a.category}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-gray-500 truncate max-w-md">{a.message}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{a.triggerSource}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      a.status === 'ACKNOWLEDGED' ? 'bg-green-100 text-green-700' :
                      a.status === 'EXPIRED' ? 'bg-gray-200 text-gray-600' :
                      a.status === 'CANCELLED' ? 'bg-gray-200 text-gray-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.acks && a.acks.length > 0 ? (
                      <ul className="space-y-1">
                        {a.acks.map((k, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-600" />
                            {k.userName ?? 'Staff'} ({k.userRole}) — {k.responseSecs ?? '?'}s
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
