import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { enumerateLegalActions } from "../../src/headless/legalActions";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement, Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";
import { choose, rehearse } from "./kickoffRehearsal";

function gameWith(placement: Partial<PlayerPlacement> = {}) {
  const scenario: Scenario = {
    id: "base-move-engine",
    name: "Base move engine",
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, stats: { AG: 2 }, ...placement },
        { playerIndex: 1, x: 2, y: 9 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
        { playerIndex: 1, x: 10, y: 4 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
  const game = new HeadlessGame({ scenario, seed: 4 });
  const playerId = fixtureValue(game.ctx.team1.players[0]).id;
  return { game, playerId };
}

describe("one movement phase in the engine", () => {
  it.each(["block", "stab", "throwBomb"] as const)(
    "refuses to move or jump during a declared %s",
    async (action) => {
      const { game, playerId } = gameWith({
        skills: [SkillType.STAB, SkillType.BOMBARDIER],
      });
      await game.execute({ type: "declare-action", playerId, action });
      const jump = await game.execute({ type: "jump", playerId, x: 12, y: 5 });
      const move = await game.execute({
        type: "move",
        playerId,
        path: [{ x: 9, y: 5 }],
      });
      expect([jump.ok, move.ok]).toEqual([false, false]);
      expect(game.ctx.gameService.getPlayerById(playerId)?.gridPosition).toEqual({
        x: 10,
        y: 5,
      });
    }
  );

  it("jumps after the block of a Blitz while movement remains", async () => {
    const { game, playerId } = gameWith();
    const defenderId = fixtureValue(game.ctx.team2.players[1]).id;
    await game.execute({ type: "declare-action", playerId, action: "blitz" });
    forceDice(game.ctx.rng, [3, 3, 3, 6, 6, 6]);
    await game.execute({ type: "block", attackerId: playerId, defenderId });
    for (let i = 0; i < 6 && game.pendingDecision(); i++) {
      const pending = game.pendingDecision();
      if (pending?.type === "block-dice")
        await game.execute({ type: "choose-block-result", index: 0 });
      else if (pending?.type === "push-direction")
        await game.execute({ type: "choose-push-direction", x: 10, y: 3 });
      else if (pending?.type === "follow-up")
        await game.execute({ type: "choose-follow-up", followUp: false });
    }
    expect(game.ctx.gameService.hasUsedBlitzBlock(playerId)).toBe(true);
    const jumped = await game.execute({ type: "jump", playerId, x: 12, y: 5 });
    expect(jumped.ok).toBe(true);
    expect(game.ctx.gameService.getPlayerById(playerId)?.gridPosition).toEqual({
      x: 12,
      y: 5,
    });
    expect(game.ctx.gameService.getMovementUsed(playerId)).toBe(3);
  });

  it("refuses a jump that the Blitz block left no movement for", async () => {
    const { game, playerId } = gameWith({ stats: { AG: 2, MA: 1 } });
    await game.execute({ type: "declare-action", playerId, action: "blitz" });
    game.ctx.gameService.getState().turn.movementUsed.set(playerId, 2);
    const jump = await game.execute({ type: "jump", playerId, x: 12, y: 5 });
    expect(jump.ok).toBe(false);
  });

  it("rolls two Rushes, never three, for a Sprinter's last jump", async () => {
    const { game, playerId } = gameWith({
      stats: { AG: 2, MA: 5 },
      skills: [SkillType.SPRINT],
    });
    await game.execute({ type: "declare-action", playerId, action: "move" });
    game.ctx.gameService.getState().turn.movementUsed.set(playerId, 6);
    forceDice(game.ctx.rng, [6, 6, 6, 1]);
    const { events } = await game.execute({ type: "jump", playerId, x: 12, y: 5 });
    expect(events.filter(({ name }) => name === "diceRoll")).toHaveLength(3);
  });

  it("offers a prone player Move and no Stand Up action", () => {
    const { game, playerId } = gameWith({ status: PlayerStatus.PRONE });
    const entry = enumerateLegalActions({ ctx: game.ctx, pending: null }).players.find((p) => p.playerId === playerId);
    expect(entry?.actions).toContain("move");
    expect(entry?.actions).not.toContain("standUp");
  });

  it("jumps in a Charge! turn's Blitz and still blocks", async () => {
    const { game, gs, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 1,
    });
    const blitzer = home(1);
    const from = fixtureValue(blitzer.gridPosition);
    blitzer.stats.AG = 2;
    away(1).gridPosition = { x: from.x + 1, y: from.y };
    away(1).status = PlayerStatus.PRONE;
    away(2).gridPosition = { x: from.x + 3, y: from.y };
    await choose(game, [blitzer.id]);
    const declared = await game.execute({
      type: "declare-action",
      playerId: blitzer.id,
      action: "blitz",
    });
    expect(declared.ok).toBe(true);
    forceDice(game.ctx.rng, [6, 6]);
    const jumped = await game.execute({
      type: "jump",
      playerId: blitzer.id,
      x: from.x + 2,
      y: from.y,
    });
    expect(jumped.ok).toBe(true);
    const blocked = await game.execute({
      type: "block",
      attackerId: blitzer.id,
      defenderId: away(2).id,
    });
    expect(blocked.ok).toBe(true);
    expect(gs.hasUsedBlitzBlock(blitzer.id)).toBe(true);
  });
});
