import { describe, it, expect } from "vitest";
import { ArmourController } from "@/game/controllers/ArmourController";
import { Player } from "@/types/Player";

describe("ArmourController", () => {
  const controller = new ArmourController();

  const mockPlayer = (av: number): Player =>
    ({
      stats: { AV: av },
    }) as Player;

  it("should break armour if roll is equal to AV", () => {
    const player = mockPlayer(9);
    expect(controller.isArmourBroken(player, 9)).toBe(true);
  });

  it("should break armour if roll exceeds AV", () => {
    const player = mockPlayer(9);
    expect(controller.isArmourBroken(player, 10)).toBe(true);
  });

  it("should NOT break armour if roll is less than AV", () => {
    const player = mockPlayer(9);
    expect(controller.isArmourBroken(player, 8)).toBe(false);
  });
});
