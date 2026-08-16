'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BoardItem, BoardSeverity } from '@/lib/dashboard/personalBoard';

/**
 * The first thing a person sees when they log in.
 *
 * Deliberately short. Its value comes from being a list somebody actually
 * reads, and a board that shows everything is a board nobody reads — which is
 * how the notification bell already works and why nobody looks at it.
 *
 * Compulsory items carry no dismiss control at all, rather than a dismiss that
 * quietly does nothing.
 */

interface BoardResponse {
  name: string | null;
  role: string;
  summary: string;
  items: BoardItem[];
  counts: { queries: number; tasks: number; warnings: number; overdue: number };
}

const TONE: Record<BoardSeverity, string> = {
  CRITICAL: 'border-red-400 bg-red-50',
  HIGH: 'border-amber-400 bg-amber-50',
  NORMAL: 'border-slate-300 bg-white',
  LOW: 'border-slate-200 bg-slate-50',
};

const KIND_LABEL: Record<string, string> = {
  QUERY: 'Query', WARNING: 'Warning', TASK: 'Today', REMINDER: 'Remember', NOTICE: 'Notice',
};

function dueText(dueAt: BoardItem['dueAt']): string | null {
  if (!dueAt) return null;
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins < -60) return `overdue by ${Math.round(-mins / 60)} h`;
  if (mins < 0) return `overdue by ${-mins} min`;
  if (mins < 60) return `due in ${mins} min`;
  if (mins < 24 * 60) return `due in ${Math.round(mins / 60)} h`;
  return `due ${d.toISOString().slice(0, 10)}`;
}

export default function PersonalBoard() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/my-board')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail || body.error || `Failed (${res.status})`);
        return body as BoardResponse;
      })
      .then((body) => { if (!cancelled) { setData(body); setLoading(false); } })
      .catch((err) => {
        if (cancelled) return;
        // Shown, not swallowed. A board that silently renders nothing is
        // indistinguishable from a board with nothing on it, and one of those
        // means somebody misses a query.
        setError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Loading your board…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-900">Your board could not be loaded.</p>
        <p className="mt-1 text-xs text-red-800">{error}</p>
        <p className="mt-1 text-xs text-red-700">
          Queries and tasks may still be waiting — check the Queries page directly.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { items, counts } = data;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          {data.name ? `Good day, ${data.name.split(' ')[0]}` : 'Your board'}
        </h2>
        <p className={`mt-0.5 text-sm ${counts.overdue > 0 ? 'font-medium text-red-700' : 'text-slate-600'}`}>
          {data.summary}
        </p>
      </header>

      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const due = dueText(item.dueAt);
          return (
            <li key={item.id} className={`border-l-4 px-4 py-3 ${TONE[item.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {KIND_LABEL[item.kind] ?? item.kind}
                    </span>
                    {item.compulsory && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        required
                      </span>
                    )}
                    {due && (
                      <span className={`text-[11px] ${due.startsWith('overdue') ? 'font-medium text-red-700' : 'text-slate-500'}`}>
                        {due}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">{item.title}</p>
                  {item.detail && (
                    <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
                  )}
                </div>

                {item.actionUrl && (
                  <Link
                    href={item.actionUrl}
                    className="shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    {item.actionLabel ?? 'Open'}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {items.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          Nothing needs you right now.
        </p>
      )}
    </section>
  );
}
