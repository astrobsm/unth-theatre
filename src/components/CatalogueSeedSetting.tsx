'use client';

/**
 * Load the standard special-requirements catalogue.
 *
 * Shows what is already there BEFORE offering the button, because "load the
 * catalogue" means nothing without knowing whether it is empty or already
 * full. An administrator should be able to tell at a glance whether this
 * needs pressing.
 *
 * SAFE TO PRESS TWICE, and it says so. Seeding matches on category, name,
 * size and brand and never deletes, so anything the store keeper or
 * pharmacy added locally survives — that count is shown separately, because
 * it is the part that would be painful to lose and people need to see it is
 * not at risk.
 */

import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';

type Counts = {
  total: number;
  locallyAdded: number;
  standardAvailable: number;
  byCategory: { category: string; count: number }[];
};

const LABELS: Record<string, string> = {
  SUTURE: 'Sutures',
  URETHRAL_CATHETER: 'Urethral catheters',
  DRAIN: 'Drains',
  HAEMOSTATIC_AGENT: 'Haemostatic agents',
  TRACHEOSTOMY_TUBE: 'Tracheostomy tubes',
  MESH: 'Mesh',
  CHEST_TUBE: 'Chest tubes',
  CHEST_DRAIN_BOTTLE: 'Chest drain bottles',
  ANTIBIOTIC: 'Antibiotics',
  SYRINGE: 'Syringes',
  IV_CANNULA: 'IV cannulae',
  GIVING_SET: 'Giving sets',
  PLASTER: 'Plaster and tape',
  GLOVES: 'Gloves',
  WATER_FOR_INJECTION: 'Water for injection',
  BANDAGE: 'Bandages',
  CASTING: 'Casting',
  LOCAL_ANAESTHETIC: 'Local anaesthetic',
  TRANSFUSION_ADJUNCT: 'Transfusion adjuncts',
  OTHER: 'Other',
};

export default function CatalogueSeedSetting() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/special-needs/seed', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) return;
      setCounts(await res.json());
      setDenied(false);
    } catch {
      /* offline; the card shows nothing rather than a wrong number */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Not an administrator, or offline. Say nothing rather than show a button
  // that will refuse.
  if (denied || !counts) return null;

  const seed = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/special-needs/seed', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'bad', text: data?.error ?? 'Could not load the catalogue.' });
        return;
      }
      setMessage({
        kind: 'ok',
        text:
          data.added === 0
            ? 'Already up to date — nothing was missing.'
            : `Added ${data.added} item${data.added === 1 ? '' : 's'}. The catalogue now holds ${data.total}.`,
      });
      await load();
    } catch {
      setMessage({ kind: 'bad', text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  const missing = Math.max(0, counts.standardAvailable - (counts.total - counts.locallyAdded));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Database className="h-5 w-5 text-blue-600" />
        Special requirements catalogue
      </h2>

      <p className="text-sm text-gray-600 mb-4">
        The list of sutures, catheters, drains, gloves and the rest that surgeons choose from
        when booking. Loading the standard catalogue adds the international standard sizes —
        suture gauges, French sizes, needle shapes. It never removes anything.
      </p>

      {counts.total === 0 ? (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">
          The catalogue is empty. Until it is loaded, the special requirements section of the
          booking form has nothing to offer.
        </p>
      ) : (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
            <p className="text-xs text-gray-600">items in the catalogue</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-2xl font-bold text-gray-900">{counts.locallyAdded}</p>
            <p className="text-xs text-gray-600">added here by staff — never removed</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-2xl font-bold text-gray-900">{missing}</p>
            <p className="text-xs text-gray-600">standard items not yet loaded</p>
          </div>
        </div>
      )}

      {counts.byCategory.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-blue-700">
            What is in it, by category
          </summary>
          <ul className="mt-2 grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
            {counts.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between gap-3 border-b border-gray-100 py-1">
                <span>{LABELS[c.category] ?? c.category}</span>
                <span className="font-medium">{c.count}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        type="button"
        onClick={() => void seed()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        {busy
          ? 'Loading…'
          : counts.total === 0
            ? 'Load the standard catalogue'
            : 'Top up the standard catalogue'}
      </button>

      <p className="mt-2 text-xs text-gray-500">
        Safe to press more than once. Nothing is deleted, and items your staff added are left
        exactly as they are.
      </p>

      <p className="mt-2 text-xs text-gray-500">
        Mesh brands and antibiotic brand names are deliberately not included — which products
        can actually be obtained here is a procurement decision, and the store keeper or
        pharmacy adds those through the booking form.
      </p>

      {message && (
        <p
          className={`mt-3 rounded-lg p-3 text-sm ${
            message.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
