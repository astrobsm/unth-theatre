// ============================================================
// WhatsApp Business Cloud API
// ------------------------------------------------------------
// Sending is CLOUD-ONLY. The theatre server has no public inbound address, so
// Meta's delivery webhooks can only reach Vercel — and if both nodes could send,
// a message queued locally and then synced would go out twice, once from each.
// The local node queues; this runs on the cloud and transmits.
//
// Two things about this API that shape the code:
//
//   1. Outside a 24-hour window opened by the recipient messaging you first, ONLY
//      a pre-approved template may be sent. Free text is rejected. Since a
//      hospital almost always messages first, template sending is the normal
//      path and free text is the exception.
//   2. Every message is billable. A retry loop is a bill as well as a nuisance,
//      which is why failures are classified rather than blindly retried.
// ============================================================

export interface WhatsAppConfig {
  apiUrl: string;
  accessToken: string;
  phoneNumberId: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** Whether trying again could ever succeed. See classifyFailure. */
  retryable?: boolean;
}

export function whatsappConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return {
    // Pinned in configuration rather than the code: Meta deprecates versions on
    // a schedule, and a hospital should be able to move without a deploy.
    apiUrl: process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0',
    accessToken,
    phoneNumberId,
  };
}

/**
 * Which failures are worth retrying.
 *
 * Retrying the rest costs money and achieves nothing: a wrong number stays
 * wrong, and an unapproved template stays unapproved however many times it is
 * sent. Only genuinely transient conditions come back.
 */
export function classifyFailure(status: number, code?: number): {
  retryable: boolean; reason: string;
} {
  if (status === 429) return { retryable: true, reason: 'Rate limited by the provider.' };
  if (status >= 500) return { retryable: true, reason: 'Provider is temporarily unavailable.' };
  if (status === 401 || status === 403) {
    // A retry cannot fix a credential, and hammering an unauthorised endpoint is
    // how an account gets restricted.
    return { retryable: false, reason: 'WhatsApp credentials are invalid or expired.' };
  }
  if (code === 131026) return { retryable: false, reason: 'The number is not on WhatsApp.' };
  if (code === 131047) {
    return { retryable: false, reason: 'Outside the 24-hour window — an approved template is required.' };
  }
  if (code === 132000 || code === 132001) {
    return { retryable: false, reason: 'The template does not exist or is not approved.' };
  }
  if (status === 400) return { retryable: false, reason: 'The provider rejected the request.' };
  return { retryable: status >= 500, reason: `Provider error (HTTP ${status}).` };
}

/** Nigerian numbers as Meta expects them: country code, digits only. */
export function toWhatsAppNumber(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10 && !digits.startsWith('0')) return `234${digits}`;
  if (digits.length === 13 && digits.startsWith('234')) return digits;
  if (digits.length > 13 && digits.includes('234')) {
    const rest = digits.slice(digits.indexOf('234'));
    if (rest.length === 13) return rest;
  }
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

async function post(
  cfg: WhatsAppConfig,
  body: unknown
): Promise<WhatsAppSendResult> {
  try {
    // A hospital network can stall a request indefinitely; without this the
    // sender would hold a slot for ever waiting on a socket nobody will close.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(`${cfg.apiUrl}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const code = json?.error?.code as number | undefined;
      const { retryable, reason } = classifyFailure(res.status, code);
      // The provider's own message is kept: it is far more specific than
      // anything inferred, and it is what a person needs when diagnosing.
      const detail = json?.error?.message ? ` ${json.error.message}` : '';
      return { ok: false, retryable, error: `${reason}${detail}`.slice(0, 500) };
    }

    return { ok: true, providerMessageId: json?.messages?.[0]?.id };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      // A timeout is transient; the message may even have been accepted, which
      // is why the idempotency key matters more than the retry.
      retryable: true,
      error: aborted ? 'Timed out contacting WhatsApp.' : 'Could not reach WhatsApp.',
    };
  }
}

/**
 * Send an APPROVED template. This is the normal path.
 *
 * Meta only accepts free text inside a 24-hour window opened by the recipient
 * writing first, and a hospital almost always messages first.
 */
export async function sendTemplate(
  cfg: WhatsAppConfig,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[]
): Promise<WhatsAppSendResult> {
  const number = toWhatsAppNumber(to);
  if (!number) return { ok: false, retryable: false, error: 'Not a usable phone number.' };

  return post(cfg, {
    messaging_product: 'whatsapp',
    to: number,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParameters.length
        ? [{
            type: 'body',
            // Positional, in the order Meta approved. The template body owns the
            // wording; ORM supplies only the values.
            parameters: bodyParameters.map((text) => ({ type: 'text', text })),
          }]
        : [],
    },
  });
}

/**
 * Free text. Only valid inside an open 24-hour window.
 *
 * Kept for replies to someone who contacted the hospital first. Used for an
 * outbound alert it will simply be rejected — correctly.
 */
export async function sendText(
  cfg: WhatsAppConfig,
  to: string,
  body: string
): Promise<WhatsAppSendResult> {
  const number = toWhatsAppNumber(to);
  if (!number) return { ok: false, retryable: false, error: 'Not a usable phone number.' };

  return post(cfg, {
    messaging_product: 'whatsapp',
    to: number,
    type: 'text',
    text: { preview_url: false, body },
  });
}

/** Meta's delivery states, mapped onto ours. */
export function mapDeliveryStatus(s: string): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | null {
  switch (s) {
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'read': return 'READ';
    case 'failed': return 'FAILED';
    default: return null;
  }
}
