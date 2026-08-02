'use client';

// ============================================================
// Finance Desk
// ------------------------------------------------------------
// What is owed to the hospital, and what the hospital owes onward.
//
// Open to management, procurement, and anyone holding a finance duty in the
// imprest system — Chief Accountant, Cashier, Internal Auditor. ORM has no
// FINANCE role, and inventing one would leave two lists of finance staff to
// keep in step.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import DeskShell, { Section, type DeskStat } from '@/components/DeskShell';

interface OverdueRow {
  id: string;
  invoiceNumber: string;
  patientName: string | null;
  procedure: string | null;
  unit: string | null;
  balanceLabel: string;
  dueAt: string | null;
  daysOverdue: number | null;
}

interface QueueRow {
  accountId: string;
  account: string;
  code: string | null;
  kind: string | null;
  amountLabel: string;
  lines: number;
}

export default function FinanceDeskPage() {
  const [stats, setStats] = useState<DeskStat[]>([]);
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboards/finance');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStats(data.stats || []);
      setOverdue(data.overdue || []);
      setQueue(data.settlementQueue || []);
      setByStatus(data.byStatus || {});
    } catch (e: any) {
      setError(e.message || 'Failed to load the finance desk');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DeskShell
      title="Finance Desk"
      subtitle="What is owed to the hospital, and what the hospital owes onward."
      icon={<Wallet className="w-6 h-6 text-emerald-600" />}
      loading={loading}
      error={error}
      onRefresh={load}
      stats={stats}
      footnote="No money moves through ORM. Settlements record that a transfer was made in the bank, with the reference that proves it."
    >
      <Section title="Overdue invoices" count={overdue.length} empty="No invoice is past its due date.">
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Invoice</th>
                <th className="text-left px-3 py-2">Patient</th>
                <th className="text-right px-3 py-2">Balance</th>
                <th className="text-right px-3 py-2">Days late</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{i.invoiceNumber}</div>
                    {i.procedure && <div className="text-xs text-gray-500">{i.procedure}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {i.patientName || '—'}
                    {i.unit && <div className="text-xs text-gray-500">{i.unit}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-red-700">{i.balanceLabel}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{i.daysOverdue ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Awaiting settlement, by account"
        count={queue.length}
        empty="Every distribution has been settled."
      >
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Account</th>
                <th className="text-left px-3 py-2">Kind</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">Lines</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.accountId} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{q.account}</div>
                    {q.code && <div className="text-xs text-gray-500">{q.code}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{q.kind || '—'}</td>
                  <td className="px-3 py-2 text-right font-medium">{q.amountLabel}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{q.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Invoices by status">
        <div className="flex flex-wrap gap-2">
          {Object.entries(byStatus).map(([status, count]) => (
            <span
              key={status}
              className="text-xs px-3 py-1.5 rounded-full border bg-white text-gray-700"
            >
              {status.replace(/_/g, ' ').toLowerCase()}: <strong>{count}</strong>
            </span>
          ))}
          {Object.keys(byStatus).length === 0 && (
            <span className="text-sm text-gray-500">No invoices have been raised yet.</span>
          )}
        </div>
      </Section>

      <div className="text-xs text-gray-400">
        <Link href="/dashboard/theatre-billing" className="hover:underline">
          Theatre Billing
        </Link>
        {' · '}
        <Link href="/dashboard/imprest" className="hover:underline">
          Imprest
        </Link>
      </div>
    </DeskShell>
  );
}
