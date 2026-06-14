import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ALLOWED = ['SURGEON', 'ADMIN', 'THEATRE_MANAGER'];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const notes = await prisma.auditLog.findMany({
      where: {
        tableName: 'surgeries',
        recordId: params.id,
        action: 'POST_OP_NOTE',
      },
      include: {
        user: {
          select: { id: true, fullName: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching post-op notes:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const note = String(body.note || '').trim();
    if (note.length < 5) {
      return NextResponse.json({ error: 'Post-operative note must be at least 5 characters' }, { status: 400 });
    }

    // Optional intra-operative drawings / photos (base64 data URLs).
    // Max 2 images, each <= 10 MB (≈ 13.7 MB base64-encoded).
    const MAX_IMAGES = 2;
    const MAX_BASE64_LEN = Math.ceil((10 * 1024 * 1024 * 4) / 3) + 1024;
    let images: string[] = Array.isArray(body.images)
      ? body.images.filter((s: any) => typeof s === 'string' && s.startsWith('data:image/'))
      : [];
    if (images.length > MAX_IMAGES) {
      return NextResponse.json({ error: `A maximum of ${MAX_IMAGES} images is allowed` }, { status: 400 });
    }
    for (const img of images) {
      if (img.length > MAX_BASE64_LEN) {
        return NextResponse.json({ error: 'Each image must not exceed 10 MB' }, { status: 400 });
      }
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, remarks: true },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    const stamp = new Date().toLocaleString('en-GB');
    const author = session.user.name || session.user.email || 'Surgeon';
    const nextRemarks = `${surgery.remarks || ''}\n\n[POST-OP NOTE ${stamp} - ${author}]\n${note}`.trim();

    await prisma.surgery.update({
      where: { id: params.id },
      data: { remarks: nextRemarks },
    });

    const audit = await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'POST_OP_NOTE',
        tableName: 'surgeries',
        recordId: params.id,
        changes: JSON.stringify({ note, images }),
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });

    return NextResponse.json(audit, { status: 201 });
  } catch (error) {
    console.error('Error saving post-op note:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}
