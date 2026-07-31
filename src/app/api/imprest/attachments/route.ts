// ============================================================
// Imprest attachments — receipts and supporting evidence
// ------------------------------------------------------------
// A retirement is only as good as the receipts behind it, so this is the route
// that decides whether an expenditure can be certified at all.
//
// Evidence arrives as a base64 data URL inside JSON, matching how this app
// already handles consent scans and incident media. That choice is what makes a
// receipt photographed at a market stall with no signal survive: a data URL is
// JSON, so it queues and replays through the ordinary offline path. An
// object-store upload could not.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { AttachmentKind } from '@/lib/imprest/enums';
import { serialize } from '@/lib/imprest/serialize';
import { idempotencyKeyFrom, replayIfSeen, rememberResult } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

/** Anything larger is a photograph that should have been downscaled first. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

// ---------------------------------------------------------------------------
// GET — evidence for one expenditure / imprest / retirement
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.ATTACHMENT_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const sp = request.nextUrl.searchParams;
  const expenditureId = sp.get('expenditureId');
  const imprestId = sp.get('imprestId');
  const retirementId = sp.get('retirementId');

  if (!expenditureId && !imprestId && !retirementId) {
    return NextResponse.json(
      { error: 'Specify an expenditure, imprest or retirement.' },
      { status: 400 }
    );
  }

  try {
    const rows = await prisma.attachment.findMany({
      where: {
        deletedAt: null,
        ...(expenditureId ? { expenditureId } : {}),
        ...(imprestId ? { imprestId } : {}),
        ...(retirementId ? { retirementId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      // The bytes are only sent when a single item is asked for by id — a list
      // of full-size receipts would be megabytes for no reason.
      select: {
        id: true, kind: true, fileName: true, mimeType: true, byteSize: true,
        checksum: true, caption: true, capturedAt: true, createdAt: true,
        width: true, height: true,
        ...(sp.get('withData') === 'true' ? { dataUrl: true } : {}),
      },
    });
    return NextResponse.json(serialize({ attachments: rows }));
  } catch (error) {
    console.error('[imprest] attachment list failed:', error);
    return NextResponse.json({ error: 'Failed to load attachments' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — attach a receipt
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireImprest(Permission.ATTACHMENT_UPLOAD);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: {
    dataUrl?: string;
    fileName?: string;
    kind?: string;
    caption?: string;
    expenditureId?: string;
    imprestId?: string;
    retirementId?: string;
    width?: number;
    height?: number;
    capturedAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { dataUrl, fileName } = body;
  if (!dataUrl || !fileName) {
    return NextResponse.json({ error: 'A file and a file name are required' }, { status: 400 });
  }
  if (!body.expenditureId && !body.imprestId && !body.retirementId) {
    return NextResponse.json(
      { error: 'An attachment must belong to an expenditure, imprest or retirement.' },
      { status: 400 }
    );
  }

  // data:<mime>;base64,<payload>
  // [\s\S] rather than `.` with the `s` flag: this app's tsconfig sets no
  // explicit target, and the dotAll flag needs ES2018.
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) {
    return NextResponse.json({ error: 'The file could not be read.' }, { status: 400 });
  }
  const [, mimeType, base64] = match;

  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json(
      { error: `${mimeType} is not accepted. Attach a photo (JPEG, PNG, WebP, HEIC) or a PDF.` },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(bytes.byteLength / 1048576).toFixed(1)} MB. The limit is 8 MB — retake the photo at a lower resolution.` },
      { status: 413 }
    );
  }

  // Same key on every replay, so a queued receipt cannot be attached twice.
  const idemKey = idempotencyKeyFrom(request);
  const replayed = await replayIfSeen(idemKey);
  if (replayed) return replayed;

  // Content hash: proves the bytes have not been altered since capture, and
  // lets an identical re-upload be recognised rather than duplicated.
  const checksum = createHash('sha256').update(bytes).digest('hex');

  try {
    const existing = await prisma.attachment.findFirst({
      where: {
        checksum,
        deletedAt: null,
        ...(body.expenditureId ? { expenditureId: body.expenditureId } : {}),
        ...(body.imprestId ? { imprestId: body.imprestId } : {}),
        ...(body.retirementId ? { retirementId: body.retirementId } : {}),
      },
      select: { id: true, fileName: true },
    });
    if (existing) {
      return NextResponse.json(
        { attachment: existing, success: true, duplicate: true, message: 'That file is already attached.' },
        { status: 200 }
      );
    }

    const created = await prisma.attachment.create({
      data: {
        kind: (body.kind as AttachmentKind) ?? AttachmentKind.RECEIPT,
        fileName,
        mimeType,
        byteSize: bytes.byteLength,
        checksum,
        dataUrl,
        caption: body.caption,
        width: body.width,
        height: body.height,
        capturedAt: body.capturedAt ? new Date(body.capturedAt) : new Date(),
        expenditureId: body.expenditureId ?? null,
        imprestId: body.imprestId ?? null,
        retirementId: body.retirementId ?? null,
        userId: actor.userId,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      select: { id: true, kind: true, fileName: true, mimeType: true, byteSize: true, checksum: true, createdAt: true },
    });

    await prisma.imprestAuditLog.create({
      data: {
        action: 'UPLOAD',
        entity: 'ATTACHMENT',
        entityId: created.id,
        entityLabel: created.fileName,
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
      },
    });

    const payload = { attachment: serialize(created), success: true };
    await rememberResult(idemKey, 201, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error('[imprest] attachment upload failed:', error);
    return NextResponse.json({ error: 'Failed to attach the file' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — detach (soft, never destroyed)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const guard = await requireImprest(Permission.ATTACHMENT_DELETE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  const id = request.nextUrl.searchParams.get('id');
  const reason = request.nextUrl.searchParams.get('reason');
  if (!id) return NextResponse.json({ error: 'Which attachment?' }, { status: 400 });

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      select: { id: true, fileName: true, deletedAt: true },
    });
    if (!attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    if (attachment.deletedAt) return NextResponse.json({ success: true });

    // Evidence is never destroyed — the tombstone stays, so a retirement that
    // once cited this receipt can still account for it.
    await prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.userId, deletionReason: reason ?? null },
    });

    await prisma.imprestAuditLog.create({
      data: {
        action: 'SOFT_DELETE',
        entity: 'ATTACHMENT',
        entityId: id,
        entityLabel: attachment.fileName,
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        notes: reason ?? undefined,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[imprest] attachment delete failed:', error);
    return NextResponse.json({ error: 'Failed to remove the attachment' }, { status: 500 });
  }
}
