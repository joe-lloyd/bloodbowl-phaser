import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import {
  Inducement,
  type InducementSelectionLine,
} from "../../src/types/Inducements";
import { type Player, PlayerStatus } from "../../src/types/Player";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { teamRerollsLeft } from "../../src/game/teamRerolls";
import { SkillType, getSkill, hasSkill } from "../../src/types/Skills";
import type { GameOperation } from "../../src/game/core/GameOperation";
import { ClearPitchOperation } from "../../src/game/operations/EndDriveOperations";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { RosterName } from "../../src/types/Team";
import { foulAddingAllAssists, forceDice } from "../utils/test-helpers";
import { bribesLeft } from "../../src/game/inducements/bribes";

const kickoff: Scenario = {
  id: "inducement-kickoff",
  name: "Inducement kick-off",
  description: "Team 1 on its Line of Scrimmage kicks to team 2.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 6,
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

const foulScene: Scenario = {
  id: "inducement-foul",
  name: "Inducement foul",
  description: "two team 1 players beside a Prone opponent",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 10, y: 6 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

async function induce(game: HeadlessGame, lines: InducementSelectionLine[]) {
  game.ctx.teams[1].rerolls += 30;
  for (const line of lines) {
    const response = await game.execute({
      type: "select-inducement",
      teamId: "team1",
      ...line,
    });
    expect(response.ok).toBe(true);
  }
  await game.execute({ type: "confirm-inducements", teamId: "team1" });
  await game.execute({ type: "confirm-inducements", teamId: "team2" });
  game.ctx.teams[1].rerolls -= 30;
}

async function runUntilDecision(game: HeadlessGame, op: GameOperation) {
  game.ctx.gameService.flowManager.add(op, true);
  for (let i = 0; i < 50 && !game.pendingDecision(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function kick(game: HeadlessGame, dice: number[]) {
  forceDice(game.ctx.rng, dice);
  return game.execute({
    type: "kick-ball",
    playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
    x: 15,
    y: 5,
  });
}

function logLines(
  response: Awaited<ReturnType<HeadlessGame["execute"]>>,
  label: string
) {
  return response.events
    .filter(
      (event) =>
        event.name === GameEventNames.UI_GameLog &&
        String(event.data).startsWith(label)
    )
    .map((event) => String(event.data));
}

describe("Part-time Assistant Coaches", () => {
  it("add to the Brilliant Coaching roll", async () => {
    const game = new HeadlessGame({ scenario: kickoff, seed: 1 });
    await induce(game, [
      { inducement: Inducement.PART_TIME_ASSISTANT_COACH, quantity: 2 },
    ]);

    const response = await kick(game, [5, 1, 1, 3, 4, 3, 4]);

    expect(logLines(response, "Brilliant Coaching")).toEqual([
      "Brilliant Coaching — Home Team: D6 3 + 2 = 5",
      "Brilliant Coaching — Away Team: D6 4 + 0 = 4",
    ]);
    expect(game.snapshot().driveEffects?.freeRerolls).toEqual({ team1: 1 });
  });
});

describe("Temp Agency Cheerleaders", () => {
  it("add to the Cheering Fans roll", async () => {
    const game = new HeadlessGame({ scenario: kickoff, seed: 1 });
    await induce(game, [
      { inducement: Inducement.TEMP_AGENCY_CHEERLEADER, quantity: 1 },
    ]);

    const response = await kick(game, [5, 1, 1, 2, 4, 4, 4]);

    expect(logLines(response, "Cheering Fans")).toEqual([
      "Cheering Fans — Home Team: D6 4 + 1 = 5",
      "Cheering Fans — Away Team: D6 4 + 0 = 4",
    ]);
    expect(
      Object.keys(game.snapshot().driveEffects?.owedAssists ?? {})
    ).toEqual(["team1"]);
  });
});

describe("Blitzer's Best Kegs", () => {
  it("add +1 each to the owner's KO recovery rolls", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [
      { inducement: Inducement.BLITZERS_BEST_KEGS, quantity: 2 },
    ]);
    const ours = game.ctx.teams[0].players[0];
    const theirs = game.ctx.teams[1].players[0];
    movePlayerToBox(fixtureValue(ours), { box: "ko" }, game.ctx.eventBus);
    movePlayerToBox(fixtureValue(theirs), { box: "ko" }, game.ctx.eventBus);

    forceDice(game.ctx.rng, [2, 2]);
    await game.ctx.gameService.rollKORecovery();

    expect(fixtureValue(ours).status).toBe(PlayerStatus.RESERVE);
    expect(fixtureValue(theirs).status).toBe(PlayerStatus.KO);
  });
});

async function spottedFoul(game: HeadlessGame, laterDice: number[] = []) {
  forceDice(game.ctx.rng, [1, 1, 1, ...laterDice]);
  const fouler = game.ctx.teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(fouler).id,
    action: "foul",
  });
  const response = await foulAddingAllAssists(game, {
    type: "foul",
    playerId: fixtureValue(fouler).id,
    x: 11,
    y: 5,
  });
  return { fouler, response };
}

describe("Bribes", () => {
  it("are offered to the fouling coach once Argue the Call fails", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 1 }]);

    const { fouler, response } = await spottedFoul(game);

    expect(response.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(fouler).id,
      chooserTeamId: "team1",
      skill: "Bribe",
    });
  });

  it("keep the player on the pitch with no Turnover on a 2+", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 2 }]);
    const { fouler } = await spottedFoul(game, [2]);

    const response = await game.execute({ type: "use-reaction", accept: true });

    expect(fixtureValue(fouler).gridPosition).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(fouler).status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activeTeamId).toBe("team1");

    expect(
      response.events
        .filter((e) => e.name === GameEventNames.RefereeCall)
        .map((e) => e.data)
    ).toMatchObject([
      {
        step: "bribed",
        roll: 2,
        works: true,
        playerId: fixtureValue(fouler).id,
      },
      { step: "outcome", result: "bribed", cause: "foul" },
    ]);
    expect(
      fixtureValue(game.ctx.gameService.getState().inducements?.inventory[0])
        .remainingUses
    ).toBe(1);
  });

  it("are lost on a natural 1 and the player is still Sent-off", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 1 }]);
    const { fouler } = await spottedFoul(game, [1]);

    const response = await game.execute({ type: "use-reaction", accept: true });

    expect(fixtureValue(fouler).gridPosition).toBeUndefined();
    expect(fixtureValue(fouler).status).toBe(PlayerStatus.REMOVED);
    expect(response.snapshot.activeTeamId).toBe("team2");
    expect(
      fixtureValue(game.ctx.gameService.getState().inducements?.inventory[0])
        .remainingUses
    ).toBe(0);
  });

  it("are kept when the coach declines", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 1 }]);
    const { fouler } = await spottedFoul(game);

    await game.execute({ type: "use-reaction", accept: false });

    expect(fixtureValue(fouler).status).toBe(PlayerStatus.REMOVED);
    expect(
      fixtureValue(game.ctx.gameService.getState().inducements?.inventory[0])
        .remainingUses
    ).toBe(1);
  });

  it("include the free Bribe from Get the Ref, spent first", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 1 }]);

    game.ctx.gameService.getState().bribes = { team1: 1 };
    const { fouler } = await spottedFoul(game, [6]);

    await game.execute({ type: "use-reaction", accept: true });

    const state = game.ctx.gameService.getState();
    expect(fixtureValue(fouler).gridPosition).toEqual({ x: 10, y: 5 });
    expect(state.bribes).toEqual({ team1: 0 });
    expect(fixtureValue(state.inducements?.inventory[0]).remainingUses).toBe(1);
  });

  it("save a Secret Weapon from its end-of-drive Send-off", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 1 }]);
    const weapon = game.ctx.teams[0].players[0];
    fixtureValue(weapon).skills.push(getSkill(SkillType.SECRET_WEAPON));

    forceDice(game.ctx.rng, [2]);
    await runUntilDecision(
      game,
      new ClearPitchOperation("touchdown", "team1", true)
    );
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(weapon).id,
      skill: "Bribe",
    });
    forceDice(game.ctx.rng, [4]);
    await game.execute({ type: "use-reaction", accept: true });

    expect(fixtureValue(weapon).status).toBe(PlayerStatus.RESERVE);
  });

  it("are not needed when a Secret Weapon wins the argument", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [{ inducement: Inducement.BRIBE, quantity: 1 }]);
    const weapon = game.ctx.teams[0].players[0];
    fixtureValue(weapon).skills.push(getSkill(SkillType.SECRET_WEAPON));

    forceDice(game.ctx.rng, [5]);
    await runUntilDecision(
      game,
      new ClearPitchOperation("touchdown", "team1", true)
    );

    expect(game.pendingDecision()).toBeNull();
    expect(fixtureValue(weapon).status).toBe(PlayerStatus.RESERVE);
    expect(bribesLeft(game.ctx.gameService.getState(), "team1")).toBe(1);
  });

  it("are not offered to a team without one", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });

    const { fouler, response } = await spottedFoul(game);

    expect(response.pendingDecision).toBeNull();
    expect(fixtureValue(fouler).status).toBe(PlayerStatus.REMOVED);
  });
});

function regenerates(player: Player) {
  if (!hasSkill(player.skills, SkillType.REGENERATION)) {
    player.skills.push(getSkill(SkillType.REGENERATION));
  }
}

function sceneFor(team1Roster: RosterName): Scenario {
  return { ...foulScene, setup: { ...foulScene.setup, team1Roster } };
}

async function injure(game: HeadlessGame, dice: number[]) {
  const player = game.ctx.teams[0].players[0];
  forceDice(game.ctx.rng, dice);
  await runUntilDecision(game, new InjuryOperation(fixtureValue(player).id));
  return player;
}

describe("Wandering Apothecary", () => {
  it("patches up a team with no Apothecary of its own, once", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [
      { inducement: Inducement.WANDERING_APOTHECARY, quantity: 1 },
    ]);

    const first = await injure(game, [4, 5]);
    expect(game.pendingDecision()?.type).toBe("apothecary");
    await game.execute({ type: "use-apothecary", accept: true });
    expect(fixtureValue(first).status).toBe(PlayerStatus.STUNNED);

    fixtureValue(game.ctx.teams[0].players[1]).status = PlayerStatus.ACTIVE;
    await runUntilDecision(
      game,
      new InjuryOperation(fixtureValue(game.ctx.teams[0].players[1]).id)
    );
    expect(game.pendingDecision()).toBeNull();
  });

  it("adds a second use to a team that has an Apothecary", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    game.ctx.teams[0].apothecary = true;
    await induce(game, [
      { inducement: Inducement.WANDERING_APOTHECARY, quantity: 1 },
    ]);

    await injure(game, [4, 5]);
    await game.execute({ type: "use-apothecary", accept: true });
    const second = game.ctx.teams[0].players[1];
    forceDice(game.ctx.rng, [4, 5]);
    await runUntilDecision(game, new InjuryOperation(fixtureValue(second).id));
    expect(game.pendingDecision()?.type).toBe("apothecary");
    await game.execute({ type: "use-apothecary", accept: true });

    expect(fixtureValue(second).status).toBe(PlayerStatus.STUNNED);
    expect(
      fixtureValue(game.ctx.gameService.getState().inducements?.inventory[0])
        .remainingUses
    ).toBe(0);
  });
});

describe("Mortuary Assistant", () => {
  it("re-rolls a failed Regeneration roll once per game", async () => {
    const game = new HeadlessGame({
      scenario: sceneFor(RosterName.SHAMBLING_UNDEAD),
      seed: 1,
    });
    await induce(game, [
      { inducement: Inducement.MORTUARY_ASSISTANT, quantity: 1 },
    ]);
    regenerates(fixtureValue(game.ctx.teams[0].players[0]));
    regenerates(fixtureValue(game.ctx.teams[0].players[1]));

    const first = await injure(game, [5, 5, 2, 5]);
    expect(fixtureValue(first).status).toBe(PlayerStatus.RESERVE);

    const second = game.ctx.teams[0].players[1];
    forceDice(game.ctx.rng, [5, 5, 2, 5]);
    await runUntilDecision(game, new InjuryOperation(fixtureValue(second).id));
    expect(fixtureValue(second).status).toBe(PlayerStatus.INJURED);
  });
});

describe("Plague Doctor", () => {
  it("re-rolls a failed Regeneration roll", async () => {
    const game = new HeadlessGame({
      scenario: sceneFor(RosterName.NURGLE),
      seed: 1,
    });
    await induce(game, [{ inducement: Inducement.PLAGUE_DOCTOR, quantity: 1 }]);
    regenerates(fixtureValue(game.ctx.teams[0].players[0]));

    const player = await injure(game, [5, 5, 3, 4]);

    expect(fixtureValue(player).status).toBe(PlayerStatus.RESERVE);
  });

  it("works as an Apothecary instead", async () => {
    const game = new HeadlessGame({
      scenario: sceneFor(RosterName.NURGLE),
      seed: 1,
    });
    await induce(game, [{ inducement: Inducement.PLAGUE_DOCTOR, quantity: 1 }]);

    const player = await injure(game, [4, 5]);
    expect(game.pendingDecision()?.type).toBe("apothecary");
    await game.execute({ type: "use-apothecary", accept: true });

    expect(fixtureValue(player).status).toBe(PlayerStatus.STUNNED);
  });
});

describe("Halfling Master Chef", () => {
  it("moves a team re-roll from the opposition for each 4+ on 3D6, each half", async () => {
    const game = new HeadlessGame({ scenario: kickoff, seed: 1 });
    game.ctx.teams[0].rerolls = 2;
    await induce(game, [
      { inducement: Inducement.HALFLING_MASTER_CHEF, quantity: 1 },
    ]);
    game.ctx.teams[1].rerolls = 3;
    const state = game.ctx.gameService.getState();

    const response = await kick(game, [5, 1, 1, 1, 2, 4, 6, 1]);

    expect(
      response.events
        .filter((event) => event.name === GameEventNames.DiceRoll)
        .map(
          (event) =>
            z.object({ rollType: z.string() }).parse(event.data).rollType
        )
        .filter((rollType) => rollType.startsWith("Halfling Master Chef"))
    ).toEqual(["Halfling Master Chef (Home Team)"]);
    expect(teamRerollsLeft(state, game.ctx.teams[0])).toBe(4);
    expect(teamRerollsLeft(state, game.ctx.teams[1])).toBe(1);

    forceDice(game.ctx.rng, [1, 1, 1]);
    game.ctx.gameService.endHalf();
    for (let i = 0; i < 50 && state.phase !== GamePhase.SETUP; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(state.phase).toBe(GamePhase.SETUP);
    expect(teamRerollsLeft(state, game.ctx.teams[0])).toBe(2);
    expect(teamRerollsLeft(state, game.ctx.teams[1])).toBe(3);
    expect(state.inducements?.masterChef).toEqual({
      half: "h2",
      rerolls: { team1: 0, team2: 0 },
    });
  });
});

describe("Extra Team Training", () => {
  it("adds a team re-roll for each half", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    game.ctx.teams[0].rerolls = 2;
    await induce(game, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 3 },
    ]);

    const state = game.ctx.gameService.getState();
    expect(teamRerollsLeft(state, game.ctx.teams[0])).toBe(5);
  });

  it("never takes a half above the tracker's 6 team re-rolls", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    game.ctx.teams[0].rerolls = 3;
    await induce(game, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 6 },
    ]);

    const state = game.ctx.gameService.getState();
    expect(teamRerollsLeft(state, game.ctx.teams[0])).toBe(6);
  });
});
