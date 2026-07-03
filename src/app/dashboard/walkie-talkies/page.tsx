'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radio, RefreshCw, LogOut, LogIn, MapPin, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Log {
  id: string;
  deviceSerial: string;
  staffName: string;
  staffRole: string | null;
  location: string;
  status: string;
  pickupAt: string;
  returnAt: string | null;
  notes: string | null;
}

interface Staff {
  id: string;
  fullName: string;
  role: string;
}

// Preset radio serials. Staff can also type a serial that isn't listed.
const PRESET_SERIALS = Array.from({ length: 20 }, (_, i) => `PRT${i + 1}`);

function fmt(dt: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function WalkieTalkiePage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [serialsOut, setSerialsOut] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Pickup form
  const [staffId, setStaffId] = useState('');
  const [serial, setSerial] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/walkie-talkies?status=ALL', { cache: 'no-store' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setLogs(json.logs || []);
      setStaff(json.staff || []);
      setSerialsOut(json.serialsOut || []);
      setLocation(json.location || '');
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickup = async () => {
    if (!staffId) { setError('Select the porter/cleaner picking up the radio.'); return; }
    if (!serial.trim()) { setError('Select or enter the radio serial number.'); return; }
    setSubmitting(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/walkie-talkies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, deviceSerial: serial.trim(), notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record pickup');
      setMsg(`Radio ${json.deviceSerial} picked up by ${json.staffName}.`);
      setStaffId(''); setSerial(''); setNotes('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const doReturn = async (id: string) => {
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/walkie-talkies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record return');
      setMsg(`Radio ${json.deviceSerial} returned.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const outLogs = logs.filter((l) => l.status === 'OUT');
  const returnedLogs = logs.filter((l) => l.status === 'RETURNED').slice(0, 50);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white shadow">
          <Radio className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Walkie-Talkie Radios</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {location || 'UNTH Ituku-Ozalla'}
          </p>
        </div>
        <button onClick={load} className="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {msg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{msg}</div>}

      {/* Pickup */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <LogOut className="w-4 h-4 text-slate-600" /> Pick up a radio
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Porter / Cleaner</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" aria-label="Staff">
              <option value="">Select staff…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.role})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Radio serial</label>
            <input
              list="radio-serials"
              value={serial}
              onChange={(e) => setSerial(e.target.value.toUpperCase())}
              placeholder="e.g. PRT1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <datalist id="radio-serials">
              {PRESET_SERIALS.filter((s) => !serialsOut.includes(s)).map((s) => <option key={s} value={s} />)}
            </datalist>
            {serial && serialsOut.includes(serial.trim().toUpperCase()) && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> This radio is currently out.</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shift / condition" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-3">
          <button onClick={pickup} disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
            <LogOut className="w-4 h-4" /> {submitting ? 'Recording…' : 'Submit pickup'}
          </button>
        </div>
      </div>

      {/* Out now — return section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <LogIn className="w-4 h-4 text-emerald-600" /> Radios out ({outLogs.length}) — return at end of shift
        </h2>
        {outLogs.length === 0 ? (
          <p className="text-sm text-gray-400">No radios are currently out.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3">Radio</th>
                  <th className="py-2 px-3">Staff</th>
                  <th className="py-2 px-3">Picked up</th>
                  <th className="py-2 px-3">Location</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {outLogs.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-semibold text-gray-800">{l.deviceSerial}</td>
                    <td className="py-2 px-3 text-gray-700">{l.staffName}{l.staffRole ? ` (${l.staffRole})` : ''}</td>
                    <td className="py-2 px-3 text-gray-600"><Clock className="w-3 h-3 inline mr-1" />{fmt(l.pickupAt)}</td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{l.location}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => doReturn(l.id)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
                        <LogIn className="w-3 h-3" /> Return
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recently returned</h2>
        {returnedLogs.length === 0 ? (
          <p className="text-sm text-gray-400">No returns recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3">Radio</th>
                  <th className="py-2 px-3">Staff</th>
                  <th className="py-2 px-3">Picked up</th>
                  <th className="py-2 px-3">Returned</th>
                </tr>
              </thead>
              <tbody>
                {returnedLogs.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium text-gray-800">{l.deviceSerial}</td>
                    <td className="py-2 px-3 text-gray-700">{l.staffName}{l.staffRole ? ` (${l.staffRole})` : ''}</td>
                    <td className="py-2 px-3 text-gray-600">{fmt(l.pickupAt)}</td>
                    <td className="py-2 px-3 text-gray-600">{fmt(l.returnAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
