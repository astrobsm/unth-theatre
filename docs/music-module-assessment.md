# Theatre music library — Phase 1 architecture assessment

Written before any code, as §2 and §33 require. Four findings change the shape of
the work; the rest is confirmation of what can be reused.

---

## A. Where the spec's assumptions differ from this codebase

| Spec assumes | ORM actually is |
|---|---|
| Node.js / **Express** backend | **Next.js 14 App Router**. No Express. Handlers are `src/app/api/**/route.ts` |
| Dexie.js | Service Worker + raw **IndexedDB** |
| An existing file-storage mechanism to reuse | **None on disk — see B** |

Same three corrections as the Conflict Resolver assessment. Worth stating once
more because §22 and §33 both assume Express routing.

---

## B. The finding that matters most: there is no filesystem storage

Every upload in ORM today is stored as a **base64 data URL in a Postgres text
column**:

- `consentFileData String? @db.Text // base64-encoded file contents`
- `anaesthesiaConsentSignature String? @db.Text`
- `mediaUrl String? @db.Text // base64 data URL of uploaded image/video`

So §5's "use the existing ORM storage convention if one already exists" has no
good answer: the existing convention is exactly what §34 forbids for audio, and
rightly — a 6 MB track becomes roughly 8 MB of base64, inside a row, inside every
backup, inside the sync journal.

**This module therefore introduces the first real filesystem storage in ORM.**
That is a genuine architectural addition, not a reuse, and it brings obligations
the existing base64 approach never had:

- files live outside the database, so **database backups no longer contain them**
  (§20 is not optional here — it is a new failure mode)
- the **sync layer must ignore** the music tables, or the local server and cloud
  will try to reconcile rows pointing at paths that exist on only one of them
- file permissions, path-traversal defence and safe filenames become real
  concerns rather than theoretical ones

Proposed: `ORM_MEDIA_ROOT` (env, defaulting to `/var/lib/orm/media`) with
`music/tracks/`, `music/covers/`. Outside the repo and outside `.next`, so a
rebuild or a `git clean` cannot delete the hospital's music.

---

## C. What already exists and should be reused

**The radio already has a MUSIC category, and emergency override already works.**
`src/app/api/radio/announce/route.ts` cancels pending and playing announcements
in `['MUSIC', 'WELCOME', 'RULES']` when an emergency is raised. So §18's "music
must never interfere with emergency alerts" is partly built — the queue model
already treats music as the lowest priority. The music player should join that
queue rather than run beside it, or the two audio sources will talk over each
other and the emergency loses.

- **Player and TTS:** `src/components/RadioPlayer.tsx` — audio element, speech
  synthesis fallback, queue polling. The mini-player (§8) belongs here, not in a
  new component.
- **Real-time (§11):** SSE already exists — `/api/radio/events`,
  `/api/notifications/stream`, `/api/emergency-display/stream`. **No WebSockets
  needed**, which §11 explicitly asks us to avoid introducing.
- **Auth and RBAC:** NextAuth, role checks inside each handler.
- **Audit:** `AuditLog`, written in the same transaction as the change.
- **Sidebar:** hardcoded in `src/app/dashboard/layout.tsx`; `lib/modules.ts`
  governs access only. A new module needs an entry in both.

---

## D. Two blockers to clear first

### D1. Audio does not currently play at all — fix before building on it
`src/components/RadioPlayer.tsx:382`

```ts
a.play().catch(() => { emitRadioIdle(); onDone?.(); });
```

Browsers reject `play()` until the page has had a user gesture, and this discards
the rejection and marks the item done. Music will fail in exactly the same way,
on exactly the same line. **Building a music player on top of this would produce
a silent music player.** Item 1.1 in `docs/BACKLOG.md` must land first.

### D2. nginx caps uploads at 25 MB
`scripts/local-server/setup-tls.sh` writes `client_max_body_size 25m` — chosen for
phone photographs of consent forms. A WAV album exceeds it immediately, and the
failure surfaces as a generic nginx error rather than anything the admin page can
explain. Needs raising for the upload route specifically, not globally.

---

## E. Proposed models — 5, not the spec's 11

```
MusicTrack      title, artist, album, genre, year, durationSec, filePath,
                fileSize, mimeType, sha256, coverPath, isActive, isExplicit,
                uploadedById, timestamps
MusicPlaylist   name, description, isDefault, zone?, createdById, timestamps
MusicPlaylistTrack  playlistId, trackId, position   (@@unique([playlistId, trackId]))
MusicFavourite  userId, trackId                      (@@unique([userId, trackId]))
MusicPlayback   trackId, userId, playedAt, deviceLabel, zone?
```

Artist, album and genre stay as indexed strings on the track rather than becoming
three tables and three joins. §4 says not to create every model blindly, and a
normalised artist table earns its place when artists are edited centrally — which
nobody will do for theatre background music.

`MusicDevice` and `MusicZone` are deferred, with `zone` present as a nullable
string from the start so §10's zoned playback needs no migration later.

`sha256` is the duplicate check (§24) — filename and metadata both lie, a hash
does not.

**Sync classification:** all five tables must be **excluded** from
`syncPolicy.ts`. They reference local file paths; replicating the rows without the
files would give the cloud a library of dead links.

---

## F. Streaming (§6)

`GET /api/music/tracks/[id]/stream` with `Range` support, using a Node read stream
over a byte range — never `readFile`. In App Router that means returning a
`ReadableStream` with `206 Partial Content`, `Content-Range`, `Accept-Ranges` and
a long `Cache-Control` keyed on the track id, since a track's bytes never change.

The path comes from the database and is resolved against `ORM_MEDIA_ROOT` with a
containment check after resolution — the only reliable defence against traversal,
since a filename can smuggle `..` through any amount of string filtering.

---

## G. Honest scope note

This is a 35-section specification: library, streaming, player, mini-player,
playlists, zones, central control, offline caching, storage dashboard, backup,
audit, RBAC and a seven-phase test plan. It is a fortnight of careful work, not an
afternoon, and it sits behind five other requests already queued in
`docs/BACKLOG.md` — three of which are marked patient-safety.

My recommendation on sequencing, which is a recommendation and not a decision:

1. **Fix the audio bug (backlog 1.1).** It is a prerequisite for this module and
   currently means emergency announcements play silently.
2. **Then the queued clinical items** — consent and labs, emergency team
   assignment, procedure packs.
3. **Then this module**, starting with storage, upload and streaming, which are
   the parts that must be right; the player UI is comparatively forgiving.

Music in a theatre is a real quality-of-work improvement for staff who spend ten
hours a day in that room, and I am not dismissing it. But it should not overtake a
silent emergency alert.
