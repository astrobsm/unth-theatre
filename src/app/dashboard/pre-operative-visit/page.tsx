'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  ClipboardCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  Save,
  Eye,
} from 'lucide-react';

interface PendingSurgery {
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  age: number;
  gender: string;
  ward: string;
  diagnosis: string;
  procedureName: string;
  surgicalUnit: string;
  scheduledDate: string;
  scheduledTime: string;
  surgeonName: string;
  hasPreOpVisit: boolean;
  latestVisitStatus: string | null;
  latestVisit: PreOpVisit | null;
  consentOnFile: boolean;
}

interface PreOpVisit {
  id: string;
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  ward: string;
  procedureName: string;
  surgeonName: string;
  overallStatus: string;
  visitDate: string;
  visitedByName: string;
  allergies: string | null;
  previousSurgeries: string | null;
  comorbidities: string | null;
  patientAvailableInWard: boolean;
  surgicalFeePaymentStatus: string;
  consentStatus: string;
  surgicalItemsAvailable: boolean;
  preAnaestheticReviewDone: boolean;
  npoStatus: string;
  investigationsComplete: boolean;
  pendingInvestigations: string | null;
  patientEmotionalReadiness: string;
  bloodReady: boolean;
  ivLineSecured: boolean;
  skinPrepDone: boolean;
  overallNotes: string | null;
  nurseSignature: string | null;
}

const PAYMENT_OPTIONS = [
  { value: 'NOT_PAID', label: 'Not Paid', color: 'text-red-600' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid', color: 'text-amber-600' },
  { value: 'FULLY_PAID', label: 'Fully Paid', color: 'text-green-600' },
  { value: 'WAIVED', label: 'Waived', color: 'text-blue-600' },
  { value: 'UNKNOWN', label: 'Unknown', color: 'text-gray-500' },
];

const CONSENT_OPTIONS = [
  { value: 'NOT_OBTAINED', label: 'Not Obtained', color: 'text-red-600' },
  { value: 'OBTAINED', label: 'Obtained', color: 'text-green-600' },
  { value: 'REFUSED', label: 'Refused', color: 'text-red-700' },
  { value: 'PENDING', label: 'Pending', color: 'text-amber-600' },
];

const NPO_OPTIONS = [
  { value: 'NPO_COMPLIANT', label: 'NPO Compliant', color: 'text-green-600' },
  { value: 'NOT_FASTING', label: 'Not Fasting', color: 'text-red-600' },
  { value: 'PARTIALLY_COMPLIANT', label: 'Partially Compliant', color: 'text-amber-600' },
  { value: 'UNKNOWN', label: 'Unknown', color: 'text-gray-500' },
];

const EMOTIONAL_OPTIONS = [
  { value: 'READY', label: 'Ready', color: 'text-green-600' },
  { value: 'ANXIOUS', label: 'Anxious', color: 'text-amber-500' },
  { value: 'VERY_ANXIOUS', label: 'Very Anxious', color: 'text-amber-700' },
  { value: 'REFUSED', label: 'Refused Surgery', color: 'text-red-700' },
  { value: 'NEEDS_COUNSELLING', label: 'Needs Counselling', color: 'text-purple-600' },
  { value: 'UNKNOWN', label: 'Unknown', color: 'text-gray-500' },
];

export default function PreOperativeVisitPage() {
  const [pendingSurgeries, setPendingSurgeries] = useState<PendingSurgery[]>([]);
  const [completedVisits, setCompletedVisits] = useState<PreOpVisit[]>([]);
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [selectedSurgery, setSelectedSurgery] = useState<PendingSurgery | null>(null);
  const [issuesSurgery, setIssuesSurgery] = useState<PendingSurgery | null>(null);
  const [issueResolutions, setIssueResolutions] = useState<Record<number, string>>({});
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  // Form state
  const [formData, setFormData] = useState({
    allergies: '',
    previousSurgeries: '',
    comorbidities: '',
    patientAvailableInWard: true,
    surgicalFeePaymentStatus: 'UNKNOWN',
    consentStatus: 'PENDING',
    surgicalItemsAvailable: true,
    preAnaestheticReviewDone: false,
    npoStatus: 'UNKNOWN',
    investigationsComplete: false,
    pendingInvestigations: '',
    patientEmotionalReadiness: 'UNKNOWN',
    bloodReady: false,
    ivLineSecured: false,
    skinPrepDone: false,
    overallNotes: '',
    nurseSignature: '',
  });

  const resetForm = () => {
    setFormData({
      allergies: '',
      previousSurgeries: '',
      comorbidities: '',
      patientAvailableInWard: true,
      surgicalFeePaymentStatus: 'UNKNOWN',
      consentStatus: 'PENDING',
      surgicalItemsAvailable: true,
      preAnaestheticReviewDone: false,
      npoStatus: 'UNKNOWN',
      investigationsComplete: false,
      pendingInvestigations: '',
      patientEmotionalReadiness: 'UNKNOWN',
      bloodReady: false,
      ivLineSecured: false,
      skinPrepDone: false,
      overallNotes: '',
      nurseSignature: '',
    });
  };

  // Open the assessment form for a surgery. If a signed informed consent is
  // already on file from the booking form, the consent status is pre-set to
  // "Obtained" so the nurse doesn't have to re-enter it. When re-assessing a
  // blocked patient, a summary of the actions taken can be pre-filled.
  const openAssessment = (s: PendingSurgery, resolutionNote?: string) => {
    setSelectedSurgery(s);
    resetForm();
    if (s.consentOnFile || resolutionNote) {
      setFormData((prev) => ({
        ...prev,
        ...(s.consentOnFile ? { consentStatus: 'OBTAINED' } : {}),
        ...(resolutionNote ? { overallNotes: resolutionNote } : {}),
      }));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Open the blocking-issues modal and reset any prior resolution entries.
  const openIssues = (s: PendingSurgery) => {
    setIssuesSurgery(s);
    setIssueResolutions({});
  };

  const fetchPendingSurgeries = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/pre-operative-visit?view=pending-surgeries&date=${targetDate}`);
      if (!res.ok) throw new Error('Failed to fetch surgeries');
      const json = await res.json();
      setPendingSurgeries(json.surgeries || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  const fetchCompletedVisits = useCallback(async () => {
    try {
      const res = await fetch(`/api/pre-operative-visit?date=${targetDate}`);
      if (!res.ok) throw new Error('Failed to fetch visits');
      const json = await res.json();
      setCompletedVisits(json);
    } catch (err: any) {
      setError(err.message);
    }
  }, [targetDate]);

  // Load both lists in parallel for the fastest possible render.
  const refresh = useCallback(() => {
    void Promise.all([fetchPendingSurgeries(), fetchCompletedVisits()]);
  }, [fetchPendingSurgeries, fetchCompletedVisits]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSubmit = async () => {
    if (!selectedSurgery) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pre-operative-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: selectedSurgery.surgeryId,
          ...formData,
          allergies: formData.allergies || null,
          previousSurgeries: formData.previousSurgeries || null,
          comorbidities: formData.comorbidities || null,
          pendingInvestigations: formData.pendingInvestigations || null,
          overallNotes: formData.overallNotes || null,
          nurseSignature: formData.nurseSignature || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save visit');
      }
      setSuccessMsg(`Pre-operative visit for ${selectedSurgery.patientName} saved successfully!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setSelectedSurgery(null);
      resetForm();
      refresh();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // Derive the human-readable list of issues that are blocking surgical clearance.
  const getBlockingIssues = (v: PreOpVisit | null): string[] => {
    if (!v) return [];
    const issues: string[] = [];
    if (v.patientAvailableInWard === false) issues.push('Patient NOT available in ward');
    if (v.consentStatus === 'NOT_OBTAINED') issues.push('Surgical consent not obtained');
    if (v.consentStatus === 'REFUSED') issues.push('Surgical consent refused');
    if (v.surgicalFeePaymentStatus === 'NOT_PAID') issues.push('Surgical fee not paid');
    if (v.preAnaestheticReviewDone === false) issues.push('Pre-anaesthetic review not done');
    if (v.npoStatus === 'NOT_FASTING') issues.push('Patient not fasting (NPO breach)');
    if (v.investigationsComplete === false)
      issues.push(`Investigations incomplete${v.pendingInvestigations ? ` — ${v.pendingInvestigations}` : ''}`);
    if (v.patientEmotionalReadiness === 'REFUSED') issues.push('Patient refusing surgery');
    if (v.surgicalItemsAvailable === false) issues.push('Surgical items not available');
    if (v.bloodReady === false) issues.push('Blood not ready');
    return issues;
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    const cfg: Record<string, { color: string; label: string }> = {
      PENDING: { color: 'bg-gray-100 text-gray-700', label: 'Pending' },
      VISITED: { color: 'bg-blue-100 text-blue-700', label: 'Visited' },
      CLEARED: { color: 'bg-green-100 text-green-700', label: 'Cleared' },
      NOT_CLEARED: { color: 'bg-red-100 text-red-700', label: 'Not Cleared' },
      DEFERRED: { color: 'bg-amber-100 text-amber-700', label: 'Deferred' },
    };
    const c = cfg[status] || { color: 'bg-gray-100 text-gray-600', label: status };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
        {c.label}
      </span>
    );
  };

  const filteredSurgeries = pendingSurgeries.filter(s => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.patientName.toLowerCase().includes(term) ||
      s.folderNumber?.toLowerCase().includes(term) ||
      s.procedureName?.toLowerCase().includes(term) ||
      s.ward?.toLowerCase().includes(term)
    );
  });

  if (loading && pendingSurgeries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading scheduled cases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
              <ClipboardCheck className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 flex-shrink-0" />
              <span className="truncate">Pre-Operative Visit</span>
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Night-before ward visits to verify patient readiness for surgery
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none min-w-[140px]">
              <label className="block text-xs text-gray-500 mb-1">Surgery Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                title="Surgery date"
              />
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        {/* Quick day selectors — one tap to jump between days */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: 'Today', offset: 0 },
            { label: 'Tomorrow', offset: 1 },
            { label: 'In 2 days', offset: 2 },
            { label: 'In 3 days', offset: 3 },
          ].map(({ label, offset }) => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            const iso = d.toISOString().split('T')[0];
            const active = targetDate === iso;
            return (
              <button
                key={label}
                onClick={() => setTargetDate(iso)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700" title="Dismiss error">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Blocking Issues Modal — why a case is Not Cleared */}
      {issuesSurgery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setIssuesSurgery(null)}>
          <div className="bg-white rounded-xl shadow-2xl border-2 border-red-200 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Blocking Issues
              </h2>
              <button onClick={() => setIssuesSurgery(null)} className="text-gray-400 hover:text-gray-600" title="Close">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5">
              <div className="mb-3">
                <div className="font-semibold text-gray-900">{issuesSurgery.patientName}</div>
                <div className="text-sm text-gray-500">{issuesSurgery.folderNumber} · {issuesSurgery.procedureName}</div>
              </div>
              {getBlockingIssues(issuesSurgery.latestVisit).length > 0 ? (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    For each blocking issue, record what was done to resolve it before re-assessing.
                  </p>
                  <ul className="space-y-3">
                    {getBlockingIssues(issuesSurgery.latestVisit).map((issue, i) => (
                      <li key={i} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <div className="flex items-start gap-2 text-sm text-red-700">
                          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{issue}</span>
                        </div>
                        <input
                          type="text"
                          value={issueResolutions[i] || ''}
                          onChange={(e) => setIssueResolutions(prev => ({ ...prev, [i]: e.target.value }))}
                          placeholder="What was done to resolve this?"
                          className="mt-2 w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:ring-2 focus:ring-purple-500"
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-500">No specific issues recorded. Re-assess the patient to update readiness.</p>
              )}
              {issuesSurgery.latestVisit?.overallNotes && (
                <div className="mt-4 text-sm text-gray-700">
                  <span className="font-semibold">Notes:</span> {issuesSurgery.latestVisit.overallNotes}
                </div>
              )}
              <button
                onClick={() => {
                  const s = issuesSurgery;
                  const issues = getBlockingIssues(s.latestVisit);
                  const resolved = issues
                    .map((issue, i) => {
                      const r = issueResolutions[i]?.trim();
                      return r ? `• ${issue} -> Action taken: ${r}` : null;
                    })
                    .filter(Boolean)
                    .join('\n');
                  const note = resolved
                    ? `Re-assessment by ${session?.user?.name || 'clinician'} — actions taken to resolve blocking issues:\n${resolved}\n\n`
                    : '';
                  setIssuesSurgery(null);
                  openAssessment(s, note);
                }}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition"
              >
                <ClipboardCheck className="w-4 h-4" /> Re-assess patient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Form Modal */}
      {selectedSurgery && (
        <div className="mb-6 bg-white rounded-xl shadow-lg border-2 border-purple-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Pre-Op Assessment: {selectedSurgery.patientName}
            </h2>
            <button
              onClick={() => { setSelectedSurgery(null); resetForm(); }}
              className="text-gray-400 hover:text-gray-600"
              title="Close assessment form"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          {/* Patient Summary */}
          <div className="bg-purple-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500">Folder:</span> <strong>{selectedSurgery.folderNumber}</strong></div>
              <div><span className="text-gray-500">Age/Gender:</span> <strong>{selectedSurgery.age}yrs / {selectedSurgery.gender}</strong></div>
              <div><span className="text-gray-500">Ward:</span> <strong>{selectedSurgery.ward || 'N/A'}</strong></div>
              <div><span className="text-gray-500">Surgeon:</span> <strong>{selectedSurgery.surgeonName}</strong></div>
              <div className="col-span-2"><span className="text-gray-500">Procedure:</span> <strong>{selectedSurgery.procedureName}</strong></div>
              <div><span className="text-gray-500">Unit:</span> <strong>{selectedSurgery.surgicalUnit || 'N/A'}</strong></div>
              <div><span className="text-gray-500">Time:</span> <strong>{selectedSurgery.scheduledTime || 'TBD'}</strong></div>
            </div>
          </div>

          {/* Assessment Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Allergies */}
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="preop-allergies" className="block text-sm font-semibold text-red-700">
                Allergies (drug / other) — leave blank if none
              </label>
              <input
                id="preop-allergies"
                type="text"
                value={formData.allergies}
                onChange={(e) => setFormData(p => ({ ...p, allergies: e.target.value }))}
                placeholder="e.g., Penicillin, Latex, Iodine — or 'None known'"
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Previous Surgeries */}
            <div className="space-y-2">
              <label htmlFor="preop-previous-surgeries" className="block text-sm font-semibold text-gray-700">
                Previous Surgeries (if any)
              </label>
              <input
                id="preop-previous-surgeries"
                type="text"
                value={formData.previousSurgeries}
                onChange={(e) => setFormData(p => ({ ...p, previousSurgeries: e.target.value }))}
                placeholder="e.g., Appendectomy 2019, CS 2021"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Co-morbidities */}
            <div className="space-y-2">
              <label htmlFor="preop-comorbidities" className="block text-sm font-semibold text-gray-700">
                Co-morbidities (if any)
              </label>
              <input
                id="preop-comorbidities"
                type="text"
                value={formData.comorbidities}
                onChange={(e) => setFormData(p => ({ ...p, comorbidities: e.target.value }))}
                placeholder="e.g., Hypertension, Diabetes, Asthma"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Patient Available in Ward */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Patient Available in Ward
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.patientAvailableInWard === true}
                    onChange={() => setFormData(p => ({ ...p, patientAvailableInWard: true }))}
                    className="text-green-600 focus:ring-green-500" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.patientAvailableInWard === false}
                    onChange={() => setFormData(p => ({ ...p, patientAvailableInWard: false }))}
                    className="text-red-600 focus:ring-red-500" />
                  <span className="text-sm text-red-700">No</span>
                </label>
              </div>
            </div>

            {/* Surgical Fee Payment */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Surgical Fee Payment Status</label>
              <select
                value={formData.surgicalFeePaymentStatus}
                onChange={(e) => setFormData(p => ({ ...p, surgicalFeePaymentStatus: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                title="Surgical fee payment status"
              >
                {PAYMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Consent Status */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Consent Status</label>
              <select
                value={formData.consentStatus}
                onChange={(e) => setFormData(p => ({ ...p, consentStatus: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                title="Consent status"
              >
                {CONSENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {selectedSurgery?.consentOnFile && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Signed consent on file from booking — status pre-set to Obtained.
                </p>
              )}
            </div>

            {/* Surgical Items Available */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Surgical Items Available</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.surgicalItemsAvailable === true}
                    onChange={() => setFormData(p => ({ ...p, surgicalItemsAvailable: true }))}
                    className="text-green-600" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.surgicalItemsAvailable === false}
                    onChange={() => setFormData(p => ({ ...p, surgicalItemsAvailable: false }))}
                    className="text-red-600" />
                  <span className="text-sm text-red-700">No</span>
                </label>
              </div>
            </div>

            {/* Pre-Anaesthetic Review Done */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Pre-Anaesthetic Review Done</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.preAnaestheticReviewDone === true}
                    onChange={() => setFormData(p => ({ ...p, preAnaestheticReviewDone: true }))}
                    className="text-green-600" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.preAnaestheticReviewDone === false}
                    onChange={() => setFormData(p => ({ ...p, preAnaestheticReviewDone: false }))}
                    className="text-red-600" />
                  <span className="text-sm text-red-700">No</span>
                </label>
              </div>
            </div>

            {/* NPO Status */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">NPO (Nil Per Os) Status</label>
              <select
                value={formData.npoStatus}
                onChange={(e) => setFormData(p => ({ ...p, npoStatus: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                title="NPO status"
              >
                {NPO_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Investigations Complete */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Required Investigations Complete</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.investigationsComplete === true}
                    onChange={() => setFormData(p => ({ ...p, investigationsComplete: true }))}
                    className="text-green-600" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.investigationsComplete === false}
                    onChange={() => setFormData(p => ({ ...p, investigationsComplete: false }))}
                    className="text-red-600" />
                  <span className="text-sm text-red-700">No</span>
                </label>
              </div>
            </div>

            {/* Pending Investigations */}
            {!formData.investigationsComplete && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Pending Investigations</label>
                <input
                  type="text"
                  value={formData.pendingInvestigations}
                  onChange={(e) => setFormData(p => ({ ...p, pendingInvestigations: e.target.value }))}
                  placeholder="e.g., FBC, U&E, ECG..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}

            {/* Emotional Readiness */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Patient Emotional Readiness
              </label>
              <select
                value={formData.patientEmotionalReadiness}
                onChange={(e) => setFormData(p => ({ ...p, patientEmotionalReadiness: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                title="Patient emotional readiness"
              >
                {EMOTIONAL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Blood Ready */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Blood Ready</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.bloodReady === true}
                    onChange={() => setFormData(p => ({ ...p, bloodReady: true }))}
                    className="text-green-600" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.bloodReady === false}
                    onChange={() => setFormData(p => ({ ...p, bloodReady: false }))}
                    className="text-red-600" />
                  <span className="text-sm text-red-700">No / N/A</span>
                </label>
              </div>
            </div>

            {/* IV Line Secured */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">IV Line Secured</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.ivLineSecured === true}
                    onChange={() => setFormData(p => ({ ...p, ivLineSecured: true }))}
                    className="text-green-600" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.ivLineSecured === false}
                    onChange={() => setFormData(p => ({ ...p, ivLineSecured: false }))}
                    className="text-red-600" />
                  <span className="text-sm text-red-700">No</span>
                </label>
              </div>
            </div>

            {/* Skin Prep Done */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Skin Preparation Done</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.skinPrepDone === true}
                    onChange={() => setFormData(p => ({ ...p, skinPrepDone: true }))}
                    className="text-green-600" />
                  <span className="text-sm text-green-700">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formData.skinPrepDone === false}
                    onChange={() => setFormData(p => ({ ...p, skinPrepDone: false }))}
                    className="text-red-600" />
                  <span className="text-sm text-red-700">No</span>
                </label>
              </div>
            </div>
          </div>

          {/* Notes & Signature */}
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Overall Notes / Observations</label>
              <textarea
                value={formData.overallNotes}
                onChange={(e) => setFormData(p => ({ ...p, overallNotes: e.target.value }))}
                rows={3}
                placeholder="Any additional observations about the patient's readiness..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="max-w-md">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nurse Signature</label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-800 flex items-center gap-2">
                <User className="w-4 h-4 text-purple-500" />
                <span className="font-medium">{session?.user?.name || 'Signed-in nurse'}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Auto-signed as the logged-in nurse. Your name and registered phone number
                are recorded from your profile as the electronic signature.
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Assessment
            </button>
            <button
              onClick={() => { setSelectedSurgery(null); resetForm(); }}
              className="px-4 py-2.5 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-300 mb-6 overflow-x-auto -mx-1 px-1">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${
            activeTab === 'pending'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending Assessments ({filteredSurgeries.filter(s => !s.hasPreOpVisit).length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${
            activeTab === 'completed'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Completed Visits ({completedVisits.length})
        </button>
      </div>

      {/* Search */}
      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search patient name, folder number, procedure..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
      </div>

      {/* Pending Assessments Tab */}
      {activeTab === 'pending' && (
        <>
          {/* Mobile: card list (always-visible action buttons) */}
          <div className="sm:hidden space-y-3">
            {filteredSurgeries.map((s, idx) => (
              <div key={s.surgeryId} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">#{idx + 1} · {s.folderNumber}</div>
                    <div className="font-semibold text-gray-900 truncate">{s.patientName}</div>
                    <div className="text-xs text-gray-500">{s.age}yrs / {s.gender} · {s.ward || 'N/A'}</div>
                  </div>
                  {s.hasPreOpVisit ? (
                    getStatusBadge(s.latestVisitStatus)
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 flex-shrink-0">
                      <Clock className="w-3 h-3 mr-1" /> Not Visited
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-800 break-words">{s.procedureName}</div>
                <div className="text-xs text-gray-500 mb-3 break-words">{s.diagnosis}</div>
                <div className="flex items-center justify-between text-xs text-gray-600 mb-3">
                  <span className="truncate">Unit: {s.surgicalUnit || 'N/A'}</span>
                  <span className="truncate ml-2">Surgeon: {s.surgeonName}</span>
                </div>
                <button
                  onClick={() => {
                    openAssessment(s);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 active:bg-purple-800 transition"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {s.hasPreOpVisit ? 'Re-assess Patient' : 'Start Assessment'}
                </button>
                {s.latestVisitStatus === 'NOT_CLEARED' && (
                  <button
                    onClick={() => openIssues(s)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 border border-red-300 text-sm font-semibold rounded-lg hover:bg-red-100 transition"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    View blocking issues
                  </button>
                )}
              </div>
            ))}
            {filteredSurgeries.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                <User className="w-12 h-12 text-gray-300 mx-auto" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No Cases Found</h3>
                <p className="mt-2 text-sm text-gray-500">No scheduled surgeries for the selected date.</p>
              </div>
            )}
          </div>

          {/* Desktop / tablet: table */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">S/N</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Folder No.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ward</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSurgeries.map((s, idx) => (
                  <tr key={s.surgeryId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{s.patientName}</div>
                      <div className="text-xs text-gray-500">{s.age}yrs / {s.gender}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.folderNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.ward || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{s.procedureName}</div>
                      <div className="text-xs text-gray-500">{s.diagnosis}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.surgicalUnit || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.surgeonName}</td>
                    <td className="px-4 py-3">
                      {s.hasPreOpVisit ? (
                        getStatusBadge(s.latestVisitStatus)
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          <Clock className="w-3 h-3 mr-1" />
                          Not Visited
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            openAssessment(s);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition"
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          {s.hasPreOpVisit ? 'Re-assess' : 'Assess'}
                        </button>
                        {s.latestVisitStatus === 'NOT_CLEARED' && (
                          <button
                            onClick={() => openIssues(s)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-300 text-xs font-medium rounded-lg hover:bg-red-100 transition"
                            title="View blocking issues"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Issues
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSurgeries.length === 0 && (
            <div className="text-center py-12">
              <User className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No Cases Found</h3>
              <p className="mt-2 text-sm text-gray-500">
                No scheduled surgeries for the selected date.
              </p>
            </div>
          )}
        </div>
        </>
      )}

      {/* Completed Visits Tab */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          {completedVisits.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
              <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No Visits Today</h3>
              <p className="mt-2 text-sm text-gray-500">No pre-operative visits have been recorded today.</p>
            </div>
          ) : (
            completedVisits.map((visit) => (
              <div key={visit.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedVisit(expandedVisit === visit.id ? null : visit.id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-medium text-gray-900">{visit.patientName}</div>
                      <div className="text-sm text-gray-500">{visit.folderNumber} | {visit.ward} | {visit.procedureName}</div>
                    </div>
                    {getStatusBadge(visit.overallStatus)}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>By: {visit.visitedByName}</span>
                    {expandedVisit === visit.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {expandedVisit === visit.id && (
                  <div className="px-6 pb-4 border-t border-gray-100 pt-4">
                    {(visit.allergies || visit.previousSurgeries || visit.comorbidities) && (
                      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">Allergies:</span>{' '}
                          <span className={visit.allergies ? 'text-red-600 font-medium' : 'text-gray-400'}>
                            {visit.allergies || 'None recorded'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Previous Surgeries:</span>{' '}
                          <span className="text-gray-700">{visit.previousSurgeries || 'None recorded'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Co-morbidities:</span>{' '}
                          <span className="text-gray-700">{visit.comorbidities || 'None recorded'}</span>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        {visit.patientAvailableInWard ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        Patient in Ward
                      </div>
                      <div>
                        <span className="text-gray-500">Payment:</span>{' '}
                        <span className={PAYMENT_OPTIONS.find(o => o.value === visit.surgicalFeePaymentStatus)?.color}>
                          {PAYMENT_OPTIONS.find(o => o.value === visit.surgicalFeePaymentStatus)?.label || visit.surgicalFeePaymentStatus}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Consent:</span>{' '}
                        <span className={CONSENT_OPTIONS.find(o => o.value === visit.consentStatus)?.color}>
                          {CONSENT_OPTIONS.find(o => o.value === visit.consentStatus)?.label || visit.consentStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.surgicalItemsAvailable ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        Surgical Items
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.preAnaestheticReviewDone ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        Pre-Anaesthetic Review
                      </div>
                      <div>
                        <span className="text-gray-500">NPO:</span>{' '}
                        <span className={NPO_OPTIONS.find(o => o.value === visit.npoStatus)?.color}>
                          {NPO_OPTIONS.find(o => o.value === visit.npoStatus)?.label || visit.npoStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.investigationsComplete ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        Investigations
                      </div>
                      <div>
                        <span className="text-gray-500">Emotional:</span>{' '}
                        <span className={EMOTIONAL_OPTIONS.find(o => o.value === visit.patientEmotionalReadiness)?.color}>
                          {EMOTIONAL_OPTIONS.find(o => o.value === visit.patientEmotionalReadiness)?.label || visit.patientEmotionalReadiness}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.bloodReady ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        Blood Ready
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.ivLineSecured ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        IV Line Secured
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.skinPrepDone ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        Skin Prep Done
                      </div>
                    </div>
                    {visit.pendingInvestigations && (
                      <div className="mt-3 text-sm">
                        <span className="text-gray-500">Pending:</span> <span className="text-amber-600">{visit.pendingInvestigations}</span>
                      </div>
                    )}
                    {visit.overallNotes && (
                      <div className="mt-3 text-sm">
                        <span className="text-gray-500">Notes:</span> {visit.overallNotes}
                      </div>
                    )}
                    {visit.nurseSignature && (
                      <div className="mt-3 text-sm text-gray-500 italic">
                        Signed: {visit.nurseSignature}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
