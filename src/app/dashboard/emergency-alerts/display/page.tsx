'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// This page now redirects to the full-screen kiosk display at /emergency-display
// The new display uses SSE streaming, Web Audio alerts (no browser TTS), 
// and full-screen slideshow mode optimized for Android display tablets.

export default function EmergencyAlertsDisplayPage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      window.open('/emergency-display', '_blank');
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="text-center space-y-8">
        <div className="text-8xl">🖥️</div>
        <h1 className="text-4xl font-bold text-white">Emergency Display Upgraded</h1>
        <p className="text-xl text-gray-400 max-w-xl mx-auto">
          The emergency display has been upgraded to a full-screen kiosk mode with 
          real-time SSE streaming, Web Audio alerts (no browser TTS), and slideshow 
          rotation for all booked emergencies.
        </p>
        <div className="space-y-4">
          <Link
            href="/emergency-display"
            target="_blank"
            className="inline-block px-8 py-4 bg-red-600 hover:bg-red-700 text-white text-2xl font-bold rounded-2xl transition-all shadow-lg shadow-red-600/30"
          >
            🚨 Open Full-Screen Emergency Display
          </Link>
          <p className="text-gray-500 text-sm">
            Opens in a new tab — ideal for wall-mounted screens and Android kiosk tablets.
            <br />
            URL: <code className="text-gray-400">/emergency-display</code>
          </p>
        </div>
        <p className="text-gray-600 animate-pulse">Redirecting in 3 seconds...</p>
      </div>
    </div>
  );
}
