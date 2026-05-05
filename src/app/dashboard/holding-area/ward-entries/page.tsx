'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, RefreshCw, Save, CheckCircle2, AlertTriangle,
  Search, Clock, User, FileSignature,
} from 'lucide-react';

interface CallUp {
  id: string;
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  ward: string | null;
  procedureName: string;
  surgeonName: string;
  theatreName: string;
  status: string;
  invitedAt: string;
  callUpNoteNumber: string | null;
  theatrePorterArrivedAtWardTime: string | null;
  theatrePorterDepartedWardTime: string | null;
  wardNurseName: string | null;
  wardNurseSignaturePresent: boolean;
  wardEntriesNotes: string | null;
  wardEntriesRecordedById: string | null;
  wardEntriesRecordedByName: string | null;
  wardEntriesRecordedAt: string | null;
}

interface FormState {
  arrived: string;
  departed: string;
  nurseName: string;
  signaturePresent: boolean;
  notes: string;
}

const toHHmm = (iso: string | null): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
};

export default function WardEntriesPage() {
  const [callUps, setCallUps] = useState<CallUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchCallUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/call-for-patient?view=history');
      if (!res.ok) throw new Error('Failed to load call-ups');
      const data: CallUp[] = await res.json();
      // Only INVITED / PATIENT_EN_ROUTE / PATIENT_ARRIVED are relevant
      const filtered = data.filter(c =>
        ['INVITED', 'PATIENT_EN_ROUTE', 'PATIENT_ARRIVED'].includes(c.status)
      );
      setCallUps(filtered);

      // Hydrate form state from existing values (only for entries not currently being edited)
      setForms(prev => {
        const next: Record<string, FormState> = { ...prev };
        for (const c of filtered) {
          if (!next[c.id]) {
            next[c.id] = {
              arrived: toHHmm(c.theatrePorterArrivedAtWardTime),
              departed: toHHmm(c.theatrePorterDepartedWardTime),
              nurseName: c.wardNurseName || '',
              signaturePresent: !!c.wardNurseSignaturePresent,
              notes: c.wardEntriesNotes || '',
            };
          }
        }
        return next;
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCallUps();
    const t = setInterval(fetchCallUps, 30000);
    return () => clearInterval(t);
  }, [fetchCallUps]);

  const updateForm = (id: string, patch: Partial<FormState>) => {
    setForms(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSave = async (callUp: CallUp) => {
    const f = forms[callUp.id];
    if (!f) return;
    if (!f.arrived && !f.departed && !f.nurseName.trim()) {
      setError('Enter at least the arrival/departure time or ward nurse name');
      setTimeout(() => setError(null), 3000);
      return;
    }
    setSavingId(callUp.id);
    try {
      const res = await fetch(`/api/call-for-patient/${callUp.id}/ward-entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatrePorterArrivedAtWardTime: f.arrived || null,
          theatrePorterDepartedWardTime: f.departed || null,
          wardNurseName: f.nurseName.trim() || null,
          wardNurseSignaturePresent: f.signaturePresent,
          wardEntriesNotes: f.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'Failed to save');
      }
      setSuccess(`Saved ward entries for ${callUp.patientName}`);
      setTimeout(() => setSuccess(null), 3000);
      fetchCallUps();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
      setTimeout(() => setError(null), 4000);
    } finally {
      setSavingId(null);
    }
  };

  const filtered = callUps.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.patientName.toLowerCase().includes(q) ||
      c.folderNumber.toLowerCase().includes(q) ||
      c.ward?.toLowerCase().includes(q) ||
      c.theatreName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-indigo-600" />
            Ward Escort Log Entries
          </h1>
          <p className="text-gray-600 mt-1">
            Holding-area nurse: transcribe the handwritten porter times and ward-nurse signature
            from the Call-for-Patient printout.
          </p>
        </div>
        <button
          onClick={fetchCallUps}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search patient, folder, ward, theatre..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      {loading && callUps.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-gray-600">No active call-ups for today.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(c => {
            const f = forms[c.id] || { arrived: '', departed: '', nurseName: '', signaturePresent: false, notes: '' };
            const recorded = !!c.wardEntriesRecordedAt;
            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl shadow-sm border ${recorded ? 'border-green-300' : 'border-gray-200'} p-5`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {c.patientName}{' '}
                      <span className="text-sm font-normal text-gray-500">({c.folderNumber})</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {c.procedureName} · {c.surgeonName} · Theatre <b>{c.theatreName}</b>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Ward: <b>{c.ward || 'N/A'}</b> · Invited at {new Date(c.invitedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {c.callUpNoteNumber && <> · Ref <code className="text-[10px]">{c.callUpNoteNumber.slice(0, 8)}</code></>}
                    </div>
                  </div>
                  {recorded && (
                    <div className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Recorded by {c.wardEntriesRecordedByName} ·{' '}
                      {new Date(c.wardEntriesRecordedAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Porter arrived at ward
                    </span>
                    <input
                      type="time"
                      value={f.arrived}
                      onChange={e => updateForm(c.id, { arrived: e.target.value })}
                      className="mt-1 w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Porter departed ward
                    </span>
                    <input
                      type="time"
                      value={f.departed}
                      onChange={e => updateForm(c.id, { departed: e.target.value })}
                      className="mt-1 w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      <User className="w-3 h-3" /> Ward nurse name
                    </span>
                    <input
                      type="text"
                      value={f.nurseName}
                      onChange={e => updateForm(c.id, { nurseName: e.target.value })}
                      placeholder="As written on printout"
                      className="mt-1 w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="flex items-center gap-2 mt-5 md:mt-6">
                    <input
                      type="checkbox"
                      checked={f.signaturePresent}
                      onChange={e => updateForm(c.id, { signaturePresent: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700 flex items-center gap-1">
                      <FileSignature className="w-4 h-4" /> Signature on printout
                    </span>
                  </label>
                  <button
                    onClick={() => handleSave(c)}
                    disabled={savingId === c.id}
                    className="mt-1 md:mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingId === c.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {recorded ? 'Update' : 'Save'}
                  </button>
                </div>

                <label className="block mt-3">
                  <span className="text-xs font-medium text-gray-700">Notes (optional)</span>
                  <textarea
                    value={f.notes}
                    onChange={e => updateForm(c.id, { notes: e.target.value })}
                    rows={2}
                    placeholder="e.g. delay due to lift, ward nurse handed bedhead ticket..."
                    className="mt-1 w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
