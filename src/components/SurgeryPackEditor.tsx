'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, Pill, Plus, Trash2, Send, AlertTriangle, ChevronDown, ChevronRight,
  Repeat2, X, Minus, Pencil, Search, Keyboard,
} from 'lucide-react';
import {
  MIN_PACK_REASON, MAX_PACK_QUANTITY, MAX_SIZE_LENGTH, unitsFor,
} from '@/lib/theatreOps/packAmendment';
import {
  groupConsumables,
  groupPharmacy,
  CONSUMABLE_CATEGORY_OPTIONS,
  DRUG_TYPE_OPTIONS,
  CONSUMABLE_CATEGORY_LABEL,
  DRUG_TYPE_LABEL,
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
 *
 * SIZE IS A FIRST-CLASS FIELD, which it was not. A case carried three lines
 * reading "8 × Syringe (piece)" and the only way to say which was which was
 * to stage three swaps — one to "10mls syringe", one to "5mls", one to
 * "2mls" — because the swap list deduplicated the catalogue by NAME and threw
 * every size away. Gloves at 7 and at 7.5 collapsed the same way. The size
 * column existed on the row the whole time and nothing wrote to it.
 *
 * AND ITEMS ARE CHOSEN, NOT TYPED. The add form was four free-text boxes, so
 * the reasons people gave for their own additions were "couldn't select it
 * above" and "not in the options" — which is a screen telling you about
 * itself. The catalogue is now the first thing the form offers, searchable
 * across every section, with hand-typing kept for what it genuinely does not
 * hold.
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
  /** Consumables: "7.5", "10 mL". The column existed and was never shown. */
  size?: string | null;
  /** The pharmacy list's equivalent of a size. */
  dosage?: string | null;
  route?: string | null;
  addedAfterBooking?: boolean | null;
  additionReason?: string | null;
  removalReason?: string | null;
  /** What the list said at BOOKING, where the quantity has been corrected
   *  since. Shown on the line, because a provider who picked against the
   *  original needs to see what moved under them. */
  originalQuantity?: number | null;
  originalUnit?: string | null;
  quantityChangeReason?: string | null;
}

type ListKind = 'CONSUMABLE' | 'PHARMACY';

/**
 * One row of the catalogue, with the two tables' vocabularies reconciled.
 *
 * A consumable template has a `size` and a `category`; a drug template has a
 * `defaultDosage` and a `type`. They are the same two ideas, and the screen
 * asks for them once, so they are normalised here rather than branched on in
 * six places.
 */
interface CatalogueItem {
  id: string;
  name: string;
  /** size for a consumable, default dose for a drug. */
  size: string | null;
  unit: string;
  /** category or type — the section it belongs in. */
  group: string;
  defaultQuantity: number;
  route: string | null;
}

/** How a catalogue row reads in a list of choices. */
const itemLabel = (c: CatalogueItem) => (c.size ? `${c.name} — ${c.size}` : c.name);

const groupLabel = (list: ListKind, key: string): string =>
  (list === 'CONSUMABLE'
    ? (CONSUMABLE_CATEGORY_LABEL as Record<string, string>)[key]
    : (DRUG_TYPE_LABEL as Record<string, string>)[key]) ?? 'Other';

/** The size of a line, whichever column its table keeps it in. */
const sizeOf = (kind: ListKind, l: PackLine): string =>
  String((kind === 'PHARMACY' ? l.dosage : l.size) ?? '').trim();

/**
 * A staged addition.
 *
 * `group` is the category (consumables) or type (pharmacy). It is set by the
 * section the add was started from, or by the catalogue row that was chosen,
 * and is changeable before it is sent — because the API defaults a missing
 * one to OTHER, and a list where every added item lands in Other re-creates
 * the flat column the sections exist to remove.
 */
interface NewItem {
  list: ListKind;
  group: string;
  /** The catalogue row it came from, where it came from the catalogue. */
  templateId: string | null;
  name: string;
  size: string;
  unit: string;
  quantity: number;
  reason: string;
  /** Typed by hand because the catalogue does not hold it. */
  freeText: boolean;
}

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
   * It now carries the REPLACEMENT'S OWN size and unit. Offering a catalogue
   * and then dropping the size on the way to the server is how a case ends
   * up with three lines that all read "Syringe".
   */
  const [swaps, setSwaps] = useState<
    Record<string, { list: ListKind; to: CatalogueItem }>
  >({});
  /** Which line is currently showing its alternatives. */
  const [swapOpen, setSwapOpen] = useState<string | null>(null);

  /**
   * HOW MANY, OF WHAT UNIT, IN WHAT SIZE.
   *
   * Asked for directly: a pack is composed from a standard and the standard
   * is an average, so the commonest thing a surgeon wants to say about a line
   * is not "remove it" but "eight pairs, not one" or "size 7.5, not 7".
   *
   * STAGED IN PLACE, unlike a swap. A swap is a withdrawal plus an addition
   * because it changes the ITEM; this changes the countable facts of the same
   * item, and withdrawing a line to re-add it would tell the pack provider
   * that something was cancelled when nothing was.
   */
  const [quantities, setQuantities] = useState<
    Record<string, { list: ListKind; quantity: number; unit: string; size: string; reason: string }>
  >({});
  /** Which line is currently showing its quantity control. */
  const [qtyOpen, setQtyOpen] = useState<string | null>(null);

  /** The catalogue, fetched once per list and kept. */
  const [catalogue, setCatalogue] = useState<Record<string, CatalogueItem[]>>({});
  const [catalogueLoading, setCatalogueLoading] = useState<string | null>(null);
  const [catalogueFailed, setCatalogueFailed] = useState<Record<string, boolean>>({});

  /**
   * The whole active catalogue for one list, in one request.
   *
   * ONE FETCH, NOT ONE PER SECTION, AND THE ROWS ARE KEPT. The old code
   * fetched per category and kept only the NAMES, deduplicated — which is
   * precisely how every size was lost, and why a surgeon offering to change
   * a syringe was shown one choice called "Syringe". Keeping the rows costs
   * a few hundred small objects and turns "search every section for
   * cefazolin" into a filter rather than a round trip.
   */
  const loadCatalogue = useCallback(async (list: ListKind) => {
    if (catalogue[list] || catalogueLoading === list) return;
    setCatalogueLoading(list);
    try {
      const url = list === 'PHARMACY'
        ? '/api/admin/drug-dressing-templates?activeOnly=true'
        : '/api/admin/consumable-templates?activeOnly=true';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const rows: CatalogueItem[] = (Array.isArray(data) ? data : [])
        .map((t: Record<string, unknown>) => ({
          id: String(t.id ?? ''),
          name: String(t.name ?? '').trim(),
          size: String((list === 'PHARMACY' ? t.defaultDosage : t.size) ?? '').trim() || null,
          unit: String(t.unit ?? (list === 'PHARMACY' ? 'vial' : 'piece')),
          group: String((list === 'PHARMACY' ? t.type : t.category) ?? 'OTHER').toUpperCase(),
          defaultQuantity: Number(t.defaultQuantity ?? 1) || 1,
          route: String(t.defaultRoute ?? '').trim() || null,
        }))
        .filter((c: CatalogueItem) => c.name !== '');
      setCatalogue((p) => ({ ...p, [list]: rows }));
    } catch {
      // Reported in the control itself, with hand-typing offered, rather
      // than as a page-level error: the rest of the list is still editable,
      // and an item that cannot be chosen can still be named.
      setCatalogue((p) => ({ ...p, [list]: [] }));
      setCatalogueFailed((p) => ({ ...p, [list]: true }));
    } finally {
      setCatalogueLoading(null);
    }
  }, [catalogue, catalogueLoading]);

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

  const staged = additions.length + Object.keys(removals).length
    + Object.keys(swaps).length + Object.keys(quantities).length;
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
              list: a.list,
              name: a.name.trim(),
              quantity: a.quantity,
              unit: a.unit,
              reason: a.reason.trim(),
              templateId: a.templateId,
              // The API takes `category` for a consumable and `type` for a
              // pharmacy line, and `size` against one table and `dosage`
              // against the other. One field on the screen, because to the
              // person filling it in they are the same question.
              ...(a.list === 'CONSUMABLE'
                ? { category: a.group, size: a.size.trim() || null }
                : { type: a.group, dosage: a.size.trim() || null }),
            })),
            // The replacement half of each swap. It inherits the QUANTITY of
            // the line it replaces — a swap is a change of agent, not of how
            // much — but brings its OWN size and unit.
            ...Object.entries(swaps).map(([id, s]) => {
              const was = [...consumables, ...pharmacy].find((l) => l.id === id);
              return {
                list: s.list,
                name: s.to.name,
                quantity: was?.quantity ?? s.to.defaultQuantity,
                unit: s.to.unit,
                templateId: s.to.id || null,
                reason: `Changed from ${was?.name ?? 'the previous item'}`,
                ...(s.list === 'CONSUMABLE'
                  ? { category: s.to.group, size: s.to.size }
                  : { type: s.to.group, dosage: s.to.size }),
              };
            }),
          ],
          // Quantity, unit and size, corrected in place. No reason is
          // required — following removal rather than addition, because
          // correcting what a standard supplied is the ordinary business of
          // this screen and a sentence demanded for each one is what stops
          // people correcting them.
          change: Object.entries(quantities).map(([id, q]) => ({
            list: q.list,
            id,
            quantity: q.quantity,
            unit: q.unit,
            size: q.size.trim(),
            ...(q.reason.trim() ? { reason: q.reason.trim() } : {}),
          })),
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
              list: s.list, id, reason: `Changed to ${itemLabel(s.to)}`,
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
      setQuantities({});
      setQtyOpen(null);
      setRemovals({});
      await load();
    } catch {
      setMessage('Could not reach the server. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * A new blank line, in a named section.
   *
   * `group` is passed by the per-section button, which is the control this
   * screen was missing: adding a second size of syringe meant scrolling to
   * the foot of the page and choosing "Syringes & needles" out of a list of
   * fifteen, having just been looking at it.
   */
  const addRow = (list: ListKind, group = 'OTHER') => {
    void loadCatalogue(list);
    setAdditions((prev) => [...prev, {
      list,
      group,
      templateId: null,
      name: '',
      size: '',
      unit: list === 'PHARMACY' ? 'vial' : 'piece',
      quantity: 1,
      reason: '',
      freeText: false,
    }]);
  };

  const setAddition = (index: number, patch: Partial<NewItem>) =>
    setAdditions((p) => p.map((x, j) => (j === index ? { ...x, ...patch } : x)));

  // ---------------------------------------------------------------- add row
  /**
   * One staged addition, rendered inside the section it will join.
   *
   * THE CATALOGUE FIRST. Choosing a row fills in the name, the size, the
   * unit, the section and the standard quantity at once — which is five
   * fewer chances to type a name the store does not recognise.
   */
  const renderAddRow = (a: NewItem, i: number) => {
    const rows = catalogue[a.list];
    // Sizes the catalogue knows for the item that has been chosen, so a size
    // is picked rather than spelled three different ways across one list.
    const sizes = Array.from(new Set(
      (rows ?? [])
        .filter((c) => c.name.toLowerCase() === a.name.trim().toLowerCase() && c.size)
        .map((c) => c.size as string),
    ));
    const units = Array.from(new Set([a.unit, ...unitsFor(a.list)].filter(Boolean)));

    return (
      <div key={`add-${i}`} className="mt-2 rounded-lg border border-indigo-300 bg-indigo-50 p-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-indigo-900">
            New {a.list === 'CONSUMABLE' ? 'consumable' : 'pharmacy item'}
          </p>
          <button
            type="button"
            className="text-red-600"
            title="Discard this new item"
            onClick={() => setAdditions((p) => p.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* --- Which item ------------------------------------------------ */}
        {a.freeText ? (
          <div className="mt-2">
            <input
              className="input-field text-sm"
              placeholder="Item name"
              value={a.name}
              onChange={(e) => setAddition(i, { name: e.target.value, templateId: null })}
            />
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-700"
              onClick={() => setAddition(i, { freeText: false, name: '', templateId: null })}
            >
              <Search className="h-3 w-3" /> Choose from the catalogue instead
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <PackCataloguePicker
              list={a.list}
              rows={rows}
              loading={catalogueLoading === a.list}
              failed={!!catalogueFailed[a.list]}
              chosen={a.name}
              onPick={(c) => setAddition(i, {
                templateId: c.id,
                name: c.name,
                size: c.size ?? '',
                unit: c.unit,
                group: c.group,
                quantity: c.defaultQuantity,
              })}
            />
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-700"
              onClick={() => setAddition(i, { freeText: true, templateId: null })}
            >
              <Keyboard className="h-3 w-3" /> Not in the catalogue — type it
            </button>
          </div>
        )}

        {/* --- Size, how many, unit, section ------------------------------ */}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-700">
            <span className="block font-medium">
              {a.list === 'PHARMACY' ? 'Dose' : 'Size'}
            </span>
            {sizes.length > 0 && !a.freeText ? (
              <select
                className="mt-0.5 w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                value={a.size}
                aria-label={a.list === 'PHARMACY' ? 'Dose' : 'Size'}
                onChange={(e) => setAddition(i, { size: e.target.value })}
              >
                <option value="">—</option>
                {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input
                className="mt-0.5 w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                maxLength={MAX_SIZE_LENGTH}
                aria-label={a.list === 'PHARMACY' ? 'Dose' : 'Size'}
                placeholder={a.list === 'PHARMACY' ? '1 g IV' : '7.5'}
                value={a.size}
                onChange={(e) => setAddition(i, { size: e.target.value })}
              />
            )}
          </label>

          <label className="text-xs text-gray-700">
            <span className="block font-medium">How many</span>
            <span className="mt-0.5 flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-gray-300 bg-white p-1.5 text-gray-700 disabled:opacity-40"
                disabled={a.quantity <= 1}
                aria-label="One fewer"
                onClick={() => setAddition(i, { quantity: Math.max(1, a.quantity - 1) })}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                min={1}
                max={MAX_PACK_QUANTITY}
                inputMode="numeric"
                className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm"
                aria-label="How many"
                value={a.quantity}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setAddition(i, { quantity: Number.isFinite(n) ? n : 1 });
                }}
              />
              <button
                type="button"
                className="rounded border border-gray-300 bg-white p-1.5 text-gray-700 disabled:opacity-40"
                disabled={a.quantity >= MAX_PACK_QUANTITY}
                aria-label="One more"
                onClick={() => setAddition(i, { quantity: Math.min(MAX_PACK_QUANTITY, a.quantity + 1) })}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </span>
          </label>

          <label className="text-xs text-gray-700">
            <span className="block font-medium">Unit</span>
            <select
              className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm"
              value={a.unit}
              aria-label="Unit"
              onChange={(e) => setAddition(i, { unit: e.target.value })}
            >
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>

          <label className="text-xs text-gray-700">
            <span className="block font-medium">Section</span>
            <select
              className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm"
              value={a.group}
              aria-label="Which section it belongs in"
              onChange={(e) => setAddition(i, { group: e.target.value })}
            >
              {(a.list === 'CONSUMABLE' ? CONSUMABLE_CATEGORY_OPTIONS : DRUG_TYPE_OPTIONS)
                .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <input
          className="input-field mt-2 text-sm"
          placeholder={`Why is it needed? (at least ${MIN_PACK_REASON} characters)`}
          value={a.reason}
          onChange={(e) => setAddition(i, { reason: e.target.value })}
        />
        {a.name.trim() !== '' && a.reason.trim().length < MIN_PACK_REASON && (
          <p className="mt-1 text-xs text-amber-700">
            A new item needs a reason — the provider cannot guess why a line appeared.
          </p>
        )}
      </div>
    );
  };

  const renderList = (kind: ListKind, lines: PackLine[]) => (
    <div className="space-y-1">
      {lines.length === 0 && <p className="text-sm text-gray-500">Nothing requested.</p>}
      {lines.map((l) => {
        const withdrawn = String(l.status).toUpperCase() === 'CANCELLED';
        const markedForRemoval = !!removals[l.id];
        const size = sizeOf(kind, l);
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
                {/* THE SIZE. Three lines reading "8 × Syringe (piece)" on one
                    case are 2 mL, 5 mL and 10 mL, and this is where the list
                    gets to say so. */}
                {size !== '' && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-800">
                    {size}
                  </span>
                )}
                {/* What it said at booking, where that is not what it says
                    now. The provider may have picked against the original. */}
                {l.originalQuantity != null
                  && (l.originalQuantity !== l.quantity
                    || (l.originalUnit ?? '') !== (l.unit ?? '')) && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                    was {l.originalQuantity}{l.originalUnit ? ` ${l.originalUnit}` : ''}
                  </span>
                )}
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
                      setSwapOpen((cur) => (cur === l.id ? null : l.id));
                      void loadCatalogue(kind);
                    }}
                    className="text-indigo-600"
                    title="Change this for another of the same kind"
                  >
                    <Repeat2 className="h-4 w-4" />
                  </button>
                  {/* HOW MANY, AND WHICH SIZE. Beside change-the-item and
                      remove-it, because it is the third thing anybody wants
                      to do to a line and the only one that previously
                      required doing the other two in sequence. */}
                  <button
                    type="button"
                    onClick={() => {
                      setQtyOpen((cur) => (cur === l.id ? null : l.id));
                      void loadCatalogue(kind);
                      setQuantities((prev) => (prev[l.id] ? prev : {
                        ...prev,
                        [l.id]: {
                          list: kind,
                          quantity: l.quantity,
                          unit: String(l.unit ?? (kind === 'PHARMACY' ? 'vial' : 'piece')),
                          size,
                          reason: '',
                        },
                      }));
                    }}
                    className="text-emerald-700"
                    title={kind === 'PHARMACY'
                      ? 'Change how many, the unit or the dose'
                      : 'Change how many, the unit or the size'}
                  >
                    <Pencil className="h-4 w-4" />
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

            {/* Staged quantity, unit or size change, on the line it changes. */}
            {quantities[l.id]
              && (quantities[l.id].quantity !== l.quantity
                || quantities[l.id].unit !== String(l.unit ?? '')
                || quantities[l.id].size.trim() !== size)
              && qtyOpen !== l.id && (
              <p className="mt-1 flex items-center gap-2 text-xs font-medium text-emerald-800">
                <Pencil className="h-3 w-3" />
                {l.quantity}{l.unit ? ` ${l.unit}` : ''}{size ? ` (${size})` : ''}
                {' → '}
                {quantities[l.id].quantity}
                {quantities[l.id].unit ? ` ${quantities[l.id].unit}` : ''}
                {quantities[l.id].size.trim() ? ` (${quantities[l.id].size.trim()})` : ''}
                <button
                  type="button"
                  className="text-gray-500"
                  title="Undo this change"
                  onClick={() => setQuantities((p) => {
                    const next = { ...p };
                    delete next[l.id];
                    return next;
                  })}
                >
                  <X className="h-3 w-3" />
                </button>
              </p>
            )}

            {/*
              The quantity control.
              A STEPPER AND A BOX, not a box alone. Most corrections are "one
              more" or "one fewer" and a thumb on a phone finds a 40px button
              faster than a number field; the field stays for 8 and for 24.
              The unit is a list rather than free text, so two lines of the
              same item cannot end up counted in "pair" and "pairs" — but it
              carries whatever this line already says, because the catalogue
              holds units this list has never heard of and refusing to save
              would turn a quantity correction into a dead end.
            */}
            {qtyOpen === l.id && canEdit && !withdrawn && quantities[l.id] && (() => {
              const q = quantities[l.id];
              const set = (patch: Partial<typeof q>) =>
                setQuantities((p) => ({ ...p, [l.id]: { ...p[l.id], ...patch } }));
              const units = Array.from(new Set([
                ...(l.unit ? [String(l.unit)] : []),
                ...unitsFor(kind),
              ]));
              // Sizes the catalogue knows for THIS item, offered as
              // suggestions so a size is picked rather than spelled three
              // different ways. A datalist, not a select: the catalogue does
              // not know every size this theatre uses.
              const known = Array.from(new Set(
                (catalogue[kind] ?? [])
                  .filter((c) => c.name.toLowerCase() === l.name.trim().toLowerCase() && c.size)
                  .map((c) => c.size as string),
              ));
              return (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-emerald-300 bg-white p-1.5 text-emerald-800 disabled:opacity-40"
                      disabled={q.quantity <= 1}
                      aria-label={`One fewer ${l.name}`}
                      onClick={() => set({ quantity: Math.max(1, q.quantity - 1) })}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={MAX_PACK_QUANTITY}
                      inputMode="numeric"
                      className="w-20 rounded border border-emerald-300 px-2 py-1 text-center text-sm"
                      aria-label={`How many ${l.name}`}
                      value={q.quantity}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        set({ quantity: Number.isFinite(n) ? n : 1 });
                      }}
                    />
                    <button
                      type="button"
                      className="rounded border border-emerald-300 bg-white p-1.5 text-emerald-800 disabled:opacity-40"
                      disabled={q.quantity >= MAX_PACK_QUANTITY}
                      aria-label={`One more ${l.name}`}
                      onClick={() => set({ quantity: Math.min(MAX_PACK_QUANTITY, q.quantity + 1) })}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <select
                      className="rounded border border-emerald-300 px-2 py-1 text-sm"
                      aria-label={`Unit for ${l.name}`}
                      value={q.unit}
                      onChange={(e) => set({ unit: e.target.value })}
                    >
                      {units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input
                      className="w-32 rounded border border-emerald-300 px-2 py-1 text-sm"
                      maxLength={MAX_SIZE_LENGTH}
                      list={`sizes-${l.id}`}
                      aria-label={kind === 'PHARMACY' ? `Dose for ${l.name}` : `Size for ${l.name}`}
                      placeholder={kind === 'PHARMACY' ? 'Dose' : 'Size'}
                      value={q.size}
                      onChange={(e) => set({ size: e.target.value })}
                    />
                    {known.length > 0 && (
                      <datalist id={`sizes-${l.id}`}>
                        {known.map((s) => <option key={s} value={s} />)}
                      </datalist>
                    )}
                  </div>

                  {(q.quantity < 1 || q.quantity > MAX_PACK_QUANTITY) && (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      Between 1 and {MAX_PACK_QUANTITY}.
                    </p>
                  )}

                  <input
                    className="input-field mt-2 text-sm"
                    placeholder="Optional — anything the pack provider should know"
                    value={q.reason}
                    onChange={(e) => set({ reason: e.target.value })}
                  />

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={q.quantity < 1 || q.quantity > MAX_PACK_QUANTITY}
                      onClick={() => setQtyOpen(null)}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                      onClick={() => {
                        setQuantities((p) => {
                          const next = { ...p };
                          delete next[l.id];
                          return next;
                        });
                        setQtyOpen(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Staged swap, shown on the line it changes. */}
            {swaps[l.id] && (
              <p className="mt-1 flex items-center gap-2 text-xs font-medium text-indigo-800">
                <Repeat2 className="h-3 w-3" /> changing to {itemLabel(swaps[l.id].to)}
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
              const rows = catalogue[kind];
              if (!rows) {
                return <p className="mt-2 text-xs text-gray-500">Loading alternatives…</p>;
              }
              // Narrowed to this line's own section, so a swap cannot move an
              // item into a section it does not belong in — but NOT
              // deduplicated by name, which is what used to throw every size
              // away and leave a surgeon one choice called "Syringe".
              const choices = rows
                .filter((c) => c.group === group)
                .filter((c) => !(c.name.toLowerCase() === l.name.trim().toLowerCase()
                  && (c.size ?? '') === size))
                .sort((x, y) => itemLabel(x).localeCompare(itemLabel(y)));
              if (choices.length === 0) {
                return (
                  <p className="mt-2 text-xs text-amber-700">
                    No other {kind === 'PHARMACY' ? 'drug' : 'item'} of this kind is in the
                    catalogue. Add the one you want to this section instead.
                  </p>
                );
              }
              return (
                <select
                  className="input-field mt-2 text-sm"
                  value=""
                  aria-label={`Change ${l.name}`}
                  onChange={(e) => {
                    const to = choices.find((c) => c.id === e.target.value);
                    if (!to) return;
                    setSwaps((p) => ({ ...p, [l.id]: { list: kind, to } }));
                    setSwapOpen(null);
                  }}
                >
                  <option value="">Change {l.name} to…</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>{itemLabel(c)}</option>
                  ))}
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
   *
   * NEW ITEMS ARE STAGED INSIDE THEIR SECTION, not in a panel at the foot of
   * the page. Adding a second size of syringe is something you do while
   * looking at the syringes; a form half a screen away with its own section
   * dropdown is how five new lines all ended up under Other.
   */
  const renderSections = (
    sections: { key: string; label: string; lines: PackLine[] }[],
    kind: ListKind,
  ) => {
    // A section that exists only because something is being added to it.
    const extra = Array.from(new Set(
      additions
        .filter((a) => a.list === kind && !sections.some((s) => s.key === a.group))
        .map((a) => a.group),
    )).map((key) => ({ key, label: groupLabel(kind, key), lines: [] as PackLine[] }));

    const all = [...sections, ...extra];
    if (all.length === 0) {
      return <p className="text-sm text-gray-500">Nothing requested yet.</p>;
    }
    return (
      <div className="space-y-2">
        {all.map((s) => {
          const id = `${kind}:${s.key}`;
          const pending = additions
            .map((a, i) => ({ a, i }))
            .filter(({ a }) => a.list === kind && a.group === s.key);
          // A section with something staged in it cannot be shut: closing it
          // would hide a form waiting to be filled in, and the Submit button
          // would then refuse for a reason nobody can see.
          const shut = !!collapsed[id] && pending.length === 0;
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
                    {pending.length > 0 && (
                      <span className="ml-1 text-indigo-700">· {pending.length} to add</span>
                    )}
                  </span>
                </span>
                {shut ? <ChevronRight className="h-4 w-4 text-gray-500" />
                      : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              {!shut && (
                <div className="p-2">
                  {renderList(kind, s.lines)}
                  {pending.map(({ a, i }) => renderAddRow(a, i))}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => addRow(kind, s.key)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add to {s.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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

/**
 * Choosing an item out of the catalogue.
 *
 * A SEARCH BOX AND A LIST, not one enormous select. The consumables
 * catalogue runs to hundreds of rows and a native select of that length is
 * unusable on a phone; typing three letters is how anybody finds anything.
 *
 * IT SEARCHES EVERY SECTION, and says which section each match is in.
 * Somebody who knows they want cefazolin should not have to know that
 * cefazolin lives under Antibiotics before they can ask for it — and
 * choosing the row sets the section for them.
 *
 * WHEN THE CATALOGUE CANNOT BE REACHED it says so and points at typing the
 * name instead. An item that cannot be chosen can still be named, and a
 * screen that offers nothing is how "not in the options" ends up written in
 * the reason box.
 */
function PackCataloguePicker({
  list, rows, loading, failed, chosen, onPick,
}: {
  list: ListKind;
  rows: CatalogueItem[] | undefined;
  loading: boolean;
  failed: boolean;
  chosen: string;
  onPick: (c: CatalogueItem) => void;
}) {
  const [q, setQ] = useState('');

  const matches = useMemo(() => {
    const all = rows ?? [];
    const needle = q.trim().toLowerCase();
    const hit = needle === ''
      ? all
      : all.filter((c) => itemLabel(c).toLowerCase().includes(needle));
    // Capped: a list of four hundred is not a choice, it is a scroll. The
    // count below says how many were left out, so nobody is searching a list
    // whose end they cannot see.
    return { shown: hit.slice(0, 40), total: hit.length };
  }, [rows, q]);

  if (loading) return <p className="text-xs text-gray-500">Loading the catalogue…</p>;

  if (failed || (rows && rows.length === 0)) {
    return (
      <p className="text-xs text-amber-700">
        {failed
          ? 'The catalogue could not be loaded.'
          : `Nothing is in the ${list === 'PHARMACY' ? 'pharmacy' : 'consumables'} catalogue yet.`}
        {' '}Type the name instead — it still reaches the provider.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          className="w-full border-0 py-1 text-sm focus:outline-none focus:ring-0"
          placeholder={list === 'PHARMACY' ? 'Search drugs and dressings…' : 'Search consumables…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the catalogue"
        />
      </div>
      <select
        className="input-field mt-1 text-sm"
        value=""
        aria-label="Choose an item"
        onChange={(e) => {
          const picked = (rows ?? []).find((c) => c.id === e.target.value);
          if (picked) onPick(picked);
        }}
      >
        <option value="">
          {chosen ? `Chosen: ${chosen} — pick another…` : 'Choose an item…'}
        </option>
        {matches.shown.map((c) => (
          <option key={c.id} value={c.id}>
            {itemLabel(c)} · {groupLabel(list, c.group)}
          </option>
        ))}
      </select>
      {matches.total > matches.shown.length && (
        <p className="mt-0.5 text-xs text-gray-500">
          Showing {matches.shown.length} of {matches.total} — keep typing to narrow it.
        </p>
      )}
      {q.trim() !== '' && matches.total === 0 && (
        <p className="mt-0.5 text-xs text-amber-700">
          Nothing in the catalogue matches “{q.trim()}”. Type the name instead.
        </p>
      )}
    </div>
  );
}
