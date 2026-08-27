'use client';

/**
 * Theatre music library — the screen administrators use to put music on.
 *
 * Before this, populating the library meant copying files onto the theatre
 * server over SSH, which in practice means it never gets populated: the person
 * who knows what the theatre should be listening to is not the person with a
 * shell on the server. This is the whole point of the screen.
 *
 * Restricted to ADMIN and SYSTEM_ADMINISTRATOR, matching the API. The gate here
 * is a courtesy so nobody is shown a screen that will refuse them; the gate
 * that counts is on the route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Music, Upload, Trash2, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { AUDIO_EXTENSIONS, MAX_FILE_BYTES } from '@/lib/musicLibraryPaths';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR'];

interface Track {
  id: string;
  title: string;
  artist: string | null;
  category: string;
  url: string;
  sizeBytes: number;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function MusicLibraryPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const allowed = Boolean(role && ADMIN_ROLES.includes(role));

  const [tracks, setTracks] = useState<Track[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [category, setCategory] = useState('Classical');
  const [queue, setQueue] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/music/library', { cache: 'no-store' });
      const d = await r.json();
      setTracks(Array.isArray(d.tracks) ? d.tracks : []);
      setCategories(Array.isArray(d.categories) ? d.categories : []);
    } catch {
      setError('Could not read the library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalBytes = useMemo(() => tracks.reduce((n, t) => n + (t.sizeBytes || 0), 0), [tracks]);

  const grouped = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const t of tracks) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tracks]);

  /**
   * Uploaded one at a time rather than in a single request. A theatre laptop on
   * hospital Wi-Fi drops connections; one failure out of twenty should cost that
   * one track, not the whole batch, and the person watching should be able to
   * see how far it has got.
   */
  const upload = async () => {
    if (!queue.length) return;
    setBusy(true); setError(null); setNotice(null);
    const failed: string[] = [];
    let added = 0;

    for (const file of queue) {
      const body = new FormData();
      body.append('file', file);
      body.append('category', category);
      try {
        const r = await fetch('/api/music/library/manage', { method: 'POST', body });
        if (r.ok) { added += 1; }
        else {
          const d = await r.json().catch(() => ({}));
          failed.push(`${file.name} — ${d.error ?? r.status}`);
        }
      } catch {
        failed.push(`${file.name} — the connection dropped`);
      }
    }

    setQueue([]);
    if (fileInput.current) fileInput.current.value = '';
    if (added) setNotice(`${added} track${added === 1 ? '' : 's'} added to ${category}.`);
    if (failed.length) setError(`Not added:\n${failed.join('\n')}`);
    setBusy(false);
    await load();
  };

  const remove = async (track: Track) => {
    if (!window.confirm(`Remove "${track.title}" from the theatre library?`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/music/library/manage?id=${encodeURIComponent(track.id)}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? 'The track could not be removed.');
      } else {
        setNotice(`Removed "${track.title}".`);
      }
    } catch {
      setError('The track could not be removed.');
    } finally {
      setBusy(false);
      await load();
    }
  };

  if (status === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Administrators only</p>
              <p className="mt-1">
                The theatre music library is managed by administrators. You can still play
                whatever is in it from the player in the corner of any page.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Music className="h-5 w-5" /> Theatre music library
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Music for the theatre between cases. It ducks automatically whenever the radio
          speaks — announcements, the send-for-patient call and every emergency alert — and
          only one window plays at a time.
        </p>
      </header>

      {/* Upload */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Add music</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">Category</span>
            <input
              list="orm-music-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Classical"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <datalist id="orm-music-categories">
              {categories.map((c) => <option key={c} value={c} />)}
              <option value="Classical" />
              <option value="Instrumental" />
            </datalist>
            <span className="mt-1 block text-[11px] text-gray-500">
              Pick an existing one or type a new name — it becomes a heading in the player.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">Audio files</span>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={AUDIO_EXTENSIONS.join(',')}
              onChange={(e) => setQueue(Array.from(e.target.files ?? []))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-xs"
            />
            <span className="mt-1 block text-[11px] text-gray-500">
              Name them <code>Artist - Title.mp3</code> and both show in the player.
              Up to {MAX_FILE_BYTES / 1024 / 1024} MB each.
            </span>
          </label>
        </div>

        {queue.length > 0 && (
          <ul className="mt-3 max-h-32 space-y-0.5 overflow-y-auto text-xs text-gray-600">
            {queue.map((f) => (
              <li key={f.name} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className={f.size > MAX_FILE_BYTES ? 'text-red-600' : 'text-gray-400'}>
                  {mb(f.size)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={upload}
            disabled={busy || queue.length === 0}
            className="inline-flex items-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            {busy ? 'Uploading…' : `Add ${queue.length || ''} track${queue.length === 1 ? '' : 's'}`.trim()}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
        {error && <pre className="mt-3 whitespace-pre-wrap text-sm text-red-600">{error}</pre>}
      </section>

      {/* Licensing — stated plainly, because the code cannot check it. */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Playing music in a theatre is public performance, not private listening, and a
          licence usually covers the <strong>recording</strong> rather than just the
          composition — so a modern recording of Bach may still be restricted. Public-domain
          and Creative Commons sources: Musopen, IMSLP, Free Music Archive, Incompetech.
          Nothing here is checked automatically; that judgement is the hospital&apos;s.
        </p>
      </div>

      {/* Library */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            In the library{tracks.length > 0 && ` — ${tracks.length} track${tracks.length === 1 ? '' : 's'}, ${mb(totalBytes)}`}
          </h2>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Reading the library…</p>
        ) : tracks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            <Music className="mx-auto mb-2 h-6 w-6 text-gray-300" />
            No music installed yet. The player falls back to its generated ambient
            soundscape until something is added here.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([cat, items]) => (
              <div key={cat} className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                  {cat} <span className="font-normal text-gray-400">· {items.length}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {items.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">{t.title}</p>
                        <p className="truncate text-xs text-gray-500">
                          {[t.artist, mb(t.sizeBytes)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {/* Listen before deciding it is the wrong track. */}
                      <audio controls preload="none" src={t.url} className="h-8 w-40 sm:w-56" />
                      <button
                        type="button"
                        onClick={() => remove(t)}
                        disabled={busy}
                        aria-label={`Remove ${t.title}`}
                        className="rounded border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
