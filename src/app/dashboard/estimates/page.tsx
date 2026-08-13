'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, FileDown, Send, CheckCircle2 } from 'lucide-react';
import { buildEstimatePdf, estimateFileName, type EstimatePdfData } from '@/lib/estimates/estimatePdf';
import { formatNaira } from '@/lib/estimates/calculate';

/**
 * Surgery cost estimates — the screen a patient's figures are given out from.
 *
 * The PDF is built in the BROWSER from the stored estimate, like every other
 * document in this app. That matters beyond convention: a phone that has already
 * loaded an estimate can reprint it with no connection, and the figures come from
 * what was saved rather than from re-reading today's prices.
 */

interface Line {
  section: string; description: string; unit: string; quantity: number;
  unitPriceKobo: number; totalKobo: number;
  frequencyPerDay?: number | null; durationDays?: number | null;
}
interface Estimate {
  id: string; estimateNumber: string; status: string; revision: number;
  patientName: string; folderNumber?: string | null; procedureName: string;
  subspecialty?: string | null; unit?: string | null; surgeonName?: string | null;
  anaesthesiaType?: string | null; surgeryType?: string | null;
  plannedDate?: string | null; admissionType: string; expectedStayDays: number;
  subtotalKobo: number; depositKobo: number; totalKobo: number;
  validUntil?: string | null; preparedByName?: string | null;
  approvedByName?: string | null; approvedAt?: string | null;
  notes?: string | null; sharedToPhone?: string | null; sharedAt?: string | null;
  lines: Line[];
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  PENDING_REVIEW: 'bg-amber-100 text-amber-900 border-amber-300',
  APPROVED: 'bg-blue-100 text-blue-800 border-blue-300',
  ISSUED: 'bg-green-100 text-green-800 border-green-300',
  REVISED: 'bg-gray-100 text-gray-700 border-gray-300',
  EXPIRED: 'bg-red-100 text-red-800 border-red-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300',
  SUPERSEDED: 'bg-gray-100 text-gray-500 border-gray-300',
};

const APPROVE_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ACCOUNTANT'];

export default function EstimatesPage() {
  const { data: session } = useSession();
  const myRole = (session?.user as { role?: string } | undefined)?.role ?? '';
  const canApprove = APPROVE_ROLES.includes(myRole);

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/estimates')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEstimates(d?.estimates ?? []))
      .catch(() => setNote('Could not load estimates.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = estimates.filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || [e.patientName, e.estimateNumber, e.procedureName, e.folderNumber ?? '']
      .some((f) => f.toLowerCase().includes(q));
  });

  const download = async (e: Estimate) => {
    setBusy(e.id);
    setNote('');
    try {
      const blob = await buildEstimatePdf(e as unknown as EstimatePdfData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = estimateFileName(e);
      a.click();
      // Revoked on the next tick, not immediately: some browsers have not begun
      // reading the blob when click() returns, and revoking early gives an empty
      // file with no error.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      setNote('Could not build the PDF.');
    } finally {
      setBusy(null);
    }
  };

  const share = async (e: Estimate) => {
    const phone = window.prompt(
      `Send estimate ${e.estimateNumber} to which number?\n\nThe message carries the figures and a reference — no diagnosis.`,
      e.sharedToPhone ?? ''
    );
    if (!phone) return;

    setBusy(e.id);
    setNote('');
    try {
      const res = await fetch(`/api/estimates/${e.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, viewUrl: `${window.location.origin}/dashboard/estimates` }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setNote(body.error ?? 'Could not share.'); return; }
      // The server composed the message from the stored estimate and recorded
      // the send; this only opens WhatsApp with it.
      window.open(body.url, '_blank');
      load();
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const approve = async (e: Estimate) => {
    setBusy(e.id);
    setNote('');
    try {
      const res = await fetch(`/api/estimates/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE', validDays: 30 }),
      });
      const body = await res.json().catch(() => ({}));
      setNote(res.ok ? 'Approved — it can now be given to the patient.' : (body.error ?? 'Could not approve.'));
      if (res.ok) load();
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Surgery cost estimates</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        A draft is created automatically when a case is booked. Cost it, have it approved,
        then give it to the patient as a PDF or on WhatsApp.
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Patient, folder number, estimate number or procedure"
        className="mt-4 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      {note && <p className="mt-3 text-sm font-medium text-gray-900">{note}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          {estimates.length === 0
            ? 'No estimates yet. One is created automatically when a case is booked.'
            : `No estimate matches “${search.trim()}”.`}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((e) => {
            const uncosted = e.totalKobo <= 0;
            const approved = e.status === 'APPROVED' || e.status === 'ISSUED';
            return (
              <div key={e.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-gray-500">{e.estimateNumber}</span>
                  <span className="font-semibold text-gray-900">{e.patientName}</span>
                  {e.folderNumber && <span className="text-xs text-gray-500">{e.folderNumber}</span>}
                  <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[e.status] ?? ''}`}>
                    {e.status.replace(/_/g, ' ')}
                  </span>
                  {e.revision > 1 && (
                    <span className="text-[11px] text-gray-500">revision {e.revision}</span>
                  )}
                </div>

                <p className="mt-1 text-sm text-gray-700">{e.procedureName}</p>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="text-lg font-bold text-gray-900">
                    {uncosted ? 'Not costed yet' : formatNaira(e.totalKobo)}
                  </span>
                  {e.depositKobo > 0 && (
                    <span className="text-sm text-gray-600">
                      deposit {formatNaira(e.depositKobo)}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{e.lines.length} line(s)</span>
                  {e.sharedAt && (
                    <span className="text-xs text-green-700">
                      sent to {e.sharedToPhone}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => download(e)}
                    disabled={busy === e.id}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4" />
                    {busy === e.id ? 'Working…' : 'Download PDF'}
                  </button>

                  {/* Approve and share are shown only where they are possible.
                      A disabled button on a screen used under pressure is a
                      question somebody has to ask; an absent one is not. */}
                  {canApprove && !approved && !uncosted && (
                    <button
                      onClick={() => approve(e)}
                      disabled={busy === e.id}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                  )}

                  {approved && (
                    <button
                      onClick={() => share(e)}
                      disabled={busy === e.id}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
                    >
                      <Send className="h-4 w-4" /> Send on WhatsApp
                    </button>
                  )}
                </div>

                {/* Says why an action is unavailable, rather than leaving a gap.
                    A draft PDF is watermarked, so downloading one is safe. */}
                {uncosted && (
                  <p className="mt-2 text-xs text-amber-800">
                    Nothing has been costed on this estimate yet — it cannot be approved or sent.
                  </p>
                )}
                {!approved && !uncosted && !canApprove && (
                  <p className="mt-2 text-xs text-gray-600">
                    Awaiting approval before it can be given to the patient.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
