'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle, XCircle, Clock, KeyRound, Hash, Upload, Download, UserCog, Phone, FileText, Copy } from 'lucide-react';

const USER_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'LAUNDRY_SUPERVISOR',
  'CSSD_SUPERVISOR', 'OXYGEN_UNIT_SUPERVISOR', 'WORKS_SUPERVISOR',
  'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SCRUB_NURSE',
  'RECOVERY_ROOM_NURSE', 'THEATRE_STORE_KEEPER', 'PORTER',
  'ANAESTHETIC_TECHNICIAN', 'BIOMEDICAL_ENGINEER', 'CLEANER',
  'PROCUREMENT_OFFICER', 'BLOODBANK_STAFF', 'PHARMACIST', 'CSSD_STAFF',
  'POWER_PLANT_OPERATOR', 'THEATRE_CAFETERIA_MANAGER', 'LAUNDRY_STAFF',
  'PLUMBER', 'PLUMBING_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR',
  'EMERGENCY_LAB_SCIENTIST', 'LABORATORY_STAFF', 'HOUSE_OFFICER',
  'CONSUMABLE_PACK_PROVIDER', 'SCRUB_CARE_PROVIDER',
] as const;
import OnboardingSubmissionsPanel from '@/components/OnboardingSubmissionsPanel';
import ContactName from '@/components/ContactName';
// XLSX loaded dynamically when needed (export/import actions)

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  status: string;
  staffCode: string | null;
  phoneNumber: string | null;
  department: string | null;
  createdAt: string;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
}

interface UploadResult {
  created: number;
  errors: any[];
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
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [roleUserId, setRoleUserId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState('');
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    if (session?.user.role === 'ADMIN' || session?.user.role === 'THEATRE_MANAGER') {
      fetchUsers();
      // Auto-refresh every 60 seconds for cross-device sync
      const interval = setInterval(fetchUsers, 60000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error('API returned non-array data:', data);
          setUsers([]);
        }
      } else {
        console.error('Failed to fetch users:', response.status);
        setUsers([]);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
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

  const handleChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleUserId || !newRole) return;

    const target = users.find(u => u.id === roleUserId);
    if (!target) return;
    if (target.role === newRole) {
      alert('Selected role is the same as the current role.');
      return;
    }
    if (!confirm(`Change ${target.fullName || target.username}'s role from ${target.role} to ${newRole}?`)) {
      return;
    }

    setRoleLoading(true);
    try {
      const response = await fetch(`/api/users/${roleUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Role updated to ${newRole} successfully.`);
        setRoleUserId(null);
        setNewRole('');
        fetchUsers();
      } else {
        alert(data.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('Failed to update role');
    } finally {
      setRoleLoading(false);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Transform Excel data to match expected format
      const transformedUsers = jsonData.map((row: any) => ({
        fullName: row['Full Name'] || row['Name'],
        username: row['Username'],
        email: row['Email'] || null,
        role: row['Role'],
        phoneNumber: row['Phone Number'] || row['Phone'] || null,
        department: row['Department'] || null,
        staffCode: row['Staff Code'] || null,
        staffId: row['Staff ID'] || null,
        password: row['Password'] || null, // Optional custom password
      }));

      // Upload to API
      const response = await fetch('/api/users/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: transformedUsers }),
      });

      const result = await response.json();

      if (response.ok) {
        setUploadResult(result);
        fetchUsers(); // Refresh user list
        event.target.value = ''; // Reset file input
      } else {
        alert(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to process Excel file');
    } finally {
      setUploading(false);
    }
  };

  const exportStaffByDepartment = async () => {
    if (users.length === 0) {
      alert('No staff to export yet.');
      return;
    }
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Group staff by department (fall back to role, then "Unassigned")
    const groups: Record<string, User[]> = {};
    for (const u of users) {
      const dept =
        (u.department && u.department.trim()) || u.role || 'Unassigned';
      (groups[dept] ||= []).push(u);
    }

    const toRow = (u: User) => ({
      'Department': u.department || '',
      'Full Name': u.fullName,
      'Staff Code': u.staffCode || '',
      'Role': u.role,
      'Username': u.username,
      'Phone Number': u.phoneNumber || '',
      'Email': u.email || '',
      'Status': u.status,
    });

    // Summary sheet: count of staff per department
    const summary: { Department: string; 'Staff Count': number }[] = Object.keys(
      groups,
    )
      .sort()
      .map((dept) => ({ Department: dept, 'Staff Count': groups[dept].length }));
    summary.push({ Department: 'TOTAL', 'Staff Count': users.length });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summary),
      'Summary',
    );

    // All-staff sheet sorted by department then name
    const allRows = [...users]
      .sort(
        (a, b) =>
          (a.department || a.role || 'zzz').localeCompare(
            b.department || b.role || 'zzz',
          ) || a.fullName.localeCompare(b.fullName),
      )
      .map(toRow);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(allRows),
      'All Staff',
    );

    // One sheet per department
    const usedNames = new Set<string>(['summary', 'all staff']);
    const sanitize = (name: string) => {
      // Excel sheet names: max 31 chars, no : \ / ? * [ ]
      const base =
        name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Dept';
      let candidate = base;
      let i = 2;
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${base.slice(0, 25)} ${i++}`;
      }
      usedNames.add(candidate.toLowerCase());
      return candidate;
    };
    Object.keys(groups)
      .sort()
      .forEach((dept) => {
        const rows = groups[dept]
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
          .map(toRow);
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(rows),
          sanitize(dept),
        );
      });

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `staff_by_department_${today}.xlsx`);
  };

  const downloadTemplate = async () => {
    const template = [
      {
        'Full Name': 'John Doe',
        'Username': 'johndoe',
        'Email': 'john@example.com',
        'Role': 'SURGEON',
        'Phone Number': '08012345678',
        'Department': 'Surgery',
        'Staff Code': 'SRG001',
        'Staff ID': 'EMP001',
        'Password': 'optional-custom-password',
      },
    ];

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users Template');
    
    // Add notes sheet
    const notes = [
      { Note: 'Required Fields:', Value: 'Full Name, Username, Role' },
      { Note: 'Valid Roles:', Value: 'ADMIN, SYSTEM_ADMINISTRATOR, THEATRE_MANAGER, THEATRE_CHAIRMAN, SURGEON, ANAESTHETIST, SCRUB_NURSE, RECOVERY_ROOM_NURSE, THEATRE_STORE_KEEPER, PORTER, ANAESTHETIC_TECHNICIAN, BIOMEDICAL_ENGINEER, CLEANER, PROCUREMENT_OFFICER' },
      { Note: 'Password:', Value: 'If blank, username will be used as default password' },
      { Note: 'First Login:', Value: 'All users must change password on first login' },
      { Note: 'Status:', Value: 'All uploaded users are auto-approved' },
    ];
    const notesWs = XLSX.utils.json_to_sheet(notes);
    XLSX.utils.book_append_sheet(wb, notesWs, 'Instructions');

    XLSX.writeFile(wb, 'staff_upload_template.xlsx');
  };

  const normalizePhone = (p?: string | null) => {
    if (!p) return '';
    let s = String(p).trim().replace(/[\s\-().]/g, '');
    if (s.startsWith('+')) return s;
    if (s.startsWith('234')) return '+' + s;
    if (s.startsWith('0') && s.length === 11) return '+234' + s.slice(1);
    return s;
  };

  const buildContactDirectory = () => {
    const approved = (Array.isArray(users) ? users : []).filter(u => u.status === 'APPROVED');
    const cleaned = approved
      .map(u => ({
        fullName: (u.fullName || '').trim(),
        role: u.role,
        department: u.department || 'Unassigned',
        phone: normalizePhone(u.phoneNumber),
        email: u.email || '',
      }))
      .filter(u => u.fullName && !/^\d+$/.test(u.fullName));
    const withPhone = cleaned.filter(u => u.phone);
    const withoutPhone = cleaned.filter(u => !u.phone);
    return { withPhone, withoutPhone };
  };

  const copyDirectoryForWhatsApp = async () => {
    const { withPhone, withoutPhone } = buildContactDirectory();
    const byDept: Record<string, typeof withPhone> = {};
    for (const u of withPhone) {
      (byDept[u.department] ||= []).push(u);
    }
    const depts = Object.keys(byDept).sort();
    const lines: string[] = [];
    lines.push('📒 *ORM PLATFORM — REGISTERED USERS & PHONE NUMBERS*');
    lines.push(`Total: ${withPhone.length} (with phone) + ${withoutPhone.length} (missing phone)`);
    lines.push('🔗 https://unth-theatre-mai.vercel.app');
    lines.push('');
    let counter = 0;
    for (const d of depts) {
      lines.push(`*${d.toUpperCase()} (${byDept[d].length})*`);
      for (const u of byDept[d]) {
        counter += 1;
        lines.push(`${counter}. ${u.fullName} — ${u.phone} _(${u.role})_`);
      }
      lines.push('');
    }
    if (withoutPhone.length > 0) {
      lines.push('────────────────────────────');
      lines.push(`⚠️ *USERS WITHOUT A PHONE NUMBER ON FILE* (${withoutPhone.length})`);
      lines.push('Kindly send your phone number to the ORM Team.');
      lines.push('────────────────────────────');
      withoutPhone.forEach((u, i) => {
        lines.push(`${i + 1}. ${u.fullName} _(${u.role}${u.department ? ', ' + u.department : ''})_`);
      });
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert(`Copied ${withPhone.length} contacts to clipboard. Paste into WhatsApp.`);
    } catch {
      // Fallback: download as .txt
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orm-contacts-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const downloadDirectoryCSV = () => {
    const { withPhone, withoutPhone } = buildContactDirectory();
    const all = [...withPhone, ...withoutPhone];
    const esc = (v: string) => {
      const s = (v ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const headers = ['Full Name', 'Phone', 'Role', 'Department', 'Email'];
    const rows = [
      headers.join(','),
      ...all.map(u => [u.fullName, u.phone, u.role, u.department, u.email].map(esc).join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orm-contacts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDirectoryPDF = async () => {
    const { withPhone, withoutPhone } = buildContactDirectory();
    const [{ default: jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = (autoTableMod as any).default || (autoTableMod as any);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const today = new Date().toLocaleDateString();

    doc.setFontSize(16);
    doc.text('ORM Platform — Registered Users & Phone Numbers', 40, 40);
    doc.setFontSize(10);
    doc.text(`Generated: ${today}    |    With phone: ${withPhone.length}    |    Missing phone: ${withoutPhone.length}`, 40, 58);
    doc.text('https://unth-theatre-mai.vercel.app', 40, 72);

    const byDept: Record<string, typeof withPhone> = {};
    for (const u of withPhone) (byDept[u.department] ||= []).push(u);
    const depts = Object.keys(byDept).sort();

    let startY = 90;
    let counter = 0;
    for (const d of depts) {
      const body = byDept[d].map(u => {
        counter += 1;
        return [String(counter), u.fullName, u.phone, u.role];
      });
      autoTable(doc, {
        startY,
        head: [[`#`, `${d} (${byDept[d].length})`, 'Phone', 'Role']],
        body,
        styles: { fontSize: 8, cellPadding: 3 },
        theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [120, 120, 120], lineWidth: 0.1, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      });
      startY = (doc as any).lastAutoTable.finalY + 12;
    }

    if (withoutPhone.length > 0) {
      autoTable(doc, {
        startY,
        head: [[`Users without a phone on file (${withoutPhone.length})`, 'Role', 'Department']],
        body: withoutPhone.map(u => [u.fullName, u.role, u.department]),
        styles: { fontSize: 8, cellPadding: 3 },
        theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [120, 120, 120], lineWidth: 0.1, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      });
    }

    doc.save(`orm-contacts-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'THEATRE_MANAGER')) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">You do not have permission to access this page.</p>
      </div>
    );
  }

  const pendingUsers = Array.isArray(users) ? users.filter(u => u.status === 'PENDING') : [];
  const approvedUsers = Array.isArray(users) ? users.filter(u => u.status === 'APPROVED') : [];
  const approvedWithPhone = approvedUsers.filter(u => !!u.phoneNumber).length;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">User Management</h1>

      {/* Bulk Upload Section */}
      <div className="card bg-gradient-to-r from-primary-50 to-accent-50 border border-primary-200">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Upload className="w-6 h-6 mr-2 text-primary-600" />
          Bulk Staff Upload
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload an Excel file with staff details to create multiple user accounts at once. 
          All users will receive auto-generated credentials and must change their password on first login.
        </p>
        
        <div className="flex gap-4 items-start">
          <div className="flex-1">
            <label className="btn-primary cursor-pointer inline-flex items-center disabled:opacity-50">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload Excel File'}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">
              Accepts .xlsx and .xls files. Required columns: Full Name, Username, Role
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="btn-secondary inline-flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </button>
          <button
            onClick={exportStaffByDepartment}
            className="btn-secondary inline-flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Staff by Department
          </button>
        </div>

        {/* Upload Results */}
        {uploadResult && (
          <div className="mt-4 p-4 bg-white rounded-lg border">
            <h3 className="font-semibold text-green-700 mb-2">
              ✓ Upload Complete: {uploadResult.created} user(s) created successfully
            </h3>
            
            {uploadResult.errors.length > 0 && (
              <div className="mt-3">
                <h4 className="font-semibold text-red-700 mb-2">
                  ⚠ {uploadResult.errors.length} error(s) occurred:
                </h4>
                <div className="max-h-40 overflow-y-auto bg-red-50 rounded p-2">
                  {uploadResult.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-800 mb-1">
                      <strong>Row {error.row}:</strong> {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setUploadResult(null)}
              className="mt-3 text-sm text-gray-600 hover:text-gray-900"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Contact Directory Export */}
      <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
        <h2 className="text-xl font-semibold mb-2 flex items-center">
          <Phone className="w-6 h-6 mr-2 text-green-600" />
          Contact Directory
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Export the list of approved users and their phone numbers — share on WhatsApp, save as PDF, or download as CSV.
          Currently <strong>{approvedWithPhone}</strong> of <strong>{approvedUsers.length}</strong> approved users have a phone number on file.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={copyDirectoryForWhatsApp} className="btn-primary inline-flex items-center">
            <Copy className="w-4 h-4 mr-2" />
            Copy for WhatsApp
          </button>
          <button onClick={downloadDirectoryPDF} className="btn-secondary inline-flex items-center">
            <FileText className="w-4 h-4 mr-2" />
            Download PDF
          </button>
          <button onClick={downloadDirectoryCSV} className="btn-secondary inline-flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Online Onboarding Submissions (shareable form) */}
      <OnboardingSubmissionsPanel onImportedRefresh={fetchUsers} />

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
                      {user.fullName ? (
                        <ContactName type="user" id={user.id} name={user.fullName} />
                      ) : (
                        'Not assigned'
                      )}
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
                    {user.fullName ? (
                      <ContactName type="user" id={user.id} name={user.fullName} />
                    ) : (
                      'Not assigned'
                    )}
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
                    {session?.user.role === 'ADMIN' && session.user.id !== user.id && (
                      <button
                        onClick={() => {
                          setRoleUserId(user.id);
                          setNewRole(user.role);
                        }}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Change user role"
                      >
                        <UserCog className="w-5 h-5 inline" />
                      </button>
                    )}
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

      {/* Change Role Modal */}
      {roleUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center">
              <UserCog className="w-5 h-5 mr-2 text-indigo-600" />
              Change User Role
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Changing a user&apos;s role updates their access permissions immediately on their next session refresh.
              Use with care &mdash; granting ADMIN gives full system access.
            </p>
            <form onSubmit={handleChangeRole} className="space-y-4">
              <div>
                <label className="label" htmlFor="role-select">Role</label>
                <select
                  id="role-select"
                  className="input-field"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  required
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={roleLoading}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {roleLoading ? 'Saving...' : 'Update Role'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoleUserId(null);
                    setNewRole('');
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
