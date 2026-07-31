// ============================================================
// Certified imprest documents
// ------------------------------------------------------------
// This is what gives the QR verification endpoint something to verify.
//
// Issuing happens in TWO steps, and the order is forced by the problem itself:
//   1. POST allocates the identifier. The QR code printed on the page has to
//      contain it, so it must exist before the PDF is rendered.
//   2. PATCH records the checksum of the finished bytes — which can only be
//      computed after rendering.
//
// A document that never reaches step 2 is left without a checksum, and
// verification says so rather than pretending it is intact.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import prisma from '@/lib/prisma';
import { requireImprest } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { DocumentType } from '@/lib/imprest/enums';
import { serialize } from '@/lib/imprest/serialize';

export const dynamic = 'force-dynamic';

/** Public identifier: readable over the phone, and hard to guess. */
function allocateDocumentId(type: string): string {
  const prefix = type.split('_').map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const year = new Date().getFullYear();
  // 5 random bytes → 8 base32-ish chars. Sequential numbering alone would let
  // anyone holding one document guess the identifiers of every other.
  const token = randomBytes(5).toString('hex').toUpperCase();
  return `${prefix}-${year}-${token}`;
}

// ---------------------------------------------------------------------------
// GET — documents issued (for a retirement, or the latest overall)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const guard = await requireImprest(Permission.DOCUMENT_GENERATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const retirementId = request.nextUrl.searchParams.get('retirementId');

  try {
    const rows = await prisma.generatedDocument.findMany({
      where: retirementId ? { retirementId } : {},
      // Never list the bytes — a list of PDFs would be megabytes.
      select: {
        id: true, documentId: true, documentType: true, title: true,
        issuedAt: true, issuedByName: true, checksum: true, byteSize: true,
        pageCount: true, verificationCount: true, lastVerifiedAt: true,
      },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    return NextResponse.json(serialize({ documents: rows }));
  } catch (error) {
    console.error('[imprest] document list failed:', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — step 1: allocate an identifier to print on the page
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireImprest(Permission.DOCUMENT_GENERATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { documentType?: string; title?: string; retirementId?: string; entityId?: string; watermark?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const documentType = body.documentType as DocumentType | undefined;
  if (!documentType || !Object.values(DocumentType).includes(documentType)) {
    return NextResponse.json({ error: 'A valid document type is required' }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'A title is required' }, { status: 400 });
  }

  try {
    const documentId = allocateDocumentId(documentType);
    const created = await prisma.generatedDocument.create({
      data: {
        documentId,
        documentType,
        title: body.title.trim(),
        retirementId: body.retirementId ?? null,
        entityId: body.entityId ?? null,
        watermark: body.watermark ?? null,
        // Filled in by PATCH once the bytes exist. Until then the document is
        // issued but unverified, and the verify page reflects that.
        checksum: '',
        byteSize: 0,
        pageCount: 1,
        issuedById: actor.userId,
        issuedByName: `${actor.fullName} (${actor.designation})`,
      },
      select: { id: true, documentId: true, documentType: true, title: true, issuedAt: true },
    });

    await prisma.imprestAuditLog.create({
      data: {
        action: 'CREATE',
        entity: 'DOCUMENT',
        entityId: created.id,
        entityLabel: created.documentId,
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
      },
    });

    const origin = request.nextUrl.origin;
    return NextResponse.json(
      {
        document: serialize(created),
        // What the QR code should encode.
        verifyUrl: `${origin}/verify/imprest/${created.documentId}`,
        success: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[imprest] document allocate failed:', error);
    return NextResponse.json({ error: 'Failed to issue the document' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — step 2: record the finished bytes and their checksum
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requireImprest(Permission.DOCUMENT_GENERATE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { documentId?: string; checksum?: string; byteSize?: number; pageCount?: number; dataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { documentId, checksum } = body;
  if (!documentId || !checksum) {
    return NextResponse.json({ error: 'A document id and checksum are required' }, { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    return NextResponse.json({ error: 'The checksum is not a SHA-256 digest' }, { status: 400 });
  }

  try {
    const existing = await prisma.generatedDocument.findUnique({
      where: { documentId: documentId.trim().toUpperCase() },
      select: { id: true, checksum: true, documentId: true },
    });
    if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // A checksum is written once. Allowing it to change would let an altered
    // document be re-certified against its own new bytes, which is precisely
    // what verification exists to prevent.
    if (existing.checksum) {
      return NextResponse.json(
        { error: 'This document has already been certified and cannot be re-issued.' },
        { status: 409 }
      );
    }

    await prisma.generatedDocument.update({
      where: { id: existing.id },
      data: {
        checksum: checksum.toLowerCase(),
        byteSize: body.byteSize ?? 0,
        pageCount: body.pageCount ?? 1,
        dataUrl: body.dataUrl ?? null,
      },
    });

    await prisma.imprestAuditLog.create({
      data: {
        action: 'PRINT',
        entity: 'DOCUMENT',
        entityId: existing.id,
        entityLabel: existing.documentId,
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[imprest] document finalise failed:', error);
    return NextResponse.json({ error: 'Failed to record the document' }, { status: 500 });
  }
}
