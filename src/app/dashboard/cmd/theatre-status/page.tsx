'use client';

// ============================================================
// The day's theatre, on one screen, for the people who run the hospital
// ------------------------------------------------------------
// Which theatres are ready and who said so. What is booked into each. Who is
// on each case and who has confirmed they are coming. All of it currently
// takes six telephone calls, and by the time it is answered the morning is
// over.
//
// TWO ACTIONS, AND NO OTHERS. Ask what is missing, or say thank you. Both open
// WhatsApp with the message already drafted, and the CMD reads it, edits it if
// they want to, and presses send. Nothing is ever sent from here: a message
// signed by the Chief Medical Director that the Chief Medical Director did not
// write would be worse than no message at all.
//
// AND IT DOES NOT ACCUSE ANYBODY. The board knows who has not ANSWERED, which
// is not the same as who has not turned up — people are operating, teaching,
// post-call or out of signal — so the chase message asks a question and the
// screen says "not yet said".
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronLeft, Clock, Heart,
  Loader2, MessageCircle, Phone, RefreshCw, Users,
} from 'lucide-react';
import { chaseLink, appreciationLink } from '@/lib/theatre/cmdMessages';
import { statusLine, summaryLine, type TeamMemberAvailability, type TeamAvailabilitySummary } from '@/lib/theatre/availability';
import { READINESS_LISTS, type ReadinessRole } from '@/lib/theatre/readiness';

interface Confirmation {
  role: string;
  complete: boolean;
  confirmedByName: string;
  confirmedById: string;
  phone: string | null;
  completedAt: string | null;
  announcedAt: string | null;
  note: string | null;
  outstanding: string[];
  done: number;
  total: number;
}

interface TheatreRow {
  id: string;
  name: string;
  location: string | null;
  confirmations: Confirmation[];
  ready: boolean;
  cases: number;
}

interface CaseRow {
  id: string;
  procedureName: string;
  scheduledTime: string;
  status: string;
  surgeryType: string;
  unit: string | null;
  theatreId: string | null;
  patientName: string | null;
  team: TeamMemberAvailability[];
  summary: TeamAvailabilitySummary;
}

interface Board {
  date: string;
  theatres: TheatreRow[];
  cases: CaseRow[];
  unallocated: number;
  totals: {
    cases: number; emergencies: number; theatresReady: number;
    theatresWithCases: number; confirmed: number; awaited: number; unavailable: number;
  };
}

const MAY_VIEW = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

const CHIP: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  DELAYED: 'bg-amber-100 text-amber-900',
  UNAVAILABLE: 'bg-red-100 text-red-800',
};

export default function TheatreStatusPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const me = session?.user?.name ?? null;

  useEffect(() => {
    const role = (session?.user?.role ?? '').toUpperCase();
    if (role && !MAY_VIEW.includes(role)) router.push('/dashboard');
  }, [session, router]);

  const load = useCallback(async (forDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cmd/theatre-status${forDate ? `?date=${forDate}` : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'The board could not be loaded.');
        return;
      }
      const data = await res.json();
      setBoard(data);
      setDate(data.date);
    } catch {
      setError('The board could not be loaded — check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const caseBriefsFor = (userId: string): Array<{
    patientName?: string | null; procedureName?: string | null;
    scheduledTime?: string | null; theatreName?: string | null;
  }> =>
    (board?.cases ?? [])
      .filter((c) => c.team.some((m) => m.userId === userId))
      .map((c) => ({
        patientName: c.patientName,
        procedureName: c.procedureName,
        scheduledTime: c.scheduledTime,
        theatreName: board?.theatres.find((t) => t.id === c.theatreId)?.name ?? null,
      }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/cmd" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
            <ChevronLeft className="h-4 w-4" /> CMD dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Theatre status today</h1>
          <p className="text-gray-600">
            Which theatres are ready, what is booked, and who has confirmed they are coming.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); void load(e.target.value); }}
            className="rounded-xl border-2 border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void load(date)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {board && (
        <>
          {/* The morning in six numbers. */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Cases booked', value: board.totals.cases, icon: Activity, tone: 'text-blue-600' },
              { label: 'Emergencies', value: board.totals.emergencies, icon: AlertTriangle, tone: 'text-red-600' },
              { label: 'Theatres ready', value: `${board.totals.theatresReady}/${board.totals.theatresWithCases}`, icon: CheckCircle2, tone: 'text-green-600' },
              { label: 'Team confirmed', value: board.totals.confirmed, icon: Users, tone: 'text-green-600' },
              { label: 'Awaiting answer', value: board.totals.awaited, icon: Clock, tone: 'text-gray-600' },
              { label: 'Not available', value: board.totals.unavailable, icon: AlertTriangle, tone: 'text-amber-600' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600">{s.label}</p>
                  <s.icon className={`h-4 w-4 ${s.tone}`} />
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>

          {board.unallocated > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {board.unallocated} {board.unallocated === 1 ? 'case has' : 'cases have'} no theatre allocated yet.
              They are on the list below and they are real; the room has simply not been decided.
            </p>
          )}

          {/* ── Theatres ── */}
          <section>
            <h2 className="text-lg font-bold text-gray-900">Theatres</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {board.theatres.filter((t) => t.cases > 0 || t.confirmations.length > 0).map((t) => (
                <div
                  key={t.id}
                  className={`rounded-xl border-2 bg-white p-4 ${t.ready ? 'border-green-300' : 'border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900">{t.name}</p>
                      <p className="text-sm text-gray-600">
                        {t.cases} {t.cases === 1 ? 'case' : 'cases'} booked
                        {t.location ? ` · ${t.location}` : ''}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      t.ready ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {t.ready ? 'READY' : 'NOT YET READY'}
                    </span>
                  </div>

                  {/* Both halves, always shown — including the one nobody has
                      touched, because a missing technician confirmation is the
                      thing most likely to hold up a list and the easiest thing
                      to fail to notice. */}
                  <ul className="mt-3 space-y-2">
                    {(['SCRUB_NURSE', 'THEATRE_TECHNICIAN'] as ReadinessRole[]).map((role) => {
                      const c = t.confirmations.find((x) => x.role === role);
                      return (
                        <li key={role} className="rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm">
                              <span className="font-semibold text-gray-900">{READINESS_LISTS[role].who}</span>
                              {c ? (
                                <span className="text-gray-600">
                                  {' '}— {c.complete ? 'confirmed' : `${c.done} of ${c.total}`} by {c.confirmedByName}
                                </span>
                              ) : (
                                <span className="text-gray-500"> — nothing recorded yet</span>
                              )}
                            </span>
                            {c?.phone && (
                              <span className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => open(chaseLink(c.phone, {
                                    toName: c.confirmedByName,
                                    toRole: READINESS_LISTS[role].who,
                                    theatreName: t.name,
                                    outstanding: c.outstanding,
                                    fromName: me,
                                  }))}
                                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
                                  title="Ask what is still needed"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" /> Ask
                                </button>
                                <button
                                  type="button"
                                  onClick={() => open(appreciationLink(c.phone, {
                                    toName: c.confirmedByName,
                                    toRole: READINESS_LISTS[role].who,
                                    theatreName: t.name,
                                    forWhat: c.completedAt
                                      ? `having ${t.name} confirmed ready by ${new Date(c.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                      : null,
                                    fromName: me,
                                  }))}
                                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-300 hover:bg-green-50"
                                  title="Say thank you"
                                >
                                  <Heart className="h-3.5 w-3.5" /> Thank
                                </button>
                              </span>
                            )}
                          </div>
                          {c && !c.complete && c.outstanding.length > 0 && (
                            <p className="mt-1 text-xs text-amber-800">
                              Outstanding: {c.outstanding.join('; ')}
                            </p>
                          )}
                          {c?.note && (
                            <p className="mt-1 text-xs text-amber-900">Reported: {c.note}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {board.theatres.every((t) => t.cases === 0 && t.confirmations.length === 0) && (
                <p className="text-sm text-gray-600">Nothing booked into any theatre for this day.</p>
              )}
            </div>
          </section>

          {/* ── Cases and their teams ── */}
          <section>
            <h2 className="text-lg font-bold text-gray-900">Booked cases and team availability</h2>
            <div className="mt-3 space-y-3">
              {board.cases.map((c) => (
                <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {c.scheduledTime} — {c.procedureName}
                        {c.surgeryType === 'EMERGENCY' && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                            EMERGENCY
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        {c.patientName ?? 'Patient'}
                        {c.unit ? ` · ${c.unit}` : ''}
                        {' · '}
                        {board.theatres.find((t) => t.id === c.theatreId)?.name ?? 'no theatre yet'}
                      </p>
                    </div>
                    <span className="text-sm text-gray-600">{summaryLine(c.summary)}</span>
                  </div>

                  <ul className="mt-3 grid gap-2 md:grid-cols-2">
                    {c.team.map((m) => (
                      <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                        <span className="min-w-0 text-sm">
                          <span className="font-medium text-gray-900">{m.name}</span>
                          <span className="text-gray-500"> · {m.role}</span>
                          {m.note && <span className="block text-xs text-gray-600">“{m.note}”</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            m.status ? CHIP[m.status] : 'bg-gray-200 text-gray-700'
                          }`}>
                            {statusLine(m)}
                          </span>
                          {m.phone ? (
                            <>
                              <button
                                type="button"
                                onClick={() => open(chaseLink(m.phone, {
                                  toName: m.name,
                                  toRole: m.role,
                                  theatreName: board.theatres.find((t) => t.id === c.theatreId)?.name ?? null,
                                  cases: caseBriefsFor(m.userId),
                                  outstanding: m.status
                                    ? []
                                    : ['your availability for this case, which the board has not received yet'],
                                  fromName: me,
                                }))}
                                className="rounded-lg bg-white p-1.5 text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
                                title={`Ask ${m.name} what is needed`}
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => open(appreciationLink(m.phone, {
                                  toName: m.name,
                                  toRole: m.role,
                                  theatreName: board.theatres.find((t) => t.id === c.theatreId)?.name ?? null,
                                  cases: caseBriefsFor(m.userId),
                                  forWhat: m.status === 'AVAILABLE'
                                    ? 'confirming your availability early — it makes the whole list easier to run'
                                    : null,
                                  fromName: me,
                                }))}
                                className="rounded-lg bg-white p-1.5 text-green-700 ring-1 ring-green-300 hover:bg-green-50"
                                title={`Thank ${m.name}`}
                              >
                                <Heart className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400" title="No phone number on file">
                              <Phone className="h-3 w-3" /> no number
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                    {c.team.length === 0 && (
                      <li className="text-sm text-gray-500">No team assigned to this case yet.</li>
                    )}
                  </ul>
                </div>
              ))}
              {board.cases.length === 0 && (
                <p className="text-sm text-gray-600">No cases booked for this day.</p>
              )}
            </div>
          </section>

          <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            Messages open in WhatsApp with the text already written, for you to read and send.
            Nothing is sent from this screen. “Not yet said” means the board has had no answer —
            it is not a record of anybody failing to attend.
          </p>
        </>
      )}
    </div>
  );
}
