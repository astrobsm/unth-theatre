'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shirt,
  PackagePlus,
  ArrowRightLeft,
  WashingMachine,
  CalendarClock,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Clock,
  Users,
  ShieldAlert,
} from 'lucide-react';

// ----------------------------------------------------------------- types
interface ScrubSet {
  id: string;
  serialNumber: string;
  color: string;
  size: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  currentHolderName: string | null;
}

interface Staff {
  id: string;
  fullName: string;
  role: string;
  staffCode: string | null;
}

interface Stats {
  total: number;
  inUse: number;
  inCleaning: number;
  reserve: number;
  available: number;
  missing: number;
  retired: number;
}

interface Txn {
  id: string;
  serialNumber: string;
  color: string;
  userName: string;
  userRole: string | null;
  status: string;
  issuedAt: string;
  dueBack: string | null;
  returnedAt: string | null;
  footwearSerial?: string | null;
  footwearSize?: string | null;
  footwearReturned?: boolean;
}

interface LaundryItem {
  id: string;
  serialNumber: string;
  color: string;
  received: boolean;
  ready: boolean;
  missing: boolean;
}

interface LaundryBatch {
  id: string;
  shift: string;
  status: string;
  expectedCount: number;
  receivedCount: number;
  readyCount: number;
  missingCount: number;
  readyForNextDay: boolean;
  items: LaundryItem[];
}

interface Shift {
  id: string;
  shiftType: string;
  managerName: string | null;
  staffNames: string;
  targetStaffCount: number;
  theatreStaffServed: number;
  notes: string | null;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: string;
}

// ---------------------------------------------------------------- helpers
const COLOR_OPTIONS = [
  'GREEN',
  'BLUE',
  'MAROON',
  'TEAL',
  'GREY',
  'BLACK',
  'NAVY',
];

const COLOR_STYLES: Record<string, string> = {
  GREEN: 'bg-green-100 text-green-800 border-green-300',
  BLUE: 'bg-blue-100 text-blue-800 border-blue-300',
  MAROON: 'bg-rose-100 text-rose-800 border-rose-300',
  TEAL: 'bg-teal-100 text-teal-800 border-teal-300',
  GREY: 'bg-gray-100 text-gray-700 border-gray-300',
  BLACK: 'bg-slate-800 text-white border-slate-800',
  NAVY: 'bg-indigo-100 text-indigo-800 border-indigo-300',
};

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-gray-100 text-gray-700',
  RESERVE: 'bg-emerald-100 text-emerald-800',
  IN_USE: 'bg-blue-100 text-blue-800',
  IN_CLEANING: 'bg-amber-100 text-amber-800',
  MISSING: 'bg-red-100 text-red-800',
  RETIRED: 'bg-slate-200 text-slate-600',
};

function colorChip(color: string) {
  return COLOR_STYLES[color] || 'bg-gray-100 text-gray-700 border-gray-300';
}

const TABS = [
  { id: 'desk', label: 'Sign Out / Return', icon: ArrowRightLeft },
  { id: 'inventory', label: 'Inventory', icon: Shirt },
  { id: 'laundry', label: 'Laundry', icon: WashingMachine },
  { id: 'shifts', label: 'Shift Roster', icon: CalendarClock },
  { id: 'reports', label: 'Reports & Alerts', icon: BarChart3 },
];

export default function ScrubManagementPage() {
  const [tab, setTab] = useState('desk');

  // shared inventory data
  const [sets, setSets] = useState<ScrubSet[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/scrubs');
      const data = await res.json();
      setSets(data.sets || []);
      setStaff(data.staff || []);
      setStats(data.stats || null);
    } catch {
      flash('err', 'Failed to load scrub inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-sm">
            <Shirt className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Scrub Management
            </h1>
            <p className="text-xs text-gray-500">
              Color-coded, serial-tracked scrub sign-out, laundry &amp; rosters
            </p>
          </div>
        </div>
        <button
          onClick={loadInventory}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stat tiles */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
          {[
            { label: 'Total', value: stats.total, c: 'text-gray-900' },
            { label: 'In Use', value: stats.inUse, c: 'text-blue-700' },
            { label: 'Cleaning', value: stats.inCleaning, c: 'text-amber-700' },
            { label: 'Reserve', value: stats.reserve, c: 'text-emerald-700' },
            { label: 'Available', value: stats.available, c: 'text-gray-700' },
            { label: 'Missing', value: stats.missing, c: 'text-red-700' },
          ].map((t) => (
            <div
              key={t.label}
              className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm"
            >
              <div className={`text-2xl font-bold ${t.c}`}>{t.value}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">
                {t.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {msg && (
        <div
          className={`mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
            msg.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {msg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
                active
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : (
        <>
          {tab === 'desk' && (
            <DeskTab
              sets={sets}
              staff={staff}
              busy={busy}
              setBusy={setBusy}
              flash={flash}
              reload={loadInventory}
            />
          )}
          {tab === 'inventory' && (
            <InventoryTab
              sets={sets}
              staff={staff}
              busy={busy}
              setBusy={setBusy}
              flash={flash}
              reload={loadInventory}
            />
          )}
          {tab === 'laundry' && <LaundryTab flash={flash} reload={loadInventory} />}
          {tab === 'shifts' && <ShiftTab flash={flash} />}
          {tab === 'reports' && <ReportTab flash={flash} />}
        </>
      )}
    </div>
  );
}

// ============================================================ Sign Out / Return
function DeskTab({
  sets,
  staff,
  busy,
  setBusy,
  flash,
  reload,
}: {
  sets: ScrubSet[];
  staff: Staff[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (k: 'ok' | 'err', t: string) => void;
  reload: () => void;
}) {
  const [serial, setSerial] = useState('');
  const [wearerId, setWearerId] = useState('');
  const [footwearSerial, setFootwearSerial] = useState('');
  const [footwearSize, setFootwearSize] = useState('42');
  const [openTxns, setOpenTxns] = useState<Txn[]>([]);

  const loadOpen = useCallback(async () => {
    try {
      const res = await fetch('/api/scrubs/transactions?open=true');
      const data = await res.json();
      setOpenTxns(data.transactions || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadOpen();
  }, [loadOpen]);

  const submit = async (action: 'issue' | 'return') => {
    if (!serial.trim()) {
      flash('err', 'Enter a scrub serial number');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/scrubs/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          serialNumber: serial.trim(),
          userId: action === 'issue' ? wearerId || undefined : undefined,
          footwearSerial:
            action === 'issue' ? footwearSerial.trim() || undefined : undefined,
          footwearSize:
            action === 'issue' ? footwearSize || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('err', data.error || 'Action failed');
      } else {
        flash(
          'ok',
          action === 'issue'
            ? `Signed out ${serial.trim()}`
            : `Returned ${serial.trim()} → laundry`,
        );
        setSerial('');
        setWearerId('');
        setFootwearSerial('');
        loadOpen();
        reload();
      }
    } catch {
      flash('err', 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const isOverdue = (t: Txn) => t.dueBack && new Date(t.dueBack) < new Date();

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Action card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-1">Sign out / return</h2>
        <p className="text-xs text-gray-500 mb-4">
          Each staff member must return the exact serial they signed out.
        </p>

        <label className="block text-xs font-medium text-gray-600 mb-1">
          Scrub serial number
        </label>
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
            placeholder="e.g. SCR-GRN-0042"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">
          Wearer (for sign-out — defaults to set owner)
        </label>
        <select
          value={wearerId}
          onChange={(e) => setWearerId(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-4 focus:border-teal-500 focus:outline-none"
        >
          <option value="">— Set owner / current staff —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} ({s.role})
            </option>
          ))}
        </select>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Clean footwear serial (issued with scrub)
            </label>
            <input
              value={footwearSerial}
              onChange={(e) => setFootwearSerial(e.target.value.toUpperCase())}
              placeholder="e.g. CLG-GRN-0042"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Size (EU)
            </label>
            <select
              value={footwearSize}
              onChange={(e) => setFootwearSize(e.target.value)}
              title="Footwear size"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            >
              {['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'].map(
                (z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => submit('issue')}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowRightLeft className="w-4 h-4" /> Sign Out
          </button>
          <button
            onClick={() => submit('return')}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Return
          </button>
        </div>
      </div>

      {/* Outstanding card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">
            Currently signed out ({openTxns.length})
          </h2>
          <Clock className="w-4 h-4 text-gray-400" />
        </div>
        {openTxns.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No scrubs are currently out.
          </p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {openTxns.map((t) => (
              <div
                key={t.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border ${
                  isOverdue(t)
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${colorChip(
                      t.color,
                    )}`}
                  >
                    {t.color}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {t.serialNumber}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {t.userName}
                    </div>
                    {t.footwearSerial && (
                      <div className="text-[11px] text-teal-700 truncate">
                        👟 {t.footwearSerial}
                        {t.footwearSize ? ` · sz ${t.footwearSize}` : ''}
                      </div>
                    )}
                  </div>
                </div>
                {isOverdue(t) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-red-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> Overdue
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setSerial(t.serialNumber);
                    }}
                    className="text-[11px] text-teal-700 hover:underline"
                  >
                    Select
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =================================================================== Inventory
function InventoryTab({
  sets,
  staff,
  busy,
  setBusy,
  flash,
  reload,
}: {
  sets: ScrubSet[];
  staff: Staff[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (k: 'ok' | 'err', t: string) => void;
  reload: () => void;
}) {
  const [serial, setSerial] = useState('');
  const [color, setColor] = useState('GREEN');
  const [size, setSize] = useState('M');
  const [ownerId, setOwnerId] = useState('');
  const [filterColor, setFilterColor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const register = async () => {
    if (!serial.trim()) {
      flash('err', 'Serial number required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/scrubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber: serial.trim(),
          color,
          size,
          ownerId: ownerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) flash('err', data.error || 'Failed to register');
      else {
        flash('ok', `Registered ${serial.trim()}`);
        setSerial('');
        setOwnerId('');
        reload();
      }
    } catch {
      flash('err', 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const filtered = sets.filter(
    (s) =>
      (!filterColor || s.color === filterColor) &&
      (!filterStatus || s.status === filterStatus),
  );

  return (
    <div className="space-y-5">
      {/* Register */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <PackagePlus className="w-5 h-5 text-teal-600" /> Register a scrub set
        </h2>
        <div className="grid sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Serial number
            </label>
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value.toUpperCase())}
              placeholder="SCR-GRN-0042"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Color
            </label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Size
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            >
              {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Owner (optional)
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            >
              <option value="">— Unassigned —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Tip: allocate at least 3 sets per staff member — one in use, one in
          cleaning, one in reserve.
        </p>
        <button
          onClick={register}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          <PackagePlus className="w-4 h-4" /> Register set
        </button>
      </div>

      {/* List */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="font-semibold text-gray-900 mr-auto">
            All sets ({filtered.length})
          </h2>
          <select
            value={filterColor}
            onChange={(e) => setFilterColor(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
          >
            <option value="">All colors</option>
            {COLOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_STYLES).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No scrub sets match.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3">Serial</th>
                  <th className="py-2 pr-3">Color</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Holder</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="py-2 pr-3 font-medium text-gray-900">
                      {s.serialNumber}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${colorChip(
                          s.color,
                        )}`}
                      >
                        {s.color}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{s.size}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          STATUS_STYLES[s.status] || 'bg-gray-100'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {s.ownerName || '—'}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {s.currentHolderName || '—'}
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

// ===================================================================== Laundry
function LaundryTab({
  flash,
  reload,
}: {
  flash: (k: 'ok' | 'err', t: string) => void;
  reload: () => void;
}) {
  const [shift, setShift] = useState('MORNING');
  const [batch, setBatch] = useState<LaundryBatch | null>(null);
  const [inCleaning, setInCleaning] = useState<
    { id: string; serialNumber: string; color: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/scrubs/laundry?shift=${shift}`);
    const data = await res.json();
    setBatch(data.batch || null);
    setInCleaning(data.inCleaning || []);
  }, [shift]);

  useEffect(() => {
    load();
  }, [load]);

  const openBatch = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/scrubs/laundry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift }),
      });
      const data = await res.json();
      if (!res.ok) flash('err', data.error || 'Failed');
      else {
        setBatch(data.batch);
        flash('ok', 'Laundry batch opened');
      }
    } finally {
      setBusy(false);
    }
  };

  const updateItem = async (
    itemId: string,
    field: 'received' | 'ready' | 'missing',
    value: boolean,
  ) => {
    if (!batch) return;
    const res = await fetch('/api/scrubs/laundry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batch.id, itemId, [field]: value }),
    });
    const data = await res.json();
    if (res.ok) {
      setBatch(data.batch);
      if (field === 'missing' && value) flash('err', 'Missing item alert raised');
      reload();
    } else flash('err', data.error || 'Failed');
  };

  const reportReady = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      const res = await fetch('/api/scrubs/laundry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id, markReady: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setBatch(data.batch);
        flash(
          data.batch.readyForNextDay ? 'ok' : 'err',
          data.batch.readyForNextDay
            ? 'All items ready for next day ✓'
            : `Batch incomplete — ${data.batch.missingCount} missing`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="font-semibold text-gray-900 mr-auto flex items-center gap-2">
            <WashingMachine className="w-5 h-5 text-amber-600" /> Laundry desk
          </h2>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="MORNING">Morning shift</option>
            <option value="NIGHT">Night shift</option>
          </select>
          {!batch && (
            <button
              onClick={openBatch}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              Open today&apos;s batch ({inCleaning.length} awaiting)
            </button>
          )}
        </div>

        {!batch ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No batch open for this shift yet. {inCleaning.length} set(s) are in
            cleaning awaiting receipt.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { l: 'Expected', v: batch.expectedCount },
                { l: 'Received', v: batch.receivedCount },
                { l: 'Ready', v: batch.readyCount },
                { l: 'Missing', v: batch.missingCount },
              ].map((t) => (
                <div
                  key={t.l}
                  className="bg-gray-50 rounded-lg p-2.5 text-center"
                >
                  <div className="text-lg font-bold text-gray-900">{t.v}</div>
                  <div className="text-[10px] uppercase text-gray-400">
                    {t.l}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[360px] overflow-y-auto mb-4">
              {batch.items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-100"
                >
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${colorChip(
                      it.color,
                    )}`}
                  >
                    {it.color}
                  </span>
                  <span className="text-sm font-medium text-gray-900 mr-auto">
                    {it.serialNumber}
                  </span>
                  <button
                    onClick={() => updateItem(it.id, 'received', !it.received)}
                    className={`text-[11px] px-2 py-1 rounded-md border ${
                      it.received
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    Received
                  </button>
                  <button
                    onClick={() => updateItem(it.id, 'ready', !it.ready)}
                    className={`text-[11px] px-2 py-1 rounded-md border ${
                      it.ready
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    Ready
                  </button>
                  <button
                    onClick={() => updateItem(it.id, 'missing', !it.missing)}
                    className={`text-[11px] px-2 py-1 rounded-md border ${
                      it.missing
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    Missing
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={reportReady}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Report readiness for next day
              </button>
              {batch.readyForNextDay && (
                <span className="text-sm text-emerald-700 font-medium">
                  Ready ✓
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ====================================================================== Shifts
function ShiftTab({ flash }: { flash: (k: 'ok' | 'err', t: string) => void }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [served, setServed] = useState(300);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<{
    shiftType: string;
    managerId: string;
    staffIds: string[];
    notes: string;
  }>({ shiftType: 'MORNING', managerId: '', staffIds: [], notes: '' });

  const load = useCallback(async () => {
    const res = await fetch('/api/scrubs/shifts');
    const data = await res.json();
    setShifts(data.shifts || []);
    setStaff(data.staff || []);
    setTargets(data.targets || {});
    setServed(data.theatreStaffServed || 300);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStaff = (id: string) => {
    setForm((f) => ({
      ...f,
      staffIds: f.staffIds.includes(id)
        ? f.staffIds.filter((x) => x !== id)
        : [...f.staffIds, id],
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/scrubs/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) flash('err', data.error || 'Failed');
      else {
        flash('ok', `${form.shiftType} shift saved`);
        setForm({ shiftType: 'MORNING', managerId: '', staffIds: [], notes: '' });
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const target = targets[form.shiftType] ?? 0;
  const parseNames = (s: string): string[] => {
    try {
      return JSON.parse(s || '[]');
    } catch {
      return [];
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Assign */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-indigo-600" /> Assign today&apos;s
          shift
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Morning ~{targets.MORNING ?? 5} staff &amp; night ~{targets.NIGHT ?? 2}{' '}
          staff serve ~{served} theatre staff, with one manager overseeing.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Shift
            </label>
            <select
              value={form.shiftType}
              onChange={(e) =>
                setForm((f) => ({ ...f, shiftType: e.target.value }))
              }
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="MORNING">Morning</option>
              <option value="NIGHT">Night</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Manager
            </label>
            <select
              value={form.managerId}
              onChange={(e) =>
                setForm((f) => ({ ...f, managerId: e.target.value }))
              }
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">— Select manager —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">
          Laundry staff{' '}
          <span
            className={
              form.staffIds.length >= target
                ? 'text-emerald-600'
                : 'text-amber-600'
            }
          >
            ({form.staffIds.length}/{target} target)
          </span>
        </label>
        {staff.length === 0 ? (
          <p className="text-xs text-gray-400 mb-3">
            No laundry staff found. Add users with role LAUNDRY_STAFF /
            LAUNDRY_SUPERVISOR.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStaff(s.id)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  form.staffIds.includes(s.id)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {s.fullName}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Notes (rotation, coverage…)"
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
        />

        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          Save shift
        </button>
      </div>

      {/* Today's roster */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-500" /> Today&apos;s roster
        </h2>
        {shifts.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No shifts assigned today.
          </p>
        ) : (
          <div className="space-y-3">
            {shifts.map((sh) => {
              const names = parseNames(sh.staffNames);
              const ok = names.length >= sh.targetStaffCount;
              return (
                <div
                  key={sh.id}
                  className="border border-gray-100 rounded-xl p-3.5"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        sh.shiftType === 'MORNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {sh.shiftType}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        ok ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {names.length}/{sh.targetStaffCount} staff
                    </span>
                  </div>
                  {sh.managerName && (
                    <p className="text-xs text-gray-500 mb-1">
                      Manager: <span className="font-medium">{sh.managerName}</span>
                    </p>
                  )}
                  <p className="text-sm text-gray-700">
                    {names.length ? names.join(', ') : 'No staff assigned'}
                  </p>
                  {sh.notes && (
                    <p className="text-xs text-gray-400 mt-1">{sh.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================ Reports & Alerts
function ReportTab({ flash }: { flash: (k: 'ok' | 'err', t: string) => void }) {
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/scrubs/report');
    const data = await res.json();
    setReport(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (alertId: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/scrubs/report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      });
      if (res.ok) {
        flash('ok', 'Alert resolved');
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!report)
    return (
      <div className="py-16 text-center text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );

  const sev: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
    HIGH: 'bg-red-50 text-red-700 border-red-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <div className="space-y-5">
      {/* Daily summary */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-600" /> Daily report
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { l: 'Total sets', v: report.summary.totalSets },
            { l: 'Issued today', v: report.summary.issuedToday },
            { l: 'Returned today', v: report.summary.returnedToday },
            { l: 'Outstanding', v: report.summary.outstanding },
            { l: 'Overdue', v: report.summary.overdueCount },
            { l: 'Low inventory', v: report.summary.lowInventoryOwners },
            { l: 'Footwear out', v: report.summary.footwearOutstanding ?? 0 },
          ].map((t) => (
            <div key={t.l} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-gray-900">{t.v}</div>
              <div className="text-[10px] uppercase text-gray-400">{t.l}</div>
            </div>
          ))}
        </div>

        {/* colour breakdown */}
        {report.byColor && Object.keys(report.byColor).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(report.byColor).map(([c, n]) => (
              <span
                key={c}
                className={`text-[11px] px-2.5 py-1 rounded-full border ${colorChip(
                  c,
                )}`}
              >
                {c}: {n as number}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Alerts */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-600" /> Open alerts (
          {report.alerts?.length || 0})
        </h2>
        {!report.alerts || report.alerts.length === 0 ? (
          <p className="text-sm text-emerald-600 py-4 text-center">
            No open alerts — all clear ✓
          </p>
        ) : (
          <div className="space-y-2">
            {report.alerts.map((a: Alert) => (
              <div
                key={a.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                  sev[a.severity] || 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{a.message}</div>
                    <div className="text-[11px] opacity-70">
                      {a.type} · {a.severity}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => resolve(a.id)}
                  disabled={busy}
                  className="text-xs px-2.5 py-1 bg-white/70 rounded-md border border-current/20 hover:bg-white shrink-0"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overdue */}
      {report.overdue && report.overdue.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">
            Overdue sign-outs ({report.overdue.length})
          </h2>
          <div className="space-y-1.5">
            {report.overdue.map((o: any) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 border border-red-100"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${colorChip(
                      o.color,
                    )}`}
                  >
                    {o.color}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {o.serialNumber}
                  </span>
                  <span className="text-xs text-gray-500">— {o.userName}</span>
                </div>
                <span className="text-[11px] text-red-700">
                  due {o.dueBack ? new Date(o.dueBack).toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low inventory */}
      {report.lowInventory && report.lowInventory.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">
            Staff below 3 sets ({report.lowInventory.length})
          </h2>
          <div className="space-y-1.5">
            {report.lowInventory.map((li: any) => (
              <div
                key={li.ownerId}
                className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-100"
              >
                <span className="text-sm font-medium text-gray-900">
                  {li.name}{' '}
                  <span className="text-xs text-gray-500 font-normal">
                    ({li.role})
                  </span>
                </span>
                <span className="text-xs text-amber-700 font-medium">
                  {li.count}/{li.required} sets
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
