'use client';

/**
 * One deposit, on one case, on the counter it is paid at.
 *
 * REQUESTED → PAID → COLLECTED, and the collection half is split in two
 * because two different people collect it: the scrub nurse takes the surgical
 * half, the anaesthetist takes the anaesthetic half. The anaesthetic half is
 * where the controlled drugs are, so "theatre collected it" is not an answer.
 *
 * THE AMOUNT IS NEVER PRINTED AS ZERO WHEN NOBODY HAS SET IT. An unset band
 * and a band of nothing are different facts and the panel says which, because
 * a cashier who collects nothing from a super-major case because an
 * administrator had not got to the number yet is the failure this guards.
 *
 * The staff list is fetched once per page, not once per card. A theatre day is
 * thirty cards and each would otherwise ask the server for the same two
 * hundred names.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, AlertTriangle, Undo2, PackageCheck } from 'lucide-react';
import {
  DEPOSIT_KIND_COVERS,
  DEPOSIT_KIND_LABEL,
  DEPOSIT_KIND_PAY_POINT,
  categoryLabel,
  depositView,
  naira,
  streamsFor,
  type DepositKind,
  type DepositStatus,
} from '@/lib/deposits/depositBands';

export interface DepositRow {
  id: string;
  surgeryId: string;
  kind: DepositKind;
  status: DepositStatus;
  expectedAmount: string | null;
  magnitudeAtPricing: string | null;
  amountPaid: string | null;
  receiptNumber: string | null;
  paidAt: string | null;
  paidRecordedByName: string | null;
  waivedAt: string | null;
  waivedByName: string | null;
  waivedReason: string | null;
}

export interface CollectionRow {
  id: string;
  surgeryId: string;
  stream: string;
  kind: string;
  collectedById: string | null;
  collectedByName: string | null;
  collectorKind: string | null;
  collectedAt: string | null;
  recordedByName: string | null;
}

interface Staff {
  id: string;
  fullName: string;
  role: string;
}

/**
 * The roles each dropdown offers.
 *
 * Deliberately wider than the single obvious role. SCRUB_NURSE and
 * ANAESTHETIST are both roles that, measured on this database, many of the
 * people doing the job do not actually hold — theatre nurses are registered
 * under several titles. A dropdown that matches nobody is worse than no
 * dropdown, so the lists are broad and a name can be typed in regardless.
 */
const SCRUB_ROLES = 'SCRUB_NURSE,RECOVERY_ROOM_NURSE,WARD_NURSE_IN_CHARGE,THEATRE_STORE_KEEPER';
const ANAES_ROLES = 'ANAESTHETIST,CONSULTANT_ANAESTHETIST,HEAD_OF_ANAESTHESIA,ANAESTHETIC_TECHNICIAN';

/** Fetched once per page load, shared by every card on it. */
const staffCache: Record<string, Promise<Staff[]>> = {};

function loadStaff(roles: string): Promise<Staff[]> {
  if (!staffCache[roles]) {
    staffCache[roles] = fetch(
      `/api/users?roles=${encodeURIComponent(roles)}&status=APPROVED&slim=1&limit=300`,
      { credentials: 'include' },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => (Array.isArray(rows) ? (rows as Staff[]) : []))
      .catch(() => [] as Staff[]);
  }
  return staffCache[roles];
}

const timeText = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Composed from local parts. toLocaleString here reads the device clock's
  // idea of the zone, and half the handsets in this theatre are not on WAT.
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
};

const STATUS_STYLE: Record<DepositStatus, string> = {
  REQUESTED: 'bg-amber-100 text-amber-900 border-amber-300',
  PAID: 'bg-blue-100 text-blue-900 border-blue-300',
  COLLECTED: 'bg-green-100 text-green-900 border-green-300',
  WAIVED: 'bg-gray-100 text-gray-700 border-gray-300',
};

interface Props {
  surgeryId: string;
  magnitude: string | null | undefined;
  kind: DepositKind;
  settings: Record<string, string | null> | null;
  deposit: DepositRow | null;
  collections: CollectionRow[];
  canWrite: boolean;
  onChanged: () => void;
}

export default function DepositPanel({
  surgeryId, magnitude, kind, settings, deposit, collections, canWrite, onChanged,
}: Props) {
  const status: DepositStatus = deposit?.status ?? 'REQUESTED';
  const view = depositView(settings, kind, magnitude, status);

  const [receipt, setReceipt] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [scrubs, setScrubs] = useState<Staff[]>([]);
  const [anaes, setAnaes] = useState<Staff[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void loadStaff(SCRUB_ROLES).then((r) => alive && setScrubs(r));
    void loadStaff(ANAES_ROLES).then((r) => alive && setAnaes(r));
    return () => { alive = false; };
  }, []);

  const call = useCallback(async (init: RequestInit, path = '/api/surgery-deposits') => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        ...init,
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = `The server answered ${res.status}.`;
        try { msg = (JSON.parse(text) as { error?: string }).error || msg; } catch { /* HTML page */ }
        setProblem(msg);
        return false;
      }
      onChanged();
      return true;
    } catch {
      setProblem('Could not reach the server. Nothing was recorded.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const markPaid = () =>
    call({
      method: 'PATCH',
      body: JSON.stringify({ surgeryId, kind, action: 'MARK_PAID', receiptNumber: receipt.trim() || null }),
    });

  const undoPaid = () =>
    call({ method: 'PATCH', body: JSON.stringify({ surgeryId, kind, action: 'UNDO_PAID' }) });

  const collect = (stream: string) => {
    const id = picked[stream] || '';
    const name = typed[stream]?.trim() || '';
    return call({
      method: 'POST',
      body: JSON.stringify({ surgeryId, stream, collectedById: id || null, collectedByName: name }),
    });
  };

  const undoCollect = (stream: string) =>
    call({ method: 'POST', body: JSON.stringify({ surgeryId, stream, undo: true }) });

  const paid = status === 'PAID' || status === 'COLLECTED' || status === 'WAIVED';

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Banknote className="h-4 w-4 text-emerald-700" />
        <span className="font-semibold text-emerald-900">{DEPOSIT_KIND_LABEL[kind]}</span>
        <span className={`rounded border px-2 py-0.5 font-semibold ${STATUS_STYLE[status]}`}>
          {status}
        </span>
        {view.expected != null ? (
          <span className="font-semibold text-gray-900">{naira(view.expected)}</span>
        ) : null}
        {categoryLabel(magnitude) ? (
          <span className="rounded bg-white px-2 py-0.5 text-gray-700 border border-gray-300">
            {categoryLabel(magnitude)}
          </span>
        ) : null}
        <span className="text-gray-500">· {DEPOSIT_KIND_COVERS[kind]}</span>
      </div>

      {/* Why there is no figure, when there is none. "—" sends somebody to ask
          a colleague; this sends them to the thing that is actually missing. */}
      {view.noAmountReason && (
        <div className="mt-2 flex items-start gap-1.5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{view.noAmountReason}</span>
        </div>
      )}

      {status === 'REQUESTED' && (
        <div className="mt-1 text-gray-600">
          Paid at {DEPOSIT_KIND_PAY_POINT[kind]}.
        </div>
      )}

      {deposit?.paidAt && (
        <div className="mt-2 text-gray-700">
          Paid {timeText(deposit.paidAt)}
          {deposit.amountPaid ? ` · ${naira(Number(deposit.amountPaid))}` : ''}
          {deposit.receiptNumber ? ` · receipt ${deposit.receiptNumber}` : ' · no receipt number recorded'}
          {deposit.paidRecordedByName ? ` · recorded by ${deposit.paidRecordedByName}` : ''}
        </div>
      )}

      {deposit?.waivedAt && (
        <div className="mt-2 text-gray-700">
          Waived {timeText(deposit.waivedAt)}
          {deposit.waivedByName ? ` by ${deposit.waivedByName}` : ''}
          {deposit.waivedReason ? ` — ${deposit.waivedReason}` : ''}
        </div>
      )}

      {problem && (
        <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-red-800">
          {problem}
        </div>
      )}

      {canWrite && status === 'REQUESTED' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            placeholder="Receipt number (from the patient)"
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          />
          <button
            onClick={markPaid}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
          </button>
        </div>
      )}

      {canWrite && status === 'PAID' && (
        <button
          onClick={undoPaid}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 hover:underline"
        >
          <Undo2 className="h-3 w-3" /> Undo payment
        </button>
      )}

      {/* ------------------------------------------------- the two handovers */}
      <div className="mt-3 space-y-2 border-t border-emerald-200 pt-2">
        {streamsFor(kind).map((spec) => {
          const row = collections.find((c) => c.stream === spec.stream) ?? null;
          const list = spec.collector === 'SCRUB_NURSE' ? scrubs : anaes;
          return (
            <div key={spec.stream} className="rounded border border-white bg-white/70 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <PackageCheck className={`h-3.5 w-3.5 ${row?.collectedAt ? 'text-green-700' : 'text-gray-400'}`} />
                <span className="font-semibold text-gray-800">{spec.label}</span>
                {row?.collectedAt ? (
                  <span className="text-green-800">
                    Collected by {row.collectedByName} ({spec.collectorLabel}) · {timeText(row.collectedAt)}
                    {row.recordedByName ? ` · recorded by ${row.recordedByName}` : ''}
                  </span>
                ) : (
                  <span className="text-gray-500">Not yet collected</span>
                )}
              </div>

              {canWrite && !row?.collectedAt && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <select
                    value={picked[spec.stream] ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPicked((p) => ({ ...p, [spec.stream]: id }));
                      const found = list.find((s) => s.id === id);
                      setTyped((t) => ({ ...t, [spec.stream]: found?.fullName ?? '' }));
                    }}
                    disabled={!paid}
                    className="rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100"
                  >
                    <option value="">
                      {list.length ? `Choose the ${spec.collectorLabel}…` : `No ${spec.collectorLabel} on file — type the name`}
                    </option>
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                  <input
                    value={typed[spec.stream] ?? ''}
                    onChange={(e) => setTyped((t) => ({ ...t, [spec.stream]: e.target.value }))}
                    placeholder="…or type the name"
                    disabled={!paid}
                    className="rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100"
                  />
                  <button
                    onClick={() => collect(spec.stream)}
                    disabled={busy || !paid}
                    title={paid ? '' : 'Record the payment first.'}
                    className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Mark collected
                  </button>
                  {!paid && <span className="text-gray-500">Payment first.</span>}
                </div>
              )}

              {canWrite && row?.collectedAt && (
                <button
                  onClick={() => undoCollect(spec.stream)}
                  disabled={busy}
                  className="mt-1 inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 hover:underline"
                >
                  <Undo2 className="h-3 w-3" /> Undo
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
