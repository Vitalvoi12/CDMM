/**
 * Vertical layout of a calendar block (event, or the live session block).
 *
 * The grid hour height is fluid: it stretches to fill the free space and
 * compresses down to MIN_HOUR_HEIGHT on short screens, so the very same
 * 30-minute event can be 48px tall on a desktop and 12px on a laptop with a
 * squeezed window. The text inside a block, however, has a fixed pixel budget.
 *
 * Deriving the layout from `hourHeight` (a fraction of the grid cell) therefore
 * mis-classified short events: a 30-minute block hit the "roomy" branch as soon
 * as `height >= hourHeight * 0.42` and then rendered a 10px-padded two-line
 * layout inside a box that was far too small. All budgets below are ABSOLUTE
 * pixels, which is the only thing that stays correct while the grid breathes.
 */

/**
 * How much of the block's height the text actually needs. Decides both what is
 * drawn and whether it sits at the top or in the middle.
 */
export type EventDensity = 'padded' | 'two-line' | 'name' | 'micro';

export type EventAlign = 'top' | 'center';

export interface EventLayout {
  /** Richest content that fits — 'padded'/'two-line' also show the time range. */
  density: EventDensity;
  /** 'center' only when the box is too tight to sit the text at the top. */
  align: EventAlign;
  /** px of top padding when align === 'top', 0 when centred. */
  padTop: number;
  /** Whether "HH:MM - HH:MM" is drawn. */
  showTime: boolean;
}

interface Text {
  title: number;
  time: number;
  /** Cap for the breathing room above the text. */
  maxPad: number;
}

const DESKTOP_TEXT: Text = { title: 16, time: 16, maxPad: 10 };
const MOBILE_TEXT: Text = { title: 8, time: 7, maxPad: 6 };

/** Space between the title and the time range (TimelineEvent's mt-0.5). */
const ROW_GAP = 2;

/**
 * Clearance the text needs both above AND below before sitting at the top looks
 * deliberate. Below this the block is centre-aligned instead — a title pinned
 * to the top edge of a 22px box reads as clipped, not as "top aligned".
 */
const MIN_CLEARANCE = 4;

interface Budget {
  micro: number;
  name: number;
  twoLine: number;
  padded: number;
  /** Box height below which no resize handle is offered. */
  resize: number;
}

/** Desktop: 12px title, 11px time, 10px padding per side. */
const DESKTOP: Budget = { micro: 12, name: 18, twoLine: 34, padded: 54, resize: 11 };

/** Mobile overrides shrink the text to 8px/7px with no padding. */
const MOBILE: Budget = { micro: 9, name: 12, twoLine: 18, padded: 28, resize: 10 };

function budget(isMobile: boolean): Budget {
  return isMobile ? MOBILE : DESKTOP;
}

function densityOf(height: number, isMobile: boolean): EventDensity {
  const b = budget(isMobile);
  if (height >= b.padded) return 'padded';
  if (height >= b.twoLine) return 'two-line';
  if (height >= b.name) return 'name';
  return 'micro';
}

/**
 * Full vertical layout for a block of `height` px.
 *
 * Top-aligned whenever there is room for the text plus clearance above and
 * below — that is the reference look, with the padding capped at 10px. Only
 * blocks too tight for that are centred.
 *
 * Typography is deliberately NOT part of this: the title and time range keep
 * their fixed sizes on every density, so a 15-minute event and a 3-hour event
 * are set in the same face at the same size. Only `density` (what fits),
 * `align` and `padTop` (where it sits) adapt.
 */
export function eventLayout(height: number, isMobile = false): EventLayout {
  const t = isMobile ? MOBILE_TEXT : DESKTOP_TEXT;
  const density = densityOf(height, isMobile);
  const showTime = density === 'padded' || density === 'two-line';
  const contentH = showTime ? t.title + ROW_GAP + t.time : t.title;

  const align: EventAlign =
    height - contentH >= MIN_CLEARANCE * 2 ? 'top' : 'center';
  // A third of the slack sits above the text, so a tall block keeps the
  // reference 10px inset while a snug one stays close to its top edge.
  const padTop = align === 'top' ? Math.round(Math.min(t.maxPad, (height - contentH) / 3)) : 0;

  return { density, align, padTop, showTime };
}

/** Whether the bottom resize handle is usable — true for any real block. */
export function canResizeEvent(height: number, isMobile = false): boolean {
  return height >= budget(isMobile).resize;
}

export interface ResizeZone {
  /** Height of the grab strip in px. */
  height: number;
  /**
   * Negative margin-bottom: a block too short to host the strip inside it lets
   * the strip straddle its bottom edge instead, so the upper part of the block
   * stays free for dragging.
   */
  offset: number;
}

/**
 * Grab-strip geometry for the bottom resize handle.
 *
 * The handle is deliberately NOT tied to the content density: an event must
 * stay resizable at any length, including the very short ones whose title is
 * already shrunk to fit. Only the geometry adapts.
 */
export function eventResizeZone(height: number, isMobile = false): ResizeZone {
  const grab = Math.max(6, Math.min(isMobile ? 14 : 16, Math.round(height * 0.4)));
  // Comfortable blocks keep the strip inside, so it can never steal a click
  // from the event below.
  if (height >= grab * 2.2) return { height: grab, offset: 0 };
  return { height: grab, offset: -Math.round(grab / 2) };
}
