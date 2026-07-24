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

/** Place up to 7 unplaced eligible players on their setup line. */
async function placeTeam(game: HeadlessGame, teamId: string): Promise<void> {
  const zone = game.ctx.gameService.getSetupZone(teamId)!;
  const snap = game.snapshot();
  const team = snap.teams.find((t) => t.id === teamId)!;
  const eligible = team.players.filter(
    (p) => p.status === "Active" || p.status === "Reserve"
  );
  const toPlace = eligible.filter((p) => !p.position).slice(0, 7);
  const occupied = new Set(
    snap.teams
      .flatMap((t) => t.players)
      .filter((p) => p.position)
      .map((p) => `${p.position!.x},${p.position!.y}`)
  );
  const isTeam1 = teamId === snap.teams[0].id;
  const lineX = isTeam1 ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += isTeam1 ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${x},${y}`)) continue;
      const r = await game.execute({
        type: "place-player",
        playerId: toPlace[placed].id,
        x,
        y,
      });
      if (r.ok) {
        occupied.add(`${x},${y}`);
        placed++;
      }
    }
  }
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

  it("scores a touchdown on a catch made in the end zone", async () => {
    const catchScenario: Scenario = {
      id: "td-catch",
      name: "TD catch",
      description: "receiver standing in the end zone catches a pass",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 15, y: 5 }, // thrower with ball
          { playerIndex: 1, x: 19, y: 5 }, // receiver in the end zone
        ],
        team2Placements: [{ playerIndex: 0, x: 10, y: 9 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 15, y: 5 },
      },
    };

    let scored = false;
    for (let seed = 1; seed <= 60 && !scored; seed++) {
      const game = new HeadlessGame({ scenario: catchScenario, seed });
      const thrower = game.snapshot().teams[0].players[0];

      await game.execute({
        type: "declare-action",
        playerId: thrower.id,
        action: "pass",
      });
      const response = await game.execute({
        type: "pass",
        playerId: thrower.id,
        x: 19,
        y: 5,
      });
      if (!response.ok) continue;

      const caught = response.events.some(
        (e) =>
          e.name === GameEventNames.UI_Notification &&
          e.data === "Catch Successful!"
      );
      if (!caught) continue;

      scored = true;
      expect(
        response.events.some((e) => e.name === GameEventNames.Touchdown)
      ).toBe(true);
      expect(response.snapshot.score[game.snapshot().teams[0].id]).toBe(1);
      expect(response.snapshot.phase).toBe(GamePhase.SETUP);
    }
    expect(scored).toBe(true);
  });

  it("resets any player left prone when the drive ends (no lingering prone orientation)", async () => {
    // A player left Prone renders rotated 90°; the end-of-drive teardown must
    // clear that state so nothing carries the rotation into the next drive.
    // The sprite orientation is derived from status, so at the model level the
    // regression is: no player survives the drive still Prone.
    const game = new HeadlessGame({ scenario: tdScenario, seed: 3 });
    const proneVictim = game.ctx.team2.players[0];
    proneVictim.status = PlayerStatus.PRONE;

    const response = await scoreTouchdown(game);
    expect(response.ok).toBe(true);

    const everyone = response.snapshot.teams.flatMap((t) => t.players);
    expect(everyone.some((p) => p.status === "Prone")).toBe(false);
    // The prone player specifically returned to Reserves, upright.
    expect(game.ctx.gameService.getPlayerById(proneVictim.id)!.status).toBe(
      PlayerStatus.RESERVE
    );
  });

  it("leaves the ball interactable where it lands after the second-half kickoff", async () => {
    // Regression for the reported "stuck ball" after the second-half kickoff:
    // the receiving team must be able to move to and attempt to pick it up,
    // identically to the first half.
    const game = new HeadlessGame({ scenario: tdScenario, seed: 5 });
    const [team1Id, team2Id] = game.snapshot().teams.map((t) => t.id);

    // Run the first half to halftime (team1 kicked; team2 kicks the second).
    game.ctx.gameService.startGame(team1Id);
    for (let i = 0; i < 12; i++) await game.execute({ type: "end-turn" });

    let snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.SETUP);
    expect(snap.turn.isHalf2).toBe(true);

    // Second-half setup: kicking team, then receiving team.
    await placeTeam(game, snap.activeTeamId!);
    await game.execute({ type: "confirm-setup", teamId: snap.activeTeamId! });
    snap = game.snapshot();
    await placeTeam(game, snap.activeTeamId!);
    await game.execute({ type: "confirm-setup", teamId: snap.activeTeamId! });
    snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.KICKOFF);

    // team2 kicks deep into team1's half so the ball actually lands on pitch.
    const kicker = snap.teams
      .find((t) => t.id === team2Id)!
      .players.find((p) => p.position)!;
    const kicked = await game.execute({
      type: "kick-ball",
      playerId: kicker.id,
      x: 18,
      y: 5,
    });
    expect(kicked.ok).toBe(true);

    snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.PLAY);
    // The ball rests on the pitch (not a touchback, not stuck/null).
    expect(snap.ballPosition).not.toBeNull();
    expect(game.ctx.gameService.isTouchbackPending()).toBe(false);

    // The receiving team can act — a player can be moved toward the ball.
    const legal = await game.execute({ type: "legal-actions" });
    const movers =
      legal.legalActions!.players.filter((p) => p.actions.includes("move")) ??
      [];
    expect(movers.length).toBeGreaterThan(0);
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
