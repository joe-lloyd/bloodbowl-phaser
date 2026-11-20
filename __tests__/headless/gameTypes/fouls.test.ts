import { z } from "zod";
import { describe, it, expect } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { duel, session } from "./harness";

async function foul(gameType: GameType, dice: number[]) {
  const s = session(
    gameType,
    duel([{}], [{ status: PlayerStatus.PRONE }]),
    dice
  );
  await s.run({
    type: "declare-action",
    playerId: s.player(1).id,
    action: "foul",
  });
  await s.run({ type: "foul", playerId: s.player(1).id, x: 11, y: 3 });
  const turnovers = () =>
    s.dataOf("ui:turnover", z.object({ reason: z.string() })).map((t) => t.reason);
  const foulArmour = () =>
    s.rolls().filter((r) => r.includes("Foul Armour Roll"));
  return { ...s, turnovers, foulArmour };
}

describe("SB-M11, GB-M11: no referee", () => {
  it("Sevens still sends off a fouler who rolls a double", async () => {
    const s = await foul("sevens", [3, 3, 1]);
    expect(s.player(1).status).toBe(PlayerStatus.REMOVED);
  });

  it("Gutter Bowl sends nobody off for a double", async () => {
    const s = await foul("gutter-bowl", [3, 3]);
    expect(s.player(1).status).toBe(PlayerStatus.ACTIVE);
    expect(s.turnovers()).toEqual([]);
  });

  it("Street Bowl sends nobody off for a double, and the crowd misses on a 3", async () => {
    const s = await foul("street-bowl", [3, 3, 3]);
    expect(s.player(1).status).toBe(PlayerStatus.ACTIVE);
    expect(s.armour()).toHaveLength(1);
    expect(s.turnovers()).toEqual([]);
  });

  it("Street Bowl: a rock on a 4 that breaks armour injures the fouler and is a Turnover", async () => {
    const s = await foul("street-bowl", [1, 2, 4, 4, 4, 3, 4]);
    expect(s.armour()).toEqual([
      { roll: 3, broken: false },
      { roll: 9, broken: true },
    ]);
    expect(s.player(1).status).toBe(PlayerStatus.STUNNED);
    expect(s.turnovers()).toEqual(["Hit by a Rock"]);
  });

  it("Street Bowl: a rock that does not break armour leaves the fouler standing", async () => {
    const s = await foul("street-bowl", [1, 2, 6, 3, 4]);
    expect(s.armour()).toEqual([
      { roll: 3, broken: false },
      { roll: 8, broken: false },
    ]);
    expect(s.player(1).status).toBe(PlayerStatus.ACTIVE);
    expect(s.turnovers()).toEqual([]);
  });
});

describe("BB-M9: sand in the face", () => {
  it("on a 4 the fouler is Knocked Down, it is a Turnover, and the Foul never happens", async () => {
    const s = await foul("beach-bowl", [4, 2, 2]);
    expect(s.player(1).status).toBe(PlayerStatus.PRONE);
    expect(s.foulArmour()).toEqual([]);
    expect(s.armour()).toEqual([{ roll: 5, broken: false }]);
    expect(s.turnovers()).toEqual(["Sand in the Face"]);
  });

  it("on a 3 the Foul goes ahead with the sand's +1 to the Armour roll", async () => {
    const s = await foul("beach-bowl", [3, 3, 5]);
    expect(s.player(1).status).toBe(PlayerStatus.ACTIVE);
    expect(s.foulArmour()).toHaveLength(1);
    expect(s.armour()[0]).toEqual({ roll: 9, broken: true });
  });
});
