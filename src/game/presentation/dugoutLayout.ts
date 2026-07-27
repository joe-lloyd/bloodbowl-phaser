import { GameConfig } from "../../config/GameConfig";

/**
 * Column budget: `reservesCols` alone must cover MAX_ROSTER_SIZE (11, see
 * GameConfig) pre-kickoff, so it never shrinks. KO and Casualty gave up one
 * column each (10→8 slots — still generous; KO turnover is frequent and a
 * roster capped at 11 realistically never has more than a handful of
 * simultaneous casualties) to make room for Sent Off without pushing the
 * dugout's `totalWidth` past what the fixed Phaser canvas can show — see the
 * "stays on-canvas" test in pitchThemes.test.ts, which is the real invariant
 * this budget must keep satisfying.
 */
export const DUGOUT_LAYOUT = {
  gridRows: 2,
  squareSize: GameConfig.SQUARE_SIZE,
  reservesCols: 6,
  koCols: 4,
  casualtyCols: 4,
  sentOffCols: 1,
  sectionPad: 20,
  staffWidth: 180,
  gridOffsetX: 10,
  gridOffsetY: 15,
} as const;

export function getDugoutLayout(mirrored: boolean) {
  const reservesWidth =
    DUGOUT_LAYOUT.reservesCols * DUGOUT_LAYOUT.squareSize +
    DUGOUT_LAYOUT.sectionPad;
  const koWidth =
    DUGOUT_LAYOUT.koCols * DUGOUT_LAYOUT.squareSize + DUGOUT_LAYOUT.sectionPad;
  const casualtyWidth =
    DUGOUT_LAYOUT.casualtyCols * DUGOUT_LAYOUT.squareSize +
    DUGOUT_LAYOUT.sectionPad;
  const sentOffWidth =
    DUGOUT_LAYOUT.sentOffCols * DUGOUT_LAYOUT.squareSize +
    DUGOUT_LAYOUT.sectionPad;
  const sectionsWidth = reservesWidth + koWidth + casualtyWidth + sentOffWidth;
  const sectionsX = mirrored ? DUGOUT_LAYOUT.staffWidth : 0;

  return {
    totalWidth: sectionsWidth + DUGOUT_LAYOUT.staffWidth,
    staffX: mirrored ? 0 : sectionsWidth,
    sections: {
      reserves: {
        x:
          sectionsX +
          (mirrored ? casualtyWidth + koWidth + sentOffWidth : 0),
        width: reservesWidth,
      },
      ko: {
        x: sectionsX + (mirrored ? casualtyWidth + sentOffWidth : reservesWidth),
        width: koWidth,
      },
      casualty: {
        x: sectionsX + (mirrored ? sentOffWidth : reservesWidth + koWidth),
        width: casualtyWidth,
      },
      sentOff: {
        x: sectionsX + (mirrored ? 0 : reservesWidth + koWidth + casualtyWidth),
        width: sentOffWidth,
      },
    },
  } as const;
}
