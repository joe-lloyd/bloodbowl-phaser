import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

describe("HeadlessGame action protocol", () => {
  it("rejects malformed commands without touching state", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 21 });
    const before = JSON.stringify(game.snapshot());

    const unknownType = await game.execute({ type: "cast-fireball" });
    expect(unknownType.ok).toBe(false);
    expect(unknownType.reason).toContain("unknown-command-type");

    const missingField = await game.execute({ type: "move", playerId: "x" });
    expect(missingField.ok).toBe(false);
    expect(missingField.reason).toContain("path");

    const notAnObject = await game.execute("end-turn");
    expect(notAnObject.ok).toBe(false);

    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it("answers state and legal-actions queries", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 22 });

    const state = await game.execute({ type: "state" });
    expect(state.ok).toBe(true);
    expect(state.snapshot.ballPosition).toEqual({ x: 5, y: 5 });

    const legal = await game.execute({ type: "legal-actions" });
    expect(legal.ok).toBe(true);
    expect(legal.legalActions).toBeDefined();
    expect(legal.legalActions!.players.length).toBeGreaterThan(0);
    // Every enumerated player can at least move
    for (const p of legal.legalActions!.players) {
      expect(p.actions).toContain("move");
    }
  });

  it("runs post-match SPP choices through the deterministic protocol", async () => {
    const game = new HeadlessGame({
      startingPhase: GamePhase.GAME_OVER,
      progressionEnabled: true,
      seed: 24,
    });
    const nominees = game.ctx.team1.players.slice(0, 6);
    nominees.forEach((player, index) =>
      game.ctx.eventBus.emit(GameEventNames.PlayerPlaced, {
        playerId: player.id,
        x: index,
        y: 1,
      })
    );

    const mvp = await game.execute({
      type: "award-mvp",
      teamId: game.ctx.team1.id,
      nominatedPlayerIds: nominees.map((player) => player.id),
    });
    expect(mvp.ok).toBe(true);
    const mvpEvent = mvp.events.find(
      (event) => event.name === GameEventNames.MvpAwarded
    );
    expect(mvpEvent?.data).toMatchObject({
      teamId: game.ctx.team1.id,
      roll: expect.any(Number),
    });

    const touchdown = await game.execute({
      type: "assign-awarded-touchdown",
      playerId: nominees[0].id,
    });
    expect(touchdown.ok).toBe(true);
    expect(
      touchdown.events.some(
        (event) => event.name === GameEventNames.AwardedTouchdownAssigned
      )
    ).toBe(true);

    const summary = game.ctx.matchStats.summary(game.ctx.team1.players);
    expect(
      summary.players.find((entry) => entry.playerId === nominees[0].id)
        ?.touchdowns
    ).toBe(1);
    expect(
      summary.players.reduce((total, entry) => total + entry.mvps, 0)
    ).toBe(1);
  });

  it("enumerated moves execute successfully (enumerate→execute consistency)", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 23 });

    const legal = await game.execute({ type: "legal-actions" });
    const someone = legal.legalActions!.players[0];

    const detailed = await game.execute({
      type: "legal-actions",
      playerId: someone.playerId,
    });
    const withTargets = detailed.legalActions!.players.find(
      (p) => p.playerId === someone.playerId
    )!;
    expect(withTargets.moveTargets!.length).toBeGreaterThan(0);

    const declared = await game.execute({
      type: "declare-action",
      playerId: someone.playerId,
      action: "move",
    });
    expect(declared.ok).toBe(true);

    // Pick an adjacent enumerated target so a 1-step path is valid
    const start = game
      .snapshot()
      .teams.flatMap((t) => t.players)
      .find((p) => p.id === someone.playerId)!.position!;
    const adjacent = withTargets.moveTargets!.find(
      (t) => Math.abs(t.x - start.x) <= 1 && Math.abs(t.y - start.y) <= 1
    )!;
    expect(adjacent).toBeDefined();

    const moved = await game.execute({
      type: "move",
      playerId: someone.playerId,
      path: [adjacent],
    });
    expect(moved.ok).toBe(true);
    const after = moved.snapshot.teams
      .flatMap((t) => t.players)
      .find((p) => p.id === someone.playerId)!;
    expect(after.position).toEqual(adjacent);
  });

  it("runs the full block decision chain via pendingDecision", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 24 });
    const snapshot = game.snapshot();
    const team1Id = snapshot.teams[0].id;
    const attacker = snapshot.teams[0].players.find(
      (p) => p.position?.x === 9 && p.position?.y === 5
    )!;
    const defender = snapshot.teams[1].players.find(
      (p) => p.position?.x === 10 && p.position?.y === 5
    )!;
    expect(snapshot.activeTeamId).toBe(team1Id);

    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });

    const rolled = await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    expect(rolled.ok).toBe(true);
    expect(rolled.pendingDecision?.type).toBe("block-dice");
    expect(
      rolled.pendingDecision!.type === "block-dice" &&
        rolled.pendingDecision.options.length
    ).toBeGreaterThan(0);
    expect(
      rolled.events.some((e) => e.name === GameEventNames.BlockDiceRolled)
    ).toBe(true);

    // Commands are gated while the decision is pending
    const gated = await game.execute({ type: "end-turn" });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toContain("decision-pending");

    // Resolve the chain: die choice, then possibly push + follow-up
    let response = await game.execute({
      type: "choose-block-result",
      index: 0,
    });
    expect(response.ok).toBe(true);

    if (response.pendingDecision?.type === "push-direction") {
      const dir = response.pendingDecision.options[0];
      response = await game.execute({
        type: "choose-push-direction",
        x: dir.x,
        y: dir.y,
      });
      expect(response.ok).toBe(true);
    }
    if (response.pendingDecision?.type === "follow-up") {
      response = await game.execute({
        type: "choose-follow-up",
        followUp: true,
      });
      expect(response.ok).toBe(true);
    }
    expect(response.pendingDecision).toBeNull();
  });

  it("rejects decision replies when nothing is pending", async () => {
    const game = new HeadlessGame({ scenario: scrimmage, seed: 25 });
    const reply = await game.execute({
      type: "choose-block-result",
      index: 0,
    });
    expect(reply.ok).toBe(false);
    expect(reply.reason).toContain("no-decision-pending");
  });

  it("executes a pass through the protocol", async () => {
    const passScenario: Scenario = {
      id: "pass-test",
      name: "Pass test",
      description: "thrower with ball passes to a teammate",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 5, y: 5 },
          { playerIndex: 1, x: 8, y: 5 },
        ],
        team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 5, y: 5 },
      },
    };

    // Find a seed whose pass command is accepted, then assert the events
    let done = false;
    for (let seed = 1; seed <= 30 && !done; seed++) {
      const game = new HeadlessGame({ scenario: passScenario, seed });
      const thrower = game.snapshot().teams[0].players[0];

      await game.execute({
        type: "declare-action",
        playerId: thrower.id,
        action: "pass",
      });
      const response = await game.execute({
        type: "pass",
        playerId: thrower.id,
        x: 8,
        y: 5,
      });
      if (!response.ok) continue;

      expect(
        response.events.some(
          (e) =>
            e.name === GameEventNames.PassAttempted ||
            e.name === GameEventNames.PassCompleted ||
            e.name === GameEventNames.PassFumbled
        )
      ).toBe(true);
      done = true;
    }
    expect(done).toBe(true);
  });

  it("executes a foul with armour roll through the protocol", async () => {
    const foulScenario: Scenario = {
      id: "foul-test",
      name: "Foul test",
      description: "fouler stands over a prone opponent",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 9, y: 5 }],
        team2Placements: [
          { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
    };

    const game = new HeadlessGame({ scenario: foulScenario, seed: 8 });
    const snapshot = game.snapshot();
    const fouler = snapshot.teams[0].players[0];

    const legal = await game.execute({
      type: "legal-actions",
      playerId: fouler.id,
    });
    const entry = legal.legalActions!.players.find(
      (p) => p.playerId === fouler.id
    )!;
    expect(entry.actions).toContain("foul");
    expect(entry.foulTargets).toContain(snapshot.teams[1].players[0].id);

    await game.execute({
      type: "declare-action",
      playerId: fouler.id,
      action: "foul",
    });
    const response = await game.execute({
      type: "foul",
      playerId: fouler.id,
      x: 10,
      y: 5,
    });
    expect(response.ok).toBe(true);
    expect(
      response.events.some((e) => e.name === GameEventNames.DiceRoll)
    ).toBe(true);
  });

  it("reports a turnover with reason when a pickup fails", async () => {
    // Deterministically find a seed whose pickup roll fails, then assert the
    // protocol reports the turnover and switches the active team.
    let reported = false;
    for (let seed = 1; seed <= 60 && !reported; seed++) {
      const game = new HeadlessGame({ scenario: scrimmage, seed });
      const snapshot = game.snapshot();
      const mover = snapshot.teams[0].players.find(
        (p) => p.position?.x === 9 && p.position?.y === 5
      )!;

      await game.execute({
        type: "declare-action",
        playerId: mover.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: mover.id,
        path: [
          { x: 8, y: 5 },
          { x: 7, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 5 }, // ball square
        ],
      });
      if (!moved.ok) continue;

      const turnover = moved.events.find(
        (e) => e.name === GameEventNames.Turnover
      );
      if (turnover) {
        reported = true;
        // The turnover flow ends the turn: the opponent becomes active
        expect(moved.snapshot.activeTeamId).toBe(snapshot.teams[1].id);
      }
    }
    expect(reported).toBe(true);
  });
});
