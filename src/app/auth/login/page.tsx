'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        // Fetch user session to get role
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const session = await response.json();
          const userRole = session?.user?.role;

          // Role-based navigation
          switch (userRole) {
            case 'ANAESTHETIST':
            case 'NURSE_ANAESTHETIST':
              router.push('/dashboard/surgeries'); // Anesthetists go directly to surgeries
              break;
            case 'SCRUB_NURSE':
            case 'CIRCULATING_NURSE':
              router.push('/dashboard/surgeries'); // Nurses go directly to surgeries
              break;
            case 'SURGEON':
              router.push('/dashboard/surgeries'); // Surgeons go to their surgeries
              break;
            case 'THEATRE_STORE_KEEPER':
              router.push('/dashboard/inventory'); // Store keepers go to inventory
              break;
            case 'HOLDING_AREA_NURSE':
              router.push('/dashboard/holding-area'); // Holding area nurses
              break;
            case 'RECOVERY_ROOM_NURSE':
              router.push('/dashboard/pacu'); // Recovery room nurses go to PACU
              break;
            case 'THEATRE_MANAGER':
            case 'THEATRE_CHAIRMAN':
            case 'ADMIN':
              router.push('/dashboard'); // Managers/admins go to main dashboard
              break;
            default:
              router.push('/dashboard'); // Default to main dashboard
          }
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-secondary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-2xl border border-primary-100">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img 
              src="/logo.png" 
              alt="UNTH Logo" 
              className="logo-large"
              onError={(e) => {
                // Fallback to text if logo doesn't exist
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
            Operative Resource Manager-ORM
          </h1>
          <p className="mt-2 text-sm font-medium text-gray-700">
            University of Nigeria Teaching Hospital
          </p>
          <p className="text-xs text-gray-600 mb-4">Ituku Ozalla</p>
          <div className="h-1 w-20 bg-gradient-to-r from-primary-500 to-secondary-500 mx-auto rounded-full"></div>
          <h2 className="mt-6 text-2xl font-semibold text-gray-800">
            Sign in to your account
          </h2>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
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
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          
          <div className="text-center">
            <Link
              href="/auth/register"
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Don&apos;t have an account? Register here
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
