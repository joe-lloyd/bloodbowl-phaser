import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";

/**
 * A Foul's Injury Roll ends with its Casualty Roll, and the player leaves
 * the pitch, before the referee sends the fouler off. The Casualty used to
 * wait behind the Send-off, so a Bribe or Argue the Call choice opened
 * while the victim still lay on the pitch, Injured.
 */
async function foul(seed: number) {
  const game = new HeadlessGame({
    seed,
    scenario: {
      id: "foul-casualty",
      name: "Foul a prone player",
      description: "",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
        team2Placements: [
          { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    },
  });
  const fouler = game.ctx.team1.players[0];
  await game.execute({
    type: "declare-action",
    playerId: fouler.id,
    action: "foul",
  });
  const response = await game.execute({
    type: "foul",
    playerId: fouler.id,
    x: 11,
    y: 5,
  });
  const leaving = response.events
    .filter((e) => e.name === GameEventNames.PlayerStatusChanged)
    .map((e) =>
      (e.data as { id: string }).id === fouler.id ? "fouler" : "victim"
    );
  const casualty = response.events.some(
    (e) => e.name === GameEventNames.PlayerCasualtyInflicted
  );
  return { casualty, sentOff: fouler.status !== PlayerStatus.ACTIVE, leaving };
}

describe("a Foul that causes a Casualty and is spotted", () => {
  it("takes the victim off the pitch before the fouler is sent off", async () => {
    let seen = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { casualty, sentOff, leaving } = await foul(seed);
      if (!casualty || !sentOff) continue;
      seen++;
      expect(leaving.lastIndexOf("victim"), `seed ${seed}`).toBeLessThan(
        leaving.indexOf("fouler")
      );
    }
    expect(seen).toBeGreaterThanOrEqual(3);
  });
});
