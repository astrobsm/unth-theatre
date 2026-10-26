'use client';

/**
 * Loading the hospital's own price list into the catalogue.
 *
 * IT SAYS WHAT IT WILL DO BEFORE IT DOES IT. Pressing this sets what every
 * patient will be asked to deposit, so the counts come first: how many items
 * would be added, how many blank prices filled, and how many prices disagree
 * with what somebody has already set in the app.
 *
 * DISAGREEMENTS ARE NOT SILENTLY RESOLVED. A pharmacist's correction made
 * last week is more current than a spreadsheet exported months ago, so the
 * ordinary action fills blanks and leaves corrections alone. Overwriting is a
 * second, separate press, and the differences are listed first — with who set
 * each one, so the administrator can go and ask them.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { formatNaira, toKobo } from '@/lib/specialNeeds/pricing';

type Preview = {
  list: { total: number; priced: number; unpriced: number; drugs: number; consumables: number };
  catalogue: { total: number; priced: number };
  wouldAdd: number;
  wouldPrice: number;
  wouldDiffer: number;
};

type Difference = {
  itemId: string;
  name: string;
  listPrice: string;
  currentPrice: string;
  pricedByName: string | null;
};

type Result = {
  added: number;
  alreadyPresent: number;
  pricesSet: number;
  pricesAgreed: number;
  pricesDiffering: number;
  pricesOverwritten: number;
  unpricedOnList: number;
  codesStamped: number;
  differences: Difference[];
};

const naira = (v: string) => {
  const k = toKobo(v);
  return k == null ? '—' : formatNaira(k);
};

export default function PriceListImport() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/special-needs/price-list', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) return;
      setPreview(await res.json());
      setDenied(false);
    } catch {
      /* offline — the rest of settings still works */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (denied || !preview) return null;

  const run = async (overwritePrices: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch('/api/special-needs/price-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ overwritePrices }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProblem(data?.error ?? 'Could not load the price list.');
        return;
      }
      setResult(data);
      await load();
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const differences = result?.differences ?? [];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <FileSpreadsheet className="h-5 w-5 text-blue-600" />
        The hospital&apos;s consumable and drug price list
      </h2>

      <p className="mb-4 text-sm text-gray-600">
        {preview.list.total} items from the theatre price list, {preview.list.priced} of them with
        a price. Loading it adds anything the catalogue is missing and fills in prices that have
        not been set. The catalogue currently holds {preview.catalogue.total} items,{' '}
        {preview.catalogue.priced} priced.
      </p>

      <dl className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <dt className="text-xs text-gray-500">Would be added</dt>
          <dd className="text-xl font-semibold text-gray-900">{preview.wouldAdd}</dd>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <dt className="text-xs text-gray-500">Blank prices filled</dt>
          <dd className="text-xl font-semibold text-gray-900">{preview.wouldPrice}</dd>
        </div>
        <div
          className={`rounded-lg p-3 ${preview.wouldDiffer > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}
        >
          <dt className="text-xs text-gray-500">Disagree with the app</dt>
          <dd
            className={`text-xl font-semibold ${
              preview.wouldDiffer > 0 ? 'text-amber-900' : 'text-gray-900'
            }`}
          >
            {preview.wouldDiffer}
          </dd>
        </div>
      </dl>

      {preview.list.unpriced > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {preview.list.unpriced} of the {preview.list.total} items on the list have no price
              on it.
            </strong>{' '}
            They are loaded without one rather than loaded at zero, so a case using them is quoted
            as incomplete instead of quoted too low. The store and pharmacy price them on their own
            pricing screens.
          </span>
        </p>
      )}

      {problem && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{problem}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Load the list, keeping prices already set
        </button>

        {preview.wouldDiffer > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
          >
            <AlertTriangle className="h-4 w-4" />
            Replace {preview.wouldDiffer} price{preview.wouldDiffer === 1 ? '' : 's'} with the
            list&apos;s
          </button>
        )}
      </div>

      {result && (
        <div className="mt-4 rounded-lg border border-gray-200 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Check className="h-4 w-4 text-green-600" />
            Done
          </h3>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>{result.added} item(s) added to the catalogue.</li>
            <li>{result.pricesSet} price(s) set where there was none.</li>
            <li>{result.pricesAgreed} already matched the list.</li>
            {result.pricesOverwritten > 0 && (
              <li className="text-amber-800">
                {result.pricesOverwritten} price(s) replaced with the list&apos;s.
              </li>
            )}
            {result.pricesOverwritten === 0 && result.pricesDiffering > 0 && (
              <li className="text-amber-800">
                {result.pricesDiffering} price(s) disagree and were left as they are.
              </li>
            )}
          </ul>

          {differences.length > 0 && (
            <>
              <h4 className="mt-4 mb-2 text-sm font-semibold text-gray-900">
                {result.pricesOverwritten > 0 ? 'What was replaced' : 'What disagrees'}
              </h4>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
                {differences.slice(0, 60).map((d) => (
                  <li key={d.itemId} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                    <span className="min-w-0 flex-1 break-words">{d.name}</span>
                    <span className="text-gray-500">
                      in the app {naira(d.currentPrice)}
                      {d.pricedByName ? ` (set by ${d.pricedByName})` : ''}
                    </span>
                    <span className="font-medium text-gray-900">
                      on the list {naira(d.listPrice)}
                    </span>
                  </li>
                ))}
              </ul>
              {differences.length > 60 && (
                <p className="mt-2 text-xs text-gray-500">
                  and {differences.length - 60} more.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
