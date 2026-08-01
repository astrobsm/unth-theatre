'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Radar, Search, RefreshCw, Loader2, Phone, MapPin, Save, UserCog, LocateFixed, ShieldQuestion } from 'lucide-react';
import { AVAILABILITY_STATUSES, availabilityMeta, capturesLocation } from '@/lib/staffAvailability';
import {
  describePosition,
  distanceMetres,
  FIX_QUALITY_LABEL,
  fixQuality,
  formatDistance,
  freshnessOf,
  hasPosition,
  isMappable,
  mapLink,
  positionOf,
  timeAgo,
} from '@/lib/staffLocation';

interface Staff {
  id: string; fullName: string; role: string; department: string | null; staffId: string | null;
  phoneNumber: string | null; extension: string | null;
  availabilityStatus: string | null; availabilityNote: string | null; currentLocation: string | null; availabilityUpdatedAt: string | null;
  currentLatitude: number | null; currentLongitude: number | null; locationAccuracyM: number | null;
  locationCapturedAt: string | null; locationSource: string | null;
}

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

export default function StaffAvailabilityBoard() {
  const { data: sessionData } = useSession();
  const myRole = (sessionData?.user as any)?.role;
  const isAdmin = ADMIN_ROLES.includes(myRole);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(''); const [roleF, setRoleF] = useState(''); const [statusF, setStatusF] = useState('');
  const [msg, setMsg] = useState('');

  // my-status form
  const [myStatus, setMyStatus] = useState(''); const [myLoc, setMyLoc] = useState(''); const [myNote, setMyNote] = useState('');

  // Whether to attach a position when publishing. Defaults ON because the whole
  // point is answering "who is nearest", but it is a visible switch the staff
  // member controls — a location must never be taken without them knowing.
  const [shareLocation, setShareLocation] = useState(true);
  const [fix, setFix] = useState<{ latitude: number; longitude: number; accuracyM: number; capturedAt: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // "3 minutes ago" only stays true if something re-renders. This ticks every
  // 15s so the board ages in front of you rather than freezing at load time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);

  /**
   * Ask the browser where we are. Called only when the staff member publishes
   * their status — there is no watcher and nothing runs in the background.
   */
  const captureFix = useCallback(async (): Promise<typeof fix> => {
    if (!shareLocation) return null;
    // Off Duty and On Leave never carry a position — the server refuses it, and
    // asking the device for a fix we would only discard is worse than pointless.
    if (!capturesLocation(myStatus)) return null;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocError('This device cannot provide a location.');
      return null;
    }
    setLocating(true);
    setLocError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          // Long enough for a real fix indoors, short enough that publishing
          // availability never feels stuck.
          timeout: 12_000,
          // A fix from the last half-minute is fine; older is not "where I am now".
          maximumAge: 30_000,
        });
      });
      const taken = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        capturedAt: new Date(position.timestamp).toISOString(),
      };
      setFix(taken);
      return taken;
    } catch (err) {
      const code = (err as GeolocationPositionError)?.code;
      setLocError(
        code === 1
          ? 'Location permission was refused. Your status will still be published, without a position.'
          : code === 3
            ? 'Could not get a fix in time. Your status will still be published, without a position.'
            : 'Location is unavailable. Your status will still be published, without a position.'
      );
      return null;
    } finally {
      setLocating(false);
    }
  }, [shareLocation, myStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (roleF) sp.set('role', roleF); if (statusF) sp.set('status', statusF); if (q) sp.set('q', q);
    const r = await fetch(`/api/staff/availability?${sp}`, { cache: 'no-store' });
    if (r.ok) { const d = await r.json(); setStaff(d.staff ?? []); setMe(d.me ?? ''); }
    setLoading(false);
  }, [roleF, statusF, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const myRow = useMemo(() => staff.find((s) => s.id === me), [staff, me]);

  // Distances on the board are measured from wherever I am — the fix just
  // taken if there is one, else my last published position. Without an origin
  // no distance is shown at all, rather than one measured from nowhere.
  const myFix = useMemo(() => {
    if (fix) return { latitude: fix.latitude, longitude: fix.longitude };
    if (myRow && hasPosition(positionOf(myRow))) {
      return { latitude: myRow.currentLatitude as number, longitude: myRow.currentLongitude as number };
    }
    return null;
  }, [fix, myRow]);
  useEffect(() => { if (myRow) { setMyStatus(myRow.availabilityStatus ?? ''); setMyLoc(myRow.currentLocation ?? ''); setMyNote(myRow.availabilityNote ?? ''); } }, [myRow]);

  const roles = useMemo(() => Array.from(new Set(staff.map((s) => s.role))).sort(), [staff]);

  const saveMine = async () => {
    if (!myStatus) { setMsg('Pick a status.'); return; }
    // The fix is taken at the moment of publishing, so the position and the
    // status are true at the same instant rather than minutes apart.
    const taken = await captureFix();
    const r = await fetch('/api/staff/availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: myStatus,
        currentLocation: myLoc || null,
        note: myNote || null,
        ...(taken
          ? {
              latitude: taken.latitude,
              longitude: taken.longitude,
              accuracyM: taken.accuracyM,
              locationSource: 'GPS',
              capturedAt: taken.capturedAt,
            }
          : {}),
      }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(
        d.locationRecorded
          ? `Status published with your location${taken ? ` (${FIX_QUALITY_LABEL[fixQuality(taken.accuracyM)].toLowerCase()})` : ''}.`
          : 'Status published. No location was attached.'
      );
    } else {
      setMsg((await r.json().catch(() => ({})))?.error || 'Failed');
    }
    await load();
  };
  const setFor = async (userId: string, status: string) => {
    const r = await fetch('/api/staff/availability', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, status }),
    });
    if (r.ok) await load(); else setMsg((await r.json().catch(() => ({})))?.error || 'Failed');
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of staff) { const k = s.availabilityStatus ?? 'UNSET'; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [staff]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> Dashboard</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center"><Radar className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Live Staff Availability</h1>
            <p className="text-sm text-gray-500">Current status & location of theatre staff · auto-refreshes every minute</p>
          </div>
        </div>
        <button onClick={load} className="btn-secondary text-sm inline-flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      {msg && <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-sm text-blue-800">{msg}</div>}

      {/* My status */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">My status</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <div>
            <label className="label">Status</label>
            <select className="input-field" value={myStatus} onChange={(e) => setMyStatus(e.target.value)}>
              <option value="">Select…</option>
              {AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{availabilityMeta(s).label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Current location</label>
            <input className="input-field" value={myLoc} onChange={(e) => setMyLoc(e.target.value)} placeholder="e.g. Theatre 3" />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input className="input-field" value={myNote} onChange={(e) => setMyNote(e.target.value)} placeholder="e.g. finishing a case" />
          </div>
          <button onClick={saveMine} disabled={locating} className="btn-primary text-sm inline-flex items-center justify-center gap-1 h-[38px] disabled:opacity-60">
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {locating ? 'Locating…' : 'Update'}
          </button>
        </div>

        {/* Location sharing. Deliberately a visible switch rather than something
            that happens quietly: this records where a member of staff is, and
            they are entitled to know that and to decline it. */}
        {!capturesLocation(myStatus) ? (
          myStatus ? (
            <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600">
              <span className="font-medium text-gray-800">No location is recorded for “{availabilityMeta(myStatus).label}”.</span>{' '}
              Off-duty statuses never carry a position, and publishing one clears any position already held —
              you should not remain on a map after you have gone home.
            </p>
          ) : null
        ) : (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={shareLocation}
              onChange={(e) => { setShareLocation(e.target.checked); setLocError(null); }}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <LocateFixed className="h-3.5 w-3.5 text-gray-500" /> Share my location with this update
              </span>
              <span className="mt-0.5 block text-xs text-gray-600">
                Your position is read once, at the moment you press Update — never in the background, and
                never while you are simply signed in. It lets a theatre find the nearest available person in
                an emergency. Turn this off and your status is still published, without a position.
              </span>
            </span>
          </label>

          {fix && shareLocation && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
              <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              Last shared: {describePosition(
                { latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM, capturedAt: fix.capturedAt },
                now
              )}.
            </p>
          )}
          {locError && (
            <p className="mt-2 text-xs text-amber-700">{locError}</p>
          )}
        </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
          <input className="input-field pl-8 text-sm py-1.5" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input-field text-sm py-1.5" value={roleF} onChange={(e) => setRoleF(e.target.value)}>
          <option value="">All roles</option>{roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input-field text-sm py-1.5" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All statuses</option>{AVAILABILITY_STATUSES.map((s) => <option key={s} value={s}>{availabilityMeta(s).label}</option>)}
        </select>
        <div className="flex flex-wrap gap-1 text-xs text-gray-500 ml-auto">
          {['AVAILABLE', 'ON_EMERGENCY_CASE', 'IN_THEATRE'].map((s) => (
            <span key={s} className={`px-2 py-0.5 rounded-full border ${availabilityMeta(s).chip}`}>{availabilityMeta(s).label}: {counts[s] ?? 0}</span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staff.map((s) => {
            const m = availabilityMeta(s.availabilityStatus);
            return (
              <div key={s.id} className={`rounded-lg border p-3 ${s.id === me ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{s.fullName}{s.id === me && <span className="text-[10px] text-emerald-600 ml-1">(you)</span>}</div>
                    <div className="text-xs text-gray-500">{s.role.replace(/_/g, ' ')}{s.staffId ? ` · ${s.staffId}` : ''}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border flex-shrink-0 ${m.chip}`}>
                    <span className={`w-2 h-2 rounded-full ${m.dot}`} /> {m.label}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-gray-600">
                  {s.currentLocation && <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" /> {s.currentLocation}</div>}
                  {s.availabilityNote && <div className="text-gray-500 italic truncate">{s.availabilityNote}</div>}
                  {s.phoneNumber && <a href={`tel:${s.phoneNumber}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Phone className="w-3 h-3" /> {s.phoneNumber}{s.extension ? ` · ext ${s.extension}` : ''}</a>}

                  {/* The position. Freshness and fix quality are shown next to
                      it, never implied: a marker that looks certain but came
                      from a 2 km indoor fix gets the wrong person called. */}
                  {hasPosition(positionOf(s)) && (
                    <div className="mt-1 rounded border border-gray-100 bg-gray-50 px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        <LocateFixed className={`w-3 h-3 flex-shrink-0 ${
                          freshnessOf(s.locationCapturedAt, now) === 'LIVE' ? 'text-green-600'
                          : freshnessOf(s.locationCapturedAt, now) === 'RECENT' ? 'text-amber-600'
                          : 'text-gray-400'}`} />
                        <span className={
                          freshnessOf(s.locationCapturedAt, now) === 'LIVE' ? 'font-medium text-green-700' : 'text-gray-600'
                        }>
                          {freshnessOf(s.locationCapturedAt, now) === 'LIVE' ? 'Live position' : `Position ${timeAgo(s.locationCapturedAt, now)}`}
                        </span>
                        {myFix && isMappable(positionOf(s)) && (
                          <span className="ml-auto font-medium text-gray-900">
                            {formatDistance(distanceMetres(myFix, { latitude: s.currentLatitude as number, longitude: s.currentLongitude as number }))}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-gray-500">
                        <span>{FIX_QUALITY_LABEL[fixQuality(s.locationAccuracyM)]}</span>
                        {isMappable(positionOf(s)) && (
                          <a href={mapLink(positionOf(s)) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            Open map
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {s.availabilityUpdatedAt && (
                    <div className="text-[10px] text-gray-400">
                      Status {timeAgo(s.availabilityUpdatedAt, now)}
                      {/* When the position is materially older than the status,
                          say so — otherwise a fresh status lends false weight
                          to a stale location. */}
                      {hasPosition(positionOf(s)) && s.locationCapturedAt && s.availabilityUpdatedAt &&
                        new Date(s.availabilityUpdatedAt).getTime() - new Date(s.locationCapturedAt).getTime() > 5 * 60_000 && (
                        <span className="text-amber-600"> · position is older</span>
                      )}
                    </div>
                  )}
                  {!hasPosition(positionOf(s)) && s.availabilityStatus && (
                    <div className="text-[10px] text-gray-400">No location shared</div>
                  )}
                </div>
                {isAdmin && s.id !== me && (
                  <div className="mt-2 flex items-center gap-1">
                    <UserCog className="w-3.5 h-3.5 text-gray-400" />
                    <select className="input-field text-[11px] py-0.5" value="" onChange={(e) => e.target.value && setFor(s.id, e.target.value)}>
                      <option value="">Set status…</option>
                      {AVAILABILITY_STATUSES.map((st) => <option key={st} value={st}>{availabilityMeta(st).label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {staff.length === 0 && <p className="text-sm text-gray-400">No staff match the filters.</p>}
        </div>
      )}
    </div>
  );
}
