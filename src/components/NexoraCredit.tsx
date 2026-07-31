'use client';

// ============================================================
// Attribution — NEXORA Technologies
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
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      {hasLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/nexora-logo.png"
          alt="NEXORA Technologies"
          className="h-8 w-auto opacity-90"
          onError={() => setHasLogo(false)}
        />
      )}
      <p className={`text-center text-[10px] leading-tight ${muted}`}>
        Created and managed by{' '}
        <span className={`font-semibold tracking-wide ${strong}`}>NEXORA Technologies</span>
      </p>
    </div>
  );
}
