'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Layers, Package, Pill, RefreshCw,
} from 'lucide-react';

import type { DuplicateConfidence, DuplicateGroup } from '@/lib/catalogue/duplicates';

/**
 * The same item, entered more than once.
 *
 * Matching the catalogue to the NHIA price list did not only say what the
 * scheme covers; it showed how often one thing sits in the catalogue under
 * several names. Three rows reading "10% Dextrose/ water (1l)", "10% Dextrous
 * water (1000mls)" and "Dextrose 10% (1 L)" are one fluid, and a surgeon
 * choosing between them at booking is choosing between spellings.
 *
 * THE DECISION IS THE ADMINISTRATOR'S, which is the whole reason this screen
 * exists rather than a script. Those three names are not equally good and
 * nothing in the application knows which one the store calls it.
 *
 * NOTHING IS DELETED. Retiring sets a row inactive and records which row took
 * its place, so every case that ever used it still reads correctly and the
 * decision can be undone.
 */

interface Group extends DuplicateGroup {
  kind: 'CONSUMABLE' | 'PHARMACY';
  nhiaName: string | null;
  nhiaStrength: string | null;
}

const TONE: Record<DuplicateConfidence, { border: string; chip: string; label: string; blurb: string }> = {
  DOUBTFUL: {
    border: 'border-amber-300 bg-amber-50',
    chip: 'bg-amber-200 text-amber-900',
    label: 'Check this one',
    blurb: 'The default quantities disagree, which usually means somebody meant two different pack sizes.',
  },
  SAME_THING: {
    border: 'border-sky-200 bg-sky-50',
    chip: 'bg-sky-200 text-sky-900',
    label: 'Same item, different names',
    blurb: 'One NHIA code, one size, one unit — only the spelling differs.',
  },
  IDENTICAL: {
    border: 'border-gray-200 bg-white',
    chip: 'bg-gray-200 text-gray-800',
    label: 'Identical',
    blurb: 'The names agree once punctuation is set aside. Nothing is lost by keeping one.',
  },
};

export default function CatalogueDuplicatesPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [totals, setTotals] = useState({ groups: 0, wouldRetire: 0 });
  const [canResolve, setCanResolve] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Which row the admin has picked in each group, before they confirm. */
  const [choice, setChoice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/catalogue-duplicates', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body?.error ?? 'Could not load the catalogue.'); return; }
      setGroups(body.groups ?? []);
      setTotals(body.totals ?? { groups: 0, wouldRetire: 0 });
      setCanResolve(!!body.canResolve);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (g: Group, action: 'KEEP_ONE' | 'ALL_DISTINCT') => {
    setBusy(g.key);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/catalogue-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: g.kind,
          action,
          ids: g.rows.map((r) => r.id),
          ...(action === 'KEEP_ONE'
            ? { keepId: choice[g.key] ?? g.suggestedKeepId }
            : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body?.error ?? 'That change was not saved.'); return; }
      setNotice(body.message ?? 'Saved.');
      setError(null);
      await load();
    } catch {
      setError('Could not reach the server. Nothing was changed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Layers className="h-6 w-6 text-indigo-700" /> Catalogue duplicates
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Matching the catalogue to the NHIA price list showed how often one item is in it
            under several names. These share an NHIA code, a size and a unit, so they are the
            same thing written differently — but which name to keep is yours to say.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <p>
          <b>Nothing is deleted.</b> Keeping one marks the others inactive and records which row
          replaced them, so every case that already used one still reads correctly and the
          decision can be undone.
        </p>
        <p className="mt-1">
          <b>Sizes are never merged.</b> Two rows only appear together when the NHIA code, the
          size and the unit all agree — size 7 and size 8 gloves share a code and are not the
          same glove.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}
      {notice && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </p>
      )}

      {loading && groups.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">Reading the catalogue…</p>
      )}

      {!loading && groups.length === 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 font-medium text-gray-800">Nothing left to settle.</p>
          <p className="mt-1 text-sm text-gray-500">
            Every item that shares an NHIA code, a size and a unit with another has been
            looked at. Run the coverage match again after the Authority revises its list and
            new pairs may appear.
          </p>
        </div>
      )}

      {groups.length > 0 && (
        <p className="mt-4 text-sm text-gray-700">
          <b>{totals.groups}</b> group{totals.groups === 1 ? '' : 's'} to settle.
          Taking every suggestion would retire <b>{totals.wouldRetire}</b> row
          {totals.wouldRetire === 1 ? '' : 's'}.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {groups.map((g) => {
          const tone = TONE[g.confidence];
          const picked = choice[g.key] ?? g.suggestedKeepId;
          return (
            <div key={g.key} className={`rounded-lg border p-3 ${tone.border}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    {g.kind === 'PHARMACY'
                      ? <Pill className="h-4 w-4" />
                      : <Package className="h-4 w-4" />}
                    {g.nhiaName ?? g.nhiaCode}
                    {g.nhiaStrength && (
                      <span className="font-normal text-gray-600">{g.nhiaStrength}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {g.nhiaCode}
                    {g.size && <> · size/dose <b>{g.size}</b></>}
                    {' '}· unit <b>{g.unit}</b> · {g.rows.length} rows
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
                  {tone.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{tone.blurb}</p>

              <div className="mt-2 space-y-1">
                {g.rows.map((r) => (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-sm ${
                      picked === r.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-1"
                      name={`keep-${g.key}`}
                      checked={picked === r.id}
                      disabled={!canResolve}
                      onChange={() => setChoice((c) => ({ ...c, [g.key]: r.id }))}
                    />
                    <span>
                      <span className="font-medium text-gray-900">{r.name}</span>
                      <span className="ml-2 text-xs text-gray-600">
                        {r.defaultQuantity} × {r.unit}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {r.usage > 0
                          ? `Used on ${r.usage} pack line${r.usage === 1 ? '' : 's'}`
                          : 'Never ordered'}
                        {r.id === g.suggestedKeepId && (
                          <span className="ml-2 font-medium text-emerald-800">suggested</span>
                        )}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <p className="mt-1 text-xs italic text-gray-600">{g.why}</p>

              {canResolve && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => void resolve(g, 'KEEP_ONE')}
                    disabled={busy === g.key}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === g.key ? 'Saving…' : `Keep this one, retire the other ${g.rows.length - 1}`}
                  </button>
                  <button
                    onClick={() => void resolve(g, 'ALL_DISTINCT')}
                    disabled={busy === g.key}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50"
                  >
                    They are different things — keep all
                  </button>
                </div>
              )}
              {!canResolve && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-800">
                  <AlertTriangle className="h-3 w-3" />
                  Only an administrator or the theatre manager can retire a catalogue item.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
