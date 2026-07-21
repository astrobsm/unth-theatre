'use client';

/**
 * Chart.js setup in one place, so pages can pull charts in lazily.
 *
 * chart.js + react-chartjs-2 are ~250 KB. Importing them statically put that on
 * a route's first load whether or not a chart ever rendered. Everything here is
 * meant to be reached through `next/dynamic`, which keeps the cost with the
 * chart instead of the page:
 *
 *   const Bar = dynamic(() => import('@/components/charts/ChartKit').then(m => m.Bar), { ssr: false });
 *
 * Registration runs once on import — importing this module is what arms Chart.js.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler
);

export { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
export { ChartJS };
