'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChefHat, RefreshCw, Calendar, Users, CheckCircle2, XCircle, HelpCircle, UserCheck, UtensilsCrossed } from 'lucide-react';

interface StaffEntry {
  userId: string | null;
  name: string;
  role: string;
  meta?: string;
  hasActivity: boolean | null;
}

interface DailyStaffResponse {
  date: string;
  generatedAt: string;
  surgicalTeam: Record<string, StaffEntry[]>;
  totalSurgeons: number;
  rosterStaff: Record<string, StaffEntry[]>;
  totals: {
    totalStaff: number;
    uniqueIdentified: number;
    loggedIn: number;
    notLoggedIn: number;
  };
}

const SURGEON_LABELS: Record<string, string> = {
  CONSULTANT: 'Consultants',
  SENIOR_REGISTRAR: 'Senior Registrars',
  REGISTRAR: 'Registrars',
  HOUSE_OFFICER: 'House Officers',
};

const ROSTER_LABELS: Record<string, string> = {
  ANAESTHETISTS: 'Anaesthetists',
  ANAESTHETIC_TECHNICIANS: 'Anaesthetic Technicians',
  NURSES: 'Theatre Nurses',
  RECOVERY_NURSES: 'Recovery Room Nurses',
  PHARMACISTS: 'Pharmacists',
  PORTERS: 'Porters',
  CLEANERS: 'Cleaners',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function ActivityBadge({ status }: { status: boolean | null }) {
  if (status === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  }
  if (status === false) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
        <XCircle className="w-3 h-3" /> No activity
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
      <HelpCircle className="w-3 h-3" /> Unverified
    </span>
  );
}

function StaffCard({ title, entries, emptyText }: { title: string; entries: StaffEntry[]; emptyText: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((e, i) => (
            <li key={`${e.userId || e.name}-${i}`} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                {e.meta && <p className="text-xs text-gray-500 truncate">{e.meta}</p>}
              </div>
              <ActivityBadge status={e.hasActivity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TheatreMealsPage() {
  const [date, setDate] = useState<string>(todayISO());
  const [data, setData] = useState<DailyStaffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cafeteria/daily-staff?date=${date}`);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const j = (await res.json()) as DailyStaffResponse;
      setData(j);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-orange-600" /> Theatre Meals — Daily Staff
          </h1>
          <p className="text-gray-600 mt-2 max-w-3xl">
            Surgical teams from today&apos;s surgery bookings plus all staff on duty from the roster.
            Use the activity badges to dispense lunch only to those who have logged activity for the day.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="date-picker" className="block text-xs font-semibold text-gray-700 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" /> Date
            </label>
            <input
              id="date-picker"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              aria-label="Select date"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="btn-primary inline-flex items-center gap-2 h-10"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Color-code legend */}
      <div className="card p-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-gray-700">Activity legend:</span>
        <ActivityBadge status={true} />
        <span className="text-gray-500">staff has logged at least one duty in the system today.</span>
        <ActivityBadge status={false} />
        <span className="text-gray-500">staff is on the team / roster but has not logged anything yet.</span>
        <ActivityBadge status={null} />
        <span className="text-gray-500">free-text member, not linked to a user account.</span>
      </div>

      {error && (
        <div className="card p-4 border border-red-300 bg-red-50 text-red-800">
          <p className="font-semibold">Failed to load:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center gap-2 text-blue-900">
              <Users className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Surgeons today</span>
            </div>
            <p className="text-3xl font-bold text-blue-900 mt-1">{data.totalSurgeons}</p>
            <p className="text-xs text-blue-700 mt-1">Across all bookings for {data.date}</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="flex items-center gap-2 text-purple-900">
              <UserCheck className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Total staff</span>
            </div>
            <p className="text-3xl font-bold text-purple-900 mt-1">{data.totals.totalStaff}</p>
            <p className="text-xs text-purple-700 mt-1">Surgeons + rostered staff</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center gap-2 text-green-900">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Logged in (eligible)</span>
            </div>
            <p className="text-3xl font-bold text-green-900 mt-1">{data.totals.loggedIn}</p>
            <p className="text-xs text-green-700 mt-1">Active in system today — dispense meals</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <div className="flex items-center gap-2 text-red-900">
              <XCircle className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Not yet active</span>
            </div>
            <p className="text-3xl font-bold text-red-900 mt-1">{data.totals.notLoggedIn}</p>
            <p className="text-xs text-red-700 mt-1">Hold meals until staff logs activity</p>
          </div>
        </div>
      )}

      {/* Surgical team */}
      {data && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <UtensilsCrossed className="w-5 h-5 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">Surgical team — from today&apos;s bookings</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER'] as const).map((k) => (
              <StaffCard
                key={k}
                title={SURGEON_LABELS[k]}
                entries={data.surgicalTeam[k] || []}
                emptyText={`No ${SURGEON_LABELS[k].toLowerCase()} booked.`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Other staff on duty */}
      {data && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-primary-700" />
            <h2 className="text-xl font-bold text-gray-900">Other staff on duty — from the roster</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.keys(ROSTER_LABELS).map((k) => (
              <StaffCard
                key={k}
                title={ROSTER_LABELS[k]}
                entries={data.rosterStaff[k] || []}
                emptyText="No one rostered."
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
