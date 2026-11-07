import { describe, it, expect, beforeEach } from "vitest";
import { CatchController } from "../../../src/game/controllers/CatchController";
import { Player, PlayerStatus } from "../../../src/types/Player";

describe("CatchController", () => {
  let controller: CatchController;
  /** Two standing opponents Marking (5,5). */
  const marking = [
    { id: "opp1", gridPosition: { x: 5, y: 6 }, status: PlayerStatus.ACTIVE },
    { id: "opp2", gridPosition: { x: 6, y: 6 }, status: PlayerStatus.ACTIVE },
  ] as Player[];

  beforeEach(() => {
    controller = new CatchController();
  });

  describe("Catch Modifiers", () => {
    it("should apply -1 modifier for bounce", () => {
      expect(controller.calculateModifiers({ x: 5, y: 5 }, [], true)).toBe(-1);
    });

    it("should apply -1 modifier for throw-in", () => {
      expect(
        controller.calculateModifiers({ x: 5, y: 5 }, [], false, true)
      ).toBe(-1);
    });

    it("should apply -1 per marking opponent", () => {
      expect(controller.calculateModifiers({ x: 5, y: 5 }, marking)).toBe(-2);
    });

    it("should stack modifiers correctly", () => {
      // -1 bounce, -2 marking
      expect(controller.calculateModifiers({ x: 5, y: 5 }, marking, true)).toBe(
        -3
      );
    });
  });

  describe("Count Marking Opponents", () => {
    it("should count adjacent active opponents", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 5, y: 6 }, // Adjacent
          status: PlayerStatus.ACTIVE,
        } as Player,
        {
          id: "opp2",
          gridPosition: { x: 6, y: 6 }, // Adjacent diagonal
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(2);
    });

    it("should not count prone opponents", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 5, y: 6 },
          status: PlayerStatus.PRONE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });

    it("should not count distant opponents", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 8, y: 8 }, // Too far
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });

    it("should not count opponent on same square", () => {
      const opponents: Player[] = [
        {
          id: "opp1",
          gridPosition: { x: 5, y: 5 }, // Same square
          status: PlayerStatus.ACTIVE,
        } as Player,
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });
  });
});
