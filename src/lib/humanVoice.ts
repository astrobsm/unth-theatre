'use client';

/**
 * Humanoid voice selection for the built-in browser speech engine.
 * -----------------------------------------------------------------
 * The natural voice for announcements is Kokoro (see kokoroTts.ts), with the
 * ElevenLabs proxy behind it. `speechSynthesis` is the last resort — but "last
 * resort" does not have to mean "robotic".
 *
 * Every modern OS now ships two very different classes of voice under the same
 * API: the legacy formant synthesisers (eSpeak, Fred, Albert, Microsoft
 * David/Zira/Hazel) that sound like a machine, and the modern neural ones
 * (Microsoft *Natural*, Google, Apple Enhanced/Premium, Siri) that are close to
 * a real person. The default pick — usually `voices[0]` or the first `en-*` —
 * lands on the robotic ones about as often as not.
 *
 * This module ranks what the device actually has and picks the most humanoid
 * available, so the fallback still sounds like a person. Every surface that
 * speaks uses it, which also ends the drift of six hand-rolled voice filters
 * with six different rate/pitch settings.
 */

/**
 * A Nigerian voice beats everything else, by a margin nothing can close.
 *
 * This used to be a 60-point nudge against a 100-point bonus for a vendor
 * "Natural" or "Neural" voice, so a device holding both en-NG-EzinneNeural
 * and an American natural voice chose the American one. Staff at Ituku-Ozalla
 * were read their own theatre list in a Californian accent.
 *
 * The margin is deliberate rather than tuned: for this hospital a Nigerian
 * voice is not one desirable property among several to be traded off against
 * smoothness. It either exists on the device or it does not.
 */
export const NIGERIAN_LOCALE = /^en[-_]NG/i;
const NIGERIAN_BONUS = 1000;

/** After Nigerian: the Englishes closest to how staff here speak and listen. */
const LOCALE_RANK: Array<[RegExp, number]> = [
  [NIGERIAN_LOCALE, NIGERIAN_BONUS],
  [/^en[-_]GB/i, 45],
  [/^en[-_]AU|^en[-_]IE|^en[-_]ZA/i, 35],
  [/^en[-_]US/i, 30],
  [/^en/i, 20],
];

/**
 * The Nigerian English voices Microsoft and Google ship, in a FIXED order.
 *
 * Order matters more than which one is first. Two devices picking different
 * Nigerian voices give the room a male and a female reading the same notice,
 * which is the complaint this change answers; one agreed order means every
 * device that has these lands on the same one.
 */
const NIGERIAN_VOICE_ORDER: RegExp[] = [/\bezinne\b/i, /\babeo\b/i];

/** Markers OS vendors use for their neural/high-quality voices. */
const QUALITY_HINTS: Array<[RegExp, number]> = [
  [/natural/i, 100],
  [/neural/i, 100],
  [/\bpremium\b/i, 80],
  [/enhanced/i, 70],
  [/\bsiri\b/i, 70],
  [/\bgoogle\b/i, 55],
];

/** Named voices known to be pleasant and human-sounding. */
const GOOD_VOICES =
  /\b(ezinne|abeo|sonia|ryan|libby|maisie|thomas|aria|jenny|guy|davis|michelle|ana|samantha|serena|karen|moira|daniel|kate|stephanie|alex)\b/i;

/** The legacy formant synths — intelligible, but unmistakably a machine. */
const ROBOTIC_VOICES =
  /\b(espeak|festival|pico|flite|mbrola|compact|fred|albert|zarvox|trinoids|whisper|bells|boing|bubbles|cellos|deranged|hysterical|junior|kathy|pipe organ|princess|ralph|bad news|good news|wobble|grandma|grandpa|rocko|shelley|sandy|eddy|reed|david|mark|zira|hazel|george|susan)\b/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name || '';
  const lang = v.lang || '';

  let score = 0;
  for (const [re, pts] of LOCALE_RANK) {
    if (re.test(lang)) { score += pts; break; }
  }
  // A non-English voice reading English text is worse than any English one.
  if (!/^en/i.test(lang)) score -= 200;

  for (const [re, pts] of QUALITY_HINTS) {
    if (re.test(name)) { score += pts; break; }
  }
  if (GOOD_VOICES.test(name)) score += 40;
  if (ROBOTIC_VOICES.test(name)) score -= 90;

  // Remote/cloud voices are the vendors' good ones; local voices are usually
  // the small offline synths. Only a tie-breaker — being offline still counts.
  if (v.localService === false) score += 15;
  if (v.default) score += 5;

  // Among Nigerian voices, settle on ONE so two devices never read the same
  // announcement in two different voices. Earlier in the list scores higher.
  if (NIGERIAN_LOCALE.test(lang)) {
    const i = NIGERIAN_VOICE_ORDER.findIndex((re) => re.test(name));
    if (i >= 0) score += (NIGERIAN_VOICE_ORDER.length - i) * 20;
  }

  return score;
}

/**
 * Does this device have a Nigerian English voice at all?
 *
 * Asked before reaching for the neural engine: Kokoro's voices are American
 * and British only, so on a device that HAS a Nigerian voice the neural
 * engine is the wrong choice however smooth it sounds.
 */
export function hasNigerianVoice(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    return (window.speechSynthesis.getVoices() || [])
      .some((v) => NIGERIAN_LOCALE.test(v.lang || ''));
  } catch {
    return false;
  }
}

let cached: SpeechSynthesisVoice | null = null;
let cachedCount = -1;

/**
 * The most human-sounding voice this device offers, or `null` if the voice list
 * is not populated yet (Chrome fills it asynchronously — call `primeHumanVoices`
 * early, and the result is picked up on the next call).
 */
export function pickHumanVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch {
    return null;
  }
  if (voices.length === 0) return null;
  // Re-rank when the list grows (voices load in batches on some browsers).
  if (cached && voices.length === cachedCount) return cached;

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoice(v);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  cached = best;
  cachedCount = voices.length;
  return best;
}

/**
 * Ask the browser to populate its voice list. Chrome returns an empty array on
 * the first synchronous call, which is exactly why callers used to end up on
 * `voices[0]`. Safe to call repeatedly; cheap after the first time.
 */
export function primeHumanVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.getVoices();
    if ('onvoiceschanged' in synth) {
      synth.addEventListener('voiceschanged', () => {
        cached = null;
        cachedCount = -1;
        pickHumanVoice();
      }, { once: true });
    }
  } catch { /* best-effort */ }
}

export interface HumanVoiceOptions {
  /** Speaking rate; defaults to the natural 0.95 used across announcements. */
  rate?: number;
  /** Pitch; defaults to 1 (raising it is what makes a synth sound cartoonish). */
  pitch?: number;
  /** 0..1 volume, default 1. */
  volume?: number;
  /** Force a language instead of following the chosen voice. */
  lang?: string;
}

/**
 * Apply the most humanoid voice available, plus prosody that reads as speech
 * rather than as a machine. One place, so every surface sounds like the same
 * person instead of six slightly different robots.
 */
export function applyHumanVoice(
  utterance: SpeechSynthesisUtterance,
  opts: HumanVoiceOptions = {}
): SpeechSynthesisUtterance {
  const voice = pickHumanVoice();
  if (voice) {
    utterance.voice = voice;
    // Matching lang to the voice stops some engines re-routing to a default.
    utterance.lang = opts.lang ?? voice.lang;
  } else {
    // Voice list not populated yet (Chrome fills it asynchronously). Naming the
    // language still steers the engine towards an English voice rather than the
    // system default, which may not be English at all.
    utterance.lang = opts.lang ?? 'en-US';
  }
  // Slightly under 1.0 reads as measured and human; 1.0+ reads as clipped.
  utterance.rate = opts.rate ?? 0.95;
  utterance.pitch = opts.pitch ?? 1;
  utterance.volume = opts.volume ?? 1;
  return utterance;
}
