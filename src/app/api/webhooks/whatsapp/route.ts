import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { mapDeliveryStatus } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * Meta's webhook for WhatsApp delivery receipts.
 *
 * GET  — the one-time verification handshake when the URL is registered.
 * POST — delivery status updates, and inbound replies.
 *
 * This endpoint is PUBLIC by necessity: Meta calls it, unauthenticated by any
 * ORM session. Its protection is the signature check below, not a login — so
 * that check is the security boundary and is treated as such.
 *
 * It can only ever run on the CLOUD. The theatre server has no public inbound
 * address, which is precisely why sending is cloud-only and delivery status
 * reaches the local node through the sync journal.
 */

/**
 * Verify Meta signed this body with the app secret.
 *
 * Timing-safe, and computed over the RAW body — re-serialising parsed JSON
 * produces different bytes and the signature would never match.
 */
function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  // Fail CLOSED. An unverified webhook can write delivery status for any
  // message, and "no secret configured" must never mean "accept anything".
  if (!secret || !header) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  // Meta calls this once when the URL is registered, echoing a challenge.
  const sp = req.nextUrl.searchParams;
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token');
  const challenge = sp.get('hub.challenge');

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'Webhook verification is not configured.' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    // Meta requires the bare challenge as plain text, not JSON.
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Verification failed.' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  // Read the raw body BEFORE parsing: the signature is over these exact bytes.
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    console.warn('[whatsapp webhook] rejected an unsigned or mis-signed request');
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: {
    entry?: { changes?: { value?: {
      statuses?: { id?: string; status?: string; timestamp?: string; errors?: { title?: string }[] }[];
      messages?: unknown[];
    } }[] }[];
  };
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const statuses = (payload.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .flatMap((c) => c.value?.statuses ?? []);

  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    const mapped = mapDeliveryStatus(s.status);
    if (!mapped) continue;

    try {
      const message = await prisma.communicationMessage.findFirst({
        where: { providerMessageId: s.id },
        select: { id: true, status: true },
      });
      if (!message) continue;   // not ours, or already pruned

      // Recorded as an event first, deduplicated on the provider's own id, so a
      // webhook Meta retries cannot be counted twice.
      await prisma.communicationEvent.upsert({
        where: {
          messageId_providerEventId: {
            messageId: message.id,
            providerEventId: `${s.id}:${s.status}`,
          },
        },
        create: {
          messageId: message.id,
          status: mapped as never,
          providerEventId: `${s.id}:${s.status}`,
          payload: s as never,
          occurredAt: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
        },
        update: {},
      });

      // Status only ever moves FORWARD. Meta does not guarantee ordering, and a
      // late-arriving "delivered" must not undo a "read" that already arrived.
      const rank: Record<string, number> = {
        QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4,
      };
      const isFailure = mapped === 'FAILED';
      const moves = isFailure || (rank[mapped] ?? 0) > (rank[message.status] ?? 0);

      if (moves) {
        await prisma.communicationMessage.update({
          where: { id: message.id },
          data: {
            status: mapped as never,
            ...(mapped === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
            ...(isFailure
              ? { failureReason: s.errors?.[0]?.title ?? 'Reported failed by WhatsApp' }
              : {}),
          },
        });
      }
    } catch (err) {
      // Logged, never rethrown. Meta retries a non-200 for hours, and one
      // unprocessable status must not cause a storm of redeliveries.
      console.error('[whatsapp webhook] could not record status', s.id, err);
    }
  }

  // Always 200 once the signature is valid. Anything else asks Meta to retry.
  return NextResponse.json({ received: statuses.length });
}
