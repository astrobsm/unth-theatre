'use client';

import { useState } from 'react';

/**
 * The service-improvement link.
 *
 * A standalone page, outside /dashboard and outside the sign-in wall, so it can
 * be pasted into a departmental WhatsApp group and answered from a phone in a
 * corridor. Everything submitted here lands in the Feedback module alongside
 * feedback given inside the app.
 *
 * The form asks for the CHANGE first and the person last, on purpose. A form
 * that opens by asking who you are reads as a complaints register; one that
 * opens by asking what you would change reads as an invitation, and the name is
 * optional in any case.
 */

const IMPACTS = [
  { value: 'BLOCKS', label: 'It stops me working', hint: 'I cannot complete the task at all' },
  { value: 'SLOWS', label: 'It slows me down', hint: 'I can finish, but it costs time' },
  { value: 'MINOR', label: 'Minor annoyance', hint: 'Worth fixing when convenient' },
  { value: 'IDEA', label: 'An idea for improvement', hint: 'Nothing is broken — this would be better' },
];

const AREAS = [
  'Booking a case',
  'Registering a patient',
  'Consent',
  'Pre-operative review / anaesthesia',
  'Holding area',
  'Pharmacy / prescriptions',
  'Consumables & packs',
  'Theatre list / surgery board',
  'Signing in / accounts',
  'Notifications & announcements',
  'Something else',
];

export default function ImprovePage() {
  const [change, setChange] = useState('');
  const [area, setArea] = useState('');
  const [current, setCurrent] = useState('');
  const [impact, setImpact] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [unit, setUnit] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [category, setCategory] = useState<'APPLICATION' | 'THEATRE_MANAGEMENT'>('APPLICATION');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (change.trim().length < 5) {
      setError('Please describe the change you would like, in as much or as little detail as you wish.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/feedback/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, change, area, current, impact, name, role, unit, website }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Your suggestion could not be sent just now.');
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your suggestion could not be sent just now.');
    } finally {
      setSending(false);
    }
  };

  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 ' +
    'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100';
  const label = 'block text-sm font-semibold text-slate-800';

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">
            ✓
          </div>

          <h1 className="text-center text-2xl font-bold text-slate-900">
            Thank you, sincerely.
          </h1>

          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-slate-700">
            <p>
              Your suggestion has been received and recorded in full. It will be read, and
              it will be worked through — not filed away.
            </p>
            <p>
              We know what it costs to stop in the middle of a working day and write
              something down. You did it anyway, and that is worth more to this hospital
              than it may feel from where you are standing. Almost every improvement made
              to this application came from a colleague who took exactly this trouble.
            </p>
            <p className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 font-medium text-emerald-900">
              You know this work better than any system does. Please keep telling us what
              is wrong with it — and please keep pushing for the change you want to see.
              Safe theatre practice is not built by the people who write the software. It
              is built by the people who use it, and who refuse to accept that
              &ldquo;this is just how it is&rdquo;.
            </p>
            <p>
              You will not always agree with what we build, and you should say so when you
              do not. Your patients are better for it, and so are your colleagues.
            </p>
            <p className="font-medium text-slate-800">
              Thank you for joining the fight for best and safest practice.
            </p>
          </div>

          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setChange(''); setArea(''); setCurrent(''); setImpact('');
              }}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              I have another suggestion
            </button>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
            If something is broken and stopping you right now, send a screenshot on
            WhatsApp to 0803 332 8385 — that reaches somebody faster than this form.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            UNTH Theatre ORM
          </p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight text-slate-900">
            What would you like changed?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-600">
            Tell us the modification you want made to the application. Every suggestion is
            recorded, read, and worked into the list of what gets built next.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {error && (
            <div className="rounded-lg border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="change" className={label}>
              The change you would like <span className="text-red-600">*</span>
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Plainly, in your own words. &ldquo;I want to…&rdquo; is a perfect way to start.
            </p>
            <textarea
              id="change"
              value={change}
              onChange={(e) => setChange(e.target.value)}
              rows={5}
              className={`${field} mt-2`}
              placeholder="e.g. I want to book a case without typing the laboratory results myself."
            />
          </div>

          <div>
            <label htmlFor="area" className={label}>Where in the app?</label>
            <select id="area" value={area} onChange={(e) => setArea(e.target.value)} className={`${field} mt-2`}>
              <option value="">Choose the closest one (optional)</option>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="current" className={label}>What happens at the moment?</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Optional, but it is usually the part that makes a suggestion easy to act on.
            </p>
            <textarea
              id="current"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              rows={3}
              className={`${field} mt-2`}
              placeholder="e.g. The form will not let me continue until every field is filled."
            />
          </div>

          <fieldset>
            <legend className={label}>How much does this cost you?</legend>
            <p className="mt-0.5 text-xs text-slate-500">This is what decides the order things get done in.</p>
            <div className="mt-2 space-y-2">
              {IMPACTS.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    impact === o.value
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="impact"
                    value={o.value}
                    checked={impact === o.value}
                    onChange={(e) => setImpact(e.target.value)}
                    className="mt-1 h-4 w-4 accent-emerald-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{o.label}</span>
                    <span className="block text-xs text-slate-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="category" className={label}>Is this about the app, or about how theatre runs?</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as 'APPLICATION' | 'THEATRE_MANAGEMENT')}
              className={`${field} mt-2`}
            >
              <option value="APPLICATION">The application</option>
              <option value="THEATRE_MANAGEMENT">How the theatre is run</option>
            </select>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">About you</p>
            <p className="mt-0.5 text-xs text-slate-500">
              All optional. A name only helps if we need to ask you what you meant.
            </p>
            <div className="mt-3 space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Name (optional)" aria-label="Your name" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input value={role} onChange={(e) => setRole(e.target.value)} className={field} placeholder="Role, e.g. Registrar" aria-label="Your role" />
                <input value={unit} onChange={(e) => setUnit(e.target.value)} className={field} placeholder="Unit, e.g. GS Unit II" aria-label="Your unit" />
              </div>
            </div>
          </div>

          {/* Honeypot. Hidden from people, irresistible to anything filling every
              field on the page. Not display:none — some bots skip those. */}
          <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send my suggestion'}
          </button>

          <p className="text-center text-xs text-slate-500">
            Goes straight into the Feedback module. You do not need to sign in.
          </p>
        </form>

        <p className="mx-auto mt-6 max-w-md text-center text-xs leading-relaxed text-slate-500">
          If something is broken and stopping you right now, send a screenshot on WhatsApp to
          0803 332 8385 as well — that reaches somebody faster than this form does.
        </p>
      </div>
    </main>
  );
}
