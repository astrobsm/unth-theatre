'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Search } from 'lucide-react';

type AuditSourceType =
  | 'cancellations'
  | 'incidents'
  | 'delayed_tasks'
  | 'delayed_roster_submissions'
  | 'disciplinary_queries'
  | 'mortalities'
  | 'faults'
  | 'anonymous_tips'
  | 'security_reports'
  | 'late_first_case';

type AuditSectionItem = {
  id: string;
  sourceType: AuditSourceType;
  title: string;
  summary: string;
  status: string;
  occurredAt: string;
  staffInvolved: string[];
  audited: boolean;
  lastRecommendationAt: string | null;
};

type AuditSectionSummary = {
  count: number;
  audited: number;
  pending: number;
};

type AuditResponse = {
  sections: Record<AuditSourceType, AuditSectionItem[]>;
  totals: Record<AuditSourceType, AuditSectionSummary>;
};

const SECTION_META: Record<AuditSourceType, { label: string; short: string }> = {
  cancellations: { label: 'Case Cancellations', short: 'Cancellations' },
  incidents: { label: 'Incident Reports', short: 'Incidents' },
  delayed_tasks: { label: 'Delayed Tasks', short: 'Delayed Tasks' },
  delayed_roster_submissions: { label: 'Delayed Roster Submissions', short: 'Late Rosters' },
  disciplinary_queries: { label: 'Disciplinary Queries', short: 'Queries' },
  mortalities: { label: 'Mortalities', short: 'Mortalities' },
  faults: { label: 'Fault Reports', short: 'Faults' },
  anonymous_tips: { label: 'Anonymous Reports', short: 'Anonymous' },
  security_reports: { label: 'Security Reports', short: 'Security' },
  late_first_case: { label: 'Late First Cases (>9:25 AM)', short: 'Late Starts' },
};

const SOURCE_ORDER: AuditSourceType[] = [
  'cancellations',
  'incidents',
  'delayed_tasks',
  'delayed_roster_submissions',
  'disciplinary_queries',
  'mortalities',
  'faults',
  'anonymous_tips',
  'security_reports',
  'late_first_case',
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TheatreAuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<AuditSourceType>('cancellations');
  const [searchText, setSearchText] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);

  const fetchAuditData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/theatre-audit', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401) {
          setError('You are not signed in. Please login again.');
          return;
        }
        if (response.status === 403) {
          setError('You do not have access to Theatre Audit.');
          return;
        }
        throw new Error('Failed to load theatre audit');
      }
      const payload = await response.json();
      setData(payload);
    } catch {
      setError('Unable to load theatre audit data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  const currentItems = useMemo(() => {
    const items = data?.sections?.[activeSection] || [];
    return items
      .filter((item) => (pendingOnly ? !item.audited : true))
      .filter((item) => {
        if (!searchText.trim()) return true;
        const q = searchText.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.status.toLowerCase().includes(q) ||
          item.staffInvolved.some((s) => s.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [activeSection, data, pendingOnly, searchText]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading theatre audit dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-red-900">Theatre Audit Unavailable</h2>
            <p className="text-red-700 text-sm mt-1">{error}</p>
            <button
              onClick={fetchAuditData}
              className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Theatre Audit Command Center</h1>
            <p className="text-blue-100 mt-1 text-sm">
              Review governance events, track audit status, and issue committee recommendations.
            </p>
          </div>
          <button
            onClick={fetchAuditData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          {SOURCE_ORDER.map((section) => {
            const total = data?.totals?.[section];
            return (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`text-left rounded-xl p-3 border transition ${
                  activeSection === section
                    ? 'bg-white text-slate-900 border-white shadow-lg'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              >
                <p className="text-xs opacity-80">{SECTION_META[section].short}</p>
                <p className="text-xl font-bold mt-1">{total?.count || 0}</p>
                <p className="text-xs mt-1">Pending: {total?.pending || 0}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{SECTION_META[activeSection].label}</h2>
            <p className="text-sm text-gray-500">Click any entry to open the timeline slide view.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show pending only
          </label>
        </div>

        <div className="relative max-w-xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by title, summary, status, or staff"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {currentItems.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
            No entries found for this filter.
          </div>
        ) : (
          <div className="grid gap-3">
            {currentItems.map((item) => (
              <Link
                key={`${item.sourceType}:${item.id}`}
                href={`/dashboard/theatre-audit/${item.sourceType}/${encodeURIComponent(item.id)}`}
                className="block border rounded-xl p-4 hover:shadow-md hover:border-primary-300 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">{item.status.replace(/_/g, ' ')}</span>
                      <span className="text-gray-500 inline-flex items-center gap-1">
                        <Clock3 className="w-3 h-3" />
                        {formatDateTime(item.occurredAt)}
                      </span>
                      {item.staffInvolved.length > 0 && (
                        <span className="text-gray-500">Staff: {item.staffInvolved.slice(0, 3).join(', ')}</span>
                      )}
                    </div>
                  </div>

                  {item.audited ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Audited
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 shrink-0">
                      <Clock3 className="w-3 h-3" />
                      Pending
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
