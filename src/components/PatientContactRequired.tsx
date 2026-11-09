'use client';

/**
 * The number this patient will be reached on, captured at booking.
 *
 * WHY AT BOOKING, and not only on the registration form. The register is filled
 * in once, often by somebody else, often months ago. Booking is the moment the
 * hospital takes on an obligation to this particular person — to tell them when
 * the list slips, when the date moves, and that nobody but a ward nurse or the
 * pharmacist may sell them a list of items. An obligation with no way to reach
 * them is not one that can be kept, and the person standing at the booking
 * screen is the one person who can still ask.
 *
 * It saves to the PATIENT record, not to the booking. The number is a fact
 * about the person, not about this operation, and the next case booked for them
 * should not have to ask again.
 *
 * The next of kin is a real answer, not a lesser one. An elderly patient, a
 * child, somebody admitted unconscious — the number the family answers is the
 * relative's, and a form that insists on "the patient's own" just gets a
 * relative's number typed into the patient's box, where nobody can tell whose
 * phone it is.
 */

import { useEffect, useState } from 'react';
import { Phone, Check, Loader2, AlertTriangle } from 'lucide-react';
import { patientContact, phoneProblem } from '@/lib/patients/contact';

interface Props {
  patientId: string | null;
  patientName?: string | null;
  phoneNumber?: string | null;
  caregiverName?: string | null;
  caregiverPhone?: string | null;
  /** Told whenever reachability changes, so the form can block its own submit. */
  onReachableChange?: (reachable: boolean) => void;
  /** Lets the parent refresh its copy of the patient after a save. */
  onSaved?: (patch: {
    phoneNumber: string | null;
    caregiverName: string | null;
    caregiverPhone: string | null;
  }) => void;
}

export default function PatientContactRequired({
  patientId,
  patientName,
  phoneNumber,
  caregiverName,
  caregiverPhone,
  onReachableChange,
  onSaved,
}: Props) {
  const [phone, setPhone] = useState(phoneNumber ?? '');
  const [carerName, setCarerName] = useState(caregiverName ?? '');
  const [carerPhone, setCarerPhone] = useState(caregiverPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever the chosen patient changes. Without this a number typed for
  // one patient stays in the box for the next, and gets saved onto them.
  useEffect(() => {
    setPhone(phoneNumber ?? '');
    setCarerName(caregiverName ?? '');
    setCarerPhone(caregiverPhone ?? '');
    setSaved(false);
    setError(null);
  }, [patientId, phoneNumber, caregiverName, caregiverPhone]);

  const contact = patientContact({
    name: patientName,
    phoneNumber: phone,
    caregiverName: carerName,
    caregiverPhone: carerPhone,
  });
  const reachable = contact !== null;

  useEffect(() => { onReachableChange?.(reachable); }, [reachable, onReachableChange]);

  // Shown under whichever box has something wrong in it. Only once there IS
  // something in it — an empty form should prompt, not scold.
  const phoneIssue = phone.trim() ? phoneProblem(phone) : null;
  const carerIssue = carerPhone.trim() ? phoneProblem(carerPhone) : null;

  const save = async () => {
    if (!patientId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone.trim() || null,
          caregiverName: carerName.trim() || null,
          caregiverPhone: carerPhone.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? 'That number could not be saved.');
        return;
      }
      setSaved(true);
      onSaved?.({
        phoneNumber: phone.trim() || null,
        caregiverName: carerName.trim() || null,
        caregiverPhone: carerPhone.trim() || null,
      });
    } catch {
      setError('Could not reach the server to save that number.');
    } finally {
      setSaving(false);
    }
  };

  if (!patientId) return null;

  const dirty =
    phone.trim() !== (phoneNumber ?? '').trim()
    || carerName.trim() !== (caregiverName ?? '').trim()
    || carerPhone.trim() !== (caregiverPhone ?? '').trim();

  return (
    <div
      className={`rounded-lg border-2 p-4 ${
        reachable ? 'border-green-300 bg-green-50' : 'border-amber-400 bg-amber-50'
      }`}
    >
      <div className="flex items-start gap-2">
        {reachable
          ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
          : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${reachable ? 'text-green-900' : 'text-amber-900'}`}>
            {reachable
              ? `We can reach ${contact!.ownerLabel} on WhatsApp.`
              : 'A WhatsApp number is needed before this case can be booked.'}
          </p>
          <p className={`mt-0.5 text-xs ${reachable ? 'text-green-800' : 'text-amber-800'}`}>
            {reachable
              ? 'They can be told about a delay, a change of date, and the safety notice about '
                + 'people selling lists of items.'
              : 'Without one the hospital cannot tell this patient about a delay, a new date, or '
                + 'a cancellation. The next of kin’s number is fine if the patient has no phone.'}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-700">
                Patient&apos;s WhatsApp number
              </span>
              <div className="relative mt-1">
                <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
                  placeholder="0803 123 4567"
                  className="input-field pl-8"
                />
              </div>
              {phoneIssue && <span className="mt-1 block text-xs text-red-700">{phoneIssue}</span>}
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-gray-700">
                Next of kin&apos;s number{' '}
                <span className="font-normal text-gray-500">(if the patient has no phone)</span>
              </span>
              <div className="relative mt-1">
                <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  inputMode="tel"
                  value={carerPhone}
                  onChange={(e) => { setCarerPhone(e.target.value); setSaved(false); }}
                  placeholder="0803 765 4321"
                  className="input-field pl-8"
                />
              </div>
              {carerIssue && <span className="mt-1 block text-xs text-red-700">{carerIssue}</span>}
            </label>

            {carerPhone.trim() !== '' && (
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-gray-700">
                  Who answers that phone?
                </span>
                <input
                  type="text"
                  value={carerName}
                  onChange={(e) => { setCarerName(e.target.value); setSaved(false); }}
                  placeholder="e.g. Ngozi Eze, daughter"
                  className="input-field mt-1"
                />
                <span className="mt-1 block text-[11px] text-gray-500">
                  So the person sending a message can see whose phone it is before they send it.
                </span>
              </label>
            )}
          </div>

          {error && (
            <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty || Boolean(phoneIssue) || Boolean(carerIssue)}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {saving
                ? <span className="flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span>
                : 'Save to the patient record'}
            </button>
            {saved && !dirty && (
              <span className="text-xs font-medium text-green-800">
                Saved. It will be there for their next case too.
              </span>
            )}
            {dirty && !saving && (
              <span className="text-xs text-amber-800">Not saved yet.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
