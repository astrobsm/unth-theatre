'use client';

/**
 * SurgicalTeamMemberPicker
 * ------------------------
 * Searchable, debounced typeahead that lets the surgery booking form attach a
 * known onboarded user (with userId, fullName, staffCode) to a surgical team
 * slot — instead of typing free text. Also supports a free-text fallback for
 * visiting consultants / locums who are not in the database.
 */

import { useEffect, useRef, useState } from 'react';
import { Search, User as UserIcon, X, Check } from 'lucide-react';

export type PickerValue = {
  userId?: string | null;
  name: string;
  staffCode?: string | null;
};

type ApiUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  staffCode: string | null;
  department: string | null;
};

type Props = {
  /** Comma-separated list of UserRole values to search across. */
  roles: string;
  /** Current value of the team-member slot. */
  value: PickerValue;
  /** Called whenever the value changes (search edits or selection). */
  onChange: (next: PickerValue) => void;
  /** Called when the user clicks the remove button. */
  onRemove: () => void;
  /** Placeholder for the search input. */
  placeholder?: string;
};

export default function SurgicalTeamMemberPicker({
  roles, value, onChange, onRemove, placeholder = 'Search staff by name or staff code…',
}: Props) {
  const [query, setQuery]       = useState(value.name || '');
  const [results, setResults]   = useState<ApiUser[]>([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const wrapRef                 = useRef<HTMLDivElement | null>(null);

  // Keep the visible query in sync if the parent resets the value.
  useEffect(() => { setQuery(value.name || ''); }, [value.name, value.userId]);

  // Close dropdown when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/users?roles=${encodeURIComponent(roles)}&q=${encodeURIComponent(term)}&limit=10`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.ok) {
          const data: ApiUser[] = await res.json();
          setResults(data);
        }
      } catch { /* ignore aborts */ }
      finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, open, roles]);

  const select = (u: ApiUser) => {
    onChange({ userId: u.id, name: u.fullName, staffCode: u.staffCode });
    setQuery(u.fullName);
    setOpen(false);
  };

  const useAsFreeText = () => {
    onChange({ userId: null, name: query.trim(), staffCode: null });
    setOpen(false);
  };

  const isLinked = !!value.userId;

  return (
    <div className="flex gap-2">
      <div ref={wrapRef} className="relative flex-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            className="input-field pl-8 pr-9"
            placeholder={placeholder}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              // Edits clear the link until the user picks a new match (or chooses "use as typed").
              if (value.userId) onChange({ userId: null, name: v, staffCode: null });
              else onChange({ ...value, name: v });
            }}
          />
          {isLinked && (
            <span
              title="Linked to staff record"
              className="absolute right-2.5 top-2 inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5"
            >
              <Check className="w-3 h-3" /> linked
            </span>
          )}
        </div>

        {open && (query.trim().length >= 2 || results.length > 0) && (
          <div className="absolute z-30 mt-1 left-0 right-0 max-h-72 overflow-auto bg-white rounded-lg border border-gray-200 shadow-lg">
            {loading && (
              <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
            )}
            {!loading && results.length === 0 && query.trim().length >= 2 && (
              <div className="px-3 py-2 text-xs text-gray-500">
                No matching staff. You can{' '}
                <button
                  type="button"
                  className="text-primary-600 hover:underline font-medium"
                  onClick={useAsFreeText}
                >
                  use “{query.trim()}” as typed
                </button>{' '}
                (no staff record will be linked).
              </div>
            )}
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => select(u)}
                className="w-full text-left px-3 py-2 hover:bg-primary-50 flex items-start gap-2"
              >
                <UserIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{u.fullName}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {u.role}
                    {u.staffCode ? ` · ${u.staffCode}` : ''}
                    {u.department ? ` · ${u.department}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="p-2 text-red-600 hover:bg-red-50 rounded"
        title="Remove team member"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
