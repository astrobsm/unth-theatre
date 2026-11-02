'use client';

/**
 * The phones you have asked the theatre Wi-Fi to remember.
 *
 * WHY THIS EXISTS AT ALL. "Keep this phone signed in" is a one-way door
 * without it. A handset that is lost, sold, or simply handed to somebody else
 * keeps the hospital network until an administrator finds the right menu in
 * Winbox — which, realistically, means it keeps it. The person who made the
 * choice has to be able to take it back, from the same account they made it
 * with, in two taps.
 *
 * RENDERS NOTHING when there is nothing to show. Most staff have one phone and
 * ticked the box once; a permanent empty panel on a page about QR codes is
 * clutter, and clutter is what people learn to scroll past.
 *
 * IT DOES NOT PROMISE AN INSTANT CUT-OFF. Removing a device stops the router
 * being told to remember it; a session already running continues until it
 * ends. Saying "removed" and leaving a lost phone online for the rest of the
 * day would be the kind of half-truth somebody makes a decision on.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Smartphone, Trash2 } from 'lucide-react';

interface RememberedDevice {
  id: string;
  label: string;
  mac: string;
  remembered: boolean;
  lastSeenAt: string | null;
  until: string;
  expired: boolean;
}

function seen(iso: string | null): string {
  if (!iso) return 'not seen since you added it';
  const d = new Date(iso);
  return `last on the network ${d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'Africa/Lagos',
  })}`;
}

export default function RememberedDevicesCard() {
  const [devices, setDevices] = useState<RememberedDevice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hotspot/remember', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setDevices(d.devices ?? []);
      }
    } catch {
      // Offline on a page whose whole purpose is getting online. Say nothing.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = useCallback(async (id: string) => {
    setRemoving(id);
    setNote(null);
    try {
      const res = await fetch(`/api/hotspot/remember?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDevices((list) => list.filter((x) => x.id !== id));
        setNote(d.message ?? 'Removed.');
      } else {
        setNote(d.error ?? 'Could not remove that device.');
      }
    } catch {
      setNote('No connection, so nothing was changed. Try again when you are back online.');
    } finally {
      setRemoving(null);
    }
  }, []);

  if (!loaded || devices.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3 mb-1">
        <Smartphone className="h-5 w-5 text-gray-600" />
        <h2 className="font-semibold text-gray-900">Devices kept on the Wi-Fi</h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        These rejoin the theatre network without asking for your password.
        Remove any you no longer have.
      </p>

      <ul className="divide-y divide-gray-100">
        {devices.map((d) => (
          <li key={d.id} className="py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{d.label}</p>
              <p className="text-xs text-gray-500">
                {seen(d.lastSeenAt)}
                {d.expired
                  ? ' · no longer remembered — it will ask for your password next time'
                  : ` · kept until ${d.until}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(d.id)}
              disabled={removing === d.id}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
            >
              {removing === d.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </button>
          </li>
        ))}
      </ul>

      {note && <p className="mt-3 text-xs text-gray-700">{note}</p>}
    </div>
  );
}
