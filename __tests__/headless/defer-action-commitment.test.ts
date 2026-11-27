import { parseJson } from "../../src/boundary/json";
import { gameSnapshotSchema } from "../../src/boundary/schemas/GameSnapshot";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import {
  serializeGameState,
  deserializeGameState,
  applySnapshotToTeams,
} from "../../src/headless/serialization";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerCondition } from "../../src/types/Player";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

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

const bloodlustScenario = (id: string): Scenario => ({
  id,
  name: id,
  description: id,
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BLOODLUST] },
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
    const blitzerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const otherId = fixtureValue(game.ctx.teams[0].players[1]).id;

    await game.execute({
      type: "declare-action",
      playerId: blitzerId,
      action: "blitz",
    });
    expect(game.snapshot().turn.hasBlitzed).toBe(false);
    expect(game.snapshot().activePlayer?.id).toBe(blitzerId);

    const declared = await game.execute({
      type: "declare-action",
      playerId: otherId,
      action: "move",
    });
    expect(declared.ok).toBe(true);
    expect(declared.snapshot.turn.hasBlitzed).toBe(false);
    expect(declared.snapshot.activePlayer?.id).toBe(otherId);
    expect(declared.snapshot.turn.activatedPlayerIds).not.toContain(blitzerId);
  });

  it("moving commits the Blitz — a later declaration for someone else is refused (5.2)", async () => {
    const game = new HeadlessGame({
      scenario: scenario("commit-on-move"),
      seed: 1,
    });
    const blitzerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const otherId = fixtureValue(game.ctx.teams[0].players[1]).id;

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

  it("a gate-committed declaration refuses ANY redeclare, not just once-per-turn ones", async () => {
    const game = new HeadlessGame({
      scenario: bloodlustScenario("gate-blocks-any-redeclare"),
      seed: 1,
    });
    const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;

    const response = await game.execute({
      type: "declare-action",
      playerId,
      action: "block",
    });
    expect(response.ok).toBe(true);

    if (response.pendingDecision?.type === "reaction") {
      await game.execute({ type: "use-reaction", accept: false });
    }
    expect(game.snapshot().activePlayer).toMatchObject({
      id: playerId,
      action: "block",
      committed: true,
    });

    const redeclared = await game.execute({
      type: "declare-action",
      playerId,
      action: "move",
    });
    expect(redeclared.ok).toBe(false);

    expect(game.snapshot().activePlayer).toMatchObject({
      id: playerId,
      action: "block",
      committed: true,
    });
  });

  it("a player who has moved cannot switch to a Block (that would be a Blitz)", async () => {
    const game = new HeadlessGame({
      scenario: scenario("move-then-block-refused"),
      seed: 1,
    });
    const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;

    await game.execute({ type: "declare-action", playerId, action: "move" });
    await game.execute({
      type: "move",
      playerId,
      path: [{ x: 11, y: 5 }],
    });
    expect(game.ctx.gameService.getMovementUsed(playerId)).toBeGreaterThan(0);

    const redeclared = await game.execute({
      type: "declare-action",
      playerId,
      action: "block",
    });
    expect(redeclared.ok).toBe(false);
    expect(game.snapshot().activePlayer).toMatchObject({
      id: playerId,
      action: "move",
    });
  });

  it("Bone-head fails its gate: Distracted, activation ended, Blitz spent (5.3)", async () => {
    let found: Awaited<ReturnType<HeadlessGame["execute"]>> | null = null;
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const game = new HeadlessGame({
        scenario: boneHeadScenario(`bone-head-${String(seed)}`),
        seed,
      });
      const playerId = fixtureValue(game.ctx.teams[0].players[0]).id;
      await game.execute({
        type: "declare-action",
        playerId,
        action: "blitz",
      });
      const snap = game.snapshot();
      const distracted = fixtureValue(
        fixtureValue(snap.teams[0]).players[0]
      ).conditions.some((c) => c.type === PlayerCondition.DISTRACTED);
      if (distracted) {
        found = { ok: true, events: [], snapshot: snap, pendingDecision: null };
      }
    }
    expect(found).not.toBeNull();
    const snap = fixtureValue(found).snapshot;
    expect(
      fixtureValue(fixtureValue(snap.teams[0]).players[0]).conditions.some(
        (c) => c.type === PlayerCondition.DISTRACTED
      )
    ).toBe(true);
    expect(snap.activePlayer).toBeNull();

    expect(snap.turn.hasBlitzed).toBe(true);
  });

  it("a resumed match with a live uncommitted declaration restores with the allowance intact (5.6)", async () => {
    const game = new HeadlessGame({
      scenario: scenario("resume-mid-declaration"),
      seed: 1,
    });
    const blitzerId = fixtureValue(game.ctx.teams[0].players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: blitzerId,
      action: "blitz",
    });

    const state = game.ctx.gameService.getState();
    expect(state.turn.spend.blitzed).toHaveLength(0);
    const snapshot = serializeGameState(state, [
      game.ctx.teams[0],
      game.ctx.teams[1],
    ]);
    const roundTripped = parseJson(
      JSON.stringify(snapshot),
      gameSnapshotSchema
    );

    const restoredState = deserializeGameState(roundTripped);
    applySnapshotToTeams(roundTripped, [game.ctx.teams[0], game.ctx.teams[1]]);

    expect(restoredState.turn.spend.blitzed).toHaveLength(0);
    expect(restoredState.activePlayer?.id).toBe(blitzerId);
    expect(restoredState.activePlayer?.committed).toBeFalsy();

    const resumed = createHeadlessGame({
      teams: [game.ctx.teams[0], game.ctx.teams[1]],
      initialState: restoredState,
    });
    expect(resumed.gameService.cancelAction(blitzerId)).toBe(true);
    expect(resumed.gameService.getState().turn.spend.blitzed).toHaveLength(0);
    expect(resumed.gameService.getState().activePlayer).toBeNull();
  });

  it("a guest's release is proxied to the host as cancel-action (5.5)", () => {
    const local = createHeadlessGame({
      scenario: scenario("network-release"),
      seed: 1,
    });
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const networked = new NetworkedGameService({
      inner: local.gameService,
      dispatch: dispatch,
      pendingDecision: () => null,
    });

    const playerId = fixtureValue(local.teams[0].players[0]).id;
    const released = networked.cancelAction(playerId);

    expect(released).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: "cancel-action",
      playerId,
    });
  });

  it("a rejected declare-action/cancel-action is surfaced via NetworkCommandRejected (regression: infinite-block desync)", async () => {
    const local = createHeadlessGame({
      scenario: scenario("network-rejection-reconcile"),
      seed: 1,
    });
    const playerId = fixtureValue(local.teams[0].players[0]).id;

    const dispatch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: "command-failed: action-already-committed",
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: "command-failed: illegal-action-declaration",
      })
      .mockResolvedValueOnce({ ok: true });

    const eventBus = new EventBus();
    const rejections: unknown[] = [];
    eventBus.on(GameEventNames.NetworkCommandRejected, (data) => {
      rejections.push(data);
    });

    const networked = new NetworkedGameService({
      inner: local.gameService,
      dispatch: dispatch,
      pendingDecision: () => null,
      eventBus: eventBus,
    });

    expect(networked.cancelAction(playerId)).toBe(true);
    await flushMicrotasks();

    expect(rejections).toEqual([
      {
        commandType: "cancel-action",
        playerId,
        action: undefined,
        reason: "command-failed: action-already-committed",
      },
    ]);

    expect(
      networked.declareAction({ playerId: playerId, action: "blitz" })
    ).toBe(true);
    await flushMicrotasks();

    expect(rejections).toEqual([
      expect.anything(),
      {
        commandType: "declare-action",
        playerId,
        action: "blitz",
        reason: "command-failed: illegal-action-declaration",
      },
    ]);

    expect(
      networked.declareAction({ playerId: playerId, action: "move" })
    ).toBe(true);
    await flushMicrotasks();
    expect(rejections).toHaveLength(2);
  });
});
