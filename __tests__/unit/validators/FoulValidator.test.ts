import { describe, it, expect } from "vitest";
import { FoulValidator } from "@/game/validators/FoulValidator";
import { Player, PlayerStatus } from "@/types/Player";

describe("FoulValidator", () => {
  const validator = new FoulValidator();

  const mockPlayer = (
    id: string,
    teamId: string,
    x: number,
    y: number
  ): Player =>
    ({
      id,
      teamId,
      gridPosition: { x, y },
      status: PlayerStatus.ACTIVE,
      skills: [],
    }) as any;

  it("should calculate positive modifier for offensive assists", () => {
    const fouler = mockPlayer("fouler", "T1", 5, 5);
    const target = mockPlayer("target", "T2", 6, 5);
    const assister = mockPlayer("assist", "T1", 6, 6); // Adjacent to target

    const analysis = validator.analyzeFoul(fouler, target, [
      fouler,
      target,
      assister,
    ]);
    expect(analysis.modifier).toBe(1);
    expect(analysis.offensiveAssists).toContain(assister);
  });

  it("should calculate negative modifier for defensive assists", () => {
    const fouler = mockPlayer("fouler", "T1", 5, 5);
    const target = mockPlayer("target", "T2", 6, 5);
    const defAssister = mockPlayer("assist", "T2", 5, 6); // Adjacent to fouler

    const analysis = validator.analyzeFoul(fouler, target, [
      fouler,
      target,
      defAssister,
    ]);
    expect(analysis.modifier).toBe(-1);
    expect(analysis.defensiveAssists).toContain(defAssister);
  });

  it("should ignore marked assisters", () => {
    const fouler = mockPlayer("fouler", "T1", 5, 5);
    const target = mockPlayer("target", "T2", 6, 5);
    const assister = mockPlayer("assist", "T1", 6, 6);
    const marker = mockPlayer("marker", "T2", 7, 6); // Adjacent to assister

    const analysis = validator.analyzeFoul(fouler, target, [
      fouler,
      target,
      assister,
      marker,
    ]);
    expect(analysis.modifier).toBe(0);
    expect(analysis.offensiveAssists).not.toContain(assister);
  });
});
