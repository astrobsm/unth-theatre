'use client';

// ============================================================
// Vendor Accounts
// ------------------------------------------------------------
// The HOSPITAL's view of what it owes outside parties. Not a vendor login —
// ORM has no vendor accounts and this page does not pretend otherwise.
//
// Bank account numbers are shown as last-four only. The settlement page shows
// the full number to the person actually making a transfer; a summary screen
// has no business holding it.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Store } from 'lucide-react';
import DeskShell, { Section, type DeskStat } from '@/components/DeskShell';

interface VendorRow {
  id: string;
  name: string;
  phone: string | null;
  bankName: string | null;
  accountLast4: string | null;
  batches: number;
  onConsignment: number;
  onConsignmentLabel: string;
  expiredUnits: number;
  owed: number;
  owedLabel: string;
}

interface SettlementRow {
  account: string;
  amountLabel: string;
  settledAt: string | null;
  reference: string | null;
}

export default function VendorDeskPage() {
  const [stats, setStats] = useState<DeskStat[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboards/vendor');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStats(data.stats || []);
      setVendors(data.vendors || []);
      setSettlements(data.recentSettlements || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load vendor accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DeskShell
      title="Vendor Accounts"
      subtitle="Consignment stock held, and what is owed once it is used."
      icon={<Store className="w-6 h-6 text-purple-600" />}
      loading={loading}
      error={error}
      onRefresh={load}
      stats={stats}
      footnote="This is the hospital's view of its vendor accounts. Vendors do not have logins to ORM. Bank account numbers are shown as the last four digits only — the settlement page shows the full number to whoever is making the transfer."
    >
      <Section title="Vendors" count={vendors.length} empty="No active vendors are recorded.">
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-right px-3 py-2">Owed</th>
                <th className="text-right px-3 py-2">Stock held</th>
                <th className="text-right px-3 py-2">Batches</th>
                <th className="text-right px-3 py-2">Expired units</th>
                <th className="text-left px-3 py-2">Bank</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{v.name}</div>
                    {v.phone && <div className="text-xs text-gray-500">{v.phone}</div>}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      v.owed ? 'text-amber-800' : 'text-gray-400'
                    }`}
                  >
                    {v.owedLabel}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{v.onConsignmentLabel}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{v.batches}</td>
                  <td
                    className={`px-3 py-2 text-right ${
                      v.expiredUnits ? 'text-red-700 font-medium' : 'text-gray-400'
                    }`}
                  >
                    {v.expiredUnits || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {v.bankName || '—'}
                    {v.accountLast4 ? ` ••••${v.accountLast4}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Recently settled"
        count={settlements.length}
        empty="Nothing has been settled yet."
      >
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Account</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Settled</th>
                <th className="text-left px-3 py-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s, i) => (
                <tr key={`${s.reference}-${i}`} className="border-t">
                  <td className="px-3 py-2 text-gray-900">{s.account}</td>
                  <td className="px-3 py-2 text-right font-medium">{s.amountLabel}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {s.settledAt ? new Date(s.settledAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{s.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="text-xs text-gray-400">
        <Link href="/dashboard/theatre-billing" className="hover:underline">
          Theatre Billing — settlements
        </Link>
      </div>
    </DeskShell>
  );
}
