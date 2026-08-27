// ============================================================
// Turning a name somebody typed into a path on disk
// ------------------------------------------------------------
// This is the security boundary of the music library. Everything else in the
// feature READS a folder; the upload screen is the one thing that WRITES to it,
// using two strings that arrived from a browser — a category and a filename.
//
// The obvious attack is "../../.env". The less obvious ones are a leading slash
// making the path absolute, a NUL byte truncating it inside the C library
// beneath Node, a Windows separator the Linux server would not treat as a
// separator at all, and a name that is entirely punctuation and sanitises down
// to nothing — which would write to the library root.
//
// So this is an ALLOWLIST, not a blocklist: build a new name out of characters
// known to be safe rather than trying to strip the dangerous ones. A blocklist
// is a list of the attacks somebody happened to think of.
//
// Then, belt and braces, the caller re-resolves the finished path and checks it
// still sits inside the library root. If those two ever disagree, this file has
// a bug and the write must not happen.
// ============================================================

/** What the player can actually decode. Everything else is refused. */
export const AUDIO_EXTENSIONS = [
  '.mp3', '.m4a', '.ogg', '.oga', '.wav', '.flac', '.aac', '.webm',
] as const;

/**
 * One file. A FLAC of a long movement is genuinely large; a whole album in a
 * single file is somebody misusing the feature, and the theatre server's disk
 * is shared with the clinical database.
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const MAX_CATEGORY_CHARS = 40;
const MAX_STEM_CHARS = 120;

export const DEFAULT_CATEGORY = 'General';

/**
 * A folder name safe to create inside the library.
 *
 * Letters, digits, space and the few punctuation marks that appear in real
 * category names — "R&B", "Igbo Highlife", "Piano (solo)". Anything else is
 * dropped rather than escaped: this names a folder, and a folder does not need
 * to be expressive.
 */
export function sanitiseCategory(input: string | null | undefined): string {
  if (!input) return DEFAULT_CATEGORY;
  const cleaned = input
    .replace(/\0/g, '')
    .replace(/[^A-Za-z0-9 &'()_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CATEGORY_CHARS)
    .trim();
  // "..", "." and "" all sanitise to something unusable. Fall back rather than
  // write to the library root by accident.
  if (!cleaned || /^\.+$/.test(cleaned)) return DEFAULT_CATEGORY;
  return cleaned;
}

export type FileNameResult =
  | { ok: true; fileName: string; extension: string }
  | { ok: false; reason: 'NO_EXTENSION' | 'UNSUPPORTED_TYPE' | 'EMPTY_NAME'; message: string };

/**
 * A file name safe to write.
 *
 * Only the basename survives: everything up to the last slash or backslash is
 * discarded, so "../../etc/passwd.mp3" becomes "passwd.mp3" — a file inside the
 * library that simply will not play.
 */
export function sanitiseFileName(input: string | null | undefined): FileNameResult {
  const raw = (input ?? '').replace(/\0/g, '').trim();
  // Basename only, splitting on BOTH separators: a Windows browser sends
  // backslashes, and a Linux server would not treat those as separators.
  const base = raw.split(/[/\\]/).pop() ?? '';

  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return { ok: false, reason: 'NO_EXTENSION', message: 'The file needs an extension, for example .mp3' };
  }

  const extension = base.slice(dot).toLowerCase();
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
      message: `${extension} is not an audio type the player can read. Use one of: ${AUDIO_EXTENSIONS.join(' ')}`,
    };
  }

  const stem = base
    .slice(0, dot)
    // The hyphen and the spaces round it are kept deliberately: " - " is what
    // separates artist from title when the listing is built.
    .replace(/[^A-Za-z0-9 &'()._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STEM_CHARS)
    .trim()
    // A leading dot would make it hidden, and the listing skips hidden files.
    // A trailing dot would produce "name..mp3".
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  if (!stem) {
    return { ok: false, reason: 'EMPTY_NAME', message: 'That file name has no usable characters in it.' };
  }

  return { ok: true, fileName: `${stem}${extension}`, extension };
}

/**
 * Is `candidate` genuinely inside `root`?
 *
 * The last line of defence, run on the RESOLVED path after joining. Compared
 * with a trailing separator so that "/library-old" cannot pass as being inside
 * "/library".
 */
export function isInside(root: string, candidate: string, sep = '/'): boolean {
  const normalisedRoot = root.endsWith(sep) ? root : root + sep;
  return candidate.startsWith(normalisedRoot) && candidate.length > normalisedRoot.length;
}
