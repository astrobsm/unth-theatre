'use client';

/**
 * PACK REVIEW — what each procedure is actually packed with.
 *
 * Asked for directly: "where do I view all the bundle packs for review, so as
 * to ensure every procedure has the right bundled pack?" The answer was
 * nowhere, and the two screens somebody would naturally try are both the
 * wrong screen:
 *
 *   Surgical Packs   the 77 packs authored per subspecialty. What CAN be
 *                    applied, not what any given operation gets.
 *   Procedure Packs  the procedure-to-pack mapping. Every row unconfirmed,
 *                    and only confirmed rows are read at booking, so it
 *                    currently describes nothing that happens.
 *
 * For all 628 procedures this hospital has booked, the pack comes from the
 * composed standard, computed per case. The only way to see it was to book a
 * case and look — a poor way to review 628 operations and a worse way to catch
 * the one that packed a cervical spine like a cervix.
 *
 * THE MAGNITUDE IS A CONTROL, NOT A DEFAULT. The same operation at minor and
 * at major are different packs; reviewing one size says nothing about the
 * others, so the reviewer picks.
 *
 * Nothing on this page writes. It is for reading and judging.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Package, Pill, Search, AlertTriangle, CheckCircle2, Info, Loader2,
} from 'lucide-react';
import {
  groupConsumables, groupPharmacy,
  CONSUMABLE_CATEGORY_LABEL, DRUG_TYPE_LABEL,
} from '@/lib/packs/labels';

const MAGNITUDES = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'MAJOR', label: 'Major' },
];

interface Line {
  name: string; quantity: number; unit?: string | null;
  category?: string | null; type?: string | null;
  size?: string | null; dosage?: string | null; route?: string | null;
  source?: string | null;
}

interface Preview {
  procedureName: string;
  magnitude: string;
  familyLabel: string;
  approach: string;
  basis: string[];
  warnings: string[];
  source: 'mapping' | 'composed';
  mapping: { exists: boolean; confirmed: boolean; consumablePackName?: string | null; pharmacyPackName?: string | null };
  base: Line[];
  consumables: Line[];
  pharmacy: Line[];
}

export default function PackPreviewPage() {
  const [procedures, setProcedures] = useState<{ name: string; subspecialty?: string | null }[]>([]);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [magnitude, setMagnitude] = useState('MAJOR');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [openList, setOpenList] = useState(false);

  // The catalogue, for picking. One fetch; the filtering is local so typing
  // stays instant on a theatre laptop.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/procedures', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.procedures ?? []);
        setProcedures(
          list
            .map((p: { name?: string; subspecialty?: string | null }) => ({
              name: String(p?.name ?? '').trim(),
              subspecialty: p?.subspecialty ?? null,
            }))
            .filter((p: { name: string }) => p.name),
        );
      } catch {
        // The box still takes a typed name, which is the important path: a
        // procedure booked as free text is exactly the kind that needs review.
      }
    })();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return procedures.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 40);
  }, [procedures, query]);

  const run = useCallback(async (name: string, mag: string, sub: string) => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const url = `/api/packs/preview?procedure=${encodeURIComponent(name)}`
        + `&magnitude=${encodeURIComponent(mag)}`
        + (sub ? `&subspecialty=${encodeURIComponent(sub)}` : '');
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not work out the pack.');
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'Could not work out the pack.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Changing the magnitude re-asks for the same procedure: that comparison is
  // the point of the control.
  useEffect(() => {
    if (chosen) void run(chosen, magnitude, subspecialty);
  }, [chosen, magnitude, subspecialty, run]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenList(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (name: string, sub?: string | null) => {
    setChosen(name);
    setQuery(name);
    setSubspecialty(sub || '');
    setOpenList(false);
  };

  const consumableSections = useMemo(
    () => groupConsumables([...(preview?.base ?? []), ...(preview?.consumables ?? [])]),
    [preview],
  );
  const pharmacySections = useMemo(
    () => groupPharmacy(preview?.pharmacy ?? []),
    [preview],
  );

  const totalConsumables = (preview?.base.length ?? 0) + (preview?.consumables.length ?? 0);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>

      <h1 className="mt-3 text-2xl font-bold">Pack review</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        What a procedure is actually packed with, worked out exactly as a booking
        works it out — from the procedure name and the operative magnitude. Nothing
        here is saved, and no case is touched.
      </p>

      {/* The controls */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="relative sm:col-span-7" ref={boxRef}>
          <label className="label" htmlFor="procedureSearch">Procedure</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="procedureSearch"
              className="input-field pl-9"
              placeholder="Type any procedure, booked or not"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpenList(true); }}
              onFocus={() => setOpenList(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  pick(query.trim());
                }
              }}
            />
          </div>
          {openList && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {matches.map((p) => (
                <li key={`${p.name}:${p.subspecialty ?? ''}`}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => pick(p.name, p.subspecialty)}
                  >
                    {p.name}
                    {p.subspecialty && <span className="ml-2 text-xs text-gray-500">{p.subspecialty}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-gray-500">
            A name that is not in the catalogue still works — press Enter. Free-text
            bookings are the ones most worth checking.
          </p>
        </div>

        <div className="sm:col-span-5">
          <label className="label" htmlFor="magnitude">Magnitude</label>
          <div className="flex gap-2" id="magnitude">
            {MAGNITUDES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMagnitude(m.value)}
                aria-pressed={magnitude === m.value}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  magnitude === m.value
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            The same operation at two sizes is two packs. Switch to compare.
          </p>
        </div>
      </div>

      {loading && (
        <p className="mt-6 inline-flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Working out the pack…
        </p>
      )}
      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      {!loading && !preview && !error && (
        <p className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Pick a procedure to see its pack.
        </p>
      )}

      {preview && !loading && (
        <>
          {/* What it was classified as — the line that decides everything below */}
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                <span className="text-gray-500">Packs as</span>{' '}
                <strong>{preview.familyLabel}</strong>
              </span>
              <span>
                <span className="text-gray-500">Approach</span>{' '}
                <strong>{preview.approach}</strong>
              </span>
              <span>
                <span className="text-gray-500">Magnitude</span>{' '}
                <strong>{preview.magnitude}</strong>
              </span>
              <span>
                <span className="text-gray-500">Lines</span>{' '}
                <strong>{totalConsumables} consumable, {preview.pharmacy.length} pharmacy</strong>
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              <strong>Read this line first.</strong> Everything below follows from it. If
              the family is wrong for this operation, the whole pack is wrong and the
              fix belongs in the classifier, not in the list.
            </p>
          </div>

          {/* Which of the two the booking would use */}
          <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
            preview.source === 'mapping'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-blue-200 bg-blue-50 text-blue-900'
          }`}>
            {preview.source === 'mapping'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              : <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <span>
              {preview.source === 'mapping' ? (
                <>A confirmed mapping supplies this pack, and it overrides the composed standard.</>
              ) : (
                <>
                  This is the <strong>composed standard</strong>, built from the procedure
                  and the magnitude.
                  {preview.mapping.exists && !preview.mapping.confirmed && (
                    <> A mapping has been authored for this procedure but nobody has
                    confirmed it, so it is not used.</>
                  )}
                </>
              )}
            </span>
          </div>

          {preview.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> The prescriber must settle these
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
                {preview.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <Package className="h-4 w-4" /> Consumables
                <span className="text-sm font-normal text-gray-500">({totalConsumables})</span>
              </h2>
              {consumableSections.map((s) => (
                <div key={s.key} className="mb-3 rounded-lg border border-gray-200">
                  <div className="rounded-t-lg bg-gray-50 px-3 py-2 text-sm font-semibold">
                    {CONSUMABLE_CATEGORY_LABEL[s.key as keyof typeof CONSUMABLE_CATEGORY_LABEL] ?? s.label}
                    <span className="ml-2 font-normal text-gray-500">{s.lines.length}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {s.lines.map((l, i) => (
                      <li key={`${l.name}:${i}`} className="px-3 py-2 text-sm">
                        <span className="font-medium">{l.quantity} × {l.name}</span>
                        {l.unit && <span className="text-gray-500"> ({l.unit})</span>}
                        {l.source && <p className="text-xs italic text-gray-500">{l.source}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <Pill className="h-4 w-4" /> Pharmacy
                <span className="text-sm font-normal text-gray-500">({preview.pharmacy.length})</span>
              </h2>
              {pharmacySections.length === 0 && (
                <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                  Nothing. For most operations that is wrong rather than correct — say so.
                </p>
              )}
              {pharmacySections.map((s) => (
                <div key={s.key} className="mb-3 rounded-lg border border-gray-200">
                  <div className="rounded-t-lg bg-gray-50 px-3 py-2 text-sm font-semibold">
                    {DRUG_TYPE_LABEL[s.key as keyof typeof DRUG_TYPE_LABEL] ?? s.label}
                    <span className="ml-2 font-normal text-gray-500">{s.lines.length}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {s.lines.map((l, i) => (
                      <li key={`${l.name}:${i}`} className="px-3 py-2 text-sm">
                        <span className="font-medium">{l.quantity} × {l.name}</span>
                        {l.dosage && <span className="text-gray-700"> {l.dosage}</span>}
                        {l.route && <span className="text-gray-500"> {l.route}</span>}
                        {l.source && <p className="text-xs italic text-gray-500">{l.source}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>

          {preview.basis.length > 0 && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold">Built from</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
                {preview.basis.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
