'use client';

// ============================================================
// The frame every desk shares
// ------------------------------------------------------------
// Headline figures, then whatever that desk has to say. Written once because
// four copies of a stat card is four places to fix a spacing bug, and because
// the desks should look like siblings — a person who learns to read one has
// learned to read all of them.
//
// Every stat may carry an href. A desk is a way IN to the page that owns the
// number, never a second version of it.
// ============================================================

import Link from 'next/link';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export interface DeskStat {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'alert';
  href?: string;
}

const TONE: Record<string, string> = {
  neutral: 'bg-white border-gray-200',
  good: 'bg-green-50 border-green-200',
  warn: 'bg-amber-50 border-amber-200',
  alert: 'bg-red-50 border-red-200',
};

const VALUE_TONE: Record<string, string> = {
  neutral: 'text-gray-900',
  good: 'text-green-800',
  warn: 'text-amber-800',
  alert: 'text-red-800',
};

export function StatGrid({ stats }: { stats: DeskStat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {stats.map((s) => {
        const tone = s.tone ?? 'neutral';
        const body = (
          <>
            <div className={`text-xl sm:text-2xl font-bold ${VALUE_TONE[tone]}`}>{s.value}</div>
            <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
            {s.hint && <div className="text-[11px] text-gray-400 mt-1">{s.hint}</div>}
          </>
        );
        const className = `rounded-xl border p-3 ${TONE[tone]} ${
          s.href ? 'hover:shadow-sm transition block' : ''
        }`;
        return s.href ? (
          <Link key={s.label} href={s.href} className={className}>
            {body}
          </Link>
        ) : (
          <div key={s.label} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count?: number;
  empty?: string;
  children: ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
        {title}
        {count !== undefined && <span className="text-gray-400 font-normal"> ({count})</span>}
      </h2>
      {isEmpty && empty ? (
        <div className="p-6 rounded-xl border border-dashed text-sm text-gray-500 text-center">
          {empty}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default function DeskShell({
  title,
  subtitle,
  icon,
  loading,
  error,
  onRefresh,
  stats,
  children,
  footnote,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  stats: DeskStat[];
  children: ReactNode;
  footnote?: string;
}) {
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {icon}
            {title}
          </h1>
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-lg border hover:bg-gray-50" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && stats.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : (
        <>
          <StatGrid stats={stats} />
          {children}
        </>
      )}

      {footnote && <p className="mt-8 text-xs text-gray-400">{footnote}</p>}
    </div>
  );
}
