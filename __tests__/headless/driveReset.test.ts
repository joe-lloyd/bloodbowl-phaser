import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";

/** Carrier two squares from the end zone; walking in scores. */
const tdScenario: Scenario = {
  id: "td-drive-reset",
  name: "TD drive reset",
  description: "carrier walks into the end zone",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 15, y: 3 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 13, y: 9 },
      { playerIndex: 1, x: 14, y: 2, status: PlayerStatus.STUNNED },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 17, y: 5 },
  },
};

async function scoreTouchdown(game: HeadlessGame) {
  const carrier = game.snapshot().teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: carrier.id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: carrier.id,
    path: [
      { x: 18, y: 5 },
      { x: 19, y: 5 },
    ],
  });
}

describe("drive reset", () => {
  it("clears the pitch after a touchdown: dugouts, no ball, placements reset", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 3 });
    const response = await scoreTouchdown(game);
    expect(response.ok).toBe(true);

    const snap = response.snapshot;
    const everyone = snap.teams.flatMap((t) => t.players);
    expect(everyone.every((p) => p.position === null)).toBe(true);
    expect(snap.ballPosition).toBeNull();
    // Standing/prone/stunned all return to Reserves
    expect(
      everyone
        .filter((p) => p.status !== "KO" && p.status !== "Injured")
        .every((p) => p.status === "Reserve")
    ).toBe(true);

    // Placement bookkeeping reset: setup is not complete until re-placed
    expect(game.ctx.gameService.isSetupComplete(snap.teams[0].id)).toBe(false);
  });

  it("rolls KO recovery with per-player events and correct outcomes", async () => {
    let sawRecovered = false;
    let sawStuckOut = false;

    for (let seed = 1; seed <= 40 && !(sawRecovered && sawStuckOut); seed++) {
      const game = new HeadlessGame({ scenario: tdScenario, seed });
      // Knock two players out before the drive ends
      game.ctx.team1.players[3].status = PlayerStatus.KO;
      game.ctx.team2.players[3].status = PlayerStatus.KO;

      const response = await scoreTouchdown(game);
      const rolls = response.events.filter(
        (e) => e.name === GameEventNames.KORecoveryRolled
      );
      expect(rolls).toHaveLength(2);

      for (const event of rolls) {
        const data = event.data as {
          playerId: string;
          roll: number;
          recovered: boolean;
        };
        expect(data.recovered).toBe(data.roll >= 4);
        const player = game.ctx.gameService.getPlayerById(data.playerId)!;
        if (data.recovered) {
          expect(player.status).toBe(PlayerStatus.RESERVE);
          sawRecovered = true;
        } else {
          expect(player.status).toBe(PlayerStatus.KO);
          sawStuckOut = true;
        }
      }
    }
    expect(sawRecovered).toBe(true);
    expect(sawStuckOut).toBe(true);
  });

  it("scoring team kicks the next drive, with no coin flip", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 4 });
    const scorerTeamId = game.snapshot().teams[0].id;
    const response = await scoreTouchdown(game);

    expect(response.snapshot.phase).toBe(GamePhase.SETUP);
    expect(response.snapshot.subPhase).toBe(SubPhase.SETUP_KICKING);
    expect(response.snapshot.activeTeamId).toBe(scorerTeamId);
    expect(
      response.events.some(
        (e) =>
          e.name === GameEventNames.DriveEnded &&
          (e.data as { reason: string }).reason === "touchdown"
      )
    ).toBe(true);

    const flip = await game.execute({ type: "coin-flip" });
    expect(flip.ok).toBe(false);
    expect(flip.reason).toContain("coin-flip-only-before-first-drive");
  });

  it("halftime swaps the kicking team, resets turns, and clears the pitch", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 5 });
    const [team1Id, team2Id] = game.snapshot().teams.map((t) => t.id);

    // team1 kicked off the first half
    game.ctx.gameService.startGame(team1Id);

    // Burn through all 6 turns per team
    let halftimeResponse;
    for (let i = 0; i < 12; i++) {
      halftimeResponse = await game.execute({ type: "end-turn" });
    }

    const snap = halftimeResponse!.snapshot;
    expect(snap.phase).toBe(GamePhase.SETUP);
    expect(snap.subPhase).toBe(SubPhase.SETUP_KICKING);
    // First-half receiver (team2) kicks the second half
    expect(snap.activeTeamId).toBe(team2Id);
    expect(snap.turn.isHalf2).toBe(true);
    expect(
      halftimeResponse!.events.some(
        (e) =>
          e.name === GameEventNames.DriveEnded &&
          (e.data as { reason: string }).reason === "halftime"
      )
    ).toBe(true);
    // Pitch cleared at halftime too
    expect(
      snap.teams.flatMap((t) => t.players).every((p) => p.position === null)
    ).toBe(true);
    expect(snap.ballPosition).toBeNull();
  });
});
