'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, Plus, X } from 'lucide-react';

/**
 * Amending a prescription, with the consequences stated before it happens.
 *
 * The dialog exists to make two things impossible to miss, because both are
 * invisible in the data and both surprise people:
 *
 *   The previous version is kept. Nothing here destroys what pharmacy was
 *   originally asked for, and saying so stops the hesitation that makes people
 *   write a second unrelated prescription instead.
 *
 *   The previous APPROVAL does not carry over. A consultant approved a
 *   particular set of drugs and doses; the amended set has to be approved
 *   again. Discovering that afterwards, when a case is waiting, is how a
 *   feature gets a reputation.
 */

export interface AmendMedication {
  name: string;
  dose: string;
  unit?: string;
  route: string;
  timing?: string;
  frequency?: string;
  notes?: string;
}

/** Mirrors MIN_AMENDMENT_REASON on the server, which is the real gate. */
const MIN_REASON = 12;

/** Statuses where the drugs have already left the pharmacy. */
const ISSUED = ['DISPENSED', 'COLLECTED', 'IN_USE'];

export default function PrescriptionAmendDialog({
  prescriptionId,
  status,
  version,
  patientName,
  initialMedications,
  onClose,
  onAmended,
}: {
  prescriptionId: string;
  status: string;
  version?: number;
  patientName: string;
  initialMedications: AmendMedication[];
  onClose: () => void;
  onAmended: () => void;
}) {
  const [medications, setMedications] = useState<AmendMedication[]>(
    initialMedications.length ? initialMedications : [{ name: '', dose: '', route: '' }],
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const alreadyIssued = ISSUED.includes(String(status).toUpperCase());
  const losesApproval = String(status).toUpperCase() !== 'DRAFT';
  const reasonTooShort = reason.trim().length < MIN_REASON;
  const incomplete = medications.some((m) => !m.name.trim() || !m.dose.trim() || !m.route.trim());

  const update = (i: number, patch: Partial<AmendMedication>) =>
    setMedications((prev) => prev.map((m, x) => (x === i ? { ...m, ...patch } : m)));

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          medications: JSON.stringify(medications),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'The amendment was not saved.');
        return;
      }
      onAmended();
      onClose();
    } catch {
      setError('Could not reach the server. The amendment was not saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Amend prescription</h2>
            <p className="text-sm text-gray-600">
              {patientName}{typeof version === 'number' ? ` · currently version ${version}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Said before the change, not after. */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">The current version is kept, not overwritten.</p>
            <p className="mt-1">
              It stays on the record exactly as prescribed, marked superseded, so Pharmacy
              can always see what it was originally asked for.
            </p>
          </div>

          {losesApproval && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> This will need approving again.
              </p>
              <p className="mt-1">
                The approval on the current version applies to the drugs and doses that were
                approved. It does not carry over to a changed set.
              </p>
            </div>
          )}

          {alreadyIssued && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> These drugs have already left Pharmacy.
              </p>
              <p className="mt-1">
                Tell Pharmacy directly. Do not rely on the status changing on a screen —
                somebody is already holding the previous version.
              </p>
            </div>
          )}

          <div>
            <h3 className="mb-2 font-medium">Medications</h3>
            <div className="space-y-2">
              {medications.map((m, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border p-2 sm:grid-cols-12">
                  <input
                    className="input-field sm:col-span-4" placeholder="Drug"
                    value={m.name} onChange={(e) => update(i, { name: e.target.value })}
                  />
                  <input
                    className="input-field sm:col-span-2" placeholder="Dose"
                    value={m.dose} onChange={(e) => update(i, { dose: e.target.value })}
                  />
                  <input
                    className="input-field sm:col-span-2" placeholder="Unit"
                    value={m.unit ?? ''} onChange={(e) => update(i, { unit: e.target.value })}
                  />
                  <input
                    className="input-field sm:col-span-3" placeholder="Route"
                    value={m.route} onChange={(e) => update(i, { route: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setMedications((prev) => prev.filter((_, x) => x !== i))}
                    className="flex items-center justify-center text-red-600 sm:col-span-1"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMedications((prev) => [...prev, { name: '', dose: '', route: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-700"
            >
              <Plus className="h-4 w-4" /> Add a drug
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Why is this being changed? *
            </label>
            <textarea
              rows={3}
              className="input-field mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rocuronium reduced to 30mg after the weight was corrected."
            />
            <p className="mt-1 text-xs text-gray-500">
              Pharmacy reads this before re-packing. {reasonTooShort && `At least ${MIN_REASON} characters.`}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || reasonTooShort || incomplete || medications.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            title={
              incomplete ? 'Every drug needs a name, a dose and a route'
                : reasonTooShort ? 'Give a reason for the change'
                : 'Save the amendment'
            }
          >
            {saving ? 'Saving…' : 'Save amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}
