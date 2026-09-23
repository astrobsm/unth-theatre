'use client';

// ============================================================
// The perimeter presence is measured against
// ------------------------------------------------------------
// WHAT WAS WRONG WITH THE OLD CONTROL. It was one button, "Use where I am now",
// and it lived inside the amber warning that appears only when NO perimeter is
// set. So it could be used exactly once, from wherever the person happened to
// be standing, with a radius of 400 m nobody chose — and after that there was
// no way to move it, widen it or correct it from the app at all.
//
// For a campus the size of Ituku-Ozalla that is the difference between a
// working system and one that reports half the estate as off site. Standing in
// the theatre block and pressing a button draws an 800 m circle centred on the
// theatre block; the emergency department, the wards and the laboratory may or
// may not fall inside it, and nobody finds out until staff who are plainly at
// work are marked absent.
//
// SO: centre it from GPS or from coordinates read off a map, choose the radius,
// see what is currently set, and change it afterwards. The API already accepted
// all of this — it validates the position, rejects 0,0, bounds the radius
// between 50 m and 5 km, retires the previous perimeter and writes an audit
// entry. Only the screen was missing.
//
// THE ACCURACY IS SHOWN, and deliberately. A phone indoors can report a fix
// that is honest about being 2 km wrong, and a perimeter centred on that is
// worse than no perimeter — it does not fail, it quietly answers wrongly about
// real people. Better to see "accurate to about 1,800 m" and walk outside.
// ============================================================

import { useState } from 'react';
import { Crosshair, Loader2, MapPin, Save, X } from 'lucide-react';

export interface Perimeter {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
}

/** The bounds the API enforces. Stated here so the form can say them first. */
const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 5000;

/**
 * A fix looser than this cannot sensibly centre a perimeter.
 *
 * Not a hard refusal — a 150 m fix on a large campus is still roughly right,
 * and refusing it would leave somebody with no way to proceed at all. It is
 * said out loud so the choice is theirs.
 */
const SHAKY_FIX_M = 100;

interface Props {
  current: Perimeter | null;
  onSaved: (p: Perimeter) => void;
}

export default function PerimeterEditor({ current, onSaved }: Props) {
  // Open straight away when there is nothing set, because then this is the one
  // thing on the screen that needs doing. Folded away once it is, because then
  // it is a setting rather than a task.
  const [open, setOpen] = useState(!current);
  const [name, setName] = useState(current?.name ?? 'Hospital perimeter');
  const [lat, setLat] = useState(current ? String(current.latitude) : '');
  const [lon, setLon] = useState(current ? String(current.longitude) : '');
  const [radius, setRadius] = useState(String(current?.radiusMetres ?? 400));
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** Fill the coordinates from this device, rather than saving behind them. */
  const useMyPosition = () => {
    setError(null);
    setNote(null);

    // Geolocation needs a secure context. On the theatre server that is the
    // Let's Encrypt certificate on unth-theatre.link; over plain http the
    // browser refuses silently, which looks like a broken button.
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('This device cannot report a position. Type the coordinates from a map instead — '
        + 'right-click the hospital in Google Maps and the first line of the menu is the pair.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Six decimal places is about 0.1 m. More is noise, less loses the
        // building.
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
        setAccuracy(Math.round(pos.coords.accuracy));
        setLocating(false);
        setNote('Position filled in. Check the radius covers the whole site before saving.');
      },
      (e) => {
        setLocating(false);
        setError(
          e.code === e.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in the browser, or type the coordinates from a map.'
            : 'The device would not give a position. Type the coordinates from a map instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const save = async () => {
    setError(null);
    setNote(null);

    const latitude = Number(lat);
    const longitude = Number(lon);
    const radiusMetres = Math.round(Number(radius));

    // Checked here as well as on the server, so the answer is immediate and
    // does not cost a round trip on a link that may be poor.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('Both a latitude and a longitude are needed.');
      return;
    }
    if (latitude === 0 && longitude === 0) {
      setError('0, 0 is in the Gulf of Guinea — that is what a failed fix reports, not a position.');
      return;
    }
    if (!Number.isFinite(radiusMetres) || radiusMetres < MIN_RADIUS_M || radiusMetres > MAX_RADIUS_M) {
      setError(`The radius must be between ${MIN_RADIUS_M} m and ${MAX_RADIUS_M} m.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/staff/presence/geofence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, latitude, longitude, radiusMetres }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'The perimeter could not be saved.');
        return;
      }
      onSaved(d.geofence as Perimeter);
      setNote('Perimeter saved. Presence checks will use it from the next one.');
      setOpen(false);
    } catch {
      setError('The perimeter could not be saved — the server did not answer.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3">
        <p className="text-sm text-gray-700">
          {current ? (
            <>
              <span className="font-semibold">{current.name}</span> — {current.radiusMetres} m around{' '}
              <span className="font-mono text-xs">
                {current.latitude.toFixed(5)}, {current.longitude.toFixed(5)}
              </span>
            </>
          ) : (
            'No perimeter is set, so presence cannot be judged.'
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
        >
          <MapPin className="h-4 w-4" />
          {current ? 'Change the perimeter' : 'Set the perimeter'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            {current ? 'Change the hospital perimeter' : 'Set the hospital perimeter'}
          </h3>
          <p className="mt-0.5 text-xs text-gray-600">
            A circle. Staff on duty inside it read as on site, outside it as away, and where there
            is no usable signal the answer stays &ldquo;cannot say&rdquo;.
          </p>
        </div>
        {current && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-gray-500 hover:bg-white hover:text-gray-700"
            aria-label="Close without changing the perimeter"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={useMyPosition}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {locating ? 'Finding this device…' : 'Fill in from where I am now'}
        </button>
        <p className="mt-1 text-xs text-gray-500">
          Or type the coordinates below — in Google Maps, right-click the middle of the hospital and
          the first line of the menu is the pair. That way the perimeter can be set from anywhere.
        </p>
      </div>

      {accuracy !== null && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            accuracy > SHAKY_FIX_M ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'
          }`}
        >
          {accuracy > SHAKY_FIX_M
            ? `This fix is only accurate to about ${accuracy} m, so the centre could be that far out. `
              + 'Step outside and try again, or type the coordinates from a map.'
            : `Fix accurate to about ${accuracy} m.`}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700">Latitude</span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            placeholder="6.863000"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700">Longitude</span>
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            inputMode="decimal"
            placeholder="7.412000"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700">
            Radius in metres ({MIN_RADIUS_M}–{MAX_RADIUS_M})
          </span>
          <input
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Measured from the centre, so it must reach the furthest building staff work in — the
            far wards and the laboratory, not only the theatre block. Too tight and people plainly
            at work read as away.
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Shown on the board, so it is clear which boundary a reading was judged against.
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      {note && !error && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{note}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {current ? 'Save the new perimeter' : 'Save the perimeter'}
        </button>
        {current && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>

      {current && (
        <p className="mt-3 text-xs text-gray-500">
          The perimeter in use now is {current.radiusMetres} m around{' '}
          <span className="font-mono">
            {current.latitude.toFixed(5)}, {current.longitude.toFixed(5)}
          </span>
          . Saving retires it and starts measuring against the new one; the old one is kept on
          record so a past reading can still be explained.
        </p>
      )}
    </div>
  );
}
