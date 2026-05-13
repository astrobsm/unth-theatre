// Adapter: expose the NEML drug catalogue using the same shape used by the
// pre-op review medication picker (ANESTHETIC_MEDICATIONS).
// Each entry is `{ name, unit, commonDoses[] }` grouped by category title.

import { flattenDrugs } from "./drug-catalog";

export interface NemlMedicationEntry {
  name: string;
  unit: string;
  commonDoses: string[];
  /** Original NEML form text for the tooltip / disclosure. */
  formsText: string;
}

const STRENGTH_RE = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|mL|ml|units?|%|IU)\b/gi;

function extractDoses(formsText: string): { doses: string[]; unit: string } {
  const doses: string[] = [];
  let unit = "mg";
  let m: RegExpExecArray | null;
  STRENGTH_RE.lastIndex = 0;
  while ((m = STRENGTH_RE.exec(formsText)) !== null) {
    doses.push(m[1]);
    unit = m[2];
    if (doses.length >= 8) break;
  }
  // De-dup preserving order
  const seen = new Set<string>();
  const uniq = doses.filter((d) => (seen.has(d) ? false : (seen.add(d), true)));
  return { doses: uniq, unit };
}

let _cache: Record<string, NemlMedicationEntry[]> | null = null;

export function getNemlMedicationCategories(): Record<string, NemlMedicationEntry[]> {
  if (_cache) return _cache;
  const out: Record<string, NemlMedicationEntry[]> = {};
  for (const d of flattenDrugs()) {
    // Use immediate sub-section (last in path) as the category label so the
    // dropdown groups match clinical browsing (e.g. "Antihypertensive medicines").
    const cat = d.path[d.path.length - 1] || d.categoryTitle;
    const label = `NEML — ${cat}`;
    const { doses, unit } = extractDoses(d.formsText);
    if (!out[label]) out[label] = [];
    out[label].push({
      name: d.name,
      unit,
      commonDoses: doses,
      formsText: d.formsText,
    });
  }
  // Sort entries within each category alphabetically
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.name.localeCompare(b.name));
  _cache = out;
  return out;
}
