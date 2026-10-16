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

import { placeMenu, MENU_WIDTH, type Placement } from '@/lib/ui/menuPlacement';

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
  const [anchor, setAnchor] = useState<Placement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // THE HEIGHT IS MEASURED, not guessed at 70vh. Sixteen named actions in
    // four groups is taller than most laptop windows, so a fixed 70vh ran the
    // last group — the one holding "Cancel this case" — off the bottom of the
    // screen. Reaching it meant scrolling, and scrolling closed the menu.
    // The arithmetic lives in lib/ui/menuPlacement with the awkward cases
    // written down as tests, because geometry looks right in a diff and is
    // wrong on a 13-inch screen.
    setAnchor(placeMenu(
      { top: r.top, bottom: r.bottom, right: r.right },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, []);

  useEffect(() => {
    if (!open) return;
    place();

    const onScroll = (event: Event) => {
      // THE BUG. This listener is on the capture phase so it sees scrolling
      // anywhere, INCLUDING inside the menu's own scrollable list — so the
      // moment somebody scrolled the list to reach the lower actions, the
      // thing they were scrolling closed under them.
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;

      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Its row has left the screen, so a menu anchored to it means nothing
      // any more. This is the case the old close-on-any-scroll was for, and
      // it is the only case that justifies closing.
      if (r.bottom < 0 || r.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      // Otherwise follow the row rather than vanish. A menu that closes
      // because the page moved two pixels is one you cannot use on a
      // touchscreen at all.
      place();
    };

    const onResize = () => place();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
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
        ref={menuRef}
        role="menu"
        style={{
          top: anchor.top, left: anchor.left, width: MENU_WIDTH,
          maxHeight: anchor.maxHeight,
        }}
        // overscroll-contain keeps a touch scroll inside the list instead of
        // handing it to the page once the list hits its end — on a tablet that
        // scrolled the table underneath and took the row out from under the
        // menu, which is the same failure by a different route.
        className="fixed z-50 overflow-y-auto overscroll-contain rounded-xl bg-white py-1 text-left shadow-xl ring-1 ring-black/10 [white-space:normal]"
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
