'use client';

/**
 * What this patient will be asked to deposit, shown while the case is
 * still being booked.
 *
 * SHOWN AT BOOKING, NOT AT THE CASHIER. The surgeon choosing a mesh is
 * deciding what a family will be asked to find, usually that afternoon.
 * Putting the figure in front of them while the choice is still open is
 * the whole point: it is the only moment when a cheaper equivalent can be
 * picked, or the family warned early.
 *
 * IT SAYS WHEN IT IS INCOMPLETE. A quote computed over unpriced items is
 * lower than the real cost, and a confident wrong number is worse than an
 * openly partial one — the family raises what they were told, and is then
 * asked for the difference at the theatre door with the patient starved.
 */

import { useMemo } from 'react';
import { Receipt, AlertTriangle } from 'lucide-react';
import { quoteFor, quoteBreakdown, formatNaira, type PriceableLine } from '@/lib/specialNeeds/pricing';
import type { CatalogueItem } from '@/components/SpecialNeedsPicker';

export default function CaseDepositQuote({
  chosen,
  catalogue,
}: {
  chosen: { itemId: string; quantity: number }[];
  catalogue: CatalogueItem[];
}) {
  const quote = useMemo(() => {
    const byId = new Map(catalogue.map((c) => [c.id, c]));
    const lines: PriceableLine[] = chosen.map((c) => {
      const item = byId.get(c.itemId);
      return {
        unitPrice: (item as unknown as { unitPrice?: string | null })?.unitPrice ?? null,
        quantity: c.quantity,
        dispensedByPharmacy: !!item?.dispensedByPharmacy,
        name: item ? `${item.name}${item.size ? ` ${item.size}` : ''}` : 'Unknown item',
      };
    });
    return quoteFor(lines);
  }, [chosen, catalogue]);

  if (chosen.length === 0) return null;

  const rows = quoteBreakdown(quote);

  return (
    <div className="mt-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <Receipt className="h-4 w-4" />
        What this patient will be asked to deposit
      </h3>

      <dl className="space-y-1 text-sm text-indigo-900">
        {rows.map((r) => (
          <div
            key={r.label}
            className={
              /total/i.test(r.label)
                ? 'flex justify-between border-t border-indigo-300 pt-1 font-semibold'
                : 'flex justify-between'
            }
          >
            <dt>
              {r.label}
              {r.note && <span className="block text-xs font-normal text-indigo-700">{r.note}</span>}
            </dt>
            <dd className="whitespace-nowrap">{r.amount}</dd>
          </div>
        ))}
      </dl>

      {!quote.complete && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>This is not the full amount.</strong>{' '}
            {quote.unpricedLines.length} item
            {quote.unpricedLines.length === 1 ? ' has' : 's have'} no price set
            {quote.unpricedLines.length <= 3 ? ` (${quote.unpricedLines.join(', ')})` : ''}, so the
            real deposit is higher. Ask the store or pharmacy to price{' '}
            {quote.unpricedLines.length === 1 ? 'it' : 'them'} before the patient is sent to pay.
          </span>
        </p>
      )}

      <p className="mt-2 text-xs text-indigo-700">
        The contingency is held against anything theatre asks for during the operation and
        refunded if it is not used. The figure updates as items are added above.
      </p>
    </div>
  );
}
