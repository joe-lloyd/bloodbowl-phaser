import { z } from "zod";
import { describe, it, expect } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { type Scenario } from "../../../src/types/Scenario";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { session } from "./harness";

function stalling(width: number): Scenario {
  return {
    id: "stalling-bottle",
    name: "Stalling bottle",
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: width - 4, y: 3, hasBall: true },
        { playerIndex: 1, x: width - 5, y: 3 },
      ],
      team2Placements: [{ playerIndex: 0, x: 2, y: 1 }],
      activeTeam: "team1",
      turn: 4,
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };
}

async function stall(gameType: GameType, width: number, dice: number[]) {
  const s = session(gameType, stalling(width), dice);
  await s.run({
    type: "declare-action",
    playerId: s.player(1).id,
    action: "move",
  });
  await s.run({ type: "end-activation", playerId: s.player(1).id });
  const turnovers = s
    .dataOf("ui:turnover", z.object({ reason: z.string() }))
    .map((t) => t.reason);
  return { ...s, turnovers };
}

describe("GB-M13: a stalling player is hit by a bottle", () => {
  it("on a 2 the bottle hits and the player makes an Injury roll, with no Armour roll", async () => {
    const s = await stall("gutter-bowl", 26, [2, 3, 4]);
    expect(s.rolls().slice(0, 2)).toEqual([
      "Crowd Takes Action (Human Lineman #1): 2",
      "Injury Roll (Human Lineman #1): 3 + 4 = 7",
    ]);
    expect(s.armour()).toEqual([]);
    expect(s.player(1).status).toBe(PlayerStatus.STUNNED);
    expect(s.turnovers).toEqual(["The Crowd Takes Action"]);
  });

  it("on a 1 the bottle misses", async () => {
    const s = await stall("gutter-bowl", 26, [1]);
    expect(s.rolls()).toEqual(["Crowd Takes Action (Human Lineman #1): 1"]);
    expect(s.player(1).status).toBe(PlayerStatus.ACTIVE);
    expect(s.turnovers).toEqual([]);
  });

  it("Sevens still needs the turn number: a 2 on turn 4 misses", async () => {
    const s = await stall("sevens", 20, [2]);
    expect(s.rolls()).toEqual(["Crowd Takes Action (Human Lineman #1): 2"]);
    expect(s.player(1).status).toBe(PlayerStatus.ACTIVE);
    expect(s.turnovers).toEqual([]);
  });
});
