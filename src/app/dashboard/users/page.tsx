'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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
                  Status
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
