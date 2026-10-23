/**
 * Squeeze the generated splash screens.
 *
 *   node scripts/mobile/shrink-splash.js
 *
 * Run AFTER `capacitor-assets generate`, which build-apk.sh does for you.
 *
 * capacitor-assets writes every splash as a full-colour RGBA PNG. A splash is
 * one mark centred on one flat colour — a handful of distinct colours plus the
 * mark's own shading — so full colour buys nothing and costs 4.4 MB across the
 * 26 density-and-orientation variants. That doubled the APK, and this app is
 * installed over hospital wifi on phones that pay for the difference.
 *
 * Palette encoding with dithering keeps the mark's edges clean while dropping
 * the flat field to near nothing. The icons are left alone: they are small
 * already, and a launcher icon is the one image people look at closely.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('@capacitor/assets/node_modules/sharp');

const RES = path.join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'res');

async function main() {
  if (!fs.existsSync(RES)) {
    console.error(`FAILED: no generated resources at ${RES}`);
    console.error('        Run `npx capacitor-assets generate --android` first.');
    process.exit(1);
  }

  const targets = [];
  for (const dir of fs.readdirSync(RES)) {
    const full = path.join(RES, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full)) {
      if (file.startsWith('splash') && file.endsWith('.png')) {
        targets.push(path.join(full, file));
      }
    }
  }

  if (targets.length === 0) {
    console.error('FAILED: found no splash PNGs to shrink.');
    process.exit(1);
  }

  let before = 0;
  let after = 0;

  for (const file of targets) {
    before += fs.statSync(file).size;
    // sharp cannot write the file it is reading, so go via a sibling temp.
    const tmp = `${file}.tmp`;
    await sharp(file).png({ palette: true, colours: 256, dither: 1, effort: 10 }).toFile(tmp);
    fs.renameSync(tmp, file);
    after += fs.statSync(file).size;
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(`${targets.length} splash images: ${mb(before)} MB -> ${mb(after)} MB`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
