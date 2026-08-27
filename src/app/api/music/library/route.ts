import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readdir, stat } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * The theatre's music library — a folder of files, not a database table.
 *
 * WHY NOT THE DATABASE
 *
 * Announcement audio lives in Postgres and works well, because an announcement
 * is a few seconds long. Music is not: a modest library of fifty pieces is a
 * few hundred megabytes, and `announcements` is a SYNCED table. Put music
 * beside it and every track replicates between the theatre server and the cloud
 * over a hospital link that has spent today dropping for hours at a stretch —
 * competing with the sync traffic that actually matters, which is patients.
 *
 * A folder costs nothing to run, needs no migration, survives the internet
 * being down, and is maintained by copying files into it. That is as cheap as
 * this gets.
 *
 * WHERE THE FILES GO
 *
 *   public/audio/library/<category>/<Artist> - <Title>.mp3
 *
 * The subfolder becomes the category ("Classical", "Instrumental", "Jazz"), so
 * organising the library is done in the file manager rather than in an admin
 * screen nobody has time to open. Files sitting loose in the root are filed
 * under "General".
 *
 * Next serves everything under public/ directly, so the audio itself never
 * passes through this route — only the list does.
 *
 * LICENSING IS THE HOSPITAL'S TO GET RIGHT. This reads whatever is in the
 * folder; it cannot tell a public-domain recording from a commercial one.
 * Public-domain and Creative Commons sources are named in the README beside
 * the folder.
 */

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.flac', '.aac', '.webm']);

/** Where the library lives. Overridable so a big library can sit on another disk. */
const LIBRARY_DIR = process.env.ORM_MUSIC_DIR
  || path.join(process.cwd(), 'public', 'audio', 'library');

/** Only meaningful when the files are under public/ and therefore URL-addressable. */
const PUBLIC_PREFIX = '/audio/library';

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string | null;
  category: string;
  url: string;
  sizeBytes: number;
}

/**
 * "Bach - Air on the G String.mp3" → artist and title.
 * A file with no " - " keeps its whole name as the title, rather than being
 * hidden because it was named unhelpfully.
 */
function parseName(fileName: string): { title: string; artist: string | null } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const split = base.split(/\s+-\s+/);
  if (split.length >= 2) {
    const artist = split.shift()!.trim();
    return { title: split.join(' - ').trim() || base, artist: artist || null };
  }
  return { title: base, artist: null };
}

async function collect(dir: string, category: string, out: LibraryTrack[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // No library folder yet. Not an error — it means nobody has added music.
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // One level of nesting is the category. Deeper nesting is flattened into
      // the same category rather than refused.
      await collect(full, category === 'General' ? entry.name : category, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;

    let sizeBytes = 0;
    try { sizeBytes = (await stat(full)).size; } catch { /* unreadable size is not fatal */ }

    const relative = path.relative(LIBRARY_DIR, full).split(path.sep).join('/');
    const { title, artist } = parseName(entry.name);
    out.push({
      id: relative,
      title,
      artist,
      category,
      // encodeURI, not encodeURIComponent: the separators must stay separators.
      url: `${PUBLIC_PREFIX}/${encodeURI(relative)}`,
      sizeBytes,
    });
  }
}

// GET /api/music/library — every playable file in the library folder.
export async function GET() {
  // Behind authentication like everything else. The theatre's music is not a
  // secret, but an open media endpoint on a hospital network is somebody
  // else's bandwidth bill.
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const tracks: LibraryTrack[] = [];
    await collect(LIBRARY_DIR, 'General', tracks);
    tracks.sort((a, b) =>
      a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

    const categories = Array.from(new Set(tracks.map((t) => t.category))).sort();
    return NextResponse.json({ tracks, categories, count: tracks.length });
  } catch (error) {
    console.error('[music/library] could not read the library folder:', error);
    // An empty list, not a 500: background music failing must never be able to
    // take a clinical page down with it.
    return NextResponse.json({ tracks: [], categories: [], count: 0 });
  }
}
