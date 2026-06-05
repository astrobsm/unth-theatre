'use client';

import { useEffect, useState } from 'react';
import { Megaphone, X, Download } from 'lucide-react';

const STORAGE_KEY = 'orm-go-live-banner-dismissed-2026-06-08';
const HIDE_AFTER = new Date('2026-06-09T00:00:00+01:00').getTime();

export default function OrmGoLiveBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Date.now() >= HIDE_AFTER) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore quota errors */
    }
    setVisible(false);
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 mt-0.5 rounded-full bg-amber-500 p-2 text-white">
          <Megaphone className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 text-sm text-amber-900">
          <div className="font-bold text-amber-900 text-base">
            ORM Go-Live — Monday, 8 June 2026
          </div>
          <p className="mt-1">
            From <strong>Monday 8 June 2026</strong>, ALL surgical bookings
            (elective &amp; emergency) MUST be made on this ORM platform.
            Patients pay for surgical consumable packs at the{' '}
            <strong>
              Pack Shop — upstairs, beside the FCMB ATM, near the former DA
              office
            </strong>{' '}
            and present the Evidence of Payment in theatre. All anaesthetic
            prescriptions are wired automatically to Pharmacy. Cases not on ORM
            by 08:00 of the surgery day will be deferred.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              href="/api/announcements/orm-go-live/pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 font-semibold"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download PDF
            </a>
            <a
              href="/announcements/orm-go-live-2026-06-08.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 underline font-medium"
            >
              Read full text
            </a>
            <a
              href="/announcements/orm-go-live-2026-06-08-whatsapp.txt"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 underline font-medium"
            >
              WhatsApp version
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-200 hover:text-amber-900 transition"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
