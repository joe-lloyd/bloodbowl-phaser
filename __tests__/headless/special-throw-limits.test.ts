import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type {
  CommandResponse,
  HeadlessCommand,
} from "../../src/headless/protocol";

/**
 * Each special throw has its own once-per-Turn limit (2025 rulebook):
 * "Only a single Throw Team-mate Action can be declared each Turn" (p.55);
 * Kick Team-mate "does not count as a team's Throw Team-mate Action for the
 * Turn, and so a team can perform both" (p.131); Bombardier: "only one
 * player can declare this Special Action each Turn ... A player that
 * declared a Throw Bomb Special Action may not perform a Move Action before
 * throwing the bomb" (p.125). A Pass Action spends none of them.
 * Seeds are committed, never searched.
 */
function scenario(
  placements: Scenario["setup"]["team1Placements"],
  ball: { x: number; y: number }
): Scenario {
  return {
    id: "special-throw-limits",
    name: "Special throws in one Turn",
    description: "several throwers share one team Turn",
    setup: {
      team1Placements: placements,
      team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: ball,
    },
  };
}

/** A passer, two Throw Team-mate throwers, a mate and a Kick Team-mate kicker. */
const throwers = scenario(
  [
    { playerIndex: 0, x: 10, y: 9 },
    { playerIndex: 1, x: 12, y: 9 },
    { playerIndex: 2, x: 4, y: 5, skills: [SkillType.THROW_TEAM_MATE] },
    { playerIndex: 3, x: 5, y: 5, skills: [SkillType.RIGHT_STUFF] },
    { playerIndex: 4, x: 4, y: 2, skills: [SkillType.THROW_TEAM_MATE] },
    { playerIndex: 5, x: 4, y: 8, skills: [SkillType.KICK_TEAM_MATE] },
  ],
  { x: 10, y: 9 }
);

/** Two Bombardiers and a team-mate still to act. */
const bombers = scenario(
  [
    { playerIndex: 0, x: 1, y: 3, skills: [SkillType.BOMBARDIER] },
    { playerIndex: 1, x: 1, y: 7, skills: [SkillType.BOMBARDIER] },
    { playerIndex: 2, x: 1, y: 10 },
  ],
  { x: 15, y: 9 }
);

/** The pass is caught, the throw lands and the bomb explodes: no Turnover. */
const SEED = 5;

async function run(game: HeadlessGame, command: HeadlessCommand) {
  let response: CommandResponse = await game.execute(command);
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
  }
  return response;
}

const id = (n: number) => `team1-player-${n + 1}`;

function declare(game: HeadlessGame, n: number, action: string) {
  return game.execute({
    type: "declare-action",
    playerId: id(n),
    action: action as never,
  });
}

describe("once-per-Turn special throws", () => {
  it("allows a Throw Team-mate after a Pass", async () => {
    const game = new HeadlessGame({ scenario: throwers, seed: SEED });
    await declare(game, 0, "pass");
    const pass = await run(game, {
      type: "pass",
      playerId: id(0),
      x: 12,
      y: 9,
    });
    expect(pass.snapshot.activeTeamId).toBe("team1");

    expect((await declare(game, 2, "throwTeamMate")).ok).toBe(true);
  });

  it("allows one Throw Team-mate and one Kick Team-mate, but not a second throw", async () => {
    const game = new HeadlessGame({ scenario: throwers, seed: SEED });
    await declare(game, 2, "throwTeamMate");
    const thrown = await run(game, {
      type: "throw-teammate",
      throwerId: id(2),
      teammateId: id(3),
      x: 7,
      y: 5,
    });
    expect(thrown.snapshot.activeTeamId).toBe("team1");

    expect((await declare(game, 4, "throwTeamMate")).ok).toBe(false);
    expect((await declare(game, 5, "throwTeamMate")).ok).toBe(true);
  });

  it("refuses a Move after declaring Throw Bomb", async () => {
    const game = new HeadlessGame({ scenario: bombers, seed: SEED });
    expect((await declare(game, 0, "throwBomb")).ok).toBe(true);

    const move = await game.execute({
      type: "move",
      playerId: id(0),
      path: [{ x: 2, y: 3 }],
    });
    expect(move.ok).toBe(false);
    expect(move.reason).toBe(
      "command-failed: A bomber may not move before throwing the bomb"
    );
  });

  it("lets only one player throw a bomb each Turn", async () => {
    const game = new HeadlessGame({ scenario: bombers, seed: SEED });
    await declare(game, 0, "throwBomb");
    const bomb = await run(game, {
      type: "throw-bomb",
      throwerId: id(0),
      x: 8,
      y: 3,
    });
    expect(bomb.events.some((e) => e.name === "bombExploded")).toBe(true);
    expect(bomb.snapshot.activeTeamId).toBe("team1");

    expect((await declare(game, 1, "throwBomb")).ok).toBe(false);
  });
});
