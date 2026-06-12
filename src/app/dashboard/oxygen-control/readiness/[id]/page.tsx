'use client';

/**
 * Oxygen Readiness — full report view.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wind, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface OxygenReadinessReport {
  id: string;
  reportDate: string;
  shiftType: string;
  centralOxygenPressure: number;
  centralOxygenStatus: string;
  cylinderBankLevel: number;
  backupCylindersCount: number;
  backupCylindersStatus: string;
  manifoldSystemOk: boolean;
  pipelineIntegrityOk: boolean;
  theatre1OxygenOk: boolean;
  theatre1Pressure?: number | null;
  theatre2OxygenOk: boolean;
  theatre2Pressure?: number | null;
  theatre3OxygenOk: boolean;
  theatre3Pressure?: number | null;
  theatre4OxygenOk: boolean;
  theatre4Pressure?: number | null;
  recoveryRoomOxygenOk: boolean;
  recoveryRoomPressure?: number | null;
  alarmSystemFunctional: boolean;
  lowPressureAlarmOk: boolean;
  highPressureAlarmOk: boolean;
  predictedShortage: boolean;
  shortageEstimatedTime?: string | null;
  shortageReason?: string | null;
  lastMaintenanceDate?: string | null;
  nextMaintenanceDate?: string | null;
  maintenanceRequired: boolean;
  maintenanceDetails?: string | null;
  overallReadiness: string;
  criticalIssues?: string | null;
  actionTaken?: string | null;
  recommendations?: string | null;
  notes?: string | null;
  reportedBy?: { fullName: string; role?: string } | null;
  verifiedBy?: { fullName: string } | null;
  verifiedAt?: string | null;
  createdAt: string;
}

function readinessColor(status: string) {
  switch (status) {
    case 'READY':
      return 'bg-green-600';
    case 'PARTIALLY_READY':
      return 'bg-yellow-500';
    case 'NOT_READY':
      return 'bg-orange-600';
    case 'CRITICAL':
      return 'bg-red-600';
    default:
      return 'bg-gray-500';
  }
}

function Bool({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-green-700 font-medium">
      <CheckCircle2 className="w-4 h-4" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
      <XCircle className="w-4 h-4" /> No
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900 text-right">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-200 text-blue-900 font-semibold flex items-center gap-2">
        <Wind className="w-4 h-4" /> {title}
      </header>
      <div className="px-5 py-3 text-sm">{children}</div>
    </section>
  );
}

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB') : '—');

export default function OxygenReadinessReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [report, setReport] = useState<OxygenReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/oxygen/readiness/${id}`);
        if (res.ok) {
          setReport(await res.json());
        } else if (res.status === 404) {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading report…
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Link
          href="/dashboard/oxygen-control"
          className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-500" />
          <div className="text-2xl font-semibold text-gray-800">Readiness report not found</div>
          <p className="text-gray-600 max-w-md">
            This oxygen readiness report may have been removed, or the link is no longer valid.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard/oxygen-control/history')}
              className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"
            >
              View History
            </button>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/oxygen-control"
          className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
        </Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium"
        >
          Print / Save PDF
        </button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Oxygen Readiness — Full Report</h1>
          <p className="text-sm text-gray-600">
            {fmtDate(report.reportDate)} · {report.shiftType} shift
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${readinessColor(
            report.overallReadiness
          )}`}
        >
          {report.overallReadiness.replace(/_/g, ' ')}
        </span>
      </header>

      <Section title="Report metadata">
        <Row label="Report date & time">{fmtDate(report.reportDate)}</Row>
        <Row label="Shift">{report.shiftType}</Row>
        <Row label="Overall readiness">{report.overallReadiness.replace(/_/g, ' ')}</Row>
        <Row label="Reported by">
          {report.reportedBy?.fullName ?? '—'}
          {report.reportedBy?.role ? ` (${report.reportedBy.role})` : ''}
        </Row>
        <Row label="Verified by">{report.verifiedBy?.fullName ?? '—'}</Row>
        <Row label="Verified at">{fmtDate(report.verifiedAt)}</Row>
      </Section>

      <Section title="Central oxygen supply">
        <Row label="Central oxygen pressure">{dash(report.centralOxygenPressure)} PSI</Row>
        <Row label="Central oxygen status">{report.centralOxygenStatus}</Row>
        <Row label="Cylinder bank level">{dash(report.cylinderBankLevel)}%</Row>
        <Row label="Backup cylinders count">{dash(report.backupCylindersCount)}</Row>
        <Row label="Backup cylinders status">{report.backupCylindersStatus}</Row>
      </Section>

      <Section title="System integrity">
        <Row label="Manifold system OK"><Bool value={report.manifoldSystemOk} /></Row>
        <Row label="Pipeline integrity OK"><Bool value={report.pipelineIntegrityOk} /></Row>
        <Row label="Alarm system functional"><Bool value={report.alarmSystemFunctional} /></Row>
        <Row label="Low-pressure alarm OK"><Bool value={report.lowPressureAlarmOk} /></Row>
        <Row label="High-pressure alarm OK"><Bool value={report.highPressureAlarmOk} /></Row>
      </Section>

      <Section title="Per-area oxygen availability">
        {[1, 2, 3, 4].map((n) => {
          const ok = report[`theatre${n}OxygenOk` as keyof OxygenReadinessReport] as boolean;
          const p = report[`theatre${n}Pressure` as keyof OxygenReadinessReport] as number | null;
          return (
            <Row key={n} label={`Theatre ${n}`}>
              <Bool value={ok} /> {p != null ? `· ${p} PSI` : ''}
            </Row>
          );
        })}
        <Row label="Recovery room">
          <Bool value={report.recoveryRoomOxygenOk} />{' '}
          {report.recoveryRoomPressure != null ? `· ${report.recoveryRoomPressure} PSI` : ''}
        </Row>
      </Section>

      <Section title="Predicted shortage">
        <Row label="Shortage predicted"><Bool value={report.predictedShortage} /></Row>
        <Row label="Estimated time of shortage">{fmtDate(report.shortageEstimatedTime)}</Row>
        <Row label="Reason">{dash(report.shortageReason)}</Row>
      </Section>

      <Section title="Maintenance">
        <Row label="Last maintenance date">{fmtDate(report.lastMaintenanceDate)}</Row>
        <Row label="Next maintenance date">{fmtDate(report.nextMaintenanceDate)}</Row>
        <Row label="Maintenance required"><Bool value={report.maintenanceRequired} /></Row>
        <Row label="Maintenance details">{dash(report.maintenanceDetails)}</Row>
      </Section>

      <Section title="Issues, actions & notes">
        <Row label="Critical issues">{dash(report.criticalIssues)}</Row>
        <Row label="Action taken">{dash(report.actionTaken)}</Row>
        <Row label="Recommendations">{dash(report.recommendations)}</Row>
        <Row label="Additional notes">{dash(report.notes)}</Row>
      </Section>
    </div>
  );
}
