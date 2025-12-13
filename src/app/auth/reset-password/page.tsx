'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
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
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
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
            <div className="mb-6 bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-6 text-sm">
            <p className="font-medium mb-2">How password reset works:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Enter your username below</li>
              <li>A reset request will be created in the system</li>
              <li>Contact an administrator (Theatre Manager/Chairman)</li>
              <li>The administrator will reset your password</li>
              <li>You&apos;ll receive your new temporary password from the admin</li>
            </ol>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
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
                Enter the username you use to log in
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting Request...' : 'Request Password Reset'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center space-y-2">
            <Link
              href="/auth/login"
              className="block text-sm text-primary-600 hover:text-primary-700"
            >
              ← Back to Login
            </Link>
            <Link
              href="/auth/register"
              className="block text-sm text-gray-600 hover:text-primary-600"
            >
              Don&apos;t have an account? Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
