'use client';

// ============================================================
// Who is on duty, and whether they are actually here
// ------------------------------------------------------------
// The availability board above records what people say they are. This says
// whether they are inside the hospital perimeter, checked while they are on
// duty — because somebody could mark themselves present at the start of a
// shift and leave, and the first anybody knew was when the work did not happen.
//
// WHAT IT DELIBERATELY DOES NOT SHOW. Where anybody is. It answers in or out,
// and nothing on this screen maps a person's movements. The operational
// question is "is the on-call radiographer on site"; that is the question this
// answers and it is the only one it was built to answer.
//
// AND IT DOES NOT ACCUSE. "Cannot say" is a first-class answer and appears as
// often as the other two — a basement theatre has no signal, and a fix accurate
// to two kilometres cannot place anybody. A board that turned those into
// "absent" would be wrong about real people, and would be switched off within a
// week, and then nobody would have anything.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Crosshair, Loader2, MapPin, RefreshCw, ShieldQuestion, UserCheck, UserX,
} from 'lucide-react';

interface Person {
  userId: string;
  name: string;
  role: string | null;
  shift: string | null;
  lastKnown: 'ON_SITE' | 'OFF_SITE' | 'UNKNOWN';
  since: string | null;
  minutesAway: number | null;
  stale: boolean;
  concern: string | null;
  checks: number;
  lastAt: string;
}

interface Fence { id: string; name: string; radiusMetres: number }

const TONE: Record<string, { chip: string; label: string; Icon: typeof UserCheck }> = {
  ON_SITE: { chip: 'bg-green-100 text-green-800', label: 'On site', Icon: UserCheck },
  OFF_SITE: { chip: 'bg-red-100 text-red-800', label: 'Away from the hospital', Icon: UserX },
  UNKNOWN: { chip: 'bg-gray-100 text-gray-600', label: 'Cannot say', Icon: ShieldQuestion },
};

export default function PresenceBoard() {
  const { data: session } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [fence, setFence] = useState<Fence | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingFence, setSettingFence] = useState(false);
  const [canSet, setCanSet] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/presence', { cache: 'no-store' });
      if (res.status === 403) { setDenied(true); return; }
      if (res.ok) {
        const d = await res.json();
        setPeople(Array.isArray(d.people) ? d.people : []);
        setFence(d.perimeter ?? null);
        setWarning(d.warning ?? null);
      }
    } catch {
      /* the section simply shows nothing */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/staff/presence/geofence')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCanSet(!!d.canSet))
      .catch(() => {});
  }, []);

  /** Set the perimeter from where this device is standing. */
  const setPerimeterHere = () => {
    if (!navigator.geolocation) {
      setMessage('This device cannot report a position, so the perimeter must be typed from a map.');
      return;
    }
    setSettingFence(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/staff/presence/geofence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              radiusMetres: 400,
              name: 'Hospital perimeter',
            }),
          });
          const d = await res.json().catch(() => ({}));
          setMessage(res.ok
            ? 'Perimeter set from this position, with a 400 m radius. Presence checks can now answer.'
            : (d.error || 'The perimeter could not be set.'));
          if (res.ok) await load();
        } finally {
          setSettingFence(false);
        }
      },
      () => {
        setSettingFence(false);
        setMessage('The device would not give a position. Allow location for this site, or type the coordinates from a map.');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  // Not a supervisor: this section is simply not theirs to read.
  if (denied) return null;

  return (
    <section className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <MapPin className="h-5 w-5 text-gray-500" /> On duty and on site
          </h2>
          <p className="text-sm text-gray-600">
            Whether staff on duty are inside the hospital perimeter. Checked only during a
            rostered shift, and only in or out — this does not show where anybody is.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {warning && (
        <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{warning}</p>
          {canSet && (
            <button
              type="button"
              onClick={setPerimeterHere}
              disabled={settingFence}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {settingFence ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              Use where I am now as the perimeter
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{message}</p>
      )}

      {fence && (
        <p className="mt-2 text-xs text-gray-500">
          Measured against “{fence.name}”, {fence.radiusMetres} m radius.
        </p>
      )}

      {!loading && people.length === 0 ? (
        <p className="mt-3 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
          No presence has been recorded in the last twelve hours. Staff are checked only while they
          are rostered and on duty.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {people.map((p) => {
            const tone = TONE[p.lastKnown];
            return (
              <li
                key={p.userId}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 ${
                  p.concern ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'
                }`}
              >
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{p.name}</span>
                  {p.role && <span className="text-gray-500"> · {p.role.replace(/_/g, ' ').toLowerCase()}</span>}
                  {p.shift && <span className="text-gray-400"> · {p.shift.toLowerCase()}</span>}
                  {/* The question, not the charge. There are good reasons to be
                      off site on duty — collecting blood, escorting a patient
                      to another site — and the board does not know which. */}
                  {p.concern && <span className="block text-xs text-amber-800">{p.concern}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {p.minutesAway !== null && (
                    <span className="text-xs text-gray-600">{p.minutesAway} min</span>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}>
                    <tone.Icon className="h-3.5 w-3.5" /> {tone.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
        Recorded only while on duty and never off duty or on leave. “Cannot say” means the device
        gave no usable position — a theatre with no signal is not an absence.
        {session?.user?.name ? '' : ''}
      </p>
    </section>
  );
}
