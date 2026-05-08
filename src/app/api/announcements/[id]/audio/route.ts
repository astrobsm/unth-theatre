import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/announcements/:id/audio
// Streams the stored base64 audio so the Theatre Radio (and any <audio>
// element) can play it via a normal URL.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ann = await prisma.announcement.findUnique({
    where: { id: params.id },
    select: { audioData: true, audioMimeType: true, audioFileName: true },
  });

  if (!ann || !ann.audioData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buf = Buffer.from(ann.audioData, 'base64');
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': ann.audioMimeType || 'audio/mpeg',
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename="${ann.audioFileName || 'announcement.mp3'}"`,
    },
  });
}
