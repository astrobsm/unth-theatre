'use client';

/**
 * Public Patient Feedback — shareable link.
 *
 * Open to anyone (no auth). Patients and their relatives share their experience
 * during the surgical journey. Reached via a public link and QR code.
 *
 * Live at: /feedback  (e.g. https://unth-theatre-mai.vercel.app/feedback)
 */

import { useState } from 'react';
import { Heart, Star, CheckCircle2, Loader2, Send } from 'lucide-react';

const JOURNEY_STAGES = [
  'Admission / Registration',
  'Pre-operative (ward / holding area)',
  'Surgery / Theatre',
  'Recovery (PACU)',
  'Post-operative ward',
  'Discharge',
  'Whole journey',
];

const RELATIONSHIPS = ['Patient', 'Relative', 'Caregiver', 'Friend'];

type Ratings = {
  overallRating: number;
  staffCourtesyRating: number;
  cleanlinessRating: number;
  waitTimeRating: number;
  communicationRating: number;
  painManagementRating: number;
};

const RATING_FIELDS: { key: keyof Ratings; label: string }[] = [
  { key: 'overallRating', label: 'Overall experience' },
  { key: 'staffCourtesyRating', label: 'Staff courtesy & care' },
  { key: 'cleanlinessRating', label: 'Cleanliness of the environment' },
  { key: 'waitTimeRating', label: 'Waiting time' },
  { key: 'communicationRating', label: 'Communication & information' },
  { key: 'painManagementRating', label: 'Pain management & comfort' },
];

function StarRow({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? 0 : n)}
            aria-label={`${label}: ${n} star${n > 1 ? 's' : ''}`}
            className="p-0.5"
          >
            <Star
              className={`w-6 h-6 ${
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PatientFeedbackPage() {
  const [ratings, setRatings] = useState<Ratings>({
    overallRating: 0,
    staffCourtesyRating: 0,
    cleanlinessRating: 0,
    waitTimeRating: 0,
    communicationRating: 0,
    painManagementRating: 0,
  });
  const [patientName, setPatientName] = useState('');
  const [folderNumber, setFolderNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [relationship, setRelationship] = useState('Patient');
  const [journeyStage, setJourneyStage] = useState('Whole journey');
  const [whatWentWell, setWhatWentWell] = useState('');
  const [whatToImprove, setWhatToImprove] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const setRating = (key: keyof Ratings, v: number) =>
    setRatings((r) => ({ ...r, [key]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const hasContent =
      ratings.overallRating > 0 || whatWentWell.trim() || whatToImprove.trim();
    if (!hasContent) {
      setError('Please give a star rating or tell us about your experience.');
      return;
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        patientName: patientName.trim() || undefined,
        folderNumber: folderNumber.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        relationship: relationship || undefined,
        journeyStage: journeyStage || undefined,
        whatWentWell: whatWentWell.trim() || undefined,
        whatToImprove: whatToImprove.trim() || undefined,
        wouldRecommend: wouldRecommend ?? undefined,
        source: 'link',
      };
      for (const f of RATING_FIELDS) {
        if (ratings[f.key] > 0) payload[f.key] = ratings[f.key];
      }

      const res = await fetch('/api/feedback/patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not submit feedback. Please try again.');
      }
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 max-w-md text-center">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank you!</h1>
          <p className="text-gray-600">
            Your feedback has been received. It helps us improve care for every patient at the
            UNTH Theatre Complex.
          </p>
          <button
            onClick={() => {
              setDone(false);
              setRatings({
                overallRating: 0,
                staffCourtesyRating: 0,
                cleanlinessRating: 0,
                waitTimeRating: 0,
                communicationRating: 0,
                painManagementRating: 0,
              });
              setPatientName('');
              setFolderNumber('');
              setPhoneNumber('');
              setWhatWentWell('');
              setWhatToImprove('');
              setWouldRecommend(null);
            }}
            className="mt-6 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-3">
            <Heart className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Share Your Experience</h1>
          <p className="text-gray-600 mt-1 text-sm">
            University of Nigeria Teaching Hospital (UNTH) — Theatre Complex
          </p>
          <p className="text-gray-500 mt-2 text-sm max-w-lg mx-auto">
            Your honest feedback about your surgical journey helps us serve you and other
            patients better. It is anonymous unless you choose to share your details.
          </p>
        </header>

        <form
          onSubmit={submit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6"
        >
          {/* Who is giving feedback */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="relationship" className="block text-sm font-medium text-gray-700 mb-1">
                I am the…
              </label>
              <select
                id="relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="input-field"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="journey" className="block text-sm font-medium text-gray-700 mb-1">
                Which part of the journey?
              </label>
              <select
                id="journey"
                value={journeyStage}
                onChange={(e) => setJourneyStage(e.target.value)}
                className="input-field"
              >
                {JOURNEY_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ratings */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">How would you rate…</h2>
            <div className="rounded-lg border border-gray-100 px-3">
              {RATING_FIELDS.map((f) => (
                <StarRow
                  key={f.key}
                  label={f.label}
                  value={ratings[f.key]}
                  onChange={(v) => setRating(f.key, v)}
                />
              ))}
            </div>
          </div>

          {/* Free text */}
          <div>
            <label htmlFor="went-well" className="block text-sm font-medium text-gray-700 mb-1">
              What went well?
            </label>
            <textarea
              id="went-well"
              value={whatWentWell}
              onChange={(e) => setWhatWentWell(e.target.value)}
              rows={3}
              placeholder="Tell us what you appreciated…"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="improve" className="block text-sm font-medium text-gray-700 mb-1">
              What can we improve?
            </label>
            <textarea
              id="improve"
              value={whatToImprove}
              onChange={(e) => setWhatToImprove(e.target.value)}
              rows={3}
              placeholder="Tell us how we can serve you better…"
              className="input-field"
            />
          </div>

          {/* Recommend */}
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              Would you recommend our theatre services to others?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWouldRecommend(true)}
                className={`px-4 py-2 rounded-lg text-sm border ${
                  wouldRecommend === true
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setWouldRecommend(false)}
                className={`px-4 py-2 rounded-lg text-sm border ${
                  wouldRecommend === false
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {/* Optional identity */}
          <details className="rounded-lg bg-gray-50 border border-gray-100 p-4">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">
              Add your details (optional)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label htmlFor="pname" className="block text-xs font-medium text-gray-600 mb-1">
                  Name
                </label>
                <input
                  id="pname"
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="folder" className="block text-xs font-medium text-gray-600 mb-1">
                  Folder / PT number
                </label>
                <input
                  id="folder"
                  type="text"
                  value={folderNumber}
                  onChange={(e) => setFolderNumber(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="phone" className="block text-xs font-medium text-gray-600 mb-1">
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </details>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center justify-center text-sm font-medium disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Submit feedback
          </button>
          <p className="text-center text-xs text-gray-400">
            Your privacy is respected. Feedback is used only to improve our services.
          </p>
        </form>
      </div>
    </div>
  );
}
