import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { SkillType, getSkill } from "../../src/types/Skills";
import { deserializeGameState } from "../../src/headless/serialization";
import { forceDice } from "../utils/test-helpers";

/**
 * FAQ (May 2026), p2: "Can I use Team Re-rolls during the Charge! Kick-off
 * Event? Yes." The Charge is its own window: one Team Re-roll for the whole
 * sequence, whatever the turn before the kick-off spent, and none of it
 * touches the drive's first turns.
 */
const scenario: Scenario = {
  id: "charge-team-reroll",
  name: "Charge! team re-roll",
  description: "Seven Open players per team and a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    turn: 2,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

async function chargeGame(): Promise<HeadlessGame> {
  for (let seed = 1; seed <= 800; seed++) {
    const game = new HeadlessGame({ scenario, seed });
    game.ctx.gameService.seedTurnCounts(2);
    const response = await game.execute({
      type: "kick-ball",
      playerId: game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });
    const result = response.events.find(
      (event) => event.name === GameEventNames.KickoffResult
    )?.data as { event: KickoffEvent } | undefined;
    if (
      result?.event === KickoffEvent.CHARGE &&
      response.pendingDecision?.type === "kickoff-event"
    ) {
      return game;
    }
  }
  throw new Error("no seed rolled Charge!");
}

describe("Team Re-rolls during Charge!", () => {
  it("offers one Team Re-roll for the Charge, on its own ledger", async () => {
    const game = await chargeGame();
    const gs = game.ctx.gameService;
    game.ctx.team1.rerolls = 3;
    const [first, second] = game.ctx.team1.players;
    const [firstMarker, secondMarker] = game.ctx.team2.players;
    second.skills = [...second.skills, getSkill(SkillType.DODGE)];

    // The turn before the kick-off was team one's, and it spent its Team
    // Re-roll: that must not stop the Charge having one of its own.
    gs.getState().turn.teamId = game.ctx.team1.id;
    gs.getRerollArbiter().consumeTeamReroll(game.ctx.team1.id);
    expect(game.snapshot().teams[0].rerolls).toBe(2);

    for (const player of [first, second]) {
      await game.execute({ type: "kickoff-select-player", playerId: player.id });
    }
    await game.execute({ type: "kickoff-confirm" });
    expect(game.snapshot().chargeTeamId).toBe(game.ctx.team1.id);
    // A save or an online resync mid-Charge keeps the Charge's window.
    expect(deserializeGameState(game.snapshot()).chargeTeamId).toBe(
      game.ctx.team1.id
    );

    // Each charger dodges out of a marker's Tackle Zone into open space.
    first.gridPosition = { x: 9, y: 5 };
    firstMarker.gridPosition = { x: 10, y: 5 };
    second.gridPosition = { x: 9, y: 8 };
    secondMarker.gridPosition = { x: 10, y: 8 };

    await game.execute({
      type: "declare-action",
      playerId: first.id,
      action: "move",
    });
    forceDice(game.ctx.rng, [1, 6]);
    const failed = await game.execute({
      type: "move",
      playerId: first.id,
      path: [{ x: 8, y: 5 }],
    });
    expect(failed.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "dodge",
      sources: ["team"],
    });
    await game.execute({ type: "use-reroll", accept: true, source: "team" });
    expect(first.gridPosition).toEqual({ x: 8, y: 5 });
    expect(game.snapshot().teams[0].rerolls).toBe(1);
    await game.execute({ type: "end-activation", playerId: first.id });

    // The Charge has spent its one: the next charger may only use Dodge.
    await game.execute({
      type: "declare-action",
      playerId: second.id,
      action: "move",
    });
    forceDice(game.ctx.rng, [1, 6]);
    const again = await game.execute({
      type: "move",
      playerId: second.id,
      path: [{ x: 8, y: 8 }],
    });
    expect(again.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "dodge",
      sources: ["skill"],
    });
    await game.execute({ type: "use-reroll", accept: true, source: "skill" });
    await game.execute({ type: "end-activation", playerId: second.id });

    // The drive starts; team one's own first turn has its Team Re-roll.
    expect(gs.getKickoffEventStep()).toBeNull();
    expect(game.snapshot().chargeTeamId).toBeUndefined();
    expect(gs.getState().turn.teamId).toBe(game.ctx.team2.id);
    await game.execute({ type: "end-turn" });
    expect(gs.getState().turn.teamId).toBe(game.ctx.team1.id);
    expect(gs.getRerollArbiter().nextTeamReroll(game.ctx.team1.id)).toBe(
      "team"
    );
    expect(game.snapshot().teams[0].rerolls).toBe(1);
  });
});
