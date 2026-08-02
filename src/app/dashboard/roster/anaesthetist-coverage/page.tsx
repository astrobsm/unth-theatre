'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, CalendarDays, RefreshCw, Stethoscope, Siren, AlertTriangle, CheckCircle2, Phone, MessageCircle, Users,
  UserPlus, BellRing,
} from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';

const ASSIGN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'];

function todayInputValue() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

type Contact = { userId: string; name: string; phone: string | null; seniority: string | null };
type CaseRow = {
  id: string; patientName: string; folderNumber: string | null; procedureName: string;
  subspecialty: string; unit: string; scheduledTime: string; surgeryType: string; isEmergency: boolean;
  assigned: { consultants: Contact[]; residents: Contact[] };
  source: 'subspecialty' | 'on-call' | 'none'; covered: boolean;
  currentAnaesthetist: { id: string; name: string } | null;
};
type Coverage = { subspecialty: string; consultants: Contact[]; residents: Contact[] };
type Board = {
  date: string;
  onCall: { consultants: Contact[]; residents: Contact[] };
  coverage: Coverage[];
  cases: CaseRow[];
  gaps: string[];
  summary: { totalCases: number; covered: number; uncovered: number; onCallAssigned: boolean };
};

function ContactPill({ c }: { c: Contact }) {
  const link = whatsappChatLink(c.phone);
  const href = link || (c.phone ? `tel:${c.phone.replace(/\s+/g, '')}` : undefined);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
      {c.name}
      {c.seniority && <span className="text-gray-400">· {c.seniority.replace(/_/g, ' ')}</span>}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-600" title={`Contact ${c.name}`}>
          {link ? <MessageCircle className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
        </a>
      )}
    </span>
  );
}

function People({ label, people }: { label: string; people: Contact[] }) {
  if (!people.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] font-medium uppercase text-gray-400">{label}</span>
      {people.map((c) => <ContactPill key={c.userId} c={c} />)}
    </div>
  );
}

export default function AnaesthetistCoveragePage() {
  const { data: session } = useSession();
  const canManage = ASSIGN_ROLES.includes((session?.user as any)?.role);
  const [selectedDate, setSelectedDate] = useState(todayInputValue);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // surgeryId being assigned / 'alert'

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/roster/anaesthetist-coverage?date=${selectedDate}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setBoard(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Failed to load'); setBoard(null);
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const assign = async (surgeryId: string, userId: string, name: string) => {
    setBusy(surgeryId); setMsg(null);
    try {
      const res = await fetch('/api/roster/anaesthetist-coverage/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surgeryId, userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setMsg(`Assigned ${name} to the case.`); await load(); }
      else setMsg(j?.error || 'Failed to assign');
    } finally { setBusy(null); }
  };

  const alertGaps = async () => {
    setBusy('alert'); setMsg(null);
    try {
      const res = await fetch('/api/roster/anaesthetist-coverage/alert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? (j.notified ? `Alert sent to ${j.notified} anaesthetist(s).` : (j.message || 'Nothing to alert.')) : (j?.error || 'Failed to send alert'));
    } finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href="/dashboard/roster/dept/anaesthetists" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Anaesthetists roster
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Stethoscope className="h-7 w-7 text-blue-600" /> Anaesthetist Coverage
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Booked cases matched to the anaesthetist rostered to their surgical subspecialty for the day. Emergencies map to
            the day's on-call consultant.
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
          {/* On-call banner */}
          <div className="mb-4 rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-orange-800">
              <Siren className="h-5 w-5" /> On-call today — covers ALL emergencies, every subspecialty
            </div>
            {board.onCall.consultants.length || board.onCall.residents.length ? (
              <div className="mt-2 space-y-1">
                <People label="Consultant" people={board.onCall.consultants} />
                <People label="Residents" people={board.onCall.residents} />
              </div>
            ) : (
              <div className="mt-1 text-sm text-orange-700">⚠ No on-call anaesthetist rostered for this day.</div>
            )}
          </div>

          {/* Summary */}
          <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{board.summary.totalCases}</div>
              <div className="text-xs text-gray-500">Booked cases</div>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{board.summary.covered}</div>
              <div className="text-xs text-green-700">Anaesthetist aligned</div>
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
                Booked subspecialties with <strong>no anaesthetist rostered</strong> today: {board.gaps.join(', ')}. These cases
                fall back to the on-call consultant — assign a subspecialty anaesthetist on the roster.
              </div>
              {canManage && (
                <button
                  onClick={alertGaps}
                  disabled={busy === 'alert'}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  title="Notify the on-call consultant and consultant anaesthetists about these gaps"
                >
                  <BellRing className="h-4 w-4" /> Notify on-call of gaps
                </button>
              )}
            </div>
          )}

          {/* Elective coverage table */}
          {board.coverage.length > 0 && (
            <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
                Elective coverage — subspecialty → anaesthetist
              </div>
              <div className="divide-y divide-gray-100">
                {board.coverage.map((cov) => (
                  <div key={cov.subspecialty} className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-gray-800">{cov.subspecialty}</span>
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <People label="Consultant" people={cov.consultants} />
                      <People label="Residents" people={cov.residents} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cases */}
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Users className="h-4 w-4" /> Booked cases
          </h2>
          {loading && !board.cases.length && <div className="py-10 text-center text-gray-400">Loading…</div>}
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
                        {c.covered ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="mt-0.5 text-sm text-gray-600">
                        {c.procedureName} · <span className="font-medium">{c.subspecialty}</span> · {c.scheduledTime}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {c.source === 'subspecialty' ? 'matched by subspecialty' : c.source === 'on-call' ? 'on-call cover' : 'unassigned'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {c.assigned.consultants.length || c.assigned.residents.length ? (
                      <>
                        <People label="Consultant" people={c.assigned.consultants} />
                        <People label="Residents" people={c.assigned.residents} />
                      </>
                    ) : (
                      <span className="text-sm text-red-600">No anaesthetist rostered for this case.</span>
                    )}
                  </div>

                  {/* Current assignment on the surgery + one-tap assign */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                    <span className="text-[11px] uppercase text-gray-400">On the booking:</span>
                    {c.currentAnaesthetist ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {c.currentAnaesthetist.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">not assigned</span>
                    )}
                    {canManage && [...c.assigned.consultants, ...c.assigned.residents].map((cand) => {
                      const isCurrent = c.currentAnaesthetist?.id === cand.userId;
                      return (
                        <button
                          key={cand.userId}
                          onClick={() => assign(c.id, cand.userId, cand.name)}
                          disabled={busy === c.id || isCurrent}
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
