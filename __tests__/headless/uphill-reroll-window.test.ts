import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { checkOwnership } from "../../src/network/OwnershipGate";

const scenario: Scenario = {
  id: "uphill-reroll",
  name: "Uphill re-roll",
  description: "Attacker decides on re-rolls before the defender picks",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 5, y: 5, stats: { ST: 2 } }],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5, stats: { ST: 4 } }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

async function block() {
  const game = new HeadlessGame({ scenario, seed: 1 });
  game.ctx.team1.rerolls = 2;
  const attackerId = game.ctx.team1.players[0].id;
  const defenderId = game.ctx.team2.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: attackerId,
    action: "block",
  });
  const rolled = await game.execute({ type: "block", attackerId, defenderId });
  return { game, rolled, attackerId };
}

describe("uphill block re-roll window", () => {
  it("offers the attacker a re-roll before the defender may pick", async () => {
    const { game, rolled, attackerId } = await block();
    const pending = rolled.pendingDecision;
    expect(pending?.type).toBe("block-dice");
    if (pending?.type !== "block-dice") throw new Error("Block did not roll");
    expect(pending.choiceStage).toBe("attacker-reroll");
    const ctx = {
      activeTeamId: game.ctx.team1.id,
      pendingDecision: pending,
      teamIdOfPlayer: (id: string) =>
        game.ctx.gameService.getPlayerById(id)?.teamId,
      hostTeamId: game.ctx.team1.id,
    };
    expect(
      checkOwnership(
        { type: "choose-block-result", index: 0 },
        game.ctx.team2.id,
        ctx
      )
    ).toEqual({ allowed: false, reason: "not-your-decision" });
    expect(
      checkOwnership(
        { type: "team-reroll-block", attackerId },
        game.ctx.team1.id,
        ctx
      )
    ).toEqual({ allowed: true });
    const kept = await game.execute({ type: "keep-block-dice", attackerId });
    expect(kept.ok).toBe(true);
    expect(kept.pendingDecision).toMatchObject({
      type: "block-dice",
      choiceStage: "pick",
      chooserTeamId: game.ctx.team2.id,
    });
    expect(game.snapshot().teams[0].rerolls).toBe(2);
    expect(
      kept.pendingDecision?.type === "block-dice" &&
        kept.pendingDecision.options
    ).toEqual(pending.options);
  });

  it("hands control to the defender after an attacker re-roll", async () => {
    const { game, attackerId } = await block();
    const rerolled = await game.execute({
      type: "team-reroll-block",
      attackerId,
    });
    expect(rerolled.ok).toBe(true);
    expect(rerolled.pendingDecision).toMatchObject({
      type: "block-dice",
      choiceStage: "pick",
      chooserTeamId: game.ctx.team2.id,
    });
    expect(game.snapshot().teams[0].rerolls).toBe(1);
  });
});
