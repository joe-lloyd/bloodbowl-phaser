import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * A thrown player never shares a square. One who crashes into another
 * player bounces on until it reaches an empty square, and a fumbled one
 * bounces from the thrower's square. A ball held by a player knocked down in
 * the crash bounces. Seeds are committed, never searched.
 */
/** "Throw Team-mate: 5, needs 5+": a Superb Throw, onto the aim with Bullseye. */
const SUPERB_SEED = 2;
/** "Throw Team-mate: 1, needs 5+": a fumble. */
const FUMBLE_SEED = 7;

function scenario(throwerSkills: SkillType[]): Scenario {
  return {
    id: "ttm-crash",
    name: "Throw Team-mate crash",
    description: "a team-mate thrown onto the opposing ball carrier",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [SkillType.THROW_TEAM_MATE, ...throwerSkills],
        },
        { playerIndex: 1, x: 11, y: 5, skills: [SkillType.RIGHT_STUFF] },
        { playerIndex: 2, x: 2, y: 1 },
      ],
      team2Placements: [{ playerIndex: 0, x: 14, y: 5 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 14, y: 5 },
    },
  };
}

async function throwAtCarrier(seed: number, throwerSkills: SkillType[]) {
  const game = new HeadlessGame({ scenario: scenario(throwerSkills), seed });
  const [thrower, mate] = game.ctx.team1.players;
  await game.execute({
    type: "declare-action",
    playerId: thrower.id,
    action: "throwTeamMate",
  });
  let response: CommandResponse = await game.execute({
    type: "throw-teammate",
    throwerId: thrower.id,
    teammateId: mate.id,
    x: 14,
    y: 5,
  });
  while (response.pendingDecision?.type === "reroll")
    response = await game.execute({ type: "use-reroll", accept: false });
  const everyone = response.snapshot.teams.flatMap((t) => t.players);
  const squares = everyone
    .filter((p) => p.position)
    .map((p) => `${p.position!.x},${p.position!.y}`);
  return { response, everyone, squares };
}

describe("Throw Team-mate crash and fumble", () => {
  it("bounces a crashing player off the carrier and knocks the ball loose", async () => {
    const { response, everyone, squares } = await throwAtCarrier(SUPERB_SEED, [
      SkillType.BULLSEYE,
    ]);
    const mate = everyone.find((p) => p.id === "team1-player-2")!;
    const carrier = everyone.find((p) => p.id === "team2-player-1")!;

    expect(response.ok).toBe(true);
    expect(new Set(squares).size).toBe(squares.length);
    expect(carrier.status).not.toBe("Active");
    expect(mate.status).not.toBe("Active");
    expect(
      Math.max(Math.abs(mate.position!.x - 14), Math.abs(mate.position!.y - 5))
    ).toBeGreaterThan(0);
    expect(response.snapshot.ballPosition).not.toEqual({ x: 14, y: 5 });
  });

  it("bounces a fumbled player off the thrower's square to land", async () => {
    const { response, everyone, squares } = await throwAtCarrier(
      FUMBLE_SEED,
      []
    );
    const mate = everyone.find((p) => p.id === "team1-player-2")!;
    const dice = response.events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);

    expect(response.ok).toBe(true);
    expect(dice).toEqual([
      "Throw Team-mate (Human Lineman #1): 1, needs 5+",
      "Bounce: 1",
      "Landing (Human Lineman #2): 6, needs 4+",
    ]);
    expect(mate.position).toEqual({ x: 9, y: 4 });
    expect(new Set(squares).size).toBe(squares.length);
  });
});
