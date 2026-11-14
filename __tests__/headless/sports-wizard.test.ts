import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { Inducement } from "../../src/types/Inducements";
import { DesperateMeasure } from "../../src/game/inducements/desperateMeasures";
import { forceDice } from "../utils/test-helpers";
import { bought, commit, settle } from "../utils/inducement-helpers";
import { SCENARIOS } from "../../src/data/scenarios";
import { CrowdInjuryOperation } from "../../src/game/operations/CrowdInjuryOperation";
import { defaultAnswer } from "../../src/network/decisionTimeouts";

/**
 * Magic Scroll (Spike! Journal 22 p.15, rule L28): "You may use this
 * Desperate Measure before either team is set up. Your team gains a single
 * Sports-Wizard Inducement for free." The Sports-Wizard (2025 rulebook
 * p.149) casts one of two spells once per game, "at the end of any Turn,
 * before the next Turn begins". Every die is forced.
 */

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

/** Team 1, or both teams, hold a Magic Scroll: a D8 of 8. */
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

/** End team 1's turn; the wizard's offer comes before team 2's. */
async function endTurn(game: HeadlessGame) {
  const ended = await game.execute({ type: "end-turn" });
  expect(ended.ok).toBe(true);
  await settle();
}

describe("Magic Scroll", () => {
  it("is used before set-up and gives the team a Sports-Wizard", async () => {
    const game = await withWizard();
    const mi = game.ctx.gameService.getState().matchInducements!;
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
    // The next Turn waits on the wizard
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

    // D6 per player, team 1 first: 3 misses (10,4); 4 hits (11,5); 6 hits
    // (12,6). Then armour: 4+4+1 breaks AV 9 and 3+3 is Stunned; 1+1+1
    // holds.
    forceDice(game.ctx.rng, [3, 4, 6, 4, 4, 3, 3, 1, 1]);
    const cast = await game.execute({
      type: "choose-inducement",
      spell: "fireball",
      x: 11,
      y: 5,
    });
    expect(cast.ok).toBe(true);
    await settle();

    expect(beside.status).toBe(PlayerStatus.ACTIVE);
    expect(inSquare.status).toBe(PlayerStatus.STUNNED);
    expect(prone.status).toBe(PlayerStatus.PRONE);
    // The carrier was hit, so the ball left their square
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
    const skills = target.skills.map((s) => s.type);
    const stats = { ...target.stats };
    await endTurn(game);

    forceDice(game.ctx.rng, [3]);
    await game.execute({
      type: "choose-inducement",
      spell: "zap",
      playerId: target.id,
    });
    await settle();

    expect(target.stats).toEqual({ MA: 5, ST: 1, AG: 2, PA: 0, AV: 5 });
    expect(target.skills.map((s) => s.type)).toEqual([
      "Dodge",
      "Leap",
      "No Ball",
      "Stunty",
      "Titchy",
      "Very Long Legs",
    ]);
    expect(target.conditions?.map((c) => c.type)).toEqual(["Frog"]);
    // A Frog cannot hold the ball: it Bounced away
    expect(game.ctx.gameService.getState().ballPosition).not.toEqual({
      x: 11,
      y: 5,
    });

    game.ctx.gameService.endDrive("touchdown", {
      kickingTeamId: game.ctx.team1.id,
    });
    await settle();
    expect(target.stats).toEqual(stats);
    expect(target.skills.map((s) => s.type)).toEqual(skills);
    expect(target.conditions ?? []).toEqual([]);
  });

  it("Zap!: under the target's ST does nothing, and a natural 1 always fails", async () => {
    const game = await withWizard();
    const target = game.ctx.team2.players[0];
    await endTurn(game);
    forceDice(game.ctx.rng, [2]);
    await game.execute({
      type: "choose-inducement",
      spell: "zap",
      playerId: target.id,
    });
    await settle();
    expect(target.stats.ST).toBe(3);
    expect(target.conditions ?? []).toEqual([]);
    // Spent either way: once per game
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
            playerId: target.id,
          })
        ).ok
      ).toBe(true);
      await settle();
      expect(target.conditions?.map((c) => c.type)).toContain("Frog");
      forceDice(game.ctx.rng, [6, 6]);
      game.ctx.gameService.flowManager.add(
        new CrowdInjuryOperation(
          target.id,
          { x: 0, y: 5 },
          false,
          route === "trapdoor" ? { carriedBall: false } : undefined
        )
      );
      await settle();
      expect(target.injuries).toEqual([InjuryType.BADLY_HURT]);
      expect(target.status).toBe(PlayerStatus.INJURED);
      expect(target.gridPosition).toBeUndefined();
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
      playerId: target.id,
    });
    await settle();
    expect(target.stats.AV).toBe(5);

    // Then team 2's wizard: a Fireball beside the Frog. 3 misses (10,4)
    // and 4 hits the Frog; armour 3+3+1 breaks AV 5+, and 6+6 is Dead.
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
    expect(target.status).toBe(PlayerStatus.INJURED);
    expect(target.injuries).toEqual([InjuryType.BADLY_HURT]);
  });
});

describe("the Sports-Wizard sandbox scenario", () => {
  it("starts with the wizard, offered as the home turn ends", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "sports-wizard-spells")!;
    const game = new HeadlessGame({ scenario });
    const mi = game.ctx.gameService.getState().matchInducements!;
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
    const pending = game.pendingDecision()!;
    const timedOut = await game.execute(defaultAnswer(pending)!);
    expect(timedOut.ok).toBe(true);
    await settle();
    const state = game.ctx.gameService.getState();
    expect(state.activeTeamId).toBe(game.ctx.team2.id);
    expect(state.matchInducements?.sportsWizards).toEqual([game.ctx.team1.id]);
  });
});
