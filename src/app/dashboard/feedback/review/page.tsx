'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Star,
  Loader2,
  MessageCircle,
  Users,
  Building2,
  MonitorSmartphone,
  ThumbsUp,
} from 'lucide-react';

type Tab = 'patient' | 'staff';

interface PatientFeedback {
  id: string;
  patientName: string | null;
  folderNumber: string | null;
  relationship: string | null;
  overallRating: number | null;
  staffCourtesyRating: number | null;
  cleanlinessRating: number | null;
  waitTimeRating: number | null;
  communicationRating: number | null;
  painManagementRating: number | null;
  journeyStage: string | null;
  whatWentWell: string | null;
  whatToImprove: string | null;
  message: string | null;
  wouldRecommend: boolean | null;
  status: string;
  source: string | null;
  createdAt: string;
}

interface StaffFeedback {
  id: string;
  category: 'THEATRE_MANAGEMENT' | 'APPLICATION';
  title: string | null;
  message: string;
  rating: number | null;
  authorName: string | null;
  authorRole: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
}

const PATIENT_STATUSES = ['NEW', 'REVIEWED', 'PUBLISHED', 'ARCHIVED'];
const STAFF_STATUSES = ['OPEN', 'IN_REVIEW', 'ACTIONED', 'CLOSED'];

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${
            n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          }`}
        />
      ))}
    </span>
  );
}

export default function FeedbackReviewPage() {
  const [tab, setTab] = useState<Tab>('patient');

  const [patients, setPatients] = useState<PatientFeedback[]>([]);
  const [summary, setSummary] = useState<{ count: number; avgOverall: number | null }>({
    count: 0,
    avgOverall: null,
  });
  const [staff, setStaff] = useState<StaffFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/feedback/patient'),
        fetch('/api/feedback/staff'),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setPatients(d.items ?? []);
        setSummary(d.summary ?? { count: 0, avgOverall: null });
      }
      if (sRes.ok) {
        const d = await sRes.json();
        setStaff(d.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updatePatientStatus = async (id: string, status: string) => {
    const res = await fetch('/api/feedback/patient', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    }
  };

  const updateStaffStatus = async (id: string, status: string) => {
    const res = await fetch('/api/feedback/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-500" /> Review Feedback
        </h1>
        <p className="text-gray-500 text-sm">
          Patient experience reports and staff improvement suggestions.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Patient responses</p>
          <p className="text-2xl font-bold text-gray-900">{summary.count}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Avg. overall rating</p>
          <p className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {summary.avgOverall != null ? summary.avgOverall.toFixed(1) : '—'}
            {summary.avgOverall != null && (
              <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Staff suggestions</p>
          <p className="text-2xl font-bold text-gray-900">{staff.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('patient')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            tab === 'patient'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" /> Patient Feedback
        </button>
        <button
          onClick={() => setTab('staff')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            tab === 'staff'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageCircle className="w-4 h-4" /> Staff Suggestions
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : tab === 'patient' ? (
        <div className="space-y-4">
          {patients.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No patient feedback yet.</p>
          ) : (
            patients.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">
                        {p.patientName || 'Anonymous'}
                      </span>
                      {p.relationship && (
                        <span className="text-xs text-gray-500">({p.relationship})</span>
                      )}
                      {p.journeyStage && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {p.journeyStage}
                        </span>
                      )}
                      {p.wouldRecommend === true && (
                        <span className="inline-flex items-center text-xs text-green-600">
                          <ThumbsUp className="w-3.5 h-3.5 mr-0.5" /> Recommends
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">Overall:</span>
                      <Stars value={p.overallRating} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString('en-GB')}
                    </span>
                    <select
                      value={p.status}
                      onChange={(e) => updatePatientStatus(p.id, e.target.value)}
                      aria-label="Update status"
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                    >
                      {PATIENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Staff courtesy</span> <Stars value={p.staffCourtesyRating} />
                  </div>
                  <div className="flex justify-between">
                    <span>Cleanliness</span> <Stars value={p.cleanlinessRating} />
                  </div>
                  <div className="flex justify-between">
                    <span>Wait time</span> <Stars value={p.waitTimeRating} />
                  </div>
                  <div className="flex justify-between">
                    <span>Communication</span> <Stars value={p.communicationRating} />
                  </div>
                  <div className="flex justify-between">
                    <span>Pain management</span> <Stars value={p.painManagementRating} />
                  </div>
                </div>

                {(p.whatWentWell || p.whatToImprove || p.message) && (
                  <div className="mt-3 space-y-2 text-sm">
                    {p.whatWentWell && (
                      <p className="text-gray-700">
                        <span className="font-medium text-green-700">What went well: </span>
                        {p.whatWentWell}
                      </p>
                    )}
                    {p.whatToImprove && (
                      <p className="text-gray-700">
                        <span className="font-medium text-amber-700">To improve: </span>
                        {p.whatToImprove}
                      </p>
                    )}
                    {p.message && (
                      <p className="text-gray-700 whitespace-pre-wrap">{p.message}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {staff.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No staff suggestions yet.</p>
          ) : (
            staff.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {s.category === 'THEATRE_MANAGEMENT' ? (
                          <Building2 className="w-3.5 h-3.5" />
                        ) : (
                          <MonitorSmartphone className="w-3.5 h-3.5" />
                        )}
                        {s.category === 'THEATRE_MANAGEMENT'
                          ? 'Theatre Management'
                          : 'Application'}
                      </span>
                      {s.rating != null && <Stars value={s.rating} />}
                    </div>
                    {s.title && (
                      <p className="font-medium text-gray-900 mt-1">{s.title}</p>
                    )}
                    <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">
                      {s.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {s.authorName || 'Unknown'}
                      {s.authorRole ? ` · ${s.authorRole}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {new Date(s.createdAt).toLocaleDateString('en-GB')}
                    </span>
                    <select
                      value={s.status}
                      onChange={(e) => updateStaffStatus(s.id, e.target.value)}
                      aria-label="Update status"
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                    >
                      {STAFF_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
