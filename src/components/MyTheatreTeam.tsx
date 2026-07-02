'use client';

import { useEffect, useState, useCallback } from 'react';
import { Building2, Stethoscope, Wrench, UserRound, Users2, Search, RefreshCw } from 'lucide-react';

interface Anaesthetist {
  id: string;
  fullName: string;
  role: string;
  tier: string;
}

interface Allocation {
  id: string;
  theatre: string;
  theatreLocation: string | null;
  surgicalUnit: string | null;
  surgeryType: string | null;
  shift: string | null;
  startTime: string;
  endTime: string;
  anaesthetists: Anaesthetist[];
  anaestheticTechnician: string | null;
  scrubNurse: string | null;
  circulatingNurse: string | null;
  notes: string | null;
  teamAssigned?: boolean;
  surgeons?: string | null;
  caseCount?: number | null;
}

interface SurgicalUnit {
  id: string;
  name: string;
}

function todayIso() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function MyTheatreTeam() {
  const [units, setUnits] = useState<SurgicalUnit[]>([]);
  const [unit, setUnit] = useState('');
  const [date, setDate] = useState(todayIso());
  const [allocations, setAllocations] = useState<Allocation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/surgical-units')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.units || [];
        setUnits(list.map((u: any) => ({ id: u.id, name: u.name })).filter((u: any) => u.name));
      })
      .catch(() => {});
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ date });
      if (unit) qs.set('unit', unit);
      const res = await fetch(`/api/allocations/team-view?${qs.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAllocations(json.allocations || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load theatre team');
      setAllocations(null);
    } finally {
      setLoading(false);
    }
  }, [unit, date]);

  return (
    <div className="card border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-indigo-600 p-3 rounded-lg flex-shrink-0">
          <Users2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">My Theatre Team</h2>
          <p className="text-sm text-gray-600">Select your unit and date to see the theatre and care team assigned</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Surgical Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
            aria-label="Surgical unit"
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.name}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
            aria-label="Date"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={search}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Loading…' : 'View Team'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {allocations !== null && !loading && (
        allocations.length === 0 ? (
          <div className="p-4 bg-white border border-gray-200 rounded-lg text-center text-gray-500 text-sm">
            No cases or theatre allocation found for {unit ? `“${unit}”` : 'any unit'} on {new Date(`${date}T00:00:00`).toLocaleDateString()}.
            {unit ? ' Check the unit name and date, or confirm cases have been booked for this day.' : ''}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {allocations.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                    <span className="font-bold text-gray-900">{a.theatre}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    {a.surgicalUnit && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">{a.surgicalUnit}</span>}
                    {a.shift && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{a.shift}</span>}
                    {a.surgeryType && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{a.surgeryType}</span>}
                  </div>
                </div>

                {(a.surgeons || a.caseCount != null) && (
                  <div className="mb-3 text-xs text-gray-600">
                    {a.caseCount != null && (
                      <span className="font-medium text-gray-700">{a.caseCount} case{a.caseCount === 1 ? '' : 's'}</span>
                    )}
                    {a.surgeons && <span> · Surgeon(s): {a.surgeons}</span>}
                  </div>
                )}

                {a.teamAssigned === false && (
                  <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    Team not yet allocated for this theatre on this date. Check back once the duty roster / theatre allocation is published.
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Stethoscope className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Anaesthetist(s)</p>
                      {a.anaesthetists.length ? (
                        <ul className="text-gray-800">
                          {a.anaesthetists.map((an) => (
                            <li key={an.id}>{an.fullName} <span className="text-xs text-gray-400">({an.tier})</span></li>
                          ))}
                        </ul>
                      ) : <p className="text-gray-400">Not assigned</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-gray-500">Anaesthetic Technician: </span>
                      <span className="text-gray-800">{a.anaestheticTechnician || <span className="text-gray-400">Not assigned</span>}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <UserRound className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-gray-500">Scrub Nurse: </span>
                      <span className="text-gray-800">{a.scrubNurse || <span className="text-gray-400">Not assigned</span>}</span>
                    </div>
                  </div>

                  {a.circulatingNurse && (
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                      <div>
                        <span className="text-xs text-gray-500">Circulating Nurse: </span>
                        <span className="text-gray-800">{a.circulatingNurse}</span>
                      </div>
                    </div>
                  )}
                </div>

                {a.notes && <p className="mt-3 text-xs text-gray-500 border-t border-gray-100 pt-2">{a.notes}</p>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
