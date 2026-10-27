'use client';

/**
 * The deposit for a case that has been booked.
 *
 * SHOWN AFTER SCHEDULING, NOT DURING IT. The earlier version of this sat on
 * the booking form and recomputed on every keystroke, which put a money
 * figure in front of a surgeon in the middle of a clinical decision and
 * changed it as they worked. A number that moves is a number nobody can
 * read out to a family.
 *
 * READ BACK FROM THE SERVER, NOT RECOMPUTED HERE. This is the figure that
 * was stored against the case when it was saved — the one the cashier will
 * collect and the one on the record. Recomputing it in the browser would
 * risk showing the patient one number and the cashier another, and the
 * difference would be argued about at a desk with neither party able to
 * check.
 */

import { useEffect, useState } from 'react';
import { Receipt, AlertTriangle } from 'lucide-react';
import { formatNaira, toKobo } from '@/lib/specialNeeds/pricing';

type Deposit = {
  consumableSubtotal: string | null;
  consumableContingency: string | null;
  consumableAmount: string | null;
  pharmacySubtotal: string | null;
  pharmacyAmount: string | null;
  unpricedLineCount?: number | null;
};

const money = (v: string | null | undefined) => {
  const k = toKobo(v ?? null);
  return k == null ? null : formatNaira(k);
};

export default function SavedCaseDeposit({ surgeryId }: { surgeryId: string }) {
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/surgeries/${surgeryId}/deposit`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setDeposit(data.deposit ?? null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surgeryId]);

  // THE CASE IS BOOKED EITHER WAY. A deposit that could not be read is not
  // a reason to put a warning in front of somebody whose booking succeeded;
  // it is on the case record and the cashier reads it from there.
  if (failed || !deposit) return null;

  const consumables = money(deposit.consumableSubtotal);
  const contingency = money(deposit.consumableContingency);
  const drugs = money(deposit.pharmacySubtotal ?? deposit.pharmacyAmount);

  const totalKobo =
    (toKobo(deposit.consumableAmount ?? null) ?? 0) +
    (toKobo(deposit.pharmacyAmount ?? null) ?? 0);

  if (totalKobo === 0 && !deposit.unpricedLineCount) return null;

  const unpriced = Number(deposit.unpricedLineCount ?? 0);

  return (
    <div className="mt-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 text-left">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <Receipt className="h-4 w-4" />
        What this patient will be asked to deposit
      </h3>

      <dl className="space-y-1 text-sm text-indigo-900">
        {consumables && (
          <div className="flex justify-between">
            <dt>Consumables</dt>
            <dd className="whitespace-nowrap">{consumables}</dd>
          </div>
        )}
        {contingency && (
          <div className="flex justify-between">
            <dt>
              Theatre contingency (10%)
              <span className="block text-xs font-normal text-indigo-700">
                Refunded if it is not used during the operation.
              </span>
            </dt>
            <dd className="whitespace-nowrap">{contingency}</dd>
          </div>
        )}
        {drugs && (
          <div className="flex justify-between">
            <dt>Drugs</dt>
            <dd className="whitespace-nowrap">{drugs}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-indigo-300 pt-1 font-semibold">
          <dt>Total deposit</dt>
          <dd className="whitespace-nowrap">{formatNaira(totalKobo)}</dd>
        </div>
      </dl>

      {unpriced > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>This is not the full amount.</strong> {unpriced} item
            {unpriced === 1 ? ' on this case has' : 's on this case have'} no price set, so the
            real deposit is higher. Ask the store or pharmacy to price{' '}
            {unpriced === 1 ? 'it' : 'them'} before the patient is sent to pay.
          </span>
        </p>
      )}
    </div>
  );
}
