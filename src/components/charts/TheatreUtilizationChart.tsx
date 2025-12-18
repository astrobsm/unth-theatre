'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface TheatreUtilizationChartProps {
  data: {
    theatres: string[];
    utilization: number[];
  };
}

export default function TheatreUtilizationChart({ data }: TheatreUtilizationChartProps) {
  const chartData = {
    labels: data.theatres,
    datasets: [
      {
        label: 'Utilization Rate (%)',
        data: data.utilization,
        backgroundColor: data.utilization.map((value) => {
          if (value >= 80) return 'rgba(34, 197, 94, 0.8)';
          if (value >= 60) return 'rgba(251, 191, 36, 0.8)';
          return 'rgba(239, 68, 68, 0.8)';
        }),
        borderColor: data.utilization.map((value) => {
          if (value >= 80) return 'rgb(34, 197, 94)';
          if (value >= 60) return 'rgb(251, 191, 36)';
          return 'rgb(239, 68, 68)';
        }),
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Theatre Utilization Rate',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: function (value: any) {
            return value + '%';
          },
        },
      },
    },
  };

  return (
    <div className="h-80">
      <Bar data={chartData} options={options} />
    </div>
  );
}
