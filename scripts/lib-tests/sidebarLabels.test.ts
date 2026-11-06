/**
 * Every name in the sidebar is written in full.
 *
 * Asked for on 6 November: "please modify the sidebar such that all the
 * names will be written in full even if it means reducing the font size for
 * excellent clarity and visibility."
 *
 * What it looked like before: the label span was `truncate`, and in a 256px
 * bar the text had about 115px once the indent, the icon and the NEW badge
 * had taken their share — thirteen characters. The menu read
 * "Anaesthet… NEW" twice and "Technicia… NEW" under it, so the only way to
 * tell the Anaesthetist Board from the Anaesthetist Coverage was to click
 * one and see where you landed. A truncated menu is not a menu; it is a
 * quiz.
 *
 * Two things are checked here, and the second is the one with teeth:
 *
 *   that nothing in the sidebar truncates any more — somebody re-adding
 *   `truncate` to tidy the layout is the obvious way this regresses;
 *
 *   and that the labels actually FIT. Removing `truncate` without the room
 *   to wrap into would produce a different mess rather than a fix, and a
 *   label added next year is the case nobody checks by eye.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const LAYOUT = 'src/app/dashboard/layout.tsx';
const src = readFileSync(join(__dirname, '..', '..', LAYOUT), 'utf8');

/**
 * The body of renderNavItem, which is the only place a nav label is drawn.
 *
 * Scoped rather than searched for across the whole file, and that is the
 * point: `break-words` appears on the group heading and on the signed-in
 * name too, so a whole-file assertion would go on passing with `truncate`
 * put back on the item itself. Asked of the function that draws the row.
 */
function navItemBody(): string {
  const start = src.indexOf('const renderNavItem');
  const end = src.indexOf('const inner = (', start);
  const close = src.indexOf('</>', end);
  if (start < 0 || end < 0 || close < 0) {
    throw new Error('renderNavItem could not be located — this test needs updating.');
  }
  return src.slice(start, close);
}

/** Every nav label declared in the layout, both quote styles. */
function labels(): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/label: '([^']+)'/g)) out.push(m[1]);
  for (const m of src.matchAll(/label: "([^"]+)"/g)) out.push(m[1]);
  return out;
}

/**
 * Roughly how wide a string renders, in px.
 *
 * An estimate, and said to be one: the real answer depends on the font the
 * handset resolves. 0.55em per character is a deliberately pessimistic
 * average for a UI sans at these sizes — wider than the truth for lowercase
 * text — so a label this says fits will fit, and the margin below is what
 * absorbs the rest.
 */
const widthPx = (text: string, fontPx: number) => text.length * fontPx * 0.55;

/** The widest word, which is what decides whether wrapping is even possible. */
const longestWordPx = (text: string, fontPx: number) =>
  Math.max(...text.split(/[\s-]+/).map((w) => widthPx(w, fontPx)));

// The sidebar is w-64 = 256px. A nested row is the tightest case:
//   pl-9 (36) + pr-3 (12) + icon 18 + mr-2.5 (10) + badge ~38 incl. margin.
const NESTED_TEXT_PX = 256 - 36 - 12 - 18 - 10 - 38;
const NESTED_FONT_PX = 12; // text-xs
/**
 * How many lines one row may take.
 *
 * Two, until 6 November, when the theatre asked for "Prescription
 * Approvals" to be renamed "Consultant Anaesthetist Prescription Approval"
 * — forty-four characters, and no abbreviation of it was wanted. Three
 * lines is what that name costs, so three is the limit now.
 *
 * THE SECOND ASSERTION IS WHAT KEEPS THIS HONEST. A ceiling on its own just
 * moves where the drift stops; the cap below bounds how MANY rows may be
 * that tall, so the menu cannot quietly become a column of three-line
 * blocks that pushes everything below the fold.
 */
const MAX_LINES = 3;

/**
 * How many labels may need that third line.
 *
 * ONE: exactly the name the theatre asked for, and no slack. A cap set to
 * "a few" is a cap that does nothing until the menu is already a column of
 * blocks — the next long name should have to be an explicit decision, made
 * by somebody raising this number and saying why, rather than slipping in
 * under an allowance nobody is watching.
 */
const MAX_THREE_LINE_LABELS = 1;

describe('the sidebar writes names in full', () => {
  it('does not truncate a nav label', () => {
    const body = navItemBody();
    expect(body).not.toContain('truncate');
    expect(body).toContain('break-words');
  });

  it('lets the row grow instead of clipping the text', () => {
    // items-start, not items-center: a wrapped label must line up with the
    // icon's first line rather than pushing the icon to the middle.
    expect(src).toContain('const className = `flex items-start ${pad}');
  });

  it('keeps the NEW badge from being squeezed by a long name', () => {
    expect(src).toMatch(/bg-accent-500 text-white text-\[10px\][^"]*flex-shrink-0/);
  });

  it('does not truncate the signed-in person either', () => {
    expect(src).not.toContain('text-sm font-semibold truncate');
    expect(src).not.toContain('text-xs text-primary-300 truncate');
  });

  it('found the labels at all', () => {
    // Guards every assertion below: a parser that silently matches nothing
    // would make the fitting test pass by having nothing to check.
    expect(labels().length).toBeGreaterThan(50);
  });

  it('has no label too wide to wrap, even in the narrowest row', () => {
    const tooWide = labels().filter(
      (l) => longestWordPx(l, NESTED_FONT_PX) > NESTED_TEXT_PX,
    );
    // A single word wider than the column cannot wrap at a space; it would
    // have to be broken mid-word, which reads badly in a menu.
    expect(tooWide).toEqual([]);
  });

  it('has no label needing more than three lines', () => {
    const tooLong = labels().filter(
      (l) => widthPx(l, NESTED_FONT_PX) > NESTED_TEXT_PX * MAX_LINES,
    );
    // Past three lines a row stops reading as one name and the menu grows
    // taller than the screen, which sends the thing people are looking for
    // below the fold — truncation wearing a different hat.
    expect(tooLong).toEqual([]);
  });

  it('keeps three-line rows rare', () => {
    const threeLine = labels().filter(
      (l) => widthPx(l, NESTED_FONT_PX) > NESTED_TEXT_PX * 2,
    );
    expect(threeLine.length).toBeLessThanOrEqual(MAX_THREE_LINE_LABELS);
  });
});
