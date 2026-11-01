'use client';

// ============================================================
// One CSSD inventory item
// ------------------------------------------------------------
// The "View" button on every row of the CSSD inventory led here, and there
// was no page here. What the list cannot show, and what this page is for, is
// the item's two histories: where it has been issued, and how it has been
// sterilised. A set that failed its last biological indicator looks identical
// on the list to one that passed.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Box, CheckCircle2, Clock, Package, ShieldAlert, XCircle,
} from 'lucide-react';

interface Person { fullName: string; staffCode?: string | null }

interface Usage {
  id: string;
  quantityIssued: number;
  quantityReturned: number | null;
  issuedToWard: string | null;
  issuedToTheatre: string | null;
  issuedAt: string;
  returnedAt: string | null;
  purpose: string | null;
  issuedBy: Person | null;
  surgery: { id: string; procedureName: string; surgeryType: string | null } | null;
}

interface SterilizationLog {
  id: string;
  batchNumber: string;
  sterilizationMethod: string;
  quantity: number;
  startedAt: string;
  completedAt: string | null;
  temperature: string | null;
  pressure: string | null;
  cycleTime: number | null;
  biologicalIndicator: boolean;
  chemicalIndicator: boolean;
  status: string;
  failureReason: string | null;
  operator: Person | null;
  verifiedBy: Person | null;
}

interface Item {
  id: string;
  itemName: string;
  itemCode: string;
  packType: string;
  surgicalUnit: string;
  totalQuantity: number;
  availableQuantity: number;
  inUseQuantity: number;
  sterilizingQuantity: number;
  minimumStockLevel: number;
  status: string;
  lastSterilizedDate: string | null;
  expiryDate: string | null;
  location: string | null;
  supplierName: string | null;
  notes: string | null;
  updatedBy: Person | null;
  updatedAt: string;
  usageHistory: Usage[];
  sterilizationLogs: SterilizationLog[];
}

const words = (s: string) => (s || '').replace(/_/g, ' ');
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—');
const when = (v: string | null) => (v
  ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : '—');

export default function CssdItemPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cssd-inventory/${id}`);
      if (res.status === 404) { setMissing(true); return; }
      if (!res.ok) return;
      const data = await res.json();
      setItem(data.inventoryItem ?? data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-lg">Loading…</div>;
  }

  if (missing || !item) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/cssd/inventory" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to CSSD inventory
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <Package className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">That item is no longer in the inventory.</p>
        </div>
      </div>
    );
  }

  const low = item.availableQuantity <= item.minimumStockLevel;
  const expired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;

  const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
    <div className={`rounded-lg border p-4 ${tone ?? 'border-gray-200 bg-white'}`}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/dashboard/cssd/inventory" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to CSSD inventory
      </Link>

      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Box className="w-7 h-7 text-blue-600" />
            {item.itemName}
          </h1>
          <p className="text-gray-600 mt-1">
            {item.itemCode} · {words(item.packType)} · {item.surgicalUnit}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 self-start">
          {words(item.status)}
        </span>
      </div>

      {(low || expired) && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            {expired && <div>This item is past its expiry date ({day(item.expiryDate)}).</div>}
            {low && <div>Only {item.availableQuantity} available, against a minimum of {item.minimumStockLevel}.</div>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Available" value={item.availableQuantity} tone={low ? 'border-amber-300 bg-amber-50' : undefined} />
        <Stat label="In use" value={item.inUseQuantity} />
        <Stat label="Sterilizing" value={item.sterilizingQuantity} />
        <Stat label="Total held" value={item.totalQuantity} />
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Row label="Stored at">{item.location || 'Not recorded'}</Row>
        <Row label="Supplier">{item.supplierName || 'Not recorded'}</Row>
        <Row label="Last sterilized">{day(item.lastSterilizedDate)}</Row>
        <Row label="Expires">{day(item.expiryDate)}</Row>
        <Row label="Minimum stock level">{item.minimumStockLevel}</Row>
        <Row label="Last updated">
          {when(item.updatedAt)}{item.updatedBy ? ` · ${item.updatedBy.fullName}` : ''}
        </Row>
        {item.notes && <div className="md:col-span-2"><Row label="Notes"><span className="whitespace-pre-wrap">{item.notes}</span></Row></div>}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sterilization log</h2>
        {item.sterilizationLogs.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {item.sterilizationLogs.map((l) => (
              <div key={l.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-gray-900">
                    Batch {l.batchNumber} · {l.sterilizationMethod} · {l.quantity} item{l.quantity === 1 ? '' : 's'}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                    l.status === 'SUCCESSFUL' ? 'bg-green-100 text-green-800'
                      : l.status === 'FAILED' ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {l.status === 'SUCCESSFUL' ? <CheckCircle2 className="w-3 h-3" /> : l.status === 'FAILED' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {words(l.status)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {when(l.startedAt)}{l.completedAt ? ` → ${when(l.completedAt)}` : ''}
                  {l.cycleTime ? ` · ${l.cycleTime} min` : ''}
                  {l.temperature ? ` · ${l.temperature}` : ''}
                  {l.pressure ? ` · ${l.pressure}` : ''}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Biological indicator: {l.biologicalIndicator ? 'passed' : 'not recorded'}
                  {' · '}Chemical indicator: {l.chemicalIndicator ? 'passed' : 'not recorded'}
                </div>
                {l.failureReason && <div className="text-sm text-red-700 mt-1">{l.failureReason}</div>}
                <div className="text-xs text-gray-500 mt-2">
                  Operator {l.operator?.fullName ?? 'unknown'}
                  {l.verifiedBy ? ` · verified by ${l.verifiedBy.fullName}` : ' · not verified'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Where it has been issued</h2>
        {item.usageHistory.length === 0 ? (
          <p className="text-sm text-gray-500">Never issued.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issued</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Case</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {item.usageHistory.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-900">{when(u.issuedAt)}</td>
                    <td className="px-4 py-2 text-gray-900">{u.quantityIssued}</td>
                    <td className="px-4 py-2 text-gray-700">{u.issuedToTheatre || u.issuedToWard || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {u.surgery ? (
                        <Link href={`/dashboard/surgeries/${u.surgery.id}`} className="text-blue-600 hover:underline">
                          {u.surgery.procedureName}
                        </Link>
                      ) : (u.purpose || '—')}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{u.issuedBy?.fullName ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {u.returnedAt ? `${u.quantityReturned ?? ''} on ${day(u.returnedAt)}` : 'Not yet'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
