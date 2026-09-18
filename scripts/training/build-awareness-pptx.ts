/* eslint-disable no-console */
// ============================================================
// Hospital-wide ORM Awareness — build the PowerPoint files
// ------------------------------------------------------------
//   npx tsx scripts/training/build-awareness-pptx.ts
//
// Reads the decks from src/lib/awarenessDecks.ts — the SAME objects the in-app
// Presentation module shows — and renders each one as a .pptx, plus a combined
// file containing all seven.
//
// THE SLIDE IS THE SCREEN. Two thirds of every step slide is the actual
// screenshot of the page being described; the remaining third carries the role
// that owns the step and the points about it. Somebody being trained should
// recognise the screen in front of them rather than read a description of it.
//
// The screenshots come from the training capture, taken against the THROWAWAY
// screenshot database. Every patient on them is invented — which is the only
// reason this material can be circulated hospital-wide. See
// scripts/seed-screenshot-demo.ts, which refuses to run against anything else.
//
// ONE SOURCE, TWO OUTPUTS. Writing the slides twice means the second copy goes
// stale the first time a step changes, and then the training contradicts the
// software. Editing awarenessDecks.ts changes both.
//
// pptxgenjs is a devDependency, and it has to be: `next build` typechecks this
// directory, so a module that exists only on the machine that wrote the script
// fails the build everywhere else. It was installed with --no-save first, which
// compiled here and took the theatre server down on the next deploy.
// ============================================================

import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';

import { AWARENESS_DECKS } from '../../src/lib/awarenessDecks';
import type { Deck, DeckSlide } from '../../src/lib/presentations';
import { SHOTS } from './awareness-shots';

const OUT_DIR = process.env.ORM_PPTX_OUT
  ?? path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Documents', 'ORM-Awareness');

const SHOT_DIR = process.env.ORM_SHOT_DIR
  ?? path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Documents', 'phone and desktop screenshots');

/** 16:9, in inches. Every coordinate below is derived from these two. */
const W = 10;
const H = 5.625;

/** The screen takes two thirds; the points take the rest. */
const SPLIT = (W * 2) / 3;

const THEME: Record<DeckSlide['bg'], { bg: string; panel: string; title: string; sub: string; body: string; rule: string }> = {
  navy:    { bg: '0B2545', panel: '13365F', title: 'FFFFFF', sub: '8ECAE6', body: 'E8EEF4', rule: '8ECAE6' },
  green:   { bg: '14532D', panel: '1C6B3C', title: 'FFFFFF', sub: 'A7F3D0', body: 'E9F5EE', rule: 'A7F3D0' },
  skyblue: { bg: '1E4E68', panel: '2A6A8B', title: 'FFFFFF', sub: 'BFE3F2', body: 'EAF4FA', rule: 'BFE3F2' },
  maroon:  { bg: '5A0F1E', panel: '78182B', title: 'FFFFFF', sub: 'F5C6AA', body: 'F7EAEA', rule: 'F5C6AA' },
  gold:    { bg: '6B4E0E', panel: '8A6614', title: 'FFFFFF', sub: 'FFE7A3', body: 'FAF3E0', rule: 'FFE7A3' },
};

const HOSPITAL = 'University of Nigeria Teaching Hospital, Ituku-Ozalla';
const PROGRAMME = 'Hospital-wide ORM Awareness';

/** Reported once at the end rather than per slide. */
const missing = new Set<string>();

function shotPath(slug: string | undefined): string | null {
  if (!slug) return null;
  const file = path.join(SHOT_DIR, `${slug}__desktop.png`);
  if (fs.existsSync(file)) return file;
  missing.add(slug);
  return null;
}

function addTitleSlide(pptx: PptxGenJS, deck: Deck, index: number | null) {
  const t = THEME.navy;
  const slide = pptx.addSlide();
  slide.background = { color: t.bg };

  slide.addText(PROGRAMME.toUpperCase(), {
    x: 0.6, y: 0.7, w: 9.0, h: 0.4, fontSize: 14, color: t.sub, bold: true, charSpacing: 2,
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.15, w: 1.6, h: 0.06, fill: { color: t.rule } });

  slide.addText(deck.title, {
    x: 0.6, y: 1.5, w: 9.0, h: 1.5, fontSize: 38, bold: true, color: t.title, valign: 'top',
  });
  slide.addText(deck.description, {
    x: 0.6, y: 3.05, w: 8.6, h: 0.8, fontSize: 15, color: t.body,
  });
  slide.addText(`For: ${deck.audience}`, {
    x: 0.6, y: 3.95, w: 8.6, h: 0.4, fontSize: 13, color: t.sub, italic: true,
  });
  slide.addText(HOSPITAL, { x: 0.6, y: 4.5, w: 8.6, h: 0.35, fontSize: 12, color: t.body });
  if (index !== null) {
    slide.addText(`Deck ${index} of ${AWARENESS_DECKS.length}`, {
      x: 0.6, y: 4.85, w: 4.0, h: 0.3, fontSize: 11, color: t.sub,
    });
  }
}

/**
 * A step slide: the screen on the left, the points on the right.
 *
 * Where there is no screenshot — the opening and closing slides, which are
 * about the deck rather than about a page — the text runs the full width
 * instead of leaving two thirds of the slide empty.
 */
function addContentSlide(pptx: PptxGenJS, deck: Deck, s: DeckSlide, n: number, total: number) {
  const t = THEME[s.bg] ?? THEME.navy;
  const slide = pptx.addSlide();
  slide.background = { color: t.bg };

  const shot = shotPath(SHOTS[deck.id]?.[s.title]);
  const textX = shot ? SPLIT + 0.2 : 0.55;
  const textW = shot ? W - SPLIT - 0.45 : W - 1.1;

  // ---- Running head ------------------------------------------------------
  slide.addText(deck.title, {
    x: 0.35, y: 0.16, w: 7.0, h: 0.28, fontSize: 9, color: t.sub, charSpacing: 1,
  });
  slide.addText(`${n} / ${total}`, {
    x: W - 1.45, y: 0.16, w: 1.1, h: 0.28, fontSize: 9, color: t.sub, align: 'right',
  });

  // ---- The screen --------------------------------------------------------
  if (shot) {
    // A panel behind the image, so a screenshot with a white background has an
    // edge rather than floating on a dark slide.
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.3, y: 0.95, w: SPLIT - 0.45, h: H - 1.45,
      fill: { color: t.panel }, line: { color: t.rule, width: 0.75 },
    });
    // `contain` preserves the aspect ratio. These captures are 1440x900 and one
    // is portrait; stretching a screenshot to fill a box makes it look like a
    // different application.
    slide.addImage({
      path: shot,
      x: 0.42, y: 1.07,
      w: SPLIT - 0.69, h: H - 1.69,
      sizing: { type: 'contain', w: SPLIT - 0.69, h: H - 1.69 },
    });
  }

  // ---- The step ----------------------------------------------------------
  slide.addText(s.title, {
    x: textX, y: 0.6, w: textW, h: shot ? 0.95 : 0.8,
    fontSize: shot ? (s.title.length > 34 ? 17 : 20) : 28,
    bold: true, color: t.title, valign: 'top',
  });

  let cursor = shot ? 1.6 : 1.5;

  // WHO does it, and WHERE. The line people scan for, so it keeps its rule.
  if (s.subtitle) {
    slide.addShape(pptx.ShapeType.rect, {
      x: textX, y: cursor - 0.12, w: 0.6, h: 0.04, fill: { color: t.rule },
    });
    slide.addText(s.subtitle, {
      x: textX, y: cursor, w: textW, h: shot ? 0.65 : 0.4,
      fontSize: shot ? 11 : 15, color: t.sub, bold: true, valign: 'top',
    });
    cursor += shot ? 0.72 : 0.55;
  }

  if (s.bullets.length) {
    slide.addText(
      s.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } })),
      {
        x: textX + 0.05, y: cursor, w: textW - 0.05, h: H - cursor - 0.45,
        fontSize: shot ? (s.bullets.length > 4 ? 10 : 11) : 15,
        color: t.body,
        lineSpacing: shot ? (s.bullets.length > 4 ? 15 : 17) : 26,
        valign: 'top',
      },
    );
  }

  // The narration becomes the speaker note, so whoever presents says the same
  // words the app speaks — and a deck handed on is still deliverable.
  if (s.voiceOver) slide.addNotes(s.voiceOver);
}

/**
 * Write a deck, and say so plainly if the file is open in PowerPoint.
 *
 * Windows locks an open .pptx. Without this the script did all seven decks and
 * then died on a stack trace at the last one, which reads like a total failure
 * when in fact almost everything succeeded.
 */
async function write(pptx: PptxGenJS, file: string): Promise<boolean> {
  try {
    await pptx.writeFile({ fileName: file });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'EBUSY') {
      console.log(`  LOCKED    ${path.basename(file)} — close it in PowerPoint and run again`);
      return false;
    }
    throw e;
  }
}

function newDeckFile(title: string): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Operative Resource Manager';
  pptx.company = HOSPITAL;
  pptx.subject = PROGRAMME;
  pptx.title = title;
  return pptx;
}

/** A filename somebody can recognise in a WhatsApp list. */
function fileNameFor(deck: Deck, index: number): string {
  const safe = deck.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return `${String(index).padStart(2, '0')}-${safe}.pptx`;
}

async function main() {
  if (!fs.existsSync(SHOT_DIR)) {
    console.error(`No screenshots at ${SHOT_DIR}`);
    console.error('Set ORM_SHOT_DIR, or run scripts/capture-screenshots.js first.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Screens from ${SHOT_DIR}`);
  console.log(`Building into ${OUT_DIR}\n`);

  let slideTotal = 0;
  let withShot = 0;
  let withoutShot = 0;

  for (let i = 0; i < AWARENESS_DECKS.length; i++) {
    const deck = AWARENESS_DECKS[i];
    const index = i + 1;
    const pptx = newDeckFile(deck.title);

    addTitleSlide(pptx, deck, index);
    deck.slides.forEach((s, j) => {
      if (shotPath(SHOTS[deck.id]?.[s.title])) withShot++; else withoutShot++;
      addContentSlide(pptx, deck, s, j + 1, deck.slides.length);
    });

    const file = path.join(OUT_DIR, fileNameFor(deck, index));
    slideTotal += deck.slides.length + 1;
    if (await write(pptx, file)) {
      console.log(`  ${String(deck.slides.length + 1).padStart(3)} slides  ${path.basename(file)}`);
    }
  }

  // The combined file, for a session that runs through everything.
  const all = newDeckFile(PROGRAMME);
  const cover = all.addSlide();
  cover.background = { color: THEME.navy.bg };
  cover.addText(PROGRAMME, { x: 0.6, y: 1.5, w: 9.0, h: 1.1, fontSize: 42, bold: true, color: 'FFFFFF' });
  cover.addText('Every role, every flow, one step and one screen at a time', {
    x: 0.6, y: 2.6, w: 9.0, h: 0.45, fontSize: 17, color: THEME.navy.sub,
  });
  cover.addText(HOSPITAL, { x: 0.6, y: 3.1, w: 9.0, h: 0.35, fontSize: 13, color: THEME.navy.body });
  cover.addText(
    AWARENESS_DECKS.map((d, i) => ({
      text: `${i + 1}.  ${d.title}`,
      options: { bullet: false, breakLine: true },
    })),
    { x: 0.8, y: 3.6, w: 8.6, h: 1.7, fontSize: 12, color: THEME.navy.body, lineSpacing: 16 },
  );

  AWARENESS_DECKS.forEach((deck, i) => {
    addTitleSlide(all, deck, i + 1);
    deck.slides.forEach((s, j) => addContentSlide(all, deck, s, j + 1, deck.slides.length));
  });
  const combined = path.join(OUT_DIR, '00-Hospital-wide-ORM-Awareness-ALL.pptx');
  if (await write(all, combined)) {
    console.log(`  ${String(slideTotal + 1).padStart(3)} slides  ${path.basename(combined)}`);
  }
  console.log('');

  console.log(`${AWARENESS_DECKS.length} decks, ${slideTotal} slides.`);
  console.log(`${withShot} slides carry a screen; ${withoutShot} are opening or closing slides.`);
  if (missing.size) {
    console.log(`\nNOT FOUND in ${SHOT_DIR}:`);
    for (const slug of Array.from(missing).sort()) console.log(`  ${slug}__desktop.png`);
    console.log('Those slides were laid out full width instead.');
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
