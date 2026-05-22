'use client';

import { useState } from 'react';
import Link from 'next/link';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<'email' | 'username'>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const payload: Record<string, string> = {};
    if (mode === 'email') {
      const cleaned = email.trim().toLowerCase();
      if (!EMAIL_RE.test(cleaned)) {
        setError('Enter the email address registered with your account.');
        return;
      }
      payload.email = cleaned;
    } else {
      if (!username.trim()) {
        setError('Enter your username.');
        return;
      }
      payload.username = username.trim();
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setEmail('');
        setUsername('');
      } else {
        setError(data.error || 'Failed to submit reset request');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-secondary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-2xl border border-primary-100">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="UNTH Logo"
              className="logo-large"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>

          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
            Reset Password
          </h1>
          <p className="mt-2 text-sm font-medium text-gray-700">
            University of Nigeria Teaching Hospital
          </p>
          <p className="text-xs text-gray-600 mb-4">Ituku Ozalla</p>
          <div className="h-1 w-20 bg-gradient-to-r from-primary-500 to-secondary-500 mx-auto rounded-full"></div>
        </div>

        <div className="mt-8">
          {message && (
            <div className="mb-6 bg-green-50 border border-green-400 text-green-800 px-4 py-3 rounded text-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-6 text-sm">
            <p className="font-medium mb-2">How password reset works:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Enter your registered email address (or your username).</li>
              <li>We&apos;ll email a secure reset link valid for 60 minutes.</li>
              <li>Open the link and set a new password (minimum 8 characters).</li>
              <li>Sign in immediately with your new password.</li>
            </ol>
            <p className="text-xs mt-2">
              No email on file? Contact the Theatre Manager / Chairman for an in-person reset.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4" role="tablist" aria-label="Recovery method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'email' ? 'true' : 'false'}
              onClick={() => { setMode('email'); setError(''); }}
              className={`py-2 px-3 rounded-lg text-sm font-medium border transition ${
                mode === 'email'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
              }`}
            >
              By email
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'username' ? 'true' : 'false'}
              onClick={() => { setMode('username'); setError(''); }}
              className={`py-2 px-3 rounded-lg text-sm font-medium border transition ${
                mode === 'username'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
              }`}
            >
              By username
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {mode === 'email' ? (
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
                <p className="mt-1 text-xs text-gray-500">
                  The reset link will be emailed to this address.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="username" className="label">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="input-field"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  The reset link will be emailed to the address on file for this username.
                </p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending reset link…' : 'Email me a reset link'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center space-y-2">
            <Link href="/auth/login" className="block text-sm text-primary-600 hover:text-primary-700">
              ← Back to Login
            </Link>
            <Link href="/auth/forgot-username" className="block text-sm text-gray-600 hover:text-primary-600">
              Forgot your username?
            </Link>
            <Link href="/auth/register" className="block text-sm text-gray-600 hover:text-primary-600">
              Don&apos;t have an account? Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
