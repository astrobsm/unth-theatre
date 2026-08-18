'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, Pill, Plus, Trash2, Send, AlertTriangle } from 'lucide-react';
import { MIN_PACK_REASON } from '@/lib/theatreOps/packAmendment';

/**
 * The consumables and pharmacy lists for a case, editable by the team.
 *
 * Withdrawn items are SHOWN, struck through, with the reason. The pack
 * provider may already have picked one, and a list that silently loses a line
 * looks like a list that never had it — so the surgeon sees exactly what the
 * provider sees.
 *
 * Changes are staged and submitted together rather than saved per keystroke.
 * A provider's phone buzzing four times while somebody edits a list is how a
 * notification channel stops being read.
 */

interface PackLine {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
  status: string;
  addedAfterBooking?: boolean | null;
  additionReason?: string | null;
  removalReason?: string | null;
}

type ListKind = 'CONSUMABLE' | 'PHARMACY';

interface NewItem { list: ListKind; name: string; quantity: number; reason: string }

export default function SurgeryPackEditor({ surgeryId }: { surgeryId: string }) {
  const [consumables, setConsumables] = useState<PackLine[]>([]);
  const [pharmacy, setPharmacy] = useState<PackLine[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  /** Staged, not yet sent. */
  const [additions, setAdditions] = useState<NewItem[]>([]);
  const [removals, setRemovals] = useState<Record<string, { list: ListKind; reason: string }>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/surgeries/${surgeryId}/pack`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConsumables(data.consumables ?? []);
      setPharmacy(data.pharmacy ?? []);
      setCanEdit(!!data.canEdit);
    } catch {
      setMessage('Could not load the pack lists.');
    } finally {
      setLoading(false);
    }
  }, [surgeryId]);

  useEffect(() => { load(); }, [load]);

  const staged = additions.length + Object.keys(removals).length;
  const readyToSend =
    additions.every((a) => a.name.trim() && a.quantity >= 1 && a.reason.trim().length >= MIN_PACK_REASON)
    && Object.values(removals).every((r) => r.reason.trim().length >= MIN_PACK_REASON);

  const submit = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/surgeries/${surgeryId}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add: additions.map((a) => ({
            list: a.list, name: a.name.trim(), quantity: a.quantity, reason: a.reason.trim(),
          })),
          remove: Object.entries(removals).map(([id, r]) => ({ list: r.list, id, reason: r.reason.trim() })),
          submit: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setMessage(body.error || 'The changes were not saved.'); return; }
      setMessage(body.message || 'Saved.');
      setAdditions([]);
      setRemovals({});
      await load();
    } catch {
      setMessage('Could not reach the server. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  const renderList = (kind: ListKind, lines: PackLine[]) => (
    <div className="space-y-1">
      {lines.length === 0 && <p className="text-sm text-gray-500">Nothing requested.</p>}
      {lines.map((l) => {
        const withdrawn = String(l.status).toUpperCase() === 'CANCELLED';
        const markedForRemoval = !!removals[l.id];
        return (
          <div
            key={l.id}
            className={`rounded-lg border p-2 text-sm ${
              withdrawn ? 'border-gray-200 bg-gray-50 text-gray-500'
                : markedForRemoval ? 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={withdrawn || markedForRemoval ? 'line-through' : ''}>
                {l.quantity} × {l.name}{l.unit ? ` (${l.unit})` : ''}
                {l.addedAfterBooking && (
                  <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-800">
                    added after booking
                  </span>
                )}
                {!withdrawn && l.status !== 'REQUESTED' && (
                  <span className="ml-2 text-xs uppercase text-gray-500">{l.status}</span>
                )}
              </span>
              {canEdit && !withdrawn && (
                <button
                  type="button"
                  onClick={() =>
                    setRemovals((prev) => {
                      const next = { ...prev };
                      if (next[l.id]) delete next[l.id];
                      else next[l.id] = { list: kind, reason: '' };
                      return next;
                    })}
                  className="shrink-0 text-red-600"
                  title={markedForRemoval ? 'Keep this item' : 'Remove this item'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {withdrawn && l.removalReason && (
              <p className="mt-1 text-xs italic">Withdrawn: {l.removalReason}</p>
            )}
            {!withdrawn && l.additionReason && (
              <p className="mt-1 text-xs italic text-gray-600">Added: {l.additionReason}</p>
            )}

            {markedForRemoval && (
              <input
                className="input-field mt-2 text-sm"
                placeholder="Why is this being removed? The pack provider reads this."
                value={removals[l.id].reason}
                onChange={(e) =>
                  setRemovals((prev) => ({ ...prev, [l.id]: { ...prev[l.id], reason: e.target.value } }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const addRow = (list: ListKind) =>
    setAdditions((prev) => [...prev, { list, name: '', quantity: 1, reason: '' }]);

  if (loading) return <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">Loading pack lists…</div>;

  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Consumables and pharmacy pack</h2>
      <p className="mt-1 text-sm text-gray-600">
        Withdrawn items stay listed, struck through, so the pack provider and the team
        see the same thing.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-2 font-medium"><Package className="h-4 w-4" /> Consumables</h3>
          {renderList('CONSUMABLE', consumables)}
          {canEdit && (
            <button onClick={() => addRow('CONSUMABLE')} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700">
              <Plus className="h-4 w-4" /> Add a consumable
            </button>
          )}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 font-medium"><Pill className="h-4 w-4" /> Pharmacy pack</h3>
          {renderList('PHARMACY', pharmacy)}
          {canEdit && (
            <button onClick={() => addRow('PHARMACY')} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700">
              <Plus className="h-4 w-4" /> Add a drug or dressing
            </button>
          )}
        </div>
      </div>

      {additions.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-medium text-indigo-900">New items</p>
          {additions.map((a, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input
                className="input-field sm:col-span-4" placeholder="Item"
                value={a.name}
                onChange={(e) => setAdditions((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                type="number" min={1} className="input-field sm:col-span-2" placeholder="Qty"
                value={a.quantity}
                onChange={(e) => setAdditions((p) => p.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
              />
              <input
                className="input-field sm:col-span-5" placeholder="Why is it needed?"
                value={a.reason}
                onChange={(e) => setAdditions((p) => p.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
              />
              <button
                type="button" className="text-red-600 sm:col-span-1"
                onClick={() => setAdditions((p) => p.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">{message}</div>
      )}

      {canEdit && staged > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={submit}
            disabled={saving || !readyToSend}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            title={readyToSend ? 'Send the changes and notify the providers' : `Every change needs a reason of at least ${MIN_PACK_REASON} characters`}
          >
            <Send className="h-4 w-4" />
            {saving ? 'Sending…' : `Submit ${staged} change${staged === 1 ? '' : 's'} and notify providers`}
          </button>
          {!readyToSend && (
            <span className="inline-flex items-center gap-1 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Every change needs a reason.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
