'use client';

/**
 * Public, no-login page for theatre staff to record their scrub size and
 * footwear size. Staff enter their staff code and sizes; scrub-care providers
 * then look these up at the daily pickup counter.
 *
 * No auth, no CRUD beyond the staff member's own profile (upsert by staffCode).
 */

import { useState } from 'react';
import {
  Shirt,
  Footprints,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
} from 'lucide-react';

const SCRUB_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const COLOR_STYLES: Record<string, string> = {
  GREEN: 'bg-green-100 text-green-800 border-green-300',
  BLUE: 'bg-blue-100 text-blue-800 border-blue-300',
  MAROON: 'bg-rose-100 text-rose-800 border-rose-300',
  TEAL: 'bg-teal-100 text-teal-800 border-teal-300',
  GREY: 'bg-gray-100 text-gray-700 border-gray-300',
  BLACK: 'bg-slate-800 text-white border-slate-800',
};

interface Lookup {
  found: boolean;
  fullName: string | null;
  role: string | null;
  scrubColor: string;
  scrubSize: string | null;
  footwearSize: string | null;
  hasProfile: boolean;
}

export default function PublicScrubProfilePage() {
  const [staffCode, setStaffCode] = useState('');
  const [scrubSize, setScrubSize] = useState('M');
  const [footwearSize, setFootwearSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const prefill = async () => {
    const code = staffCode.trim().toUpperCase();
    if (!code) {
      flash('err', 'Enter your staff code first');
      return;
    }
    setLooking(true);
    setLookup(null);
    try {
      const res = await fetch(
        `/api/public/scrub-profile?staffCode=${encodeURIComponent(code)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.found) {
        flash('err', data.error || 'No record found for that staff code');
      } else {
        setLookup(data);
        if (data.scrubSize) setScrubSize(data.scrubSize);
        if (data.footwearSize) setFootwearSize(data.footwearSize);
        flash(
          'ok',
          data.hasProfile
            ? 'Found your saved sizes — update if needed.'
            : 'Staff found — please enter your sizes.',
        );
      }
    } catch {
      flash('err', 'Network error — try again');
    } finally {
      setLooking(false);
    }
  };

  const save = async () => {
    const code = staffCode.trim().toUpperCase();
    if (!code) {
      flash('err', 'Staff code is required');
      return;
    }
    if (!footwearSize.trim()) {
      flash('err', 'Footwear size is required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/public/scrub-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffCode: code,
          scrubSize,
          footwearSize: footwearSize.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash('err', data.error || 'Failed to save');
      } else {
        setLookup({
          found: true,
          fullName: data.fullName,
          role: data.role,
          scrubColor: data.scrubColor,
          scrubSize: data.scrubSize,
          footwearSize: data.footwearSize,
          hasProfile: true,
        });
        flash('ok', 'Saved! Your sizes are ready for pickup.');
      }
    } catch {
      flash('err', 'Network error — try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mx-auto mb-3 shadow">
            <Shirt className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Scrub &amp; Footwear Sizes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            UNTH Theatre · record your sizes for daily pickup
          </p>
        </div>

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
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            {msg.text}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {/* Staff code */}
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Staff code
          </label>
          <div className="flex gap-2 mb-4">
            <input
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
              placeholder="e.g. UNTH-1234"
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-teal-500 focus:outline-none"
            />
            <button
              onClick={prefill}
              disabled={looking}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {looking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Look up
            </button>
          </div>

          {/* Resolved staff / colour */}
          {lookup && lookup.found && (
            <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {lookup.fullName || 'Staff member'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {lookup.role || 'Role not set'}
                  </div>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    COLOR_STYLES[lookup.scrubColor] ||
                    'bg-gray-100 text-gray-700 border-gray-300'
                  }`}
                >
                  {lookup.scrubColor} scrub
                </span>
              </div>
            </div>
          )}

          {/* Scrub size */}
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            <Shirt className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Scrub size
          </label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {SCRUB_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScrubSize(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  scrubSize === s
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-teal-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Footwear size */}
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            <Footprints className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Footwear size (EU)
          </label>
          <input
            value={footwearSize}
            onChange={(e) => setFootwearSize(e.target.value)}
            placeholder="e.g. 42"
            inputMode="numeric"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm mb-5 focus:border-teal-500 focus:outline-none"
          />

          <button
            onClick={save}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Save my sizes
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          No login needed. Your scrub colour is set by your role.
        </p>
      </div>
    </div>
  );
}
