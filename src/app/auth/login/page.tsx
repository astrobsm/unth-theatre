'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCachedData } from '@/lib/offlineStore';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  
  // Quick duty logging states
  const [showDutyPanel, setShowDutyPanel] = useState(false);
  const [dutyAction, setDutyAction] = useState<'cleaning' | 'transport' | 'other' | null>(null);
  const [staffCode, setStaffCode] = useState('');
  const [dutyLoading, setDutyLoading] = useState(false);
  const [dutyMessage, setDutyMessage] = useState('');

  // Offline auto-login: if offline and session is cached, redirect to dashboard
  useEffect(() => {
    const checkOfflineLogin = async () => {
      const offline = !navigator.onLine;
      setIsOffline(offline);

      if (offline) {
        try {
          const cached = await getCachedData<{ user: { role: string } }>('session');
          if (cached?.data?.user) {
            const role = cached.data.user.role;
            // Navigate based on cached role
            switch (role) {
              case 'ANAESTHETIST':
              case 'SCRUB_NURSE':
              case 'SURGEON':
                router.push('/dashboard/surgeries');
                break;
              case 'THEATRE_STORE_KEEPER':
                router.push('/dashboard/inventory');
                break;
              case 'RECOVERY_ROOM_NURSE':
                router.push('/dashboard/pacu');
                break;
              default:
                router.push('/dashboard');
            }
          }
        } catch {
          // No cached session
        }
      }
    };

    checkOfflineLogin();

    window.addEventListener('online', () => setIsOffline(false));
    window.addEventListener('offline', () => setIsOffline(true));
    return () => {
      window.removeEventListener('online', () => setIsOffline(false));
      window.removeEventListener('offline', () => setIsOffline(true));
    };
  }, [router]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // If offline, try cached session
    if (!navigator.onLine) {
      try {
        const cached = await getCachedData<{ user: { role: string } }>('session');
        if (cached?.data?.user) {
          router.push('/dashboard');
          return;
        }
      } catch {}
      setError('You are offline and no cached session is available. Please connect to the internet.');
      setLoading(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Fetch user session to check if password change is required
      const sessionResponse = await fetch('/api/auth/session');
      if (sessionResponse.ok) {
        const session = await sessionResponse.json();
        
        // Check if user must change password
        const userCheckResponse = await fetch(`/api/users/check-first-login`);
        if (userCheckResponse.ok) {
          const userData = await userCheckResponse.json();
          
          if (userData.mustChangePassword || userData.isFirstLogin) {
            setUserId(userData.id);
            setShowChangePassword(true);
            setLoading(false);
            return;
          }
        }

        const userRole = session?.user?.role;

        // Role-based navigation
        switch (userRole) {
          case 'ANAESTHETIST':
          case 'CONSULTANT_ANAESTHETIST':
            router.push('/dashboard/surgeries');
            break;
          case 'SCRUB_NURSE':
            router.push('/dashboard/surgeries');
            break;
          case 'SURGEON':
            router.push('/dashboard/surgeries');
            break;
          case 'THEATRE_STORE_KEEPER':
            router.push('/dashboard/inventory');
            break;
          case 'RECOVERY_ROOM_NURSE':
            router.push('/dashboard/pacu');
            break;
          case 'PHARMACIST':
            router.push('/dashboard/pharmacy');
            break;
          case 'CHIEF_MEDICAL_DIRECTOR':
            router.push('/dashboard/cmd');
            break;
          case 'CMAC':
            router.push('/dashboard/cmac');
            break;
          case 'DC_MAC':
            router.push('/dashboard/dc-mac');
            break;
          case 'LAUNDRY_SUPERVISOR':
            router.push('/dashboard/laundry');
            break;
          case 'CSSD_SUPERVISOR':
            router.push('/dashboard/cssd-supervisor');
            break;
          case 'OXYGEN_UNIT_SUPERVISOR':
            router.push('/dashboard/oxygen-supervisor');
            break;
          case 'WORKS_SUPERVISOR':
            router.push('/dashboard/works');
            break;
          case 'THEATRE_MANAGER':
          case 'THEATRE_CHAIRMAN':
          case 'ADMIN':
            router.push('/dashboard');
            break;
          default:
            router.push('/dashboard');
        }
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPasswordValue !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPasswordValue.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/change-password-first-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPasswordValue }),
      });

      if (response.ok) {
        alert('Password changed successfully! Please log in with your new password.');
        setShowChangePassword(false);
        setNewPasswordValue('');
        setConfirmPassword('');
        router.push('/dashboard');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('An error occurred while changing password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-secondary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-2xl border border-primary-100">
        <div className="text-center">
          {/* Offline Banner */}
          {isOffline && (
            <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg text-sm">
              <strong>You are offline.</strong> If you have previously logged in, you will be redirected automatically.
              Otherwise, please connect to the internet to sign in.
            </div>
          )}

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
          
          <div className="text-center space-y-2">
            <Link
              href="/auth/reset-password"
              className="block text-sm text-gray-600 hover:text-primary-600"
            >
              Forgot your password?
            </Link>
            <Link
              href="/auth/register"
              className="block text-sm text-primary-600 hover:text-primary-700"
            >
              Don&apos;t have an account? Register here
            </Link>
          </div>
        </form>

        {/* Quick Duty Logging Section */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <button
            onClick={() => setShowDutyPanel(!showDutyPanel)}
            className="w-full text-center text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
          >
            {showDutyPanel ? '▲ Hide Quick Duty Logging' : '▼ Quick Duty Logging (Cleaners/Porters)'}
          </button>

          {showDutyPanel && (
            <div className="mt-4 space-y-4">
              {dutyMessage && (
                <div className={`px-4 py-3 rounded ${
                  dutyMessage.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {dutyMessage}
                </div>
              )}

              <div>
                <label className="label text-sm">Staff Code</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  placeholder="Enter your staff code"
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleQuickDutyAction('cleaning', 'start')}
                  disabled={!staffCode || dutyLoading}
                  className="btn-secondary text-xs py-2 disabled:opacity-50"
                >
                  🧹 Start Cleaning
                </button>
                <button
                  onClick={() => handleQuickDutyAction('cleaning', 'end')}
                  disabled={!staffCode || dutyLoading}
                  className="btn-outline text-xs py-2 disabled:opacity-50"
                >
                  ✓ End Cleaning
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleQuickDutyAction('transport', 'start')}
                  disabled={!staffCode || dutyLoading}
                  className="btn-secondary text-xs py-2 disabled:opacity-50"
                >
                  🚑 Start Transport
                </button>
                <button
                  onClick={() => handleQuickDutyAction('transport', 'end')}
                  disabled={!staffCode || dutyLoading}
                  className="btn-outline text-xs py-2 disabled:opacity-50"
                >
                  ✓ End Transport
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleQuickDutyAction('other', 'start')}
                  disabled={!staffCode || dutyLoading}
                  className="btn-secondary text-xs py-2 disabled:opacity-50"
                >
                  📋 Start Other Duty
                </button>
                <button
                  onClick={() => handleQuickDutyAction('other', 'end')}
                  disabled={!staffCode || dutyLoading}
                  className="btn-outline text-xs py-2 disabled:opacity-50"
                >
                  ✓ End Other Duty
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center mt-2">
                Quick logging for cleaners and porters to track work hours
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Password Change Modal for First Login */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Change Your Password</h2>
            <p className="text-sm text-gray-600 mb-6">
              For security reasons, you must change your password before continuing.
              Please choose a strong password with at least 8 characters.
            </p>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  className="input-field"
                  placeholder="Enter new password"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field"
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                />
              </div>
              {error && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full disabled:opacity-50"
              >
                {loading ? 'Changing Password...' : 'Change Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  async function handleQuickDutyAction(
    type: 'cleaning' | 'transport' | 'other',
    action: 'start' | 'end'
  ) {
    setDutyLoading(true);
    setDutyMessage('');

    try {
      let endpoint = '';
      let body: any = { staffCode };

      if (type === 'cleaning') {
        endpoint = `/api/cleaning/${action}`;
        if (action === 'start') {
          const theatreId = prompt('Enter Theatre ID (optional):');
          const cleaningType = prompt('Cleaning Type (e.g., Post-Surgery, Daily):');
          body = { ...body, theatreId, cleaningType };
        }
      } else if (type === 'transport') {
        endpoint = `/api/transport/${action}`;
        if (action === 'start') {
          const patientFolderNumber = prompt('Enter Patient Folder Number:');
          if (!patientFolderNumber) {
            setDutyMessage('Patient folder number is required');
            setDutyLoading(false);
            return;
          }
          const fromLocation = prompt('From Location:');
          const toLocation = prompt('To Location:');
          body = { ...body, patientFolderNumber, fromLocation, toLocation };
        } else {
          const receivedBy = prompt('Received by (name):');
          body = { ...body, receivedBy };
        }
      } else if (type === 'other') {
        endpoint = `/api/duties/${action}`;
        if (action === 'start') {
          const dutyType = prompt('Duty Type (e.g., WASHING_MACINTOSH, EQUIPMENT_STERILIZATION):');
          const location = prompt('Location (optional):');
          body = { ...body, dutyType: dutyType?.toUpperCase(), location };
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        setDutyMessage(`✓ ${data.message}`);
        setStaffCode('');
      } else {
        setDutyMessage(`✗ ${data.error || 'Action failed'}`);
      }
    } catch (error) {
      setDutyMessage('✗ An error occurred');
    } finally {
      setDutyLoading(false);
    }
  }
}
