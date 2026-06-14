'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface PACUVitalRecord {
  id: string;
  recordedAt: string;
  bloodPressure?: string | null; // "120/80"
  systolicBP?: number | null;
  diastolicBP?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  temperature?: number | null;
  painScore?: number | null;
}

interface Props {
  records: PACUVitalRecord[];
  /** PACU admission time, used as the x-axis "minutes from admission" origin */
  admissionTimeISO?: string;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Split a "120/80" blood-pressure string into systolic & diastolic numbers. */
function parseBP(bp?: string | null): { systolic: number | null; diastolic: number | null } {
  if (!bp || typeof bp !== 'string') return { systolic: null, diastolic: null };
  const m = bp.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!m) return { systolic: null, diastolic: null };
  return { systolic: parseInt(m[1], 10), diastolic: parseInt(m[2], 10) };
}

export default function PACUVitalsTrendChart({ records, admissionTimeISO }: Props) {
  const sorted = useMemo(
    () =>
      [...records].sort(
        (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      ),
    [records]
  );

  const labels = useMemo(() => {
    const startMs = admissionTimeISO
      ? new Date(admissionTimeISO).getTime()
      : sorted[0]
      ? new Date(sorted[0].recordedAt).getTime()
      : 0;
    return sorted.map((r) => {
      const min = Math.max(0, Math.round((new Date(r.recordedAt).getTime() - startMs) / 60000));
      return `${formatTime(r.recordedAt)}  +${min}m`;
    });
  }, [sorted, admissionTimeISO]);

  const series = useMemo(() => {
    const hr: (number | null)[] = [];
    const sbp: (number | null)[] = [];
    const dbp: (number | null)[] = [];
    const rr: (number | null)[] = [];
    const spo2: (number | null)[] = [];
    const temp: (number | null)[] = [];
    const pain: (number | null)[] = [];
    for (const r of sorted) {
      const bp = parseBP(r.bloodPressure);
      hr.push(r.heartRate ?? null);
      sbp.push(r.systolicBP ?? bp.systolic);
      dbp.push(r.diastolicBP ?? bp.diastolic);
      rr.push(r.respiratoryRate ?? null);
      spo2.push(r.oxygenSaturation ?? null);
      temp.push(r.temperature != null ? Number(r.temperature) : null);
      pain.push(r.painScore ?? null);
    }
    return { hr, sbp, dbp, rr, spo2, temp, pain };
  }, [sorted]);

  const baseOptions = (yLabel: string, suggestedMin?: number, suggestedMax?: number): any => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      y: {
        title: { display: true, text: yLabel, font: { size: 11 } },
        suggestedMin,
        suggestedMax,
        ticks: { font: { size: 10 } },
      },
      x: {
        ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
      },
    },
    elements: { point: { radius: 3, hoverRadius: 5 }, line: { tension: 0.25 } },
  });

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-dashed rounded-lg p-8 text-center text-sm text-gray-500">
        No vitals recorded yet. The trend graphs will appear here automatically once the first
        reading is captured.
      </div>
    );
  }

  if (sorted.length === 1) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center text-sm text-amber-800">
        Only one reading recorded so far. Record at least two readings to see the trend graphs.
      </div>
    );
  }

  const cardiac = {
    labels,
    datasets: [
      {
        label: 'Heart Rate (bpm)',
        data: series.hr,
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220,38,38,0.08)',
        spanGaps: true,
        fill: true,
      },
      {
        label: 'Systolic BP (mmHg)',
        data: series.sbp,
        borderColor: '#1d4ed8',
        backgroundColor: 'transparent',
        spanGaps: true,
      },
      {
        label: 'Diastolic BP (mmHg)',
        data: series.dbp,
        borderColor: '#60a5fa',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        spanGaps: true,
      },
    ],
  };

  const respiratory = {
    labels,
    datasets: [
      {
        label: 'SpO₂ (%)',
        data: series.spo2,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.10)',
        spanGaps: true,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Respiratory Rate (/min)',
        data: series.rr,
        borderColor: '#7c3aed',
        backgroundColor: 'transparent',
        spanGaps: true,
        yAxisID: 'y1',
      },
    ],
  };

  const respiratoryOptions: any = {
    ...baseOptions('SpO₂ (%)', 80, 100),
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        title: { display: true, text: 'SpO₂ (%)' },
        suggestedMin: 80,
        suggestedMax: 100,
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        title: { display: true, text: 'Resp. Rate (/min)' },
        grid: { drawOnChartArea: false },
        suggestedMin: 5,
        suggestedMax: 40,
      },
      x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
    },
  };

  const tempPain = {
    labels,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: series.temp,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.10)',
        spanGaps: true,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Pain Score (0-10)',
        data: series.pain,
        borderColor: '#db2777',
        backgroundColor: 'transparent',
        spanGaps: true,
        yAxisID: 'y1',
      },
    ],
  };

  const tempPainOptions: any = {
    ...baseOptions('°C', 34, 40),
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        title: { display: true, text: 'Temperature (°C)' },
        suggestedMin: 34,
        suggestedMax: 40,
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        title: { display: true, text: 'Pain (0-10)' },
        grid: { drawOnChartArea: false },
        suggestedMin: 0,
        suggestedMax: 10,
      },
      x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Vital Signs Trend</h3>
        <span className="text-xs text-gray-500">
          {sorted.length} reading{sorted.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Cardiac chart */}
      <div className="bg-white border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">Cardiac — Heart Rate &amp; Blood Pressure</h4>
        <div className="h-60">
          <Line data={cardiac} options={baseOptions('bpm / mmHg', 40, 200)} />
        </div>
      </div>

      {/* Respiratory chart */}
      <div className="bg-white border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">Respiratory — SpO₂ &amp; Respiratory Rate</h4>
        <div className="h-56">
          <Line data={respiratory} options={respiratoryOptions} />
        </div>
      </div>

      {/* Temperature & pain chart */}
      <div className="bg-white border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">Temperature &amp; Pain Score</h4>
        <div className="h-52">
          <Line data={tempPain} options={tempPainOptions} />
        </div>
      </div>
    </div>
  );
}
