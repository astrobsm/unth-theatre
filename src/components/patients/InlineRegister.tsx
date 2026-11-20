'use client';

// ============================================================
// Registering a patient without leaving the form you are in
// ------------------------------------------------------------
// "Not registered yet" used to offer two free-text boxes and a sentence:
// register them before publishing, then come back and choose them here. So the
// unit typed a name, saved a plan that could not be booked, went to Patients,
// registered, came back, found the plan, opened it, and searched for the folder
// it had just created. Six steps, five of which the app could do.
//
// THE HAZARD THIS CREATES, AND WHAT IS DONE ABOUT IT. A register button inside
// another form is a duplicate-folder machine: the person is mid-thought about
// an operation, not about whether this patient already exists, and a second
// folder for one patient is the worst record a hospital can hold — two sets of
// results, two sets of allergies, and a theatre list that names one of them.
//
// So this does not register and ask questions afterwards. It runs the SAME
// near-match check the registration desk runs, shows what it found, and offers
// the existing folder first. Where the match is strong it will not register at
// all until somebody says in as many words that these are two different people.
//
// WHAT IT ASKS FOR is what the patients table actually requires and nothing
// more: a name, one number, an age, a sex and a ward. The risk assessments, the
// medications and the comorbidities belong to the pre-operative review and are
// not needed to book a case — asking for them here would turn a two-minute
// planning job into the full registration form, which is the thing being
// avoided.
// ============================================================

import { useState } from 'react';
import { UserPlus, AlertTriangle, Check } from 'lucide-react';
import { AGE_UNITS, formatAge } from '@/lib/age';
import {
  NUMBER_KIND_LABEL,
  guessNumberKind,
  splitPatientNumbers,
  missingNumberProblem,
  sameNumberTwice,
  type PatientNumberKind,
} from '@/lib/patients/patientNumber';

export interface RegisteredPatient {
  id: string;
  name: string;
  folderNumber?: string | null;
  ptNumber?: string | null;
}

interface NearMatch {
  patient: {
    id: string;
    name: string;
    folderNumber?: string | null;
    ptNumber?: string | null;
    age?: number | null;
    ageUnit?: string | null;
    gender?: string | null;
    ward?: string | null;
  };
  level: 'exact' | 'strong' | 'possible';
  reasons: string[];
}

const GENDERS = ['Male', 'Female', 'Other'];

export default function InlineRegister({
  initialName = '',
  initialNumber = '',
  onRegistered,
  onCancel,
}: {
  initialName?: string;
  initialNumber?: string;
  /** Called with the patient to attach — newly made, or an existing folder. */
  onRegistered: (p: RegisteredPatient) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [typed, setTyped] = useState(initialNumber);
  const [kind, setKind] = useState<PatientNumberKind>(guessNumberKind(initialNumber));
  const [other, setOther] = useState('');
  const [age, setAge] = useState('');
  const [ageUnit, setAgeUnit] = useState('YEARS');
  const [gender, setGender] = useState('');
  const [ward, setWard] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [matches, setMatches] = useState<NearMatch[] | null>(null);
  const [held, setHeld] = useState(false);
  const [confirmedDifferent, setConfirmedDifferent] = useState(false);

  const numbers = splitPatientNumbers({ typed, kind, other });
  const sameTwice = sameNumberTwice(numbers);

  /** Everything the patients table insists on, in the order it is asked. */
  const localProblem = (): string | null => {
    if (!name.trim()) return 'The patient needs a name.';
    const n = missingNumberProblem(numbers);
    if (n) return n;
    const years = Number(age);
    if (!age.trim() || !Number.isFinite(years) || years <= 0 || !Number.isInteger(years)) {
      return 'Give the age as a whole number, and choose the unit — days, weeks, months or years.';
    }
    if (!gender) return 'Choose the sex.';
    if (!ward.trim()) return 'Which ward is the patient on?';
    return null;
  };

  const register = async () => {
    const local = localProblem();
    if (local) { setProblem(local); return; }

    setBusy(true);
    setProblem('');
    try {
      // THE SAME CHECK THE REGISTRATION DESK RUNS. A register button inside
      // another form is a duplicate-folder machine unless this happens first.
      if (!confirmedDifferent) {
        const dup = await fetch('/api/patients/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            folderNumber: numbers.folderNumber ?? '',
            ptNumber: numbers.ptNumber ?? '',
            age: Number(age),
            ageUnit,
          }),
        });
        if (dup.ok) {
          const d = await dup.json();
          const found: NearMatch[] = Array.isArray(d?.matches) ? d.matches : [];
          if (found.length > 0) {
            setMatches(found);
            setHeld(!!d?.hold);
            // A strong match stops here until somebody says these are two
            // different people. A weaker one is shown and does not block.
            if (d?.hold) {
              setProblem('This looks like somebody already registered. Use their folder, or say these are different people.');
              return;
            }
          }
        }
        // A failed duplicate check never blocks a registration: the desk's own
        // unique constraints still stand, and refusing to register because a
        // warning could not be computed would be a worse failure than the one
        // it is guarding against.
      }

      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          folderNumber: numbers.folderNumber,
          ptNumber: numbers.ptNumber,
          age: Number(age),
          ageUnit,
          gender,
          ward: ward.trim(),
          phoneNumber: phoneNumber.trim() || null,
          // What the route asks for to go ahead past its own near-match
          // guard. Sent only once somebody has said in as many words that
          // these are two different people.
          ...(confirmedDifferent ? { allowDuplicate: true } : {}),
        }),
      });
      const created = await res.json().catch(() => ({}));

      // THE ROUTE IS THE AUTHORITY, not the check above. That one is
      // advisory and runs against this node; the route asks the other
      // database too, because the duplicate that took a case out of theatre
      // on 20 August existed precisely because the check was local-only.
      if (!res.ok) {
        // Exactly this folder already exists. Offer it rather than
        // reporting a refusal: the person wanted a patient attached, and
        // here is the patient.
        if (created?.code === 'DUPLICATE' && created?.patient?.id) {
          setMatches([{ patient: created.patient, level: 'exact', reasons: ['Already registered under this number'] }]);
          setHeld(false);
          setProblem('That number is already registered. Use the folder below.');
          return;
        }
        // Close enough that the route will not create a second one until
        // somebody says these are different people.
        if (created?.code === 'NEAR_DUPLICATE' && Array.isArray(created?.matches)) {
          setMatches(created.matches);
          setHeld(true);
          setProblem(created.error || 'This looks like somebody already registered.');
          return;
        }
        setProblem(created?.error || 'Could not register that patient.');
        return;
      }
      const p = created?.patient ?? created;
      if (!p?.id) {
        setProblem('The patient was saved but came back without an id. Open Patients and choose them.');
        return;
      }
      onRegistered({
        id: p.id, name: p.name, folderNumber: p.folderNumber, ptNumber: p.ptNumber,
      });
    } catch {
      setProblem('A network error stopped this. Nothing was registered.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-blue-200 bg-blue-50/60 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
        <UserPlus className="w-4 h-4" />
        Register the patient
      </p>
      <p className="mt-0.5 text-xs text-blue-800">
        Done here, so the plan can be published without leaving this page.
      </p>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Patient name <span className="text-red-600">*</span>
          </label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Full name, as on the folder"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Patient number <span className="text-red-600">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PatientNumberKind)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
              aria-label="Which number this is"
            >
              {(Object.keys(NUMBER_KIND_LABEL) as PatientNumberKind[]).map((k) => (
                <option key={k} value={k}>{NUMBER_KIND_LABEL[k]}</option>
              ))}
            </select>
            <input
              type="text" value={typed}
              onChange={(e) => { setTyped(e.target.value); setKind(guessNumberKind(e.target.value)); }}
              placeholder="Either one is enough"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              aria-label="Patient number"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            The other number, if you have it
          </label>
          <input
            type="text" value={other} onChange={(e) => setOther(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          {sameTwice && <p className="mt-1 text-xs text-amber-800">{sameTwice}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Age <span className="text-red-600">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number" min="1" value={age} onChange={(e) => setAge(e.target.value)}
              placeholder="Age"
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              aria-label="Age"
            />
            <select
              value={ageUnit} onChange={(e) => setAgeUnit(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
              aria-label="Age unit"
            >
              {AGE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          {/* Days, weeks and months are kept as entered. A baby of 3 months is
              not 3, and every alert limit in recovery is chosen from this. */}
          <p className="mt-1 text-xs text-gray-500">
            {age && Number(age) > 0 ? formatAge(Number(age), ageUnit) : 'A baby of 3 months is not 3 years.'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Sex <span className="text-red-600">*</span>
          </label>
          <select
            value={gender} onChange={(e) => setGender(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            aria-label="Sex"
          >
            <option value="">Choose…</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Ward <span className="text-red-600">*</span>
          </label>
          <input
            type="text" value={ward} onChange={(e) => setWard(e.target.value)}
            placeholder="Where they are now"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone number</label>
          <input
            type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* WHO THIS MIGHT ALREADY BE. Offered before anything is created, with
          the existing folder first: a second folder for one patient is two sets
          of results, two sets of allergies, and a list that names one of them. */}
      {matches && matches.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            {held
              ? 'This looks like somebody who is already registered'
              : 'Somebody similar is already registered'}
          </p>
          <ul className="mt-2 space-y-2">
            {matches.map((m) => (
              <li key={m.patient.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white p-2">
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-gray-900">
                    {m.patient.name}
                    {m.patient.folderNumber ? ` · ${m.patient.folderNumber}` : ''}
                    {m.patient.ptNumber ? ` · ${m.patient.ptNumber}` : ''}
                  </p>
                  <p className="text-gray-600">
                    {formatAge(m.patient.age, m.patient.ageUnit)}
                    {m.patient.gender ? ` · ${m.patient.gender}` : ''}
                    {m.patient.ward ? ` · ${m.patient.ward}` : ''}
                  </p>
                  {m.reasons.length > 0 && (
                    <p className="text-gray-500">{m.reasons.join('; ')}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRegistered({
                    id: m.patient.id,
                    name: m.patient.name,
                    folderNumber: m.patient.folderNumber,
                    ptNumber: m.patient.ptNumber,
                  })}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Check className="w-3.5 h-3.5" /> Use this folder
                </button>
              </li>
            ))}
          </ul>
          {held && (
            <label className="mt-2 flex items-start gap-2 text-xs text-amber-900">
              <input
                type="checkbox"
                checked={confirmedDifferent}
                onChange={(e) => { setConfirmedDifferent(e.target.checked); setProblem(''); }}
                className="mt-0.5"
              />
              <span>
                I have checked, and this is a <strong>different patient</strong>. Register them
                as a new folder.
              </span>
            </label>
          )}
        </div>
      )}

      {problem && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {problem}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={register}
          disabled={busy || (held && !confirmedDifferent)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Registering…' : 'Register and continue'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
