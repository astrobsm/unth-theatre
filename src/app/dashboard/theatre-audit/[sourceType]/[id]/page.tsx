'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  FileText,
  Send,
  Users,
} from 'lucide-react';

type TimelineEvent = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  actor?: string;
};

type ReviewItem = {
  id: string;
  reviewedAt: string;
  reviewedBy: string;
  reviewerRole: string;
  recommendation: string;
  committeeStatus: string;
  actionPoints: string;
  faultSummary: string;
};

type AuditDetailResponse = {
  entry: {
    id: string;
    sourceType: string;
    title: string;
    status: string;
    occurredAt: string;
    details: Record<string, unknown>;
  };
  staffInvolved: string[];
  timeline: TimelineEvent[];
  reviewHistory: ReviewItem[];
  latestReview: ReviewItem | null;
  audited: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  cancellations: 'Case Cancellation',
  incidents: 'Incident Report',
  delayed_tasks: 'Delayed Task',
  delayed_roster_submissions: 'Delayed Roster Submission',
  disciplinary_queries: 'Disciplinary Query',
  mortalities: 'Mortality Case',
  faults: 'Fault Record',
  anonymous_tips: 'Anonymous Report',
  security_reports: 'Security Report',
  late_first_case: 'Late First Case (>9:25 AM)',
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TheatreAuditDetailPage() {
  const params = useParams<{ sourceType: string; id: string }>();
  const sourceType = params.sourceType;
  const id = decodeURIComponent(params.id);

  const [data, setData] = useState<AuditDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slideIndex, setSlideIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const [recommendation, setRecommendation] = useState('');
  const [committeeStatus, setCommitteeStatus] = useState('AUDITED');
  const [actionPoints, setActionPoints] = useState('');
  const [faultSummary, setFaultSummary] = useState('');

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/theatre-audit/${sourceType}/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError('You are not signed in. Please login again.');
          return;
        }
        if (response.status === 403) {
          setError('You do not have permission to view this audit entry.');
          return;
        }
        if (response.status === 404) {
          setError('Audit entry not found.');
          return;
        }
        throw new Error('Failed to fetch detail');
      }

      const payload: AuditDetailResponse = await response.json();
      setData(payload);
      setSlideIndex(0);

      if (payload.latestReview) {
        setRecommendation(payload.latestReview.recommendation || '');
        setCommitteeStatus(payload.latestReview.committeeStatus || 'AUDITED');
        setActionPoints(payload.latestReview.actionPoints || '');
        setFaultSummary(payload.latestReview.faultSummary || '');
      }
    } catch {
      setError('Unable to load theatre audit detail.');
    } finally {
      setLoading(false);
    }
  }, [id, sourceType]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const timeline = data?.timeline || [];
  const currentSlide = timeline[slideIndex] || null;
  const reviewed = (data?.reviewHistory || []).length;

  const detailsPreview = useMemo(() => {
    if (!data?.entry?.details) return [];
    return Object.entries(data.entry.details)
      .filter(([, value]) => value !== null && value !== '' && typeof value !== 'object')
      .slice(0, 10);
  }, [data]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (recommendation.trim().length < 10) {
      setError('Recommendation should be at least 10 characters.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const response = await fetch(`/api/theatre-audit/${sourceType}/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendation,
          committeeStatus,
          actionPoints,
          faultSummary,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save recommendation');
      }

      await fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recommendation');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading audit timeline...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Link href="/dashboard/theatre-audit" className="inline-flex items-center gap-2 text-primary-700 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Theatre Audit
        </Link>
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/theatre-audit" className="inline-flex items-center gap-2 text-primary-700 hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Back to Theatre Audit
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{data?.entry.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{SOURCE_LABELS[sourceType] || sourceType.replace(/_/g, ' ')}</p>
        </div>

        <div className="flex items-center gap-2">
          {data?.audited ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-green-100 text-green-700">
              <CheckCircle2 className="w-3 h-3" />
              Audited
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-amber-100 text-amber-700">
              <Clock3 className="w-3 h-3" />
              Pending Audit
            </span>
          )}
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-slate-100 text-slate-700">
            {data?.entry.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-slate-900 text-white rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Chronological Sequence (Slide View)</h2>
              <span className="text-sm text-slate-300">
                {timeline.length === 0 ? 'No timeline events' : `Slide ${slideIndex + 1} of ${timeline.length}`}
              </span>
            </div>

            {currentSlide ? (
              <div className="bg-white text-slate-900 rounded-xl p-5 min-h-[260px] border border-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">{formatDateTime(currentSlide.timestamp)}</p>
                <h3 className="text-xl font-semibold mt-2">{currentSlide.title}</h3>
                <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{currentSlide.description}</p>
                {currentSlide.actor && <p className="text-xs text-slate-500 mt-4">Actor: {currentSlide.actor}</p>}
              </div>
            ) : (
              <div className="bg-white text-slate-600 rounded-xl p-5 min-h-[260px] border border-slate-200">
                Timeline is empty for this entry.
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setSlideIndex((prev) => Math.max(prev - 1, 0))}
                disabled={slideIndex === 0 || timeline.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-sm disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => setSlideIndex((prev) => Math.min(prev + 1, timeline.length - 1))}
                disabled={timeline.length === 0 || slideIndex >= timeline.length - 1}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-sm disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Case Snapshot</h3>
            {detailsPreview.length === 0 ? (
              <p className="text-sm text-gray-500">No scalar detail fields available for preview.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {detailsPreview.map(([key, value]) => (
                  <div key={key} className="border rounded-lg p-2 bg-gray-50">
                    <p className="text-xs uppercase text-gray-500">{key.replace(/_/g, ' ')}</p>
                    <p className="text-gray-800 mt-1 break-words">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border rounded-2xl p-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Staff Involved
            </h3>
            {data?.staffInvolved.length ? (
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {data.staffInvolved.map((staff) => (
                  <li key={staff} className="px-2 py-1 bg-gray-50 rounded-md border">
                    {staff}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 mt-3">No named staff listed for this entry.</p>
            )}
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Committee Recommendation
            </h3>
            <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="committeeStatus" className="block text-sm font-medium text-gray-700 mb-1">
                  Committee Status
                </label>
                <select
                  id="committeeStatus"
                  value={committeeStatus}
                  onChange={(e) => setCommitteeStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="AUDITED">Audited</option>
                  <option value="REQUIRES_FOLLOW_UP">Requires Follow Up</option>
                  <option value="ESCALATED">Escalated</option>
                </select>
              </div>

              <div>
                <label htmlFor="faultSummary" className="block text-sm font-medium text-gray-700 mb-1">
                  Fault Summary
                </label>
                <textarea
                  id="faultSummary"
                  value={faultSummary}
                  onChange={(e) => setFaultSummary(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Summarize faults and root causes"
                />
              </div>

              <div>
                <label htmlFor="actionPoints" className="block text-sm font-medium text-gray-700 mb-1">
                  Action Points
                </label>
                <textarea
                  id="actionPoints"
                  value={actionPoints}
                  onChange={(e) => setActionPoints(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Who should do what and by when"
                />
              </div>

              <div>
                <label htmlFor="recommendation" className="block text-sm font-medium text-gray-700 mb-1">
                  Recommendation
                </label>
                <textarea
                  id="recommendation"
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  rows={5}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Enter committee recommendation"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Recommendation'}
              </button>
            </form>
          </div>

          <div className="bg-white border rounded-2xl p-4">
            <h3 className="font-semibold text-gray-900">Review History ({reviewed})</h3>
            {reviewed === 0 ? (
              <p className="text-sm text-gray-500 mt-3">No previous recommendations.</p>
            ) : (
              <div className="mt-3 space-y-3 max-h-72 overflow-auto pr-1">
                {(data?.reviewHistory || []).map((review) => (
                  <div key={review.id} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{review.reviewedBy}</p>
                      <span className="text-xs text-gray-500">{formatDateTime(review.reviewedAt)}</span>
                    </div>
                    <p className="text-xs text-gray-500">{review.reviewerRole || 'Reviewer'}</p>
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{review.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
