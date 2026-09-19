'use client';

// ============================================================
// The dialog that appears when a form will not go through
// ------------------------------------------------------------
// Mounted once, for the whole application. Any refusal the catalogue can
// explain arrives here, so a nurse in the holding area and a clerk in stores
// get the same treatment without either screen having been written for it.
//
// WHAT IT PUTS FIRST. The reason, in one sentence. Then the specific things
// that are wrong, if the server named any. Then the buttons — and a button here
// always DOES something: it goes to the screen where the problem is solved, it
// puts the cursor in the field, or it sends the request again. A dialog whose
// only button is "OK" has added a click and nothing else.
//
// It does not trap the user. Escape closes it, the backdrop closes it, and the
// form underneath is untouched — whatever they typed is still there.
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, Target, X } from 'lucide-react';
import { humaniseField, type Blocker, type Fix } from '@/lib/blockers/catalogue';

interface Props {
  blocker: Blocker | null;
  /** Re-sends the request that was refused. Absent when retrying cannot help. */
  onRetry?: () => void;
  retrying?: boolean;
  onClose: () => void;
}

/**
 * Put the cursor in a field and scroll it into view.
 *
 * By `name`, because that is what the server knows the field as and what the
 * catalogue carries. Returns false when the field is not on this screen — which
 * happens on a multi-step form, and is worth telling the user rather than
 * closing the dialog as though something had been done.
 */
function focusField(name: string): boolean {
  if (typeof document === 'undefined') return false;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    `[name="${CSS.escape(name)}"], #${CSS.escape(name)}`,
  ));
  // A hidden input carries the value on several of these forms — the procedure
  // picker is one — and scrolling to it would move nothing and ring nothing,
  // while the dialog closed as though something had been done. Only an element
  // the user can actually see counts as having been found.
  const el = candidates.find((c) => (
    (c as HTMLInputElement).type !== 'hidden' && c.offsetParent !== null
  ));
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // The outline fades by itself: a field left permanently ringed in red after
  // it has been corrected is its own small lie.
  el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2');
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2'), 4000);
  (el as HTMLInputElement).focus?.();
  return true;
}

export default function BlockerDialog({ blocker, onRetry, retrying, onClose }: Props) {
  const router = useRouter();
  // Set when a field could not be reached — on a form with collapsed sections
  // or steps it may not be on screen. Saying so is better than a button that
  // silently does nothing.
  const [unreachable, setUnreachable] = useState<string | null>(null);

  useEffect(() => {
    if (!blocker) return;
    setUnreachable(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocker, onClose]);

  if (!blocker) return null;

  const run = (fix: Fix) => {
    switch (fix.kind) {
      case 'go':
        if (fix.href) router.push(fix.href);
        onClose();
        break;
      case 'field':
        if (fix.field && focusField(fix.field)) onClose();
        // If the field is not on screen the dialog stays open, so the list of
        // what is wrong is still readable — and says so, rather than leaving a
        // button that appears to do nothing.
        else setUnreachable(fix.field ?? null);
        break;
      case 'retry':
        onRetry?.();
        break;
      default:
        onClose();
    }
  };

  const tone = blocker.severity === 'warn'
    ? { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-900', icon: 'text-amber-600' }
    : { bar: 'bg-red-500', chip: 'bg-red-100 text-red-900', icon: 'text-red-600' };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocker-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className={`h-1.5 w-full ${tone.bar}`} />

        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-lg p-1.5 ${tone.chip}`}>
              <AlertTriangle className={`h-5 w-5 ${tone.icon}`} />
            </div>
            <div>
              <h2 id="blocker-title" className="text-lg font-bold text-gray-900">{blocker.title}</h2>
              <p className="mt-1 text-sm text-gray-700">{blocker.why}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* What exactly is wrong. Listed in full, so nobody has to press submit
            again to discover the second thing. */}
        {blocker.fields.length > 0 && (
          <ul className="mx-5 mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {blocker.fields.slice(0, 8).map((f, i) => (
              <li key={`${f.name ?? f.label}-${i}`} className="flex items-start gap-2 px-3 py-2">
                <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="text-sm">
                  <span className="font-semibold text-gray-900">{f.label}</span>
                  <span className="text-gray-600"> — {f.message}</span>
                </span>
                {f.name && (
                  <button
                    type="button"
                    onClick={() => {
                      if (focusField(f.name!)) onClose();
                      else setUnreachable(f.name!);
                    }}
                    className="ml-auto shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Go to it
                  </button>
                )}
              </li>
            ))}
            {blocker.fields.length > 8 && (
              <li className="px-3 py-2 text-xs text-gray-500">
                and {blocker.fields.length - 8} more
              </li>
            )}
          </ul>
        )}

        {/* What can be done about it. */}
        <div className="space-y-2 px-5 py-4">
          {blocker.fixes.map((fix, i) => {
            const primary = i === 0;
            return (
              <button
                key={`${fix.kind}-${i}`}
                type="button"
                onClick={() => run(fix)}
                disabled={fix.kind === 'retry' && retrying}
                className={`w-full rounded-lg border px-4 py-2.5 text-left transition disabled:opacity-60 ${
                  primary
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {fix.kind === 'retry' && retrying
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : fix.kind === 'retry' ? <RefreshCw className="h-4 w-4" />
                    : fix.kind === 'go' ? <ArrowRight className="h-4 w-4" />
                    : null}
                  {fix.kind === 'retry' && retrying ? 'Trying again…' : fix.label}
                </span>
                {fix.detail && (
                  <span className={`mt-0.5 block text-xs ${primary ? 'text-blue-100' : 'text-gray-600'}`}>
                    {fix.detail}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {unreachable && (
          <p className="mx-5 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            That field is not on this part of the form — it is in a section that
            is collapsed or on an earlier step. Close this and look for
            “{humaniseField(unreachable)}”.
          </p>
        )}

        <p className="border-t border-gray-200 px-5 py-2.5 text-xs text-gray-500">
          Nothing you typed has been lost — the form is still behind this.
        </p>
      </div>
    </div>
  );
}
