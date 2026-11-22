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
import { X, Loader2, UserRound, MessageCircle, Phone } from 'lucide-react';
import { whatsappChatLink, whatsappLink } from '@/lib/whatsapp';
import { buildConsumableDepositMessage } from '@/lib/packs/patientPayNotice';

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

/**
 * What a tapped number should SAY, when there is something to say.
 *
 * Without this the popover opens a blank WhatsApp chat, which puts the whole
 * message on whoever tapped it -- and the thing that has to be said is four
 * specific instructions in a specific order (go to the consumable shop at the
 * Emergency, pay by category, keep the receipt, bring the receipt). Typed out
 * by hand on a phone, step three and four are the ones that get dropped, and
 * they are the ones the case is held at the door over.
 *
 * Optional, and absent everywhere else: a staff member's number opens a plain
 * chat exactly as it did before.
 */
export interface PayNotice {
  patientName: string;
  procedureName?: string | null;
  /** The booked magnitude -- MAJOR, INTERMEDIATE, MINOR, SUPER_MAJOR. */
  category?: string | null;
  scheduledAt?: string | Date | null;
  senderName?: string | null;
}

interface Props {
  type: 'patient' | 'user';
  name: string;
  id?: string;
  className?: string;
  /** When given, each number offers the payment message and a call. */
  payNotice?: PayNotice | null;
}

export default function ContactName({ type, name, id, className, payNotice }: Props) {
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
              {info.contacts.map((c, i) => {
                const tel = `tel:${c.phone.replace(/\s+/g, '')}`;
                /*
                  WHO THE NUMBER BELONGS TO CHANGES THE WORDING. The contacts
                  route returns the patient's own number and the caregiver's
                  under different labels, and "you have materials to pay for"
                  sent to somebody's son is wrong in a way that makes the
                  hospital look careless. Anything that is not the patient's
                  own line is written about them in the third person.
                */
                const owner = c.label.trim().toUpperCase() === 'PATIENT'
                  ? 'PATIENT' as const
                  : 'CAREGIVER' as const;
                const payLink = payNotice
                  ? whatsappLink(c.phone, buildConsumableDepositMessage({
                    patientName: payNotice.patientName,
                    owner,
                    procedureName: payNotice.procedureName ?? null,
                    category: payNotice.category ?? null,
                    scheduledAt: payNotice.scheduledAt ?? null,
                    senderName: payNotice.senderName ?? null,
                  }))
                  : null;
                return (
                  <li key={i}>
                    <a
                      href={payLink || whatsappChatLink(c.phone) || tel}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={payLink
                        ? 'Send the payment and safety message on WhatsApp'
                        : 'Chat on WhatsApp'}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-800 font-medium"
                    >
                      <MessageCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11px] text-green-600 leading-tight">{c.label}: {c.name}</span>
                        <span className="block truncate">{c.phone}</span>
                      </span>
                    </a>
                    {/*
                      CALLING IS THE OTHER HALF OF THE ASK, and on these phones
                      it is often the half that works: a number with no WhatsApp
                      on it still rings. Shown as its own control rather than as
                      a fallback inside the link above, because a fallback only
                      helps the person who already knows it is there.
                    */}
                    {payNotice && (
                      <div className="mt-1 flex gap-1.5">
                        <a
                          href={tel}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                        <a
                          href={whatsappChatLink(c.phone) || tel}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                        >
                          Blank chat
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-gray-500 text-xs py-1">No phone number on file.</div>
          )}
        </div>
      )}
    </span>
  );
}
