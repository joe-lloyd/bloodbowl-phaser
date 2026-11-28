import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { squareAt } from "../../src/game/rules/frames";
import { pairFrame } from "../../src/game/variants/activeMatch";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { type FormationPosition } from "../../src/types/SetupTypes";

const validator = new SetupValidator();

function legalFormation(isTeam1: boolean): FormationPosition[] {
  const frame = pairFrame(isTeam1);
  const { scrimmage } = frame.arm;
  const at = (playerId: string, along: number, y: number) => ({
    playerId,
    ...squareAt(frame, along, y),
  });
  return [
    at("1", scrimmage, 3),
    at("2", scrimmage, 5),
    at("3", scrimmage, 7),
    at("4", scrimmage - 2, 2),
    at("5", scrimmage - 2, 4),
    at("6", scrimmage - 2, 6),
    at("7", scrimmage - 2, 8),
  ];
}

describe("shared Sevens setup geometry", () => {
  it("defines mirrored setup regions including both End Zones and Lines of Scrimmage", () => {
    expect(validator.getSetupZone(true)).toEqual({ minX: 0, maxX: 6, minY: 0, maxY: 10 });
    expect(validator.getSetupZone(false)).toEqual({ minX: 13, maxX: 19, minY: 0, maxY: 10 });
  });
});

describe("SetupValidator", () => {
  it("includes live counts for the checklist and pitch labels", () => {
    const result = validator.validateFormation({
      positions: [
        { playerId: "a", x: 6, y: 3 },
        { playerId: "b", x: 6, y: 5 },
        { playerId: "c", x: 4, y: 0 },
      ],
      isTeam1: true,
      availablePlayerCount: 7,
    });
    expect(
      result.restrictions.find((rule) => rule.id === "line-of-scrimmage")
        ?.summary
    ).toBe("Line of scrimmage 2/3");
    const wide = result.restrictions.find(
      (rule) => rule.id === "wide-zone-limit"
    );
    expect(wide?.summary).toBe("Wide zones: at most 1 each (top 1, bottom 0)");
    expect(wide?.wideZones).toEqual({ top: 1, bottom: 0 });
  });
  it("accepts legal mirrored seven-player formations", () => {
    expect(
      validator.validateFormation({
        positions: legalFormation(true),
        isTeam1: true,
        availablePlayerCount: 11,
      }).valid
    ).toBe(true);
    expect(
      validator.validateFormation({
        positions: legalFormation(false),
        isTeam1: false,
        availablePlayerCount: 11,
      }).valid
    ).toBe(true);
  });

  it("accepts each team's End Zone and rejects every neutral-zone boundary square", () => {
    expect(validator.isInSetupZone(0, 5, pairFrame(true))).toBe(true);
    expect(validator.isInSetupZone(19, 5, pairFrame(false))).toBe(true);
    expect(validator.isInSetupZone(6, 5, pairFrame(true))).toBe(true);
    expect(validator.isInSetupZone(13, 5, pairFrame(false))).toBe(true);
    for (let x = 7; x <= 12; x++) {
      expect(validator.isInSetupZone(x, 5, pairFrame(true))).toBe(false);
      expect(validator.isInSetupZone(x, 5, pairFrame(false))).toBe(false);
    }
  });

  it("names neutral-zone and opponent-side placement refusals", () => {
    const neutral = validator.validatePlacement({
      candidate: { playerId: "1", x: 7, y: 5 },
      currentPositions: [],
      frame: pairFrame(true),
      availablePlayerCount: 7,
    });
    expect(neutral.valid).toBe(false);
    expect(neutral.errors[0]).toContain("between the Lines of Scrimmage");

    const opponent = validator.validatePlacement({
      candidate: { playerId: "1", x: 15, y: 5 },
      currentPositions: [],
      frame: pairFrame(true),
      availablePlayerCount: 7,
    });
    expect(opponent.errors[0]).toContain("own End Zone");
  });

  it("refuses an eighth player with the seven-player maximum message", () => {
    const result = validator.validatePlacement({
      candidate: { playerId: "8", x: 4, y: 5 },
      currentPositions: legalFormation(true),
      frame: pairFrame(true),
      availablePlayerCount: 11,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("A maximum of 7 players may be set up.");
  });

  it("allows one player in each Wide Zone but refuses two in the same one", () => {
    const oneEach = legalFormation(true);
    oneEach[3] = { playerId: "4", x: 4, y: 0 };
    oneEach[4] = { playerId: "5", x: 4, y: 10 };
    expect(
      validator.validateFormation({
        positions: oneEach,
        isTeam1: true,
        availablePlayerCount: 7,
      }).valid
    ).toBe(true);

    const sameWide = legalFormation(true);
    sameWide[3] = { playerId: "4", x: 4, y: 0 };
    sameWide[4] = { playerId: "5", x: 4, y: 1 };
    const result = validator.validateFormation({
      positions: sameWide,
      isTeam1: true,
      availablePlayerCount: 7,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Only one player may be set up in each Wide Zone."
    );
  });

  it("counts only Centre Field squares on the Line of Scrimmage", () => {
    const positions = legalFormation(true);
    positions[2] = { playerId: "3", x: 6, y: 0 };
    const result = validator.validateFormation({
      positions: positions,
      isTeam1: true,
      availablePlayerCount: 7,
    });
    expect(result.valid).toBe(false);
    expect(
      result.restrictions.find((rule) => rule.id === "line-of-scrimmage")
        ?.satisfied
    ).toBe(false);
  });

  it("requires every available player up to seven and leaves extras out", () => {
    expect(
      validator.validateFormation({
        positions: legalFormation(true).slice(0, 6),
        isTeam1: true,
        availablePlayerCount: 11,
      }).valid
    ).toBe(false);
    expect(
      validator.validateFormation({
        positions: legalFormation(true),
        isTeam1: true,
        availablePlayerCount: 11,
      }).valid
    ).toBe(true);
  });

  it("requires exactly the available players for a short team without Swarming", () => {
    const result = validator.validateFormation({
      positions: legalFormation(true).slice(0, 6),
      isTeam1: true,
      availablePlayerCount: 6,
    });
    expect(result.valid).toBe(true);
    expect(
      result.restrictions.find((rule) => rule.id === "required-player-count")
    ).toMatchObject({
      summary: "Players placed 6/6",
      message: "Set up all 6 available players.",
    });
    expect(
      validator.validateFormation({
        positions: legalFormation(true),
        isTeam1: true,
        availablePlayerCount: 6,
      }).valid
    ).toBe(false);
  });

  it("relaxes the three-player rule for two players but still requires both on the line", () => {
    const onLine = [
      { playerId: "1", x: 6, y: 4 },
      { playerId: "2", x: 6, y: 6 },
    ];
    const valid = validator.validateFormation({
      positions: onLine,
      isTeam1: true,
      availablePlayerCount: 2,
    });
    expect(valid.valid).toBe(true);
    expect(
      valid.restrictions.find((rule) => rule.id === "line-of-scrimmage")
        ?.satisfiable
    ).toBe(false);

    const offLine = [fixtureValue(onLine[0]), { playerId: "2", x: 5, y: 6 }];
    const invalid = validator.validateFormation({
      positions: offLine,
      isTeam1: true,
      availablePlayerCount: 2,
    });
    expect(invalid.valid).toBe(false);
    expect(
      invalid.restrictions.find((rule) => rule.id === "short-handed-line")
        ?.satisfied
    ).toBe(false);
  });

  it("returns structured duplicate-square feedback", () => {
    const positions = legalFormation(true);
    positions[6] = { ...fixtureValue(positions[5]), playerId: "7" };
    const result = validator.validateFormation({
      positions: positions,
      isTeam1: true,
      availablePlayerCount: 7,
    });
    expect(result.valid).toBe(false);
    expect(
      result.restrictions.find((rule) => rule.id === "duplicate-square")
        ?.satisfied
    ).toBe(false);
  });

  it("uses the structured formation result for confirmation", () => {
    expect(validator.canConfirmSetup(legalFormation(true), true, 7)).toBe(true);
    expect(
      validator.canConfirmSetup(legalFormation(true).slice(0, 6), true, 7)
    ).toBe(false);
  });
});
