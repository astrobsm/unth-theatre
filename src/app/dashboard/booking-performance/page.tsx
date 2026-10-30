'use client';

/**
 * Booking performance: who books early, and how early.
 *
 * THE COUNTERPART TO THE LATE-BOOKING REPORT, and deliberately a page of its
 * own rather than a tab on it. A board of commendations sitting under a
 * heading about breaches reads as the consolation prize; opened on its own it
 * reads as what it is.
 *
 * NOTICE IS SHOWN BESIDE COMPLIANCE, because a case booked at 14:55 on the
 * day before is compliant and gives the theatre nothing. A board that showed
 * only the pass rate would quietly teach people that beating the clock is the
 * whole job.
 *
 * THE COMMENDATION IS A DELIBERATE PRESS, like the chase. Appreciation that
 * arrives automatically every month is a circular, and people stop reading
 * circulars.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Check,
  Loader2,
  Printer,
  Send,
  Star,
  Clock,
  MessageCircle,
  FileText,
} from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
import {
  formatNotice,
  MIN_CASES_TO_RANK,
  COMMENDATION_RATE,
  type PunctualityReport,
  type BookerPerformance,
} from '@/lib/lateBooking/punctuality';

const pct = (rate: number | null): string =>
  rate == null ? '—' : `${Math.round(rate * 100)}%`;

export default function BookingPerformancePage() {
  const [from, setFrom] = useState('2026-10-01');
  const [to, setTo] = useState('2026-10-31');
  const [report, setReport] = useState<PunctualityReport | null>(null);
  const [commended, setCommended] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * The WhatsApp hand-off for the last letter sent.
   *
   * KEPT ON SCREEN rather than only opened. The window is opened for the
   * common case, but a blocked pop-up must not turn into a commendation
   * nobody received — so the link stays until the next action, where it can
   * be tapped deliberately.
   */
  const [handoff, setHandoff] = useState<{ href: string; name: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  /** "1 October to 31 October 2026", for the document's letterhead. */
  const periodLabel = (() => {
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${d} ${months[(m || 1) - 1]} ${y}`;
    };
    return `${fmt(from)} to ${fmt(to)}`;
  })();

  const downloadPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    setProblem(null);
    try {
      // Imported on demand: jsPDF and autoTable are large, and a theatre
      // phone should not carry them on every page load.
      const { buildBookingPerformancePdf, bookingPdfFilename } =
        await import('@/lib/lateBooking/punctualityPdf');
      const blob = await buildBookingPerformancePdf(report, { periodLabel });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = bookingPdfFilename(report);
      a.click();
      URL.revokeObjectURL(url);
      setNote('PDF saved. It names only the colleagues being commended, so it is safe to share.');
    } catch {
      setProblem('Could not build the PDF.');
    }
    finally { setPdfBusy(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking-performance?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) {
        setProblem('Could not build the board.');
        return;
      }
      const data = await res.json();
      setReport(data.report);
      setCommended(data.commendedUserIds ?? []);
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

  const commend = async (personId: string, personName: string) => {
    setBusy(personId);
    setProblem(null);
    setNote(null);
    setHandoff(null);
    try {
      const res = await fetch('/api/booking-performance/commend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ personId, from, to }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProblem(data?.error ?? 'Could not send it.');
        return;
      }
      if (data.alreadySent) {
        setNote(data.message);
      } else {
        const href = data.whatsapp
          ? whatsappLink(data.whatsapp.number, data.whatsapp.text)
          : null;
        if (href) {
          setHandoff({ href, name: personName });
          // Opened straight away so the ordinary case is a single press. The
          // record is written on the server first, so a blocked pop-up cannot
          // leave a letter sent and unrecorded — only unsent, with the link
          // still on screen.
          window.open(href, '_blank', 'noopener');
        }
        setNote(
          `Letter of appreciation recorded for ${personName}.` +
            (href
              ? ' WhatsApp is opening with the message — press send there.'
              : ` No WhatsApp: ${data.whatsappSkipped ?? 'no number on file'}. It is in their ORM notifications.`),
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
        <h1 className="text-lg font-semibold">Booking performance</h1>
        <p className="mt-2 text-sm text-gray-600">
          This board ranks named colleagues by their booking record, which also shows the
          compliance rate of everybody further down it. It is restricted to theatre management
          and heads of department.
        </p>
      </div>
    );
  }

  const thanked = new Set(commended);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Award className="h-6 w-6 text-emerald-600" />
              Booking performance
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Elective cases booked before 15:00 on the day before surgery, and how much notice
              the theatre was given. Emergency and urgent cases are excluded — they could not
              have been booked ahead.
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={pdfBusy || !report}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
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
            <Loader2 className="h-4 w-4 animate-spin" /> Building the board…
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
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Elective cases</dt>
              <dd className="text-2xl font-semibold">{report.totalElective}</dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <dt className="text-xs text-gray-500">Booked on time</dt>
              <dd className="text-2xl font-semibold text-emerald-700">{report.totalOnTime}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Compliance</dt>
              <dd className="text-2xl font-semibold">{pct(report.overallComplianceRate)}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Typical notice</dt>
              <dd className="text-2xl font-semibold">
                {formatNotice(report.medianNoticeHours)}
              </dd>
            </div>
          </dl>
        )}

        <p className="mt-3 text-xs text-gray-500">
          Ranked on compliance first, then on how much notice was given, then on volume — so
          forty of forty on time outranks three of three. At least {MIN_CASES_TO_RANK} elective
          cases are needed to be ranked, and {Math.round(COMMENDATION_RATE * 100)}% on time to be
          commended.
        </p>
      </div>

      {/* ── The honour roll ───────────────────────────────────────────── */}
      {report && report.commendable.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-300 bg-white p-6 shadow print:break-inside-avoid">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Star className="h-5 w-5 text-emerald-600" />
            Commendable booking records
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            These colleagues booked at least {Math.round(COMMENDATION_RATE * 100)}% of their
            elective cases before the deadline. Pressing <em>Commend</em> sends them a letter of
            appreciation by WhatsApp and in ORM.
          </p>

          <ul className="mt-4 divide-y divide-gray-100">
            {report.commendable.map((b, i) => (
              <li
                key={b.personId ?? b.name}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {i + 1}
                    </span>
                    {b.name}
                    {b.perfect && (
                      <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Perfect
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {b.onTime} of {b.electiveTotal} on time ({pct(b.complianceRate)}) ·{' '}
                    <Clock className="inline h-3 w-3" /> {formatNotice(b.medianNoticeHours)} of
                    notice · {b.units.join(', ')}
                  </p>
                </div>
                <div className="print:hidden">
                  {!b.personId ? (
                    <span className="text-xs text-gray-400">No ORM account to write to</span>
                  ) : thanked.has(b.personId) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Check className="h-3.5 w-3.5 text-green-600" />
                      Thanked
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === b.personId}
                      onClick={() => void commend(b.personId!, b.name)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                    >
                      {busy === b.personId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Commend
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Everybody with enough cases to rank ───────────────────────── */}
      {report && report.bookers.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-1 text-lg font-semibold">Bookers, ranked</h2>
          <p className="mb-3 text-sm text-gray-600">
            Best record first. The rate and the notice are shown together, because one without
            the other says very little.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">On time</th>
                  <th className="py-2 pr-3">Compliance</th>
                  <th className="py-2 pr-3">Typical notice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.bookers.map((b, i) => (
                  <tr key={b.personId ?? b.name}>
                    <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium">{b.name}</td>
                    <td className="py-2 pr-3 text-gray-600">{b.units.join(', ')}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {b.onTime} / {b.electiveTotal}
                    </td>
                    <td
                      className={`py-2 pr-3 font-semibold ${
                        (b.complianceRate ?? 0) >= COMMENDATION_RATE
                          ? 'text-emerald-700'
                          : (b.complianceRate ?? 0) >= 0.6
                            ? 'text-gray-800'
                            : 'text-amber-700'
                      }`}
                    >
                      {pct(b.complianceRate)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                      {formatNotice(b.medianNoticeHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Units ─────────────────────────────────────────────────────── */}
      {report && report.units.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Units, ranked</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">On time</th>
                  <th className="py-2 pr-3">Compliance</th>
                  <th className="py-2 pr-3">Typical notice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.units.map((u, i) => (
                  <tr key={u.unit}>
                    <td className="py-2 pr-3 text-gray-500">{u.ranked ? i + 1 : '—'}</td>
                    <td className="py-2 pr-3 font-medium">
                      {u.unit}
                      {!u.ranked && (
                        <span className="ml-2 text-xs text-gray-400">
                          too few cases to rank
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {u.onTime} / {u.electiveTotal}
                    </td>
                    <td className="py-2 pr-3 font-semibold">{pct(u.complianceRate)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                      {formatNotice(u.medianNoticeHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Below the floor ──────────────────────────────────────────── */}
      {report && report.unranked.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-1 text-lg font-semibold">Too few cases to rank</h2>
          <p className="mb-3 text-sm text-gray-600">
            Fewer than {MIN_CASES_TO_RANK} elective cases in this window, so a percentage would
            not mean much. Listed so nobody is simply missing from the board.
          </p>
          <ul className="divide-y divide-gray-100 text-sm">
            {report.unranked.map((b) => (
              <li key={b.personId ?? b.name} className="flex justify-between py-2">
                <span>
                  {b.name}
                  <span className="ml-2 text-xs text-gray-500">{b.units.join(', ')}</span>
                </span>
                <span className="text-gray-600">
                  {b.onTime} / {b.electiveTotal} on time
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && report.totalElective === 0 && !loading && (
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-600">No elective cases in this window.</p>
        </div>
      )}

      <Appreciation report={report} />
    </div>
  );
}

/**
 * The standing note of appreciation, printed with the board.
 *
 * Here for the same reason the directive sits with the late-booking report: a
 * list of names circulated with no words around it is read as whatever the
 * reader already suspected.
 */
function Appreciation({ report }: { report: PunctualityReport | null }) {
  const best: BookerPerformance | undefined = report?.bookers[0];

  return (
    <div className="rounded-lg border-2 border-gray-300 bg-white p-6 shadow print:break-inside-avoid">
      <h2 className="text-lg font-bold text-gray-900">
        Theatre note: elective bookings made in good time
      </h2>
      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
        University of Nigeria Teaching Hospital, Ituku-Ozalla · Theatre Management
      </p>

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-800">
        <p>Dear Colleagues,</p>
        <p>
          Much of what theatre management writes about booking is about the cases that arrive
          late. This note is about the other ones.
        </p>
        <p>
          When an elective case is booked in good time, a great deal happens quietly and on
          schedule. The list is planned once rather than rebuilt. CSSD sterilises the right sets
          without a rush at the end of the day. Pharmacy and the consumable pack providers draw
          what the case actually needs. The nursing officer assigns staff to each theatre
          knowing what each theatre will be doing. None of that is visible on the day, which is
          precisely why it is worth saying out loud.
        </p>
        {report && report.totalElective > 0 && (
          <p className="rounded-lg bg-emerald-50 p-3">
            <strong>
              {report.totalOnTime} of {report.totalElective} elective cases in this period were
              booked before the deadline ({pct(report.overallComplianceRate)}), with a typical{' '}
              {formatNotice(report.medianNoticeHours)} of notice.
            </strong>
            {best && (
              <>
                {' '}
                The best record belongs to <strong>{best.name}</strong> — {best.onTime} of{' '}
                {best.electiveTotal} on time ({pct(best.complianceRate)}).
              </>
            )}
          </p>
        )}
        <p>
          <strong>Why notice is measured as well as compliance.</strong> A booking made at 14:55
          on the day before surgery meets the rule and gives the theatre five minutes. One made
          three days ahead gives every department room to work. Both are compliant; they are not
          the same contribution, and this board does not pretend otherwise.
        </p>
        <p>
          To everybody whose name appears above: thank you. The theatre runs on it, and we would
          rather be writing this than the other letter.
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
