import { describe, expect, it } from "vitest";
import {
  getLineOfScrimmageX,
  getSevensSetupZone,
  getWideZone,
  isCentreFieldRow,
  isNeutralZoneX,
  SEVENS_GEOMETRY,
} from "../../src/config/GameConfig";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import { FormationPosition } from "../../src/types/SetupTypes";

const validator = new SetupValidator();

function legalFormation(isTeam1: boolean): FormationPosition[] {
  const los = getLineOfScrimmageX(isTeam1);
  const depth = isTeam1 ? los - 2 : los + 2;
  return [
    { playerId: "1", x: los, y: 3 },
    { playerId: "2", x: los, y: 5 },
    { playerId: "3", x: los, y: 7 },
    { playerId: "4", x: depth, y: 2 },
    { playerId: "5", x: depth, y: 4 },
    { playerId: "6", x: depth, y: 6 },
    { playerId: "7", x: depth, y: 8 },
  ];
}

describe("shared Sevens setup geometry", () => {
  it("defines mirrored setup regions including both End Zones and Lines of Scrimmage", () => {
    expect(getSevensSetupZone(true)).toEqual({ minX: 0, maxX: 6 });
    expect(getSevensSetupZone(false)).toEqual({ minX: 13, maxX: 19 });
    expect(SEVENS_GEOMETRY.END_ZONE_X).toEqual({ team1: 0, team2: 19 });
    expect(getLineOfScrimmageX(true)).toBe(6);
    expect(getLineOfScrimmageX(false)).toBe(13);
  });

  it("shares neutral, centre-field and Wide Zone boundary helpers", () => {
    expect(isNeutralZoneX(6)).toBe(false);
    expect(isNeutralZoneX(7)).toBe(true);
    expect(isNeutralZoneX(12)).toBe(true);
    expect(isNeutralZoneX(13)).toBe(false);
    expect(isCentreFieldRow(2)).toBe(true);
    expect(isCentreFieldRow(8)).toBe(true);
    expect(isCentreFieldRow(1)).toBe(false);
    expect(getWideZone(0)).toBe("top");
    expect(getWideZone(1)).toBe("top");
    expect(getWideZone(9)).toBe("bottom");
    expect(getWideZone(10)).toBe("bottom");
    expect(getWideZone(5)).toBeNull();
  });
});

describe("SetupValidator", () => {
  it("accepts legal mirrored seven-player formations", () => {
    expect(
      validator.validateFormation(legalFormation(true), true, 11).valid
    ).toBe(true);
    expect(
      validator.validateFormation(legalFormation(false), false, 11).valid
    ).toBe(true);
  });

  it("accepts each team's End Zone and rejects every neutral-zone boundary square", () => {
    expect(validator.isInSetupZone(0, 5, true)).toBe(true);
    expect(validator.isInSetupZone(19, 5, false)).toBe(true);
    expect(validator.isInSetupZone(6, 5, true)).toBe(true);
    expect(validator.isInSetupZone(13, 5, false)).toBe(true);
    for (let x = 7; x <= 12; x++) {
      expect(validator.isInSetupZone(x, 5, true)).toBe(false);
      expect(validator.isInSetupZone(x, 5, false)).toBe(false);
    }
  });

  it("names neutral-zone and opponent-side placement refusals", () => {
    const neutral = validator.validatePlacement(
      { playerId: "1", x: 7, y: 5 },
      [],
      true,
      7
    );
    expect(neutral.valid).toBe(false);
    expect(neutral.errors[0]).toContain("between the Lines of Scrimmage");

    const opponent = validator.validatePlacement(
      { playerId: "1", x: 15, y: 5 },
      [],
      true,
      7
    );
    expect(opponent.errors[0]).toContain("own End Zone");
  });

  it("refuses an eighth player with the seven-player maximum message", () => {
    const result = validator.validatePlacement(
      { playerId: "8", x: 4, y: 5 },
      legalFormation(true),
      true,
      11
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("A maximum of 7 players may be set up.");
  });

  it("allows one player in each Wide Zone but refuses two in the same one", () => {
    const oneEach = legalFormation(true);
    oneEach[3] = { playerId: "4", x: 4, y: 0 };
    oneEach[4] = { playerId: "5", x: 4, y: 10 };
    expect(validator.validateFormation(oneEach, true, 7).valid).toBe(true);

    const sameWide = legalFormation(true);
    sameWide[3] = { playerId: "4", x: 4, y: 0 };
    sameWide[4] = { playerId: "5", x: 4, y: 1 };
    const result = validator.validateFormation(sameWide, true, 7);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Only one player may be set up in each Wide Zone."
    );
  });

  it("counts only Centre Field squares on the Line of Scrimmage", () => {
    const positions = legalFormation(true);
    positions[2] = { playerId: "3", x: 6, y: 0 };
    const result = validator.validateFormation(positions, true, 7);
    expect(result.valid).toBe(false);
    expect(
      result.restrictions.find((rule) => rule.id === "line-of-scrimmage")
        ?.satisfied
    ).toBe(false);
  });

  it("requires every available player up to seven and leaves extras out", () => {
    expect(
      validator.validateFormation(legalFormation(true).slice(0, 6), true, 11)
        .valid
    ).toBe(false);
    expect(
      validator.validateFormation(legalFormation(true), true, 11).valid
    ).toBe(true);
  });

  it("relaxes the three-player rule for two players but still requires both on the line", () => {
    const onLine = [
      { playerId: "1", x: 6, y: 4 },
      { playerId: "2", x: 6, y: 6 },
    ];
    const valid = validator.validateFormation(onLine, true, 2);
    expect(valid.valid).toBe(true);
    expect(
      valid.restrictions.find((rule) => rule.id === "line-of-scrimmage")
        ?.satisfiable
    ).toBe(false);

    const offLine = [onLine[0], { playerId: "2", x: 5, y: 6 }];
    const invalid = validator.validateFormation(offLine, true, 2);
    expect(invalid.valid).toBe(false);
    expect(
      invalid.restrictions.find((rule) => rule.id === "short-handed-line")
        ?.satisfied
    ).toBe(false);
  });

  it("returns structured duplicate-square feedback", () => {
    const positions = legalFormation(true);
    positions[6] = { ...positions[5], playerId: "7" };
    const result = validator.validateFormation(positions, true, 7);
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
