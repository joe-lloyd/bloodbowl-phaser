import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { Inducement } from "../../src/types/Inducements";
import { DesperateMeasure } from "../../src/game/inducements/desperateMeasures";
import { forceDice } from "../utils/test-helpers";
import { bought, commit, settle } from "../utils/inducement-helpers";
import { SCENARIOS } from "../../src/data/scenarios";

const scenarioAt = (x: number): Scenario => ({
  id: "razzle-dazzle-test",
  name: "Razzle-Dazzle",
  description: "a team 1 player on the same row as an opponent",
  setup: {
    team1Placements: [
      { playerIndex: 0, x, y: 5 },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 18, y: 1 },
    ],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});
const apart = scenarioAt(8);
const adjacent = scenarioAt(9);

async function razzleGame(scenario = apart) {
  const game = new HeadlessGame({ scenario, seed: 1 });

  forceDice(game.ctx.rng, [2]);
  await commit(game, [
    bought(game.ctx.teams[0].id, Inducement.DESPERATE_MEASURES, 1),
  ]);
  return game;
}

function measure(game: HeadlessGame) {
  return game.ctx.gameService.getState().matchInducements?.measures[
    game.ctx.teams[0].id
  ];
}

async function actionsOf(game: HeadlessGame, playerId: string) {
  const response = await game.execute({ type: "legal-actions", playerId });
  const legal = response.legalActions;
  return legal?.players.find((p) => p.playerId === playerId)?.actions ?? [];
}

async function pushEast(
  game: HeadlessGame,
  attackerId: string,
  followUp = false
) {
  const defender = game.ctx.teams[1].players[0];
  forceDice(game.ctx.rng, [3]);
  const rolled = await game.execute({
    type: "block",
    attackerId,
    defenderId: fixtureValue(defender).id,
  });
  expect(rolled.ok).toBe(true);
  await game.execute({ type: "choose-block-result", index: 0 });
  const square = fixtureValue(fixtureValue(defender).gridPosition);
  await game.execute({
    type: "choose-push-direction",
    x: square.x + 1,
    y: square.y,
  });
  await game.execute({ type: "choose-follow-up", followUp });
  await settle();
}

describe("Razzle-Dazzle", () => {
  it("a Move then a Block: the activation stays open after the Move, and the second Action may not contain a Move", async () => {
    const game = await razzleGame();
    const player = game.ctx.teams[0].players[0];
    const state = game.ctx.gameService.getState();

    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "move",
      razzleDazzle: true,
    });
    expect(declared.ok).toBe(true);
    await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: [{ x: 9, y: 5 }],
    });
    expect(measure(game)).toEqual([
      { measure: DesperateMeasure.RAZZLE_DAZZLE, used: true },
    ]);
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(player).id,
    });

    expect(state.activePlayer).toMatchObject({
      id: fixtureValue(player).id,
      razzleDazzle: { actions: ["move"], awaitingSecond: true },
    });
    expect(state.turn.activatedPlayerIds.has(fixtureValue(player).id)).toBe(
      false
    );

    await game.ctx.gameService.movePlayer(fixtureValue(player).id, [
      { x: 9, y: 6 },
    ]);
    expect(fixtureValue(player).gridPosition).toEqual({ x: 9, y: 5 });
    const second = await actionsOf(game, fixtureValue(player).id);
    expect(second).toContain("block");
    expect(second).not.toContain("move");
    expect(second).not.toContain("blitz");
    expect(second).not.toContain("pass");

    const pass = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "pass",
    });
    expect(pass.ok).toBe(false);
    const block = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "block",
    });
    expect(block.ok).toBe(true);
    await pushEast(game, fixtureValue(player).id);

    expect(fixtureValue(game.ctx.teams[1].players[0]).gridPosition).toEqual({
      x: 11,
      y: 5,
    });
    expect(state.activePlayer).toBeNull();
    expect(state.turn.activatedPlayerIds.has(fixtureValue(player).id)).toBe(
      true
    );
  });

  it("a Block then a Move, and never the same Action twice", async () => {
    const game = await razzleGame(adjacent);
    const player = game.ctx.teams[0].players[0];
    const state = game.ctx.gameService.getState();

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "block",
      razzleDazzle: true,
    });
    await pushEast(game, fixtureValue(player).id);
    expect(state.activePlayer).toMatchObject({
      id: fixtureValue(player).id,
      razzleDazzle: { actions: ["block"], awaitingSecond: true },
    });

    const again = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "block",
    });
    expect(again.ok).toBe(false);
    const move = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "move",
    });
    expect(move.ok).toBe(true);
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: [
        { x: 9, y: 6 },
        { x: 9, y: 7 },
      ],
    });
    expect(moved.ok).toBe(true);
    expect(fixtureValue(player).gridPosition).toEqual({ x: 9, y: 7 });
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(player).id,
    });
    expect(state.activePlayer).toBeNull();
    expect(state.turn.activatedPlayerIds.has(fixtureValue(player).id)).toBe(
      true
    );
  });

  it("refuses a pitch shortcut that reuses the completed first Block", async () => {
    const game = await razzleGame(adjacent);
    const player = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];
    const gs = game.ctx.gameService;
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "block",
      razzleDazzle: true,
    });
    await pushEast(game, fixtureValue(player).id, true);
    expect(fixtureValue(player).gridPosition).toEqual({ x: 10, y: 5 });
    expect(gs.getState().activePlayer?.razzleDazzle?.awaitingSecond).toBe(true);

    forceDice(game.ctx.rng, [3]);
    await gs.rollBlockDice({
      attackerId: fixtureValue(player).id,
      defenderId: fixtureValue(defender).id,
      numDice: 1,
      isAttackerChoice: true,
    });
    await settle();
    expect(game.pendingDecision()).toBeNull();
    const forged = await game.execute({
      type: "block",
      attackerId: fixtureValue(player).id,
      defenderId: fixtureValue(defender).id,
    });
    expect(forged.ok).toBe(false);
    expect(
      gs.declareAction({ playerId: fixtureValue(player).id, action: "block" })
    ).toBe(false);
    expect(
      gs.declareAction({ playerId: fixtureValue(player).id, action: "move" })
    ).toBe(true);
    const stepped = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: [{ x: 9, y: 5 }],
    });
    expect(stepped.ok).toBe(true);
  });

  it("settles failed Bloodlust after the second Action, beside the newly reachable Thrall", async () => {
    const scenario: Scenario = {
      ...adjacent,
      setup: {
        ...adjacent.setup,
        team1Roster: RosterName.VAMPIRE,
        team1Placements: [
          {
            playerIndex: 0,
            x: 9,
            y: 5,
            skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
          },
          { playerIndex: 1, x: 7, y: 7 },
          { playerIndex: 2, x: 2, y: 9 },
        ],
      },
    };
    const game = await razzleGame(scenario);
    const [vampire, thrall] = game.ctx.teams[0].players;
    const state = game.ctx.gameService.getState();
    forceDice(game.ctx.rng, [1]);
    const declaredBlock = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(vampire).id,
      action: "block",
      razzleDazzle: true,
    });
    expect(declaredBlock.ok).toBe(true);
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });
    await game.execute({ type: "use-reaction", accept: false });
    await pushEast(game, fixtureValue(vampire).id);
    expect(state.activePlayer).toMatchObject({
      id: fixtureValue(vampire).id,
      bloodlustUnsated: true,
      razzleDazzle: { awaitingSecond: true },
    });
    expect(fixtureValue(vampire).conditions ?? []).toEqual([]);
    expect(fixtureValue(thrall).status).toBe(PlayerStatus.ACTIVE);
    const declaredMove = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(vampire).id,
      action: "move",
    });
    expect(declaredMove.ok).toBe(true);
    expect(state.activePlayer?.bloodlustUnsated).toBe(true);

    const cancelled = await game.execute({
      type: "cancel-action",
      playerId: fixtureValue(vampire).id,
    });
    expect(cancelled.ok).toBe(true);
    expect(state.activePlayer?.bloodlustUnsated).toBe(true);
    const redeclaredMove = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(vampire).id,
      action: "move",
    });
    expect(redeclaredMove.ok).toBe(true);
    expect(state.activePlayer?.bloodlustUnsated).toBe(true);
    forceDice(game.ctx.rng, [6]);
    const steppedUp = await game.execute({
      type: "move",
      playerId: fixtureValue(vampire).id,
      path: [{ x: 8, y: 6 }],
    });
    expect(steppedUp.ok).toBe(true);
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(vampire).id,
    });
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });
    forceDice(game.ctx.rng, [1, 1]);
    const reacted = await game.execute({ type: "use-reaction", accept: true });
    expect(reacted.ok).toBe(true);
    expect(fixtureValue(thrall).status).toBe(PlayerStatus.STUNNED);
    expect(
      fixtureValue(vampire).conditions?.map((c) => c.type) ?? []
    ).not.toContain(PlayerCondition.DISTRACTED);
    expect(state.activeTeamId).toBe(game.ctx.teams[0].id);
    expect(state.activePlayer).toBeNull();
    expect(state.turn.activatedPlayerIds.has(fixtureValue(vampire).id)).toBe(
      true
    );
  });

  it("keeps the team's one Blitz a turn: a Blitz already spent cannot be the second Action", async () => {
    const game = await razzleGame(adjacent);
    const [player, blitzer] = game.ctx.teams[0].players;

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blitzer).id,
      action: "blitz",
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(blitzer).id,
      path: [{ x: 3, y: 9 }],
    });
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(blitzer).id,
    });

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "block",
      razzleDazzle: true,
    });
    await pushEast(game, fixtureValue(player).id);
    expect(await actionsOf(game, fixtureValue(player).id)).not.toContain(
      "blitz"
    );
    const blitz = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "blitz",
    });
    expect(blitz.ok).toBe(false);
  });

  it("a Turnover in the first Action ends the activation and the turn", async () => {
    const game = await razzleGame(adjacent);
    const player = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "block",
      razzleDazzle: true,
    });

    forceDice(game.ctx.rng, [1, 1, 1]);
    await game.execute({
      type: "block",
      attackerId: fixtureValue(player).id,
      defenderId: fixtureValue(game.ctx.teams[1].players[0]).id,
    });
    await game.execute({ type: "choose-block-result", index: 0 });
    for (let i = 0; i < 10 && game.pendingDecision(); i++) {
      await game.execute({ type: "use-reroll", accept: false });
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await settle();

    const state = game.ctx.gameService.getState();
    expect(state.activeTeamId).toBe(game.ctx.teams[1].id);
    expect(measure(game)).toEqual([
      { measure: DesperateMeasure.RAZZLE_DAZZLE, used: true },
    ]);
  });

  it("is only spent once the first Action commits, and needs the measure", async () => {
    const game = await razzleGame();
    const player = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "move",
      razzleDazzle: true,
    });
    await game.execute({
      type: "cancel-action",
      playerId: fixtureValue(player).id,
    });
    expect(measure(game)).toEqual([
      { measure: DesperateMeasure.RAZZLE_DAZZLE, used: false },
    ]);

    const plain = new HeadlessGame({ scenario: apart, seed: 1 });
    const refused = await plain.execute({
      type: "declare-action",
      playerId: fixtureValue(plain.ctx.teams[0].players[0]).id,
      action: "move",
      razzleDazzle: true,
    });
    expect(refused.ok).toBe(false);
  });
});

describe("the Razzle-Dazzle sandbox scenario", () => {
  it("holds the measure, and offers a Block but no second Move after a Move", async () => {
    const scenario = fixtureValue(
      SCENARIOS.find((s) => s.id === "razzle-dazzle-two-actions")
    );
    const game = new HeadlessGame({ scenario });
    const player = game.ctx.teams[0].players[0];
    expect(measure(game)).toEqual([
      { measure: DesperateMeasure.RAZZLE_DAZZLE, used: false },
    ]);
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "move",
      razzleDazzle: true,
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: [{ x: 9, y: 5 }],
    });
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(player).id,
    });
    const second = await actionsOf(game, fixtureValue(player).id);
    expect(second).toContain("block");
    expect(second).not.toContain("move");
  });
});
