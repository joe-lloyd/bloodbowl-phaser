import { playerWith } from "./controllerFixtures";
import { describe, it, expect } from "vitest";
import { ArmourController } from "@/game/controllers/ArmourController";
import { type Player } from "@/types/Player";

const mockPlayer = (): Player =>
  playerWith(({
    stats: { AV: 9 },
  }));

describe("ArmourController", () => {
  const controller = new ArmourController();

  it("should break armour if roll is equal to AV", () => {
    const player = mockPlayer();
    expect(controller.isArmourBroken(player, 9)).toBe(true);
  });

  it("should break armour if roll exceeds AV", () => {
    const player = mockPlayer();
    expect(controller.isArmourBroken(player, 10)).toBe(true);
  });

  it("should NOT break armour if roll is less than AV", () => {
    const player = mockPlayer();
    expect(controller.isArmourBroken(player, 8)).toBe(false);
  });
});
