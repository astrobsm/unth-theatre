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

/** Namespaces the Keystore entry. Changing it orphans every enrolled phone. */
const KEYCHAIN_SERVER = 'ng.edu.unth.orm.device';

/** Stored under this username inside the Keystore entry; the value is the credential. */
const KEYCHAIN_USER = 'device-credential';

type NativeBiometric = {
  isAvailable: (opts?: { useFallback?: boolean }) => Promise<{ isAvailable: boolean; biometryType?: number }>;
  verifyIdentity: (opts: Record<string, unknown>) => Promise<void>;
  setCredentials: (opts: { username: string; password: string; server: string }) => Promise<void>;
  getCredentials: (opts: { server: string }) => Promise<{ username: string; password: string }>;
  deleteCredentials: (opts: { server: string }) => Promise<void>;
};

async function plugin(): Promise<NativeBiometric | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor?.isNativePlatform?.()) return null;
    const mod = await import('capacitor-native-biometric');
    return (mod as unknown as { NativeBiometric: NativeBiometric }).NativeBiometric ?? null;
  } catch {
    // Not native, or the plugin is missing from this build. Either way the
    // caller gets the password.
    return null;
  }
}

/** True only inside the installed app, on a handset with usable biometrics enrolled. */
export async function biometricAvailable(): Promise<boolean> {
  const nb = await plugin();
  if (!nb) return false;
  try {
    const r = await nb.isAvailable({ useFallback: false });
    return !!r?.isAvailable;
  } catch {
    return false;
  }
}

/** Whether this phone has already been enrolled for its owner. */
export async function hasStoredCredential(): Promise<boolean> {
  const nb = await plugin();
  if (!nb) return false;
  try {
    const c = await nb.getCredentials({ server: KEYCHAIN_SERVER });
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

export async function promptFingerprint(reason: string): Promise<boolean> {
  const nb = await plugin();
  if (!nb) return false;
  try {
    const verify = nb.verifyIdentity({
      reason,
      title: 'UNTH Theatre ORM',
      subtitle: reason,
      // No "use PIN instead" fallback: the app's own password box is the
      // fallback, and it authenticates the ACCOUNT. A device PIN only proves
      // someone can unlock the handset, which on a shared bench is not the
      // same question.
      useFallback: false,
      negativeButtonText: 'Use password',
    });

    // Race it. A timeout counts as a refusal, which sends the caller to the
    // password box — the one outcome that always works.
    const timedOut = Symbol('timeout');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), PROMPT_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([verify.then(() => 'ok' as const), deadline]);
      if (result === timedOut) {
        console.warn('[biometric] the system prompt did not respond; falling back to password');
        return false;
      }
      return true;
    } finally {
      if (timer) clearTimeout(timer);
      // The abandoned verify promise may still reject later with nobody
      // listening, which Node and some WebViews report as an unhandled
      // rejection. Swallow it explicitly.
      void verify.catch(() => undefined);
    }
  } catch {
    return false;
  }
}

/** Store the credential behind the biometric. Returns false if it could not be saved. */
export async function storeCredential(credential: string): Promise<boolean> {
  const nb = await plugin();
  if (!nb) return false;
  try {
    await nb.setCredentials({
      username: KEYCHAIN_USER,
      password: credential,
      server: KEYCHAIN_SERVER,
    });
    return true;
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
    const c = await nb.getCredentials({ server: KEYCHAIN_SERVER });
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
    await nb.deleteCredentials({ server: KEYCHAIN_SERVER });
  } catch {
    /* nothing stored, or already gone */
  }
}
