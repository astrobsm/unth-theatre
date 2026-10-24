// ============================================================
// Fingerprint sign-in, the handset half
// ------------------------------------------------------------
// Wraps capacitor-native-biometric so the rest of the app never imports it
// directly: every function here is a no-op on the web, so a component can
// call them unconditionally instead of guarding each call site and getting
// one of them wrong.
//
// THE OVERRIDING RULE: THIS MUST NEVER LOCK ANYBODY OUT. A surgeon with wet
// hands, a cracked sensor, a phone that has forgotten its enrolled prints —
// each of those has to end with a password box, not a dead end. Every failure
// path here therefore degrades to "fall back to the password", and none of
// them throws. A fingerprint is a convenience bolted onto a password; the
// moment it becomes the only way in, it is a clinical risk.
//
// The secret lives in Android Keystore (Keychain on iOS) via setCredentials,
// which is the only storage on the device that is encrypted at rest and tied
// to the biometric. It is NOT in localStorage, which is readable by anything
// that can reach the WebView and survives in plain text.
// ============================================================

/**
 * NO CALL INTO THE NATIVE PLUGIN IS ALLOWED TO HANG.
 *
 * This was learned twice. First verifyIdentity never settled and left a lock
 * screen saying "Scanning..."; a timeout was added around that one call. Then
 * "Turn on fingerprint sign-in" hung on "Setting up..." — because isAvailable
 * and getCredentials were still unguarded, and they run BEFORE the part that
 * had the timeout. Guarding the call that bit you is not the same as guarding
 * the class of fault.
 *
 * So every plugin call goes through here. Eight seconds is far longer than
 * any of these should take; they are local IPC, not network.
 */
const PLUGIN_TIMEOUT_MS = 8_000;

/**
 * Longer, because this one is a DOWNLOAD rather than local IPC — see
 * plugin(). Eight seconds would fail a legitimately slow chunk fetch on
 * theatre wifi and report "unavailable" to a phone that was merely slow.
 */
const MODULE_LOAD_TIMEOUT_MS = 25_000;

async function guarded<T>(
  label: string,
  work: () => Promise<T>,
  fallback: T,
  ms: number = PLUGIN_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[biometric] ${label} did not respond within ${ms}ms`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Namespaces the Keystore entry. Changing it orphans every enrolled phone. */
const KEYCHAIN_SERVER = 'ng.edu.unth.orm.device';

/** Stored under this username inside the Keystore entry; the value is the credential. */
const KEYCHAIN_USER = 'device-credential';

type NativeBiometric = {
  isAvailable: (opts?: { useFallback?: boolean }) => Promise<{
    isAvailable: boolean;
    biometryType?: number;
    errorCode?: number;
  }>;
  verifyIdentity: (opts: Record<string, unknown>) => Promise<void>;
  setCredentials: (opts: { username: string; password: string; server: string }) => Promise<void>;
  getCredentials: (opts: { server: string }) => Promise<{ username: string; password: string }>;
  deleteCredentials: (opts: { server: string }) => Promise<void>;
};

/**
 * THE DYNAMIC IMPORTS ARE A NETWORK FETCH, AND THAT IS THE BUG THAT KEPT
 * COMING BACK.
 *
 * This app loads from server.url, so its JavaScript is downloaded, not read
 * off the device. `await import('capacitor-native-biometric')` therefore
 * fetches a chunk — and on a phone managing a few hundred bytes a second it
 * can hang effectively for ever. Every guarded() call awaits plugin() FIRST,
 * so the guards below were never reached: the lock screen sat on "Scanning",
 * and the settings card sat on "Setting up", both of them stopped here
 * rather than in the plugin call I kept adding timeouts to.
 *
 * The module is cached after the first success, so this costs nothing on
 * every later call.
 */
let cachedPlugin: NativeBiometric | null | undefined;

async function plugin(): Promise<NativeBiometric | null> {
  if (cachedPlugin !== undefined) return cachedPlugin;

  const loaded = await guarded<NativeBiometric | null>(
    'loading the biometric plugin',
    async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor?.isNativePlatform?.()) return null;
      const mod = await import('capacitor-native-biometric');
      return (mod as unknown as { NativeBiometric: NativeBiometric }).NativeBiometric ?? null;
    },
    null,
    MODULE_LOAD_TIMEOUT_MS,
  );

  // Only cache a success. A timeout on a bad connection must not condemn the
  // phone for the rest of the session — the next attempt should try again.
  if (loaded) cachedPlugin = loaded;
  return loaded;
}

/**
 * What the plugin reports, as a sentence.
 *
 * The codes come from BiometricAuthError in capacitor-native-biometric. The
 * earlier version of this file threw all of them away and returned a bare
 * boolean, which is why two rounds of "it does not work" produced no
 * information at all and had to be guessed at. Anything the handset is
 * willing to tell us is worth putting on screen.
 */
const ERROR_REASONS: Record<number, string> = {
  1: 'This phone does not have a usable fingerprint sensor.',
  2: 'Too many failed attempts — fingerprint is locked until you unlock the phone with your PIN.',
  3: 'No fingerprints are saved on this phone. Add one in Android Settings, under Security.',
  4: 'Too many attempts. Wait about thirty seconds and try again.',
  10: 'That fingerprint was not recognised.',
  11: 'The fingerprint check was cancelled.',
  13: 'The screen was off or the app was in the background.',
  14: 'This phone has no screen lock set. Add a PIN or pattern first, in Android Settings.',
  15: 'Android cancelled the fingerprint check.',
  16: 'Cancelled.',
  17: 'You chose to use your password instead.',
};

export interface BiometricStatus {
  available: boolean;
  /** Plain-language reason when unavailable; null when it is fine. */
  reason: string | null;
}

export async function biometricStatus(): Promise<BiometricStatus> {
  const nb = await plugin();
  if (!nb) return { available: false, reason: null }; // web: say nothing
  try {
    const r = await guarded('isAvailable', () => nb.isAvailable({ useFallback: false }), {
      isAvailable: false,
      errorCode: 0,
    });
    if (r?.isAvailable) return { available: true, reason: null };
    const code = typeof r?.errorCode === 'number' ? r.errorCode : 0;
    return {
      available: false,
      reason: ERROR_REASONS[code] ?? 'Fingerprint sign-in is not available on this phone.',
    };
  } catch {
    return { available: false, reason: null };
  }
}

/** Kept for callers that only need the boolean. */
export async function biometricAvailable(): Promise<boolean> {
  return (await biometricStatus()).available;
}

/** Whether this phone has already been enrolled for its owner. */
export async function hasStoredCredential(): Promise<boolean> {
  const nb = await plugin();
  if (!nb) return false;
  try {
    const c = await guarded('getCredentials', () => nb.getCredentials({ server: KEYCHAIN_SERVER }), {
      username: '',
      password: '',
    });
    return !!c?.password;
  } catch {
    // getCredentials throws when nothing is stored. That is the normal
    // "not enrolled" answer, not an error.
    return false;
  }
}

/**
 * Show the system fingerprint prompt.
 *
 * Returns false on cancel, on a failed scan, and on any plugin error — the
 * caller shows the password box. It deliberately does not distinguish between
 * them: there is nothing useful the person can do differently, and the one
 * thing they must always be offered is the same either way.
 */
/**
 * How long to wait for the system prompt before giving up on it.
 *
 * verifyIdentity DOES NOT ALWAYS SETTLE. Dismissing the sheet with a back
 * gesture, or the prompt failing to display at all, can leave the promise
 * pending for ever — and an await that never returns left the lock screen
 * saying "Scanning..." with no way forward. On a hospital system that is not
 * a hung promise, it is a locked door. Twenty seconds is far longer than a
 * real scan and still short enough that nobody stands there wondering.
 */
const PROMPT_TIMEOUT_MS = 20_000;

export interface PromptResult {
  ok: boolean;
  /** Shown to the person when ok is false. Never blank. */
  message: string;
}

/**
 * Show the system fingerprint prompt.
 *
 * Returns a REASON, not just false. An unexplained failure is what turned
 * this into two rounds of guesswork: the screen said "that did not work"
 * whether the sensor was wet, the phone had no fingerprints saved, or the
 * prompt never appeared at all.
 *
 * It never throws, and it never hangs.
 */
export async function promptFingerprint(reason: string): Promise<PromptResult> {
  const nb = await plugin();
  if (!nb) return { ok: false, message: 'Fingerprint sign-in is not available here.' };

  // Ask first, so "no fingerprints saved on this phone" is reported as that
  // rather than as a prompt that silently does nothing.
  const status = await biometricStatus();
  if (!status.available) {
    return {
      ok: false,
      message: status.reason ?? 'Fingerprint sign-in is not available on this phone.',
    };
  }

  try {
    const verify = nb.verifyIdentity({
      reason,
      title: 'UNTH Theatre ORM',
      subtitle: reason,
      // No device-PIN fallback: the app's own password box is the fallback,
      // and it authenticates the ACCOUNT. A device PIN only proves someone
      // can unlock the handset, which is not the same question.
      useFallback: false,
      negativeButtonText: 'Use password',
    });

    const timedOut = Symbol('timeout');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), PROMPT_TIMEOUT_MS);
    });

    try {
      const outcome = await Promise.race([verify.then(() => 'ok' as const), deadline]);
      if (outcome === timedOut) {
        console.warn('[biometric] the system prompt never responded');
        return {
          ok: false,
          message:
            'The fingerprint screen did not open on this phone. This can happen on some handsets.',
        };
      }
      return { ok: true, message: '' };
    } finally {
      if (timer) clearTimeout(timer);
      // The abandoned promise may still reject with nobody listening, which
      // some WebViews report as an unhandled rejection.
      void verify.catch(() => undefined);
    }
  } catch (e) {
    // The plugin rejects with a message and sometimes a numeric code.
    const code = Number((e as { code?: unknown })?.code);
    const mapped = Number.isFinite(code) ? ERROR_REASONS[code] : undefined;
    return { ok: false, message: mapped ?? 'That fingerprint was not recognised.' };
  }
}

/** Store the credential behind the biometric. Returns false if it could not be saved. */
export async function storeCredential(credential: string): Promise<boolean> {
  const nb = await plugin();
  if (!nb) return false;
  try {
    const done = await guarded(
      'setCredentials',
      async () => {
        await nb.setCredentials({
          username: KEYCHAIN_USER,
          password: credential,
          server: KEYCHAIN_SERVER,
        });
        return true;
      },
      false,
    );
    return done;
  } catch (e) {
    console.warn('[biometric] could not store credential', e);
    return false;
  }
}

/** Read the credential back. Null when absent or unreadable. */
export async function readCredential(): Promise<string | null> {
  const nb = await plugin();
  if (!nb) return null;
  try {
    const c = await guarded('readCredential', () => nb.getCredentials({ server: KEYCHAIN_SERVER }), {
      username: '',
      password: '',
    });
    return c?.password || null;
  } catch {
    return null;
  }
}

/**
 * Forget this phone's credential.
 *
 * Call on sign-out and whenever the server refuses a credential: a secret the
 * server will not accept is worse than no secret, because it makes every
 * future cold start fail at the fingerprint instead of going straight to the
 * password box that would actually work.
 */
export async function forgetCredential(): Promise<void> {
  const nb = await plugin();
  if (!nb) return;
  try {
    await guarded(
      'deleteCredentials',
      async () => {
        await nb.deleteCredentials({ server: KEYCHAIN_SERVER });
        return true;
      },
      false,
    );
  } catch {
    /* nothing stored, or already gone */
  }
}
