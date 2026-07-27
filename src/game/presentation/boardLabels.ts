import { SidelineCrewInfo } from "./sidelineStaff";

/**
 * A single crisp text label the React overlay draws over the Phaser canvas.
 *
 * Text that used to be baked into the Phaser scene (dugout section headers,
 * the sideline-crew rail, end-zone team names) renders poorly at the canvas's
 * fixed resolution, so the scene now publishes it as data and lets React draw
 * it as real DOM text. Positions are in the fixed canvas design space
 * (GameConfig CANVAS_WIDTH × CANVAS_HEIGHT); the overlay maps them onto the
 * scaled canvas rect. `x`/`y` are the anchor point (see `align`).
 */
export interface BoardLabel {
  id: string;
  text: string;
  /** Anchor X in canvas design pixels (0..CANVAS_WIDTH). */
  x: number;
  /** Anchor Y in canvas design pixels (0..CANVAS_HEIGHT) — always vertical centre. */
  y: number;
  /** Font size in design pixels (scaled with the canvas). */
  size: number;
  /** CSS colour string. */
  color: string;
  /** Degrees clockwise; used for the vertical end-zone names. Default 0. */
  rotation?: number;
  weight?: "normal" | "bold";
  /** Horizontal anchoring of the text around `x`. Default "center". */
  align?: "left" | "center";
  /** 0..1, default 1. */
  opacity?: number;
  /** Letter spacing in design px (for the uppercase section headers). */
  tracking?: number;
  /**
   * Makes this label hoverable: the overlay enables pointer events on it
   * alone and fills/clears the info panel with this subject. Used by the
   * `NO STAFF` placeholder, which is DOM text rather than a Phaser figure.
   */
  hoverInfo?: SidelineCrewInfo;
}
