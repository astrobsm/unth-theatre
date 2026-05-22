'use client';

import { useState } from 'react';
import Link from 'next/link';

const PHONE_RE = /^(0\d{10}|\+234\d{10})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Match = {
  username: string;
  fullName: string;
  role: string;
  status?: string;
  staffCode?: string | null;
};

type Method = 'email' | 'phone';

export default function ForgotUsernamePage() {
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pending, setPending] = useState<Match[]>([]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let payload: Record<string, string>;
    if (method === 'email') {
      const cleaned = email.trim().toLowerCase();
      if (!EMAIL_RE.test(cleaned)) {
        setError('Enter the email address you registered with.');
        return;
      }
      payload = { email: cleaned };
    } else {
      const cleaned = phoneNumber.trim().replace(/\s+/g, '');
      if (!PHONE_RE.test(cleaned)) {
        setError('Enter the 11-digit number you registered with (e.g. 08012345678 or +2348012345678).');
        return;
      }
      payload = { phoneNumber: cleaned };
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Lookup failed');
        return;
      }
      if (data.method === 'email') {
        setEmailMessage(data.message);
        setMatches([]);
        setPending([]);
      } else {
        setEmailMessage(null);
        setMatches(data.matches || []);
        setPending(data.pending || []);
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSubmitted(false);
    setMatches([]);
    setPending([]);
    setEmailMessage(null);
    setEmail('');
    setPhoneNumber('');
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-secondary-50 to-primary-100 py-12 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl border border-primary-100">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
            Recover your username
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Forgot the username you registered with? Choose how we should look it up — we&apos;ll
            email it to your registered address, or show it on screen if you use your phone number.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Recovery method">
              <button
                type="button"
                role="tab"
                aria-selected={method === 'email' ? 'true' : 'false'}
                onClick={() => { setMethod('email'); setError(null); }}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition ${
                  method === 'email'
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
                }`}
              >
                By email
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === 'phone' ? 'true' : 'false'}
                onClick={() => { setMethod('phone'); setError(null); }}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition ${
                  method === 'phone'
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
                }`}
              >
                By phone
              </button>
            </div>

            {method === 'email' ? (
              <div>
                <label htmlFor="email" className="label">Registered email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  We&apos;ll email your username(s) to this address if it&apos;s on file.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="phoneNumber" className="label">Phone number</label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  className="input-field"
                  placeholder="08012345678 or +2348012345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must match the number you submitted on the onboarding form.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching…' : method === 'email' ? 'Email me my username' : 'Find my username'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {emailMessage && (
              <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-4 text-sm">
                <p className="font-semibold mb-1">Check your inbox</p>
                <p>{emailMessage}</p>
              </div>
            )}

            {!emailMessage && matches.length === 0 && pending.length === 0 && (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-4 text-sm">
                <p className="font-semibold mb-1">No account found</p>
                <p>
                  We could not find a user registered with that phone number. Double-check the
                  number, or contact your supervisor / the ORM administrator. You can also
                  re-submit the{' '}
                  <Link href="/onboarding" className="underline font-medium">
                    onboarding form
                  </Link>
                  .
                </p>
              </div>
            )}

            {matches.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">
                  Account{matches.length > 1 ? 's' : ''} on file:
                </p>
                {matches.map((m) => (
                  <div
                    key={m.username}
                    className="border border-green-300 bg-green-50 rounded-lg p-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-green-800">Username</p>
                    <p className="text-lg font-mono font-bold text-green-900 break-all">
                      {m.username}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      {m.fullName}{' '}
                      <span className="text-xs text-gray-500">({m.role})</span>
                      {m.staffCode ? (
                        <span className="text-xs text-gray-500"> · {m.staffCode}</span>
                      ) : null}
                    </p>
                    {m.status && m.status !== 'APPROVED' && (
                      <p className="text-xs text-amber-700 mt-1">
                        Status: {m.status} — contact the administrator if you cannot sign in.
                      </p>
                    )}
                    <Link
                      href={`/auth/login?u=${encodeURIComponent(m.username)}`}
                      className="inline-block mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Sign in as {m.username} →
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">
                  Pending administrator approval:
                </p>
                {pending.map((p) => (
                  <div
                    key={p.username}
                    className="border border-blue-300 bg-blue-50 rounded-lg p-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-blue-800">
                      Username submitted
                    </p>
                    <p className="text-lg font-mono font-bold text-blue-900 break-all">
                      {p.username}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      {p.fullName}{' '}
                      <span className="text-xs text-gray-500">({p.role})</span>
                    </p>
                    <p className="text-xs text-blue-800 mt-1">
                      Your account is awaiting administrator approval. You will be able to sign
                      in once your registration is processed.
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={reset} type="button" className="btn-secondary flex-1">
                Search again
              </button>
              <Link href="/auth/login" className="btn-primary flex-1 text-center">
                Back to sign in
              </Link>
            </div>
          </div>
        )}

        <div className="text-center mt-6 pt-6 border-t border-gray-200">
          <Link
            href="/auth/login"
            className="text-sm text-gray-600 hover:text-primary-600"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
