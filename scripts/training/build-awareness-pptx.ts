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
// ONE SOURCE, TWO OUTPUTS. The alternative is writing the slides twice, and
// the second copy is always the one that goes out of date: somebody corrects a
// step in the app, the deck circulated on WhatsApp still shows the old one, and
// the training contradicts the software. Editing awarenessDecks.ts changes both.
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

const OUT_DIR = process.env.ORM_PPTX_OUT
  ?? path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Documents', 'ORM-Awareness');

/**
 * The palette, matched to the in-app themes so a slide looks the same in both.
 *
 * Deep enough for a projector in a lit room: a theatre seminar room is not a
 * darkened auditorium, and pale text on pale ground is what makes people give
 * up and ask for the handout.
 */
const THEME: Record<DeckSlide['bg'], { bg: string; title: string; sub: string; body: string; rule: string }> = {
  navy:    { bg: '0B2545', title: 'FFFFFF', sub: '8ECAE6', body: 'E8EEF4', rule: '8ECAE6' },
  green:   { bg: '14532D', title: 'FFFFFF', sub: 'A7F3D0', body: 'E9F5EE', rule: 'A7F3D0' },
  skyblue: { bg: '1E4E68', title: 'FFFFFF', sub: 'BFE3F2', body: 'EAF4FA', rule: 'BFE3F2' },
  maroon:  { bg: '5A0F1E', title: 'FFFFFF', sub: 'F5C6AA', body: 'F7EAEA', rule: 'F5C6AA' },
  gold:    { bg: '6B4E0E', title: 'FFFFFF', sub: 'FFE7A3', body: 'FAF3E0', rule: 'FFE7A3' },
};

const HOSPITAL = 'University of Nigeria Teaching Hospital, Ituku-Ozalla';
const PROGRAMME = 'Hospital-wide ORM Awareness';

function addTitleSlide(pptx: PptxGenJS, deck: Deck, index: number | null) {
  const t = THEME.navy;
  const slide = pptx.addSlide();
  slide.background = { color: t.bg };

  slide.addText(PROGRAMME.toUpperCase(), {
    x: 0.6, y: 0.7, w: 9.0, h: 0.4,
    fontSize: 14, color: t.sub, bold: true, charSpacing: 2,
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.15, w: 1.6, h: 0.06, fill: { color: t.rule } });

  slide.addText(deck.title, {
    x: 0.6, y: 1.5, w: 9.0, h: 1.8,
    fontSize: 40, bold: true, color: t.title, valign: 'top',
  });
  slide.addText(deck.description, {
    x: 0.6, y: 3.3, w: 8.6, h: 0.9,
    fontSize: 16, color: t.body,
  });
  slide.addText(`For: ${deck.audience}`, {
    x: 0.6, y: 4.3, w: 8.6, h: 0.4,
    fontSize: 14, color: t.sub, italic: true,
  });
  slide.addText(HOSPITAL, {
    x: 0.6, y: 4.95, w: 8.6, h: 0.35,
    fontSize: 12, color: t.body,
  });
  if (index !== null) {
    slide.addText(`Deck ${index} of ${AWARENESS_DECKS.length}`, {
      x: 0.6, y: 5.3, w: 4.0, h: 0.3, fontSize: 11, color: t.sub,
    });
  }
}

function addContentSlide(pptx: PptxGenJS, deck: Deck, s: DeckSlide, n: number, total: number) {
  const t = THEME[s.bg] ?? THEME.navy;
  const slide = pptx.addSlide();
  slide.background = { color: t.bg };

  // The deck name in the corner, so a slide photographed on somebody's phone
  // and sent on still says which flow it belongs to.
  slide.addText(deck.title, {
    x: 0.5, y: 0.28, w: 7.2, h: 0.3,
    fontSize: 10, color: t.sub, charSpacing: 1,
  });
  slide.addText(`${n} / ${total}`, {
    x: 8.3, y: 0.28, w: 1.2, h: 0.3,
    fontSize: 10, color: t.sub, align: 'right',
  });

  slide.addText(s.title, {
    x: 0.5, y: 0.7, w: 9.0, h: 0.95,
    fontSize: s.title.length > 42 ? 26 : 30, bold: true, color: t.title, valign: 'top',
  });

  // The subtitle carries WHO does this step and WHERE. It is the line people
  // actually scan for, so it gets its own rule and its own colour rather than
  // being folded into the bullets.
  if (s.subtitle) {
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.72, w: 0.9, h: 0.05, fill: { color: t.rule } });
    slide.addText(s.subtitle, {
      x: 0.5, y: 1.85, w: 9.0, h: 0.45,
      fontSize: 15, color: t.sub, bold: true,
    });
  }

  if (s.bullets.length) {
    slide.addText(
      s.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } })),
      {
        x: 0.65, y: 2.45, w: 8.8, h: 2.7,
        fontSize: s.bullets.length > 4 ? 15 : 17,
        color: t.body, lineSpacing: s.bullets.length > 4 ? 24 : 28, valign: 'top',
      },
    );
  }

  // The narration becomes the speaker note, so whoever presents says the same
  // words the app speaks — and a deck handed to somebody else is still
  // deliverable by them.
  if (s.voiceOver) slide.addNotes(s.voiceOver);
}

function buildDeckFile(deck: Deck, index: number): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Operative Resource Manager';
  pptx.company = HOSPITAL;
  pptx.subject = PROGRAMME;
  pptx.title = deck.title;

  addTitleSlide(pptx, deck, index);
  deck.slides.forEach((s, i) => addContentSlide(pptx, deck, s, i + 1, deck.slides.length));
  return pptx;
}

/** A filename somebody can recognise in a WhatsApp list. */
function fileNameFor(deck: Deck, index: number): string {
  const safe = deck.title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${String(index).padStart(2, '0')}-${safe}.pptx`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Building into ${OUT_DIR}\n`);

  let slideTotal = 0;

  // An index loop rather than .entries(): this repository compiles to ES5, where
  // an array iterator cannot be destructured in a for-of.
  for (let i = 0; i < AWARENESS_DECKS.length; i++) {
    const deck = AWARENESS_DECKS[i];
    const index = i + 1;
    const pptx = buildDeckFile(deck, index);
    const file = path.join(OUT_DIR, fileNameFor(deck, index));
    await pptx.writeFile({ fileName: file });
    slideTotal += deck.slides.length + 1;
    console.log(`  ${String(deck.slides.length + 1).padStart(3)} slides  ${path.basename(file)}`);
  }

  // The combined file, for a single session that runs through everything.
  const all = new PptxGenJS();
  all.layout = 'LAYOUT_16x9';
  all.author = 'Operative Resource Manager';
  all.company = HOSPITAL;
  all.subject = PROGRAMME;
  all.title = PROGRAMME;

  const cover = all.addSlide();
  cover.background = { color: THEME.navy.bg };
  cover.addText(PROGRAMME, {
    x: 0.6, y: 1.7, w: 9.0, h: 1.2, fontSize: 44, bold: true, color: 'FFFFFF',
  });
  cover.addText('Every role, every flow, one step at a time', {
    x: 0.6, y: 2.9, w: 9.0, h: 0.5, fontSize: 18, color: THEME.navy.sub,
  });
  cover.addText(HOSPITAL, { x: 0.6, y: 3.5, w: 9.0, h: 0.4, fontSize: 14, color: THEME.navy.body });
  cover.addText(
    AWARENESS_DECKS.map((d, i) => ({
      text: `${i + 1}.  ${d.title}`,
      options: { bullet: false, breakLine: true },
    })),
    { x: 0.8, y: 4.1, w: 8.6, h: 1.6, fontSize: 12, color: THEME.navy.body, lineSpacing: 16 },
  );

  AWARENESS_DECKS.forEach((deck, i) => {
    addTitleSlide(all, deck, i + 1);
    deck.slides.forEach((s, j) => addContentSlide(all, deck, s, j + 1, deck.slides.length));
  });
  const combined = path.join(OUT_DIR, '00-Hospital-wide-ORM-Awareness-ALL.pptx');
  await all.writeFile({ fileName: combined });
  console.log(`  ${String(slideTotal + 1).padStart(3)} slides  ${path.basename(combined)}\n`);

  console.log(`${AWARENESS_DECKS.length} decks, ${slideTotal} slides, plus the combined file.`);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
