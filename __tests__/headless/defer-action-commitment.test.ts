import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import {
  serializeGameState,
  deserializeGameState,
  applySnapshotToTeams,
} from "../../src/headless/serialization";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { CommandResponse } from "../../src/headless/protocol";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition } from "../../src/types/Player";

const scenario = (id: string): Scenario => ({
  id,
  name: id,
  description: id,
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    turn: 1,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});

const boneHeadScenario = (id: string): Scenario => ({
  id,
  name: id,
  description: id,
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BONE_HEAD] },
      // A second player so ending the Bone Head player's activation does not
      // also end team1's whole turn (which would reset the turn flags).
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    turn: 1,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});

describe("defer-action-commitment", () => {
  it("declaring a Blitz does not spend the team's Blitz (5.1)", async () => {
    const game = new HeadlessGame({
      scenario: scenario("declare-only"),
      seed: 1,
    });
    const blitzerId = game.ctx.team1.players[0].id;
    const otherId = game.ctx.team1.players[1].id;

    await game.execute({
      type: "declare-action",
      playerId: blitzerId,
      action: "blitz",
    });
    expect(game.snapshot().turn.hasBlitzed).toBe(false);
    expect(game.snapshot().activePlayer?.id).toBe(blitzerId);

    // Activating someone else instead releases the uncommitted Blitz.
    const declared = await game.execute({
      type: "declare-action",
      playerId: otherId,
      action: "move",
    });
    expect(declared.ok).toBe(true);
    expect(declared.snapshot.turn.hasBlitzed).toBe(false);
    expect(declared.snapshot.activePlayer?.id).toBe(otherId);
    expect(declared.snapshot.turn.activatedPlayerIds).not.toContain(
      blitzerId
    );
  });

  it("moving commits the Blitz — a later declaration for someone else is refused (5.2)", async () => {
    const game = new HeadlessGame({
      scenario: scenario("commit-on-move"),
      seed: 1,
    });
    const blitzerId = game.ctx.team1.players[0].id;
    const otherId = game.ctx.team1.players[1].id;

    await game.execute({
      type: "declare-action",
      playerId: blitzerId,
      action: "blitz",
    });
    await game.execute({
      type: "move",
      playerId: blitzerId,
      path: [{ x: 11, y: 5 }],
    });
    // The first square moved commits the declaration.
    expect(game.snapshot().turn.hasBlitzed).toBe(true);

    const refused = await game.execute({
      type: "declare-action",
      playerId: otherId,
      action: "move",
    });
    expect(refused.ok).toBe(false);
    expect(refused.snapshot.turn.hasBlitzed).toBe(true);
    expect(refused.snapshot.activePlayer?.id).toBe(blitzerId);
  });

  it("Bone-head fails its gate: Distracted, activation ended, Blitz spent (5.3)", async () => {
    let found: Awaited<ReturnType<HeadlessGame["execute"]>> | null = null;
    let playerId = "";
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const game = new HeadlessGame({
        scenario: boneHeadScenario(`bone-head-${seed}`),
        seed,
      });
      playerId = game.ctx.team1.players[0].id;
      await game.execute({
        type: "declare-action",
        playerId,
        action: "blitz",
      });
      const snap = game.snapshot();
      const distracted = snap.teams[0].players[0].conditions?.some(
        (c) => c.type === PlayerCondition.DISTRACTED
      );
      if (distracted) {
        found = { ok: true, events: [], snapshot: snap, pendingDecision: null };
      }
    }
    expect(found).not.toBeNull();
    const snap = found!.snapshot;
    expect(
      snap.teams[0].players[0].conditions?.some(
        (c) => c.type === PlayerCondition.DISTRACTED
      )
    ).toBe(true);
    expect(snap.activePlayer).toBeNull();
    // A failed Bone Head still spends the team's Blitz for the turn.
    expect(snap.turn.hasBlitzed).toBe(true);
  });

  it("a resumed match with a live uncommitted declaration restores with the allowance intact (5.6)", async () => {
    const game = new HeadlessGame({
      scenario: scenario("resume-mid-declaration"),
      seed: 1,
    });
    const blitzerId = game.ctx.team1.players[0].id;

    await game.execute({
      type: "declare-action",
      playerId: blitzerId,
      action: "blitz",
    });

    const state = game.ctx.gameService.getState();
    expect(state.turn.hasBlitzed).toBe(false);
    const snapshot = serializeGameState(state, [
      game.ctx.team1,
      game.ctx.team2,
    ]);
    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    const restoredState = deserializeGameState(roundTripped);
    applySnapshotToTeams(roundTripped, [game.ctx.team1, game.ctx.team2]);

    // The saved flag was never set (the declaration was uncommitted), and
    // the restored state still shows a live, releasable declaration.
    expect(restoredState.turn.hasBlitzed).toBe(false);
    expect(restoredState.activePlayer?.id).toBe(blitzerId);
    expect(restoredState.activePlayer?.committed).toBeFalsy();

    const resumed = createHeadlessGame({
      team1: game.ctx.team1,
      team2: game.ctx.team2,
      initialState: restoredState,
    });
    expect(resumed.gameService.cancelAction(blitzerId)).toBe(true);
    expect(resumed.gameService.getState().turn.hasBlitzed).toBe(false);
    expect(resumed.gameService.getState().activePlayer).toBeNull();
  });

  it("a guest's release is proxied to the host as cancel-action (5.5)", async () => {
    const local = createHeadlessGame({
      scenario: scenario("network-release"),
      seed: 1,
    });
    const dispatch = vi
      .fn()
      .mockResolvedValue({ ok: true } as CommandResponse);
    const networked = new NetworkedGameService(
      local.gameService,
      dispatch,
      () => null
    );

    const playerId = local.team1.players[0].id;
    const released = networked.cancelAction(playerId);

    expect(released).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: "cancel-action",
      playerId,
    });
  });
});
