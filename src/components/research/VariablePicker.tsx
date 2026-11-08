'use client';

/**
 * Choosing from 209 variables.
 *
 * A <select> with 209 options is not a usable control: nobody scrolls to find
 * "Time from arrival in theatre to incision" among them, so in practice the
 * first few get used and the rest might as well not exist. This picker is
 * therefore search-first, grouped by the nineteen domains in the order a case
 * moves through them (booking → pre-op → theatre → recovery → outcome), and it
 * shows each variable's `help` line — the one sentence that says what the value
 * actually means and where it comes from.
 *
 * `kinds` restricts what may be picked, because most analyses only accept one
 * shape of variable: a t-test needs a number, a chi-square needs a category,
 * a Kaplan-Meier needs a number for time and a yes/no for the event. Filtering
 * here rather than validating after the fact is what stops somebody choosing
 * "Surgeon" as the outcome of a logistic regression and getting a refusal.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface ClientVariable {
  key: string;
  label: string;
  domain: string;
  kind: 'numeric' | 'categorical' | 'boolean' | 'date';
  unit?: string | null;
  help: string;
  source: string;
  derived?: boolean;
  values?: string[];
}

export interface ClientDomain {
  key: string;
  label: string;
  blurb: string;
  variables: ClientVariable[];
}

const KIND_BADGE: Record<ClientVariable['kind'], { label: string; cls: string }> = {
  numeric: { label: 'number', cls: 'bg-blue-50 text-blue-700' },
  categorical: { label: 'category', cls: 'bg-violet-50 text-violet-700' },
  boolean: { label: 'yes/no', cls: 'bg-emerald-50 text-emerald-700' },
  date: { label: 'date', cls: 'bg-amber-50 text-amber-700' },
};

export function kindBadge(kind: ClientVariable['kind']) {
  return KIND_BADGE[kind];
}

/** Flatten the catalogue, keeping domain order. */
export function allVariables(domains: ClientDomain[]): ClientVariable[] {
  return domains.flatMap((d) => d.variables);
}

export function findVariable(domains: ClientDomain[], key: string | null | undefined) {
  if (!key) return null;
  return allVariables(domains).find((v) => v.key === key) ?? null;
}

interface Props {
  domains: ClientDomain[];
  value: string | null;
  onChange: (key: string) => void;
  /** Which shapes may be picked. Omitted means all of them. */
  kinds?: Array<ClientVariable['kind']>;
  placeholder?: string;
  /** Rendered small and inline, for use inside a filter row. */
  compact?: boolean;
  disabled?: boolean;
}

export default function VariablePicker({
  domains, value, onChange, kinds, placeholder = 'Choose a variable…', compact, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const selected = findVariable(domains, value);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return domains
      .map((d) => ({
        ...d,
        variables: d.variables.filter((v) => {
          if (kinds && !kinds.includes(v.kind)) return false;
          if (!needle) return true;
          return v.label.toLowerCase().includes(needle)
            || v.help.toLowerCase().includes(needle)
            || v.key.toLowerCase().includes(needle)
            || d.label.toLowerCase().includes(needle);
        }),
      }))
      .filter((d) => d.variables.length > 0);
  }, [domains, q, kinds]);

  const total = matches.reduce((a, d) => a + d.variables.length, 0);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setQ(''); }}
        className={`w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg
          text-left bg-white hover:border-indigo-300 disabled:opacity-50 disabled:hover:border-gray-200
          ${compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-sm'}`}
      >
        <span className={selected ? 'text-gray-800 truncate' : 'text-gray-400 truncate'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${KIND_BADGE[selected.kind].cls}`}>
              {KIND_BADGE[selected.kind].label}
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </span>
      </button>

      {selected && !compact && (
        <p className="mt-1 text-xs text-gray-500 leading-snug">{selected.help}</p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[320px] bg-white border border-gray-200 rounded-xl shadow-xl">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, meaning or source…"
              className="w-full text-sm outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          <p className="px-3 py-1.5 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-100">
            {total} variable{total === 1 ? '' : 's'}
            {kinds ? ` of the right type for this field (${kinds.map((k) => KIND_BADGE[k].label).join(', ')})` : ''}
          </p>

          <div className="max-h-80 overflow-y-auto">
            {total === 0 && (
              <p className="px-3 py-4 text-sm text-gray-500">
                Nothing matches. Try a word from the clinical name — the search looks at what each
                variable means, not only its title.
              </p>
            )}
            {matches.map((d) => (
              <div key={d.key}>
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 sticky top-0">
                  {d.label}
                </p>
                {d.variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => { onChange(v.key); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-50
                      ${v.key === value ? 'bg-indigo-50' : ''}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-800">{v.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${KIND_BADGE[v.kind].cls}`}>
                        {KIND_BADGE[v.kind].label}
                      </span>
                    </span>
                    <span className="block text-xs text-gray-500 leading-snug mt-0.5">{v.help}</span>
                    {v.derived && (
                      <span className="block text-[10px] text-amber-700 mt-0.5">
                        Calculated — {v.source}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Picking several variables — for the descriptive table and for Table 1.
 * Shown as removable chips, because a list of twenty checkboxes among 209
 * hides what is actually selected.
 */
export function VariableMultiPicker({
  domains, value, onChange, kinds, label, max = 40,
}: {
  domains: ClientDomain[];
  value: string[];
  onChange: (keys: string[]) => void;
  kinds?: Array<ClientVariable['kind']>;
  label: string;
  max?: number;
}) {
  const chosen = value
    .map((k) => findVariable(domains, k))
    .filter((v): v is ClientVariable => v !== null);

  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1.5">
        {label} <span className="text-gray-400">({value.length}/{max})</span>
      </p>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chosen.map((v) => (
            <span
              key={v.key}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-indigo-50 text-indigo-800 rounded-full text-xs"
            >
              {v.label}
              <button
                type="button"
                onClick={() => onChange(value.filter((k) => k !== v.key))}
                aria-label={`Remove ${v.label}`}
                className="hover:text-indigo-950"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <VariablePicker
        domains={domains}
        value={null}
        kinds={kinds}
        placeholder={value.length >= max ? `Limit of ${max} reached` : 'Add a variable…'}
        disabled={value.length >= max}
        onChange={(k) => { if (!value.includes(k)) onChange([...value, k]); }}
      />
    </div>
  );
}
