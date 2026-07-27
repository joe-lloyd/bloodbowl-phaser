import { GameConfig } from "../../config/GameConfig";

export const DUGOUT_LAYOUT = {
  gridRows: 2,
  squareSize: GameConfig.SQUARE_SIZE,
  reservesCols: 6,
  koCols: 5,
  casualtyCols: 5,
  sentOffCols: 2,
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
