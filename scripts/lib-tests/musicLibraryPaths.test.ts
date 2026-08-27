import { describe, it, expect } from 'vitest';
import {
  sanitiseCategory,
  sanitiseFileName,
  isInside,
  DEFAULT_CATEGORY,
} from '../../src/lib/musicLibraryPaths';

// This is the only part of the music feature that writes to disk using strings
// that came from a browser. These tests are the reason it is allowed to.

describe('sanitiseCategory', () => {
  it('keeps ordinary category names intact', () => {
    expect(sanitiseCategory('Classical')).toBe('Classical');
    expect(sanitiseCategory('Igbo Highlife')).toBe('Igbo Highlife');
    expect(sanitiseCategory("R&B")).toBe('R&B');
    expect(sanitiseCategory('Piano (solo)')).toBe('Piano (solo)');
  });

  it('refuses to climb out of the library', () => {
    expect(sanitiseCategory('../../etc')).toBe('etc');
    expect(sanitiseCategory('..')).toBe(DEFAULT_CATEGORY);
    expect(sanitiseCategory('.')).toBe(DEFAULT_CATEGORY);
    expect(sanitiseCategory('../..')).toBe(DEFAULT_CATEGORY);
  });

  it('strips separators rather than escaping them', () => {
    expect(sanitiseCategory('a/b')).toBe('a b');
    expect(sanitiseCategory('a\\b')).toBe('a b');
    expect(sanitiseCategory('/absolute')).toBe('absolute');
    expect(sanitiseCategory('C:\\Windows')).toBe('C Windows');
  });

  it('drops NUL bytes, which truncate paths beneath Node', () => {
    // A dot is not in the category allowlist either, so it becomes a space —
    // stricter than the filename rule, and a folder never needs one.
    expect(sanitiseCategory('Classical\0.mp3')).toBe('Classical mp3');
    expect(sanitiseCategory('Classical\0')).toBe('Classical');
  });

  it('falls back rather than writing to the library root', () => {
    expect(sanitiseCategory('')).toBe(DEFAULT_CATEGORY);
    expect(sanitiseCategory('   ')).toBe(DEFAULT_CATEGORY);
    expect(sanitiseCategory('!!!')).toBe(DEFAULT_CATEGORY);
    expect(sanitiseCategory(null)).toBe(DEFAULT_CATEGORY);
    expect(sanitiseCategory(undefined)).toBe(DEFAULT_CATEGORY);
  });

  it('caps the length', () => {
    expect(sanitiseCategory('A'.repeat(200)).length).toBeLessThanOrEqual(40);
  });
});

describe('sanitiseFileName', () => {
  it('keeps a well-formed track name, including the artist separator', () => {
    const r = sanitiseFileName('Bach - Air on the G String.mp3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileName).toBe('Bach - Air on the G String.mp3');
  });

  it('reduces a traversal attempt to a harmless basename', () => {
    const r = sanitiseFileName('../../../etc/passwd.mp3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileName).toBe('passwd.mp3');
  });

  it('treats a backslash as a separator too, because the client may be Windows', () => {
    const r = sanitiseFileName('..\\..\\secret.mp3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileName).toBe('secret.mp3');
  });

  it('refuses anything the player cannot decode', () => {
    for (const bad of ['payload.php', 'run.sh', 'notes.txt', 'app.js', 'x.mp3.exe']) {
      const r = sanitiseFileName(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('UNSUPPORTED_TYPE');
    }
  });

  it('accepts every extension the reader lists', () => {
    for (const ext of ['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.flac', '.aac', '.webm']) {
      expect(sanitiseFileName(`Track${ext}`).ok).toBe(true);
    }
  });

  it('matches the extension case-insensitively', () => {
    const r = sanitiseFileName('Track.MP3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.extension).toBe('.mp3');
  });

  it('rejects a name with no extension', () => {
    const r = sanitiseFileName('justaname');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_EXTENSION');
  });

  it('rejects a dotfile, which the listing would skip anyway', () => {
    const r = sanitiseFileName('.mp3');
    expect(r.ok).toBe(false);
  });

  it('will not produce a hidden file from a leading dot', () => {
    const r = sanitiseFileName('...quiet.mp3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileName.startsWith('.')).toBe(false);
  });

  it('rejects a name that sanitises down to nothing', () => {
    const r = sanitiseFileName('***.mp3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EMPTY_NAME');
  });

  it('drops NUL bytes', () => {
    const r = sanitiseFileName('Track\0.mp3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileName.includes('\0')).toBe(false);
  });

  it('caps the length', () => {
    const r = sanitiseFileName('A'.repeat(400) + '.mp3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fileName.length).toBeLessThanOrEqual(125);
  });
});

describe('isInside', () => {
  it('accepts a real child', () => {
    expect(isInside('/srv/library', '/srv/library/Classical/a.mp3')).toBe(true);
  });

  it('rejects the root itself — there is no file to write there', () => {
    expect(isInside('/srv/library', '/srv/library')).toBe(false);
    expect(isInside('/srv/library', '/srv/library/')).toBe(false);
  });

  it('rejects a sibling whose name merely starts the same', () => {
    expect(isInside('/srv/library', '/srv/library-old/a.mp3')).toBe(false);
    expect(isInside('/srv/library', '/srv/librarysecrets')).toBe(false);
  });

  it('rejects an escape', () => {
    expect(isInside('/srv/library', '/etc/passwd')).toBe(false);
    expect(isInside('/srv/library', '/srv/other/a.mp3')).toBe(false);
  });

  it('works with a root that already ends in a separator', () => {
    expect(isInside('/srv/library/', '/srv/library/a.mp3')).toBe(true);
  });
});
