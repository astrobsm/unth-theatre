/**
 * Nine role scripts for NexoraVision, one file each.
 *
 * The narration is written by hand — a generator cannot know that a scrub nurse
 * cares about the pack list at six in the evening rather than at eight in the
 * morning. What IS generated is the wrapper: the same headings, the same two
 * description fields, the same production notes, so nine files read as one
 * series and none of them drifts out of the format the parser accepts.
 *
 * FORMAT, taken from src/lib/screenplay.ts in NexoraVision:
 *   "SHOT n — motion" is a heading; EVERY other line is spoken.
 *   So nothing but narration may appear inside the paste block.
 *
 * These are talking heads, so motion is a GESTURE prompt (what should move in
 * the frame) rather than a camera move, and each file says to set the motion
 * source to AI generation with lip-sync on.
 */

const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/HomePC/Documents/phone and desktop screenshots';

/** The app's own gesture vocabulary, from ProducePage GESTURE_PRESETS. */
const G = {
  talk: 'speaking naturally, gentle hand gestures, blinking',
  explain: 'leans forward, nods, gestures while explaining',
  toCamera: 'turns to camera, smiles, small shrug',
  listen: 'listening, subtle head tilt, occasional blink',
  point: 'points off-screen, follows with the eyes',
  relax: 'laughs, leans back, relaxed shoulders',
};

/**
 * The look. Shared across all nine so the series hangs together, with the
 * wardrobe and setting swapped per character.
 *
 * The specifics here are the difference between a person and a mannequin:
 * uneven light, real skin, background depth, and a camera actually held by
 * somebody.
 */
function direction(who, where) {
  return `Real Nigerian teaching hospital, documentary realism, not corporate video.
${who}
Warm brown skin under mixed lighting — cool hospital fluorescent overhead, warm
daylight from a window off to one side, so one side of the face is warmer than
the other. Shallow depth of field; ${where} soft but legible behind, with real
depth and occasional staff crossing far in the background. Handheld, almost
still — the small drift of a camera held by a person, never a locked tripod.
Natural skin texture with visible pores and faint lines; no beauty smoothing,
no retouching. Blinks irregularly, shifts weight, and pauses between thoughts
the way people do when they are thinking rather than reciting. Muted realistic
palette — greens, greys, warm skin tones. No lens flares, no colour grading
tricks, no stock-footage gloss.`;
}

const HUMAN_NOTES = `WHAT MAKES IT READ AS HUMAN, in order of how much it matters:

  1. Pauses. The narration below is written in short sentences with full stops
     where a real person draws breath. Do not let the voice smooth them out.
  2. Uneven lighting. Even, flattering light is the strongest single tell that
     a face was generated.
  3. Movement between thoughts, not during them. Gesture to make a point, then
     go still. Continuous hand movement reads as an animation loop.
  4. Background life. Somebody walks past, out of focus, once or twice. An empty
     corridor behind a hospital worker is the second-strongest tell.
  5. Looking slightly off-axis sometimes, as though at the person being taught
     rather than down a lens.`;

const PROD_NOTES = `Motion source  ->  AI generation      (not camera move)
Lip sync       ->  on
Film type      ->  Educational

The motions in the block are GESTURE prompts, not camera directions — with AI
generation, motion means what should move in the frame. That is billed per
second, so a talking head is the expensive kind of video. It earns it here,
because a face explaining a workflow is what makes people watch to the end.

Voice     Nigerian English, warm and measured, about 130 words per minute.
Music     Under the first two shots and the last one only. Silent while the
          teaching is happening — the words are the content.
Cutaways  Optional, and only where you have them. Keep the face on screen for
          most of it; that is what holds attention.`;

/** Assemble one file. */
function build({ file, title, runtime, describe, who, where, still, speaker, shots, extra }) {
  const secs = Math.round(shots.reduce((n, s) => n + s[1].split(/\s+/).length, 0) / 130 * 60);
  const mins = `${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s`;

  const lines = [];
  lines.push('='.repeat(80));
  lines.push(title);
  lines.push(`ORM · UNTH Ituku-Ozalla        ${shots.length} shots · about ${mins}`);
  lines.push('='.repeat(80));
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('DESCRIBE THE FILM  —  paste into step 1, "Describe the film"');
  lines.push('-'.repeat(80));
  lines.push(describe.trim());
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('DIRECTION  —  paste into step 5, "Direction"');
  lines.push('-'.repeat(80));
  lines.push('Applied on top of every shot. This is where the film stops looking generated:');
  lines.push('');
  lines.push(direction(who, where));
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('THE SPEAKER');
  lines.push('-'.repeat(80));
  lines.push(speaker.trim());
  lines.push('');
  lines.push(`Still: ${still} — the same picture on every shot, so it is recognisably`);
  lines.push('one person talking rather than a slideshow of strangers.');
  lines.push('');
  lines.push(HUMAN_NOTES);
  lines.push('');
  lines.push('-'.repeat(80));
  lines.push('PASTE THIS INTO THE NARRATION BOX');
  lines.push('-'.repeat(80));
  lines.push('');
  shots.forEach(([motion, narration], i) => {
    lines.push(`SHOT ${i + 1} — ${motion}`);
    lines.push(narration.trim().replace(/\s*\n\s*/g, ' '));
    lines.push('');
  });
  lines.push('-'.repeat(80));
  lines.push('PRODUCTION NOTES');
  lines.push('-'.repeat(80));
  lines.push(PROD_NOTES);
  if (extra) {
    lines.push('');
    lines.push(extra.trim());
  }
  lines.push('');

  fs.writeFileSync(path.join(OUT, file), lines.join('\n'), 'utf8');
  return { file, shots: shots.length, runtime: mins };
}

module.exports = { build, G, direction };
