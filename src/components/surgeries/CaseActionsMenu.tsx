'use client';

// ============================================================
// One menu, with the actions written out in words
// ------------------------------------------------------------
// The actions cell held sixteen things, and eleven of them were a bare icon
// with a title attribute. A title only appears if you hover and wait, which
// nobody does mid-list, and never on a touchscreen — so a surgeon looking for
// "cancel this case" was reading a row of small coloured shapes and guessing.
// That was reported, accurately, as not being able to tell what to do.
//
// WHY A MENU RATHER THAN SIXTEEN LABELLED BUTTONS. Sixteen names will not fit
// in a table cell at any width worth having, and wrapping them into four rows
// of text pushes the clinical columns off the screen. A menu costs one click
// and gives every action its full name, a description where the name is not
// enough, and room to group them.
//
// GROUPED BY WHEN YOU WOULD WANT THEM — before, during, after, and the
// administrative ones — because that is how somebody looks for an action.
// Alphabetical would be easier to build and useless to use.
//
// THE DESTRUCTIVE ONES ARE LAST AND MARKED. Cancelling a case and withdrawing
// a duplicate sit at the bottom, in red, away from the things done fifty
// times a day. Nobody should reach them by accident on the way to the consent
// form.
//
// Rendered through a portal, like the amend dialog, because the actions cell
// is `whitespace-nowrap text-right` inside a horizontally scrolling table —
// a menu rendered in place inherits "never wrap", aligns right, and is
// clipped by the scroll container.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface CaseAction {
  /** What it is called, in the words a clinician would use. */
  label: string;
  /** One line, where the name alone leaves a doubt. */
  hint?: string;
  href?: string;
  onClick?: () => void;
  /** Hidden entirely rather than shown greyed out. */
  hidden?: boolean;
  disabled?: boolean;
  /** Cancelling, withdrawing — anything a person would want to undo. */
  danger?: boolean;
  group: ActionGroup;
}

export type ActionGroup = 'Before surgery' | 'In theatre' | 'After surgery' | 'Administration';

/** The order the groups appear in. Follows the case, not the alphabet. */
const GROUP_ORDER: ActionGroup[] = [
  'Before surgery', 'In theatre', 'After surgery', 'Administration',
];

interface Props {
  actions: CaseAction[];
  /** Named on the menu so it is obvious which row was opened. */
  patientName?: string | null;
  procedureName?: string | null;
}

export default function CaseActionsMenu({ actions, patientName, procedureName }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const MENU_WIDTH = 300;
    // Kept on screen: the actions column is at the right edge of a wide
    // table, so a menu left-aligned to the button would open off the page.
    const left = Math.max(12, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 12));
    setAnchor({ top: r.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    // Closes on anything that would move it, rather than floating away from
    // its row while the page scrolls underneath.
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  const visible = actions.filter((a) => !a.hidden);

  const menu = anchor && (
    <>
      {/* Catches the click that closes it, without blacking out the page —
          this is a menu, not a dialog. */}
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="menu"
        style={{ top: anchor.top, left: anchor.left, width: 300 }}
        className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl bg-white py-1 text-left shadow-xl ring-1 ring-black/10 [white-space:normal]"
      >
        {(patientName || procedureName) && (
          <div className="border-b border-gray-100 px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold text-gray-900">{patientName}</p>
            <p className="truncate text-xs text-gray-500">{procedureName}</p>
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          // Destructive last within the group, enforced here rather than left
          // to whoever writes the array. Cancelling sitting above the consent
          // form is one careless click, and the ordering is not something a
          // caller should have to remember.
          const inGroup = visible
            .filter((a) => a.group === group)
            .sort((a, b) => Number(Boolean(a.danger)) - Number(Boolean(b.danger)));
          if (!inGroup.length) return null;
          return (
            <div key={group} className="py-1">
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {group}
              </p>
              {inGroup.map((a) => {
                const cls = `block w-full px-3 py-2 text-left text-sm transition ${
                  a.disabled
                    ? 'cursor-not-allowed text-gray-300'
                    : a.danger
                      ? 'text-red-700 hover:bg-red-50'
                      : 'text-gray-800 hover:bg-gray-50'
                }`;
                const body = (
                  <>
                    <span className="font-medium">{a.label}</span>
                    {a.hint && (
                      <span className="mt-0.5 block text-xs text-gray-500">{a.hint}</span>
                    )}
                  </>
                );

                if (a.href && !a.disabled) {
                  return (
                    <a key={a.label} href={a.href} className={cls} role="menuitem"
                      onClick={() => setOpen(false)}>
                      {body}
                    </a>
                  );
                }
                return (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    disabled={a.disabled}
                    className={cls}
                    onClick={() => { setOpen(false); a.onClick?.(); }}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
      >
        More actions
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(menu, document.body)}
    </>
  );
}
