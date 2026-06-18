'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, X, MessageCircle } from 'lucide-react';

// Hourly appreciation / pilot broadcast.
// Shows once at the top of every hour between 08:00 and 16:00 (8am–4pm).
// Dismissing hides it only for the current hour-slot; it returns next hour.
// Auto-stops after the pilot transition window.
const START_HOUR = 8; // 8 AM
const END_HOUR = 16; // 4 PM (inclusive)
const HIDE_AFTER = new Date('2026-07-13T00:00:00+01:00').getTime();
const DISMISS_PREFIX = 'orm-hourly-broadcast-dismissed:';

function currentSlotKey(d: Date): string {
  // One slot per calendar day + hour.
  return `${DISMISS_PREFIX}${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}`;
}

function withinWindow(d: Date): boolean {
  const h = d.getHours();
  return h >= START_HOUR && h <= END_HOUR;
}

export default function OrmHourlyBroadcast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const evaluate = () => {
      if (Date.now() >= HIDE_AFTER) {
        setVisible(false);
        return;
      }
      const now = new Date();
      if (!withinWindow(now)) {
        setVisible(false);
        return;
      }
      const dismissed = window.localStorage.getItem(currentSlotKey(now)) === '1';
      setVisible(!dismissed);
    };

    evaluate();
    // Re-check every 30s so a new hour-slot brings the banner back automatically.
    const t = setInterval(evaluate, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(currentSlotKey(new Date()), '1');
    } catch {
      /* ignore quota errors */
    }
    setVisible(false);
  };

  return (
    <div className="mb-4 rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 mt-0.5 rounded-full bg-emerald-600 p-2 text-white">
          <Megaphone className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 text-sm text-emerald-900">
          <div className="font-bold text-emerald-900 text-base">
            Thank You, Theatre Team — ORM Pilot Workflow
          </div>
          <p className="mt-1">
            Your enthusiasm in embracing the{' '}
            <strong>Operative Resource Manager (ORM)</strong> is driving a real
            transformation of our theatre services. To complete the{' '}
            <strong>pilot workflow assessment</strong>, every unit should book{' '}
            <strong>all cases</strong> on ORM. Use the{' '}
            <strong>Feedback module</strong> to share suggestions and necessary
            adjustments — each one is reviewed for implementation.
          </p>
          <p className="mt-2">
            🛰️ <strong>Starlink is now fully functional</strong> within the
            Theatre Complex, with coverage soon extending to the{' '}
            <strong>Blood Bank, Eye Theatre and CTU Theatre</strong>.
          </p>
          <p className="mt-2">
            🗓️ Unit-by-unit training continues through next week, after which
            paper booking will be completely withdrawn. From the{' '}
            <strong>first week of July, ORM will be the SOLE booking platform</strong>.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/dashboard/feedback"
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 font-semibold"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Give Feedback
            </Link>
            <Link
              href="/dashboard/surgeries/new"
              className="inline-flex items-center gap-1 text-emerald-800 hover:text-emerald-900 underline font-medium"
            >
              Book a case on ORM
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 rounded-md p-1 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-900 transition"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
