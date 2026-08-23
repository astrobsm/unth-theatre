'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional second line — staff code, role, phone… */
  hint?: string;
}

/**
 * Type-to-search single select, built to be usable one-handed on a phone.
 *
 * A plain <select> is unworkable once a department has dozens of staff: the
 * native picker gives no way to search, so a ward sister ends up scrolling a
 * wheel of 80 names. This filters as you type and keeps every row at a 44px
 * touch target.
 *
 * Deliberately dependency-free — the app ships no combobox library, and adding
 * one for this would be heavier than the component itself.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyLabel = 'No matches',
  ariaLabel,
  allowClear = true,
  disabled = false,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  ariaLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Every whitespace-separated term must appear somewhere, so "chris con"
    // finds "Muoghalu Christopher.C.C — Consultant" regardless of word order.
    const terms = q.split(/\s+/);
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [options, query]);

  // Close on outside tap/click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    // Let the list render before focusing, or iOS won't raise the keyboard.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active].value); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      {!open ? (
        <button
          type="button"
          onClick={openList}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={false}
          className="input-field flex items-center justify-between gap-2 text-left disabled:bg-gray-50 disabled:text-gray-400"
        >
          <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {allowClear && selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear selection"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
                className="p-1 -m-1 rounded text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </span>
        </button>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded
            role="combobox"
            className="input-field pl-9"
          />
        </div>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-gray-400">{emptyLabel}</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              // onMouseDown, not onClick: the input's blur would otherwise close
              // the list before the click landed.
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
              className={`flex items-start justify-between gap-2 px-3 py-2.5 min-h-[44px] cursor-pointer text-sm ${
                i === active ? 'bg-primary-50' : ''
              } ${o.value === value ? 'font-semibold text-primary-700' : 'text-gray-800'}`}
            >
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block text-xs text-gray-400 truncate">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
