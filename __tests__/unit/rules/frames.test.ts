import { describe, expect, it } from "vitest";
import recorded from "../../fixtures/frameGeometry.json";
import {
  type Frame,
  inCentreStrip,
  inNoMansLand,
  inOwnHalf,
  inSetupSection,
  onScrimmage,
  pairFrames,
  scoresAt,
  wideZoneOf,
} from "../../../src/game/rules/frames";
import {
  PITCH_LAYOUTS,
  VENUES,
  type Square,
} from "../../../src/game/variants/pitchLayouts";

const flag = (value: boolean) => (value ? "1" : ".");
const WIDE_MARKS = { 0: "t", 1: "b" } as const;

const QUESTIONS = {
  endZone: (frame: Frame, square: Square) => flag(scoresAt(frame, square)),
  setupZone: (frame: Frame, square: Square) =>
    flag(inSetupSection(frame, square)),
  lineOfScrimmage: (frame: Frame, square: Square) =>
    flag(onScrimmage(frame, square)),
  centreScrimmage: (frame: Frame, square: Square) =>
    flag(onScrimmage(frame, square) && inCentreStrip(frame, square)),
  ownHalf: (frame: Frame, square: Square) => flag(inOwnHalf(frame, square)),
  wideZone: (frame: Frame, square: Square) => {
    const zone = wideZoneOf(frame, square);
    return zone === null ? "." : WIDE_MARKS[zone];
  },
  centreRow: (frame: Frame, square: Square) =>
    flag(inCentreStrip(frame, square)),
  neutralZone: (frame: Frame, square: Square) =>
    flag(inNoMansLand(frame, square)),
} as const;

type Question = keyof typeof QUESTIONS;

function answers(venue: (typeof VENUES)[number], seat: 0 | 1, question: Question) {
  const layout = PITCH_LAYOUTS[venue];
  const frame = layout.frames[seat];
  const lines: string[] = [];
  for (let y = 0; y < layout.rows; y++) {
    let line = "";
    for (let x = 0; x < layout.cols; x++) line += QUESTIONS[question](frame, { x, y });
    lines.push(line);
  }
  return lines.join("/");
}

describe("pitch frames", () => {
  it("answer every geometry question the way the old helpers did", () => {
    for (const venue of VENUES) {
      const questions = Object.keys(QUESTIONS).filter(
        (key): key is Question => key in QUESTIONS
      );
      const computed = {
        team1: Object.fromEntries(questions.map((question) => [question, answers(venue, 0, question)])),
        team2: Object.fromEntries(questions.map((question) => [question, answers(venue, 1, question)])),
      };
      expect(computed).toEqual(recorded[venue]);
    }
  });

  it("refuses two Lines of Scrimmage that are not mirror images", () => {
    expect(() =>
      pairFrames({
        cols: 20,
        rows: 11,
        lines: [6, 12],
        centre: { min: 2, max: 8 },
        wide: [
          { min: 0, max: 1 },
          { min: 9, max: 10 },
        ],
      })
    ).toThrow("Lines of Scrimmage at x=6 and x=12 are not mirror images on a pitch 20 long.");
  });
});
