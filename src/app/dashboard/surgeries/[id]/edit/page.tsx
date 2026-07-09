'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Calendar, MapPin, AlertCircle, History } from 'lucide-react';
import { WARDS } from '@/lib/constants';

interface Theatre { id: string; name: string; location: string }
interface Surgeon { id: string; fullName: string; role?: string }
interface SurgicalUnit { id: string; name: string; subspecialty: string; location: string }

const ANAES_OPTIONS = [
  { value: '', label: '— Select anaesthesia type —' },
  { value: 'GENERAL', label: 'General Anaesthesia (GA)' },
  { value: 'SPINAL', label: 'Spinal' },
  { value: 'EPIDURAL', label: 'Epidural' },
  { value: 'COMBINED_SPINAL_EPIDURAL', label: 'Combined Spinal-Epidural (CSE)' },
  { value: 'REGIONAL', label: 'Regional / Block' },
  { value: 'SEDATION', label: 'Sedation / MAC' },
  { value: 'LOCAL', label: 'Local (no anaesthetist review)' },
];

const SURGERY_TYPES = ['ELECTIVE', 'URGENT', 'EMERGENCY'] as const;

export default function EditSurgeryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [units, setUnits] = useState<SurgicalUnit[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  // Ward list (built-in defaults + custom wards created by admins).
  const [wards, setWards] = useState<string[]>([...WARDS]);
  useEffect(() => {
    fetch('/api/wards')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.wards) && d.wards.length) setWards(d.wards); })
      .catch(() => {});
  }, []);

  // Editable fields
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [location, setLocation] = useState('');
  const [theatreId, setTheatreId] = useState('');
  const [unit, setUnit] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [surgeonId, setSurgeonId] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [indication, setIndication] = useState('');
  const [surgeryType, setSurgeryType] = useState<string>('ELECTIVE');
  const [anesthesiaType, setAnesthesiaType] = useState('');
  const [otherSpecialNeeds, setOtherSpecialNeeds] = useState('');
  const [needBloodTransfusion, setNeedBloodTransfusion] = useState(false);
  const [needDiathermy, setNeedDiathermy] = useState(false);
  const [needStereo, setNeedStereo] = useState(false);
  const [needStirups, setNeedStirups] = useState(false);
  const [needMontrellMattress, setNeedMontrellMattress] = useState(false);

  // Patient ward (the patient may be moved to a different ward after booking)
  const [patientWard, setPatientWard] = useState('');
  const [patientName, setPatientName] = useState('');
  const [originalWard, setOriginalWard] = useState('');

  // Audit history of reschedules / updates
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [sRes, tRes, suRes, unRes, locRes, audRes] = await Promise.all([
          fetch(`/api/surgeries/${id}`),
          fetch('/api/theatres'),
          fetch('/api/users?role=SURGEON&status=APPROVED'),
          fetch('/api/surgical-units?activeOnly=true'),
          fetch('/api/locations'),
          fetch(`/api/audit-logs?tableName=surgeries&recordId=${id}`),
        ]);
        if (!sRes.ok) throw new Error('Failed to load surgery');
        const s = await sRes.json();
        setScheduledDate(s.scheduledDate ? new Date(s.scheduledDate).toISOString().slice(0, 10) : '');
        setScheduledTime(s.scheduledTime || '');
        setLocation(s.location || '');
        setTheatreId(s.theatreId || '');
        setUnit(s.unit || '');
        setSubspecialty(s.subspecialty || '');
        setSurgeonId(s.surgeonId || '');
        setProcedureName(s.procedureName || '');
        setIndication(s.indication || '');
        setSurgeryType(s.surgeryType || 'ELECTIVE');
        setAnesthesiaType(s.anesthesiaType || '');
        setOtherSpecialNeeds(s.otherSpecialNeeds || '');
        setNeedBloodTransfusion(!!s.needBloodTransfusion);
        setNeedDiathermy(!!s.needDiathermy);
        setNeedStereo(!!s.needStereo);
        setNeedStirups(!!s.needStirups);
        setNeedMontrellMattress(!!s.needMontrellMattress);

        const ward = s.patient?.ward || '';
        setPatientWard(ward);
        setOriginalWard(ward);
        setPatientName(s.patient?.name || '');

        if (tRes.ok) setTheatres(await tRes.json());
        if (suRes.ok) {
          const data = await suRes.json();
          setSurgeons(Array.isArray(data) ? data : (data?.users ?? []));
        }
        if (unRes.ok) setUnits(await unRes.json());
        if (locRes.ok) setLocations(await locRes.json());
        if (audRes.ok) {
          const a = await audRes.json();
          setHistory(Array.isArray(a) ? a : (a?.logs ?? []));
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load case');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const filteredTheatres = location
    ? theatres.filter((t) => t.location === location)
    : theatres;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/surgeries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate,
          scheduledTime,
          location: location || null,
          theatreId: theatreId || null,
          unit,
          subspecialty,
          surgeonId: surgeonId || null,
          procedureName,
          indication,
          surgeryType,
          anesthesiaType: anesthesiaType || null,
          otherSpecialNeeds,
          needBloodTransfusion,
          needDiathermy,
          needStereo,
          needStirups,
          needMontrellMattress,
          patientWard,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to update case');
      }
      setSuccess('Case updated. Ward / location / theatre changes are tracked in the audit log.');
      setOriginalWard(patientWard);
      // Refresh audit history
      try {
        const a = await fetch(`/api/audit-logs?tableName=surgeries&recordId=${id}`);
        if (a.ok) {
          const data = await a.json();
          setHistory(Array.isArray(data) ? data : (data?.logs ?? []));
        }
      } catch { /* ignore */ }
    } catch (err: any) {
      setError(err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card text-center py-10 text-gray-500">Loading case…</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/surgeries/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Booked Case</h1>
          <p className="text-sm text-gray-500">
            Update the patient&apos;s <strong>ward</strong> and other booking details. The scheduled
            <strong> date</strong> and <strong>time</strong> stay fixed, and every change is recorded in the audit log.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-3 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-400 p-3 text-sm text-green-800">
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Patient ward — editable in case the patient is moved after booking */}
        <div className="card">
          <h2 className="font-semibold mb-1">Patient Ward / Location</h2>
          <p className="text-xs text-gray-500 mb-3">
            {patientName ? <>For <strong>{patientName}</strong>. </> : null}
            Change the ward if the patient has been transferred since the case was booked.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="patientWard">Current Ward</label>
              <select
                id="patientWard"
                value={patientWard}
                onChange={(e) => setPatientWard(e.target.value)}
                className="input-field"
              >
                <option value="">— Select ward —</option>
                {wards.map((w) => <option key={w} value={w}>{w}</option>)}
                {patientWard && !wards.includes(patientWard) && (
                  <option value={patientWard}>{patientWard}</option>
                )}
              </select>
            </div>
            {patientWard !== originalWard && (
              <div className="flex items-end">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 w-full">
                  Ward will change from <strong>{originalWard || '—'}</strong> to <strong>{patientWard || '—'}</strong> and be logged.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="card grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label flex items-center gap-1"><Calendar className="w-4 h-4" /> Date (fixed)</label>
            <input
              type="date"
              value={scheduledDate}
              readOnly
              disabled
              title="The scheduled date cannot be changed here"
              className="input-field bg-gray-100 cursor-not-allowed text-gray-600"
            />
          </div>
          <div>
            <label className="label">Time (fixed)</label>
            <input
              type="time"
              value={scheduledTime}
              readOnly
              disabled
              title="The scheduled time cannot be changed here"
              className="input-field bg-gray-100 cursor-not-allowed text-gray-600"
            />
          </div>

          <div>
            <label className="label flex items-center gap-1"><MapPin className="w-4 h-4" /> Location</label>
            <select
              value={location}
              onChange={(e) => { setLocation(e.target.value); setTheatreId(''); }}
              className="input-field"
            >
              <option value="">— Select location —</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Theatre</label>
            <select
              value={theatreId}
              onChange={(e) => setTheatreId(e.target.value)}
              className="input-field"
            >
              <option value="">— Select theatre —</option>
              {filteredTheatres.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.location})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Surgical Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input-field">
              <option value="">— Select unit —</option>
              {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Subspecialty</label>
            <input value={subspecialty} onChange={(e) => setSubspecialty(e.target.value)} className="input-field" />
          </div>

          <div>
            <label className="label">Surgeon</label>
            <select value={surgeonId} onChange={(e) => setSurgeonId(e.target.value)} className="input-field">
              <option value="">— Select surgeon —</option>
              {surgeons.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Surgery Type</label>
            <select value={surgeryType} onChange={(e) => setSurgeryType(e.target.value)} className="input-field">
              {SURGERY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Procedure Name</label>
            <input value={procedureName} onChange={(e) => setProcedureName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Indication</label>
            <input value={indication} onChange={(e) => setIndication(e.target.value)} className="input-field" />
          </div>

          <div className="md:col-span-2">
            <label className="label">Proposed Anaesthesia Type</label>
            <select value={anesthesiaType} onChange={(e) => setAnesthesiaType(e.target.value)} className="input-field">
              {ANAES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {anesthesiaType === 'LOCAL' && (
              <p className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                Local cases do not require pre-anaesthetic review.
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="label">Other Special Needs</label>
            <textarea
              value={otherSpecialNeeds}
              onChange={(e) => setOtherSpecialNeeds(e.target.value)}
              className="input-field"
              rows={2}
            />
          </div>

          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            {[
              { k: 'blood', label: 'Blood transfusion', v: needBloodTransfusion, set: setNeedBloodTransfusion },
              { k: 'diath', label: 'Diathermy', v: needDiathermy, set: setNeedDiathermy },
              { k: 'stereo', label: 'Stereo', v: needStereo, set: setNeedStereo },
              { k: 'stir', label: 'Stirrups', v: needStirups, set: setNeedStirups },
              { k: 'mont', label: 'Montrell mattress', v: needMontrellMattress, set: setNeedMontrellMattress },
            ].map((f) => (
              <label key={f.k} className="flex items-center gap-2 p-2 rounded border bg-gray-50">
                <input type="checkbox" checked={f.v} onChange={(e) => f.set(e.target.checked)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link href={`/dashboard/surgeries/${id}`} className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Audit history */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold">Change history</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No previous edits recorded.</p>
        ) : (
          <ul className="divide-y text-sm">
            {history
              .filter((h) => ['RESCHEDULE', 'UPDATE'].includes(h.action))
              .map((h) => {
                let parsed: any = {};
                try { parsed = JSON.parse(h.changes || '{}'); } catch { parsed = { raw: h.changes }; }
                const isReschedule = h.action === 'RESCHEDULE';
                const rows = humaniseChanges(parsed, isReschedule, { theatres, surgeons, units });
                return (
                  <li key={h.id} className="py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isReschedule ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                        {isReschedule ? 'Re-scheduled' : 'Edited'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {h.user?.fullName || h.userId} · {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No tracked field changes.</p>
                    ) : (
                      <table className="w-full text-xs border rounded overflow-hidden">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="text-left px-2 py-1 w-1/4">Field</th>
                            {isReschedule && <th className="text-left px-2 py-1 w-1/3">From</th>}
                            <th className="text-left px-2 py-1">{isReschedule ? 'To' : 'Value'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {rows.map((r) => (
                            <tr key={r.field} className="hover:bg-gray-50">
                              <td className="px-2 py-1 font-medium text-gray-700">{r.label}</td>
                              {isReschedule && <td className="px-2 py-1 text-gray-500 line-through">{r.from ?? '—'}</td>}
                              <td className="px-2 py-1 text-gray-900">{r.to ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

// === Audit-log humaniser ===
const FIELD_LABELS: Record<string, string> = {
  scheduledDate: 'Date',
  scheduledTime: 'Time',
  location: 'Location',
  theatreId: 'Theatre',
  patientWard: 'Patient ward',
  unit: 'Surgical unit',
  subspecialty: 'Subspecialty',
  surgeonId: 'Surgeon',
  surgeonName: 'Surgeon (name)',
  procedureName: 'Procedure',
  indication: 'Indication',
  surgeryType: 'Surgery type',
  anesthesiaType: 'Anaesthesia type',
  status: 'Status',
  needBloodTransfusion: 'Blood transfusion',
  needDiathermy: 'Diathermy',
  needStereo: 'Stereo',
  needStirups: 'Stirrups',
  needMontrellMattress: 'Montrell mattress',
  needCArm: 'C-arm',
  needMicroscope: 'Microscope',
  needSuction: 'Suction',
  needPneumaticTourniquet: 'Pneumatic tourniquet',
  needICU: 'ICU bed',
  otherSpecialNeeds: 'Other special needs',
  remarks: 'Remarks',
};

const HIDDEN_KEYS = new Set(['updatedAt', 'createdAt']);

function formatValue(field: string, val: any, lookups: { theatres: Theatre[]; surgeons: Surgeon[]; units: SurgicalUnit[] }): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (field === 'scheduledDate') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  }
  if (field === 'theatreId') {
    const t = lookups.theatres.find((x) => x.id === val);
    return t ? `${t.name} (${t.location})` : String(val);
  }
  if (field === 'surgeonId') {
    const s = lookups.surgeons.find((x) => x.id === val);
    return s ? s.fullName : String(val);
  }
  return String(val);
}

function humaniseChanges(
  parsed: any,
  isReschedule: boolean,
  lookups: { theatres: Theatre[]; surgeons: Surgeon[]; units: SurgicalUnit[] },
): { field: string; label: string; from?: string; to?: string }[] {
  if (!parsed || typeof parsed !== 'object') return [];
  return Object.entries(parsed)
    .filter(([k]) => !HIDDEN_KEYS.has(k))
    .map(([field, raw]) => {
      const label = FIELD_LABELS[field] || field;
      if (isReschedule && raw && typeof raw === 'object' && 'from' in (raw as any) && 'to' in (raw as any)) {
        const r = raw as { from: any; to: any };
        return {
          field,
          label,
          from: formatValue(field, r.from, lookups),
          to: formatValue(field, r.to, lookups),
        };
      }
      return { field, label, to: formatValue(field, raw, lookups) };
    });
}
