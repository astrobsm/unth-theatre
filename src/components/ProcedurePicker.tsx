'use client';

// ============================================================
// Choosing the procedure
// ------------------------------------------------------------
// A searchable list grouped by category, filtered to the subspecialty, with
// "Other — not in the list" at the bottom. Choosing Other opens a field; the
// name typed there is added to the catalogue and is available to everybody
// from then on.
//
// Two things this deliberately does NOT do:
//
// It does not block the booking when the catalogue cannot be reached. If the
// list fails to load, the control falls back to a plain text box and says so.
// A surgeon at 2 a.m. must be able to book an operation whatever the network
// is doing, and a dropdown that can strand a booking is worse than the free
// text it replaced.
//
// It does not require the new name to be saved before the form is submitted.
// The name is what matters to the booking; adding it to the catalogue is a
// side benefit, and if that call fails the booking still carries the name.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import { matchesQuery } from '@/lib/procedures/normalise';

interface Procedure {
  id: string;
  name: string;
  category: string | null;
  isEmergency: boolean;
  usageCount: number;
  source: string;
}

interface Group {
  category: string;
  procedures: Procedure[];
}

export default function ProcedurePicker({
  subspecialty,
  value,
  onChange,
  name = 'procedureName',
  required = true,
  emergencyFirst = false,
  subspecialtySource = 'subspecialty',
}: {
  /** Must match surgical_units.subspecialty. Empty disables the list. */
  subspecialty?: string | null;
  value: string;
  onChange: (name: string) => void;
  /** Name of the hidden input, so plain <form> submission still works. */
  name?: string;
  required?: boolean;
  /** Show procedures commonly done as emergencies first. */
  emergencyFirst?: boolean;
  /**
   * What the form calls the control that sets the subspecialty. The emergency
   * form has no subspecialty field — it derives one from the surgical unit —
   * so telling the user to "choose the subspecialty above" would send them
   * looking for a field that is not there.
   */
  subspecialtySource?: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // "Other" mode: a free-text name that is not (yet) in the catalogue.
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!subspecialty) {
      setGroups([]);
      return;
    }
    setLoading(true);
    setListFailed(false);
    try {
      const res = await fetch(`/api/procedures?subspecialty=${encodeURIComponent(subspecialty)}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setGroups(data.groups || []);
    } catch {
      // Fall back to free text rather than stranding the booking.
      setListFailed(true);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [subspecialty]);

  useEffect(() => {
    load();
  }, [load]);

  // Close on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const visible = useMemo(() => {
    const filtered = groups
      .map((g) => ({
        ...g,
        procedures: g.procedures.filter((p) => matchesQuery(p.name, query)),
      }))
      .filter((g) => g.procedures.length > 0);

    if (!emergencyFirst) return filtered;

    // Emergencies float to the top when booking an emergency, without hiding
    // anything: a theatre does not respect the distinction and neither should
    // the list.
    return [...filtered].sort((a, b) => {
      const aE = a.procedures.filter((p) => p.isEmergency).length / a.procedures.length;
      const bE = b.procedures.filter((p) => p.isEmergency).length / b.procedures.length;
      return bE - aE;
    });
  }, [groups, query, emergencyFirst]);

  const totalVisible = visible.reduce((n, g) => n + g.procedures.length, 0);

  const choose = (procedureName: string) => {
    onChange(procedureName);
    setCustomMode(false);
    setCustomName('');
    setSaveNote(null);
    setSaveError(null);
    setOpen(false);
    setQuery('');
  };

  const startCustom = () => {
    setCustomMode(true);
    setOpen(false);
    setQuery('');
    // Carry the typed search across — usually it is what they were looking for.
    const seed = query.trim();
    setCustomName(seed);
    onChange(seed);
  };

  /** Add the typed name to the catalogue. Never blocks the booking. */
  const saveCustom = async () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (!subspecialty) {
      // Should be unreachable — the picker falls back to plain text without a
      // subspecialty — but silently doing nothing here would look like a
      // broken button, and the entry has to be filed under something.
      setSaveError(`Choose the ${subspecialtySource} first, so the procedure is filed under it.`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveNote(null);
    try {
      const res = await fetch('/api/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, subspecialty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add it to the list');

      const saved = data.procedure?.name ?? trimmed;
      onChange(saved);
      setCustomName(saved);
      setSaveNote(
        data.created
          ? `Added to ${data.procedure?.subspecialty ?? subspecialty}. It will be in the list for everyone from now on.`
          : `Already in the ${data.procedure?.subspecialty ?? subspecialty} list — selected it for you.`
      );
      await load();
    } catch (e: any) {
      // The booking still carries the name; only the catalogue missed out.
      setSaveError(e.message || 'Could not add it to the list. Your booking still keeps the name.');
    } finally {
      setSaving(false);
    }
  };

  // ---- No subspecialty yet, or the list is unavailable: plain text ---------
  if (!subspecialty || listFailed) {
    return (
      <div>
        <input
          type="text"
          name={name}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field"
          placeholder="e.g., Exploratory laparotomy"
        />
        <p className="mt-1 text-xs text-gray-500 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {!subspecialty
            ? `Choose the ${subspecialtySource} first to pick from the procedure list.`
            : 'The procedure list could not be loaded — type the name instead. The booking is unaffected.'}
        </p>
      </div>
    );
  }

  // ---- "Other": type a name, optionally add it to the list -----------------
  if (customMode) {
    return (
      <div>
        <input type="hidden" name={name} value={value} />
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={customName}
            onChange={(e) => {
              setCustomName(e.target.value);
              onChange(e.target.value);
              setSaveNote(null);
              setSaveError(null);
            }}
            className="input-field flex-1"
            placeholder="Name the procedure in full"
          />
          <button
            type="button"
            onClick={saveCustom}
            disabled={saving || customName.trim().length < 4}
            className="px-3 py-2 rounded-lg border bg-blue-50 text-blue-800 border-blue-200 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add to list'}
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => {
              setCustomMode(false);
              setSaveNote(null);
              setSaveError(null);
              onChange('');
            }}
            className="text-xs text-gray-600 hover:underline"
          >
            ← Back to the list
          </button>
          {saveNote && (
            <span className="text-xs text-green-700 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {saveNote}
            </span>
          )}
          {saveError && <span className="text-xs text-amber-700">{saveError}</span>}
          {!saveNote && !saveError && (
            <span className="text-xs text-gray-500">
              &quot;Add to list&quot; files it under <strong>{subspecialty}</strong> and makes it available to
              everyone next time. The booking works either way.
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- The picker ----------------------------------------------------------
  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-field w-full text-left flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || 'Select the procedure'}
        </span>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-80 overflow-hidden flex flex-col">
          <div className="p-2 border-b sticky top-0 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${subspecialty} procedures`}
                className="w-full pl-8 pr-2 py-2 text-sm border rounded-lg"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {totalVisible === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500 text-center">
                Nothing matches &quot;{query}&quot;.
              </p>
            ) : (
              visible.map((g) => (
                <div key={g.category}>
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 sticky top-0">
                    {g.category}
                  </div>
                  {g.procedures.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => choose(p.name)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 ${
                        value === p.name ? 'bg-blue-50 font-medium' : ''
                      }`}
                    >
                      <span className="text-gray-900">{p.name}</span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {p.isEmergency && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                            emergency
                          </span>
                        )}
                        {value === p.name && <Check className="w-4 h-4 text-blue-600" />}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={startCustom}
            className="border-t px-3 py-2.5 text-sm text-left text-blue-700 hover:bg-blue-50 flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            Other — not in the list
          </button>
        </div>
      )}
    </div>
  );
}
