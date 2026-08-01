'use client';

// ============================================================
// Attribution — NEXORA Innovations
// ------------------------------------------------------------
// Shown on the sign-in screen and at the foot of the dashboard sidebar.
//
// The mark is optional: drop the logo at public/nexora-logo.png and it appears.
// Until then the credit renders as text alone rather than showing a broken
// image — the same defensive pattern the UNTH logo on the login page uses.
// ============================================================

import { useState } from 'react';

export default function NexoraCredit({
  variant = 'light',
  className = '',
}: {
  /** `light` for pale backgrounds, `dark` for the navy sidebar. */
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const [hasLogo, setHasLogo] = useState(true);

  const muted = variant === 'dark' ? 'text-primary-300' : 'text-gray-400';
  const strong = variant === 'dark' ? 'text-white' : 'text-gray-600';

  return (
    // One line: mark and credit sit together as a single lockup.
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      {hasLogo && (
        // The mark is neon on near-black and its background is baked in (no
        // transparency), so on a pale page it would read as a stray dark
        // square. Seating it in a small dark chip makes that deliberate, and
        // matches how the brand is drawn.
        <span className="inline-flex flex-shrink-0 items-center justify-center rounded bg-[#020617] p-[2px] ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nexora-logo.png"
            alt="NEXORA Innovations"
            width={14}
            height={14}
            className="h-3.5 w-3.5 object-contain"
            onError={() => setHasLogo(false)}
          />
        </span>
      )}
      <p className={`text-center text-[10px] leading-tight ${muted}`}>
        Created and managed by{' '}
        <span className={`font-semibold tracking-wide ${strong}`}>NEXORA Innovations</span>
      </p>
    </div>
  );
}
