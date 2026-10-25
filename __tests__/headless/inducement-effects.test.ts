import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { Inducement, InducementSelectionLine } from "../../src/types/Inducements";
import { PlayerStatus } from "../../src/types/Player";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { teamRerollsLeft } from "../../src/game/teamRerolls";
import { forceDice } from "../utils/test-helpers";

/**
 * What each Sevens inducement does once bought (docs/SEVENS_RULES.md L3,
 * 2025 rulebook pages 147 to 149). Purchases go through the pregame
 * protocol commands; dice are forced.
 */

/** Team 1 kicks to team 2 from its Line of Scrimmage. */
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

/** Team 1 has two players beside a Prone opponent, ready to Foul. */
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

/** Buy `lines` for team 1 with petty cash, then confirm both teams. */
async function induce(game: HeadlessGame, lines: InducementSelectionLine[]) {
  game.ctx.team2.rerolls += 30; // team 1 gets 3,000,000 petty cash
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
  game.ctx.team2.rerolls -= 30;
}

async function kick(game: HeadlessGame, dice: number[]) {
  forceDice(game.ctx.rng, dice);
  return game.execute({
    type: "kick-ball",
    playerId: game.ctx.team1.players[0].id,
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

    // Direction, 2D6 deviation, event 3 + 4 = Brilliant Coaching, then
    // team 1 rolls a 3 and team 2 a 4.
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

    // Event 2 + 4 = Cheering Fans; both coaches roll a 4.
    const response = await kick(game, [5, 1, 1, 2, 4, 4, 4]);

    expect(logLines(response, "Cheering Fans")).toEqual([
      "Cheering Fans — Home Team: D6 4 + 1 = 5",
      "Cheering Fans — Away Team: D6 4 + 0 = 4",
    ]);
    expect(Object.keys(game.snapshot().driveEffects?.owedAssists ?? {})).toEqual(
      ["team1"]
    );
  });
});

describe("Blitzer's Best Kegs", () => {
  it("add +1 each to the owner's KO recovery rolls", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    await induce(game, [
      { inducement: Inducement.BLITZERS_BEST_KEGS, quantity: 2 },
    ]);
    const ours = game.ctx.team1.players[0];
    const theirs = game.ctx.team2.players[0];
    movePlayerToBox(ours, { box: "ko" }, game.ctx.eventBus);
    movePlayerToBox(theirs, { box: "ko" }, game.ctx.eventBus);

    forceDice(game.ctx.rng, [2, 2]);
    await game.ctx.gameService.rollKORecovery();

    expect(ours.status).toBe(PlayerStatus.RESERVE);
    expect(theirs.status).toBe(PlayerStatus.KO);
  });
});

describe("Extra Team Training", () => {
  it("adds a team re-roll for each half", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    game.ctx.team1.rerolls = 2;
    await induce(game, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 3 },
    ]);

    const state = game.ctx.gameService.getState();
    expect(teamRerollsLeft(state, game.ctx.team1)).toBe(5);
  });

  it("never takes a half above the tracker's 6 team re-rolls", async () => {
    const game = new HeadlessGame({ scenario: foulScene, seed: 1 });
    game.ctx.team1.rerolls = 3;
    await induce(game, [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 6 },
    ]);

    const state = game.ctx.gameService.getState();
    expect(teamRerollsLeft(state, game.ctx.team1)).toBe(6);
  });
});
