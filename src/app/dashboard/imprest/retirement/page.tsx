'use client';

// ============================================================
// Retirements — the review queue
// ------------------------------------------------------------
// Two audiences share this screen. A preparer wants to see what they have sent
// and where it has got to; a reviewer wants the much shorter list of what is
// waiting on THEM. "Awaiting me" is therefore the default view.
//
// The decision buttons shown are only ever a hint: the server asks the workflow
// state machine, which is the authority on who may act at which stage.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, AlertCircle, CheckCircle2, XCircle, MessageSquareWarning, Send, FileDown } from 'lucide-react';
import { formatNaira } from '@/lib/imprest/money';
import { generateRetirementForm } from '@/lib/imprest/retirementPdf';

interface Retirement {
  id: string;
  retirementNumber: string;
  retirementDate: string;
  status: string;
  currentStage: string;
  amountReceived: number;
  totalExpenditure: number;
  balanceReturned: number;
  expenditureCount: number;
  receiptCount: number;
  imprest?: { id: string; imprestNumber: string; purpose: string; department?: { code: string; name: string } | null } | null;
  preparedBy?: { fullName: string } | null;
  _offlinePending?: string;
}

const STAGE_LABEL: Record<string, string> = {
  PREPARED: 'Prepared',
  SUBMITTED: 'Submitted',
  ACCOUNT_OFFICER_REVIEW: 'With the account officer',
  CHAIRMAN_REVIEW: 'With the chairman',
  FINANCE_REVIEW: 'With finance',
  INTERNAL_AUDIT: 'With internal audit',
  APPROVED: 'Approved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  IN_REVIEW: 'bg-blue-100 text-blue-800 border-blue-200',
  QUERIED: 'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
};

export default function RetirementQueuePage() {
  const [rows, setRows] = useState<Retirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [mineOnly, setMineOnly] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/imprest/retirements${mineOnly ? '?mine=true' : ''}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'You do not have an imprest duty assigned.');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDenied(false);
      setRows(data.retirements ?? []);
    } catch {
      setError('Could not load retirements. If you are offline they will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, [mineOnly]);

  useEffect(() => { load(); }, [load]);

  const act = async (r: Retirement, action: 'SUBMIT' | 'DECIDE' | 'CLOSE', decision?: string) => {
    const comment =
      decision === 'REJECT' || decision === 'QUERY'
        ? window.prompt(decision === 'REJECT' ? 'Reason for rejection:' : 'What needs clarifying?') ?? ''
        : undefined;
    if ((decision === 'REJECT' || decision === 'QUERY') && !comment?.trim()) {
      setNotice('A reason is required so the preparer knows what to correct.');
      return;
    }

    setBusyId(r.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/imprest/retirements/${r.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, decision, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The workflow module's own wording — it explains precisely why.
        setNotice(data.error || 'That action could not be recorded.');
        return;
      }
      setNotice(`${r.retirementNumber}: ${STAGE_LABEL[data.stage] ?? data.stage}.`);
      await load();
    } catch {
      setNotice('Saved on this device — it will sync when you are back online.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadForm = async (r: Retirement) => {
    setBusyId(r.id);
    setNotice(null);
    try {
      const { blob, documentId, certified } = await generateRetirementForm({
        retirementNumber: r.retirementNumber,
        retirementDate: r.retirementDate,
        status: r.status,
        currentStage: r.currentStage,
        amountReceived: r.amountReceived,
        totalExpenditure: r.totalExpenditure,
        balanceReturned: r.balanceReturned,
        expenditureCount: r.expenditureCount,
        receiptCount: r.receiptCount,
        imprest: r.imprest ?? null,
        preparedBy: r.preparedBy ?? null,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.retirementNumber.replace(/\//g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setNotice(
        certified
          ? `Issued ${documentId}. The QR code on the form verifies it.`
          : `Issued ${documentId}, but the checksum could not be registered — it will verify as "issued, but not certified" until you are back online.`
      );
    } catch (err) {
      setNotice((err as Error).message || 'The form could not be produced.');
    } finally {
      setBusyId(null);
    }
  };

  if (denied) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">No imprest duty assigned</p>
              <p className="text-sm text-amber-800">{error}</p>
              <Link href="/dashboard/imprest/duties" className="text-xs font-semibold text-amber-900 underline">
                Open Imprest Duties →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <ClipboardCheck className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Retirements</h1>
            <p className="text-sm text-gray-500">Certification and the statutory approval chain.</p>
          </div>
        </div>
        <div className="flex rounded-lg border border-gray-300 p-0.5 text-sm">
          <button
            onClick={() => setMineOnly(true)}
            className={`rounded-md px-3 py-1.5 font-medium ${mineOnly ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
          >
            Awaiting me
          </button>
          <button
            onClick={() => setMineOnly(false)}
            className={`rounded-md px-3 py-1.5 font-medium ${!mineOnly ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
          >
            All
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>
      )}
      {error && !denied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-700">
            {mineOnly ? 'Nothing is waiting on you' : 'No retirements yet'}
          </p>
          <p className="text-xs text-gray-500">
            {mineOnly
              ? 'Switch to “All” to see retirements at other stages.'
              : 'A retirement is prepared from an imprest once its expenditure has been posted.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const unaccounted = r.amountReceived - r.totalExpenditure - r.balanceReturned;
            const reviewable = ['ACCOUNT_OFFICER_REVIEW', 'CHAIRMAN_REVIEW', 'FINANCE_REVIEW', 'INTERNAL_AUDIT'].includes(r.currentStage);
            return (
              <div key={r.id} className={`rounded-xl border bg-white p-4 ${r._offlinePending ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{r.retirementNumber}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[r.status] ?? ''}`}>
                        {r.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-500">{STAGE_LABEL[r.currentStage] ?? r.currentStage}</span>
                    </div>
                    {r.imprest && (
                      <p className="mt-1 text-sm text-gray-600">
                        <Link href={`/dashboard/imprest/${r.imprest.id}`} className="font-medium text-primary-700 hover:underline">
                          {r.imprest.imprestNumber}
                        </Link>
                        {' · '}{r.imprest.purpose}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-500">
                      Prepared by {r.preparedBy?.fullName ?? '—'} ·{' '}
                      {r.expenditureCount} line{r.expenditureCount === 1 ? '' : 's'} ·{' '}
                      {r.receiptCount} with receipts
                    </p>
                  </div>

                  <div className="text-right text-sm">
                    <p className="tabular-nums text-gray-600">Received {formatNaira(r.amountReceived)}</p>
                    <p className="tabular-nums text-gray-600">Spent {formatNaira(r.totalExpenditure)}</p>
                    <p className="tabular-nums font-semibold text-gray-900">Returned {formatNaira(r.balanceReturned)}</p>
                    {unaccounted !== 0 && (
                      <p className="text-xs font-semibold text-red-600">
                        {formatNaira(Math.abs(unaccounted))} unaccounted
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  {r.currentStage === 'PREPARED' && (
                    <Action onClick={() => act(r, 'SUBMIT')} busy={busyId === r.id} icon={Send} label="Submit for review" primary />
                  )}
                  {reviewable && (
                    <>
                      <Action onClick={() => act(r, 'DECIDE', 'APPROVE')} busy={busyId === r.id} icon={CheckCircle2} label="Approve" primary />
                      <Action onClick={() => act(r, 'DECIDE', 'QUERY')} busy={busyId === r.id} icon={MessageSquareWarning} label="Query" />
                      <Action onClick={() => act(r, 'DECIDE', 'REJECT')} busy={busyId === r.id} icon={XCircle} label="Reject" danger />
                    </>
                  )}
                  {r.currentStage === 'APPROVED' && (
                    <Action onClick={() => act(r, 'CLOSE')} busy={busyId === r.id} icon={CheckCircle2} label="Close retirement" primary />
                  )}
                  <Action onClick={() => downloadForm(r)} busy={busyId === r.id} icon={FileDown} label="Retirement form" />
                  {r._offlinePending && (
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                      SAVED ON THIS DEVICE
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Action({
  onClick, busy, icon: Icon, label, primary, danger,
}: {
  onClick: () => void; busy: boolean; icon: React.ComponentType<{ className?: string }>;
  label: string; primary?: boolean; danger?: boolean;
}) {
  const cls = primary
    ? 'bg-primary-600 text-white hover:bg-primary-700'
    : danger
      ? 'border border-red-300 text-red-700 hover:bg-red-50'
      : 'border border-gray-300 text-gray-700 hover:bg-gray-50';
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
