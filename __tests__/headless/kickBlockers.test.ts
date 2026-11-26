import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  applySnapshotToTeams,
  deserializeGameState,
} from "../../src/headless/serialization";
import { gameSnapshotSchema } from "../../src/boundary/schemas/GameSnapshot";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { kickoffScenario } from "./kickoffKicks";
import { settle } from "./kickoffRehearsal";

async function touchbackWaiting() {
  for (let seed = 1; seed < 400; seed++) {
    const game = new HeadlessGame({ scenario: kickoffScenario, seed });
    let response = await game.execute({
      type: "kick-ball",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      x: 19,
      y: 0,
    });
    if (response.pendingDecision?.type === "kickoff-event")
      response = await game.execute({ type: "kickoff-skip" });
    if (response.pendingDecision?.type === "touchback") return game;
  }
  throw new Error("no seed gives a touchback");
}

describe("a resync around a touchback", () => {
  it("lets the rejoining peer choose who takes the ball", async () => {
    const game = await touchbackWaiting();
    const peer = new HeadlessGame({ matchSave: game.matchSave() });
    peer.adoptPending(game.pendingDecision());
    const taken = await peer.execute({
      type: "touchback",
      playerId: fixtureValue(peer.ctx.team2.players[1]).id,
    });
    expect(taken.ok).toBe(true);
  });

  it("clears the old choice from a peer that still had it", async () => {
    const peer = await touchbackWaiting();
    const ahead = new HeadlessGame({ matchSave: peer.matchSave() });
    ahead.adoptPending(peer.pendingDecision());
    const snapshot = structuredClone(peer.snapshot());
    if (snapshot.kick) snapshot.kick.touchbackTeamId = null;
    Object.assign(peer.ctx.gameService.getState(), deserializeGameState(snapshot));
    peer.adoptPending(null);
    expect(peer.ctx.gameService.isTouchbackPending()).toBe(false);
    peer.ctx.gameService.resetDriveState();
    const state = peer.ctx.gameService.getState();
    state.phase = GamePhase.KICKOFF;
    state.activeTeamId = "team2";
    const kicked = await peer.execute({
      type: "kick-ball",
      playerId: fixtureValue(peer.ctx.team1.players[0]).id,
      x: 14,
      y: 5,
    });
    expect(kicked.ok).toBe(true);
  });
});

describe("an online reload during a later drive's Charge", () => {
  it("gives the first turn to the team that received this kick", async () => {
    const game = new HeadlessGame({ scenario: kickoffScenario, seed: 1 });
    const gs = game.ctx.gameService;
    gs.startGame("team1");
    gs.resetDriveState();
    for (const [team, x] of [[game.ctx.team1, 5], [game.ctx.team2, 14]] as const)
      for (const [index, player] of team.players.slice(0, 7).entries()) {
        player.gridPosition = { x, y: index + 2 };
        player.status = "Active";
      }
    const state = gs.getState();
    state.phase = GamePhase.KICKOFF;
    state.subPhase = SubPhase.ROLL_KICKOFF;
    state.activeTeamId = "team1";
    void gs.rehearseKickoffEvent({
      event: KickoffEvent.CHARGE,
      isTeam1Kicking: false,
      landing: { x: 3, y: 5 },
      selectionLimit: 1,
    });
    await settle();
    await game.execute({ type: "kickoff-select-player", playerId: fixtureValue(game.ctx.team2.players[1]).id });
    await game.execute({ type: "kickoff-confirm" });

    const snapshot = gameSnapshotSchema.parse(structuredClone(game.snapshot()));
    const teams = [structuredClone(game.ctx.team1), structuredClone(game.ctx.team2)] as const;
    applySnapshotToTeams(snapshot, [...teams]);
    const restored = new HeadlessGame({
      team1: teams[0],
      team2: teams[1],
      initialState: deserializeGameState(snapshot),
      ...(snapshot.turnManager && { turnManagerState: snapshot.turnManager }),
      kickingTeamId: snapshot.turnManager?.driveKickingTeamId ?? null,
      seed: 1,
    });
    await restored.execute({ type: "end-turn" });
    await settle();
    expect(restored.snapshot()).toMatchObject({ phase: "PLAY", activeTeamId: "team1" });
  });
});
