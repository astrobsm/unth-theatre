'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Confirm which packs each procedure needs.
 *
 * Done once, per procedure, by someone who knows the theatre. After that a
 * booking attaches the packs without anybody choosing, and without the system
 * guessing.
 *
 * Suggestions are offered with the basis and confidence shown, because a
 * suggestion whose reasoning is hidden is either trusted blindly or ignored, and
 * both are worse than one that explains itself.
 */

interface Suggestion { packId: string; packName: string; basis: string; confidence: string }
interface Mapping {
  consumablePackId: string | null; consumablePackName: string | null;
  pharmacyPackId: string | null; pharmacyPackName: string | null;
  confirmedAt: string | null; confirmedByName: string | null;
}
interface Row {
  procedureKey: string;
  procedureName: string;
  subspecialty: string | null;
  timesBooked: number;
  mapping: Mapping | null;
  suggestions: Suggestion[];
}
interface Pack { id: string; name: string; subspecialty: string; kind: string | null }

const CONFIDENCE_STYLE: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-800 border-green-300',
  MEDIUM: 'bg-amber-100 text-amber-900 border-amber-300',
  LOW: 'bg-gray-100 text-gray-700 border-gray-300',
};

const BASIS_LABEL: Record<string, string> = {
  EXACT_NAME: 'name matches the pack exactly',
  PROCEDURE_WORD: 'shares a word with the procedure',
  SUBSPECIALTY_DEFAULT: 'same subspecialty — a starting point only',
};

export default function ProcedurePackMappingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [summary, setSummary] = useState<{ total: number; confirmed: number; outstanding: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(true);
  const [search, setSearch] = useState('');

  // Edits held locally until saved, so a slip on one row does not commit.
  const [draft, setDraft] = useState<Record<string, { consumable: string; pharmacy: string }>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/procedure-packs${unmappedOnly ? '?unmappedOnly=1' : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setNote('Could not load the procedure list.'); return; }
        setRows(d.procedures ?? []);
        setPacks(d.packs ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => setNote('Could not reach the server.'))
      .finally(() => setLoading(false));
  }, [unmappedOnly]);

  useEffect(() => { load(); }, [load]);

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || r.procedureName.toLowerCase().includes(q)
      || (r.subspecialty ?? '').toLowerCase().includes(q);
  });

  const save = async () => {
    const mappings = Object.entries(draft)
      .map(([key, v]) => {
        const row = rows.find((r) => r.procedureKey === key);
        if (!row) return null;
        if (!v.consumable && !v.pharmacy) return null;
        return {
          procedureName: row.procedureName,
          subspecialty: row.subspecialty,
          consumablePackId: v.consumable || null,
          pharmacyPackId: v.pharmacy || null,
        };
      })
      .filter(Boolean);

    if (mappings.length === 0) { setNote('Nothing chosen yet.'); return; }

    setSaving(true);
    setNote('');
    try {
      const res = await fetch('/api/admin/procedure-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      const body = await res.json().catch(() => ({}));
      setNote(res.ok ? (body.message ?? 'Saved.') : (body.error ?? 'Could not save.'));
      if (res.ok) { setDraft({}); load(); }
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = Object.values(draft).filter((v) => v.consumable || v.pharmacy).length;

  return (
    <div className="p-4 md:p-6">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Procedure packs</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Choose the consumable and pharmacy pack each procedure needs. Once confirmed,
        booking a case attaches them automatically — the system never guesses on its
        own, because a wrong pack gets opened before anybody notices it is wrong.
      </p>

      {summary && (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-green-50 px-3 py-1.5 font-semibold text-green-800">
            {summary.confirmed} confirmed
          </span>
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-semibold text-amber-900">
            {summary.outstanding} still to do
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search procedure or subspecialty"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={unmappedOnly}
            onChange={(e) => setUnmappedOnly(e.target.checked)}
          />
          Only those still to do
        </label>
        <button
          onClick={save}
          disabled={saving || pendingCount === 0}
          className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : `Save ${pendingCount || ''} mapping${pendingCount === 1 ? '' : 's'}`}
        </button>
      </div>

      {note && <p className="mt-3 text-sm font-medium text-gray-900">{note}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          {unmappedOnly ? 'Every booked procedure has a pack mapping.' : 'No procedures found.'}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((row) => {
            const d = draft[row.procedureKey] ?? {
              consumable: row.mapping?.consumablePackId ?? '',
              pharmacy: row.mapping?.pharmacyPackId ?? '',
            };
            const set = (patch: Partial<typeof d>) =>
              setDraft((p) => ({ ...p, [row.procedureKey]: { ...d, ...patch } }));

            return (
              <div key={row.procedureKey} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-gray-900">{row.procedureName}</span>
                  {row.subspecialty && (
                    <span className="text-xs text-gray-500">{row.subspecialty}</span>
                  )}
                  {/* How often it is actually booked, so effort goes where it
                      matters — a procedure done weekly deserves more thought than
                      one done once two years ago. */}
                  <span className="text-xs text-gray-400">
                    booked {row.timesBooked}×
                  </span>
                  {row.mapping?.confirmedAt && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                      confirmed{row.mapping.confirmedByName ? ` by ${row.mapping.confirmedByName}` : ''}
                    </span>
                  )}
                </div>

                {row.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.suggestions.slice(0, 4).map((s) => (
                      <button
                        key={s.packId}
                        type="button"
                        onClick={() => set({ consumable: s.packId })}
                        title={BASIS_LABEL[s.basis] ?? s.basis}
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${CONFIDENCE_STYLE[s.confidence] ?? ''}`}
                      >
                        {s.packName} · {BASIS_LABEL[s.basis] ?? s.basis}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">
                    Consumable pack
                    <select
                      value={d.consumable}
                      onChange={(e) => set({ consumable: e.target.value })}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">— none —</option>
                      {packs.map((p) => (
                        <option key={`c-${p.id}`} value={p.id}>{p.name} ({p.subspecialty})</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Pharmacy pack
                    <select
                      value={d.pharmacy}
                      onChange={(e) => set({ pharmacy: e.target.value })}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">— none —</option>
                      {packs.map((p) => (
                        <option key={`p-${p.id}`} value={p.id}>{p.name} ({p.subspecialty})</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
