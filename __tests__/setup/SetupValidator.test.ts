import { describe, it, expect, beforeEach } from "vitest";
import { SetupValidator } from "../../src/game/setup/SetupValidator";
import { FormationPosition } from "../../src/types/SetupTypes";

describe("SetupValidator", () => {
  let validator: SetupValidator;

  beforeEach(() => {
    validator = new SetupValidator({ minPlayers: 7, pitchWidth: 20, pitchHeight: 11 });
  });

  describe("isInSetupZone", () => {
    describe("Team 1 (left side, x: 0-6)", () => {
      it("should return true for valid positions", () => {
        expect(validator.isInSetupZone(0, 0, true)).toBe(true);
        expect(validator.isInSetupZone(6, 0, true)).toBe(true); // New boundary
        expect(validator.isInSetupZone(3, 5, true)).toBe(true);
        expect(validator.isInSetupZone(0, 10, true)).toBe(true);
      });

      it("should return false for positions outside x bounds", () => {
        expect(validator.isInSetupZone(7, 0, true)).toBe(false); // New invalid boundary
        expect(validator.isInSetupZone(10, 5, true)).toBe(false);
        expect(validator.isInSetupZone(-1, 0, true)).toBe(false);
      });

      it("should return false for positions outside y bounds", () => {
        expect(validator.isInSetupZone(0, -1, true)).toBe(false);
        expect(validator.isInSetupZone(0, 11, true)).toBe(false);
        expect(validator.isInSetupZone(3, 15, true)).toBe(false);
      });
    });

    describe("Team 2 (right side, x: 13-19)", () => {
      it("should return true for valid positions", () => {
        expect(validator.isInSetupZone(13, 0, false)).toBe(true); // New boundary
        expect(validator.isInSetupZone(19, 0, false)).toBe(true);
        expect(validator.isInSetupZone(17, 5, false)).toBe(true);
        expect(validator.isInSetupZone(14, 10, false)).toBe(true);
      });

      it("should return false for positions outside x bounds", () => {
        expect(validator.isInSetupZone(12, 0, false)).toBe(false); // New invalid boundary
        expect(validator.isInSetupZone(10, 5, false)).toBe(false);
        expect(validator.isInSetupZone(20, 0, false)).toBe(false);
      });

      it("should return false for positions outside y bounds", () => {
        expect(validator.isInSetupZone(14, -1, false)).toBe(false);
        expect(validator.isInSetupZone(14, 11, false)).toBe(false);
        expect(validator.isInSetupZone(17, 15, false)).toBe(false);
      });
    });
  });

  describe("getSetupZone", () => {
    it("should return correct zone for Team 1", () => {
      const zone = validator.getSetupZone(true);
      expect(zone).toEqual({
        minX: 0,
        maxX: 6, // Updated
        minY: 0,
        maxY: 10,
      });
    });

    it("should return correct zone for Team 2", () => {
      const zone = validator.getSetupZone(false);
      expect(zone).toEqual({
        minX: 13, // Updated
        maxX: 19,
        minY: 0,
        maxY: 10,
      });
    });
  });

  describe("canConfirmSetup", () => {
    it("should allow confirm with exactly 7 players", () => {
      expect(validator.canConfirmSetup(7, 10)).toBe(true);
    });

    it("should allow confirm with more than 7 players", () => {
      expect(validator.canConfirmSetup(8, 10)).toBe(true);
      expect(validator.canConfirmSetup(11, 11)).toBe(true);
    });

    it("should not allow confirm with less than 7 players when players available", () => {
      expect(validator.canConfirmSetup(6, 5)).toBe(false);
      expect(validator.canConfirmSetup(3, 10)).toBe(false);
      expect(validator.canConfirmSetup(0, 11)).toBe(false);
    });

    it("should allow confirm with no players left in dugout (even if less than 7)", () => {
      expect(validator.canConfirmSetup(5, 0)).toBe(true);
      expect(validator.canConfirmSetup(3, 0)).toBe(true);
      expect(validator.canConfirmSetup(0, 0)).toBe(true);
    });
  });

  describe("validateFormation", () => {
    it("should validate a correct formation", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
        { playerId: "3", x: 2, y: 2 },
        { playerId: "4", x: 3, y: 3 },
        { playerId: "5", x: 4, y: 4 },
        { playerId: "6", x: 5, y: 5 },
        { playerId: "7", x: 6, y: 6 }, // Using boundary column 6
      ];

      const result = validator.validateFormation(positions, true);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject formation with less than 7 players", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
      ];

      const result = validator.validateFormation(positions, true);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Formation must have at least 7 players");
    });

    it("should reject formation with duplicate positions", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 0, y: 0 }, // Duplicate
        { playerId: "3", x: 1, y: 1 },
        { playerId: "4", x: 2, y: 2 },
        { playerId: "5", x: 3, y: 3 },
        { playerId: "6", x: 4, y: 4 },
        { playerId: "7", x: 5, y: 5 },
      ];

      const result = validator.validateFormation(positions, true);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate position"))).toBe(
        true
      );
    });

    it("should reject formation with positions outside setup zone", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
        { playerId: "3", x: 2, y: 2 },
        { playerId: "4", x: 3, y: 3 },
        { playerId: "5", x: 4, y: 4 },
        { playerId: "6", x: 5, y: 5 },
        { playerId: "7", x: 10, y: 6 }, // Outside Team 1 zone (10 > 6)
      ];

      const result = validator.validateFormation(positions, true);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("outside setup zone"))).toBe(
        true
      );
    });

    it("should validate Team 2 formation correctly", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 13, y: 0 }, // minX
        { playerId: "2", x: 15, y: 1 },
        { playerId: "3", x: 16, y: 2 },
        { playerId: "4", x: 17, y: 3 },
        { playerId: "5", x: 18, y: 4 },
        { playerId: "6", x: 19, y: 5 }, // maxX
        { playerId: "7", x: 14, y: 6 },
      ];

      const result = validator.validateFormation(positions, false);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("isPositionOccupied", () => {
    it("should return true if position is occupied", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
      ];

      expect(validator.isPositionOccupied(0, 0, positions)).toBe(true);
      expect(validator.isPositionOccupied(1, 1, positions)).toBe(true);
    });

    it("should return false if position is not occupied", () => {
      const positions: FormationPosition[] = [
        { playerId: "1", x: 0, y: 0 },
        { playerId: "2", x: 1, y: 1 },
      ];

      expect(validator.isPositionOccupied(2, 2, positions)).toBe(false);
      expect(validator.isPositionOccupied(5, 5, positions)).toBe(false);
    });

    it("should return false for empty positions array", () => {
      expect(validator.isPositionOccupied(0, 0, [])).toBe(false);
    });
  });
});
