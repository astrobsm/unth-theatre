// ============================================================
// Sending an SMS
// ------------------------------------------------------------
// One narrow interface, one adapter per provider. Termii is what this hospital
// uses, and it is behind this seam rather than called directly so that swapping
// it later is one file rather than a search through the routes.
//
// The seam also means the OTP flow can be built, tested and demonstrated before
// any account exists: with no provider configured, the console driver prints
// the message to the server log and reports success. That is deliberately NOT
// silent — a system that pretends to send codes is worse than one that admits
// it cannot.
// ============================================================

import { sendViaTermii, termiiConfigured } from './termii';

export interface SmsResult {
  sent: boolean;
  provider: 'termii' | 'console';
  /** Provider's own id, for chasing a missing message with support. */
  reference?: string;
  error?: string;
  /** True when the number was refused as unroutable rather than the send failing. */
  invalidNumber?: boolean;
}

/**
 * Send one SMS to one E.164 number (234..., no plus).
 *
 * Never throws. A recovery route must not return a 500 because a gateway is
 * having a bad afternoon — it returns the same generic message either way, and
 * the failure is logged for whoever is on support.
 */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  try {
    if (termiiConfigured()) return await sendViaTermii(to, message);

    // No provider configured. Say so loudly in the log, and do not claim to
    // have delivered anything.
    console.warn(
      `[sms] NO PROVIDER CONFIGURED. Message to ${to} was not sent. Body: ${message}`,
    );
    return { sent: false, provider: 'console', error: 'No SMS provider is configured.' };
  } catch (error: any) {
    console.error('[sms] send failed:', error?.message ?? error);
    return { sent: false, provider: 'console', error: 'The message could not be sent.' };
  }
}

export { termiiConfigured };
