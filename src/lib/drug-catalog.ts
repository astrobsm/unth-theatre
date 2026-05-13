// Public API for the Nigeria Essential Medicines List drug catalogue.
// The bulk data lives in ./drug-catalog.data.ts (auto-generated).

import { DRUG_CATALOG_DATA } from "./drug-catalog.data";

export interface CatalogDrug {
  name: string;
  forms_text: string;
}

export interface CatalogSection {
  section: string;
  title: string;
  subsections: CatalogSection[];
  drugs: CatalogDrug[];
}

export interface FlatDrug {
  name: string;
  formsText: string;
  /** Top-level NEML category (e.g. "ANAESTHETICS, PREOPERATIVE MEDICINES, AND MEDICAL GASES"). */
  categoryTitle: string;
  /** Top-level NEML number (e.g. "1"). */
  categoryNumber: string;
  /** Path of section titles from the top-level down to the drug's immediate sub-section. */
  path: string[];
  /** Parsed candidate strengths/forms split from forms_text (best-effort). */
  strengths: string[];
}

export const DRUG_CATALOG: CatalogSection[] = DRUG_CATALOG_DATA;

function splitStrengths(formsText: string): string[] {
  if (!formsText) return [];
  // Split formulation blocks. Drug forms in NEML look like:
  //   "Tablet: 200 mg; 400 mg. Injection: 100 mg/mL in 2-mL ampoule."
  // Strategy: split on '; ' and on '. ' boundaries that precede a known form keyword.
  const FORM = /(Tablet|Tablets|Capsule|Capsules|Injection|Powder for [^:.]+|Oral (?:liquid|solution|suspension|granules)|Suspension|Solution|Cream|Ointment|Gel|Spray|Drops|Eye drops|Ear drops|Suppository|Suppositories|Pessary|Pessaries|Lozenges?|Inhalation|Inhaler|Granules|Vaginal [^:.]+|Topical [^:.]+|Sublingual|Patch|Lotion|Mouthwash|Syrup|Effervescent [^:.]+|Dental [^:.]+|Nasal [^:.]+|Implant|Subcutaneous [^:.]+|Intravenous [^:.]+|Liquid|Vial|Ampoule|Aerosol|Enema|Linctus|Foam|Pastille|Mixture|Pellet|Solution for [^:.]+|Injection for [^:.]+|Powder)\s*:\s*/g;

  const blocks: { form: string; rest: string }[] = [];
  let m: RegExpExecArray | null;
  let idx = 0;
  const matches: { form: string; start: number; end: number }[] = [];
  while ((m = FORM.exec(formsText)) !== null) {
    matches.push({ form: m[1], start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : formsText.length;
    const rest = formsText.slice(cur.end, nextStart).trim().replace(/\.$/, "");
    blocks.push({ form: cur.form, rest });
  }

  if (blocks.length === 0) {
    // No form keywords found — return the whole text as a single option.
    return [formsText.trim()].filter(Boolean);
  }

  const out: string[] = [];
  for (const b of blocks) {
    // Split rest on "; " or " or " to enumerate strengths.
    const parts = b.rest
      .split(/\s*;\s*|\s+or\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      out.push(b.form);
    } else {
      for (const p of parts) out.push(`${b.form}: ${p}`);
    }
  }
  return out;
}

let _flat: FlatDrug[] | null = null;

export function flattenDrugs(): FlatDrug[] {
  if (_flat) return _flat;
  const acc: FlatDrug[] = [];
  const walk = (node: CatalogSection, top: CatalogSection, path: string[]) => {
    for (const d of node.drugs ?? []) {
      acc.push({
        name: d.name,
        formsText: d.forms_text || "",
        categoryTitle: top.title,
        categoryNumber: top.section,
        path: path.slice(),
        strengths: splitStrengths(d.forms_text || ""),
      });
    }
    for (const sub of node.subsections ?? []) {
      walk(sub, top, [...path, sub.title]);
    }
  };
  for (const top of DRUG_CATALOG) walk(top, top, [top.title]);
  // De-dup by name|formsText
  const seen = new Set<string>();
  _flat = acc.filter((d) => {
    const k = `${d.name}|${d.formsText}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return _flat;
}

export function getCategories(): { number: string; title: string; count: number }[] {
  const all = flattenDrugs();
  const map = new Map<string, { number: string; title: string; count: number }>();
  for (const d of all) {
    const key = d.categoryTitle;
    const ex = map.get(key);
    if (ex) ex.count++;
    else map.set(key, { number: d.categoryNumber, title: d.categoryTitle, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => {
    const an = parseInt(a.number, 10) || 0;
    const bn = parseInt(b.number, 10) || 0;
    return an - bn;
  });
}

export function getDrugsByCategory(categoryTitle: string): FlatDrug[] {
  return flattenDrugs().filter((d) => d.categoryTitle === categoryTitle);
}

export function searchDrugs(query: string, limit = 50): FlatDrug[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = flattenDrugs();
  const out: FlatDrug[] = [];
  for (const d of all) {
    if (d.name.toLowerCase().includes(q)) {
      out.push(d);
      if (out.length >= limit) break;
    }
  }
  return out;
}
