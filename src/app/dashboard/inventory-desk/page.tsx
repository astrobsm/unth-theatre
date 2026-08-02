'use client';

// ============================================================
// Inventory Desk
// ------------------------------------------------------------
// A work queue for the people who move stock, not another way to browse it.
// Expired first, because that is a disposal and a write-off; then expiring,
// which is a decision about the operating list; then what has run low.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes } from 'lucide-react';
import DeskShell, { Section, type DeskStat } from '@/components/DeskShell';

interface BatchRow {
  id: string;
  item: string;
  category: string;
  batchNumber: string;
  expiryDate: string | null;
  daysLeft: number | null;
  onHand: number;
  owner: string;
  vendor: string | null;
  value: number;
}

interface LowItem {
  id: string;
  name: string;
  quantity: number;
  reorderLevel: number;
  category: string;
}

export default function InventoryDeskPage() {
  const [stats, setStats] = useState<DeskStat[]>([]);
  const [expired, setExpired] = useState<BatchRow[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<BatchRow[]>([]);
  const [lowItems, setLowItems] = useState<LowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboards/inventory');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStats(data.stats || []);
      setExpired(data.expired || []);
      setExpiringSoon(data.expiringSoon || []);
      setLowItems(data.lowItems || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load the inventory desk');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const BatchTable = ({ rows, showDays }: { rows: BatchRow[]; showDays: boolean }) => (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="text-left px-3 py-2">Item</th>
            <th className="text-left px-3 py-2">Batch</th>
            <th className="text-right px-3 py-2">On hand</th>
            <th className="text-left px-3 py-2">Expiry</th>
            {showDays && <th className="text-right px-3 py-2">Days</th>}
            <th className="text-left px-3 py-2">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t">
              <td className="px-3 py-2">
                <div className="font-medium text-gray-900">{b.item}</div>
                <div className="text-xs text-gray-500">{b.category}</div>
              </td>
              <td className="px-3 py-2 text-gray-600">{b.batchNumber}</td>
              <td className="px-3 py-2 text-right font-medium">{b.onHand}</td>
              <td className="px-3 py-2 text-gray-600">
                {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : '—'}
              </td>
              {showDays && (
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    (b.daysLeft ?? 0) <= 7 ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  {b.daysLeft ?? '—'}
                </td>
              )}
              <td className="px-3 py-2 text-gray-600">
                {b.owner === 'VENDOR' ? b.vendor || 'Vendor' : 'Hospital'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <DeskShell
      title="Inventory Desk"
      subtitle="What needs disposing, ordering or watching today."
      icon={<Boxes className="w-6 h-6 text-indigo-600" />}
      loading={loading}
      error={error}
      onRefresh={load}
      stats={stats}
      footnote="Figures are batch-level and use the received/issued/returned ledger, so they agree with the supply reports rather than approximating them."
    >
      <Section
        title="Expired, still on the shelf"
        count={expired.length}
        empty="Nothing expired is still showing stock on hand."
      >
        <BatchTable rows={expired} showDays={false} />
      </Section>

      <Section
        title="Expiring within 30 days"
        count={expiringSoon.length}
        empty="Nothing expires in the next 30 days."
      >
        <BatchTable rows={expiringSoon} showDays />
      </Section>

      <Section
        title="At or below reorder level"
        count={lowItems.length}
        empty="Every catalogue item is above its reorder level."
      >
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">In stock</th>
                <th className="text-right px-3 py-2">Reorder at</th>
              </tr>
            </thead>
            <tbody>
              {lowItems.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{i.name}</div>
                    <div className="text-xs text-gray-500">{i.category}</div>
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      i.quantity === 0 ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    {i.quantity}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{i.reorderLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="text-xs text-gray-400">
        <Link href="/dashboard/theatre-supply" className="hover:underline">
          Theatre Supply Unit
        </Link>
        {' · '}
        <Link href="/dashboard/theatre-supply/reports" className="hover:underline">
          Supply reports
        </Link>
      </div>
    </DeskShell>
  );
}
