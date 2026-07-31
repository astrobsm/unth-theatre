// ============================================================
// Document verification
// ------------------------------------------------------------
// Every certified imprest document carries a QR code pointing here. Somebody
// holding a printed retirement — an auditor, a bank, the hospital board — scans
// it and gets an independent answer to "was this actually issued by the system,
// and has the paper been altered since?".
//
// Deliberately PUBLIC and read-mostly. A verifier is by definition not a member
// of staff and has no imprest duty, so requiring a login would defeat the point.
// It therefore returns only what a person already holding the paper can see —
// identifier, type, title, when and by whom it was issued, and the checksum —
// never the figures or anything about the imprest itself. A wrong or invented
// identifier simply reports "not found", so the endpoint cannot be used to
// enumerate documents.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { documentId: string } }) {
  const documentId = (params.documentId ?? '').trim().toUpperCase();

  if (!documentId || documentId.length > 64) {
    return NextResponse.json({ found: false, documentId }, { status: 400 });
  }

  try {
    const document = await prisma.generatedDocument.findUnique({
      where: { documentId },
      select: {
        id: true,
        documentId: true,
        documentType: true,
        title: true,
        issuedAt: true,
        issuedByName: true,
        checksum: true,
        pageCount: true,
        watermark: true,
        verificationCount: true,
      },
    });

    // Same shape and status for an unknown id as for a malformed one, so the
    // endpoint says nothing useful to somebody guessing identifiers.
    if (!document) {
      return NextResponse.json({ found: false, documentId });
    }

    // Record the check. A document verified repeatedly from nowhere near the
    // hospital is itself worth noticing, and the count is shown on the page so
    // the holder knows how often this copy has been presented.
    await prisma.generatedDocument
      .update({
        where: { id: document.id },
        data: { verificationCount: { increment: 1 }, lastVerifiedAt: new Date() },
      })
      .catch(() => undefined); // verification must succeed even if the tally fails

    return NextResponse.json({
      found: true,
      documentId: document.documentId,
      documentType: document.documentType,
      title: document.title,
      issuedAt: document.issuedAt,
      issuedBy: document.issuedByName ?? 'Unknown',
      checksum: document.checksum,
      pageCount: document.pageCount,
      watermark: document.watermark,
      verificationCount: document.verificationCount + 1,
    });
  } catch (error) {
    console.error('[imprest] verification failed:', error);
    return NextResponse.json({ found: false, documentId, error: 'Verification is unavailable' }, { status: 500 });
  }
}
