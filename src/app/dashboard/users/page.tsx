'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle, XCircle, Clock, KeyRound, Hash } from 'lucide-react';

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  status: string;
  staffCode: string | null;
  createdAt: string;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [staffCodeUserId, setStaffCodeUserId] = useState<string | null>(null);
  const [newStaffCode, setNewStaffCode] = useState('');
  const [staffCodeLoading, setStaffCodeLoading] = useState(false);

  useEffect(() => {
    if (session?.user.role === 'ADMIN' || session?.user.role === 'THEATRE_MANAGER') {
      fetchUsers();
    }
  }, [session]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}/approve`, {
        method: 'POST',
      });
      if (response.ok) {
        fetchUsers();
        alert('User approved successfully');
      }
    } catch (error) {
      console.error('Failed to approve user:', error);
      alert('Failed to approve user');
    }
  };

  const handleReject = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}/reject`, {
        method: 'POST',
      });
      if (response.ok) {
        fetchUsers();
        alert('User rejected successfully');
      }
    } catch (error) {
      console.error('Failed to reject user:', error);
      alert('Failed to reject user');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !newPassword) return;

    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters long');
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Password reset successfully for user!\n\nNew password: ${newPassword}\n\nPlease share this with the user securely.`);
        setResetUserId(null);
        setNewPassword('');
        fetchUsers();
      } else {
        alert(data.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      alert('Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  const handleAssignStaffCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffCodeUserId || !newStaffCode) return;

    setStaffCodeLoading(true);
    try {
      const response = await fetch(`/api/users/${staffCodeUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffCode: newStaffCode }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Staff code "${newStaffCode}" assigned successfully!`);
        setStaffCodeUserId(null);
        setNewStaffCode('');
        fetchUsers();
      } else {
        alert(data.error || 'Failed to assign staff code');
      }
    } catch (error) {
      console.error('Failed to assign staff code:', error);
      alert('Failed to assign staff code');
    } finally {
      setStaffCodeLoading(false);
    }
  };

  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'THEATRE_MANAGER')) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">You do not have permission to access this page.</p>
      </div>
    );
  }

  const pendingUsers = users.filter(u => u.status === 'PENDING');
  const approvedUsers = users.filter(u => u.status === 'APPROVED');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">User Management</h1>

      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Clock className="w-6 h-6 mr-2 text-yellow-600" />
            Pending Approvals ({pendingUsers.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Role
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.fullName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.email || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => handleApprove(user.id)}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        <CheckCircle className="w-5 h-5 inline" /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(user.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <XCircle className="w-5 h-5 inline" /> Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approved Users */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">All Users</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Staff Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {user.fullName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.staffCode ? (
                      <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-mono">
                        {user.staffCode}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {user.status === 'APPROVED' && (
                      <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">
                        Approved
                      </span>
                    )}
                    {user.status === 'PENDING' && (
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs">
                        Pending
                      </span>
                    )}
                    {user.status === 'REJECTED' && (
                      <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs">
                        Rejected
                      </span>
                    )}
                    {user.resetToken && (
                      <span className="ml-2 px-2 py-1 rounded-full bg-orange-100 text-orange-800 text-xs">
                        Reset Requested
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                    <button
                      onClick={() => {
                        setStaffCodeUserId(user.id);
                        setNewStaffCode(user.staffCode || '');
                      }}
                      className="text-purple-600 hover:text-purple-900"
                      title="Assign/Edit staff code"
                    >
                      <Hash className="w-5 h-5 inline" />
                    </button>
                    <button
                      onClick={() => {
                        setResetUserId(user.id);
                        setNewPassword('');
                      }}
                      className="text-primary-600 hover:text-primary-900"
                      title="Reset user password"
                    >
                      <KeyRound className="w-5 h-5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Code Assignment Modal */}
      {staffCodeUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Assign Staff Code</h3>
            <p className="text-sm text-gray-600 mb-4">
              Staff codes are used by cleaners and porters for quick duty logging.
              Recommended format: CLN001, PRT001, etc.
            </p>
            <form onSubmit={handleAssignStaffCode} className="space-y-4">
              <div>
                <label className="label">Staff Code</label>
                <input
                  type="text"
                  className="input-field font-mono"
                  placeholder="e.g., CLN001 or PRT001"
                  value={newStaffCode}
                  onChange={(e) => setNewStaffCode(e.target.value.toUpperCase())}
                  required
                  maxLength={10}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Must be unique. Leave empty to remove staff code.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={staffCodeLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {staffCodeLoading ? 'Saving...' : 'Save Staff Code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStaffCodeUserId(null);
                    setNewStaffCode('');
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Reset User Password</h3>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This password will be shown once. Make sure to share it securely with the user.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {resetLoading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetUserId(null);
                    setNewPassword('');
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
