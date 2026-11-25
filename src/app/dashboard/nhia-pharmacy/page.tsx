'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Filter, Package, Pill, RefreshCw, Send, ShieldCheck,
} from 'lucide-react';

import {
  BOOKABLE_PAYER_CATEGORIES, PAYER_BADGE, PAYER_LABEL,
} from '@/lib/payer/categories';
import { FULFILMENT_LABEL } from '@/lib/payer/routing';
import { MIN_REASSIGN_NOTE, REASSIGN_REASONS } from '@/lib/payer/reassign';

/**
 * The NHIA Pharmacy's own counter.
 *
 * MODELLED ON THE THEATRE PHARMACY SCREEN and deliberately not merged with
 * it. This desk answers to the scheme rather than to the theatre, holds
 * different stock, and is the only unit allowed to decide that an item the
 * scheme will not carry must go somewhere else.
 *
 * BOTH LISTS ON ONE SCREEN. The pack providers read consumables and the
 * Theatre Pharmacy reads drugs; the scheme covers both, and a pharmacist
 * working a case wants the whole case in front of them. They are kept apart
 * within the card, because what you do with them differs.
 *
 * THE ONE THING THIS SCREEN DOES THAT NO OTHER DOES is send a line on, with
 * a reason that travels with it. It is one-directional: the receiving unit
 * cannot send it back. Two counters each insisting the other owns an item is
 * how a patient waits for both.
 */

interface Line {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  status: string;
  routedTo: string;
  coverageNote: string | null;
  reassignedFrom: string | null;
  reassignReason: string | null;
  splitFromId: string | null;
  addedAfterBooking: boolean | null;
  size?: string | null;
  dosage?: string | null;
  category?: string | null;
  type?: string | null;
}

interface CaseRow {
  surgery: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    scheduledTime: string;
    unit: string;
    location: string | null;
    surgeonName: string | null;
    surgeryType: string;
    payerCategory: keyof typeof PAYER_BADGE;
    payerSchemeId: string | null;
    payerIsNyscCorps: boolean;
    patient: { id: string; name: string; folderNumber: string | null; ward: string | null } | null;
  };
  consumables: Line[];
  pharmacy: Line[];
}

/** YYYY-MM-DD for the handset's own day, never UTC's. */
function todayValue(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Composed from local parts. This machine is on WAT and toLocale* is not. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function NhiaPharmacyPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [totals, setTotals] = useState({ consumables: 0, pharmacy: 0, cases: 0 });
  const [mayReassign, setMayReassign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [from, setFrom] = useState(plusDays(-1));
  const [to, setTo] = useState(plusDays(7));
  const [payer, setPayer] = useState('');
  const [surgeon, setSurgeon] = useState('');
  const [status, setStatus] = useState('');

  /** Chosen lines, keyed `${list}:${id}`. */
  const [picked, setPicked] = useState<Record<string, { list: 'CONSUMABLE' | 'PHARMACY'; id: string }>>({});
  const [reasonCode, setReasonCode] = useState<string>('NOT_COVERED');
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (payer) qs.set('payer', payer);
      if (surgeon.trim()) qs.set('surgeon', surgeon.trim());
      if (status) qs.set('status', status);
      const res = await fetch(`/api/nhia-pharmacy?${qs.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body?.error ?? 'Could not load the queue.'); return; }
      setCases(body.cases ?? []);
      setTotals(body.totals ?? { consumables: 0, pharmacy: 0, cases: 0 });
      setMayReassign(!!body.canReassign);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [from, to, payer, surgeon, status]);

  useEffect(() => { void load(); }, [load]);

  const pickedCount = Object.keys(picked).length;
  const toggle = (list: 'CONSUMABLE' | 'PHARMACY', id: string) =>
    setPicked((p) => {
      const key = `${list}:${id}`;
      const next = { ...p };
      if (next[key]) delete next[key];
      else next[key] = { list, id };
      return next;
    });

  const needsDetail = reasonCode === 'OTHER';
  const readyToSend = pickedCount > 0
    && (!needsDetail || detail.trim().length >= MIN_REASSIGN_NOTE);

  const sendOn = async () => {
    if (!readyToSend) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/nhia-pharmacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Object.values(picked),
          reasonCode,
          ...(detail.trim() ? { detail: detail.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body?.error ?? 'Nothing was sent on.'); return; }
      setNotice(
        (body.message ?? '')
        + (body.problems?.length ? ` ${body.problems.join(' ')}` : ''),
      );
      setPicked({});
      setDetail('');
      await load();
    } catch {
      setError('Could not reach the server. Nothing was changed.');
    } finally {
      setSending(false);
    }
  };

  const unreviewed = useMemo(
    () => cases.reduce(
      (n, c) => n + [...c.consumables, ...c.pharmacy]
        .filter((l) => (l.coverageNote ?? '').includes('NHIA Pharmacy to confirm')).length,
      0,
    ),
    [cases],
  );

  const renderLines = (c: CaseRow, list: 'CONSUMABLE' | 'PHARMACY') => {
    const lines = list === 'CONSUMABLE' ? c.consumables : c.pharmacy;
    if (lines.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="flex items-center gap-1 text-xs font-semibold text-gray-700">
          {list === 'CONSUMABLE'
            ? <><Package className="h-3.5 w-3.5" /> Consumables ({lines.length})</>
            : <><Pill className="h-3.5 w-3.5" /> Drugs and dressings ({lines.length})</>}
        </p>
        <div className="mt-1 space-y-1">
          {lines.map((l) => {
            const key = `${list}:${l.id}`;
            const size = String((list === 'PHARMACY' ? l.dosage : l.size) ?? '').trim();
            return (
              <label
                key={l.id}
                className={`flex items-start gap-2 rounded border p-2 text-sm ${
                  picked[key] ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!mayReassign}
                  checked={!!picked[key]}
                  onChange={() => toggle(list, l.id)}
                  aria-label={`Select ${l.name}`}
                />
                <span>
                  {l.quantity} × {l.name}{l.unit ? ` (${l.unit})` : ''}
                  {size !== '' && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-800">
                      {size}
                    </span>
                  )}
                  {l.splitFromId && (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">
                      part of a split line
                    </span>
                  )}
                  {l.status !== 'REQUESTED' && (
                    <span className="ml-2 text-xs uppercase text-gray-500">{l.status}</span>
                  )}
                  {(l.coverageNote ?? '').includes('NHIA Pharmacy to confirm') && (
                    <span className="mt-0.5 block text-xs font-medium text-amber-800">
                      Not on the scheme list — nobody has classified this item. Confirm it, or
                      send it on.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-emerald-700" /> NHIA Pharmacy
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Every line the scheme is being asked to cover. {totals.cases} case
            {totals.cases === 1 ? '' : 's'} · {totals.pharmacy} drug line
            {totals.pharmacy === 1 ? '' : 's'} · {totals.consumables} consumable line
            {totals.consumables === 1 ? '' : 's'}.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {unreviewed > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          {unreviewed} item{unreviewed === 1 ? '' : 's'} nobody has classified. Each one is a
          patient paying for something the scheme may well carry.
        </p>
      )}

      {/* ---- Filters ---- */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <Filter className="mb-2 h-4 w-4 text-gray-500" />
        <label className="text-xs text-gray-700">
          <span className="block font-medium">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-gray-700">
          <span className="block font-medium">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-gray-700">
          <span className="block font-medium">Scheme</span>
          <select value={payer} onChange={(e) => setPayer(e.target.value)}
            className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">All</option>
            {BOOKABLE_PAYER_CATEGORIES.filter((c) => c !== 'PRIVATE').map((c) => (
              <option key={c} value={c}>{PAYER_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-700">
          <span className="block font-medium">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="REQUESTED">Requested</option>
            <option value="PACKING">Packing</option>
            <option value="PACKED">Packed</option>
            <option value="DELIVERED">Delivered</option>
          </select>
        </label>
        <label className="text-xs text-gray-700">
          <span className="block font-medium">Surgeon</span>
          <input value={surgeon} onChange={(e) => setSurgeon(e.target.value)}
            placeholder="Any" className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <button
          onClick={() => { setFrom(todayValue()); setTo(todayValue()); }}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          Today only
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}
      {notice && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </p>
      )}

      {/* ---- The queue ---- */}
      {loading && cases.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">Loading the queue…</p>
      )}
      {!loading && cases.length === 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-center">
          <p className="font-medium text-gray-700">Nothing is waiting on the scheme in this window.</p>
          <p className="mt-1 text-sm text-gray-500">
            An item only reaches this counter when the patient is insured and the item is
            marked as covered in the catalogue. If a case you expect is missing, check the
            payer category on the booking and the coverage flags on the items.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {cases.map((c) => (
          <div key={c.surgery.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">
                  {c.surgery.patient?.name ?? 'Patient'}
                  {c.surgery.patient?.folderNumber && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      {c.surgery.patient.folderNumber}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-700">{c.surgery.procedureName}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {dayLabel(c.surgery.scheduledDate)} {c.surgery.scheduledTime} · {c.surgery.unit}
                  {c.surgery.surgeonName && <> · {c.surgery.surgeonName}</>}
                  {c.surgery.patient?.ward && <> · {c.surgery.patient.ward}</>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900">
                  {PAYER_BADGE[c.surgery.payerCategory]}
                </span>
                {c.surgery.payerIsNyscCorps && (
                  <span className="rounded border border-sky-300 bg-sky-50 px-2 py-0.5 font-semibold text-sky-900">
                    NYSC corps member
                  </span>
                )}
                {c.surgery.payerSchemeId && (
                  <span className="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-gray-700">
                    {c.surgery.payerSchemeId}
                  </span>
                )}
              </div>
            </div>

            {renderLines(c, 'PHARMACY')}
            {renderLines(c, 'CONSUMABLE')}
          </div>
        ))}
      </div>

      {/* ---- Send selected items on ---- */}
      {mayReassign && pickedCount > 0 && (
        <div className="sticky bottom-0 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg">
          <p className="text-sm font-semibold text-amber-900">
            {pickedCount} item{pickedCount === 1 ? '' : 's'} selected
          </p>
          <p className="mt-0.5 text-xs text-amber-900">
            Drugs go to the {FULFILMENT_LABEL.THEATRE_PHARMACY}, consumables to the{' '}
            {FULFILMENT_LABEL.CONSUMABLE_PACK}. This is one-directional — they cannot send
            them back, so be sure before you send.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-800">
              <span className="block font-medium">Reason</span>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {REASSIGN_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[14rem] flex-1 text-xs text-gray-800">
              <span className="block font-medium">
                {needsDetail ? `Say what the reason is (at least ${MIN_REASSIGN_NOTE} characters)` : 'Anything to add (optional)'}
              </span>
              <input
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="The receiving unit reads this"
              />
            </label>
            <button
              onClick={() => void sendOn()}
              disabled={sending || !readyToSend}
              className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send selected items on'}
            </button>
            <button
              onClick={() => setPicked({})}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              Clear
            </button>
          </div>
          {needsDetail && detail.trim().length < MIN_REASSIGN_NOTE && (
            <p className="mt-1 text-xs font-medium text-amber-900">
              &ldquo;Other&rdquo; needs saying in words — the receiving unit reads it to decide what to do.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
