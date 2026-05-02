'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ONBOARDING_ROLES, prefixForRole } from '@/lib/onboarding-roles';

const ROLES = ONBOARDING_ROLES;

const DEPARTMENTS = [
  'Theatre / Operating Rooms',
  'Anaesthesia',
  'Surgery (General)',
  'Surgery (Orthopaedic)',
  'Surgery (Paediatric)',
  'Surgery (Cardiothoracic)',
  'Surgery (Neuro)',
  'Surgery (Plastic / Reconstructive)',
  'Surgery (ENT)',
  'Surgery (Ophthalmic)',
  'Surgery (Urology)',
  'Surgery (Maxillofacial)',
  'Obstetrics & Gynaecology',
  'Recovery / PACU',
  'CSSD / Sterile Services',
  'Holding Area',
  'Theatre Stores',
  'Cleaning Services',
  'Porter Services',
  'Pharmacy',
  'Blood Bank',
  'IT / Systems',
  'Administration',
  'Other',
];

const TITLES = ['', 'Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Engr.', 'Pharm.', 'Nurse'];

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE    = /^(0\d{10}|\+234\d{10})$/;

type FormState = {
  title: string;
  fullName: string;
  username: string;
  email: string;
  role: string;
  phoneNumber: string;
  department: string;
  staffCode: string;
  staffId: string;
  notes: string;
  isContractStaff: boolean;
};

const EMPTY: FormState = {
  title: '', fullName: '', username: '', email: '', role: '',
  phoneNumber: '', department: '', staffCode: '', staffId: '', notes: '',
  isContractStaff: false,
};

export default function StaffOnboardingPage() {
  const [data, setData] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [staffCodeLoading, setStaffCodeLoading] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setData(prev => ({ ...prev, [k]: v }));

  // Auto-generate staff code whenever the role changes (the user can still edit it)
  useEffect(() => {
    if (!data.role) return;
    const prefix = prefixForRole(data.role);
    if (!prefix) return;
    // Don't override if user has already typed a code with the correct prefix manually
    if (data.staffCode && data.staffCode.startsWith(prefix)) return;
    let cancelled = false;
    setStaffCodeLoading(true);
    fetch(`/api/onboarding/staff-code?role=${encodeURIComponent(data.role)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json?.code) return;
        setData(prev => ({ ...prev, staffCode: json.code }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStaffCodeLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.role]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!data.fullName.trim()) errs.fullName = 'Required';
    if (!data.username.trim()) errs.username = 'Required';
    else if (!USERNAME_RE.test(data.username.trim().toLowerCase()))
      errs.username = '3–30 chars; lowercase letters, digits, dot or underscore';
    if (!data.role) errs.role = 'Please choose a role';
    if (data.email && !EMAIL_RE.test(data.email.trim()))
      errs.email = 'Looks invalid';
    if (data.phoneNumber && !PHONE_RE.test(data.phoneNumber.trim()))
      errs.phoneNumber = 'Use 11 digits starting with 0, or +234XXXXXXXXXX';
    if (!data.isContractStaff && !data.staffId.trim())
      errs.staffId = 'Staff ID is required (tick "Contract staff" if you have none)';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!validate()) {
      setErrorMsg('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          username: data.username.trim().toLowerCase(),
          email: data.email.trim(),
          fullName: data.fullName.trim(),
          phoneNumber: data.phoneNumber.trim(),
          staffCode: data.staffCode.trim(),
          staffId: data.staffId.trim(),
          isContractStaff: data.isContractStaff,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(
          (json.details && Array.isArray(json.details) ? json.details.join(' • ') : null) ||
          json.error || 'Submission failed'
        );
      } else {
        setSubmitted(true);
        setData(EMPTY);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setErrorMsg(null);
    setFieldErrors({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-amber-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white rounded-full p-3 shadow-md mb-4">
            <Image src="/logo.png" alt="UNTH ORM" width={80} height={80} className="rounded-full" />
          </div>
          <h1 className="text-3xl font-bold text-blue-900">UNTH Operative Resource Manager</h1>
          <p className="text-amber-700 font-semibold mt-1">Staff Onboarding Form</p>
          <p className="text-gray-600 text-sm mt-3 max-w-xl mx-auto">
            Please complete the form below so the ORM administrator can create your login account.
            Your initial password will be the same as your username and you will be required to
            change it the first time you sign in.
          </p>
        </div>

        {/* Call-to-action banner */}
        <div className="mb-8 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-blue-50 shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-amber-600 px-5 py-3 text-white text-center font-bold tracking-wide uppercase text-sm">
            🚨 Action required within 72 hours 🚨
          </div>
          <div className="p-5 md:p-6 space-y-3 text-gray-800">
            <p className="text-base md:text-lg leading-relaxed">
              <span className="font-semibold text-blue-900">Welcome to the new UNTH Operative Resource Manager (ORM)!</span>{' '}
              This is your one-stop digital theatre — every surgery, every roster, every store
              item, every patient handover, all in one place. To get you on the system, we need
              just a few minutes of your time.
            </p>

            <div className="rounded-lg bg-white border border-amber-200 p-4">
              <p className="font-semibold text-amber-800 mb-1">⏰ Deadline: 72 hours from today</p>
              <p className="text-sm text-gray-700">
                Please complete this form within the next <span className="font-bold">72 hours</span>.
                Accounts not registered in time may delay your access when the system goes fully live.
              </p>
            </div>

            <div className="rounded-lg bg-white border border-blue-200 p-4">
              <p className="font-semibold text-blue-800 mb-1">📣 Help us reach everyone</p>
              <p className="text-sm text-gray-700">
                Kindly <span className="font-bold">share this link</span> with every theatre user
                you know — surgeons, anaesthetists, scrub &amp; recovery nurses, anaesthetic
                technicians, store keepers, porters, cleaners, biomedical engineers, CSSD,
                laundry, plumbing, water-supply, oxygen-unit and works staff, pharmacy, blood
                bank and lab colleagues. <span className="italic">Nobody should be left out.</span>
              </p>
            </div>

            <div className="rounded-lg bg-white border border-green-200 p-4">
              <p className="font-semibold text-green-800 mb-1">🎓 Mini-training starts 2nd week of May</p>
              <p className="text-sm text-gray-700">
                Once onboarding closes, a guided <span className="font-semibold">mini-training
                series on how to use the ORM app</span> will commence from the{' '}
                <span className="font-bold">2nd week of May</span>. Sessions will cover daily
                workflows for every role — so register now to secure your seat and your login.
              </p>
            </div>

            <p className="text-center text-sm text-gray-600 italic pt-1">
              Together we make the theatre safer, faster and smarter. Thank you for joining the journey. 🙌
            </p>
          </div>
        </div>

        {submitted ? (
          <div className="bg-white rounded-xl shadow-lg border border-green-200 p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-700 mb-2">Submission received</h2>
            <p className="text-gray-700">
              Thank you. Your details have been recorded. The ORM administrator will activate
              your account shortly. You will be able to log in with your chosen username; initial
              password is the same as the username (you will be forced to change it).
            </p>
            <button
              onClick={reset}
              className="mt-6 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Submit another staff member
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 md:p-8 space-y-5">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                {errorMsg}
              </div>
            )}

            <SectionHeader>Personal details</SectionHeader>

            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Title">
                <select
                  aria-label="Title"
                  className={selectCls}
                  value={data.title}
                  onChange={e => set('title', e.target.value)}
                >
                  {TITLES.map(t => <option key={t} value={t}>{t || '— select —'}</option>)}
                </select>
              </Field>
              <Field label="Full name *" error={fieldErrors.fullName} className="md:col-span-2">
                <input
                  className={inputCls}
                  value={data.fullName}
                  onChange={e => set('fullName', e.target.value)}
                  placeholder="As printed on hospital ID"
                  required
                  maxLength={120}
                />
              </Field>
            </div>

            <SectionHeader>Account credentials</SectionHeader>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Username *" error={fieldErrors.username}
                hint="Lowercase letters, digits, '.' or '_' (3–30). Example: ngozi.mba">
                <input
                  className={inputCls}
                  value={data.username}
                  onChange={e => set('username', e.target.value.toLowerCase())}
                  placeholder="ngozi.mba"
                  pattern="[a-z0-9._]{3,30}"
                  required
                  maxLength={30}
                />
              </Field>
              <Field label="Email" error={fieldErrors.email} hint="Optional but recommended for password reset">
                <input
                  type="email"
                  className={inputCls}
                  value={data.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="name@unth.example"
                  maxLength={160}
                />
              </Field>
            </div>

            <SectionHeader>Role &amp; department</SectionHeader>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Role *" error={fieldErrors.role}>
                <select aria-label="Role" className={selectCls} value={data.role} onChange={e => set('role', e.target.value)} required>
                  <option value="">— select your role —</option>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Department">
                <select aria-label="Department" className={selectCls} value={data.department} onChange={e => set('department', e.target.value)}>
                  <option value="">— select department —</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>

            <SectionHeader>Identifiers</SectionHeader>

            <div className="grid md:grid-cols-2 gap-4">
              <Field
                label="Staff Code (auto-generated)"
                error={fieldErrors.staffCode}
                hint={
                  data.role
                    ? staffCodeLoading
                      ? 'Generating next available code…'
                      : 'Auto-generated from your selected role. You don\u2019t need to change this.'
                    : 'Pick a role above and a code will be generated automatically.'
                }
              >
                <input
                  className={inputCls + ' bg-gray-50 font-mono tracking-wider'}
                  value={data.staffCode}
                  readOnly
                  placeholder="— select role first —"
                  aria-readonly="true"
                />
              </Field>
              <Field
                label={data.isContractStaff ? 'Staff ID' : 'Staff ID *'}
                error={fieldErrors.staffId}
                hint={
                  data.isContractStaff
                    ? 'Not required for contract staff.'
                    : 'Hospital employee number — required for permanent staff.'
                }
              >
                <input
                  className={inputCls + (data.isContractStaff ? ' bg-gray-50' : '')}
                  value={data.staffId}
                  onChange={e => set('staffId', e.target.value)}
                  placeholder="e.g. EMP001234"
                  required={!data.isContractStaff}
                  disabled={data.isContractStaff}
                  maxLength={60}
                />
              </Field>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 text-amber-600"
                checked={data.isContractStaff}
                onChange={e => {
                  const checked = e.target.checked;
                  setData(prev => ({
                    ...prev,
                    isContractStaff: checked,
                    staffId: checked ? '' : prev.staffId,
                  }));
                }}
              />
              <div>
                <span className="block text-sm font-medium text-amber-900">
                  I am a contract staff (no hospital Staff ID)
                </span>
                <span className="block text-xs text-amber-700 mt-0.5">
                  Tick this only if you do not yet have a permanent UNTH employee number.
                </span>
              </div>
            </label>

            <SectionHeader>Contact</SectionHeader>

            <Field label="Phone number" error={fieldErrors.phoneNumber}
              hint="Nigerian mobile: 11 digits starting with 0, or +234XXXXXXXXXX (optional)">
              <input
                type="tel"
                className={inputCls}
                value={data.phoneNumber}
                onChange={e => set('phoneNumber', e.target.value)}
                placeholder="08012345678"
                maxLength={20}
              />
            </Field>

            <Field label="Notes for the administrator (optional)">
              <textarea
                className={inputCls + ' min-h-[80px]'}
                value={data.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Anything we should know? (Specialty, shift, etc.)"
                maxLength={500}
              />
            </Field>

            <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <p className="text-xs text-gray-500">
                By submitting you confirm the details above are correct.
                Initial password = username. You will be required to change it on first login.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed shadow"
              >
                {submitting ? 'Submitting…' : 'Submit my details'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          University of Nigeria Teaching Hospital, Ituku-Ozalla • Operative Resource Manager
        </p>
      </div>
    </div>
  );
}

// ---- presentational helpers ------------------------------------------------

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const selectCls = inputCls + ' pr-8';

function Field({
  label, hint, error, className, children,
}: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-800 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 border-b border-blue-100 pb-1">
      {children}
    </h3>
  );
}
