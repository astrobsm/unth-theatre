'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Package, Pill, Plus, Trash2, Send, AlertTriangle, ChevronDown, ChevronRight,
  Repeat2, X,
} from 'lucide-react';
import { MIN_PACK_REASON } from '@/lib/theatreOps/packAmendment';
import {
  groupConsumables,
  groupPharmacy,
  CONSUMABLE_CATEGORY_OPTIONS,
  DRUG_TYPE_OPTIONS,
} from '@/lib/packs/labels';

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
  /** Consumables. The GET returns the whole row, so this was always on the
   *  wire — the list simply ignored it and showed one flat column. */
  category?: string | null;
  /** Pharmacy lines. Antibiotic, analgesic, infusion, and so on. */
  type?: string | null;
  addedAfterBooking?: boolean | null;
  additionReason?: string | null;
  removalReason?: string | null;
}

type ListKind = 'CONSUMABLE' | 'PHARMACY';

/**
 * A staged addition.
 *
 * `group` is the category (consumables) or type (pharmacy). It is asked for
 * rather than defaulted, because the API defaults a missing one to OTHER and
 * a list where every added item lands in Other re-creates the flat column
 * this change exists to remove — one "Other" heading at a time.
 */
interface NewItem { list: ListKind; name: string; quantity: number; reason: string; group: string }

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
  /** Shut sections, by `${list}:${category}`. Absent means open. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  /**
   * CHANGING a line, rather than deleting it and typing a replacement.
   *
   * Asked for by example, and both examples are the same shape: the pack
   * offers cefazolin and this patient needs a different antibiotic; the pack
   * offers plain lidocaine and this case needs it with adrenaline. Plain and
   * with-adrenaline are NOT interchangeable, and the old way of correcting
   * that was to delete one line, write a reason, add another, write another
   * reason, and get the category right by hand.
   *
   * A swap is staged as what it actually is: the old line withdrawn and the
   * new one added, both carrying a reason naming the other. It is NOT an
   * in-place rewrite of the row — the provider may already have picked the
   * old item, and a line that silently becomes a different drug is how
   * somebody carries cefazolin to a theatre expecting ceftriaxone.
   *
   * The replacement inherits the old line's category or type, so it lands in
   * the same section and the list does not reshuffle under the reader.
   */
  const [swaps, setSwaps] = useState<Record<string, { list: ListKind; to: string }>>({});
  /** Which line is currently showing its alternatives. */
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  /** Alternatives by `${list}:${group}`, fetched once and kept. */
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [optionsLoading, setOptionsLoading] = useState<string | null>(null);

  /**
   * The alternatives for a line: the catalogue, narrowed to its own kind.
   *
   * Narrowed deliberately. Offering the whole catalogue would mean scrolling
   * past gauze to change an antibiotic, and would let a swap move a line
   * into a section it does not belong in.
   */
  const loadOptions = useCallback(async (list: ListKind, group: string) => {
    const key = `${list}:${group}`;
    if (options[key] || optionsLoading === key) return;
    setOptionsLoading(key);
    try {
      const url = list === 'PHARMACY'
        ? `/api/admin/drug-dressing-templates?type=${encodeURIComponent(group)}&activeOnly=true`
        : `/api/admin/consumable-templates?category=${encodeURIComponent(group)}&activeOnly=true`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = res.ok ? await res.json() : [];
      const names = Array.from(new Set(
        (Array.isArray(data) ? data : [])
          .map((t: { name?: string }) => String(t?.name ?? '').trim())
          .filter(Boolean),
      )).sort();
      setOptions((p) => ({ ...p, [key]: names }));
    } catch {
      // An empty list is reported in the control itself rather than as a
      // page-level error: the rest of the pack is still editable.
      setOptions((p) => ({ ...p, [key]: [] }));
    } finally {
      setOptionsLoading(null);
    }
  }, [options, optionsLoading]);

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

  const staged = additions.length + Object.keys(removals).length + Object.keys(swaps).length;
  // Removing no longer waits on a reason, and a swap writes its own on both
  // sides — each naming the other item, which is what the provider needs and
  // all they need. Adding still asks: it is the rarer action, it costs the
  // hospital money, and nobody downstream can guess why a line appeared.
  const readyToSend =
    additions.every((a) => a.name.trim() && a.quantity >= 1 && a.reason.trim().length >= MIN_PACK_REASON);

  const submit = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/surgeries/${surgeryId}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add: [
            ...additions.map((a) => ({
              list: a.list, name: a.name.trim(), quantity: a.quantity, reason: a.reason.trim(),
              // The API takes `category` for a consumable and `type` for a
              // pharmacy line, and defaults either to OTHER when absent.
              ...(a.list === 'CONSUMABLE' ? { category: a.group } : { type: a.group }),
            })),
            // The replacement half of each swap. It inherits the quantity
            // and the section of the line it replaces: a swap is a change of
            // AGENT, not of how much or of where it belongs, and making the
            // list reshuffle under the reader would hide what changed.
            ...Object.entries(swaps).map(([id, s]) => {
              const was = [...consumables, ...pharmacy].find((l) => l.id === id);
              return {
                list: s.list,
                name: s.to,
                quantity: was?.quantity ?? 1,
                reason: `Changed from ${was?.name ?? 'the previous item'}`,
                ...(s.list === 'CONSUMABLE'
                  ? { category: was?.category ?? 'OTHER' }
                  : { type: was?.type ?? 'OTHER' }),
              };
            }),
          ],
          remove: [
            ...Object.entries(removals).map(([id, r]) => ({
              list: r.list, id, reason: r.reason.trim(),
            })),
            // The withdrawal half of each swap. A swap is staged as what it
            // actually is — the old line withdrawn, the new one added — and
            // NOT as a rewrite of the row: the provider may already have
            // picked the old item, and a line that silently becomes a
            // different drug is how somebody carries cefazolin to a theatre
            // that is expecting ceftriaxone.
            //
            // The reason is written here rather than asked for. It names the
            // replacement, which is what the provider needs and all they
            // need.
            ...Object.entries(swaps).map(([id, s]) => ({
              list: s.list, id, reason: `Changed to ${s.to}`,
            })),
          ],
          submit: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setMessage(body.error || 'The changes were not saved.'); return; }
      setMessage(body.message || 'Saved.');
      setAdditions([]);
      setSwaps({});
      setSwapOpen(null);
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
                <span className="flex shrink-0 items-center gap-2">
                  {/* CHANGE, beside delete. Swapping one agent for another
                      is not a deletion and a typed replacement: cefazolin
                      for another antibiotic, plain lidocaine for lidocaine
                      with adrenaline. Those two are not interchangeable,
                      which is exactly why picking from a list beats
                      retyping a name. */}
                  <button
                    type="button"
                    onClick={() => {
                      const group = String(
                        (kind === 'PHARMACY' ? l.type : l.category) ?? 'OTHER',
                      ).toUpperCase();
                      setSwapOpen((cur) => (cur === l.id ? null : l.id));
                      void loadOptions(kind, group);
                    }}
                    className="text-indigo-600"
                    title="Change this for another of the same kind"
                  >
                    <Repeat2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRemovals((prev) => {
                        const next = { ...prev };
                        if (next[l.id]) delete next[l.id];
                        else next[l.id] = { list: kind, reason: '' };
                        return next;
                      })}
                    className="text-red-600"
                    title={markedForRemoval ? 'Keep this item' : 'Remove this item'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              )}
            </div>

            {withdrawn && l.removalReason && (
              <p className="mt-1 text-xs italic">Withdrawn: {l.removalReason}</p>
            )}
            {!withdrawn && l.additionReason && (
              <p className="mt-1 text-xs italic text-gray-600">Added: {l.additionReason}</p>
            )}

            {/* Staged swap, shown on the line it changes. */}
            {swaps[l.id] && (
              <p className="mt-1 flex items-center gap-2 text-xs font-medium text-indigo-800">
                <Repeat2 className="h-3 w-3" /> changing to {swaps[l.id].to}
                <button
                  type="button"
                  className="text-gray-500"
                  title="Undo this change"
                  onClick={() => setSwaps((p) => {
                    const next = { ...p };
                    delete next[l.id];
                    return next;
                  })}
                >
                  <X className="h-3 w-3" />
                </button>
              </p>
            )}

            {swapOpen === l.id && canEdit && !withdrawn && (() => {
              const group = String(
                (kind === 'PHARMACY' ? l.type : l.category) ?? 'OTHER',
              ).toUpperCase();
              const key = `${kind}:${group}`;
              const list = options[key];
              if (!list) {
                return <p className="mt-2 text-xs text-gray-500">Loading alternatives…</p>;
              }
              // The item being replaced is not offered as its own
              // replacement.
              const choices = list.filter((n) => n.toLowerCase() !== l.name.trim().toLowerCase());
              if (choices.length === 0) {
                return (
                  <p className="mt-2 text-xs text-amber-700">
                    No other {kind === 'PHARMACY' ? 'drug' : 'item'} of this kind is in the
                    catalogue. Delete this line and add the one you want.
                  </p>
                );
              }
              return (
                <select
                  className="input-field mt-2 text-sm"
                  value=""
                  aria-label={`Change ${l.name}`}
                  onChange={(e) => {
                    const to = e.target.value;
                    if (!to) return;
                    setSwaps((p) => ({ ...p, [l.id]: { list: kind, to } }));
                    setSwapOpen(null);
                  }}
                >
                  <option value="">Change {l.name} to…</option>
                  {choices.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              );
            })()}

            {/* REMOVING NO LONGER NEEDS A REASON. The box is still here and
                still sent when it is filled in — the provider does read it
                — but nothing waits on it. Removing a line the standard
                supplied and this patient does not need is the commonest
                edit on this screen, and a sentence demanded for each one
                made the quickest correction the slowest. */}
            {markedForRemoval && (
              <input
                className="input-field mt-2 text-sm"
                placeholder="Optional — anything the pack provider should know"
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

  /**
   * The list, in sections.
   *
   * Collapsible, and OPEN by default. A pack that opens closed is a pack
   * somebody has to click eight times to read, and the question this screen
   * answers most often is "what is on the list". Closing is for the
   * sections already dealt with.
   *
   * Each heading carries its own count, and a withdrawn count beside it
   * where there is one, so a section that has lost something says so while
   * it is shut.
   */
  const renderSections = (
    sections: { key: string; label: string; lines: PackLine[] }[],
    kind: ListKind,
  ) => {
    if (sections.length === 0) {
      return <p className="text-sm text-gray-500">Nothing requested yet.</p>;
    }
    return (
      <div className="space-y-2">
        {sections.map((s) => {
          const id = `${kind}:${s.key}`;
          const shut = !!collapsed[id];
          const withdrawn = s.lines.filter(
            (l) => String(l.status).toUpperCase() === 'CANCELLED',
          ).length;
          return (
            <div key={id} className="rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [id]: !p[id] }))}
                className="flex w-full items-center justify-between gap-2 rounded-t-lg bg-gray-50 px-3 py-2 text-left"
                aria-expanded={!shut}
              >
                <span className="text-sm font-semibold text-gray-800">
                  {s.label}
                  <span className="ml-2 font-normal text-gray-500">
                    {s.lines.length}
                    {withdrawn > 0 && (
                      <span className="ml-1 text-amber-700">· {withdrawn} withdrawn</span>
                    )}
                  </span>
                </span>
                {shut ? <ChevronRight className="h-4 w-4 text-gray-500" />
                      : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              {!shut && <div className="p-2">{renderList(kind, s.lines)}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const addRow = (list: ListKind) =>
    setAdditions((prev) => [...prev, {
      list, name: '', quantity: 1, reason: '',
      // Pre-filled with the bucket so the control is never empty, and
      // changeable before it is sent.
      group: 'OTHER',
    }]);

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
          <h3 className="mb-2 flex items-center gap-2 font-medium">
            <Package className="h-4 w-4" /> Consumables
            <span className="text-sm font-normal text-gray-500">({consumables.length})</span>
          </h3>
          {renderSections(groupConsumables(consumables), 'CONSUMABLE')}
          {canEdit && (
            <button onClick={() => addRow('CONSUMABLE')} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700">
              <Plus className="h-4 w-4" /> Add a consumable
            </button>
          )}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 font-medium">
            <Pill className="h-4 w-4" /> Pharmacy pack
            <span className="text-sm font-normal text-gray-500">({pharmacy.length})</span>
          </h3>
          {renderSections(groupPharmacy(pharmacy), 'PHARMACY')}
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
                className="input-field sm:col-span-3" placeholder="Item"
                value={a.name}
                onChange={(e) => setAdditions((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <select
                className="input-field sm:col-span-3"
                value={a.group}
                aria-label={a.list === 'CONSUMABLE' ? 'Category' : 'Type'}
                title={a.list === 'CONSUMABLE' ? 'Which section it belongs in' : 'Which section it belongs in'}
                onChange={(e) => setAdditions((p) => p.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))}
              >
                {(a.list === 'CONSUMABLE' ? CONSUMABLE_CATEGORY_OPTIONS : DRUG_TYPE_OPTIONS)
                  .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="number" min={1} className="input-field sm:col-span-1" placeholder="Qty"
                value={a.quantity}
                onChange={(e) => setAdditions((p) => p.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
              />
              <input
                className="input-field sm:col-span-4" placeholder="Why is it needed?"
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
            title={readyToSend ? 'Send the changes and notify the providers' : `A NEW item needs a reason of at least ${MIN_PACK_REASON} characters`}
          >
            <Send className="h-4 w-4" />
            {saving ? 'Sending…' : `Submit ${staged} change${staged === 1 ? '' : 's'} and notify providers`}
          </button>
          {!readyToSend && (
            <span className="inline-flex items-center gap-1 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" /> A new item needs a reason. Removing and changing do not.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
