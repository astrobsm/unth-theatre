/**
 * Turn each video's scene table into a block that pastes straight into
 * NexoraVision's Produce → Narrated sequence box.
 *
 * WRITTEN AGAINST THE REAL PARSER, not against the screenshot. The shape below
 * is what src/lib/screenplay.ts parseNarrationScript() actually accepts:
 *
 *     SHOT 1 — push in
 *     Nine-forty in the morning. The theatre is empty…
 *
 *     SHOT 2 — hold
 *     That is the whole reason this application exists…
 *
 * Three rules follow from reading it, and the first one is why the previous
 * version of this file was wrong:
 *
 * 1. ONLY the heading and MOTION:/CAMERA:/MOVE: lines are special. EVERY other
 *    line becomes narration. So an "IMAGE:" line does not describe the still —
 *    it gets spoken aloud. The still descriptions therefore live OUTSIDE the
 *    paste block, in a list beside it.
 *
 * 2. The heading is `SHOT <n> — <motion>`; the text after the dash is the
 *    motion field. A blank line separates shots.
 *
 * 3. motion is "what should MOVE". With the default motionSource of
 *    `camera-move`, FFmpeg moves the FRAME across the still, and the app's own
 *    vocabulary is: push in, pull back, pan left, pan right, tilt up, hold.
 *    Anything outside that vocabulary — "highlight the tap target", "no camera
 *    move" — is not a motion and cannot be rendered. Negations are worst of
 *    all: "no camera move" is spelt `hold`.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'orm-video-handbook.html');

/** The app's camera vocabulary. Nothing outside this list is a valid motion. */
const CAMERA = {
  PUSH: 'push in',
  PULL: 'pull back',
  PAN_L: 'pan left',
  PAN_R: 'pan right',
  TILT: 'tilt up',
  HOLD: 'hold',
};

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, ' — ')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&hellip;/g, '…')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Which camera move suits this still.
 *
 * A screen HOLDS. Text drifting while somebody is trying to read a field is
 * worse than no movement, and it is the single commonest way a training video
 * becomes unwatchable.
 */
function motionFor(visual, index, total) {
  const v = visual.toLowerCase();
  const last = index === total - 1;

  if (/screen|phone|tablet|laptop|dashboard|form|field|list|board|portal|settings|app\b|card/.test(v)) {
    return CAMERA.HOLD;
  }
  if (/timeline|animation|animated|columns|icons|cards appear|gauge|overhead/.test(v)) {
    return CAMERA.PAN_R;
  }
  if (/walk|walking|corridor|wheeled|trolley|carrying/.test(v)) {
    return CAMERA.PAN_L;
  }
  if (/presenter/.test(v)) return last ? CAMERA.PULL : CAMERA.PUSH;
  if (/split screen/.test(v)) return CAMERA.HOLD;
  return last ? CAMERA.PULL : CAMERA.PUSH;
}

/** A shot worth paying to animate: a person who should move, not a screen. */
function worthAnimating(visual) {
  const v = visual.toLowerCase();
  if (/screen|phone screen|dashboard|form|board|timeline|animation|icons/.test(v)) return false;
  return /presenter|surgeon|nurse|porter|registrar|consultant|staff|team|patient|engineer|pharmacist|technician/.test(v);
}

const html = fs.readFileSync(FILE, 'utf8');

// Remove any block a previous run injected, so this is repeatable rather than
// cumulative.
const cleaned = html.replace(
  /<div class="box key" style="page-break-inside:avoid">\s*<h4>Paste into[\s\S]*?<\/div>\s*<\/div>\s*(?=<div class="prompt">)/g,
  '',
);

const parts = cleaned.split(/(<div class="video">)/);
let out = '';
let videos = 0;
let shotCount = 0;

for (let i = 0; i < parts.length; i += 1) {
  const part = parts[i];
  if (part !== '<div class="video">') {
    out += part;
    continue;
  }

  const body = parts[i + 1] ?? '';
  const title = decode((body.match(/<h3>([^<]+)<\/h3>/) || [, 'Untitled'])[1]);

  const rows = [...body.matchAll(
    /<tr><td class="scene">([\s\S]*?)<\/td><td class="visual">([\s\S]*?)<\/td>\s*<td class="narr">([\s\S]*?)<\/td><\/tr>/g,
  )];

  if (!rows.length) { out += part; continue; }

  const shots = rows.map((m, idx) => ({
    n: idx + 1,
    visual: decode(m[2]),
    narration: decode(m[3]),
    motion: motionFor(decode(m[2]), idx, rows.length),
    animate: worthAnimating(decode(m[2])),
  }));
  shotCount += shots.length;
  videos += 1;

  // The paste block: headings and narration ONLY. Nothing else, because
  // everything else would be read aloud.
  const pasteBlock = shots
    .map((s) => `SHOT ${s.n} — ${s.motion}\n${s.narration}`)
    .join('\n\n');

  // The stills list: kept OUT of the paste box on purpose.
  const stills = shots
    .map(
      (s) =>
        `<li><strong>Shot ${s.n}</strong> <span style="color:#4b5563">(${s.motion}${s.animate ? ', worth animating' : ''})</span> — ${esc(s.visual)}</li>`,
    )
    .join('\n');

  const block =
    `<div class="box key">\n` +
    `<h4>Produce &mdash; stills to prepare</h4>\n` +
    `<p style="font-size:9pt;margin:0 0 4pt">One still per shot, in this order. Load them into ` +
    `<em>Images to animate</em>. Shots marked <em>worth animating</em> are the only ones where AI ` +
    `generation earns its cost &mdash; a screen never does.</p>\n` +
    `<ol style="font-size:9pt;margin:0 0 8pt;padding-left:18pt">\n${stills}\n</ol>\n` +
    `<h4 style="margin-top:8pt">Produce &mdash; paste into the narration box</h4>\n` +
    `<p style="font-size:9pt;margin:0 0 4pt">Paste exactly as below. The app reads ` +
    `<code>SHOT n &mdash; motion</code> as a heading and every other line as narration, so this fills ` +
    `the motion and narration fields for all ${shots.length} shots in one go. ` +
    `Do not paste the still descriptions &mdash; they would be spoken aloud.</p>\n` +
    `<div class="prompt">${esc(pasteBlock)}</div>\n` +
    `</div>\n`;

  out += part + body.replace(/<div class="prompt">/, `${block}<div class="prompt">`);
  i += 1;
}

fs.writeFileSync(FILE, out, 'utf8');
console.log(`paste blocks written for ${videos} videos, ${shotCount} shots total`);
