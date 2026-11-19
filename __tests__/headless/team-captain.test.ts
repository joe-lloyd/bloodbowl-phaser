import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { createPlayer } from "../../src/types/Player";
import { SkillType, hasSkill } from "../../src/types/Skills";
import { RosterName, type Team } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { TeamFactory } from "../../src/game/TeamFactory";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { stampFirstCompletedMatch } from "../../src/game/rules/teamLifecycle";
import { chooseTeamCaptain } from "../../src/game/rules/teamCaptain";
import { teamRerollsLeft } from "../../src/game/teamRerolls";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { forceDice } from "../utils/test-helpers";

const scenario: Scenario = {
  id: "team-captain-reroll",
  name: "Team Captain re-roll",
  description: "a Human Lineman picks up beside the team's Captain",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 8, y: 8, teamCaptain: true },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 5 },
    teamRerolls: { team1: 1 },
    team1Roster: RosterName.HUMAN,
    team2Roster: RosterName.HUMAN,
  },
};

async function rerollFailedPickup(game: HeadlessGame, after: number[]) {
  const mover = game.ctx.team1.players[0];
  forceDice(game.ctx.rng, [1, ...after]);
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(mover).id,
    action: "move",
  });
  const moved = await game.execute({
    type: "move",
    playerId: fixtureValue(mover).id,
    path: [{ x: 5, y: 5 }],
  });
  expect(moved.pendingDecision).toMatchObject({
    type: "reroll",
    sources: ["team"],
  });
  const rerolled = await game.execute({
    type: "use-reroll",
    accept: true,
    source: "team",
  });
  const captainRolls = rerolled.events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map((e) =>
      z.object({ rollType: z.string(), total: z.number() }).parse(e.data)
    )
    .filter((roll) => roll.rollType === "Team Captain")
    .map((roll) => roll.total);
  return { captainRolls, rerolled };
}

const rerollsLeft = (game: HeadlessGame) =>
  teamRerollsLeft(game.ctx.gameService.getState(), game.ctx.team1);

describe("the Team Captain's free Team Re-roll", () => {
  it("gives the Captain Pro for the game", () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    expect(
      hasSkill(fixtureValue(game.ctx.team1.players[1]).skills, SkillType.PRO)
    ).toBe(true);
  });

  it("keeps the Team Re-roll on a natural 6", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const { captainRolls } = await rerollFailedPickup(game, [6, 6]);

    expect(captainRolls).toEqual([6]);
    expect(rerollsLeft(game)).toBe(1);

    expect(
      game.ctx.gameService.getRerollArbiter().teamRerollAvailable("team1")
    ).toBe(false);
  });

  it("spends the Team Re-roll on anything else", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const { captainRolls } = await rerollFailedPickup(game, [5, 6]);

    expect(captainRolls).toEqual([5]);
    expect(rerollsLeft(game)).toBe(0);
  });

  it("rolls nothing while the Captain is off the pitch", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    movePlayerToBox(fixtureValue(game.ctx.team1.players[1]), {
      box: "reserves",
    });
    const { captainRolls } = await rerollFailedPickup(game, [6]);

    expect(captainRolls).toEqual([]);
    expect(rerollsLeft(game)).toBe(0);
  });

  it("keeps a free re-roll through a save", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    await rerollFailedPickup(game, [6, 6]);

    const resumed = new HeadlessGame({ matchSave: game.matchSave() });

    expect(
      teamRerollsLeft(resumed.ctx.gameService.getState(), resumed.ctx.team1)
    ).toBe(1);
    expect(fixtureValue(resumed.ctx.team1.players[1]).teamCaptain).toBe(true);
  });
});

function eightManHumans(stableId: string): Team {
  const team = stabilizeIds(
    TeamFactory.createTestTeam(RosterName.HUMAN, stableId, 0xcc0000),
    stableId
  );
  const blitzer = fixtureValue(
    getRosterByRosterName(RosterName.HUMAN).playerTemplates.find(
      (t) => t.positionName === "Human Blitzer"
    )
  );
  const extra = createPlayer(blitzer, team.id, 8);
  extra.id = `${stableId}-player-8`;
  team.players.push(extra);
  return team;
}

function preset(isTeam1: boolean) {
  return fixtureValue(
    new FormationManager()
      .getBuiltInFormations(isTeam1)
      .find((formation) => formation.name === "Balanced")
  ).positions;
}

describe("fielding the Team Captain", () => {
  async function settingUp() {
    const team1 = eightManHumans("team1");
    chooseTeamCaptain(team1, fixtureValue(team1.players[7]).id);
    const game = new HeadlessGame({
      seed: 3,
      team1,
      team2: eightManHumans("team2"),
      startingPhase: GamePhase.SETUP,
    });
    await game.execute({ type: "start-setup", kickingTeamId: "team1" });
    return game;
  }

  it("refuses a set-up that leaves an available Captain out", async () => {
    const game = await settingUp();
    const positions = preset(true);
    for (const [index, position] of positions.entries()) {
      await game.execute({
        type: "place-player",
        playerId: fixtureValue(game.ctx.team1.players[index]).id,
        x: position.x,
        y: position.y,
      });
    }

    const confirmed = await game.execute({
      type: "confirm-setup",
      teamId: "team1",
    });

    expect(confirmed.ok).toBe(false);
    expect(confirmed.reason).toBe(
      "command-failed: The Team Captain must be set up while they are able to play."
    );
  });

  it("puts the Captain into a preset formation", async () => {
    const game = await settingUp();
    await game.execute({
      type: "apply-formation",
      teamId: "team1",
      formation: preset(true),
    });

    expect(fixtureValue(game.ctx.team1.players[7]).gridPosition).toBeDefined();
    expect(
      (await game.execute({ type: "confirm-setup", teamId: "team1" })).ok
    ).toBe(true);
  });

  it("allows a set-up without a Captain who cannot play", async () => {
    const game = await settingUp();
    movePlayerToBox(fixtureValue(game.ctx.team1.players[7]), { box: "ko" });
    await game.execute({
      type: "apply-formation",
      teamId: "team1",
      formation: preset(true),
    });

    expect(
      (await game.execute({ type: "confirm-setup", teamId: "team1" })).ok
    ).toBe(true);
  });
});

describe("appointing a new Team Captain before a League Fixture", () => {
  function leagueHumans(stableId: string): Team {
    const team = stabilizeIds(
      TeamFactory.createTestTeam(RosterName.HUMAN, stableId, 0xcc0000),
      stableId
    );
    team.advancementMode = "sevens-skill-selection";
    stampFirstCompletedMatch(team);
    return team;
  }

  async function confirmBoth(game: HeadlessGame) {
    await game.execute({ type: "confirm-inducements", teamId: "team1" });
    return game.execute({ type: "confirm-inducements", teamId: "team2" });
  }

  it("asks a team without a Captain to appoint one", async () => {
    const game = new HeadlessGame({
      seed: 5,
      team1: leagueHumans("team1"),
      team2: leagueHumans("team2"),
      paysWinnings: true,
      startingPhase: GamePhase.SETUP,
    });

    const confirmed = await confirmBoth(game);
    expect(confirmed.pendingDecision).toMatchObject({
      type: "inducement-choice",
      kind: "team-captain",
      chooserTeamId: "team1",
      optional: true,
    });
    const appointed = game.ctx.team1.players[2];
    const next = await game.execute({
      type: "choose-inducement",
      playerId: fixtureValue(appointed).id,
    });

    expect(fixtureValue(appointed).teamCaptain).toBe(true);
    expect(hasSkill(fixtureValue(appointed).skills, SkillType.PRO)).toBe(true);
    expect(next.pendingDecision).toMatchObject({
      kind: "team-captain",
      chooserTeamId: "team2",
    });
    await game.execute({ type: "choose-inducement" });
    expect(game.ctx.team2.players.some((p) => p.teamCaptain)).toBe(false);
  });

  it("asks nothing in a friendly", async () => {
    const game = new HeadlessGame({
      seed: 5,
      team1: leagueHumans("team1"),
      team2: leagueHumans("team2"),
      startingPhase: GamePhase.SETUP,
    });

    expect((await confirmBoth(game)).pendingDecision).toBeNull();
  });
});
