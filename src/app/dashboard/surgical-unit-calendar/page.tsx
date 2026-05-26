'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Building2, MapPin, Filter, Printer } from 'lucide-react';

interface ScheduleRow {
  id: string;
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

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Display weekdays first (Mon-Fri), then weekend
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function SurgicalUnitCalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [units, setUnits] = useState<SurgicalUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSubspecialty, setFilterSubspecialty] = useState('');
  const [view, setView] = useState<'matrix' | 'byDay' | 'byUnit'>('matrix');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/login');
      return;
    }
    load();
  }, [session, status, router]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/surgical-units?activeOnly=true');
      const data = await r.json();
      if (Array.isArray(data)) setUnits(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const locations = useMemo(
    () => Array.from(new Set(units.map((u) => u.location))).sort(),
    [units]
  );
  const subspecialties = useMemo(
    () => Array.from(new Set(units.map((u) => u.subspecialty))).sort(),
    [units]
  );

  const filtered = useMemo(() => {
    return units.filter(
      (u) =>
        (!filterLocation || u.location === filterLocation) &&
        (!filterSubspecialty || u.subspecialty === filterSubspecialty)
    );
  }, [units, filterLocation, filterSubspecialty]);

  // Group schedules by day
  const byDay = useMemo(() => {
    const map: Record<number, { unit: SurgicalUnit; schedule: ScheduleRow }[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    for (const u of filtered) {
      for (const s of u.schedules) {
        map[s.dayOfWeek]?.push({ unit: u, schedule: s });
      }
    }
    // Sort each day by theatre then unit
    for (const k of Object.keys(map)) {
      map[+k].sort(
        (a, b) =>
          a.schedule.theatreName.localeCompare(b.schedule.theatreName) ||
          a.unit.name.localeCompare(b.unit.name)
      );
    }
    return map;
  }, [filtered]);

  const todayDow = new Date().getDay();

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-gray-500">Loading surgical unit calendar…</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-blue-600" />
            Surgical Unit Calendar
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Operating theatre allocation schedule for every surgical unit, by day of the week.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-3 py-2 bg-gray-800 text-white rounded-md text-sm flex items-center gap-2 hover:bg-gray-900 print:hidden"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Filter className="w-4 h-4 text-gray-500" /> Filters:
        </div>
        <select
          aria-label="Filter by location"
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select
          aria-label="Filter by subspecialty"
          value={filterSubspecialty}
          onChange={(e) => setFilterSubspecialty(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">All subspecialties</option>
          {subspecialties.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <button
            onClick={() => setView('matrix')}
            className={`px-3 py-1.5 rounded border ${view === 'matrix' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            Matrix
          </button>
          <button
            onClick={() => setView('byDay')}
            className={`px-3 py-1.5 rounded border ${view === 'byDay' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            By Day
          </button>
          <button
            onClick={() => setView('byUnit')}
            className={`px-3 py-1.5 rounded border ${view === 'byUnit' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            By Unit
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
          No surgical units match the selected filters. Ask an administrator to set up units at
          <span className="font-mono mx-1">/dashboard/admin/surgical-units</span>.
        </div>
      )}

      {/* ===== MATRIX VIEW ===== */}
      {view === 'matrix' && filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10 min-w-[220px]">
                  Surgical Unit
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700 min-w-[160px]">Location</th>
                {WEEK_ORDER.map((d) => (
                  <th
                    key={d}
                    className={`text-left px-3 py-2 font-semibold min-w-[140px] ${todayDow === d ? 'bg-blue-100 text-blue-900' : 'text-gray-700'}`}
                  >
                    {DAYS_SHORT[d]}
                    {todayDow === d && <span className="ml-1 text-[10px] uppercase">(today)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const dayMap: Record<number, ScheduleRow[]> = {};
                for (const s of u.schedules) {
                  (dayMap[s.dayOfWeek] ||= []).push(s);
                }
                return (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
                      <div className="font-semibold text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.subspecialty}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {u.location}
                      </div>
                    </td>
                    {WEEK_ORDER.map((d) => (
                      <td key={d} className={`px-3 py-2 align-top ${todayDow === d ? 'bg-blue-50/50' : ''}`}>
                        {(dayMap[d] || []).length === 0 ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {dayMap[d].map((s) => (
                              <span
                                key={s.id}
                                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200 w-fit"
                                title={s.notes || ''}
                              >
                                <Building2 className="w-3 h-3" />
                                {s.theatreName}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== BY DAY VIEW ===== */}
      {view === 'byDay' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {WEEK_ORDER.map((d) => (
            <div
              key={d}
              className={`bg-white border rounded-lg p-3 ${todayDow === d ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}
            >
              <div className={`font-semibold mb-2 flex items-center justify-between ${todayDow === d ? 'text-blue-900' : 'text-gray-900'}`}>
                <span className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {DAYS_FULL[d]}
                </span>
                {todayDow === d && (
                  <span className="text-[10px] uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded">Today</span>
                )}
              </div>
              {byDay[d].length === 0 ? (
                <div className="text-xs text-gray-400">No scheduled units</div>
              ) : (
                <ul className="space-y-1.5">
                  {byDay[d].map(({ unit, schedule }) => (
                    <li
                      key={schedule.id}
                      className="text-xs border border-gray-100 bg-gray-50 rounded px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{unit.name}</span>
                        <span className="inline-flex items-center gap-1 text-blue-800">
                          <Building2 className="w-3 h-3" />
                          {schedule.theatreName}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {unit.location} · {unit.subspecialty}
                      </div>
                      {schedule.notes && (
                        <div className="text-[11px] text-gray-600 italic mt-0.5">{schedule.notes}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== BY UNIT VIEW ===== */}
      {view === 'byUnit' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((u) => (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="font-semibold text-gray-900">{u.name}</div>
              <div className="text-xs text-gray-500 mb-2">
                {u.subspecialty} · <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{u.location}</span>
              </div>
              {u.schedules.length === 0 ? (
                <div className="text-xs text-gray-400">No theatre days assigned</div>
              ) : (
                <ul className="space-y-1">
                  {WEEK_ORDER.flatMap((d) =>
                    u.schedules
                      .filter((s) => s.dayOfWeek === d)
                      .map((s) => (
                        <li
                          key={s.id}
                          className={`flex items-center justify-between text-xs px-2 py-1 rounded ${todayDow === d ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}
                        >
                          <span className="font-medium text-gray-800 w-20">{DAYS_SHORT[d]}</span>
                          <span className="inline-flex items-center gap-1 text-blue-800">
                            <Building2 className="w-3 h-3" />
                            {s.theatreName}
                          </span>
                        </li>
                      ))
                  )}
                </ul>
              )}
              {u.notes && (
                <div className="text-[11px] text-gray-600 italic mt-2 border-t border-gray-100 pt-2">{u.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 mt-4 print:hidden">
        Data source: <span className="font-mono">/api/surgical-units</span>. Admins manage units at{' '}
        <a href="/dashboard/admin/surgical-units" className="text-blue-600 hover:underline">
          /dashboard/admin/surgical-units
        </a>
        .
      </div>
    </div>
  );
}
