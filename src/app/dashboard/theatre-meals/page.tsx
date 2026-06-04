'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  ChefHat,
  RefreshCw,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  UserCheck,
  UtensilsCrossed,
  ClipboardList,
  Wallet,
  Plus,
  Trash2,
  Eye,
  Edit3,
  Save,
  X,
} from 'lucide-react';

interface StaffEntry {
  userId: string | null;
  name: string;
  role: string;
  meta?: string;
  hasActivity: boolean | null;
}

interface DailyStaffResponse {
  date: string;
  generatedAt: string;
  surgicalTeam: Record<string, StaffEntry[]>;
  totalSurgeons: number;
  rosterStaff: Record<string, StaffEntry[]>;
  totals: {
    totalStaff: number;
    uniqueIdentified: number;
    loggedIn: number;
    notLoggedIn: number;
  };
}

const SURGEON_LABELS: Record<string, string> = {
  CONSULTANT: 'Consultants',
  SENIOR_REGISTRAR: 'Senior Registrars',
  REGISTRAR: 'Registrars',
  HOUSE_OFFICER: 'House Officers',
};

const ROSTER_LABELS: Record<string, string> = {
  ANAESTHETISTS: 'Anaesthetists',
  ANAESTHETIC_TECHNICIANS: 'Anaesthetic Technicians',
  NURSES: 'Theatre Nurses',
  RECOVERY_NURSES: 'Nurse Anaesthetists',
  PHARMACISTS: 'Pharmacists',
  PORTERS: 'Porters',
  CLEANERS: 'Cleaners',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function ActivityBadge({ status }: { status: boolean | null }) {
  if (status === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  }
  if (status === false) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
        <XCircle className="w-3 h-3" /> No activity
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
      <HelpCircle className="w-3 h-3" /> Unverified
    </span>
  );
}

function StaffCard({ title, entries, emptyText }: { title: string; entries: StaffEntry[]; emptyText: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((e, i) => (
            <li key={`${e.userId || e.name}-${i}`} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                {e.meta && <p className="text-xs text-gray-500 truncate">{e.meta}</p>}
              </div>
              <ActivityBadge status={e.hasActivity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TheatreMealsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const isManager = useMemo(
    () =>
      !!role &&
      ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CAFETERIA_MANAGER'].includes(
        role
      ),
    [role]
  );
  const [tab, setTab] = useState<'daily' | 'menu' | 'orders'>('daily');

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 flex-wrap" aria-label="Tabs">
          <TabButton active={tab === 'daily'} onClick={() => setTab('daily')} icon={<UtensilsCrossed className="w-4 h-4" />}>
            Daily Staff
          </TabButton>
          {isManager && (
            <TabButton active={tab === 'menu'} onClick={() => setTab('menu')} icon={<ClipboardList className="w-4 h-4" />}>
              Menu Management
            </TabButton>
          )}
          {isManager && (
            <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={<Wallet className="w-4 h-4" />}>
              Orders
            </TabButton>
          )}
        </nav>
      </div>

      {tab === 'daily' && <DailyStaffTab />}
      {tab === 'menu' && isManager && <MenuManagementTab />}
      {tab === 'orders' && isManager && <OrdersManagementTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-2 border-b-2 text-sm font-semibold ${
        active
          ? 'border-orange-600 text-orange-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function DailyStaffTab() {
  const [date, setDate] = useState<string>(todayISO());
  const [data, setData] = useState<DailyStaffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cafeteria/daily-staff?date=${date}`);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const j = (await res.json()) as DailyStaffResponse;
      setData(j);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-orange-600" /> Theatre Meals — Daily Staff
          </h1>
          <p className="text-gray-600 mt-2 max-w-3xl">
            Surgical teams from today&apos;s surgery bookings plus all staff on duty from the roster.
            Use the activity badges to dispense lunch only to those who have logged activity for the day.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="date-picker" className="block text-xs font-semibold text-gray-700 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" /> Date
            </label>
            <input
              id="date-picker"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              aria-label="Select date"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="btn-primary inline-flex items-center gap-2 h-10"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Color-code legend */}
      <div className="card p-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-gray-700">Activity legend:</span>
        <ActivityBadge status={true} />
        <span className="text-gray-500">staff has logged at least one duty in the system today.</span>
        <ActivityBadge status={false} />
        <span className="text-gray-500">staff is on the team / roster but has not logged anything yet.</span>
        <ActivityBadge status={null} />
        <span className="text-gray-500">free-text member, not linked to a user account.</span>
      </div>

      {error && (
        <div className="card p-4 border border-red-300 bg-red-50 text-red-800">
          <p className="font-semibold">Failed to load:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center gap-2 text-blue-900">
              <Users className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Surgeons today</span>
            </div>
            <p className="text-3xl font-bold text-blue-900 mt-1">{data.totalSurgeons}</p>
            <p className="text-xs text-blue-700 mt-1">Across all bookings for {data.date}</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="flex items-center gap-2 text-purple-900">
              <UserCheck className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Total staff</span>
            </div>
            <p className="text-3xl font-bold text-purple-900 mt-1">{data.totals.totalStaff}</p>
            <p className="text-xs text-purple-700 mt-1">Surgeons + rostered staff</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center gap-2 text-green-900">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Logged in (eligible)</span>
            </div>
            <p className="text-3xl font-bold text-green-900 mt-1">{data.totals.loggedIn}</p>
            <p className="text-xs text-green-700 mt-1">Active in system today — dispense meals</p>
          </div>
          <div className="card p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <div className="flex items-center gap-2 text-red-900">
              <XCircle className="w-5 h-5" />
              <span className="text-xs font-semibold uppercase">Not yet active</span>
            </div>
            <p className="text-3xl font-bold text-red-900 mt-1">{data.totals.notLoggedIn}</p>
            <p className="text-xs text-red-700 mt-1">Hold meals until staff logs activity</p>
          </div>
        </div>
      )}

      {/* Surgical team */}
      {data && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <UtensilsCrossed className="w-5 h-5 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">Surgical team — from today&apos;s bookings</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {(['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER'] as const).map((k) => (
              <StaffCard
                key={k}
                title={SURGEON_LABELS[k]}
                entries={data.surgicalTeam[k] || []}
                emptyText={`No ${SURGEON_LABELS[k].toLowerCase()} booked.`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Other staff on duty */}
      {data && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-primary-700" />
            <h2 className="text-xl font-bold text-gray-900">Other staff on duty — from the roster</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.keys(ROSTER_LABELS).map((k) => (
              <StaffCard
                key={k}
                title={ROSTER_LABELS[k]}
                entries={data.rosterStaff[k] || []}
                emptyText="No one rostered."
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// MENU MANAGEMENT TAB — manager creates / edits / retires menu items
// =====================================================================

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  availability: 'FREE_FOR_ON_DUTY' | 'PAID';
  price: string | number;
  currency: string;
  imageUrl?: string | null;
  isActive: boolean;
  prepTimeMin?: number | null;
  dailyCapacity?: number | null;
}

const CATEGORIES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'BEVERAGE', 'COMBO'];

function MenuManagementTab() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form (for new + edit)
  const blank = {
    name: '',
    description: '',
    category: 'LUNCH',
    availability: 'FREE_FOR_ON_DUTY' as const,
    price: 0,
    isActive: true,
    prepTimeMin: '',
    dailyCapacity: '',
  };
  const [form, setForm] = useState<any>(blank);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meals/menu?includeInactive=true');
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setItems(j.items || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (m: MenuItem) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      description: m.description || '',
      category: m.category,
      availability: m.availability,
      price: Number(m.price),
      isActive: m.isActive,
      prepTimeMin: m.prepTimeMin ?? '',
      dailyCapacity: m.dailyCapacity ?? '',
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(blank);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    const body: any = {
      name: form.name.trim(),
      description: form.description || null,
      category: form.category,
      availability: form.availability,
      price: form.availability === 'FREE_FOR_ON_DUTY' ? 0 : Number(form.price),
      isActive: !!form.isActive,
      prepTimeMin: form.prepTimeMin === '' ? null : Number(form.prepTimeMin),
      dailyCapacity:
        form.dailyCapacity === '' ? null : Number(form.dailyCapacity),
    };
    try {
      const res = editingId
        ? await fetch(`/api/meals/menu/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/meals/menu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this menu item? Past orders are preserved.'))
      return;
    try {
      const res = await fetch(`/api/meals/menu/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-orange-600" /> Menu Management
          </h2>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Publish free meals for on-duty staff and paid meals for anyone.
            Deactivated items are hidden from users but kept on historical orders.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{' '}
          Refresh
        </button>
      </div>

      {error && (
        <div className="card p-3 border border-red-300 bg-red-50 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Add / edit form */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-gray-900">
          {editingId ? 'Edit menu item' : 'Add new menu item'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name (e.g. Jollof rice with chicken)"
            className="input"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="input"
            aria-label="Meal category"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={form.availability}
            onChange={(e) =>
              setForm({ ...form, availability: e.target.value })
            }
            className="input"
            aria-label="Meal availability"
          >
            <option value="FREE_FOR_ON_DUTY">Free (on-duty staff)</option>
            <option value="PAID">Paid (anyone)</option>
          </select>
          <input
            type="number"
            value={form.price}
            min={0}
            disabled={form.availability === 'FREE_FOR_ON_DUTY'}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="Price (NGN)"
            className="input"
          />
          <input
            type="number"
            value={form.prepTimeMin}
            min={0}
            onChange={(e) =>
              setForm({ ...form, prepTimeMin: e.target.value })
            }
            placeholder="Prep time (minutes, optional)"
            className="input"
          />
          <input
            type="number"
            value={form.dailyCapacity}
            min={0}
            onChange={(e) =>
              setForm({ ...form, dailyCapacity: e.target.value })
            }
            placeholder="Daily capacity (optional)"
            className="input"
          />
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Description (optional)"
            rows={2}
            className="input md:col-span-2"
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
            />
            Active (visible to users)
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {editingId ? 'Save changes' : 'Add item'}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Existing items grouped by availability */}
      <div className="space-y-4">
        {(['FREE_FOR_ON_DUTY', 'PAID'] as const).map((av) => {
          const list = items.filter((i) => i.availability === av);
          return (
            <div key={av} className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                {av === 'FREE_FOR_ON_DUTY' ? 'Free menu' : 'Paid menu'} ·{' '}
                {list.length}
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No items yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b">
                    <tr>
                      <th className="text-left py-1">Name</th>
                      <th className="text-left py-1">Category</th>
                      <th className="text-right py-1">Price</th>
                      <th className="text-center py-1">Active</th>
                      <th className="text-right py-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => (
                      <tr key={m.id} className="border-b last:border-b-0">
                        <td className="py-2">
                          <p className="font-medium">{m.name}</p>
                          {m.description && (
                            <p className="text-xs text-gray-500">
                              {m.description}
                            </p>
                          )}
                        </td>
                        <td className="py-2">{m.category}</td>
                        <td className="py-2 text-right">
                          {av === 'FREE_FOR_ON_DUTY'
                            ? '—'
                            : `${m.currency} ${Number(m.price).toLocaleString()}`}
                        </td>
                        <td className="py-2 text-center">
                          {m.isActive ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 inline" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600 inline" />
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => startEdit(m)}
                            className="text-blue-600 hover:underline text-xs mr-3 inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                          {m.isActive && (
                            <button
                              onClick={() => deactivate(m.id)}
                              className="text-red-600 hover:underline text-xs inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> Retire
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// ORDERS MANAGEMENT TAB — manager reviews orders, verifies payments,
// advances status, marks delivered.
// =====================================================================

interface ManagedOrder {
  id: string;
  requesterName: string;
  requesterRole: string;
  orderType: 'FREE' | 'PAID';
  orderStatus: string;
  paymentStatus: string;
  totalAmount: string | number;
  currency: string;
  deliveryLocation: string;
  deliveryNotes?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentRejectionReason?: string | null;
  hasPaymentEvidence?: boolean;
  eligibilitySource?: string | null;
  createdAt: string;
  items: { id: string; nameSnapshot: string; quantity: number; unitPrice: number | string }[];
}

const ORDER_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

function OrdersManagementTab() {
  const [orders, setOrders] = useState<ManagedOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (paymentFilter) qs.set('paymentStatus', paymentFilter);
      if (dateFilter) qs.set('date', dateFilter);
      const res = await fetch(`/api/meals/orders?${qs.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setOrders(j.orders || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, paymentFilter, dateFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const updateOrder = async (id: string, body: any) => {
    try {
      const res = await fetch(`/api/meals/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      await load();
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 inline-flex items-center gap-2">
            <Wallet className="w-6 h-6 text-orange-600" /> Orders
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Verify payments, advance status, and mark meals as delivered.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{' '}
          Refresh
        </button>
      </div>

      <div className="card p-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="input"
          aria-label="Filter by date"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
          aria-label="Filter by order status"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="input"
          aria-label="Filter by payment status"
        >
          <option value="">All payments</option>
          <option value="PENDING_VERIFICATION">Pending verification</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="NOT_REQUIRED">N/A (free)</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button
          onClick={() => {
            setStatusFilter('');
            setPaymentFilter('');
            setDateFilter(todayISO());
          }}
          className="btn-secondary"
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="card p-3 border border-red-300 bg-red-50 text-red-800 text-sm">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No orders match the filter.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-gray-500">
                  #{o.id.slice(0, 8)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(o.createdAt).toLocaleString()}
                </span>
                <span className="font-semibold">{o.requesterName}</span>
                <span className="text-xs text-gray-500">({o.requesterRole})</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    o.orderType === 'FREE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}
                >
                  {o.orderType}
                </span>
                {o.eligibilitySource && (
                  <span className="text-xs text-gray-500">
                    via {o.eligibilitySource}
                  </span>
                )}
                <span className="ml-auto font-semibold">
                  {o.orderType === 'FREE'
                    ? 'Free'
                    : `${o.currency} ${Number(o.totalAmount).toLocaleString()}`}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Items
                  </p>
                  <ul className="text-sm mt-1 list-disc pl-5">
                    {o.items.map((li) => (
                      <li key={li.id}>
                        {li.nameSnapshot} × {li.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Delivery
                  </p>
                  <p className="text-sm mt-1">{o.deliveryLocation}</p>
                  {o.deliveryNotes && (
                    <p className="text-xs text-gray-600 mt-1">{o.deliveryNotes}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Payment
                  </p>
                  {o.orderType === 'FREE' ? (
                    <p className="text-sm mt-1 text-gray-500">N/A (free meal)</p>
                  ) : (
                    <div className="text-sm mt-1 space-y-1">
                      <p>
                        <span className="text-gray-500">Method:</span>{' '}
                        {o.paymentMethod || '—'}
                      </p>
                      {o.paymentReference && (
                        <p>
                          <span className="text-gray-500">Ref:</span>{' '}
                          {o.paymentReference}
                        </p>
                      )}
                      <p>
                        <span className="text-gray-500">Status:</span>{' '}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            o.paymentStatus === 'VERIFIED'
                              ? 'bg-green-100 text-green-800'
                              : o.paymentStatus === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {o.paymentStatus.replace(/_/g, ' ')}
                        </span>
                      </p>
                      {o.paymentRejectionReason && (
                        <p className="text-xs text-red-700">
                          {o.paymentRejectionReason}
                        </p>
                      )}
                      {o.hasPaymentEvidence && (
                        <a
                          href={`/api/meals/orders/${o.id}/evidence`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> View payment evidence
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Manager actions */}
              <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                <span className="text-xs text-gray-500">Order:</span>
                <select
                  value={o.orderStatus}
                  onChange={(e) =>
                    updateOrder(o.id, { orderStatus: e.target.value })
                  }
                  className="input text-xs py-1"
                  aria-label="Update order status"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                {o.orderType === 'PAID' && (
                  <>
                    <span className="text-xs text-gray-500 ml-3">Payment:</span>
                    <button
                      onClick={() =>
                        updateOrder(o.id, { paymentStatus: 'VERIFIED' })
                      }
                      className="btn-secondary text-xs inline-flex items-center gap-1"
                      disabled={o.paymentStatus === 'VERIFIED'}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Verify
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt(
                          'Reason for rejecting this payment?'
                        );
                        if (reason)
                          updateOrder(o.id, {
                            paymentStatus: 'REJECTED',
                            paymentRejectionReason: reason,
                          });
                      }}
                      className="btn-secondary text-xs inline-flex items-center gap-1"
                      disabled={o.paymentStatus === 'REJECTED'}
                    >
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
