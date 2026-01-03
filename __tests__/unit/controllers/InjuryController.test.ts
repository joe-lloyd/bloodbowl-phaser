import { describe, it, expect } from "vitest";
import {
  InjuryController,
  InjuryResult,
  CasualtyType,
} from "@/game/controllers/InjuryController";
import { Player } from "@/types/Player";

describe("InjuryController", () => {
  const controller = new InjuryController();
  const mockPlayer = {} as Player;

  describe("getInjuryResult", () => {
    it("should return STUNNED for rolls 2-7", () => {
      expect(controller.getInjuryResult(mockPlayer, 2)).toBe(
        InjuryResult.STUNNED
      );
      expect(controller.getInjuryResult(mockPlayer, 7)).toBe(
        InjuryResult.STUNNED
      );
    });

    it("should return KO for rolls 8-9", () => {
      expect(controller.getInjuryResult(mockPlayer, 8)).toBe(InjuryResult.KO);
      expect(controller.getInjuryResult(mockPlayer, 9)).toBe(InjuryResult.KO);
    });

    it("should return CASUALTY for rolls 10-12", () => {
      expect(controller.getInjuryResult(mockPlayer, 10)).toBe(
        InjuryResult.CASUALTY
      );
      expect(controller.getInjuryResult(mockPlayer, 12)).toBe(
        InjuryResult.CASUALTY
      );
    });
  });

  describe("getCasualtyResult", () => {
    it("should return BADLY_HURT for rolls 1-8", () => {
      expect(controller.getCasualtyResult(1)).toBe(CasualtyType.BADLY_HURT);
      expect(controller.getCasualtyResult(8)).toBe(CasualtyType.BADLY_HURT);
    });

    it("should return SERIOUSLY_HURT for rolls 9-10", () => {
      expect(controller.getCasualtyResult(9)).toBe(CasualtyType.SERIOUSLY_HURT);
      expect(controller.getCasualtyResult(10)).toBe(
        CasualtyType.SERIOUSLY_HURT
      );
    });

    it("should return SERIOUS_INJURY for rolls 11-12", () => {
      expect(controller.getCasualtyResult(11)).toBe(
        CasualtyType.SERIOUS_INJURY
      );
      expect(controller.getCasualtyResult(12)).toBe(
        CasualtyType.SERIOUS_INJURY
      );
    });

    it("should return LASTING_INJURY for rolls 13-14", () => {
      expect(controller.getCasualtyResult(13)).toBe(
        CasualtyType.LASTING_INJURY
      );
      expect(controller.getCasualtyResult(14)).toBe(
        CasualtyType.LASTING_INJURY
      );
    });

    it("should return DEAD for rolls 15-16", () => {
      expect(controller.getCasualtyResult(15)).toBe(CasualtyType.DEAD);
      expect(controller.getCasualtyResult(16)).toBe(CasualtyType.DEAD);
    });
  });
});
