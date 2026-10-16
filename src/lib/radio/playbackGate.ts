// ============================================================
// One announcement at a time
// ------------------------------------------------------------
// The player had no gate on this at all. It picked the highest-priority item
// in the queue and spoke it, and it re-ran that whenever the queue changed —
// which is every poll. So:
//
//   A workflow announcement is being read out. A poll brings in an emergency,
//   which outranks it, so the effect fires again and starts the emergency.
//   Nothing stopped the first one. And because a neural-voice announcement
//   plays through an <audio> element while the fallback speaks through
//   speechSynthesis, the two are separate audio channels: they do not
//   interrupt each other, they SOUND AT THE SAME TIME. Two voices over one
//   corridor speaker, and neither is intelligible.
//
//   A requireAck emergency repeating every 30 seconds whose announcement
//   takes 40 seconds to read overlapped ITSELF, permanently, for as long as
//   nobody acknowledged it.
//
// So playback is gated. The awkward part is not "wait your turn" — it is the
// two cases where waiting is wrong:
//
//   AN EMERGENCY DOES NOT QUEUE BEHIND A WELCOME MESSAGE. It pre-empts, and
//   the caller stops the current one first so there is still only one voice.
//
//   A WEDGED ANNOUNCEMENT MUST NOT SILENCE THE RADIO FOR EVER. If the audio
//   element never fires 'ended' — a corrupt file, a handset that slept, a tab
//   throttled in the background — then "something is playing" would be true
//   permanently and nothing would ever be heard again. Past a ceiling the
//   gate declares it stuck and lets the next one through.
//
// And one case where interrupting is wrong even though it is tempting:
// an emergency does NOT cut off another emergency. Two half-read emergencies
// convey nothing; one read in full conveys something. The second waits.
// ============================================================

/**
 * How long one announcement may hold the radio before it is presumed stuck.
 *
 * Longer than any real announcement — the uploaded MP3s run to a minute or
 * so and a spoken workflow message to a few seconds — and shorter than the
 * five minutes after which the server marks a stranded item PLAYED anyway.
 * An emergency never waits this long regardless: it pre-empts.
 */
export const MAX_PLAY_MS = 3 * 60 * 1000;

export interface NowPlaying {
  id: string;
  /** Emergencies pre-empt, and are not themselves pre-empted. */
  urgent: boolean;
  /** When playback actually began sounding. */
  startedAt: number;
}

export type GateDecision =
  /** Nothing is sounding. Start it. */
  | 'play'
  /** Stop what is sounding, then start this. Only ever one voice. */
  | 'pre-empt'
  /** Something else is sounding. Leave this in the queue and try again. */
  | 'wait'
  /** This very announcement is the one sounding. Do nothing. */
  | 'already';

/**
 * May this announcement start sounding right now?
 *
 * Pure, because the alternative is establishing what the radio does by
 * standing in a corridor listening to it.
 */
export function gatePlayback(args: {
  candidate: { id: string; urgent: boolean };
  nowPlaying: NowPlaying | null;
  now: number;
  maxPlayMs?: number;
}): GateDecision {
  const { candidate, nowPlaying, now } = args;
  const maxPlayMs = args.maxPlayMs ?? MAX_PLAY_MS;

  if (!nowPlaying) return 'play';

  // Checked before anything else. A repeating emergency re-offered while its
  // own previous reading is still sounding is the self-overlap case, and it
  // must not be read as "a new announcement wants in".
  if (nowPlaying.id === candidate.id) return 'already';

  // Presumed stuck. Returns pre-empt rather than play so the caller stops the
  // wedged channel first — whatever is holding the audio element has to be
  // cleared, or the new announcement inherits the jam.
  if (now - nowPlaying.startedAt >= maxPlayMs) return 'pre-empt';

  // An emergency does not queue behind routine traffic.
  if (candidate.urgent && !nowPlaying.urgent) return 'pre-empt';

  // Everything else waits — including an emergency behind another emergency.
  // Two half-read emergencies convey nothing; one read in full conveys
  // something.
  return 'wait';
}
