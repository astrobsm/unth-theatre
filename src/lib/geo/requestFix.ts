'use client';

// ============================================================
// Asking the handset where it is, without ever blocking the work
// ------------------------------------------------------------
// One promise that always resolves. There is no rejection path and no thrown
// error, because every caller is a form somebody is trying to submit, and the
// lesson from the anaesthesia setup log is that a position which can refuse
// becomes a position which stops staff working:
//
//   "Location permission denied. Location is required to log setup." — an
//   anaesthetic technician, standing in the theatre, unable to record that
//   she had set it up. The gate did not produce better data. It produced no
//   data and a technician who stopped using the screen.
//
// So this returns a fix OR a reason there is none, and the caller records
// whichever arrived. A reason is information; a refusal is an obstruction.
//
// THREE THINGS IT HANDLES THAT THE NAIVE CALL DOES NOT:
//
//   PLAIN HTTP. On the theatre server, reached by IP, Chrome reports
//   PERMISSION_DENIED with no prompt and no way for anybody to grant it. Staff
//   conclude they have broken their phone. window.isSecureContext names the
//   real cause, and we say so instead.
//
//   THE FIRST FIX IS THE WORST FIX. getCurrentPosition hands back whatever the
//   radio has, which indoors is often a cell-tower estimate a kilometre wide.
//   watchPosition improves over a few seconds, so we keep the best reading and
//   stop early once it is good enough to be worth having.
//
//   A HANDSET THAT NEVER ANSWERS. Both callbacks can simply never fire — no
//   error, no fix, for as long as you wait. The hard timeout is what makes
//   this safe to await in front of a submit.
//
// Deliberately no reverse geocoding. The setup screen calls OpenStreetMap to
// turn the point into a street name, which costs a second of somebody's time
// at a bedside and hands a position taken beside a named patient to a third
// party. The point is stored and a map link is offered instead.
// ============================================================

export interface CapturedFix {
  latitude: number | null;
  longitude: number | null;
  /** Radius of uncertainty in metres, as the handset reported it. */
  accuracyM: number | null;
  /** Why there is no position. Null when there is one. */
  unavailableReason: string | null;
}

const NO_FIX = (reason: string): CapturedFix => ({
  latitude: null, longitude: null, accuracyM: null, unavailableReason: reason,
});

/** Good enough to stop waiting for better. A ward is bigger than this. */
const GOOD_ENOUGH_M = 30;

/** How long to wait before recording that nothing arrived. */
export const FIX_TIMEOUT_MS = 12_000;

/**
 * The handset's position, or the reason there is none.
 *
 * Resolves within `timeoutMs` whatever happens. Never rejects.
 */
export function requestFix(
  opts: { timeoutMs?: number } = {},
): Promise<CapturedFix> {
  const timeoutMs = opts.timeoutMs ?? FIX_TIMEOUT_MS;

  return new Promise<CapturedFix>((resolve) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      resolve(NO_FIX('This device has no location service'));
      return;
    }
    if (!window.isSecureContext) {
      resolve(NO_FIX('Location is blocked because this page is not on a secure (https) address'));
      return;
    }

    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId = -1;

    const done = (result: CapturedFix) => {
      if (settled) return;
      settled = true;
      if (watchId !== -1) {
        try { navigator.geolocation.clearWatch(watchId); } catch { /* already gone */ }
      }
      resolve(result);
    };

    const finishWithBest = (fallbackReason: string) => {
      if (!best) { done(NO_FIX(fallbackReason)); return; }
      done({
        latitude: best.coords.latitude,
        longitude: best.coords.longitude,
        accuracyM: Number.isFinite(best.coords.accuracy)
          ? Math.round(best.coords.accuracy)
          : null,
        unavailableReason: null,
      });
    };

    const timer = setTimeout(() => {
      // Whatever we have by now is what we have. A rough fix beats none.
      finishWithBest('The handset gave no position in time');
    }, timeoutMs);

    const stop = (fn: () => void) => { clearTimeout(timer); fn(); };

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
          if (position.coords.accuracy <= GOOD_ENOUGH_M) {
            stop(() => finishWithBest('The handset gave no position'));
          }
        },
        (error) => {
          // A fix already in hand outranks a later error: Safari reports a
          // timeout after handing over a perfectly good reading.
          if (best) { stop(() => finishWithBest('The handset gave no position')); return; }
          const reason =
            error?.code === 1 ? 'Location permission denied on this handset'
              : error?.code === 2 ? 'No position available here (the building may be shielded)'
                : error?.code === 3 ? 'The handset took too long to find a position'
                  : (error?.message || 'The handset gave no position');
          stop(() => done(NO_FIX(reason)));
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    } catch (e: unknown) {
      stop(() => done(NO_FIX((e as Error)?.message || 'This device refused the location request')));
    }
  });
}
