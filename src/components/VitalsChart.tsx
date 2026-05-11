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

export interface VitalSignsPoint {
  id: string;
  recordedAt: string;
  minutesFromStart: number | null;
  heartRate: number | null;
  systolicBP: number | null;
  diastolicBP: number | null;
  spo2: number | null;
  etco2: number | null;
  temperature: number | null;
  alertTriggered?: boolean;
  alertType?: string | null;
}

interface Props {
  records: VitalSignsPoint[];
  /** Optional anesthesia start time for x-axis ("Min from start") fallback */
  startTimeISO?: string;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function VitalsChart({ records, startTimeISO }: Props) {
  const sorted = useMemo(
    () => [...records].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()),
    [records]
  );

  const labels = useMemo(() => {
    const startMs = startTimeISO ? new Date(startTimeISO).getTime() : sorted[0] ? new Date(sorted[0].recordedAt).getTime() : 0;
    return sorted.map((r) => {
      const min = r.minutesFromStart ?? Math.max(0, Math.round((new Date(r.recordedAt).getTime() - startMs) / 60000));
      return `${formatTime(r.recordedAt)}\n+${min}m`;
    });
  }, [sorted, startTimeISO]);

  const hr = sorted.map((r) => r.heartRate);
  const sbp = sorted.map((r) => r.systolicBP);
  const dbp = sorted.map((r) => r.diastolicBP);
  const spo2 = sorted.map((r) => r.spo2);
  const etco2 = sorted.map((r) => r.etco2);
  const temp = sorted.map((r) => r.temperature);

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

  // Annotate alert points with red borders
  const alertColors = sorted.map((r) => (r.alertTriggered ? '#dc2626' : 'transparent'));

  const cardiac = {
    labels,
    datasets: [
      {
        label: 'Heart Rate (bpm)',
        data: hr,
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220,38,38,0.08)',
        pointBorderColor: alertColors,
        pointBorderWidth: 2,
        spanGaps: true,
        fill: true,
      },
      {
        label: 'Systolic BP (mmHg)',
        data: sbp,
        borderColor: '#1d4ed8',
        backgroundColor: 'transparent',
        spanGaps: true,
      },
      {
        label: 'Diastolic BP (mmHg)',
        data: dbp,
        borderColor: '#60a5fa',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        spanGaps: true,
      },
    ],
  };

  const oxygenation = {
    labels,
    datasets: [
      {
        label: 'SpO₂ (%)',
        data: spo2,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.10)',
        pointBorderColor: alertColors,
        pointBorderWidth: 2,
        spanGaps: true,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'EtCO₂ (mmHg)',
        data: etco2,
        borderColor: '#7c3aed',
        backgroundColor: 'transparent',
        spanGaps: true,
        yAxisID: 'y1',
      },
    ],
  };

  const oxygenationOptions: any = {
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
        title: { display: true, text: 'EtCO₂ (mmHg)' },
        grid: { drawOnChartArea: false },
        suggestedMin: 25,
        suggestedMax: 50,
      },
      x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
    },
  };

  const temperatureChart = {
    labels,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: temp,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.10)',
        spanGaps: true,
        fill: true,
      },
    ],
  };

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-dashed rounded-lg p-8 text-center text-sm text-gray-500">
        No vitals recorded yet. The chart will appear here as soon as the first reading is captured.
      </div>
    );
  }

  // Latest snapshot tiles
  const latest = sorted[sorted.length - 1];
  const Tile = ({ label, value, unit, tone }: { label: string; value: any; unit?: string; tone?: string }) => (
    <div className={`rounded-lg border px-3 py-2 ${tone || 'bg-white'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">
        {value ?? '—'}
        {value != null && unit ? <span className="text-xs text-gray-500 ml-1">{unit}</span> : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Live snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Tile label="HR" value={latest.heartRate} unit="bpm" tone="bg-red-50 border-red-100" />
        <Tile
          label="BP"
          value={latest.systolicBP && latest.diastolicBP ? `${latest.systolicBP}/${latest.diastolicBP}` : null}
          unit="mmHg"
          tone="bg-blue-50 border-blue-100"
        />
        <Tile label="SpO₂" value={latest.spo2} unit="%" tone="bg-sky-50 border-sky-100" />
        <Tile label="EtCO₂" value={latest.etco2} unit="mmHg" tone="bg-violet-50 border-violet-100" />
        <Tile label="Temp" value={latest.temperature} unit="°C" tone="bg-amber-50 border-amber-100" />
        <Tile
          label="Alert"
          value={latest.alertTriggered ? latest.alertType || 'Yes' : 'None'}
          tone={latest.alertTriggered ? 'bg-red-100 border-red-300' : 'bg-emerald-50 border-emerald-100'}
        />
      </div>

      {/* Cardiac chart */}
      <div className="bg-white border rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold text-gray-800">Cardiac — HR &amp; Blood Pressure</h4>
          <span className="text-[11px] text-gray-500">{sorted.length} reading{sorted.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ height: 240 }}>
          <Line data={cardiac} options={baseOptions('bpm / mmHg', 40, 200)} />
        </div>
      </div>

      {/* Oxygenation chart */}
      <div className="bg-white border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">Oxygenation — SpO₂ &amp; EtCO₂</h4>
        <div style={{ height: 220 }}>
          <Line data={oxygenation} options={oxygenationOptions} />
        </div>
      </div>

      {/* Temperature chart */}
      <div className="bg-white border rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">Temperature</h4>
        <div style={{ height: 180 }}>
          <Line data={temperatureChart} options={baseOptions('°C', 34, 39)} />
        </div>
      </div>
    </div>
  );
}
