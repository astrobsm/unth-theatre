'use client';

/**
 * Late elective bookings: who, which unit, and what was done about it.
 *
 * WRITTEN TO BE READ IN A MEETING. The ranking answers the question that was
 * asked — which units offend most — and the rate sits beside the count so a
 * busy unit is not condemned by volume alone. Every name is attributed to a
 * role, because the difference between "booked this late" and "supervises
 * this unit" is the difference between an offence and a fact.
 *
 * THE CHASE IS A DELIBERATE PRESS, never automatic. Sending a warning to a
 * named clinician is an act with consequences, and it belongs to a person in
 * theatre management who has looked at the case, not to a cron job that has
 * not.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Send,
  Check,
  Loader2,
  Printer,
  CalendarClock,
  ShieldAlert,
  MessageCircle,
} from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
import { formatRate, type LateBookingReport } from '@/lib/lateBooking/report';
import { ESCALATION_LABELS, ENFORCEMENT_FROM } from '@/lib/lateBooking/escalation';

type Recorded = {
  surgeryId: string;
  offenceNumber: number;
  level: string;
  createdAt: string;
  whatsappQueued: boolean;
  disciplinaryQueryId: string | null;
};

export default function LateBookingsPage() {
  const [from, setFrom] = useState('2026-10-01');
  const [to, setTo] = useState('2026-10-31');
  const [report, setReport] = useState<LateBookingReport | null>(null);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [countingFrom, setCountingFrom] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * The WhatsApp hand-off for the chase just recorded.
   *
   * KEPT ON SCREEN rather than only opened. The offence is recorded on the
   * server before this, so a blocked pop-up cannot leave a warning recorded
   * and unsent without a way to send it — the link stays until the next
   * action.
   */
  const [handoff, setHandoff] = useState<{ href: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/late-bookings?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) {
        setProblem('Could not build the report.');
        return;
      }
      const data = await res.json();
      setReport(data.report);
      setRecorded(data.recorded ?? []);
      setCountingFrom(data.countingFrom ?? '');
      setDenied(false);
      setProblem(null);
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const chase = async (surgeryId: string, personName: string) => {
    setBusy(surgeryId);
    setProblem(null);
    setNote(null);
    setHandoff(null);
    try {
      const res = await fetch('/api/late-bookings/chase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ surgeryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProblem(data?.error ?? 'Could not record this one.');
        return;
      }
      if (data.alreadyRecorded) {
        setNote(data.message);
      } else {
        const href = data.whatsapp
          ? whatsappLink(data.whatsapp.number, data.whatsapp.text)
          : null;
        if (href) {
          setHandoff({ href, name: personName });
          // Opened straight away so the ordinary case is a single press. A
          // blocked pop-up leaves the link below, not a silent warning.
          window.open(href, '_blank', 'noopener');
        }
        setNote(
          `${ESCALATION_LABELS[data.decision.level as keyof typeof ESCALATION_LABELS]} recorded.` +
            (href
              ? ' WhatsApp is opening with the message — press send there.'
              : ` No WhatsApp: ${data.whatsappSkipped ?? 'no number on file'}. It is in their ORM notifications.`) +
            (data.queryId ? ' Formal query issued and the head of department copied.' : ''),
        );
      }
      await load();
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">Late elective bookings</h1>
        <p className="mt-2 text-sm text-gray-600">
          This report names individuals against a tally of policy breaches, so it is restricted to
          theatre management and heads of department.
        </p>
      </div>
    );
  }

  const byId = new Map(recorded.map((r) => [r.surgeryId, r]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <CalendarClock className="h-6 w-6 text-red-600" />
              Late elective bookings
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Elective cases booked after 15:00 on the day before surgery. Emergency and urgent
              cases are excluded — they are booked when the patient needs them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium print:hidden"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 print:hidden">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Run
          </button>
        </div>

        {loading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Building the report…
          </p>
        )}
        {problem && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{problem}</p>
        )}
        {note && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            <p>{note}</p>
            {handoff && (
              <a
                href={handoff.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" />
                Open WhatsApp to {handoff.name}
              </a>
            )}
          </div>
        )}

        {report && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Elective cases in the window</dt>
              <dd className="text-2xl font-semibold">{report.totalElective}</dd>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <dt className="text-xs text-gray-500">Booked late</dt>
              <dd className="text-2xl font-semibold text-red-700">{report.totalLate}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Breach rate</dt>
              <dd className="text-2xl font-semibold">{formatRate(report.overallRate)}</dd>
            </div>
          </dl>
        )}

        {countingFrom && (
          <p className="mt-3 text-xs text-gray-500">
            Warnings count from {countingFrom}. Cases booked before that date appear here but
            cannot be escalated — nobody is sanctioned for conduct that preceded the rule.
          </p>
        )}
      </div>

      {/* ── The directive ─────────────────────────────────────────────── */}
      <Directive />

      {report && report.totalLate === 0 && !loading && (
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-600">
            No late elective bookings in this window.
          </p>
        </div>
      )}

      {/* ── Ranked units ──────────────────────────────────────────────── */}
      {report?.units.map((u, i) => (
        <div key={u.unit} className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700">
                {i + 1}
              </span>
              {u.unit}
            </h2>
            <p className="text-sm text-gray-600">
              <strong className="text-red-700">{u.lateCount}</strong> late of {u.electiveTotal}{' '}
              elective ({formatRate(u.lateRate)})
            </p>
          </div>

          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <People title="Booked by (offences)" people={u.bookers.map((b) => `${b.name} — ${b.count}`)} />
            <People title="Supervising consultants" people={u.consultants} />
            <People
              title="Senior registrars / house officers"
              people={[...u.seniorRegistrars, ...u.houseOfficers]}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">Patient</th>
                  <th className="py-2 pr-3">Procedure</th>
                  <th className="py-2 pr-3">Scheduled</th>
                  <th className="py-2 pr-3">Booked</th>
                  <th className="py-2 pr-3">Late by</th>
                  <th className="py-2 pr-3">Booked by</th>
                  <th className="py-2 pr-3 print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {u.cases.map((c) => {
                  const done = byId.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3">{c.patientLabel}</td>
                      <td className="py-2 pr-3">{c.procedureName}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{c.scheduledFor}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{c.bookedAtLabel}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-red-700">
                        {c.hoursLate < 24
                          ? `${Math.round(c.hoursLate)}h`
                          : `${Math.floor(c.hoursLate / 24)}d`}
                      </td>
                      <td className="py-2 pr-3">{c.bookedByName}</td>
                      <td className="py-2 pr-3 print:hidden">
                        {done ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-gray-600">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            {ESCALATION_LABELS[done.level as keyof typeof ESCALATION_LABELS] ??
                              done.level}{' '}
                            (#{done.offenceNumber})
                            {done.disciplinaryQueryId && (
                              <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                            )}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy === c.id}
                            onClick={() => void chase(c.id, c.bookedByName)}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-blue-600 px-2 py-1 text-xs font-semibold text-blue-700 disabled:opacity-50"
                          >
                            {busy === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Chase
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ── Everybody, across units ───────────────────────────────────── */}
      {report && report.offenders.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Bookers, across all units</h2>
          <ol className="divide-y divide-gray-100 text-sm">
            {report.offenders.map((o, i) => (
              <li key={`${o.personId ?? o.name}-${i}`} className="flex justify-between py-2">
                <span>
                  {i + 1}. {o.name}
                  <span className="ml-2 text-xs text-gray-500">{o.units.join(', ')}</span>
                </span>
                <span className="font-semibold text-red-700">{o.count}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function People({ title, people }: { title: string; people: string[] }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="mb-1 text-xs font-semibold uppercase text-gray-500">{title}</p>
      {people.length === 0 ? (
        <p className="text-xs text-gray-400">None recorded</p>
      ) : (
        <ul className="space-y-0.5">
          {people.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The standing directive, printed with the report.
 *
 * Kept beside the figures on purpose: a policy circulated on its own is read
 * once, and a list of names circulated on its own reads as an attack. Put
 * together, the numbers explain the rule and the rule explains the numbers.
 */
function Directive() {
  return (
    <div className="rounded-lg border-2 border-gray-300 bg-white p-6 shadow print:break-inside-avoid">
      <h2 className="text-lg font-bold text-gray-900">
        Theatre directive: booking of elective surgical cases
      </h2>
      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
        University of Nigeria Teaching Hospital, Ituku-Ozalla · Theatre Management
      </p>

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-800">
        <p>
          Dear Colleagues,
        </p>
        <p>
          Our records show a sustained rise in elective cases booked after the agreed deadline of{' '}
          <strong>15:00 on the day before surgery</strong>. We are writing to explain why this
          matters, and what will change.
        </p>
        <p>
          By 15:00 the following day&apos;s work is already in motion. The operating list has been
          planned and theatre time allocated. CSSD has begun sterilising the instrument sets for
          those cases. Pharmacy has dispensed against the booked list, and the consumable pack
          providers have drawn and packed. Most importantly, the nursing officer has made staff
          assignments for each theatre, matching skill mix to the cases booked.
        </p>
        <p>
          A case added after that point does not simply join the queue. It displaces preparation
          already completed for another patient: a set that must be re-sterilised, a pack that must
          be broken and re-drawn, and a nurse reassigned from a theatre that then runs short. The
          patient who is moved is rarely the one booked late. This is the reason the deadline
          exists, and it is why late booking is a safety matter and not an administrative one.
        </p>
        <p className="rounded-lg bg-amber-50 p-3">
          <strong>
            With effect from {new Date(ENFORCEMENT_FROM).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            , elective cases booked after 15:00 on the preceding day will not have a nurse or a
            theatre assigned.
          </strong>{' '}
          The case will remain on the record and may be rebooked for the next available list.
        </p>
        <p>
          <strong>Where there is a genuine difficulty.</strong> We recognise that circumstances
          arise — a clinic that overruns, an investigation result that arrives late, a patient who
          travels a long distance. Where anything prevents you from booking before 15:00, please
          communicate it to the <strong>Theatre Manager</strong> or the{' '}
          <strong>Theatre Chairman</strong> before <strong>12 noon on the day before</strong>. A
          difficulty raised in advance will always be accommodated. One raised afterwards cannot
          be, because by then the preparation has already been done.
        </p>
        <p>
          <strong>How this will be followed up.</strong> Late bookings are now recorded against the
          person who made the booking. A first occurrence attracts a written warning, a second a
          final written warning, and a third a formal query copied to the Head of Department for
          the subspecialty. Warnings count from the date tracking began and not before.
        </p>
        <p>
          We would much rather issue none of these. The purpose of this directive is a theatre list
          that is ready when the patient arrives, and the cooperation of every unit in achieving
          that is appreciated.
        </p>
        <p className="pt-2">
          Yours sincerely,
          <br />
          <strong>Theatre Management</strong>
          <br />
          University of Nigeria Teaching Hospital, Ituku-Ozalla
        </p>
      </div>
    </div>
  );
}
