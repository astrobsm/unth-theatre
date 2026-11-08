'use client';

/**
 * Completed operations the ORM cannot account for after theatre.
 *
 * ONE CARD PER DAY, newest first, because the person who answers for a
 * recovery record is whoever was supervising that shift — not whoever booked
 * the case or whoever operated. Grouping by surgeon, which is how every other
 * chase board in this application is grouped, would be the wrong question
 * asked of the wrong person.
 *
 * LOOKING BACKWARDS, UNLIKE CASE-CHASE. A missing consent is worth finding
 * before the operation. A missing recovery record can only be found after it,
 * and it can still be written: a record completed late and dated honestly is
 * worth a great deal, and that is what these messages ask for.
 *
 * THE PREVIEW IS NOT OPTIONAL HERE IN SPIRIT. These letters carry a
 * medicolegal warning and they name patients. Whoever presses send should have
 * read exactly what the nurse will read, which is why Preview sits beside
 * Send on every row rather than behind a menu.
 *
 * A DAY WITH NOBODY ROSTERED IS SHOWN AS SUCH. Gaps on a day with no
 * supervisor and no recovery nurse on the published roster cannot be chased at
 * all, and that is a rostering problem, not a nursing one.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, Check, Eye, HeartPulse, Loader2, Scale, Send, UserX,
} from 'lucide-react';

interface Recipient {
  id: string;
  fullName: string;
  role: string | null;
  hasPhone: boolean;
  active: boolean;
  shift: string | null;
  source: 'SUPERVISOR' | 'RECOVERY_NURSE' | 'RECORD_HOLDER';
  caseCount: number;
  sentAt: string | null;
}

interface GapCase {
  id: string;
  patientName: string | null;
  folderNumber: string | null;
  procedureName: string;
  unit: string | null;
  scheduledTime: string | null;
  gaps: string[];
  hoursOpen: number | null;
  openedClock: string | null;
  needICU: boolean;
  receivedByName: string | null;
}

interface Day {
  day: string;
  dayLabel: string;
  completedCount: number;
  mortalityCount: number;
  counts: Record<string, number>;
  headline: string;
  nobodyToWriteTo: boolean;
  unmatchedCount: number;
  cases: GapCase[];
  supervisors: Recipient[];
  recoveryNurses: Recipient[];
  recordHolders: Recipient[];
}

interface Board {
  from: string;
  to: string;
  today: string;
  periodLabel: string;
  canSend: boolean;
  totals: Record<string, number>;
  gapLabels: { code: string; label: string; missing: string }[];
  days: Day[];
}

const SOURCE_WORDS: Record<Recipient['source'], string> = {
  SUPERVISOR: 'Nurse supervisor on duty',
  RECOVERY_NURSE: 'Rostered to recovery',
  RECORD_HOLDER: 'Opened the record',
};

export default function RecoveryChasePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState('');
  const [preview, setPreview] = useState<{ text: string; headline: string } | null>(null);

  const load = useCallback(async (a?: string, b?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = a && b ? `?from=${a}&to=${b}` : '';
      const res = await fetch(`/api/recovery-chase${qs}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not read the board.');
        return;
      }
      setBoard(d);
      setFrom(d.from);
      setTo(d.to);
    } catch {
      setError('Could not read the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (day: string, person: Recipient, asPreview: boolean) => {
    setBusy(`${day}-${person.id}-${asPreview ? 'p' : 's'}`);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/recovery-chase/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, personId: person.id, preview: asPreview }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not do that.');
        return;
      }
      if (asPreview) {
        setPreview({ text: d.text, headline: d.headline });
        return;
      }
      setResult(d.message ?? (d.alreadySent ? 'Already sent.' : 'Sent.'));
      await load(from, to);
    } catch {
      setError('Could not do that.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-rose-50 p-2.5 text-rose-700">
          <HeartPulse className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recovery records outstanding</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Completed operations with no recovery record on the ORM, and recovery records
            that were opened and never closed. Asked of the nurse supervisor on duty that
            shift, from the published roster.
          </p>
        </div>
      </div>

      <section className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
        <p className="text-xs leading-relaxed text-rose-900">
          A patient with no post-anaesthetic record has nothing on file about their airway,
          conscious level or observations after theatre. In any claim or enquiry the hospital
          and the nurse are defended by the same document — and where it does not exist,
          neither of them has anything to stand on. A chart filed on paper does not answer
          it: the ward cannot see it, the hospital cannot produce it years later, and duty
          performance credits it to nobody.
        </p>
      </section>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-gray-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load(from, to)}
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white"
        >
          Show
        </button>
        {board && <span className="ml-auto text-xs text-gray-500">{board.periodLabel}</span>}
      </div>

      {board && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="No recovery record" value={board.totals.NO_RECOVERY_RECORD ?? 0} />
          <Stat label="Never discharged" value={board.totals.NOT_DISCHARGED ?? 0} />
          <Stat label="Completed in period" value={board.totals.completed ?? 0} />
          <Stat label="Days with nobody rostered" value={board.totals.daysWithNobodyToWriteTo ?? 0} />
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <Check className="h-4 w-4" /> {result}
        </p>
      )}

      {board && !board.canSend && (
        <p className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          You can read this board and close the gaps on it. Sending a chase from it is done
          by theatre management or the Head of Anaesthesia — a message carrying a medicolegal
          warning is not one nurse&rsquo;s to send another.
        </p>
      )}

      {loading && !board && (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the completed cases…
        </p>
      )}

      {board && board.days.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Every completed operation in this period has a recovery record, and every record
          was closed. That is worth knowing too — and it is worth saying to the recovery
          room.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {(board?.days ?? []).map((d) => {
          const people = d.supervisors.concat(d.recoveryNurses, d.recordHolders);
          return (
            <div key={d.day} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">{d.dayLabel}</p>
                  <p className="mt-0.5 text-sm text-gray-800">{d.headline}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {d.completedCount} completed that day
                    {d.mortalityCount > 0
                      && ` · ${d.mortalityCount} with a mortality on file, not counted`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(open === d.day ? '' : d.day)}
                    className="mt-1 text-xs font-semibold text-primary-700 underline"
                  >
                    {open === d.day ? 'Hide the patients' : `Show the ${d.cases.length} patients`}
                  </button>
                </div>
              </div>

              {open === d.day && (
                <ul className="divide-y divide-gray-100 border-y border-gray-100 bg-gray-50/60">
                  {d.cases.map((c) => (
                    <li key={c.id} className="px-4 py-2 text-xs text-gray-700">
                      <Link href={`/dashboard/pacu`} className="font-semibold underline">
                        {c.patientName ?? 'Patient'}
                        {c.folderNumber ? ` (${c.folderNumber})` : ''}
                      </Link>
                      {c.scheduledTime ? ` · ${c.scheduledTime}` : ''} — {c.procedureName}
                      <span className="ml-1 text-rose-700">
                        {' · '}
                        {c.gaps.indexOf('NO_RECOVERY_RECORD') !== -1 && 'no recovery record'}
                        {c.gaps.indexOf('NOT_DISCHARGED') !== -1
                          && `record open since ${c.openedClock ?? 'admission'}`
                            + `${c.hoursOpen != null ? ` — ${c.hoursOpen} h` : ''}, never discharged`}
                      </span>
                      {c.receivedByName && (
                        <span className="ml-1 text-gray-500">· received by {c.receivedByName}</span>
                      )}
                      {c.needICU && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                          booked for ICU
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {d.nobodyToWriteTo ? (
                <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 p-4">
                  <UserX className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <p className="text-xs text-amber-900">
                    No nurse supervisor and no recovery nurse were on the published roster for
                    this day, so there is nobody to write to. That is a rostering gap, not a
                    nursing one, and it needs somebody named on{' '}
                    <Link href="/dashboard/holding-area/staffing" className="font-semibold underline">
                      theatre staffing
                    </Link>{' '}
                    before this day can be chased at all.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {people.map((p) => (
                    <li
                      key={`${d.day}-${p.id}-${p.source}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {p.fullName}
                          {p.sentAt && (
                            <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                              written to {p.sentAt.slice(0, 10)}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {SOURCE_WORDS[p.source]}
                          {p.shift ? ` · ${p.shift.toLowerCase()} shift` : ''}
                          {` · ${p.caseCount} ${p.caseCount === 1 ? 'patient' : 'patients'}`}
                          {!p.hasPhone && ' · no phone number on file'}
                          {!p.active && ' · account not active'}
                        </p>
                      </div>
                      {board?.canSend && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy !== ''}
                            onClick={() => void act(d.day, p, true)}
                            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {busy === `${d.day}-${p.id}-p`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Eye className="h-3.5 w-3.5" />}
                            Preview
                          </button>
                          <button
                            type="button"
                            disabled={busy !== '' || !p.active}
                            onClick={() => void act(d.day, p, false)}
                            className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            {busy === `${d.day}-${p.id}-s`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Send className="h-3.5 w-3.5" />}
                            {p.sentAt ? 'Send again' : 'Send'}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {d.unmatchedCount > 0 && !d.nobodyToWriteTo && (
                <p className="flex items-start gap-2 border-t border-gray-100 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {d.unmatchedCount} of these patients were in recovery at an hour no rostered
                  supervisor covers, so nobody above is being asked about them.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {board && (
        <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A record is counted as outstanding 30 minutes after the patient left theatre, and a
          discharge from the end of the day the patient was received — the same deadlines
          duty performance judges these two duties on. Cases with a mortality on file raise
          nothing, and a patient taken from theatre straight to ICU may genuinely never enter
          recovery: the ORM has no field that knows this, so it has to be told.
        </p>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-gray-900">As it will reach them</h3>
            <p className="mt-0.5 text-xs text-gray-500">{preview.headline}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
              {preview.text}
            </pre>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
