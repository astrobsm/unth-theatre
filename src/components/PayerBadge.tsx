'use client';

import { PAYER_BADGE, PAYER_UNSET_PROMPT, type PayerCategory } from '@/lib/payer/categories';

/**
 * Who pays, on a case card.
 *
 * ONE COMPONENT FOR EVERY SURFACE. The case card, the theatre list, the
 * standby list and the case page all show this, and a badge that says NHIA
 * on one screen and "Insured" on another is two facts as far as the reader
 * is concerned. The wording lives in PAYER_BADGE and nothing here invents
 * its own.
 *
 * AN UNSET CATEGORY IS SHOWN, NOT HIDDEN. Every case booked before the
 * question existed carries UNSPECIFIED, and the only way those get fixed is
 * by being visible on the list somebody is already reading. It is drawn in
 * amber rather than grey for the same reason: a quiet badge is a badge
 * nobody acts on.
 */
export default function PayerBadge({
  payer,
  nysc = false,
  schemeId = null,
  size = 'sm',
}: {
  payer: PayerCategory | string | null | undefined;
  nysc?: boolean | null;
  schemeId?: string | null;
  size?: 'sm' | 'xs';
}) {
  const key = (payer ?? 'UNSPECIFIED') as PayerCategory;
  const label = PAYER_BADGE[key] ?? PAYER_BADGE.UNSPECIFIED;
  const unset = !payer || key === 'UNSPECIFIED';
  const text = size === 'xs' ? 'text-[11px]' : 'text-xs';

  const tone = unset
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : key === 'PRIVATE'
      ? 'border-slate-300 bg-slate-50 text-slate-800'
      : 'border-emerald-300 bg-emerald-50 text-emerald-900';

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        title={unset ? PAYER_UNSET_PROMPT : `Payer category: ${label}`}
        className={`inline-flex items-center rounded border px-2 py-0.5 font-semibold ${text} ${tone}`}
      >
        {label}
      </span>
      {nysc && (
        <span className={`inline-flex items-center rounded border border-sky-300 bg-sky-50 px-2 py-0.5 font-semibold text-sky-900 ${text}`}>
          NYSC
        </span>
      )}
      {schemeId && (
        <span className={`inline-flex items-center rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-gray-700 ${text}`}>
          {schemeId}
        </span>
      )}
    </span>
  );
}
