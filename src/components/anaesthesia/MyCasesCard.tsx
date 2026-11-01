'use client';

/**
 * What is waiting on this anaesthetist, on his own dashboard.
 *
 * RENDERS NOTHING FOR ANYBODY ELSE. The endpoint refuses every role but the
 * two anaesthetist grades and the card simply does not appear — the same
 * pattern the celebrations card uses, and the reason neither needs the
 * dashboard to know who is reading it.
 *
 * IT ALSO RENDERS NOTHING WHEN THERE IS NOTHING. A consultant whose week is
 * fully reviewed and approved sees one quiet line, not an empty panel. The
 * value of this card is that on the morning it does have something in it, it
 * is noticed.
 *
 * WHY "APPROVE ALL" ASKS TWICE. Approving a prescription is a clinical
 * signature on named patients' drugs. One press that signs eight of them
 * without showing whose they are is not a signature, so the first press lists
 * the patients and the second one signs. Cases where the patient was assessed
 * NOT FIT are never in that list; the server refuses them and says so.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, Loader2, Stethoscope,
} from 'lucide-react';

type Need =
  | 'APPROVE_PRESCRIPTION' | 'NOT_REVIEWED' | 'REVIEW_UNFINISHED'
  | 'NO_PRESCRIPTION' | 'PRESCRIPTION_DRAFT' | 'PRESCRIPTION_REJECTED' | 'NOT_FIT';

interface MyCase {
  id: string;
  patientName: string;
  folderNumber: string | null;
  procedureName: string;
  unit: string;
  theatre: string | null;
  scheduledDate: string;
  scheduledTime: string;
  needs: Need[];
  readyForTheatre: boolean;
  prescription: { id: string | null; itemCount: number; prescribedByName: string | null };
  review: { byName: string | null };
}

interface Counts {
  total: number; waiting: number; awaitingApproval: number;
  notReviewed: number; reviewUnfinished: number; noPrescription: number;
  notFit: number; ready: number;
}

const NEED_LABEL: Record<Need, string> = {
  APPROVE_PRESCRIPTION: 'Awaiting your approval',
  NOT_REVIEWED: 'Not yet reviewed',
  REVIEW_UNFINISHED: 'Review unfinished',
  NO_PRESCRIPTION: 'No prescription',
  PRESCRIPTION_DRAFT: 'Prescription a draft',
  PRESCRIPTION_REJECTED: 'Prescription rejected',
  NOT_FIT: 'NOT FIT',
};

const NEED_TONE: Record<Need, string> = {
  APPROVE_PRESCRIPTION: 'bg-amber-100 text-amber-900',
  NOT_REVIEWED: 'bg-blue-100 text-blue-900',
  REVIEW_UNFINISHED: 'bg-blue-100 text-blue-900',
  NO_PRESCRIPTION: 'bg-gray-100 text-gray-800',
  PRESCRIPTION_DRAFT: 'bg-gray-100 text-gray-800',
  PRESCRIPTION_REJECTED: 'bg-red-100 text-red-900',
  NOT_FIT: 'bg-red-600 text-white',
};

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const d = new Date(`${iso}T00:00:00.000Z`);
  const t = new Date(`${today}T00:00:00.000Z`);
  if (d.getTime() - t.getTime() === 86400000) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default function MyAnaesthesiaCasesCard() {
  const [cases, setCases] = useState<MyCase[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [head, setHead] = useState('');
  const [today, setToday] = useState('');
  const [approvable, setApprovable] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [blocked, setBlocked] = useState<{ label: string; reason: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/anaesthesia/my-cases?days=7', { cache: 'no-store' });
      if (!res.ok) return; // Not an anaesthetist, or unavailable. Say nothing.
      const d = await res.json();
      setCases(d.cases ?? []);
      setCounts(d.counts ?? null);
      setHead(d.headline ?? '');
      setToday(d.from ?? '');
      setApprovable(d.approvableCount ?? 0);
    } catch {
      // Never let this break a dashboard.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const approveOne = async (prescriptionId: string) => {
    setBusy(prescriptionId);
    setNote('');
    try {
      const res = await fetch('/api/anaesthesia/my-cases/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prescriptionIds: [prescriptionId] }),
      });
      const d = await res.json();
      setNote(d.error || d.message || 'Done.');
      setBlocked(d.blocked ?? []);
      await load();
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    setBusy('all');
    setNote('');
    try {
      const res = await fetch('/api/anaesthesia/my-cases/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      setNote(d.error || d.message || 'Done.');
      setBlocked(d.blocked ?? []);
      setConfirming(false);
      await load();
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  // Nothing assigned, or nothing outstanding and nothing to say.
  if (!counts || counts.total === 0) return null;

  const waiting = cases.filter((c) => c.needs.length > 0);
  const toApprove = cases.filter((c) => c.needs.indexOf('APPROVE_PRESCRIPTION') !== -1);

  if (waiting.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-green-200 p-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="w-5 h-5" />
          <span>All {counts.total} of your cases this week are reviewed and approved.</span>
          <Link href="/dashboard/anaesthetist-board" className="ml-auto text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
            Review board <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-amber-200 mb-6 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex flex-wrap items-center gap-3">
        <Stethoscope className="w-5 h-5 text-amber-700" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900">Your cases</h2>
          <p className="text-sm text-gray-700">{head}</p>
        </div>
        <Link
          href="/dashboard/anaesthetist-board"
          className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
        >
          Review board <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {approvable > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 bg-white">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
            >
              <ClipboardCheck className="w-4 h-4" />
              Approve all {approvable} prescription{approvable === 1 ? '' : 's'}
            </button>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-gray-900 mb-2">
                You are approving the anaesthetic drugs for:
              </p>
              <ul className="text-sm text-gray-800 space-y-1 mb-3">
                {toApprove.map((c) => (
                  <li key={c.id}>
                    {c.patientName}{c.folderNumber ? ` (${c.folderNumber})` : ''} — {c.procedureName}
                    {c.prescription.itemCount > 0 ? `, ${c.prescription.itemCount} item${c.prescription.itemCount === 1 ? '' : 's'}` : ''}
                    {c.prescription.prescribedByName ? `, written by ${c.prescription.prescribedByName}` : ''}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  onClick={approveAll}
                  disabled={busy !== null}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
                >
                  {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Yes, approve {toApprove.length}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-white"
                >
                  Not now
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {waiting.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {c.patientName}{c.folderNumber ? ` · ${c.folderNumber}` : ''}
                </div>
                <div className="text-sm text-gray-600">{c.procedureName}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dayLabel(c.scheduledDate, today)}
                  {c.scheduledTime ? ` ${c.scheduledTime}` : ''}
                  {c.theatre ? ` · ${c.theatre}` : ''}
                  {c.unit ? ` · ${c.unit}` : ''}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.needs.map((n) => (
                    <span key={n} className={`text-xs px-2 py-0.5 rounded-full ${NEED_TONE[n]}`}>
                      {NEED_LABEL[n]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {c.needs.indexOf('APPROVE_PRESCRIPTION') !== -1
                  && c.needs.indexOf('NOT_FIT') === -1
                  && c.prescription.id && (
                  <button
                    onClick={() => approveOne(c.prescription.id as string)}
                    disabled={busy !== null}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1"
                  >
                    {busy === c.prescription.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Approve
                  </button>
                )}
                <Link
                  href={`/dashboard/surgeries/${c.id}`}
                  className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
                >
                  Open <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {(note || blocked.length > 0) && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
          {note && <p className="text-sm text-gray-700">{note}</p>}
          {blocked.map((b) => (
            <p key={b.label} className="text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{b.label}: {b.reason}.</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
