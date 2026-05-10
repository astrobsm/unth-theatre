# Background music

Drop one or more audio files here (MP3 or OGG recommended). The
`BackgroundMusicPlayer` widget (bottom-left of every dashboard page)
will pick them up after the next deploy.

## Default file the player looks for first

```
public/audio/background/ambient.mp3
```

You can also use any of these names without changing code:

- `ambient.mp3`
- `lobby.mp3`
- `calm.mp3`

For any other filename, type the path into the player's "Track" input
(e.g. `/audio/background/jazz-loop.mp3`).

## How the priority queue works

The player implements a strict priority order — there is **never** any
overlapping audio:

1. **Emergency alerts** (highest, priority ≥ 90) — always win.
2. **Announcements / radio broadcasts** — duck the music.
3. **Background music** (lowest) — auto-pauses while either of the above
   is speaking, then resumes the moment the announcement ends or is
   acknowledged.

This is wired through two browser events dispatched by `RadioPlayer`:

- `window.dispatchEvent(new CustomEvent('radio:active'))` → music pauses.
- `window.dispatchEvent(new CustomEvent('radio:idle'))` → music resumes.

## Tips

- Keep files reasonably sized (≤ 5–10 MB) so they load quickly on
  first use.
- Looped ambient tracks (no abrupt endings) sound best because the
  player loops automatically.
- Each workstation remembers its own volume / track / on-off state in
  `localStorage`, so staff can configure per-room preferences.
- Browsers block autoplay until the user interacts with the page once;
  if music does not start automatically, click **Play** in the widget.
