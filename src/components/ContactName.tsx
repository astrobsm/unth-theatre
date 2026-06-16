'use client';

/**
 * ContactName — renders a person's name as a clickable element that, on click,
 * fetches and shows their phone contact(s) in a small popover with tap-to-call
 * links. Works for both patients and staff users.
 *
 * Usage:
 *   <ContactName type="patient" id={patient.id} name={patient.name} />
 *   <ContactName type="user" name={surgery.surgeon.fullName} />
 *
 * Provide `id` when available (exact lookup); otherwise `name` is used as a
 * best-effort case-insensitive match.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, X, Loader2, UserRound } from 'lucide-react';

interface Contact {
  label: string;
  name: string;
  phone: string;
}

interface ContactInfo {
  type: string;
  id: string;
  name: string;
  folderNumber?: string;
  ward?: string;
  role?: string;
  department?: string;
  contacts: Contact[];
}

interface Props {
  type: 'patient' | 'user';
  name: string;
  id?: string;
  className?: string;
}

export default function ContactName({ type, name, id, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type });
      if (id) params.set('id', id);
      else params.set('name', name);
      const res = await fetch(`/api/contacts?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        setInfo(await res.json());
      } else {
        const e = await res.json().catch(() => ({}));
        setError(e.error || 'Contact not found');
      }
    } catch {
      setError('Failed to load contact');
    } finally {
      setLoading(false);
    }
  }, [type, id, name]);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const next = !open;
      setOpen(next);
      if (next && !info) load();
    },
    [open, info, load]
  );

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!name) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        title="Click to view phone contact"
        className={`text-left underline decoration-dotted underline-offset-2 hover:text-primary-700 focus:outline-none focus:ring-1 focus:ring-primary-400 rounded ${className || ''}`}
      >
        {name}
      </button>

      {open && (
        <div
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute z-[10020] mt-1 left-0 w-64 max-w-[80vw] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 text-sm text-gray-800"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <UserRound className="w-4 h-4 text-primary-600 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold truncate">{info?.name || name}</div>
                {info?.folderNumber && (
                  <div className="text-[11px] text-gray-500 truncate">Folder: {info.folderNumber}</div>
                )}
                {info?.role && (
                  <div className="text-[11px] text-gray-500 truncate">{info.role.replace(/_/g, ' ')}</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="text-amber-600 text-xs py-1">{error}</div>
          ) : info && info.contacts.length > 0 ? (
            <ul className="space-y-1.5">
              {info.contacts.map((c, i) => (
                <li key={i}>
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, '')}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-800 font-medium"
                  >
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] text-green-600 leading-tight">{c.label}: {c.name}</span>
                      <span className="block truncate">{c.phone}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-gray-500 text-xs py-1">No phone number on file.</div>
          )}
        </div>
      )}
    </span>
  );
}
