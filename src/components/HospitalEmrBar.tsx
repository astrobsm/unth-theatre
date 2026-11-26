'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronUp, Copy, ExternalLink, HeartPulse, ShieldCheck, WifiOff,
} from 'lucide-react';

import {
  EMR_LAST_OPENED_KEY, EMR_STEPS, HOSPITAL_EMR_LABEL, emrHost, resolveEmrUrl,
} from '@/lib/hospitalEmr';
import { formatBookedAtShort } from '@/lib/bookingLateness';
import { useOnlineStatus } from '@/lib/useOffline';

/**
 * The hospital EMR, one tap from any dashboard.
 *
 * Sits directly under the Careline strip because that is the row people
 * already look at for "who do I reach / where do I go", and because every
 * role needs the patient's wider record at some point in a theatre day.
 *
 * ORM DOES NOT SIGN ANYBODY IN. The button opens the EMR's own page; the user
 * signs in there with their clinic details and sets their location. Nothing
 * about the EMR account is asked for, passed or stored here, and the page
 * says so — because a button inside one system that asks for another system's
 * password is the shape of the thing staff should refuse.
 *
 * THE DESTINATION IS SHOWN, not hidden behind the label, so anybody about to
 * type a hospital password can see where the tab is going first.
 */
export default function HospitalEmrBar() {
  const url = resolveEmrUrl(process.env.NEXT_PUBLIC_HOSPITAL_EMR_URL);
  const host = emrHost(url);
  const online = useOnlineStatus();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastOpened, setLastOpened] = useState<number | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(EMR_LAST_OPENED_KEY);
      if (v) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) setLastOpened(n);
      }
    } catch {
      /* private browsing, or storage full — the bar still works */
    }
  }, []);

  const openEmr = useCallback(() => {
    const now = Date.now();
    setLastOpened(now);
    try {
      window.localStorage.setItem(EMR_LAST_OPENED_KEY, String(now));
    } catch {
      /* not worth telling anybody about */
    }
    // noopener matters: without it the EMR tab can reach back into this one
    // through window.opener.
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (older browser, or an insecure origin). Select it
      // the old way so the address can still be copied by hand.
      window.prompt('Copy the EMR address', url);
    }
  }, [url]);

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/70 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2">
        <HeartPulse className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-sm font-semibold text-indigo-900">{HOSPITAL_EMR_LABEL}</span>
          <span className="hidden sm:inline text-xs text-indigo-700/80 ml-2">
            Sign in with your clinic EMR details, then set your location to see your patients.
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openEmr}
            title={`Opens ${host} in a new tab`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <ExternalLink className="w-4 h-4" /> Open {HOSPITAL_EMR_LABEL}
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            aria-label="Copy the EMR address"
            title="Copy the address, to open it on your phone"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-100"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy link'}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="How to get into the EMR"
            className="text-indigo-600 p-1 rounded hover:bg-indigo-100"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* The one-liner the wide screens get inline, for phones. */}
      <p className="sm:hidden px-3 pb-2 -mt-1 text-xs text-indigo-700/80">
        Sign in with your clinic EMR details, then set your location.
      </p>

      {!online && (
        <p className="mx-3 sm:mx-4 mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-900">
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
          This device is offline. The EMR is a separate system and will not load until the
          network is back — ORM itself keeps working.
        </p>
      )}

      {open && (
        <div className="px-3 sm:px-4 pb-3 pt-1 border-t border-indigo-200/70">
          <ol className="space-y-2">
            {EMR_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-2 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium text-indigo-900">{s.title}</span>
                  <span className="block text-xs text-gray-600">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-600">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-600" />
            ORM never asks for, sees or stores your EMR password. You sign in on the EMR&rsquo;s
            own page at <b className="font-mono">{host}</b> — if anything inside ORM asks you for
            those details, it is not us.
          </p>

          {lastOpened !== null && (
            <p className="mt-2 text-xs text-gray-500">
              Last opened from this device on {formatBookedAtShort(new Date(lastOpened))}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
