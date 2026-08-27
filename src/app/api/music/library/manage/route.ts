import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { roleAllowed } from '@/lib/roleGroups';
import { mkdir, writeFile, unlink, stat } from 'fs/promises';
import path from 'path';
import {
  sanitiseCategory,
  sanitiseFileName,
  isInside,
  MAX_FILE_BYTES,
  AUDIO_EXTENSIONS,
} from '@/lib/musicLibraryPaths';

export const dynamic = 'force-dynamic';

/**
 * Adding and removing theatre music. Administrators only.
 *
 * The listing route beside this one is open to any signed-in user, because
 * everyone in the theatre uses the player. This one WRITES FILES TO DISK from
 * a browser upload, which is a different kind of thing entirely, so it is
 * restricted to ADMIN and SYSTEM_ADMINISTRATOR.
 *
 * Every name that reaches the filesystem goes through lib/musicLibraryPaths
 * first — an allowlist, not a blocklist — and then the resolved path is checked
 * against the library root a second time. If the sanitiser and the resolver
 * ever disagree, the sanitiser has a bug and nothing is written.
 *
 * WHERE THIS WORKS. On the theatre server, which has a real writable disk. A
 * cloud deployment on Vercel has a read-only filesystem and a request body
 * limit well below one track, so uploads there fail by design rather than by
 * accident — the route says so plainly instead of returning a confusing error.
 */

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR'] as const;

const LIBRARY_DIR = path.join(process.cwd(), 'public', 'audio', 'library');

/** Vercel and other serverless hosts give you a read-only filesystem. */
const READ_ONLY_HOST = Boolean(process.env.VERCEL);

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!roleAllowed((session.user as any).role, ADMIN_ROLES)) {
    return {
      error: NextResponse.json(
        { error: 'Only administrators can change the theatre music library.' },
        { status: 403 }
      ),
    };
  }
  return { session };
}

// POST /api/music/library/manage — add one track.
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  if (READ_ONLY_HOST) {
    return NextResponse.json(
      {
        error:
          'This site runs on a read-only filesystem, so music cannot be uploaded here. ' +
          'Add tracks on the theatre server, where the library lives.',
      },
      { status: 501 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'That upload could not be read.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }

  // Size is checked BEFORE the bytes are buffered into memory, so an oversized
  // upload cannot cost more than the header that announced it.
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB per track.`,
      },
      { status: 413 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }

  // A track may be renamed on the way in — "Bach - Air on the G String" reads
  // better on the player than "track03_final_v2".
  const requestedName = (form.get('fileName') as string | null)?.trim() || file.name;
  const named = sanitiseFileName(requestedName);
  if (!named.ok) {
    return NextResponse.json({ error: named.message }, { status: 400 });
  }

  const category = sanitiseCategory(form.get('category') as string | null);

  const targetDir = path.resolve(LIBRARY_DIR, category);
  const targetPath = path.resolve(targetDir, named.fileName);

  // The second check. The sanitiser above should make this impossible; if it
  // ever fires, that is a bug in the sanitiser and the write must not happen.
  if (!isInside(LIBRARY_DIR, targetPath, path.sep)) {
    console.error('[music/manage] rejected a path outside the library:', targetPath);
    return NextResponse.json({ error: 'That name is not usable.' }, { status: 400 });
  }

  // Never silently replace a track somebody else added.
  try {
    await stat(targetPath);
    return NextResponse.json(
      { error: `"${named.fileName}" is already in ${category}. Rename it or delete the existing one first.` },
      { status: 409 }
    );
  } catch {
    /* not there, which is what we want */
  }

  try {
    await mkdir(targetDir, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(targetPath, bytes);
    console.log(`[music/manage] added "${named.fileName}" to ${category}`);
    return NextResponse.json({
      ok: true,
      track: { fileName: named.fileName, category, sizeBytes: bytes.length },
    });
  } catch (error) {
    console.error('[music/manage] could not write the track:', error);
    return NextResponse.json(
      { error: 'The file could not be saved on the server.' },
      { status: 500 }
    );
  }
}

// DELETE /api/music/library/manage?id=<relative path from the listing>
export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  if (READ_ONLY_HOST) {
    return NextResponse.json(
      { error: 'This site runs on a read-only filesystem. Remove the track on the theatre server.' },
      { status: 501 }
    );
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which track?' }, { status: 400 });

  // The id is the listing's relative path, "Classical/Bach - Air.mp3". It is
  // rebuilt from its sanitised parts rather than trusted: a caller can send
  // anything, and this deletes files.
  const segments = id.split('/').filter(Boolean);
  const fileNameRaw = segments.pop();
  const named = sanitiseFileName(fileNameRaw);
  if (!named.ok) return NextResponse.json({ error: named.message }, { status: 400 });

  const category = segments.length ? sanitiseCategory(segments.join(' ')) : null;
  const targetPath = category
    ? path.resolve(LIBRARY_DIR, category, named.fileName)
    : path.resolve(LIBRARY_DIR, named.fileName);

  if (!isInside(LIBRARY_DIR, targetPath, path.sep)) {
    console.error('[music/manage] rejected a delete outside the library:', targetPath);
    return NextResponse.json({ error: 'That track is not in the library.' }, { status: 400 });
  }

  // Extension allowlist applies to deletion too. Even with the path check
  // above, this route must never be able to remove a non-audio file.
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(path.extname(targetPath).toLowerCase())) {
    return NextResponse.json({ error: 'That is not an audio file.' }, { status: 400 });
  }

  try {
    await unlink(targetPath);
    console.log(`[music/manage] removed "${named.fileName}"`);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      // Already gone. The caller wanted it absent, and it is.
      return NextResponse.json({ ok: true, alreadyGone: true });
    }
    console.error('[music/manage] could not remove the track:', error);
    return NextResponse.json({ error: 'The track could not be removed.' }, { status: 500 });
  }
}
