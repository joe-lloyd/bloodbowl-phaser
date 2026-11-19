import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { Inducement } from "../../src/types/Inducements";
import { DesperateMeasure } from "../../src/game/inducements/desperateMeasures";
import { forceDice } from "../utils/test-helpers";
import { bought, commit, settle } from "../utils/inducement-helpers";
import { SCENARIOS } from "../../src/data/scenarios";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { defaultAnswer } from "../../src/network/decisionTimeouts";

const pitch: Scenario = {
  id: "sports-wizard-test",
  name: "Sports-Wizard",
  description: "team 2 players around (11,5), a team 1 player beside them",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 4 },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, hasBall: true },
      { playerIndex: 1, x: 12, y: 6, status: PlayerStatus.PRONE },
      { playerIndex: 2, x: 17, y: 2 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

async function withWizard({ both = false } = {}) {
  const game = new HeadlessGame({ scenario: pitch, seed: 1 });
  const teams = both ? [game.ctx.team1, game.ctx.team2] : [game.ctx.team1];
  forceDice(
    game.ctx.rng,
    teams.map(() => 8)
  );
  await commit(
    game,
    teams.map((team) => bought(team.id, Inducement.DESPERATE_MEASURES, 1))
  );
  return game;
}

async function endTurn(game: HeadlessGame) {
  const ended = await game.execute({ type: "end-turn" });
  expect(ended.ok).toBe(true);
  await settle();
}

describe("Magic Scroll", () => {
  it("is used before set-up and gives the team a Sports-Wizard", async () => {
    const game = await withWizard();
    const mi = fixtureValue(game.ctx.gameService.getState().matchInducements);
    expect(mi.measures[game.ctx.team1.id]).toEqual([
      { measure: DesperateMeasure.MAGIC_SCROLL, used: true },
    ]);
    expect(mi.sportsWizards).toEqual([game.ctx.team1.id]);
    expect(game.pendingDecision()).toBeNull();
  });
});

describe("the Sports-Wizard", () => {
  it("is offered at the end of a Turn, and kept when declined", async () => {
    const game = await withWizard();
    const state = game.ctx.gameService.getState();
    await endTurn(game);

    expect(game.pendingDecision()).toMatchObject({
      type: "inducement-choice",
      kind: "sports-wizard",
      chooserTeamId: game.ctx.team1.id,
      spells: ["fireball", "zap"],
      optional: true,
    });

    expect(state.activeTeamId).toBe(game.ctx.team1.id);

    await game.execute({ type: "choose-inducement" });
    await settle();
    expect(state.activeTeamId).toBe(game.ctx.team2.id);
    expect(state.matchInducements?.sportsWizards).toEqual([game.ctx.team1.id]);
  });

  it("Fireball: each player in or next to the square is hit on a 4+, the Standing are Knocked Down, and every Armour Roll is at +1", async () => {
    const game = await withWizard();
    const [inSquare, prone] = game.ctx.team2.players;
    const beside = game.ctx.team1.players[0];
    await endTurn(game);

    forceDice(game.ctx.rng, [3, 4, 6, 4, 4, 3, 3, 1, 1]);
    const cast = await game.execute({
      type: "choose-inducement",
      spell: "fireball",
      x: 11,
      y: 5,
    });
    expect(cast.ok).toBe(true);
    await settle();

    expect(fixtureValue(beside).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(inSquare).status).toBe(PlayerStatus.STUNNED);
    expect(fixtureValue(prone).status).toBe(PlayerStatus.PRONE);

    expect(game.ctx.gameService.getState().ballPosition).not.toEqual({
      x: 11,
      y: 5,
    });
    const state = game.ctx.gameService.getState();
    expect(state.matchInducements?.sportsWizards).toEqual([]);
    expect(state.activeTeamId).toBe(game.ctx.team2.id);
    expect(state.phase).toBe(GamePhase.PLAY);
  });

  it("Zap!: a roll at or over the target's ST turns them into a Frog, and the Frog is themselves again after the drive", async () => {
    const game = await withWizard();
    const target = game.ctx.team2.players[0];
    const skills = fixtureValue(target).skills.map((s) => s.type);
    const stats = { ...fixtureValue(target).stats };
    await endTurn(game);

    forceDice(game.ctx.rng, [3]);
    await game.execute({
      type: "choose-inducement",
      spell: "zap",
      playerId: fixtureValue(target).id,
    });
    await settle();

    expect(fixtureValue(target).stats).toEqual({
      MA: 5,
      ST: 1,
      AG: 2,
      PA: 0,
      AV: 5,
    });
    expect(fixtureValue(target).skills.map((s) => s.type)).toEqual([
      "Dodge",
      "Leap",
      "No Ball",
      "Stunty",
      "Titchy",
      "Very Long Legs",
    ]);
    expect(fixtureValue(target).conditions?.map((c) => c.type)).toEqual([
      "Frog",
    ]);

    expect(game.ctx.gameService.getState().ballPosition).not.toEqual({
      x: 11,
      y: 5,
    });

    game.ctx.gameService.endDrive("touchdown", {
      kickingTeamId: game.ctx.team1.id,
    });
    await settle();
    expect(fixtureValue(target).stats).toEqual(stats);
    expect(fixtureValue(target).skills.map((s) => s.type)).toEqual(skills);
    expect(fixtureValue(target).conditions ?? []).toEqual([]);
  });

  it("Zap!: under the target's ST does nothing, and a natural 1 always fails", async () => {
    const game = await withWizard();
    const target = game.ctx.team2.players[0];
    await endTurn(game);
    forceDice(game.ctx.rng, [2]);
    await game.execute({
      type: "choose-inducement",
      spell: "zap",
      playerId: fixtureValue(target).id,
    });
    await settle();
    expect(fixtureValue(target).stats.ST).toBe(3);
    expect(fixtureValue(target).conditions ?? []).toEqual([]);

    expect(
      game.ctx.gameService.getState().matchInducements?.sportsWizards
    ).toEqual([]);
  });

  it.each(["crowd", "trapdoor"] as const)(
    "a Frog suffering a fatal %s roll is only Badly Hurt",
    async (route) => {
      const game = await withWizard();
      const target = game.ctx.team2.players[0];
      await endTurn(game);
      forceDice(game.ctx.rng, [6]);
      expect(
        (
          await game.execute({
            type: "choose-inducement",
            spell: "zap",
            playerId: fixtureValue(target).id,
          })
        ).ok
      ).toBe(true);
      await settle();
      expect(fixtureValue(target).conditions?.map((c) => c.type)).toContain(
        "Frog"
      );
      forceDice(game.ctx.rng, [6, 6]);
      game.ctx.gameService.flowManager.add(
        new CrowdInjuryOperation(
          fixtureValue(target).id,
          { x: 0, y: 5 },
          false,
          route === "trapdoor" ? { carriedBall: false } : undefined
        )
      );
      await settle();
      expect(fixtureValue(target).injuries).toEqual([InjuryType.BADLY_HURT]);
      expect(fixtureValue(target).status).toBe(PlayerStatus.INJURED);
      expect(fixtureValue(target).gridPosition).toBeUndefined();
      expect(game.pendingDecision()).toBeNull();
    }
  );

  it("asks both coaches, and a Frog's Casualty is always Badly Hurt", async () => {
    const game = await withWizard({ both: true });
    const target = game.ctx.team2.players[0];
    await endTurn(game);
    forceDice(game.ctx.rng, [6]);
    await game.execute({
      type: "choose-inducement",
      spell: "zap",
      playerId: fixtureValue(target).id,
    });
    await settle();
    expect(fixtureValue(target).stats.AV).toBe(5);

    expect(game.pendingDecision()).toMatchObject({
      kind: "sports-wizard",
      chooserTeamId: game.ctx.team2.id,
    });
    forceDice(game.ctx.rng, [3, 4, 3, 3, 6, 6]);
    await game.execute({
      type: "choose-inducement",
      spell: "fireball",
      x: 11,
      y: 4,
    });
    await settle();
    expect(fixtureValue(target).status).toBe(PlayerStatus.INJURED);
    expect(fixtureValue(target).injuries).toEqual([InjuryType.BADLY_HURT]);
  });
});

describe("the Sports-Wizard sandbox scenario", () => {
  it("starts with the wizard, offered as the home turn ends", async () => {
    const scenario = fixtureValue(
      SCENARIOS.find((s) => s.id === "sports-wizard-spells")
    );
    const game = new HeadlessGame({ scenario });
    const mi = fixtureValue(game.ctx.gameService.getState().matchInducements);
    expect(mi.sportsWizards).toEqual([game.ctx.team1.id]);
    await endTurn(game);
    expect(game.pendingDecision()).toMatchObject({
      kind: "sports-wizard",
      chooserTeamId: game.ctx.team1.id,
    });
  });
});

describe("an online coach who does not answer", () => {
  it("keeps the Sports-Wizard when the clock runs out", async () => {
    const game = await withWizard();
    await endTurn(game);
    const pending = fixtureValue(game.pendingDecision());
    const timedOut = await game.execute(fixtureValue(defaultAnswer(pending)));
    expect(timedOut.ok).toBe(true);
    await settle();
    const state = game.ctx.gameService.getState();
    expect(state.activeTeamId).toBe(game.ctx.team2.id);
    expect(state.matchInducements?.sportsWizards).toEqual([game.ctx.team1.id]);
  });
});
