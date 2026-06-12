'use client';

/**
 * Patient Journey — ward → theatre → back to ward, for a single surgery.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  BedDouble,
  Truck,
  ClipboardCheck,
  Activity,
  HeartPulse,
} from 'lucide-react';

interface Movement {
  phase: string;
  label: string;
  time?: string;
  recordedBy?: string;
  notes?: string;
}
interface TimelineEntry {
  stage: string;
  label: string;
  time?: string;
}
interface TransportLeg {
  fromLocation: string;
  toLocation: string;
  transportType?: string;
  porterName: string;
  startTime?: string;
  endTime?: string;
  receivedBy?: string;
}
interface JourneyData {
  surgery: {
    id: string;
    procedureName: string;
    unit?: string;
    status: string;
    scheduledDate?: string;
    scheduledTime?: string;
    surgeonName?: string;
    anesthetistName?: string;
  };
  patient: {
    name?: string;
    folderNumber?: string;
    ptNumber?: string;
    age?: number;
    gender?: string;
    ward?: string;
  };
  pacuAssessmentId?: string | null;
  dischargedTo?: string;
  movements: Movement[];
  timeline: TimelineEntry[];
  transport: TransportLeg[];
  callUp?: {
    ward?: string;
    theatreName?: string;
    assignedPorterName?: string;
    assignedNurseName?: string;
    wardNurseName?: string;
    wardEntriesNotes?: string;
  };
  holdingArea?: { arrivalTime?: string; receivedBy?: string; status?: string };
}

const fmt = (s?: string) => (s ? new Date(s).toLocaleString('en-GB') : '—');

const STAGE_STYLES: Record<string, { dot: string; chip: string }> = {
  Ward: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700' },
  Transit: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700' },
  Holding: { dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-700' },
  Theatre: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700' },
  Recovery: { dot: 'bg-green-500', chip: 'bg-green-50 text-green-700' },
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-200 text-gray-800 font-semibold flex items-center gap-2">
        {icon} {title}
      </header>
      <div className="px-5 py-4 text-sm">{children}</div>
    </section>
  );
}

export default function PatientJourneyPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [data, setData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/surgeries/${id}/journey`);
        if (res.ok) {
          setData(await res.json());
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
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading patient journey…
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Link
          href="/dashboard/surgeries/completed"
          className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Completed Surgeries
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-500" />
          <div className="text-2xl font-semibold text-gray-800">Surgery not found</div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { surgery, patient, movements, timeline, transport, callUp, holdingArea } = data;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/surgeries/completed"
          className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Completed Surgeries
        </Link>
        <div className="flex items-center gap-2">
          {data.pacuAssessmentId && (
            <Link
              href={`/api/pacu/${data.pacuAssessmentId}/discharge-pdf`}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              Full Perioperative Record (PDF)
            </Link>
          )}
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium"
          >
            Print
          </button>
        </div>
      </div>

      <header>
        <h1 className="text-2xl font-bold text-gray-900">Patient Journey</h1>
        <p className="text-sm text-gray-600">Ward → Theatre → Ward</p>
      </header>

      {/* Patient + surgery summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Patient" icon={<BedDouble className="w-4 h-4 text-blue-600" />}>
          <dl className="space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium text-gray-900">{patient.name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Folder no.</dt>
              <dd className="font-medium text-gray-900">{patient.folderNumber || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Age / Sex</dt>
              <dd className="font-medium text-gray-900">
                {patient.age ?? '—'} / {patient.gender || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Ward</dt>
              <dd className="font-medium text-gray-900">{patient.ward || callUp?.ward || '—'}</dd>
            </div>
          </dl>
        </Section>
        <Section title="Surgery" icon={<Activity className="w-4 h-4 text-red-600" />}>
          <dl className="space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Procedure</dt>
              <dd className="font-medium text-gray-900 text-right">{surgery.procedureName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Operating unit</dt>
              <dd className="font-medium text-gray-900 text-right">{surgery.unit || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Theatre</dt>
              <dd className="font-medium text-gray-900 text-right">{callUp?.theatreName || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Surgeon</dt>
              <dd className="font-medium text-gray-900 text-right">{surgery.surgeonName || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Date</dt>
              <dd className="font-medium text-gray-900 text-right">
                {surgery.scheduledDate
                  ? new Date(surgery.scheduledDate).toLocaleDateString('en-GB')
                  : '—'}{' '}
                {surgery.scheduledTime || ''}
              </dd>
            </div>
          </dl>
        </Section>
      </div>

      {/* Movement phases */}
      <Section title="Movement phases" icon={<Truck className="w-4 h-4 text-amber-600" />}>
        {movements.length === 0 ? (
          <p className="text-gray-500">No movement records were logged for this patient.</p>
        ) : (
          <ol className="space-y-3">
            {movements.map((m, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                <div>
                  <div className="font-medium text-gray-900">{m.label}</div>
                  <div className="text-xs text-gray-500">{fmt(m.time)}</div>
                  {m.recordedBy && (
                    <div className="text-xs text-gray-500">Recorded by {m.recordedBy}</div>
                  )}
                  {m.notes && <div className="text-xs text-gray-600 mt-0.5">{m.notes}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Detailed timeline */}
      <Section title="Detailed timeline" icon={<ClipboardCheck className="w-4 h-4 text-purple-600" />}>
        {timeline.length === 0 ? (
          <p className="text-gray-500">No timestamped events were recorded.</p>
        ) : (
          <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
            {timeline.map((t, i) => {
              const style = STAGE_STYLES[t.stage] || STAGE_STYLES.Ward;
              return (
                <li key={i} className="ml-4">
                  <span
                    className={`absolute -left-[7px] mt-1 w-3 h-3 rounded-full ${style.dot}`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${style.chip}`}>
                      {t.stage}
                    </span>
                    <span className="font-medium text-gray-900">{t.label}</span>
                  </div>
                  <div className="text-xs text-gray-500">{fmt(t.time)}</div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {/* Transport legs */}
      {transport.length > 0 && (
        <Section title="Transport legs" icon={<Truck className="w-4 h-4 text-amber-600" />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">From</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">To</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Porter</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Start</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">End</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Received by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transport.map((t, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-900">{t.fromLocation}</td>
                    <td className="px-3 py-2 text-gray-900">{t.toLocation}</td>
                    <td className="px-3 py-2 text-gray-700">{t.porterName}</td>
                    <td className="px-3 py-2 text-gray-600">{fmt(t.startTime)}</td>
                    <td className="px-3 py-2 text-gray-600">{fmt(t.endTime)}</td>
                    <td className="px-3 py-2 text-gray-700">{t.receivedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Recovery / discharge */}
      <Section title="Recovery & discharge" icon={<HeartPulse className="w-4 h-4 text-green-600" />}>
        <dl className="space-y-1">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Holding area arrival</dt>
            <dd className="font-medium text-gray-900">{fmt(holdingArea?.arrivalTime)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Discharged to</dt>
            <dd className="font-medium text-gray-900">{data.dischargedTo || '—'}</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
