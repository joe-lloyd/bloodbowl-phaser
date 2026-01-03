import { describe, it, expect, beforeEach } from "vitest";
import { FoulController } from "@/game/controllers/FoulController";
import { Player, PlayerStatus } from "@/types/Player";

describe("FoulController", () => {
  let foulController: FoulController;

  beforeEach(() => {
    foulController = new FoulController();
  });

  const mockPlayer = (id: string, st: number, av: number): Player =>
    ({
      id,
      playerName: `Player ${id}`,
      stats: { MA: 6, ST: st, AG: 3, PA: 4, AV: av },
      status: PlayerStatus.ACTIVE,
      teamId: "team-1",
      skills: [],
    }) as any;

  describe("analyzeFoul", () => {
    it("should calculate correct assists and modifier", () => {
      const fouler = mockPlayer("fouler", 3, 8);
      const target = mockPlayer("target", 3, 8);
      target.teamId = "team-2";
      target.gridPosition = { x: 5, y: 5 };
      fouler.gridPosition = { x: 4, y: 5 };

      const assistMatet = mockPlayer("assist", 3, 8);
      assistMatet.gridPosition = { x: 5, y: 4 };

      const analysis = foulController.analyzeFoul(fouler, target, [
        fouler,
        target,
        assistMatet,
      ]);
      expect(analysis.offensiveAssists.length).toBe(1);
      expect(analysis.modifier).toBe(1);
    });
  });

  describe("resolveArmourRoll", () => {
    it("should break armour when total + modifier >= AV", () => {
      const target = mockPlayer("target", 3, 8);
      const rolls = [4, 4]; // 8
      const result = foulController.resolveArmourRoll(target, rolls, 0);
      expect(result.broken).toBe(true);
      expect(result.isNaturalDouble).toBe(true);
    });

    it("should not break armour when total + modifier < AV", () => {
      const target = mockPlayer("target", 3, 8);
      const rolls = [3, 4]; // 7
      const result = foulController.resolveArmourRoll(target, rolls, 0);
      expect(result.broken).toBe(false);
      expect(result.isNaturalDouble).toBe(false);
    });
  });

  describe("resolveInjuryRoll", () => {
    it("should identify doubles correctly", () => {
      expect(foulController.resolveInjuryRoll([5, 5]).isNaturalDouble).toBe(
        true
      );
      expect(foulController.resolveInjuryRoll([4, 5]).isNaturalDouble).toBe(
        false
      );
    });
  });

  describe("resolveArgueTheCall", () => {
    it("should return ejected on a 1", () => {
      expect(foulController.resolveArgueTheCall(1)).toBe("ejected");
    });

    it("should return swayed on a 6", () => {
      expect(foulController.resolveArgueTheCall(6)).toBe("swayed");
    });

    it("should return stay on 2-5", () => {
      expect(foulController.resolveArgueTheCall(3)).toBe("stay");
    });
  });
});
