'use client';

/**
 * Deposits by operative magnitude, and the switch for the deposit notice.
 *
 * Administrators only — the API enforces that too, because a control hidden
 * in the interface is not a control at all.
 *
 * EMPTY AND ZERO ARE DIFFERENT, and the form keeps them different all the
 * way to the database. Empty means nobody has decided yet, and the booking
 * form says so; zero means this category genuinely costs nothing. Collapsing
 * the two would have a cashier collect nothing from a patient because an
 * administrator had not got round to the number yet.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Megaphone } from 'lucide-react';

type Settings = {
  depositNoticeEnabled: boolean;
  depositNoticeText: string;
  minorConsumableFee: string | null;
  intermediateConsumableFee: string | null;
  majorConsumableFee: string | null;
  minorPharmacyFee: string | null;
  intermediatePharmacyFee: string | null;
  majorPharmacyFee: string | null;
  updatedByName?: string | null;
};

const FEES: { key: keyof Settings; label: string; group: 'Consumables' | 'Pharmacy' }[] = [
  { key: 'minorConsumableFee', label: 'Minor', group: 'Consumables' },
  { key: 'intermediateConsumableFee', label: 'Intermediate', group: 'Consumables' },
  { key: 'majorConsumableFee', label: 'Major', group: 'Consumables' },
  { key: 'minorPharmacyFee', label: 'Minor', group: 'Pharmacy' },
  { key: 'intermediatePharmacyFee', label: 'Intermediate', group: 'Pharmacy' },
  { key: 'majorPharmacyFee', label: 'Major', group: 'Pharmacy' },
];

export default function TheatreFeeSettings({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/theatre-settings', { credentials: 'include' });
      if (!res.ok) return;
      const data: Settings = await res.json();
      setSettings(data);
      const d: Record<string, string> = {};
      for (const f of FEES) d[f.key as string] = (data[f.key] as string | null) ?? '';
      setDraft(d);
    } catch {
      /* offline; the card simply shows nothing to edit */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) return null;

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/theatre-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'bad', text: data?.error ?? 'Could not save.' });
        return;
      }
      setSettings(data);
      setMessage({ kind: 'ok', text: 'Saved.' });
    } catch {
      setMessage({ kind: 'bad', text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  const saveFees = () => {
    const patch: Record<string, unknown> = {};
    for (const f of FEES) {
      const raw = (draft[f.key as string] ?? '').trim();
      // '' clears the fee rather than setting it to zero. See the note above.
      patch[f.key as string] = raw === '' ? null : raw;
    }
    void save(patch);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Banknote className="h-5 w-5 text-blue-600" />
        Drug and consumable deposits
      </h2>

      {!canEdit ? (
        <p className="text-sm text-gray-600">
          Only an administrator or the theatre manager can change these.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-4">
            What a patient pays up front, by the size of the operation. Leave a box empty if the
            amount has not been decided — the booking form will say so rather than asking for
            nothing.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {(['Consumables', 'Pharmacy'] as const).map((group) => (
              <div key={group}>
                <h3 className="mb-2 text-sm font-semibold text-gray-800">{group}</h3>
                <div className="space-y-2">
                  {FEES.filter((f) => f.group === group).map((f) => (
                    <label key={f.key as string} className="flex items-center gap-3 text-sm">
                      <span className="w-28 text-gray-700">{f.label}</span>
                      <span className="text-gray-500">&#8358;</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft[f.key as string] ?? ''}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [f.key as string]: e.target.value }))
                        }
                        placeholder="not set"
                        className="w-36 rounded-lg border border-gray-300 px-3 py-1.5"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={saveFees}
            disabled={busy}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save deposits'}
          </button>
        </>
      )}

      {/* ── The notice ─────────────────────────────────────────────────── */}
      <div className="mt-6 border-t pt-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Megaphone className="h-4 w-4 text-amber-600" />
          Deposit notice on the booking and review forms
        </h3>

        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Switched off until you turn it on.</strong> This tells staff the hospital now
          supplies drugs and consumables and that patients must not be given paper prescriptions.
          Turn it on the day that is actually true — announcing it early sends a patient away with
          nothing to buy and nothing issued.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
          {settings.depositNoticeText}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => void save({ depositNoticeEnabled: !settings.depositNoticeEnabled })}
            disabled={busy}
            className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              settings.depositNoticeEnabled
                ? 'bg-gray-700 hover:bg-gray-800'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {settings.depositNoticeEnabled ? 'Turn the notice off' : 'Turn the notice on'}
          </button>
        )}

        <p className="mt-2 text-xs text-gray-500">
          Currently <strong>{settings.depositNoticeEnabled ? 'shown' : 'hidden'}</strong>
          {settings.updatedByName ? ` — last changed by ${settings.updatedByName}` : ''}.
        </p>
      </div>

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
