/**
 * Build the icon and splash sources Capacitor's asset generator expects.
 *
 *   node scripts/mobile/make-icons.js
 *
 * Input:  assets/logo.png — the hospital mark. THE ONLY TRACKED IMAGE.
 * Output: assets/icon.png, icon-foreground.png, icon-background.png,
 *         splash.png, splash-dark.png — all gitignored and rebuilt from the
 *         logo, because a derived PNG committed beside its source is 2.6 MB
 *         of binary that silently stops matching what it came from. Then `npx capacitor-assets generate --android`
 *         fans those out into every density, which build-apk.sh does.
 *
 * ANDROID MASKS THE OUTER THIRD, and that is the whole reason this exists.
 * An adaptive icon is drawn on a 108dp canvas of which only the centre 72dp
 * is guaranteed to survive: launchers crop the rest to a circle, a squircle
 * or a rounded square as they each prefer. A logo that fills its square —
 * and this one does, out to the fingertips — loses the hands and the outer
 * ring on most phones, and nobody notices until it is on a hundred of them.
 *
 * So the foreground is the mark scaled into that safe centre, and the
 * background is the white it was drawn against, so the masked shape reads as
 * a deliberate white badge rather than whatever the launcher happens to put
 * behind it. icon.png is left full-bleed for older launchers that use it
 * unmasked.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const SRC = path.join(ASSETS, 'logo.png');

const CANVAS = 1024;
/** The centre share no launcher crops. */
const SAFE_FRACTION = 0.66;

/** The white the mark was drawn on — warmed a little so it does not glare. */
const PAPER = { r: 251, g: 251, b: 248, alpha: 1 };
/** The app's dark teal, for the dark splash. */
const INK = { r: 21, g: 50, b: 59, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`FAILED: no source mark at ${SRC}`);
    console.error('        Put the hospital logo there as a square PNG.');
    process.exit(1);
  }

  // capacitor-assets looks for icon.png by name. Full-bleed, for the older
  // launchers that use it unmasked rather than compositing the adaptive pair.
  fs.copyFileSync(SRC, path.join(ASSETS, 'icon.png'));

  const safe = Math.round(CANVAS * SAFE_FRACTION);
  const pad = Math.round((CANVAS - safe) / 2);

  const mark = await sharp(SRC)
    .resize(safe, safe, { fit: 'contain', background: CLEAR })
    .toBuffer();

  await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: CLEAR } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toFile(path.join(ASSETS, 'icon-foreground.png'));

  await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: PAPER } })
    .png()
    .toFile(path.join(ASSETS, 'icon-background.png'));

  // Splash: square at the largest size Capacitor asks for, so it can crop to
  // any screen without upscaling.
  const splashMark = await sharp(SRC)
    .resize(900, 900, { fit: 'contain', background: CLEAR })
    .toBuffer();

  for (const [name, background] of [['splash.png', PAPER], ['splash-dark.png', INK]]) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background } })
      .composite([{ input: splashMark, gravity: 'centre' }])
      .png()
      .toFile(path.join(ASSETS, name));
  }

  console.log(`icon-foreground.png  mark at ${Math.round(SAFE_FRACTION * 100)}%, transparent`);
  console.log('icon-background.png  #FBFBF8');
  console.log('splash.png           2732x2732 on #FBFBF8');
  console.log('splash-dark.png      2732x2732 on #15323B');
  console.log('\nNext: npx capacitor-assets generate --android');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
