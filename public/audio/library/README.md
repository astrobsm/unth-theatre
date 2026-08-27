# Theatre music library

Drop audio files in here and they appear in the ORM music player. Nothing else
to configure, no database entry, no restart.

## How to add music

    public/audio/library/<Category>/<Artist> - <Title>.mp3

    public/audio/library/Classical/Bach - Air on the G String.mp3
    public/audio/library/Instrumental/Satie - Gymnopedie No 1.mp3

* The **folder name becomes the category** shown in the player's dropdown.
  Create whatever categories suit the theatre — Classical, Instrumental, Jazz,
  Worship, Highlife.
* The **filename becomes the track name**. `Artist - Title` is split on the
  first " - ". A file without one keeps its whole name as the title, so a badly
  named file still plays rather than disappearing.
* Accepted: `.mp3 .m4a .ogg .oga .wav .flac .aac .webm`
* Files loose in this folder (not in a subfolder) are filed under **General**.

## Why files and not the database

Announcement audio is stored in Postgres, and that works because an
announcement is a few seconds long. Music is not. Fifty pieces is a few hundred
megabytes, and the announcements table SYNCS between the theatre server and the
cloud — music stored the same way would replicate over the hospital link,
competing with the sync traffic that actually matters, which is patients.

A folder costs nothing to run, needs no migration, and keeps working when the
internet is down.

## Where to get music you are allowed to play

Public performance in a hospital is not private listening. Use public-domain or
openly-licensed recordings — the licence covers the RECORDING, not just the
composition, so a modern recording of Bach may still be restricted.

| Source | What it offers | Licence |
| --- | --- | --- |
| **Musopen** — musopen.org | Classical recordings and sheet music | Public domain / CC |
| **IMSLP** — imslp.org | Large classical archive | Varies — check each item |
| **Free Music Archive** — freemusicarchive.org | Broad, curated | CC, per track |
| **Incompetech** (Kevin MacLeod) | Instrumental, calm pieces | CC-BY (credit required) |
| **Chosic**, **Pixabay Music** | Royalty-free instrumental | Free for commercial use |

Keep a note of the source and licence for anything added here. Nothing in this
folder is checked automatically — the code cannot tell a public-domain
recording from a commercial one, so that judgement stays with the hospital.

## Volume and interruptions

The player **ducks automatically** whenever the theatre radio speaks — every
announcement, the send-for-patient call, and every emergency alert. Music drops
to a low level and returns when the announcement ends. It does not stop dead,
because a track cutting out is itself a distraction.

Only one window plays, even with the app open on several screens at the same
desk.

## If a track will not play

The player skips a file it cannot decode and moves to the next one, so a single
bad file cannot silence the theatre for the rest of the list. If everything is
silent, check that the **Music library** tab is selected rather than Ambient,
and that the volume is up.

## Adding music without a shell

Administrators (ADMIN and SYSTEM_ADMINISTRATOR) can add and remove tracks from
**Theatre Music** in the dashboard menu — no server access needed. That screen
writes into this folder, so the two routes are interchangeable.

Uploads work on the **theatre server**. They do not work on the cloud
deployment, which has a read-only filesystem and a request-body limit smaller
than one track; the screen says so rather than failing obscurely.

## A library too big for this disk

`ORM_MUSIC_DIR` changes which folder is *listed*, but the player is always
handed `/audio/library/...` URLs, which Next serves out of `public/`. So the
override alone will list tracks that do not play. To put the library on another
disk, make `public/audio/library` a **symlink or bind mount** to it:

    mv public/audio/library /mnt/big/orm-music
    ln -s /mnt/big/orm-music public/audio/library
