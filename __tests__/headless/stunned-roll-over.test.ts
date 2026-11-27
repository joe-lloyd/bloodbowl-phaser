import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

const scenario: Scenario = {
  id: "stunned-roll-over",
  name: "Stunned roll over",
  description: "team 2 has a Stunned player when its turn starts",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 5, y: 7 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 15, y: 5, status: PlayerStatus.STUNNED },
      { playerIndex: 1, x: 15, y: 7 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 1 },
  },
};

describe("a Stunned player", () => {
  it("stays Stunned through their team's turn and rolls over at its end", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const stunned = game.ctx.teams[1].players[0];

    const team2Turn = await game.execute({ type: "end-turn" });
    expect(team2Turn.snapshot.activeTeamId).toBe(game.ctx.teams[1].id);
    expect(fixtureValue(stunned).status).toBe(PlayerStatus.STUNNED);
    const declined = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(stunned).id,
      action: "move",
    });
    expect(declined.ok).toBe(false);

    const team1Turn = await game.execute({ type: "end-turn" });
    expect(team1Turn.snapshot.activeTeamId).toBe(game.ctx.teams[0].id);
    expect(fixtureValue(stunned).status).toBe(PlayerStatus.PRONE);
  });

  it("who was Stunned during their own turn does not roll over at its end", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    await game.execute({ type: "end-turn" });

    const latecomer = game.ctx.teams[1].players[1];
    fixtureValue(latecomer).status = PlayerStatus.STUNNED;

    await game.execute({ type: "end-turn" });
    expect(fixtureValue(latecomer).status).toBe(PlayerStatus.STUNNED);
    expect(fixtureValue(game.ctx.teams[1].players[0]).status).toBe(
      PlayerStatus.PRONE
    );

    await game.execute({ type: "end-turn" });
    expect(fixtureValue(latecomer).status).toBe(PlayerStatus.STUNNED);
    await game.execute({ type: "end-turn" });
    expect(fixtureValue(latecomer).status).toBe(PlayerStatus.PRONE);
  });

  it("on the other team is untouched when the opponents' turn ends", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    await game.execute({ type: "end-turn" });

    const victim = game.ctx.teams[0].players[0];
    fixtureValue(victim).status = PlayerStatus.STUNNED;

    await game.execute({ type: "end-turn" });
    expect(fixtureValue(victim).status).toBe(PlayerStatus.STUNNED);
    await game.execute({ type: "end-turn" });
    expect(fixtureValue(victim).status).toBe(PlayerStatus.PRONE);
  });
});
