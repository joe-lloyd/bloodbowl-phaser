import { playerWith } from "./controllerFixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { CatchController } from "../../../src/game/controllers/CatchController";
import { type Player, PlayerStatus } from "../../../src/types/Player";

describe("CatchController", () => {
  let controller: CatchController;

  const marking = [playerWith({ id: "opp1", gridPosition: { x: 5, y: 6 }, status: PlayerStatus.ACTIVE }), playerWith({ id: "opp2", gridPosition: { x: 6, y: 6 }, status: PlayerStatus.ACTIVE })];

  beforeEach(() => {
    controller = new CatchController();
  });

  describe("Catch Modifiers", () => {
    it("should apply -1 modifier for bounce", () => {
      expect(controller.calculateModifiers({ position: { x: 5,y: 5 },opponents: [],isBounce: true })).toBe(-1);
    });

    it("should apply -1 modifier for throw-in", () => {
      expect(
        controller.calculateModifiers({ position: { x: 5,y: 5 },opponents: [],isBounce: false,isThrowIn: true })
      ).toBe(-1);
    });

    it("should apply -1 per marking opponent", () => {
      expect(controller.calculateModifiers({ position: { x: 5,y: 5 },opponents: marking })).toBe(-2);
    });

    it("should stack modifiers correctly", () => {
      expect(controller.calculateModifiers({ position: { x: 5,y: 5 },opponents: marking,isBounce: true })).toBe(
        -3
      );
    });
  });

  describe("Count Marking Opponents", () => {
    it("should count adjacent active opponents", () => {
      const opponents: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 5, y: 6 },
          status: PlayerStatus.ACTIVE,
        }),
        playerWith({
          id: "opp2",
          gridPosition: { x: 6, y: 6 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(2);
    });

    it("should not count prone opponents", () => {
      const opponents: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 5, y: 6 },
          status: PlayerStatus.PRONE,
        }),
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });

    it("should not count distant opponents", () => {
      const opponents: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 8, y: 8 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });

    it("should not count opponent on same square", () => {
      const opponents: Player[] = [
        playerWith({
          id: "opp1",
          gridPosition: { x: 5, y: 5 },
          status: PlayerStatus.ACTIVE,
        }),
      ];

      const count = controller.countMarkingOpponents({ x: 5, y: 5 }, opponents);
      expect(count).toBe(0);
    });
  });
});
