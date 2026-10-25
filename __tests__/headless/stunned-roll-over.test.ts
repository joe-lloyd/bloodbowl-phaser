import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

/**
 * 2025 rulebook, Stunned: "At the end of each team's turn, any players on
 * their team that started that turn Stunned will automatically roll over
 * and become Prone". "any player that became Stunned during the course of
 * their team's turn will not roll over as they did not start their team's
 * turn as Stunned". The engine rolled them over at the START of the turn.
 */
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
    const stunned = game.ctx.team2.players[0];

    const team2Turn = await game.execute({ type: "end-turn" });
    expect(team2Turn.snapshot.activeTeamId).toBe(game.ctx.team2.id);
    expect(stunned.status).toBe(PlayerStatus.STUNNED);
    const declined = await game.execute({
      type: "declare-action",
      playerId: stunned.id,
      action: "move",
    });
    expect(declined.ok).toBe(false);

    const team1Turn = await game.execute({ type: "end-turn" });
    expect(team1Turn.snapshot.activeTeamId).toBe(game.ctx.team1.id);
    expect(stunned.status).toBe(PlayerStatus.PRONE);
  });

  it("who was Stunned during their own turn does not roll over at its end", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    await game.execute({ type: "end-turn" });
    // A team 2 player goes down Stunned during team 2's own turn.
    const latecomer = game.ctx.team2.players[1];
    latecomer.status = PlayerStatus.STUNNED;

    await game.execute({ type: "end-turn" });
    expect(latecomer.status).toBe(PlayerStatus.STUNNED);
    expect(game.ctx.team2.players[0].status).toBe(PlayerStatus.PRONE);

    // Team 2's next turn starts with them Stunned, so it ends with them Prone.
    await game.execute({ type: "end-turn" });
    expect(latecomer.status).toBe(PlayerStatus.STUNNED);
    await game.execute({ type: "end-turn" });
    expect(latecomer.status).toBe(PlayerStatus.PRONE);
  });

  it("on the other team is untouched when the opponents' turn ends", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    await game.execute({ type: "end-turn" });
    // Team 1 player Stunned during team 2's turn (say, by a Block).
    const victim = game.ctx.team1.players[0];
    victim.status = PlayerStatus.STUNNED;

    await game.execute({ type: "end-turn" });
    expect(victim.status).toBe(PlayerStatus.STUNNED);
    await game.execute({ type: "end-turn" });
    expect(victim.status).toBe(PlayerStatus.PRONE);
  });
});
