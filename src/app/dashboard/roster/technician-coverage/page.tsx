'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, CalendarDays, RefreshCw, Wrench, Siren, AlertTriangle, CheckCircle2, Phone, MessageCircle, Users,
  BellRing, Building2, Moon, Sun, HeartPulse, UserPlus,
} from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';

const ALERT_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ANAESTHETIC_TECHNICIAN'];

function todayInputValue() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

type Tech = { userId: string; name: string; phone: string | null; seniority: string | null };
type CaseRow = {
  id: string; patientName: string; folderNumber: string | null; procedureName: string;
  subspecialty: string; unit: string; theatre: string; scheduledTime: string; surgeryType: string; isEmergency: boolean;
  assigned: Tech[]; source: 'theatre' | 'call' | 'none'; covered: boolean;
  currentTechnician: { id: string; name: string } | null;
};
type Board = {
  date: string;
  dayCall: Tech[]; nightCall: Tech[]; icu: Tech[];
  coverageByTheatre: { theatre: string; technicians: Tech[] }[];
  cases: CaseRow[];
  gaps: string[];
  summary: { totalCases: number; covered: number; uncovered: number };
};

function TechPill({ t }: { t: Tech }) {
  const link = whatsappChatLink(t.phone);
  const href = link || (t.phone ? `tel:${t.phone.replace(/\s+/g, '')}` : undefined);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
      {t.name}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-600" title={`Contact ${t.name}`}>
          {link ? <MessageCircle className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
        </a>
      )}
    </span>
  );
}

function TechRow({ label, icon, people }: { label: string; icon: React.ReactNode; people: Tech[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase text-gray-500">{icon} {label}</span>
      {people.length ? people.map((t) => <TechPill key={t.userId} t={t} />) : <span className="text-xs text-gray-400">none rostered</span>}
    </div>
  );
}

export default function TechnicianCoveragePage() {
  const { data: session } = useSession();
  const canAlert = ALERT_ROLES.includes((session?.user as any)?.role);
  const [selectedDate, setSelectedDate] = useState(todayInputValue);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/roster/technician-coverage?date=${selectedDate}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setBoard(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Failed to load'); setBoard(null);
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const assign = async (surgeryId: string, userId: string, name: string) => {
    setAssigningId(surgeryId); setMsg(null);
    try {
      const res = await fetch('/api/roster/technician-coverage/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surgeryId, userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setMsg(`Assigned ${name} to the case.`); await load(); }
      else setMsg(j?.error || 'Failed to assign');
    } finally { setAssigningId(null); }
  };

  const alertGaps = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/roster/technician-coverage/alert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? (j.notified ? `Alert sent to ${j.notified} person(s).` : (j.message || 'Nothing to alert.')) : (j?.error || 'Failed to send alert'));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href="/dashboard/roster/dept/anaesthetic-technicians" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Technicians roster
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Wrench className="h-7 w-7 text-blue-600" /> Technician Coverage
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Booked cases matched to the anaesthetic technician on their theatre for the day. Emergencies map to the day/night
            call technician; ICU shown separately.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs font-medium text-gray-500">
            <span className="mb-1 flex items-center gap-1"><CalendarDays className="h-4 w-4" /> Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayInputValue())}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <button onClick={load} className="flex h-[38px] items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      {board && (
        <>
          {/* Call + ICU banner */}
          <div className="mb-4 rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-800">
              <Siren className="h-5 w-5" /> Emergency & ICU cover today
            </div>
            <div className="space-y-1">
              <TechRow label="Day call" icon={<Sun className="h-3.5 w-3.5" />} people={board.dayCall} />
              <TechRow label="Night call" icon={<Moon className="h-3.5 w-3.5" />} people={board.nightCall} />
              <TechRow label="ICU" icon={<HeartPulse className="h-3.5 w-3.5" />} people={board.icu} />
            </div>
          </div>

          {/* Summary */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{board.summary.totalCases}</div>
              <div className="text-xs text-gray-500">Booked cases</div>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{board.summary.covered}</div>
              <div className="text-xs text-green-700">Technician aligned</div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{board.summary.uncovered}</div>
              <div className="text-xs text-red-700">No cover</div>
            </div>
          </div>

          {/* Gaps */}
          {board.gaps.length > 0 && (
            <div className="mb-5 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                Booked theatres with <strong>no technician assigned</strong> today: {board.gaps.join(', ')}.
              </div>
              {canAlert && (
                <button
                  onClick={alertGaps}
                  disabled={busy}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <BellRing className="h-4 w-4" /> Notify call techs & managers
                </button>
              )}
            </div>
          )}

          {/* Theatre coverage table */}
          {board.coverageByTheatre.length > 0 && (
            <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
                Theatre coverage — theatre → technician
              </div>
              <div className="divide-y divide-gray-100">
                {board.coverageByTheatre.map((cov) => (
                  <div key={cov.theatre} className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="inline-flex items-center gap-1 font-medium text-gray-800"><Building2 className="h-4 w-4 text-gray-400" /> {cov.theatre}</span>
                    <div className="flex flex-wrap gap-1">{cov.technicians.map((t) => <TechPill key={t.userId} t={t} />)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cases */}
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Users className="h-4 w-4" /> Booked cases
          </h2>
          {board.cases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-gray-500">
              No cases booked for this date.
            </div>
          ) : (
            <div className="space-y-3">
              {board.cases.map((c) => (
                <div key={c.id} className={`rounded-xl border bg-white p-3 shadow-sm ${c.covered ? 'border-green-200' : 'border-red-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{c.patientName}</span>
                        {c.folderNumber && <span className="text-xs text-gray-400">#{c.folderNumber}</span>}
                        {c.isEmergency && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            <Siren className="h-3 w-3" /> EMERGENCY
                          </span>
                        )}
                        {c.covered ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="mt-0.5 text-sm text-gray-600">
                        {c.procedureName} · <span className="font-medium">{c.theatre}</span> · {c.subspecialty} · {c.scheduledTime}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {c.source === 'theatre' ? 'matched by theatre' : c.source === 'call' ? 'call cover' : 'unassigned'}
                    </span>
                  </div>
                  <div className="mt-2">
                    {c.assigned.length ? (
                      <div className="flex flex-wrap gap-1">{c.assigned.map((t) => <TechPill key={t.userId} t={t} />)}</div>
                    ) : (
                      <span className="text-sm text-red-600">No technician assigned to this theatre.</span>
                    )}
                  </div>

                  {/* Current assignment on the surgery + one-tap assign */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                    <span className="text-[11px] uppercase text-gray-400">On the booking:</span>
                    {c.currentTechnician ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {c.currentTechnician.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">not assigned</span>
                    )}
                    {canAlert && c.assigned.map((cand) => {
                      const isCurrent = c.currentTechnician?.id === cand.userId;
                      return (
                        <button
                          key={cand.userId}
                          onClick={() => assign(c.id, cand.userId, cand.name)}
                          disabled={assigningId === c.id || isCurrent}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-60 ${
                            isCurrent ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                          title={isCurrent ? 'Already assigned' : `Assign ${cand.name} to this case`}
                        >
                          <UserPlus className="h-3.5 w-3.5" /> {isCurrent ? 'Assigned' : `Assign ${cand.name}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
