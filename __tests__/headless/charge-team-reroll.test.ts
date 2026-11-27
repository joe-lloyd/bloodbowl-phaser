import { z } from "zod";
import { kickoffEventSchema } from "../../src/boundary/schemas/KickoffEvent";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { SkillType, getSkill } from "../../src/types/Skills";
import { deserializeGameState } from "../../src/headless/serialization";
import { settle } from "./kickoffRehearsal";
import { forceDice } from "../utils/test-helpers";

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
      playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    const result = z
      .union([z.object({ event: kickoffEventSchema }), z.undefined()])
      .parse(
        response.events.find(
          (event) => event.name === GameEventNames.KickoffResult
        )?.data
      );
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
    game.ctx.teams[0].rerolls = 3;
    const [first, second] = game.ctx.teams[0].players;
    const [firstMarker, secondMarker] = game.ctx.teams[1].players;
    fixtureValue(second).skills = [
      ...fixtureValue(second).skills,
      getSkill(SkillType.DODGE),
    ];

    gs.getState().turn.teamId = game.ctx.teams[0].id;
    gs.getRerollArbiter().consumeTeamReroll(game.ctx.teams[0].id);
    expect(fixtureValue(game.snapshot().teams[0]).rerolls).toBe(2);

    for (const player of [first, second]) {
      await game.execute({
        type: "kickoff-select-player",
        playerId: fixtureValue(player).id,
      });
    }
    await game.execute({ type: "kickoff-confirm" });
    expect(deserializeGameState(game.snapshot())).toMatchObject({
      turn: { teamId: game.ctx.teams[0].id },
      kick: { step: { stage: "play", event: KickoffEvent.CHARGE } },
    });

    fixtureValue(first).gridPosition = { x: 9, y: 5 };
    fixtureValue(firstMarker).gridPosition = { x: 10, y: 5 };
    fixtureValue(second).gridPosition = { x: 9, y: 8 };
    fixtureValue(secondMarker).gridPosition = { x: 10, y: 8 };

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(first).id,
      action: "move",
    });
    forceDice(game.ctx.rng, [1, 6]);
    const failed = await game.execute({
      type: "move",
      playerId: fixtureValue(first).id,
      path: [{ x: 8, y: 5 }],
    });
    expect(failed.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "dodge",
      sources: ["team"],
    });
    await game.execute({ type: "use-reroll", accept: true, source: "team" });
    expect(fixtureValue(first).gridPosition).toEqual({ x: 8, y: 5 });
    expect(fixtureValue(game.snapshot().teams[0]).rerolls).toBe(1);
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(first).id,
    });

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(second).id,
      action: "move",
    });
    forceDice(game.ctx.rng, [1, 6]);
    const again = await game.execute({
      type: "move",
      playerId: fixtureValue(second).id,
      path: [{ x: 8, y: 8 }],
    });
    expect(again.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "dodge",
      sources: ["skill"],
    });
    await game.execute({ type: "use-reroll", accept: true, source: "skill" });
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(second).id,
    });

    expect(gs.getKickoffEventStep()).toBeNull();
    expect(game.snapshot().kick?.step).toBeNull();
    expect(gs.getState().turn.teamId).toBe(game.ctx.teams[1].id);
    await game.execute({ type: "end-turn" });
    expect(gs.getState().turn.teamId).toBe(game.ctx.teams[0].id);
    expect(gs.getRerollArbiter().nextTeamReroll(game.ctx.teams[0].id)).toBe(
      "team"
    );
    expect(fixtureValue(game.snapshot().teams[0]).rerolls).toBe(1);
  });
});

describe("a save taken during Charge!", () => {
  it("gives the drive's first turn its Team Re-roll after a cold restore", async () => {
    const game = await chargeGame();
    game.ctx.teams[0].rerolls = 3;
    game.ctx.teams[1].rerolls = 3;
    for (const player of game.ctx.teams[0].players.slice(0, 2)) {
      await game.execute({
        type: "kickoff-select-player",
        playerId: player.id,
      });
    }
    await game.execute({ type: "kickoff-confirm" });
    const save = game.matchSave();
    expect(save.snapshot.turn.teamId).toBe(game.ctx.teams[0].id);

    const resumed = new HeadlessGame({ matchSave: save });
    const gs = resumed.ctx.gameService;
    const endTurn = await resumed.execute({ type: "end-turn" });
    expect(endTurn.ok).toBe(true);
    await settle();
    expect(gs.getState().phase).toBe(GamePhase.PLAY);
    expect(gs.getState().turn.teamId).toBe(resumed.ctx.teams[1].id);
    expect(resumed.snapshot().kick?.step).toBeNull();
    expect(gs.getRerollArbiter().nextTeamReroll(resumed.ctx.teams[1].id)).toBe(
      "team"
    );
  });
});
