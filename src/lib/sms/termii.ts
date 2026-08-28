// ============================================================
// Termii — SMS delivery for Nigerian numbers
// ------------------------------------------------------------
// Chosen because it routes on local carrier interconnects rather than an
// international gateway. International routes into Nigeria are filtered
// aggressively, and a one-time code that arrives forty minutes late has already
// expired — which reads to the user as "the app is broken", not "the SMS was
// slow".
//
// TWO NIGERIAN DETAILS THAT DECIDE WHETHER THIS WORKS
//
// 1. THE DND LIST. Most Nigerian mobile subscribers are on the operators'
//    Do-Not-Disturb list, which blocks ordinary bulk SMS outright. Termii's
//    "dnd" channel uses the transactional route that reaches those numbers, and
//    a one-time code is unambiguously transactional. Sending OTPs on the
//    "generic" channel silently fails for a large share of staff, and the logs
//    look successful, which is the worst possible failure.
//
// 2. THE SENDER ID must be registered with the operators before it will send.
//    Approval takes days. Until it is approved, use one of Termii's pre-cleared
//    IDs (e.g. "N-Alert") — those work immediately on the dnd route.
//
// DELIBERATELY NOT using Termii's own /api/sms/otp/send endpoint, which
// generates and stores the code on their side. This system generates its own
// code, hashes it, and holds the attempt cap and expiry itself. Termii is a
// pipe. Handing an authentication secret to a third party to hold is a decision
// that should be made on purpose, and there is no reason to make it here.
//
// ENV
//   TERMII_API_KEY     from the Termii dashboard
//   TERMII_SENDER_ID   registered sender ID, or "N-Alert" while waiting
//   TERMII_CHANNEL     "dnd" (default) | "generic" | "whatsapp"
//   TERMII_BASE_URL    defaults to https://api.ng.termii.com
// ============================================================

import type { SmsResult } from './index';

const BASE_URL = process.env.TERMII_BASE_URL || 'https://api.ng.termii.com';

/** How long to wait before giving up. A locked-out user is staring at a
 *  spinner; ten seconds is already a long time to make them wait. */
const TIMEOUT_MS = 10_000;

export function termiiConfigured(): boolean {
  return Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID);
}

export async function sendViaTermii(to: string, message: string): Promise<SmsResult> {
  const apiKey = process.env.TERMII_API_KEY;
  const from = process.env.TERMII_SENDER_ID;
  const channel = process.env.TERMII_CHANNEL || 'dnd';

  if (!apiKey || !from) {
    return { sent: false, provider: 'termii', error: 'Termii is not configured.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        to,
        from,
        sms: message,
        type: 'plain',
        channel,
        api_key: apiKey,
      }),
    });

    const body: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Termii answers 200 with an error body more often than it answers 4xx,
      // so both paths have to be read.
      const detail = body?.message || `HTTP ${response.status}`;
      console.error('[termii] rejected the send:', detail);
      return {
        sent: false,
        provider: 'termii',
        error: detail,
        invalidNumber: /invalid|not.*valid|number/i.test(String(detail)),
      };
    }

    // A successful send returns a message_id. Anything else is a failure
    // wearing a 200, and treating it as success is how a system ends up
    // believing it sent 500 codes it never sent.
    const reference = body?.message_id ?? body?.messageId;
    if (!reference) {
      const detail = body?.message || 'Termii accepted the request but returned no message id.';
      console.error('[termii] no message id in response:', detail);
      return { sent: false, provider: 'termii', error: detail };
    }

    return { sent: true, provider: 'termii', reference: String(reference) };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.error('[termii] timed out after', TIMEOUT_MS, 'ms');
      return { sent: false, provider: 'termii', error: 'The SMS gateway did not respond in time.' };
    }
    console.error('[termii] send failed:', error?.message ?? error);
    return { sent: false, provider: 'termii', error: 'The SMS gateway could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}
