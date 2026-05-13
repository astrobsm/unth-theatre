"use client";

import { useMemo, useState } from "react";
import { Pill, Search, X } from "lucide-react";
import {
  flattenDrugs,
  getCategories,
  getDrugsByCategory,
  searchDrugs,
  type FlatDrug,
} from "@/lib/drug-catalog";

export interface PickedDrug {
  name: string;
  /** Selected formulation+strength (e.g. "Tablet: 200 mg") or free-text. */
  strength: string;
  dose: string;
  frequency: string;
  route: string;
  duration: string;
  notes: string;
  /** NEML category for audit/display. */
  category?: string;
}

interface DrugPickerProps {
  value?: Partial<PickedDrug>;
  onChange?: (v: PickedDrug) => void;
  /** Render compact (no big card chrome). */
  compact?: boolean;
}

const ROUTES = [
  "PO (Oral)",
  "IV (Intravenous)",
  "IM (Intramuscular)",
  "SC (Subcutaneous)",
  "SL (Sublingual)",
  "PR (Per Rectum)",
  "Topical",
  "Inhalation",
  "Intrathecal",
  "Epidural",
  "Nebulised",
  "Other",
];

const FREQUENCIES = [
  "STAT",
  "Once daily (OD)",
  "Twice daily (BD)",
  "Three times daily (TDS)",
  "Four times daily (QID)",
  "Every 4 hours",
  "Every 6 hours",
  "Every 8 hours",
  "Every 12 hours",
  "PRN (as needed)",
  "Continuous infusion",
];

/**
 * Cascading drug picker backed by the Nigeria Essential Medicines List.
 * Supports search-as-you-type, category browse, strength dropdown, and
 * free-text override for items not on the list.
 */
export default function DrugPicker({ value, onChange, compact }: DrugPickerProps) {
  const categories = useMemo(() => getCategories(), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [selected, setSelected] = useState<FlatDrug | null>(null);
  const [picked, setPicked] = useState<PickedDrug>({
    name: value?.name ?? "",
    strength: value?.strength ?? "",
    dose: value?.dose ?? "",
    frequency: value?.frequency ?? "",
    route: value?.route ?? "",
    duration: value?.duration ?? "",
    notes: value?.notes ?? "",
    category: value?.category ?? "",
  });
  const [customMode, setCustomMode] = useState(false);

  const update = (patch: Partial<PickedDrug>) => {
    const next = { ...picked, ...patch };
    setPicked(next);
    onChange?.(next);
  };

  const results: FlatDrug[] = useMemo(() => {
    if (query.trim().length >= 2) return searchDrugs(query, 60);
    if (category) return getDrugsByCategory(category).slice(0, 200);
    return [];
  }, [query, category]);

  const pickDrug = (d: FlatDrug) => {
    setSelected(d);
    setCustomMode(false);
    update({
      name: d.name,
      strength: d.strengths[0] ?? d.formsText,
      category: d.categoryTitle,
    });
  };

  const clearSelection = () => {
    setSelected(null);
    setCustomMode(false);
    update({ name: "", strength: "", category: "" });
  };

  const wrapperClass = compact
    ? "space-y-3"
    : "space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

  return (
    <div className={wrapperClass}>
      {!compact && (
        <div className="flex items-center gap-2 text-slate-700">
          <Pill className="h-5 w-5 text-rose-600" />
          <h4 className="font-semibold">Drug Picker (Nigeria EML 2024)</h4>
          <span className="ml-auto text-xs text-slate-500">
            {flattenDrugs().length.toLocaleString()} medicines
          </span>
        </div>
      )}

      {!picked.name && !customMode && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drug name (e.g. amoxicillin)…"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setQuery("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">— Browse by category —</option>
              {categories.map((c) => (
                <option key={c.title} value={c.title}>
                  {c.number}. {c.title} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {(query || category) && (
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
              {results.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">
                  No matches.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode(true);
                      update({ name: query.trim() });
                    }}
                    className="text-rose-600 underline"
                  >
                    Enter manually
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((d) => (
                    <li key={`${d.name}|${d.formsText}`}>
                      <button
                        type="button"
                        onClick={() => pickDrug(d)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-rose-50"
                      >
                        <div className="font-medium text-slate-800">{d.name}</div>
                        <div className="text-xs text-slate-500 line-clamp-2">
                          {d.formsText || "—"}
                        </div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-600">
                          {d.categoryNumber}. {d.categoryTitle}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className="text-xs font-medium text-rose-600 hover:underline"
          >
            + Drug not in NEML list? Enter manually
          </button>
        </>
      )}

      {(picked.name || customMode) && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-rose-900">
                {picked.name || "(enter drug name)"}
              </div>
              {picked.category && (
                <div className="text-xs text-rose-700">{picked.category}</div>
              )}
              {selected?.formsText && (
                <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                  Available: {selected.formsText}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded p-1 text-rose-600 hover:bg-rose-100"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {customMode && (
            <input
              type="text"
              value={picked.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Drug name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Strength / Formulation
              </label>
              {selected && selected.strengths.length > 1 ? (
                <select
                  value={picked.strength}
                  onChange={(e) => update({ strength: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {selected.strengths.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="__custom__">Other (specify in dose)</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={picked.strength}
                  onChange={(e) => update({ strength: e.target.value })}
                  placeholder="e.g. Tablet: 500 mg"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Dose</label>
              <input
                type="text"
                value={picked.dose}
                onChange={(e) => update({ dose: e.target.value })}
                placeholder="e.g. 500 mg or 10 mg/kg"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Route</label>
              <select
                value={picked.route}
                onChange={(e) => update({ route: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Select route —</option>
                {ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Frequency
              </label>
              <select
                value={picked.frequency}
                onChange={(e) => update({ frequency: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Select frequency —</option>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Duration
              </label>
              <input
                type="text"
                value={picked.duration}
                onChange={(e) => update({ duration: e.target.value })}
                placeholder="e.g. 5 days"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
              <input
                type="text"
                value={picked.notes}
                onChange={(e) => update({ notes: e.target.value })}
                placeholder="Special instructions"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Convenience: format a PickedDrug as a single-line string for display. */
export function formatPickedDrug(d: PickedDrug): string {
  const parts = [d.name];
  if (d.strength && d.strength !== "__custom__") parts.push(d.strength);
  if (d.dose) parts.push(d.dose);
  if (d.route) parts.push(d.route);
  if (d.frequency) parts.push(d.frequency);
  if (d.duration) parts.push(`× ${d.duration}`);
  let line = parts.join(" • ");
  if (d.notes) line += ` (${d.notes})`;
  return line;
}
