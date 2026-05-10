'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Stethoscope, RefreshCw, Calendar, Building2, MapPin, AlertTriangle,
  Droplet, Eye, Filter, Users
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Surgery {
  id: string;
  patient?: {
    name?: string;
    folderNumber?: string;
    age?: number;
    gender?: string;
    ward?: string;
  };
  surgeon?: { fullName?: string } | null;
  surgeonName?: string | null;
  procedureName: string;
  indication?: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  surgeryType?: string;
  subspecialty?: string;
  unit?: string;
  location?: string | null;
  theatreId?: string | null;
  theatreName?: string | null;
  theatre?: { id: string; name: string; location: string } | null;
  needBloodTransfusion?: boolean;
  needDiathermy?: boolean;
  needStereo?: boolean;
  needStirups?: boolean;
  needMontrellMattress?: boolean;
  otherSpecialNeeds?: string | null;
  anesthesiaType?: string | null;
}

type GroupMode = 'unit' | 'theatre';

export default function AnaesthetistBoardPage() {
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>(() => {
    // Default = today
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [statusFilter, setStatusFilter] = useState<string>('SCHEDULED');
  const [groupMode, setGroupMode] = useState<GroupMode>('unit');

  const load = async () => {
    setRefreshing(true);
    try {
      const url = statusFilter === 'ALL'
        ? '/api/surgeries'
        : `/api/surgeries?status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSurgeries(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    return surgeries.filter((s) => {
      if (!dateFilter) return true;
      const d = new Date(s.scheduledDate);
      return d.toISOString().slice(0, 10) === dateFilter;
    });
  }, [surgeries, dateFilter]);

  const groups = useMemo(() => {
    const m = new Map<string, Surgery[]>();
    for (const s of filtered) {
      const key = groupMode === 'unit'
        ? (s.unit || s.subspecialty || 'Unassigned')
        : (s.theatreName || s.theatre?.name || s.location || 'Theatre TBD');
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    // Sort cases inside each group by scheduled time
    Array.from(m.values()).forEach(arr =>
      arr.sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
    );
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupMode]);

  const totals = useMemo(() => {
    const t = { total: filtered.length, emergency: 0, blood: 0, untyped: 0 };
    for (const s of filtered) {
      if (s.surgeryType === 'EMERGENCY') t.emergency++;
      if (s.needBloodTransfusion) t.blood++;
      if (!s.anesthesiaType) t.untyped++;
    }
    return t;
  }, [filtered]);

  const summariseSpecialNeeds = (s: Surgery): string[] => {
    const tags: string[] = [];
    if (s.needBloodTransfusion) tags.push('Blood');
    if (s.needDiathermy) tags.push('Diathermy');
    if (s.needStereo) tags.push('Stereo');
    if (s.needStirups) tags.push('Stirrups');
    if (s.needMontrellMattress) tags.push('Montrell');
    if (s.otherSpecialNeeds) tags.push('Other');
    return tags;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Stethoscope className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Anaesthetist Review Board</h1>
            <p className="text-sm text-gray-500">All booked cases grouped by surgical unit and theatre, for pre-op review.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card flex items-center gap-3">
          <Calendar className="w-6 h-6 text-indigo-600" />
          <div>
            <div className="text-2xl font-bold">{totals.total}</div>
            <div className="text-xs text-gray-500">Cases on board</div>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <div>
            <div className="text-2xl font-bold">{totals.emergency}</div>
            <div className="text-xs text-gray-500">Emergencies</div>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <Droplet className="w-6 h-6 text-rose-600" />
          <div>
            <div className="text-2xl font-bold">{totals.blood}</div>
            <div className="text-xs text-gray-500">Need transfusion</div>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <Users className="w-6 h-6 text-amber-600" />
          <div>
            <div className="text-2xl font-bold">{totals.untyped}</div>
            <div className="text-xs text-gray-500">Anaesthesia type pending</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input-field"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by scheduled date"
          />
        </div>
        <div>
          <label className="label">Status</label>
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Status filter"
          >
            <option value="ALL">All</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_HOLDING_AREA">In Holding</option>
            <option value="READY_FOR_THEATRE">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div>
          <label className="label">Group by</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGroupMode('unit')}
              className={`px-3 py-2 rounded-lg text-sm border ${groupMode === 'unit' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              <Building2 className="w-4 h-4 inline mr-1" />
              Surgical Unit
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('theatre')}
              className={`px-3 py-2 rounded-lg text-sm border ${groupMode === 'theatre' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              <MapPin className="w-4 h-4 inline mr-1" />
              Theatre
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setDateFilter(''); setStatusFilter('SCHEDULED'); setGroupMode('unit'); }}
          className="ml-auto text-xs text-gray-600 hover:text-gray-800 underline"
        >
          <Filter className="w-3 h-3 inline mr-1" />
          Reset filters
        </button>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="card text-center py-10 text-gray-500">Loading cases…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          No cases match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([groupName, items], gi) => (
            <div key={groupName} className="card">
              <div className="flex items-center justify-between mb-3 border-b pb-2">
                <h2 className="text-lg font-semibold text-gray-800">
                  {gi + 1}. {groupName}
                  <span className="text-sm text-gray-500 font-normal ml-2">
                    ({items.length} case{items.length === 1 ? '' : 's'})
                  </span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age / Sex</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ward</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Diagnosis / Indication</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {groupMode === 'unit' ? 'Theatre' : 'Surgical Unit'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date / Time</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Anaesthesia</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Special</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((s, i) => {
                      const tags = summariseSpecialNeeds(s);
                      return (
                        <tr key={s.id} className="hover:bg-indigo-50/40">
                          <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{s.patient?.name || 'Unknown'}</div>
                            <div className="text-xs text-gray-500">{s.patient?.folderNumber || 'N/A'}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {s.patient?.age ?? '?'}{s.patient?.gender ? ' / ' + s.patient.gender : ''}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{s.patient?.ward || '—'}</td>
                          <td className="px-3 py-2 text-gray-900">{s.procedureName}</td>
                          <td className="px-3 py-2 text-gray-700">{s.indication || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {s.surgeon?.fullName || s.surgeonName || <span className="text-gray-400 italic">Not assigned</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {groupMode === 'unit'
                              ? (s.theatreName || s.theatre?.name || s.location || '—')
                              : (s.unit || s.subspecialty || '—')
                            }
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div>{formatDate(s.scheduledDate)}</div>
                            <div className="text-xs text-gray-500">{s.scheduledTime}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              s.surgeryType === 'EMERGENCY' ? 'bg-red-100 text-red-700' :
                              s.surgeryType === 'URGENT' ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {s.surgeryType || 'ELECTIVE'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {s.anesthesiaType ? (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                ['LOCAL','NONE'].includes(String(s.anesthesiaType).toUpperCase())
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-purple-100 text-purple-700'
                              }`}>
                                {s.anesthesiaType}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {tags.length === 0 ? <span className="text-xs text-gray-400 italic">None</span> :
                                tags.map(t => (
                                  <span key={t} className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs border border-amber-200">{t}</span>
                                ))
                              }
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Link
                              href={`/dashboard/surgeries/${s.id}`}
                              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 text-sm"
                              title="View case"
                            >
                              <Eye className="w-4 h-4" /> View
                            </Link>
                            <Link
                              href={`/dashboard/surgeries/${s.id}/edit`}
                              className="inline-flex items-center gap-1 ml-3 text-amber-600 hover:text-amber-800 text-sm"
                              title="Edit case (date/time/location tracked)"
                            >
                              ✏ Edit
                            </Link>
                            <Link
                              href={`/dashboard/preop-reviews?surgeryId=${s.id}`}
                              className="inline-flex items-center gap-1 ml-3 text-emerald-600 hover:text-emerald-800 text-sm"
                              title="Pre-op review"
                            >
                              <Stethoscope className="w-4 h-4" /> Review
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
