import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { forceDice } from "../utils/test-helpers";

/**
 * Sevens kick-off rules from Spike! Journal 22 (docs/SEVENS_RULES.md):
 * M3 deviation, K3 Time-Out, K4 Alert Defence and K5 High Kick.
 *
 * Team 1 kicks with its line on column 6; team 2 receives behind column 13.
 * Columns 7 to 12 are No Man's Land.
 */
const scenario: Scenario = {
  id: "sevens-kickoff-rules",
  name: "Sevens kick-off rules",
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

// Dice come off in this order on a kick: D8 direction, deviation distance,
// the 2D6 Kick-off Event, then whatever the event rolls.
async function kick(
  dice: number[],
  target: { x: number; y: number },
  turn = 2
) {
  const game = new HeadlessGame({ scenario, seed: 1 });
  game.ctx.gameService.seedTurnCounts(turn);
  forceDice(game.ctx.rng, dice);
  const response = await game.execute({
    type: "kick-ball",
    playerId: game.ctx.team1.players[0].id,
    ...target,
  });
  const rolls = response.events
    .filter((event) => event.name === GameEventNames.DiceRoll)
    .map(
      (event) =>
        event.data as { rollType: string; value: unknown; total: number }
    );
  const landing = (
    response.events.find(
      (event) => event.name === GameEventNames.KickoffBallLanding
    )?.data as { landingSquare: { x: number; y: number } | null } | undefined
  )?.landingSquare;
  return { game, response, rolls, landing };
}

describe("M3: kick-off deviation", () => {
  it("deviates the lower of 2D6 and logs both dice", async () => {
    // Direction 5 is east; 2D6 of 5 and 2 deviates 2 squares. Event 7.
    const { rolls, landing } = await kick([5, 5, 2, 3, 4], { x: 15, y: 5 });

    expect(
      rolls.find((roll) => roll.rollType === "Kickoff Deviate Distance")
    ).toMatchObject({ value: [5, 2], total: 2 });
    expect(landing).toEqual({ x: 17, y: 5 });
  });
});
describe("K3: Time-Out", () => {
  it.each([
    [4, 5],
    [5, 4],
    [6, 5],
  ])(
    "moves the kicking team's marker from turn %i to %i",
    async (turn, after) => {
      // Event 1 + 2 = 3 is Time-Out.
      const { game } = await kick([5, 1, 1, 1, 2], { x: 15, y: 5 }, turn);

      expect(game.ctx.gameService.getTurnNumber("team1")).toBe(after);
    }
  );
});

describe("K4: Alert Defence", () => {
  async function alertDefence() {
    // Event 1 + 3 = 4; a D3 of 3 (die 6) lets the coach pick 4 players.
    return kick([5, 1, 1, 1, 3, 6], { x: 15, y: 5 });
  }

  it("gives the kicking coach D3+1 Open players", async () => {
    const { response } = await alertDefence();

    expect(response.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.ALERT_DEFENCE,
      chooserTeamId: "team1",
      selectionLimit: 4,
    });
  });

  it("moves a selected player one square into No Man's Land", async () => {
    const { game } = await alertDefence();
    const player = game.ctx.team1.players[0];
    expect(player.gridPosition).toEqual({ x: 6, y: 2 });

    const selected = await game.execute({
      type: "kickoff-select-player",
      playerId: player.id,
    });
    expect(selected.ok).toBe(true);
    const twoSquares = await game.execute({
      type: "kickoff-move-player",
      playerId: player.id,
      x: 8,
      y: 2,
    });
    expect(twoSquares.ok).toBe(false);
    const moved = await game.execute({
      type: "kickoff-move-player",
      playerId: player.id,
      x: 7,
      y: 1,
    });
    expect(moved.ok).toBe(true);
    expect(player.gridPosition).toEqual({ x: 7, y: 1 });

    const again = await game.execute({
      type: "kickoff-move-player",
      playerId: player.id,
      x: 8,
      y: 1,
    });
    expect(again.ok).toBe(false);

    const confirmed = await game.execute({ type: "kickoff-confirm" });
    expect(confirmed.pendingDecision?.type).not.toBe("kickoff-event");
    expect(player.gridPosition).toEqual({ x: 7, y: 1 });
  });

  it("refuses receiving players and the old re-set-up drop", async () => {
    const { game } = await alertDefence();
    const receiver = game.ctx.team2.players[0];
    const kicker = game.ctx.team1.players[1];

    const select = await game.execute({
      type: "kickoff-select-player",
      playerId: receiver.id,
    });
    expect(select.ok).toBe(false);
    const redeploy = await game.execute({
      type: "kickoff-place-player",
      playerId: kicker.id,
      x: 2,
      y: 3,
    });
    expect(redeploy.ok).toBe(false);
    expect(kicker.gridPosition).toEqual({ x: 6, y: 3 });
  });
});
describe("K5: High Kick", () => {
  it("offers the step when the ball will land in the receiving half", async () => {
    // Lands on (17,5); event 2 + 3 = 5.
    const { response, landing } = await kick([5, 2, 2, 2, 3], { x: 15, y: 5 });

    expect(response.pendingDecision).toMatchObject({
      type: "kickoff-event",
      event: KickoffEvent.HIGH_KICK,
      chooserTeamId: "team2",
      landingSquare: { x: 17, y: 5 },
    });
    expect(landing).toBeUndefined();
  });

  it("offers nothing when the ball will land in No Man's Land", async () => {
    // Direction 4 is west: (13,5) deviates 1 square to (12,5).
    const { response, landing } = await kick([4, 1, 1, 2, 3], { x: 13, y: 5 });

    expect(response.pendingDecision?.type).not.toBe("kickoff-event");
    expect(landing).toEqual({ x: 12, y: 5 });
  });
});
