'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isOfflineQueued, OFFLINE_SAVED_MESSAGE } from '@/lib/offlineResponse';
import { notify } from '@/lib/notifications';
import { outstandingLabel } from '@/lib/preopRequirements';

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime?: string;
  surgeonName?: string | null;
  /// When the ward was asked to send this patient. Only called-up patients are
  /// offered here, so this is always present.
  calledAt?: string;
  calledFromWard?: string | null;
  /// Comma-separated items deferred at booking, e.g. "CONSENT".
  preopOutstanding?: string | null;
  preopOverrideReason?: string | null;
  preopOverrideByName?: string | null;
  porterName?: string | null;
  patient: {
    id: string;
    name: string;
    folderNumber: string;
    ward?: string | null;
  };
}

interface Summary {
  bookedToday: number;
  calledUp: number;
  alreadyInHolding: number;
  eligible: number;
}

export default function NewHoldingAreaAssessment() {
  const router = useRouter();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSurgeryId, setSelectedSurgeryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchScheduledSurgeries();
  }, []);

  const fetchScheduledSurgeries = async () => {
    try {
      // Today's cases that have been called up from the ward — not every
      // SCHEDULED case ever booked, which is what this used to load.
      const response = await fetch('/api/holding-area/eligible');
      if (response.ok) {
        const data = await response.json();
        setSurgeries(data.eligible ?? []);
        setSummary(data.summary ?? null);
      }
    } catch (error) {
      console.error('Error fetching surgeries:', error);
      setError('Failed to load patients called up for today');
    } finally {
      setLoading(false);
    }
  };

  // Name or folder number. Filtered on the client because the list is one day's
  // cases — a dozen or so — and a round trip per keystroke would be slower than
  // the typing on a theatre tablet.
  const visible = surgeries.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [s.patient?.name ?? '', s.patient?.folderNumber ?? '', s.procedureName]
      .some((f) => f.toLowerCase().includes(q));
  });

  // The consent gate. Booking no longer asks for consent; this is the morning,
  // and this is where it is asked for instead.
  const [consentDeferralNeeded, setConsentDeferralNeeded] = useState(false);
  const [consentDeferralReason, setConsentDeferralReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSurgeryId) {
      setError('Please select a surgery');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedSurgery = surgeries.find(s => s.id === selectedSurgeryId);
      
      const response = await fetch('/api/holding-area', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: selectedSurgeryId,
          patientId: selectedSurgery?.patient.id,
          // Only ever sent once the nurse has been shown the refusal and has
          // written a reason. Empty on the first attempt, by design.
          consentDeferralReason: consentDeferralReason.trim() || undefined,
        })
      });

      if (response.ok) {
        if (isOfflineQueued(response)) {
          notify.success(OFFLINE_SAVED_MESSAGE);
          router.push('/dashboard/holding-area');
          return;
        }
        const assessment = await response.json();
        router.push(`/dashboard/holding-area/${assessment.id}`);
      } else {
        const data = await response.json();
        // No consent on record. Not a dead end — the nurse has a patient in
        // front of her and must be able to act — but she cannot pass it
        // without noticing, and her reason goes on the case.
        if (data.code === 'CONSENT_REQUIRED') setConsentDeferralNeeded(true);
        setError(data.error || 'Failed to create assessment');
      }
    } catch (error) {
      setError('An error occurred while creating the assessment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">New Holding Area Assessment</h1>
        <p className="text-gray-600 mt-2">
          Admit a patient called up for today's list to the holding area for preoperative safety verification
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* The consent deferral. Shown only after the gate has refused once, so
          it is never the path of least resistance — a nurse has to be told
          what is missing before she can decide to proceed without it. */}
      {consentDeferralNeeded && (
        <div className="mb-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4">
          <label
            htmlFor="consentDeferralReason"
            className="block text-sm font-semibold text-amber-900"
          >
            Receiving this patient without a consent on record
          </label>
          <p className="mt-1 text-xs text-amber-800">
            If the consent has just been signed, upload the photograph on the case instead
            and try again — that is the better outcome. If the patient must be received
            now, say why. It is recorded against the case in your name.
          </p>
          <textarea
            id="consentDeferralReason"
            value={consentDeferralReason}
            onChange={(e) => setConsentDeferralReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-amber-300 p-2 text-sm focus:border-amber-500 focus:outline-none"
            placeholder="e.g. Consent signed on the ward, folder on its way; surgeon informed."
          />
          <p className="mt-1 text-xs text-amber-700">
            {consentDeferralReason.trim().length}/10 characters minimum.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-4">
          <label htmlFor="patient-search" className="block text-sm font-medium text-gray-700 mb-2">
            Search patient
          </label>
          <input
            id="patient-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Patient name, folder number or procedure"
            autoComplete="off"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {search.trim() && (
            <p className="mt-1 text-xs text-gray-500">
              {visible.length} of {surgeries.length} matching
            </p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Patient called up for today *
          </label>
          <select
            value={selectedSurgeryId}
            onChange={(e) => setSelectedSurgeryId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
          >
            <option value="">-- Select a patient --</option>
            {visible.map((surgery) => (
              <option key={surgery.id} value={surgery.id}>
                {surgery.patient?.name || 'Unknown Patient'} ({surgery.patient?.folderNumber || 'N/A'})
                {' - '}{surgery.procedureName}
                {surgery.scheduledTime ? ` - ${surgery.scheduledTime}` : ''}
              </option>
            ))}
          </select>

          {/* An empty list has three different causes with three different
              fixes, so it says which one rather than leaving the nurse to
              guess whether the app is broken. */}
          {surgeries.length === 0 && !loading && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {summary && summary.bookedToday === 0 ? (
                <>No surgeries are booked for today.</>
              ) : summary && summary.calledUp === 0 ? (
                <>
                  {summary.bookedToday} case{summary.bookedToday === 1 ? '' : 's'} booked for today, but
                  no patient has been called up yet. Use{' '}
                  <a href="/dashboard/call-for-patient" className="font-semibold underline">
                    Call for Patient
                  </a>{' '}
                  to ask the ward to send someone first.
                </>
              ) : (
                <>
                  Every patient called up today is already in the holding area.
                </>
              )}
            </div>
          )}

          {surgeries.length > 0 && visible.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">
              No patient matches &ldquo;{search.trim()}&rdquo;. {surgeries.length} patient
              {surgeries.length === 1 ? ' is' : 's are'} called up for today.
            </p>
          )}

          {/* Context for the selected patient: which ward they are coming from
              and when they were called. A nurse standing at the door needs to
              know whether to expect them or to chase the porter. */}
          {selectedSurgeryId && (() => {
            const s = surgeries.find((x) => x.id === selectedSurgeryId);
            if (!s) return null;
            return (
              <div className="mt-3 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                <div><strong>Ward:</strong> {s.calledFromWard || s.patient?.ward || 'Not recorded'}</div>
                {s.calledAt && (
                  <div>
                    <strong>Called up:</strong>{' '}
                    {new Date(s.calledAt).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
                {s.porterName && <div><strong>Porter:</strong> {s.porterName}</div>}
                {s.surgeonName && <div><strong>Surgeon:</strong> {s.surgeonName}</div>}

                {/* Deferred at booking and still outstanding. Shown here in red
                    because the holding area is the last point at which somebody
                    can get consent before the patient is anaesthetised. It does
                    NOT block admission — the patient is already at the door and
                    turning them away helps nobody — but it must be impossible to
                    miss. */}
                {s.preopOutstanding && (
                  <div className="mt-2 rounded border-2 border-red-600 bg-red-50 p-2">
                    <p className="text-sm font-extrabold uppercase tracking-wide text-red-800">
                      {outstandingLabel(s.preopOutstanding.split(',')) ?? 'PRE-OP ITEMS OUTSTANDING'}
                    </p>
                    {s.preopOverrideReason && (
                      <p className="mt-1 text-xs text-red-900">
                        Deferred at booking: {s.preopOverrideReason}
                        {s.preopOverrideByName ? ` — ${s.preopOverrideByName}` : ''}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-semibold text-red-900">
                      Obtain this before the patient goes through to theatre.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Patient will be marked as arrived in holding area</li>
            <li>• Safety verification checklist will be initiated</li>
            <li>• You&apos;ll be able to complete the 8-point safety assessment</li>
            <li>• Patient can be cleared for theatre after all checks pass</li>
          </ul>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={submitting || !selectedSurgeryId}
            className="flex-1 bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Creating Assessment...' : 'Admit to Holding Area'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
