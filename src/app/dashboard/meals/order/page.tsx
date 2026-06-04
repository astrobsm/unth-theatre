'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChefHat,
  RefreshCw,
  ShoppingCart,
  Wallet,
  Upload,
  CheckCircle2,
  XCircle,
  MapPin,
  Trash2,
  Plus,
  Minus,
  Clock,
  HelpCircle,
} from 'lucide-react';

type Availability = 'FREE_FOR_ON_DUTY' | 'PAID';
type MealCategory =
  | 'BREAKFAST'
  | 'LUNCH'
  | 'DINNER'
  | 'SNACK'
  | 'BEVERAGE'
  | 'COMBO';

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  category: MealCategory;
  availability: Availability;
  price: string | number;
  currency: string;
  imageUrl?: string | null;
  prepTimeMin?: number | null;
  dailyCapacity?: number | null;
}

interface CartLine {
  menuItemId: string;
  name: string;
  unitPrice: number;
  availability: Availability;
  quantity: number;
  notes?: string;
}

interface MyOrder {
  id: string;
  orderType: 'FREE' | 'PAID';
  orderStatus: string;
  paymentStatus: string;
  totalAmount: string | number;
  currency: string;
  deliveryLocation: string;
  createdAt: string;
  items: { id: string; nameSnapshot: string; quantity: number }[];
  hasPaymentEvidence?: boolean;
}

interface Eligibility {
  eligible: boolean;
  source: string | null;
  details: any;
}

function formatMoney(amount: number | string, currency = 'NGN'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!isFinite(n)) return `${currency} 0.00`;
  return `${currency} ${n.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-gray-100 text-gray-700',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PREPARING: 'bg-yellow-100 text-yellow-800',
  READY: 'bg-purple-100 text-purple-800',
  OUT_FOR_DELIVERY: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};
const PAYMENT_COLORS: Record<string, string> = {
  NOT_REQUIRED: 'bg-gray-100 text-gray-700',
  PENDING_VERIFICATION: 'bg-yellow-100 text-yellow-800',
  VERIFIED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-blue-100 text-blue-800',
};

async function fileToBase64(
  file: File
): Promise<{ fileName: string; mimeType: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve({ fileName: file.name, mimeType: file.type, base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OrderMealPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<'FREE' | 'PAID'>('PAID');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menuRes, eligRes, ordersRes] = await Promise.all([
        fetch('/api/meals/menu'),
        fetch('/api/meals/eligibility'),
        fetch('/api/meals/orders?mine=true'),
      ]);
      if (!menuRes.ok) throw new Error('Menu fetch failed');
      const menuJson = await menuRes.json();
      setMenu(menuJson.items || []);
      const eligJson = eligRes.ok ? await eligRes.json() : null;
      setEligibility(eligJson);
      const ordersJson = ordersRes.ok ? await ordersRes.json() : { orders: [] };
      setOrders(ordersJson.orders || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // If user is eligible, default to FREE; otherwise PAID
  useEffect(() => {
    if (eligibility?.eligible) setOrderType('FREE');
    else setOrderType('PAID');
  }, [eligibility]);

  const visibleMenu = useMemo(() => {
    return menu.filter((m) =>
      orderType === 'FREE'
        ? m.availability === 'FREE_FOR_ON_DUTY'
        : m.availability === 'PAID'
    );
  }, [menu, orderType]);

  const groupedMenu = useMemo(() => {
    const g: Record<string, MenuItem[]> = {};
    for (const m of visibleMenu) {
      (g[m.category] ||= []).push(m);
    }
    return g;
  }, [visibleMenu]);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (s, l) =>
          s + (orderType === 'FREE' ? 0 : l.unitPrice) * l.quantity,
        0
      ),
    [cart, orderType]
  );

  const addToCart = (m: MenuItem) => {
    setCart((c) => {
      const exists = c.find((x) => x.menuItemId === m.id);
      if (exists) {
        return c.map((x) =>
          x.menuItemId === m.id ? { ...x, quantity: x.quantity + 1 } : x
        );
      }
      return [
        ...c,
        {
          menuItemId: m.id,
          name: m.name,
          unitPrice: Number(m.price),
          availability: m.availability,
          quantity: 1,
        },
      ];
    });
  };
  const removeFromCart = (id: string) =>
    setCart((c) => c.filter((x) => x.menuItemId !== id));
  const setQty = (id: string, q: number) =>
    setCart((c) =>
      c
        .map((x) =>
          x.menuItemId === id ? { ...x, quantity: Math.max(0, q) } : x
        )
        .filter((x) => x.quantity > 0)
    );

  // Reset cart when switching FREE/PAID
  useEffect(() => {
    setCart([]);
  }, [orderType]);

  const submit = async () => {
    if (cart.length === 0) {
      setError('Add at least one item to your cart');
      return;
    }
    if (!deliveryLocation.trim()) {
      setError('Please state where the meal should be served');
      return;
    }
    if (orderType === 'PAID' && !evidenceFile) {
      setError('Upload your payment evidence before submitting');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        orderType,
        deliveryLocation,
        deliveryNotes: deliveryNotes || undefined,
        items: cart.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          notes: l.notes,
        })),
      };
      if (orderType === 'PAID') {
        const evidence = await fileToBase64(evidenceFile!);
        payload.payment = {
          method: paymentMethod,
          reference: paymentReference || undefined,
          evidence,
        };
      }
      const res = await fetch('/api/meals/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      // Reset form & refresh
      setCart([]);
      setDeliveryLocation('');
      setDeliveryNotes('');
      setPaymentReference('');
      setEvidenceFile(null);
      await load();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-orange-600" /> Order a Meal
          </h1>
          <p className="text-gray-600 mt-2 max-w-3xl">
            Browse today&apos;s menu, place a free request if you are on duty,
            or order a paid meal — upload your payment receipt and tell the
            cafeteria where you want it served.
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

      {/* Eligibility banner */}
      <div
        className={`card p-4 border ${
          eligibility?.eligible
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        {eligibility?.eligible ? (
          <p className="text-sm text-green-900 inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            You are on duty today via <strong>{eligibility.source}</strong> —
            you may request a free meal from the FREE menu.
          </p>
        ) : (
          <p className="text-sm text-amber-900 inline-flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            You are not on the duty roster or any surgical team for today, so
            free meals are not available — paid orders are open to everyone.
          </p>
        )}
      </div>

      {/* Order-type toggle */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">Order type:</span>
        <button
          onClick={() => setOrderType('FREE')}
          disabled={!eligibility?.eligible}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
            orderType === 'FREE'
              ? 'bg-green-600 text-white border-green-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          } ${!eligibility?.eligible ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          Free (On-Duty)
        </button>
        <button
          onClick={() => setOrderType('PAID')}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
            orderType === 'PAID'
              ? 'bg-orange-600 text-white border-orange-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Paid
        </button>
      </div>

      {error && (
        <div className="card p-3 border border-red-300 bg-red-50 text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Menu */}
        <section className="lg:col-span-2 space-y-6">
          {Object.keys(groupedMenu).length === 0 ? (
            <div className="card p-6 text-center text-gray-500 text-sm">
              No menu items available for this order type today.
            </div>
          ) : (
            Object.entries(groupedMenu).map(([cat, items]) => (
              <div key={cat} className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className="card p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {m.name}
                          </p>
                          {m.description && (
                            <p className="text-xs text-gray-600 mt-1">
                              {m.description}
                            </p>
                          )}
                          {m.prepTimeMin && (
                            <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> ~{m.prepTimeMin} min
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            m.availability === 'FREE_FOR_ON_DUTY'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {m.availability === 'FREE_FOR_ON_DUTY'
                            ? 'Free'
                            : formatMoney(m.price, m.currency)}
                        </span>
                      </div>
                      <button
                        onClick={() => addToCart(m)}
                        className="btn-primary text-xs inline-flex items-center gap-1 self-start"
                      >
                        <Plus className="w-3 h-3" /> Add to order
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Cart + checkout */}
        <aside className="card p-4 space-y-4 h-fit sticky top-4">
          <h2 className="font-bold text-gray-900 inline-flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-600" /> Your order
          </h2>
          {cart.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              Add items from the menu.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {cart.map((l) => (
                <li key={l.menuItemId} className="py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-gray-500">
                      {orderType === 'FREE'
                        ? 'Free'
                        : formatMoney(l.unitPrice)}{' '}
                      × {l.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(l.menuItemId, l.quantity - 1)}
                      className="p-1 border rounded text-gray-700 hover:bg-gray-100"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm w-5 text-center">
                      {l.quantity}
                    </span>
                    <button
                      onClick={() => setQty(l.menuItemId, l.quantity + 1)}
                      className="p-1 border rounded text-gray-700 hover:bg-gray-100"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(l.menuItemId)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {cart.length > 0 && (
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-bold">
                {orderType === 'FREE' ? 'Free' : formatMoney(cartTotal)}
              </span>
            </div>
          )}

          {/* Delivery */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">
              <MapPin className="w-3 h-3 inline mr-1" /> Where should it be
              served?
            </label>
            <input
              value={deliveryLocation}
              onChange={(e) => setDeliveryLocation(e.target.value)}
              placeholder="e.g. Theatre 3 lounge, PACU, Holding area"
              className="input w-full"
            />
            <textarea
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Notes for the porter (optional)"
              rows={2}
              className="input w-full text-xs"
            />
          </div>

          {/* Payment (PAID only) */}
          {orderType === 'PAID' && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-semibold text-gray-700 inline-flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Payment details
              </p>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="input w-full text-sm"
                aria-label="Payment method"
              >
                <option>Bank Transfer</option>
                <option>POS</option>
                <option>Cash</option>
                <option>USSD</option>
                <option>Mobile Money</option>
              </select>
              <input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Receipt / reference number (optional)"
                className="input w-full text-sm"
              />
              <label className="block">
                <span className="text-xs font-semibold text-gray-700 inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Upload payment evidence (image
                  or PDF, max 5 MB)
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs"
                />
                {evidenceFile && (
                  <span className="text-xs text-gray-600 mt-1 block">
                    {evidenceFile.name} (
                    {(evidenceFile.size / 1024).toFixed(0)} KB)
                  </span>
                )}
              </label>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || cart.length === 0}
            className="btn-primary w-full"
          >
            {submitting
              ? 'Submitting…'
              : orderType === 'FREE'
              ? 'Request free meal'
              : 'Submit paid order'}
          </button>
        </aside>
      </div>

      {/* My orders */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-3">My orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            You have not placed any orders yet.
          </p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div
                key={o.id}
                className="card p-3 flex flex-wrap items-center gap-3 text-sm"
              >
                <span className="font-mono text-xs text-gray-500">
                  #{o.id.slice(0, 8)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(o.createdAt).toLocaleString()}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    o.orderType === 'FREE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}
                >
                  {o.orderType}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    STATUS_COLORS[o.orderStatus] || 'bg-gray-100'
                  }`}
                >
                  {o.orderStatus.replace(/_/g, ' ')}
                </span>
                {o.orderType === 'PAID' && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      PAYMENT_COLORS[o.paymentStatus] || 'bg-gray-100'
                    }`}
                  >
                    Payment: {o.paymentStatus.replace(/_/g, ' ')}
                  </span>
                )}
                <span className="text-xs text-gray-700">
                  {o.items.length} item{o.items.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-gray-700 inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {o.deliveryLocation}
                </span>
                <span className="ml-auto font-semibold">
                  {o.orderType === 'FREE'
                    ? 'Free'
                    : formatMoney(o.totalAmount, o.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
