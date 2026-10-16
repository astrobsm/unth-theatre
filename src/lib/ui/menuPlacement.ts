// ============================================================
// Where a dropdown goes, and how tall it is allowed to be
// ------------------------------------------------------------
// Extracted from CaseActionsMenu after two bugs in a row, both of which made
// the BOTTOM of the menu unreachable and neither of which was visible by
// looking at the code:
//
//   The menu was 70vh tall regardless of where its button was. Sixteen named
//   actions in four groups is taller than most laptop windows, so for a row
//   low down the page the last group ran off the bottom of the screen.
//
//   Reaching it meant scrolling, and scrolling closed the menu.
//
// Geometry is exactly the kind of thing that looks right in a diff and is
// wrong on a 13-inch screen, so it is a pure function here with the awkward
// cases written down as tests.
// ============================================================

/** The menu's fixed width. The actions have long names and need the room. */
export const MENU_WIDTH = 300;
/** Between the button and the menu. */
export const GAP = 6;
/** Smallest gap kept between the menu and the edge of the window. */
export const MARGIN = 12;
/** Below this much room underneath, the menu opens upwards instead. */
export const FLIP_BELOW = 240;
/** Never shorter than this. A 40px scroll window is not usable. */
export const MIN_HEIGHT = 160;

/** Just the parts of a DOMRect this needs, so tests need no DOM. */
export interface ButtonBox {
  top: number;
  bottom: number;
  right: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  maxHeight: number;
  /** Whether it opened upwards. Exposed so the caller can prove it did. */
  up: boolean;
}

/**
 * Place the menu against its button.
 *
 * Right-aligned to the button, because the actions column sits at the right
 * edge of a wide table and a left-aligned menu would open off the page.
 * Opens upwards for a button low on the screen, and its height is whatever
 * room there actually is rather than a fraction of the window.
 */
export function placeMenu(button: ButtonBox, viewport: Viewport): Placement {
  const left = Math.max(
    MARGIN,
    Math.min(button.right - MENU_WIDTH, viewport.width - MENU_WIDTH - MARGIN),
  );

  const below = viewport.height - button.bottom - GAP - MARGIN;
  const above = button.top - GAP - MARGIN;

  // Only flips when there is MORE room above. A cramped window where both
  // are small must not flip, because flipping would put the menu over the
  // thing the person was looking at for no gain.
  const up = below < FLIP_BELOW && above > below;

  const maxHeight = Math.max(MIN_HEIGHT, Math.floor(up ? above : below));
  const top = up
    ? Math.max(MARGIN, button.top - GAP - maxHeight)
    : button.bottom + GAP;

  return { top, left, maxHeight, up };
}
