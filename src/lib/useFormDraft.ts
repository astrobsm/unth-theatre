'use client';

/**
 * Keep what somebody has typed, when the form goes away underneath them.
 *
 * WHAT ACTUALLY LOSES THE DATA
 *
 * Switching tab does not, by itself, clear React state. What clears it is the
 * browser DISCARDING the page — and on the handsets this hospital runs on, that
 * happens constantly. A nurse answers a call, opens WhatsApp to check a folder
 * number, comes back ten minutes later, and Android has reclaimed the tab. The
 * form remounts empty. From where she is standing the app threw her work away,
 * and she is right.
 *
 * So the draft has to live outside the page. localStorage survives the tab
 * being evicted, the browser being closed, and the phone running out of memory.
 *
 * WHY A HOOK RATHER THAN A FOURTH COPY
 *
 * Patient registration, the pre-anaesthetic review and theatre reception each
 * grew their own version of this, and they do not agree: different key shapes,
 * different save points, and two of them will hand a draft to whoever opens the
 * page next. This is that pattern with the two faults fixed.
 *
 * SHARED HANDSETS. Ten staff share eight devices here — measured, not assumed:
 * one MAC authenticated as two different nurses five hours apart. A draft is
 * therefore stamped with the user who wrote it and is NEVER restored to anybody
 * else. Somebody else's half-finished assessment appearing under your name is
 * not a convenience.
 *
 * AGE. A draft is offered back for a few hours, not indefinitely. Yesterday's
 * half-typed case is not something to resume by accident on a ward round.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Long enough to cover a theatre list and a lunch break; short enough that
 *  yesterday's work never resurfaces on a shared handset. */
const DEFAULT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** How long to wait after the last keystroke before writing. */
const WRITE_DEBOUNCE_MS = 400;

interface StoredDraft<T> {
  /** Who typed it. A draft is never handed to a different account. */
  userId: string | null;
  savedAt: string;
  value: T;
}

export interface UseFormDraftOptions<T> {
  /**
   * Stable identifier for this form, e.g. 'emergencyBooking'. Versioned into
   * the storage key, so changing the shape of `value` cannot restore a draft
   * the page no longer understands — bump `version` when the shape changes.
   */
  key: string;
  version?: number;
  /** The signed-in user. A draft is only ever restored to the same account. */
  userId: string | null | undefined;
  /** The live form state to keep. */
  value: T;
  /** Called once on mount when a usable draft is found. */
  onRestore: (value: T) => void;
  /**
   * False while the page is still loading its own data. Nothing is written
   * until this is true, so an empty initial render cannot overwrite a good
   * draft before it has been read back.
   */
  ready?: boolean;
  /**
   * Should this value be kept at all? Defaults to "something has been typed".
   * Stops a pristine form being saved and then offered back as if it were work.
   */
  isDirty?: (value: T) => boolean;
  maxAgeMs?: number;
}

/**
 * May this stored draft be handed back to the person now looking at the form?
 *
 * Pure, exported and tested separately: these are the two rules that decide
 * whether somebody sees their own work or somebody else's, and they are worth
 * proving rather than reading.
 */
export function isRestorable(
  draft: { userId: string | null; savedAt: string } | null | undefined,
  opts: { userId: string | null; now?: number; maxAgeMs?: number },
): 'restore' | 'wrong-user' | 'too-old' | 'none' {
  if (!draft) return 'none';
  // A different account on the same handset. Ten staff share eight devices
  // here; a draft is one person's work and is never offered to another.
  if ((draft.userId ?? null) !== (opts.userId ?? null)) return 'wrong-user';
  const age = (opts.now ?? Date.now()) - new Date(draft.savedAt).getTime();
  if (!Number.isFinite(age) || age > (opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return 'too-old';
  return 'restore';
}

const hasContent = (v: unknown): boolean => {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (Array.isArray(v)) return v.some(hasContent);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(hasContent);
  return false;
};

export function useFormDraft<T>({
  key,
  version = 1,
  userId,
  value,
  onRestore,
  ready = true,
  isDirty = hasContent,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: UseFormDraftOptions<T>) {
  const storageKey = `orm.draft.${key}.v${version}`;
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  // Read back exactly once. Without this the restore would fight every render.
  const hasRestored = useRef(false);
  // onRestore is nearly always an inline arrow; holding it in a ref keeps it
  // out of the effect's dependencies so a re-render cannot re-restore.
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // ── Restore ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasRestored.current || !ready) return;
    hasRestored.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as StoredDraft<T>;

      const verdict = isRestorable(draft, { userId: userId ?? null, maxAgeMs });
      // Not this person's work — left in place rather than deleted, since the
      // owner may return to the same handset and should still find it.
      if (verdict === 'wrong-user' || verdict === 'none') return;
      if (verdict === 'too-old') {
        window.localStorage.removeItem(storageKey);
        return;
      }

      onRestoreRef.current(draft.value);
      setSavedAt(draft.savedAt);
      setRestoredAt(draft.savedAt);
    } catch {
      // Malformed or unreadable: drop it rather than crash the form it was
      // meant to protect.
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey, userId, ready, maxAgeMs]);

  // ── Save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !hasRestored.current) return;
    if (!isDirty(value)) return;

    const timer = setTimeout(() => {
      try {
        const stamp = new Date().toISOString();
        const draft: StoredDraft<T> = { userId: userId ?? null, savedAt: stamp, value };
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
        setSavedAt(stamp);
      } catch {
        // Private mode, or the quota is full. The form keeps working; it simply
        // will not survive the tab being discarded, which is what it did before.
      }
    }, WRITE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, storageKey, userId, ready, isDirty]);

  /**
   * Throw the draft away. Call on successful submit — a draft that outlives the
   * thing it was drafting is how a form re-opens holding a case already booked.
   */
  const clear = useCallback(() => {
    try { window.localStorage.removeItem(storageKey); } catch { /* nothing to clear */ }
    setSavedAt(null);
    setRestoredAt(null);
  }, [storageKey]);

  return {
    /** When the draft was last written, for a "Saved 09:12" line. */
    savedAt,
    /** Set when work was actually recovered, for "Restored what you had typed". */
    restoredAt,
    clear,
  };
}
